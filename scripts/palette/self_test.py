#!/usr/bin/env python3
"""Self-test of the palette guard (GAME-22), with a mutation run.

    python3 scripts/palette/self_test.py

1. Synthetic fixtures in a temp dir, run through the real CLIs (exit codes and output).
2. Mutations: each copies scripts/palette/ to a temp dir, breaks exactly one place, and the
   self-test against that copy MUST end with "SELF-TEST: FAILED". A mutation whose target
   text is not found is itself a failure (it would otherwise be a silent no-op).
Exit 0 only if every case passes and every mutation is caught.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))

BLACK, WHITE, GREEN, RUST = (0, 0, 0), (255, 255, 255), (60, 140, 60), (200, 100, 50)
PALETTE = [BLACK, WHITE, GREEN, RUST]
FOREIGN = (0x12, 0x34, 0x56)

MUTATIONS = [
    ('comparison disabled: nothing is ever foreign', 'check.py', '        if d2 > tol2:', '        if False:'),
    ('alpha == 0 pixels are checked too', 'check.py',
     '        if data[i + 3] == 0:\n            continue', '        if False:\n            continue'),
    ('NOT RUN reported as PASS', 'check.py', "status = 'NOT RUN'", "status = 'PASS'"),
    ('missing dir is green without --allow-missing', 'check.py',
     'return 0 if a.allow_missing else 1', 'return 0'),
    ('tolerance compared as squared', 'check.py', 'tol2 = tolerance * tolerance', 'tol2 = tolerance'),
    ('example list not capped at 10', 'check.py', '[:MAX_EXAMPLES]', ''),
    ('unreadable PNG skipped silently', 'check.py', '            unreadable += 1\n', ''),
    ('quantize keeps original colours', 'quantize.py',
     'cache[rgb] = nearest(rgb, palette)[0]', 'cache[rgb] = rgb'),
    ('quantize keeps semi-transparent pixels', 'quantize.py', 'ALPHA_THRESHOLD = 128', 'ALPHA_THRESHOLD = 1'),
    ('walk not recursive', 'check.py', 'for d, _, files in os.walk(root):', 'for d, _, files in [next(os.walk(root))]:'),
    ('.png match case-sensitive', 'check.py', "if f.lower().endswith('.png'):", "if f.endswith('.png'):"),
    ('extract --check never sees a stale file', 'extract.py', '        if current != text:', '        if False:'),
]


def hexc(c):
    return '#%02x%02x%02x' % c


def run(scripts, name, *args):
    r = subprocess.run([sys.executable, '-I', os.path.join(scripts, name), *args],
                       capture_output=True, text=True, cwd=ROOT_DIR)
    return r.returncode, r.stdout + r.stderr


def sprite(path, pixels, size=(4, 4), fill=GREEN + (255,)):
    im = Image.new('RGBA', size, fill)
    for (x, y), px in pixels.items():
        im.putpixel((x, y), px if len(px) == 4 else px + (255,))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path)


def examples(out):
    return re.findall(r'(#[0-9a-f]{6}) ×(\d+)', out)


def cases(scripts, tmp):
    """Yield (name, ok, detail)."""
    pal = os.path.join(tmp, 'pal.json')
    with open(pal, 'w') as f:
        json.dump({'name': 'synthetic', 'count': 4, 'colors': [hexc(c) for c in PALETTE]}, f)
    chk = lambda d, *a: run(scripts, 'check.py', d, '--palette', pal, *a)  # noqa: E731

    # A: in-palette sprite; one alpha-0 pixel carries a foreign RGB and must be ignored
    sprite(f'{tmp}/a/ok.png', {(0, 0): BLACK, (1, 0): WHITE, (2, 0): RUST, (3, 3): (255, 0, 255, 0)})
    code, out = chk(f'{tmp}/a')
    yield 'in-palette sprite (with alpha-0 foreign RGB) -> PASS', code == 0 and 'PASS' in out and not examples(out), out

    # B: one foreign pixel -> exactly that colour, count 1
    sprite(f'{tmp}/b/bad.png', {(0, 0): BLACK, (2, 2): FOREIGN})
    code, out = chk(f'{tmp}/b')
    yield 'one foreign pixel -> FAIL listing exactly it', (
        code == 1 and examples(out) == [(hexc(FOREIGN), '1')] and '1 foreign colour(s), 1 px' in out), out

    # C: the same sprite after quantize -> PASS, the foreign pixel maps to nearest (GREEN)
    os.makedirs(f'{tmp}/c')
    qcode, qout = run(scripts, 'quantize.py', f'{tmp}/b/bad.png', f'{tmp}/c/bad.png', '--palette', pal)
    code, out = chk(f'{tmp}/c')
    px = Image.open(f'{tmp}/c/bad.png').convert('RGBA').getpixel((2, 2)) if qcode == 0 else None
    yield 'foreign sprite after quantize -> PASS', (
        qcode == 0 and code == 0 and 'PASS' in out and px == GREEN + (255,)), qout + out

    # D: semi-transparent: alpha 1 is visible -> checked; quantize binarises alpha at 128
    sprite(f'{tmp}/d/semi.png', {(0, 0): FOREIGN + (1,), (1, 0): RUST + (100,), (2, 0): RUST + (200,)})
    code, out = chk(f'{tmp}/d')
    yield 'semi-transparent foreign pixel (alpha 1) -> FAIL', code == 1 and examples(out) == [(hexc(FOREIGN), '1')], out
    os.makedirs(f'{tmp}/d2')
    qcode, qout = run(scripts, 'quantize.py', f'{tmp}/d/semi.png', f'{tmp}/d2/semi.png', '--palette', pal)
    q = Image.open(f'{tmp}/d2/semi.png').convert('RGBA') if qcode == 0 else None
    got = [q.getpixel((x, 0))[3] for x in range(3)] if q else None
    yield 'quantize: alpha 1 -> 0, 100 -> 0, 200 -> 255', got == [0, 0, 255], f'{qout} alphas={got}'

    # N: sprite only in a nested folder, uppercase .PNG -> must be found and FAIL (рецензія PR #13:
    #    LPC-спрайти лежать у підтеках; нерекурсивний обхід чи чутливе до регістру .png давали NOT RUN)
    sprite(f'{tmp}/n/chars/body/WALK.PNG', {(0, 0): FOREIGN})
    code, out = chk(f'{tmp}/n')
    yield 'nested folder + uppercase .PNG -> found and FAIL', code == 1 and examples(out) == [(hexc(FOREIGN), '1')], out

    # E: tolerance — pixel at distance exactly 2 from GREEN
    sprite(f'{tmp}/e/near.png', {(0, 0): (62, 140, 60)})
    c0, o0 = chk(f'{tmp}/e')
    c2, o2 = chk(f'{tmp}/e', '--tolerance', '2')
    c19, o19 = chk(f'{tmp}/e', '--tolerance', '1.9')
    yield 'tolerance: d=2 red at 0 and 1.9, green at 2', (c0, c19, c2) == (1, 1, 0), o0 + o19 + o2

    # F: more than 10 foreign colours -> all counted, 10 examples
    sprite(f'{tmp}/f/many.png', {(i % 4, i // 4): (10 + i, 20, 30) for i in range(12)})
    code, out = chk(f'{tmp}/f')
    yield '12 foreign colours -> counted 12, 10 examples', (
        code == 1 and '12 foreign colour(s)' in out and len(examples(out)) == 10), out

    # G: empty and missing dir -> NOT RUN, never PASS; exit 0 only with --allow-missing
    os.makedirs(f'{tmp}/g')
    res = [chk(f'{tmp}/g', '--allow-missing'), chk(f'{tmp}/g'),
           chk(f'{tmp}/nope', '--allow-missing'), chk(f'{tmp}/nope')]
    yield 'empty/missing dir -> NOT RUN (0 with --allow-missing, 1 without), no PASS', (
        [c for c, _ in res] == [0, 1, 0, 1]
        and all('NOT RUN' in o and 'PASS' not in o for _, o in res)), ' | '.join(o for _, o in res)

    # H: unreadable PNG -> red, not skipped
    os.makedirs(f'{tmp}/h')
    sprite(f'{tmp}/h/ok.png', {})
    with open(f'{tmp}/h/broken.png', 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\nnot really')
    code, out = chk(f'{tmp}/h')
    yield 'unreadable PNG -> FAIL', code == 1 and 'ERROR' in out and 'PASS' not in out, out

    # I: extract — union of alpha>0 colours, alpha-0 colour excluded; --check catches a stale file
    sprite(f'{tmp}/i/s1.png', {(0, 0): BLACK, (1, 0): (9, 9, 9, 0)}, size=(3, 1), fill=WHITE + (255,))
    sprite(f'{tmp}/i/s2.png', {(0, 0): RUST + (50,)}, size=(2, 1), fill=GREEN + (255,))
    out_json = f'{tmp}/i/p.json'
    srcs = [f'{tmp}/i/s1.png', f'{tmp}/i/s2.png']
    e1, eo1 = run(scripts, 'extract.py', '--name', 't', '--out', out_json, *srcs)
    with open(out_json) as f:
        got = json.load(f) if e1 == 0 else {}
    expect = sorted(hexc(c) for c in PALETTE)
    e2, eo2 = run(scripts, 'extract.py', '--name', 't', '--out', out_json, '--check', *srcs)
    got['colors'] = got.get('colors', [])[:-1]
    with open(out_json, 'w') as f:
        f.write(json.dumps(got))
    e3, eo3 = run(scripts, 'extract.py', '--name', 't', '--out', out_json, '--check', *srcs)
    yield 'extract: alpha>0 union, --check green then red when stale', (
        e1 == 0 and got.get('count') == 4 and got['colors'] == expect[:-1] and (e2, e3) == (0, 1)), eo1 + eo2 + eo3

    # J: real data — a crop of the LPC atlas is green against the committed palette
    real_pal = os.path.join(ROOT_DIR, 'art/palette/lpc.json')
    atlas = os.path.join(ROOT_DIR, 'research/packs/pack-lpc-atlas/terrain_atlas.png')
    if os.path.exists(real_pal) and os.path.exists(atlas):
        os.makedirs(f'{tmp}/j')
        Image.open(atlas).convert('RGBA').crop((0, 0, 256, 256)).save(f'{tmp}/j/crop.png')
        code, out = run(scripts, 'check.py', f'{tmp}/j', '--palette', real_pal)
        yield 'real LPC atlas crop -> PASS against art/palette/lpc.json', code == 0 and 'PASS' in out, out
    else:
        yield 'real LPC palette/atlas present', False, f'missing {real_pal} or {atlas}'


def self_test(scripts):
    failed = 0
    with tempfile.TemporaryDirectory() as tmp:
        for name, ok, detail in cases(scripts, tmp):
            print(f'  {"ok  " if ok else "FAIL"} {name}')
            if not ok:
                failed += 1
                print('       ' + detail.strip().replace('\n', '\n       '))
    return failed


def mutate():
    caught = 0
    for name, fname, src, dst in MUTATIONS:
        with tempfile.TemporaryDirectory() as tmp:
            copy = os.path.join(tmp, 'palette')
            shutil.copytree(HERE, copy, ignore=shutil.ignore_patterns('__pycache__'))
            path = os.path.join(copy, fname)
            with open(path, encoding='utf-8') as f:
                text = f.read()
            if text.count(src) != 1:
                print(f'  FAIL mutation "{name}": target found {text.count(src)} times in {fname}, expected 1')
                continue
            with open(path, 'w', encoding='utf-8') as f:
                f.write(text.replace(src, dst))
            r = subprocess.run([sys.executable, '-I', os.path.abspath(__file__), '--no-mutate',
                                '--scripts', copy, '--root', ROOT_DIR], capture_output=True, text=True)
            hit = r.returncode == 1 and 'SELF-TEST: FAILED' in r.stdout
            caught += hit
            print(f'  {"caught" if hit else "MISSED"} {name}')
    return caught


def main():
    global ROOT_DIR
    ap = argparse.ArgumentParser()
    ap.add_argument('--scripts', default=HERE)
    ap.add_argument('--root', default=ROOT)
    ap.add_argument('--no-mutate', action='store_true')
    a = ap.parse_args()
    ROOT_DIR = a.root
    print('palette self-test: cases')
    failed = self_test(a.scripts)
    if failed:
        print(f'SELF-TEST: FAILED — {failed} case(s)')
        return 1
    if a.no_mutate:
        print('SELF-TEST: OK')
        return 0
    print(f'palette self-test: mutations ({len(MUTATIONS)})')
    caught = mutate()
    if caught != len(MUTATIONS):
        print(f'SELF-TEST: FAILED — mutations caught {caught} of {len(MUTATIONS)}')
        return 1
    print(f'SELF-TEST: OK — cases green, mutations caught {caught} of {len(MUTATIONS)}')
    return 0


ROOT_DIR = ROOT
if __name__ == '__main__':
    sys.exit(main())
