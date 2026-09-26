"""A small student for the layer-3 timbre frames: fixed log-mel front end, Conformer blocks,
a projection to the teacher's 768 dimensions, one frame per 20 ms like the teacher."""
import math
import torch
from torch import nn
import torch.nn.functional as F

RATE, WIN, HOP, MELS = 16000, 400, 160, 80


def mel_filters(n_fft=WIN, mels=MELS, rate=RATE, low=20.0, high=7600.0):
    bins = n_fft // 2 + 1
    hz = lambda m: 700 * (10 ** (m / 2595) - 1)
    mel = lambda f: 2595 * math.log10(1 + f / 700)
    points = torch.tensor([hz(m) for m in torch.linspace(mel(low), mel(high), mels + 2).tolist()])
    freqs = torch.linspace(0, rate / 2, bins)
    fb = torch.zeros(mels, bins)
    for i in range(mels):
        l, c, r = points[i], points[i + 1], points[i + 2]
        fb[i] = torch.clamp(torch.minimum((freqs - l) / (c - l), (r - freqs) / (r - c)), min=0)
    return fb


class LayerNorm(nn.LayerNorm):
    """nn.LayerNorm computed from centred values. Exported as plain operators instead of the fused
    LayerNormalization, which in onnxruntime 1.24 returns NaN on a frame whose values are all equal
    (digital silence floors every mel band at the same value). Same parameters, same result."""
    def forward(self, x):
        c = x - x.mean(-1, keepdim=True)
        return c * torch.rsqrt((c * c).mean(-1, keepdim=True) + self.eps) * self.weight + self.bias


