#!/usr/bin/env python3
"""Сторож шрифту (GAME-26): кожен знак повної української абетки (і службові знаки) має гліф
із ненульовою шириною й контуром — не «тофу» і не порожнє місце.

  python3 scripts/i18n/font_glyphs.py [font.ttf]      перевірити (типово public/fonts/PressStart2P-Regular.ttf)
  python3 scripts/i18n/font_glyphs.py --self-test     довести, що сторож червоніє (підмножина шрифту без Ґ)
"""
import os
import sys
import tempfile

from fontTools.ttLib import TTFont

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
DEFAULT = os.path.join(ROOT, 'public', 'fonts', 'PressStart2P-Regular.ttf')
LETTERS = 'АаБбВвГгҐґДдЕеЄєЖжЗзИиІіЇїЙйКкЛлМмНнОоПпРрСсТтУуФфХхЦцЧчШшЩщЬьЮюЯя'
PUNCT = '’\'«»—…№.,:;!?()-'
REQUIRED = LETTERS + PUNCT


def missing(path):
    font = TTFont(path)
    cmap = font.getBestCmap()
    hmtx = font['hmtx'].metrics
    glyf = font['glyf'] if 'glyf' in font else None
    bad = []
    for ch in REQUIRED:
        name = cmap.get(ord(ch))
        if name is None:
            bad.append((ch, 'немає гліфа'))
            continue
        if hmtx.get(name, (0, 0))[0] <= 0:
            bad.append((ch, 'нульова ширина'))
            continue
        if glyf is not None and ch in LETTERS:
            g = glyf[name]
            if g.numberOfContours == 0:
                bad.append((ch, 'порожній контур'))
    return bad


def report(path):
    bad = missing(path)
    for ch, why in bad:
        print(f'  {ch} U+{ord(ch):04X}: {why}')
    print(f'font-glyphs: {"FAIL" if bad else "PASS"} · {os.path.basename(path)} · знаків {len(REQUIRED)}, проблем {len(bad)}')
    return 1 if bad else 0


def self_test():
    from fontTools import subset
    ok = True
    good = missing(DEFAULT)
    print(('ok  ' if not good else 'FAIL') + f' позитивний контроль: повний шрифт — 0 проблем (отримано {len(good)})')
    ok &= not good
    with tempfile.TemporaryDirectory() as tmp:
        cut = os.path.join(tmp, 'no-ghe.ttf')
        keep = ''.join(c for c in REQUIRED if c not in 'Ґґ')
        opts = subset.Options()
        opts.notdef_outline = True
        sub = subset.Subsetter(opts)
        font = TTFont(DEFAULT)
        sub.populate(text=keep)
        sub.subset(font)
        font.save(cut)
        bad = missing(cut)
        got = sorted(ch for ch, _ in bad)
        good_cut = got == sorted('Ґґ')
        print(('ok  ' if good_cut else 'FAIL') + f' шрифт без Ґґ → рівно Ґ і ґ (отримано {"".join(got)})')
        ok &= good_cut
    print(f'FONT SELF-TEST: {"PASSED" if ok else "FAILED"}')
    return 0 if ok else 1


if __name__ == '__main__':
    if '--self-test' in sys.argv:
        sys.exit(self_test())
    sys.exit(report(sys.argv[1] if len(sys.argv) > 1 else DEFAULT))
