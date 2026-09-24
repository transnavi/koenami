# /// script
# requires-python = ">=3.12"
# dependencies = ["fonttools>=4.55", "brotli"]
# ///
"""Subset Noto Sans to the characters the share card can draw, one cut per script.

Run with `uv run build_share_font.py [--fonts DIR]`. The JP, SC and KR variable fonts are
instanced at 400 and 700 and cut down to the glyphs the card needs in the languages that
use that cut (src/lib/i18n: Japanese and English share the JP cut), so the Worker and the
browser both embed a few tens of kilobytes per language instead of 10 MB.
"""
import argparse
import json
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).parent
OUT = ROOT / 'static' / 'fonts'
FONT_DIRS = [Path('/mnt/c/Windows/Fonts'), Path.home() / '.fonts']
# Cut → (variable font file, languages written in it).
CUTS = {'ja': ('NotoSansJP-VF.ttf', ['ja', 'en']), 'zh-CN': ('NotoSansSC-VF.ttf', ['zh-CN']), 'ko': ('NotoSansKR-VF.ttf', ['ko'])}
ASCII = ''.join(chr(c) for c in range(0x20, 0x7F))
EXTRA = '−Δ／・「」（）〜…'
# The messages whose text reaches the card (src/lib/card.ts and src/lib/score.ts).
CARD_MESSAGES = ['card_eyebrow', 'card_male', 'card_center', 'card_female', 'card_male_refs', 'card_female_refs',
                 'verdict_female', 'verdict_androgynous', 'verdict_male', 'leaning_female', 'leaning_androgynous', 'leaning_male',
                 'share_age_label', 'share_age_years',
                 *[f'metric_{k}_{f}' for k in ('f0', 'delta_f', 'hnr', 'balance', 'pitch_span') for f in ('label', 'unit')]]


def card_text():
    """Every card string per language, read from messages/<locale>.json: a text as written, a message
    with variants as all of them."""
    texts = {}
    for path in sorted((ROOT / 'messages').glob('*.json')):
        messages = json.loads(path.read_text())
        parts = []
        for id in CARD_MESSAGES:
            if id not in messages:
                sys.exit(f'no message {id} in {path.name}')
            value = messages[id]
            parts.append(value if isinstance(value, str) else ''.join(t for v in value for t in v['match'].values()))
        texts[path.stem] = ''.join(parts)
    return texts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fonts', type=Path, help='directory holding NotoSansJP-VF.ttf, NotoSansSC-VF.ttf and NotoSansKR-VF.ttf')
    args = parser.parse_args()
    dirs = [args.fonts] if args.fonts else FONT_DIRS
    texts = card_text()
    OUT.mkdir(parents=True, exist_ok=True)
    licences = []
    for cut, (filename, languages) in CUTS.items():
        source = next((d / filename for d in dirs if (d / filename).exists()), None)
        if not source:
            sys.exit(f'{filename} not found under {", ".join(map(str, dirs))}; pass --fonts DIR.')
        chars = set(ASCII + EXTRA + ''.join(texts[l] for l in languages))
        for weight in (400, 700):
            font = instancer.instantiateVariableFont(TTFont(source), {'wght': weight}, inplace=False)
            options = subset.Options(layout_features=['kern', 'palt'], hinting=False, desubroutinize=True,
                                     name_IDs=[0, 1, 2, 4, 6, 13, 14], notdef_outline=True)
            subsetter = subset.Subsetter(options)
            subsetter.populate(text=''.join(sorted(chars)))
            subsetter.subset(font)
            target = OUT / f'koenami-share-{cut}-{weight}.ttf'
            font.save(target)
            print(target.relative_to(ROOT), target.stat().st_size, 'bytes', len(chars), 'characters')
        names = TTFont(source)['name']
        licences.append(f'{names.getDebugName(1)} (koenami-share-{cut}-*.ttf)\n\n' + names.getDebugName(13) + '\n\n' + names.getDebugName(14) + '\n')
    (OUT / 'OFL.txt').write_text('\n\n'.join(licences))


if __name__ == '__main__':
    main()
