# /// script
# requires-python = ">=3.12"
# dependencies = ["fonttools>=4.55", "brotli"]
# ///
"""Subset Noto Sans JP to the characters the share card can draw.

Run with `uv run build_share_font.py [path/to/NotoSansJP-VF.ttf]`. The variable font is
instanced at 400 and 700 and cut down to the glyphs used by web/card.js and web/score.js,
so the Worker and the browser both embed a few tens of kilobytes instead of 9 MB.
"""
import re
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).parent
OUT = ROOT / 'web' / 'public' / 'fonts'
SOURCES = [Path(p) for p in sys.argv[1:]] or [
    Path('/mnt/c/Windows/Fonts/NotoSansJP-VF.ttf'),
    Path.home() / '.fonts' / 'NotoSansJP-VF.ttf',
]
ASCII = ''.join(chr(c) for c in range(0x20, 0x7F))
EXTRA = '−ΔΔ／・「」（）〜…'


def charset():
    text = ''.join((ROOT / 'web' / name).read_text() for name in ('card.js', 'score.js'))
    return set(ASCII + EXTRA + ''.join(re.findall(r'[^\x00-\x7F]', text)))


def main():
    source = next((p for p in SOURCES if p.exists()), None)
    if not source:
        sys.exit('Noto Sans JP variable font not found; pass its path.')
    chars = charset()
    OUT.mkdir(parents=True, exist_ok=True)
    for weight in (400, 700):
        font = instancer.instantiateVariableFont(TTFont(source), {'wght': weight}, inplace=False)
        options = subset.Options(layout_features=['kern', 'palt'], hinting=False, desubroutinize=True,
                                 name_IDs=[0, 1, 2, 4, 6, 13, 14], notdef_outline=True)
        subsetter = subset.Subsetter(options)
        subsetter.populate(text=''.join(sorted(chars)))
        subsetter.subset(font)
        target = OUT / f'koenami-share-{weight}.ttf'
        font.save(target)
        print(target.relative_to(ROOT), target.stat().st_size, 'bytes', len(chars), 'characters')
    (OUT / 'OFL.txt').write_text(TTFont(source)['name'].getDebugName(13) + '\n\n' + TTFont(source)['name'].getDebugName(14) + '\n')


if __name__ == '__main__':
    main()
