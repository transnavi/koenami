# Audio fixtures

All speech files derive from Mozilla Common Voice (CC0-1.0) clips that the public
demo already ships under `tests/fixtures/data/samples`:

| file | source clip | conversion |
| --- | --- | --- |
| `microphone.wav` | `common_voice_ja_22751172.mp3` | mono, 48 kHz, 16-bit PCM — fed to Chromium's fake microphone |
| `own-a.wav` | `common_voice_ja_22760153.mp3` | mono, 16 kHz, 16-bit PCM — uploaded as the user's voice |
| `own-b.wav` | `common_voice_ja_19580185.mp3` | mono, 22.05 kHz, 16-bit PCM — second take |
| `too-short.wav` | generated 220 Hz sine, 0.1 s | below the 0.25 s minimum |
| `not-audio.wav` | plain text | decode failure |
