#!/usr/bin/env node
// GAME-32 · «усі об'єкти сцени — з реєстру ліцензій». Сторож ліцензій (check-assets.mjs) покриває
// УСЕ медіа в public/ і assets/ — тож досить довести, що код гри посилається лише туди й лише на
// наявні файли. Посилання в research/ (проби) чи на неіснуючий файл — червоне.
//   node scripts/assets/check-scene-refs.mjs [--self-test]
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cli } from '../lib/cli.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MEDIA = /['"`]([^'"`\s]+\.(?:png|jpe?g|webp|svg|tmj|tsj|ttf|otf|woff2?|ogg|mp3|wav))['"`]/g;

/** sources: [{ file, text }] ; exists(path) → bool. Повертає знахідки. */
export function check(sources, exists) {
  const out = [];
  for (const { file, text } of sources) {
    for (const m of text.matchAll(MEDIA)) {
      const ref = m[1];
      if (/^(https?:)?\/\//.test(ref)) { out.push({ code: 'SCENE_REF_REMOTE', where: file, msg: `${ref}: медіа з мережі — гра має працювати офлайн, а ліцензію не перевірити` }); continue; }
      // Відносний шлях у src/ — від файлу (імпорт assets/); голий шлях — від public/ (так віддає Vite).
      const target = ref.startsWith('.') ? relative(ROOT, resolve(ROOT, dirname(file), ref)) : join('public', ref.replace(/^\//, ''));
      if (!/^(public|assets)\//.test(target)) { out.push({ code: 'SCENE_REF_OUTSIDE', where: file, msg: `${ref} → ${target}: поза public/ і assets/, сторож ліцензій його не бачить` }); continue; }
      if (!exists(target)) out.push({ code: 'SCENE_REF_MISSING', where: file, msg: `${ref} → ${target}: файлу немає` });
    }
  }
  return out;
}

const CODES = ['SCENE_REF_REMOTE', 'SCENE_REF_OUTSIDE', 'SCENE_REF_MISSING'];

function walk(dir) {
  const out = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx|mjs|js)$/.test(f) && !/\.test\.|\.spec\./.test(f)) out.push(p);
  }
  return out;
}

function selfTest() {
  const has = new Set(['public/spike/camp.tmj', 'assets/credits.json'.replace('.json', '.png')]);
  const ex = (p) => has.has(p);
  const cases = [
    ['позитивний контроль: файл у public/', [{ file: 'src/view/a.ts', text: "load('spike/camp.tmj')" }], []],
    ['позитивний контроль: відносний імпорт з assets/', [{ file: 'src/a.ts', text: "import x from '../assets/credits.png'" }], []],
    ['файлу немає', [{ file: 'src/view/a.ts', text: "load('spike/ghost.png')" }], ['SCENE_REF_MISSING']],
    ['проба з research/', [{ file: 'src/view/a.ts', text: "import t from '../../research/art-spike/tile.png'" }], ['SCENE_REF_OUTSIDE']],
    ['медіа з мережі', [{ file: 'src/view/a.ts', text: "load('https://example.org/tiles.png')" }], ['SCENE_REF_REMOTE']],
  ];
  let bad = 0; const proven = new Set();
  for (const [name, src, expect] of cases) {
    const got = [...new Set(check(src, ex).map((f) => f.code))].sort();
    if (JSON.stringify(got) === JSON.stringify([...expect].sort())) expect.forEach((c) => proven.add(c));
    else { bad++; console.log(`FAIL ${name}: очікував [${expect}], отримав [${got}]`); }
  }
  const unproven = CODES.filter((c) => !proven.has(c));
  if (unproven.length) { bad++; console.log(`FAIL без прикладу: ${unproven}`); }
  console.log(bad ? `SCENE REFS SELF-TEST: FAILED ${bad}` : `SCENE REFS SELF-TEST: PASSED ${cases.length}/${cases.length} · кодів ${CODES.length}, доведено ${proven.size}`);
  return bad ? 1 : 0;
}

const args = cli({ flags: ['self-test'] });
if (args['self-test']) process.exit(selfTest());
const files = [...walk(join(ROOT, 'src')), join(ROOT, 'index.html')];
const sources = files.map((f) => ({ file: relative(ROOT, f), text: readFileSync(f, 'utf8') }));
const found = check(sources, (p) => existsSync(join(ROOT, p)));
for (const f of found) console.log(`::error::${f.code} · ${f.where} · ${f.msg}`);
const refs = sources.reduce((n, s) => n + [...s.text.matchAll(MEDIA)].length, 0);
if (refs === 0) { console.log('::error::SCENE REFS: 0 посилань на медіа — сторож нічого не бачить (шаблон зламано?)'); process.exit(1); }
console.log(found.length ? `SCENE REFS: FAILED ${found.length}` : `SCENE REFS: OK · ${refs} посилань у ${files.length} файлах — усі в public/ або assets/ і наявні`);
process.exit(found.length ? 1 : 0);