class LogMel(nn.Module):
    """Log-mel energies as two fixed convolutions (a windowed DFT, then the mel filters), so the
    exported graph needs no STFT operator."""
    def __init__(self):
        super().__init__()
        n = torch.arange(WIN, dtype=torch.float32); k = torch.arange(WIN // 2 + 1, dtype=torch.float32)
        window = torch.hann_window(WIN, periodic=True)
        angle = 2 * math.pi * k[:, None] * n[None, :] / WIN
        self.register_buffer('real', (torch.cos(angle) * window)[:, None, :], persistent=False)
        self.register_buffer('imag', (-torch.sin(angle) * window)[:, None, :], persistent=False)
        self.register_buffer('fb', mel_filters()[:, :, None], persistent=False)

    def forward(self, wave):  # [B, N] -> [B, MELS, frames]
        # Always fp32: under mixed-precision training a bfloat16 DFT shifts the log-mel energies of a
        # steady tone by over 10 dB on average, which the exported fp32 model never sees.
        with torch.autocast(device_type=wave.device.type, enabled=False):
            x = wave.float()[:, None, :]
            power = F.conv1d(x, self.real, stride=HOP) ** 2 + F.conv1d(x, self.imag, stride=HOP) ** 2
            return torch.log(F.conv1d(power, self.fb) + 1e-6)


class SelfAttention(nn.Module):
    """Multi-head self-attention whose reshapes keep the length symbolic, so the exported graph
    takes any number of frames."""
    def __init__(self, d, heads, dropout):
        super().__init__()
        self.heads, self.dropout = heads, dropout
        self.qkv = nn.Linear(d, 3 * d); self.proj = nn.Linear(d, d)

    def forward(self, x, pad=None):
        b, t, d = x.shape
        q, k, v = self.qkv(x).reshape(b, -1, 3, self.heads, d // self.heads).permute(2, 0, 3, 1, 4)
        mask = None if pad is None else ~pad[:, None, None, :]
        y = F.scaled_dot_product_attention(q, k, v, attn_mask=mask, dropout_p=self.dropout if self.training else 0.0)
        return self.proj(y.transpose(1, 2).reshape(b, -1, d))


class TimeNorm(nn.GroupNorm):
    """GroupNorm(1, d) over [B, d, T] whose statistics skip padded frames, so a clip padded inside a
    batch is normalised as it would be alone. Same parameters as nn.GroupNorm(1, d)."""
    def forward(self, x, pad=None):
        keep = torch.ones_like(x[:, :1]) if pad is None else (~pad)[:, None, :].to(x.dtype)
        count = keep.sum((1, 2), keepdim=True) * x.shape[1]
        mean = (x * keep).sum((1, 2), keepdim=True) / count
        var = (((x - mean) * keep) ** 2).sum((1, 2), keepdim=True) / count
        return (x - mean) * torch.rsqrt(var + self.eps) * self.weight[:, None] + self.bias[:, None]


class ConformerBlock(nn.Module):
    def __init__(self, d, heads, ff, kernel, dropout):
        super().__init__()
        self.ff1 = nn.Sequential(LayerNorm(d), nn.Linear(d, ff), nn.SiLU(), nn.Dropout(dropout), nn.Linear(ff, d), nn.Dropout(dropout))
        self.ln_att = LayerNorm(d); self.att = SelfAttention(d, heads, dropout); self.drop = nn.Dropout(dropout)
        self.ln_conv = LayerNorm(d)
        self.pw1 = nn.Conv1d(d, 2 * d, 1); self.dw = nn.Conv1d(d, d, kernel, padding=kernel // 2, groups=d)
        self.norm = TimeNorm(1, d); self.pw2 = nn.Conv1d(d, d, 1)
        self.ff2 = nn.Sequential(LayerNorm(d), nn.Linear(d, ff), nn.SiLU(), nn.Dropout(dropout), nn.Linear(ff, d), nn.Dropout(dropout))
        self.ln_out = LayerNorm(d)

    def forward(self, x, pad=None):  # x [B, T, d]; pad [B, T] True where padded
        x = x + 0.5 * self.ff1(x)
        x = x + self.drop(self.att(self.ln_att(x), pad))
        h = self.ln_conv(x)
        if pad is not None: h = h.masked_fill(pad[..., None], 0)
        h = F.glu(self.pw1(h.transpose(1, 2)), dim=1)
        # pw1's bias makes padded frames nonzero again; the depthwise conv would carry them into the
        # valid frames at the clip's end.
        if pad is not None: h = h.masked_fill(pad[:, None, :], 0)
        h = self.pw2(F.silu(self.norm(self.dw(h), pad)))
        x = x + self.drop(h.transpose(1, 2))
        x = x + 0.5 * self.ff2(x)
        return self.ln_out(x)


class Student(nn.Module):
    def __init__(self, d=192, heads=4, ff=768, blocks=4, kernel=15, dropout=0.1, out=768):
        super().__init__()
        self.mel = LogMel()
        self.mel_norm = LayerNorm(MELS)
        self.sub = nn.Conv1d(MELS, d, 3, stride=2)  # 10 ms mel frames -> the teacher's 20 ms grid
        self.blocks = nn.ModuleList(ConformerBlock(d, heads, ff, kernel, dropout) for _ in range(blocks))
        self.out = nn.Linear(d, out)

    def forward(self, wave, frames=None, pad=None, lengths=None):
        """wave [B, N] -> [B, T, 768] with T = (N - 400) // 320 + 1, the teacher's frame count. In a
        padded batch, `lengths` holds each clip's sample count and `pad` marks its padded frames."""
        n = wave.shape[1]; t = (n - WIN) // 320 + 1
        # A constant offset from the microphone path would shift every mel band; WavLM ignores it.
        # The mean is taken over each clip's own samples, and its padding stays zero.
        if lengths is None:
            wave = wave - wave.mean(dim=1, keepdim=True)
        else:
            inside = (torch.arange(n, device=wave.device)[None, :] < lengths[:, None]).to(wave.dtype)
            wave = (wave - (wave * inside).sum(1, keepdim=True) / lengths[:, None].to(wave.dtype)) * inside
        wave = F.pad(wave, (0, 320))  # one extra mel pair so the strided conv reaches frame t
        m = self.mel_norm(self.mel(wave).transpose(1, 2)).transpose(1, 2)
        x = F.gelu(self.sub(m)).transpose(1, 2)[:, :t]
        for b in self.blocks: x = b(x, pad)
        return self.out(x)


if __name__ == '__main__':
    s = Student()
    print(sum(p.numel() for p in s.parameters()) / 1e6, 'M parameters')
    for n in (32000, 80000, 128000):
        print(n, tuple(s(torch.zeros(1, n)).shape), (n - 400) // 320 + 1)
