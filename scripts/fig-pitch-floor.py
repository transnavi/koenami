# Schematic figure for web/tutorial.html: two synthetic pitch contours whose median differs while the 5th percentile stays. Run: uv run --with numpy --with matplotlib python3 scripts/fig-pitch-floor.py <font.ttc> web/img/pitch-floor.png
import numpy as np, matplotlib, sys
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager
font = sys.argv[1]
font_manager.fontManager.addfont(font); fp = font_manager.FontProperties(fname=font); plt.rcParams['font.family'] = fp.get_name()
rng = np.random.default_rng(3)
t = np.linspace(0, 3.2, 640)
def contour(base, floor, top):
    # schematic sentence: accent peaks, declination, a final fall to the floor
    c = np.full_like(t, base, dtype=float)
    for centre, w, h in [(0.35, 0.18, 1.0), (0.9, 0.2, 0.75), (1.5, 0.22, 0.85), (2.1, 0.18, 0.55), (2.65, 0.16, 0.45)]:
        c += h * (top - base) * np.exp(-((t - centre) / w) ** 2)
    c -= (t / 3.2) * 0.25 * (base - floor)            # declination
    k = np.clip((t - 2.55) / 0.35, 0, 1)                               # final fall to the floor by 2.9 s
    c = c * (1 - k) + floor * k
    c += rng.normal(0, 1.2, t.size)
    return c
before = contour(140, 105, 190)
after = contour(165, 105, 235)
fig, axes = plt.subplots(1, 2, figsize=(8, 3.3), dpi=150, sharey=True)
for ax, y, title, col in [(axes[0], before, '訓練前', '#6b7280'), (axes[1], after, '訓練後', '#1a78c2')]:
    ax.plot(t, y, color=col, lw=1.4)
    med, p5 = np.median(y), np.percentile(y, 5)
    ax.axhline(med, color='#d56498', lw=1, ls='--'); ax.axhline(p5, color='#c2410c', lw=1, ls=':')
    ax.text(3.15, med + 3, f'中央値 {med:.0f}Hz', color='#d56498', fontsize=8.5, ha='right', va='bottom')
    ax.text(3.15, p5 - 4, f'下限（5パーセンタイル） {p5:.0f}Hz', color='#c2410c', fontsize=8.5, ha='right', va='top')
    ax.set_title(title, fontsize=10); ax.set_xlabel('時間（秒）'); ax.set_ylim(80, 260); ax.set_xlim(0, 3.2)
    ax.grid(alpha=0.25)
axes[0].set_ylabel('声の高さ（Hz）')
fig.suptitle('中央値が上がっても、文末の谷が元の高さに残る例（模式図）', fontsize=10, y=1.0)
fig.tight_layout(); fig.savefig(sys.argv[2], dpi=150, bbox_inches='tight'); print('ok')
