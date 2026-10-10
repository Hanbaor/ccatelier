#!/usr/bin/env python3
"""Build/check lossless local WOFF2 containers, without subsetting or web dependencies.

Reproduce using Python with fontTools and Brotli installed (original build:
/usr/bin/python3, fontTools 4.57.0, Brotli 1.1.0):
  /usr/bin/python3 tools/local-font-woff2.py --write
  /usr/bin/python3 tools/local-font-woff2.py
  node --test tests/local-font-delivery.test.cjs

No downloads, runtime dependencies, or changes to the TTF/OFL originals. WOFF2
transforms are deliberately disabled to preserve every original sfnt table byte,
except head.checkSumAdjustment (container checksum) and head.flags bit 11
(the standard WOFF2 lossless-compression marker). Neither is a rendering metric.
Different Brotli versions can produce different compressed bytes, so acceptance
compares decoded font data, not a compressed-file hash.
"""
import argparse
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.ttLib.woff2 import WOFF2FlavorData

ROOT = Path(__file__).resolve().parents[1]
FONTS = ROOT / 'source/atelier/fonts'
FACES = {
    'barlow-condensed-600': ('Barlow Condensed', 600, 'barlowcondensed-OFL.txt'),
    'dm-sans-400': ('DM Sans', 400, 'dmsans-OFL.txt'),
    'dm-sans-500': ('DM Sans', 500, 'dmsans-OFL.txt'),
    'dm-sans-600': ('DM Sans', 600, 'dmsans-OFL.txt'),
}


def verify(stem, family, weight, license_name):
    ttf, woff = FONTS / (stem + '.ttf'), FONTS / (stem + '.woff2')
    assert woff.read_bytes()[:4] == b'wOF2', f'{stem}: invalid WOFF2 signature'
    assert woff.stat().st_size < ttf.stat().st_size, f'{stem}: no size reduction'
    license_text = (FONTS / license_name).read_text()
    assert 'SIL OPEN FONT LICENSE Version 1.1' in license_text
    with TTFont(ttf) as original, TTFont(woff) as compressed:
        assert compressed.flavor == 'woff2'
        assert not compressed.flavorData.transformedTables
        assert set(original.reader.keys()) == set(compressed.reader.keys())
        # Raw table parity includes glyf, loca, cmap, hmtx, kern, GPOS, GSUB,
        # GDEF, hinting, names, OS/2, hhea and any other present sfnt tables.
        for tag in original.reader.keys():
            before, after = original.reader[tag], compressed.reader[tag]
            if tag == 'head':
                before = bytearray(before)
                after = bytearray(after)
                before[8:12] = after[8:12] = b'\0' * 4
                assert (int.from_bytes(after[16:18], 'big') ==
                        (int.from_bytes(before[16:18], 'big') | (1 << 11)))
                before[16] |= 8  # WOFF2 compression marker; preserve every other flag
            assert before == after, f'{stem}: {tag} table changed'
        assert original.getGlyphOrder() == compressed.getGlyphOrder()
        assert original.getBestCmap() == compressed.getBestCmap()
        assert original['hmtx'].metrics == compressed['hmtx'].metrics
        assert original['maxp'].numGlyphs == compressed['maxp'].numGlyphs
        assert original['OS/2'].usWeightClass == compressed['OS/2'].usWeightClass == weight
        names = compressed['name'].names
        expected_name = 'Barlow Condensed SemiBold' if family == 'Barlow Condensed' else family
        assert expected_name in {n.toUnicode() for n in names if n.nameID in (1, 16)}
        print(f'{stem}: {ttf.stat().st_size} -> {woff.stat().st_size} bytes; '
              f'{compressed["maxp"].numGlyphs} glyphs and all sfnt tables preserved')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write', action='store_true', help='Regenerate the four WOFF2 files before checking')
    args = parser.parse_args()
    for stem, (family, weight, license_name) in FACES.items():
        if args.write:
            with TTFont(FONTS / (stem + '.ttf'), recalcBBoxes=False, recalcTimestamp=False) as font:
                font.flavor = 'woff2'
                font.flavorData = WOFF2FlavorData(transformedTables=set())
                font.save(FONTS / (stem + '.woff2'))
        verify(stem, family, weight, license_name)


if __name__ == '__main__':
    main()
