#!/usr/bin/env python3
"""Сторож шрифту (GAME-26): кожен знак повної української абетки (і службові знаки) має гліф
із ненульовою шириною й контуром — не «тофу» і не порожнє місце.

  python3 scripts/i18n/font_glyphs.py [font.ttf]      перевірити (типово public/fonts/PressStart2P-Regular.ttf)
  python3 scripts/i18n/font_glyphs.py --self-test     довести, що сторож червоніє (без Ґ; без ʼ; Ж і ʼ з контуром .notdef)
"""
import copy
import os
import sys
import tempfile

from fontTools.pens.recordingPen import RecordingPen
from fontTools.ttLib import TTFont

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
DEFAULT = os.path.join(ROOT, 'public', 'fonts', 'PressStart2P-Regular.ttf')
LETTERS = 'АаБбВвГгҐґДдЕеЄєЖжЗзИиІіЇїЙйКкЛлМмНнОоПпРрСсТтУуФфХхЦцЧчШшЩщЬьЮюЯя'
# ʼ U+02BC — апостроф-модифікатор (правопис 2019 радить саме його в словах: «пʼять»); ’ U+2019 — поширена заміна.
PUNCT = 'ʼ’\'«»—…№.,:;!?()-'
REQUIRED = LETTERS + PUNCT


def outline(glyphset, name):
    """Контур гліфа як список команд пера — однаково для glyf і CFF — зсунутий до (0, 0):
    копія .notdef з іншим лівим полем (lsb) малюється зміщеною, але це те саме тофу."""
    pen = RecordingPen()
    glyphset[name].draw(pen)
    pts = [pt for _, args in pen.value for pt in args if isinstance(pt, tuple)]
    if not pts:
        return []
    x0, y0 = min(p[0] for p in pts), min(p[1] for p in pts)
    return [(op, tuple((p[0] - x0, p[1] - y0) if isinstance(p, tuple) else p for p in args)) for op, args in pen.value]


def missing(path):
    font = TTFont(path)
    cmap = font.getBestCmap()
    hmtx = font['hmtx'].metrics
    glyf = font['glyf'] if 'glyf' in font else None
    glyphset = font.getGlyphSet()
    order = font.getGlyphOrder()
    # Гліф із контуром .notdef — це тофу, хоч cmap його й має. Порожній .notdef так не виявити
    # (тоді пустоту ловить «порожній контур»).
    notdef = outline(glyphset, order[0]) if order else []
    bad = []
    for ch in REQUIRED:
        name = cmap.get(ord(ch))
        if name is None:
            bad.append((ch, 'немає гліфа'))
            continue
        if hmtx.get(name, (0, 0))[0] <= 0:
            bad.append((ch, 'нульова ширина'))
            continue
        if notdef and name != order[0] and outline(glyphset, name) == notdef:
            bad.append((ch, 'контур — копія .notdef (тофу)'))
            continue
        if name == order[0]:
            bad.append((ch, 'указує на сам .notdef (тофу)'))
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

        # Апостроф U+02BC (модифікатор, яким пишуть український апостроф у словах) — обов'язковий.
        cut2 = os.path.join(tmp, 'no-02bc.ttf')
        font = TTFont(DEFAULT)
        sub = subset.Subsetter(opts)
        sub.populate(text=''.join(c for c in REQUIRED if c != '\u02bc') + '\u2019')
        sub.subset(font)
        font.save(cut2)
        got = ''.join(sorted(ch for ch, _ in missing(cut2)))
        good_apo = got == '\u02bc'
        print(('ok  ' if good_apo else 'FAIL') + f' шрифт без U+02BC → рівно ʼ (отримано {got!r})')
        ok &= good_apo

        # Гліф, чий контур — копія .notdef: у cmap є, ширина є, контур є, а на екрані — тофу.
        tofu = os.path.join(tmp, 'zhe-is-notdef.ttf')
        font = TTFont(DEFAULT)
        cmap = font.getBestCmap()
        for ch in 'Жʼ':
            font['glyf'][cmap[ord(ch)]] = copy.deepcopy(font['glyf']['.notdef'])
        font.save(tofu)
        bad = missing(tofu)
        got = ''.join(sorted(ch for ch, _ in bad))
        good_tofu = got == ''.join(sorted('Жʼ')) and all('notdef' in why for _, why in bad)
        print(('ok  ' if good_tofu else 'FAIL') + f' Ж і ʼ з контуром .notdef → рівно вони, як тофу (отримано {bad!r})')
        ok &= good_tofu
    print(f'FONT SELF-TEST: {"PASSED" if ok else "FAILED"}')
    return 0 if ok else 1


if __name__ == '__main__':
    if '--self-test' in sys.argv:
        sys.exit(self_test())
    sys.exit(report(sys.argv[1] if len(sys.argv) > 1 else DEFAULT))
