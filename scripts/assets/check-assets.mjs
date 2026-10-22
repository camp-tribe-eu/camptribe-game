#!/usr/bin/env node
// Сторож графіки й ліцензій (GAME-21): кожен PNG в assets/ має рядок у реєстрі ліцензій і рядок
// у титрах, кожен рядок титрів — наявний файл і дозволену ліцензію, а assets/credits.json
// згенеровано саме з assets/CREDITS.csv.
//
//   node scripts/assets/check-assets.mjs              — перевірити assets/
//   node scripts/assets/check-assets.mjs --write-json — перегенерувати assets/credits.json
//   node scripts/assets/check-assets.mjs --self-test  — довести, що кожен код червоніє
//   node scripts/assets/check-assets.mjs --mutate     — вимкнути кожну перевірку по черзі: самотест мусить упасти
//
// Без залежностей. Порожня assets/ — помилка, а не зелене (закон 4).
//
// Зв'язок файл -> рядок реєстру (docs/LICENSE_REGISTER.md): у клітинці «де використано» рядка
// ART-NNN кожен шлях у `бектиках`, що починається з `assets/`, — або точний файл, або тека, якщо
// закінчується на `/` (тоді рядок покриває все під нею). Кожен PNG мусить потрапити рівно в один
// рядок; кожен такий шлях мусить покривати хоч один файл (інакше рядок застарів).

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ASSETS = 'assets';
const REGISTER = 'docs/LICENSE_REGISTER.md';
const CREDITS = 'assets/CREDITS.csv';
const JSON_OUT = 'assets/credits.json';
const META_FILES = new Set(['CREDITS.csv', 'credits.json']);

export const HEADER = ['file', 'authors', 'licence', 'licences_offered', 'source_urls', 'origin', 'notes'];

// Ліцензії, які можна ОБРАТИ для графіки (скіл game-art-sources §3). GPL — лише коли нема іншого,
// тож обрана GPL — червоне: рішення про неї приймає людина, і тоді список розширюється тут.
const LICENCES = {
  'CC0': { url: 'https://creativecommons.org/publicdomain/zero/1.0/', drm_ok: true },
  'OGA-BY 3.0': { url: 'https://static.opengameart.org/OGA-BY-3.0.txt', drm_ok: true },
  'CC-BY 3.0': { url: 'https://creativecommons.org/licenses/by/3.0/', drm_ok: false },
  'CC-BY 4.0': { url: 'https://creativecommons.org/licenses/by/4.0/', drm_ok: false },
  'CC-BY-SA 3.0': { url: 'https://creativecommons.org/licenses/by-sa/3.0/', drm_ok: false },
  'CC-BY-SA 4.0': { url: 'https://creativecommons.org/licenses/by-sa/4.0/', drm_ok: false },
};
// Від найм'якшої до найжорсткішої. Обрати можна лише найм'якшу з запропонованих.
const RANK = ['CC0', 'OGA-BY', 'CC-BY', 'CC-BY-SA', 'GPL'];
const family = (l) => (RANK.includes(l.split(' ')[0]) ? l.split(' ')[0] : null);

export const CODES = [
  'ASSETS_EMPTY', 'ASSET_UNKNOWN_FILE', 'REGISTER_EMPTY', 'ASSET_NO_REGISTER_ROW', 'ASSET_REGISTER_AMBIGUOUS',
  'REGISTER_PATH_UNUSED', 'REGISTER_NO_SOURCE', 'REGISTER_LICENCE_MISMATCH', 'CREDITS_BAD_HEADER',
  'ASSET_NO_CREDITS_ROW', 'CREDITS_FILE_MISSING', 'CREDITS_DUPLICATE', 'CREDITS_NO_AUTHOR', 'CREDITS_NO_SOURCE',
  'LICENCE_NOT_OFFERED', 'LICENCE_NOT_ALLOWED', 'LICENCE_NOT_MOST_PERMISSIVE', 'CREDITS_JSON_STALE',
];

// RFC 4180: лапки, коми й переноси всередині лапок.
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

const splitList = (s, sep) => s.split(sep).map((x) => x.trim()).filter(Boolean);

function creditsRows(csvText) {
  const [head, ...body] = parseCsv(csvText);
  if (!head || head.join(',') !== HEADER.join(',')) return { ok: false, head: head ?? [] };
  return {
    ok: true,
    rows: body.map((cells, i) => {
      const r = Object.fromEntries(HEADER.map((h, j) => [h, (cells[j] ?? '').trim()]));
      return {
        line: i + 2, file: r.file, licence: r.licence, notes: r.notes, origin: r.origin,
        authors: splitList(r.authors, ';'), offered: splitList(r.licences_offered, '|'),
        sources: splitList(r.source_urls, /\s+/),
      };
    }),
  };
}

function registerRows(md) {
  const out = [];
  for (const line of md.split('\n')) {
    if (!/^\|\s*ART-\d{3}\s*\|/.test(line)) continue;
    const cells = line.replace(/^\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
    const paths = [...(cells[6] ?? '').matchAll(/`(assets\/[^`]*)`/g)].map((m) => m[1].slice(ASSETS.length + 1));
    out.push({ id: cells[0], source: cells[2] ?? '', licence: cells[3] ?? '', paths });
  }
  return out;
}

const covers = (p, f) => (p.endsWith('/') ? f.startsWith(p) : f === p);

// Псевдонім без повного імені ("ElizaWy") зливається з повним ("Eliza Wyatt (ElizaWy)").
function aliasMap(names) {
  const full = new Map();
  for (const n of names) { const m = n.match(/\(([^)]+)\)\s*$/); if (m) full.set(m[1], n); }
  return (n) => full.get(n) ?? n;
}

export function buildJson(rows) {
  const canon = aliasMap(rows.flatMap((r) => r.authors));
  const by = new Map();
  for (const r of rows) {
    for (const a of new Set(r.authors.map(canon))) {
      const e = by.get(a) ?? { name: a, files: [], licences: new Set(), sources: new Set() };
      e.files.push(r.file); e.licences.add(r.licence); r.sources.forEach((s) => e.sources.add(s));
      by.set(a, e);
    }
  }
  const sorted = (s) => [...s].sort();
  const used = sorted(new Set(rows.map((r) => r.licence)));
  return JSON.stringify({
    generated_by: 'scripts/assets/check-assets.mjs --write-json',
    source: CREDITS,
    licences: Object.fromEntries(used.map((l) => [l, LICENCES[l] ?? { url: null, drm_ok: false }])),
    authors: [...by.values()].sort((a, b) => a.name.localeCompare(b.name, 'en'))
      .map((e) => ({ name: e.name, files: sorted(e.files), licences: sorted(e.licences), sources: sorted(e.sources) })),
    files: rows.map((r) => ({ file: r.file, authors: [...new Set(r.authors.map(canon))], licence: r.licence, sources: r.sources }))
      .sort((a, b) => (a.file < b.file ? -1 : 1)),
  }, null, 2) + '\n';
}

// input: { files: шляхи всередині assets/ (усі файли), register, credits, json }
export function check({ files, register, credits, json }) {
  const out = [];
  const add = (code, where, msg) => out.push({ code, where, msg });
  const pngs = files.filter((f) => /\.png$/i.test(f));
  // @check:ASSETS_EMPTY
  if (pngs.length === 0) add('ASSETS_EMPTY', ASSETS, 'жодного PNG — нічого не перевірено');
  for (const f of files) {
    // @check:ASSET_UNKNOWN_FILE
    if (!/\.png$/i.test(f) && !META_FILES.has(f)) add('ASSET_UNKNOWN_FILE', f, 'не PNG і не титри: сторож такий файл не перевіряє');
  }

  const reg = registerRows(register);
  // @check:REGISTER_EMPTY
  if (reg.length === 0) add('REGISTER_EMPTY', REGISTER, 'жодного рядка ART-NNN — розбір зламався');
  const rowOf = new Map();
  for (const f of pngs) {
    const hits = reg.filter((r) => r.paths.some((p) => covers(p, f)));
    // @check:ASSET_NO_REGISTER_ROW
    if (hits.length === 0) add('ASSET_NO_REGISTER_ROW', f, `немає рядка в ${REGISTER}`);
    // @check:ASSET_REGISTER_AMBIGUOUS
    if (hits.length > 1) add('ASSET_REGISTER_AMBIGUOUS', f, hits.map((r) => r.id).join(', '));
    if (hits.length) rowOf.set(f, hits[0]);
  }
  for (const r of reg) {
    for (const p of r.paths) {
      // @check:REGISTER_PATH_UNUSED
      if (!pngs.some((f) => covers(p, f))) add('REGISTER_PATH_UNUSED', `${r.id} assets/${p}`, 'шлях не покриває жодного файлу');
    }
    // @check:REGISTER_NO_SOURCE
    if (r.paths.length && !/https?:\/\/\S+/.test(r.source)) add('REGISTER_NO_SOURCE', r.id, 'немає посилання на сторінку першоджерела');
  }

  const cr = creditsRows(credits);
  // @check:CREDITS_BAD_HEADER
  if (!cr.ok) add('CREDITS_BAD_HEADER', CREDITS, `заголовок [${cr.head.join(',')}], очікується [${HEADER.join(',')}]`);
  const rows = cr.ok ? cr.rows : [];
  const seen = new Set();
  for (const r of rows) {
    const at = `${CREDITS}:${r.line} ${r.file}`;
    // @check:CREDITS_DUPLICATE
    if (seen.has(r.file)) add('CREDITS_DUPLICATE', at, 'файл уже має рядок');
    seen.add(r.file);
    // @check:CREDITS_FILE_MISSING
    if (!files.includes(r.file)) add('CREDITS_FILE_MISSING', at, 'файлу в assets/ немає');
    // @check:CREDITS_NO_AUTHOR
    if (r.authors.length === 0) add('CREDITS_NO_AUTHOR', at, 'порожні автори');
    // @check:CREDITS_NO_SOURCE
    if (!r.sources.some((s) => /^https?:\/\//.test(s))) add('CREDITS_NO_SOURCE', at, 'немає посилання на джерело');
    // @check:LICENCE_NOT_OFFERED
    if (!r.offered.includes(r.licence)) add('LICENCE_NOT_OFFERED', at, `«${r.licence}» немає серед [${r.offered.join(' | ')}]`);
    // @check:LICENCE_NOT_ALLOWED
    if (!(r.licence in LICENCES)) add('LICENCE_NOT_ALLOWED', at, `«${r.licence}» не в списку дозволених`);
    const best = Math.min(...r.offered.map((o) => RANK.indexOf(family(o))).filter((i) => i >= 0));
    // @check:LICENCE_NOT_MOST_PERMISSIVE
    if (family(r.licence) && RANK.indexOf(family(r.licence)) > best) add('LICENCE_NOT_MOST_PERMISSIVE', at, `є м'якша: ${RANK[best]}`);
    const reg1 = rowOf.get(r.file);
    // @check:REGISTER_LICENCE_MISMATCH
    if (reg1 && !reg1.licence.includes(r.licence)) add('REGISTER_LICENCE_MISMATCH', at, `${reg1.id} не цитує «${r.licence}»`);
  }
  for (const f of pngs) {
    // @check:ASSET_NO_CREDITS_ROW
    if (cr.ok && !seen.has(f)) add('ASSET_NO_CREDITS_ROW', f, `немає рядка в ${CREDITS}`);
  }
  // @check:CREDITS_JSON_STALE
  if (cr.ok && json !== buildJson(rows)) add('CREDITS_JSON_STALE', JSON_OUT, 'застарів або відсутній: node scripts/assets/check-assets.mjs --write-json');
  return out;
}

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true })
    .map((p) => String(p).split('\\').join('/'))
    .filter((p) => statSync(join(dir, p)).isFile())
    .sort();
}

function load(root = ROOT) {
  const read = (p) => (existsSync(join(root, p)) ? readFileSync(join(root, p), 'utf8') : null);
  return { files: walk(join(root, ASSETS)), register: read(REGISTER) ?? '', credits: read(CREDITS) ?? '', json: read(JSON_OUT) };
}

function selfTest() {
  const real = load();
  // Синтетичний еталон: два файли, два рядки реєстру (тека і точний файл), титри, json.
  const reg = [
    '| ID | ресурс | джерело | ліцензія (дослівно) | атрибуція | перевірено | де використано |',
    '|---|---|---|---|---|---|---|',
    '| ART-101 | tiles | https://example.org/tiles | "CC-BY-SA 3.0", "GPL 3.0" | так | 22.10.2026 | `assets/t/` |',
    '| ART-102 | hero | https://example.org/hero | "OGA-BY 3.0" або "CC-BY-SA 3.0" | так | 22.10.2026 | `assets/c/hero.png` |',
  ].join('\n');
  const csvOf = (rows) => [HEADER.join(','), ...rows].join('\n') + '\n';
  const T = 't/a.png,Ann; Bob,CC-BY-SA 3.0,CC-BY-SA 3.0 | GPL 3.0,https://example.org/tiles,o,n';
  const H = 'c/hero.png,"Cid, Jr.; Bob",OGA-BY 3.0,OGA-BY 3.0 | CC-BY-SA 3.0,https://example.org/hero,o,n';
  const files = ['CREDITS.csv', 'c/hero.png', 'credits.json', 't/a.png'];
  const mk = (rows, over = {}) => {
    const credits = csvOf(rows);
    const cr = creditsRows(credits);
    return { files, register: reg, credits, json: cr.ok ? buildJson(cr.rows) : '', ...over };
  };
  const base = mk([T, H]);
  const swap = (from, to) => mk([T, H.replace(from, to)]);
  const cases = [
    ['позитивний контроль: синтетичний еталон', base, ''],
    ['позитивний контроль: справжні assets/', real, ''],
    ['порожня assets/', { ...base, files: ['CREDITS.csv', 'credits.json'] }, 'ASSETS_EMPTY,CREDITS_FILE_MISSING,REGISTER_PATH_UNUSED'],
    ['не-PNG картинка в assets/', { ...base, files: [...files, 't/b.webp'] }, 'ASSET_UNKNOWN_FILE'],
    ['реєстр не розібрано', { ...base, register: '' }, 'ASSET_NO_REGISTER_ROW,REGISTER_EMPTY'],
    ['PNG без рядка реєстру (мутація картки)', mk([T, H, 'x/new.png,Dan,CC0,CC0,https://e.org,o,n'], { files: [...files, 'x/new.png'] }), 'ASSET_NO_REGISTER_ROW'],
    ['.PNG великими теж перевіряється', { ...base, files: [...files, 'x/BIG.PNG'] }, 'ASSET_NO_CREDITS_ROW,ASSET_NO_REGISTER_ROW'],
    ['файл у двох рядках реєстру', { ...base, register: reg.replace('`assets/c/hero.png`', '`assets/c/hero.png` `assets/t/a.png`') }, 'ASSET_REGISTER_AMBIGUOUS'],
    ['рядок реєстру на зниклий файл', { ...base, register: reg.replace('`assets/t/`', '`assets/t/` `assets/gone.png`') }, 'REGISTER_PATH_UNUSED'],
    ['рядок реєстру без посилання', { ...base, register: reg.replace('https://example.org/tiles', 'OGA, сторінка') }, 'REGISTER_NO_SOURCE'],
    ['реєстр не цитує обрану ліцензію', { ...base, register: reg.replace('"OGA-BY 3.0" або ', '') }, 'REGISTER_LICENCE_MISMATCH'],
    ['зламаний заголовок титрів', { ...base, credits: base.credits.replace('licences_offered', 'licenses') }, 'CREDITS_BAD_HEADER'],
    ['PNG без рядка титрів', mk([T]), 'ASSET_NO_CREDITS_ROW'],
    ['рядок титрів на неіснуючий файл', mk([T, H, 't/ghost.png,Ann,CC-BY-SA 3.0,CC-BY-SA 3.0,https://example.org/tiles,o,n']), 'CREDITS_FILE_MISSING'],
    ['два рядки на один файл', mk([T, H, T]), 'CREDITS_DUPLICATE'],
    ['без автора', swap('"Cid, Jr.; Bob"', ' ; '), 'CREDITS_NO_AUTHOR'],
    ['без посилання на джерело', swap('https://example.org/hero', 'example.org/hero'), 'CREDITS_NO_SOURCE'],
    ['обрана ліцензія не з запропонованих', swap(',OGA-BY 3.0,OGA-BY', ',CC0,OGA-BY'), 'LICENCE_NOT_OFFERED,REGISTER_LICENCE_MISMATCH'],
    ['обрано GPL (не дозволено)', mk([T.replace('CC-BY-SA 3.0,CC-BY-SA 3.0 | GPL 3.0', 'GPL 3.0,GPL 3.0'), H], { register: reg.replace('"GPL 3.0"', 'GPL 3.0') }), 'LICENCE_NOT_ALLOWED'],
    ['обрано не найм\'якшу', swap(',OGA-BY 3.0,OGA-BY', ',CC-BY-SA 3.0,OGA-BY'), 'LICENCE_NOT_MOST_PERMISSIVE'],
    ['credits.json застарів', { ...base, json: base.json.replace('Ann', 'Anna') }, 'CREDITS_JSON_STALE'],
    ['credits.json відсутній', { ...base, json: null }, 'CREDITS_JSON_STALE'],
  ];
  const codesOf = (inp) => [...new Set(check(inp).map((f) => f.code))].sort().join(',');
  let failed = 0;
  const hit = new Set();
  for (const [name, inp, want] of cases) {
    const got = codesOf(inp);
    got.split(',').filter(Boolean).forEach((c) => hit.add(c));
    const ok = got === want;
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` — очікувалось [${want}], отримано [${got}]`}`);
  }
  // Склейка псевдонімів і групування — те, що побачить екран титрів.
  const j = JSON.parse(base.json);
  const names = j.authors.map((a) => a.name).join('|');
  const groupOk = names === 'Ann|Bob|Cid, Jr.' && j.authors[1].files.length === 2;
  const alias = JSON.parse(buildJson(creditsRows(csvOf(['t/a.png,Eliza Wyatt (ElizaWy),CC0,CC0,https://e.org,o,n', 'c/hero.png,ElizaWy,CC0,CC0,https://e.org,o,n'])).rows));
  const aliasOk = alias.authors.length === 1 && alias.authors[0].files.length === 2;
  for (const [ok, name] of [[groupOk, `автори згруповані й відсортовані (${names})`], [aliasOk, 'псевдонім злито з повним іменем']]) {
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
  }
  const unproven = CODES.filter((c) => !hit.has(c));
  if (unproven.length) { failed++; console.log(`FAIL коди без прикладу, на якому вони спрацювали: ${unproven.join(', ')}`); }
  const total = cases.length + 2;
  console.log(`ASSETS SELF-TEST: ${failed ? `FAILED ${failed} of ${total}` : `PASSED ${total}/${total}`} · кодів ${CODES.length}, доведено ${hit.size}`);
  return failed ? 1 : 0;
}

// Кожна перевірка позначена `// @check:CODE`; мутація ставить `if (false)` перед наступним
// оператором у тимчасовій копії скрипта. Самотест копії мусить завершитись «SELF-TEST: FAILED».
function mutate() {
  const self = fileURLToPath(import.meta.url);
  const src = readFileSync(self, 'utf8');
  const markers = [...src.matchAll(/\/\/ @check:([A-Z_]+)\n/g)].map((m) => m[1]);
  if ([...markers].sort().join() !== [...CODES].sort().join()) {
    console.log(`MUTATION: ABORT — маркери [${markers}] не збігаються з CODES [${CODES}]`);
    return 1;
  }
  const clean = spawnSync(process.execPath, [self, '--self-test'], { encoding: 'utf8' });
  if (clean.status !== 0) { console.log(clean.stdout); console.log('MUTATION: ABORT — немутований самотест не зелений'); return 1; }
  const tmp = mkdtempSync(join(tmpdir(), 'ct-assets-mut-'));
  const fails = [];
  let caught = 0;
  try {
    // Копія лежить у тимчасовій теці, тож ROOT у ній підставляється явно: вона бачить ті самі assets/ і docs/.
    for (const code of CODES) {
      const re = new RegExp(`(// @check:${code}\\n)(\\s*)`);
      const text = src.replace(re, '$1$2if (false) ').replace("const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');", `const ROOT = ${JSON.stringify(ROOT)};`);
      const path = join(tmp, `mut-${code}.mjs`);
      writeFileSync(path, text);
      const r = spawnSync(process.execPath, [path, '--self-test'], { encoding: 'utf8' });
      const out = (r.stdout ?? '') + (r.stderr ?? '');
      if (r.status !== 0 && /SELF-TEST: FAILED \d+ of \d+/.test(out)) { caught++; console.log(`спіймано  вимкнено ${code}`); }
      else fails.push(`вимкнено ${code}: ${r.status === 0 ? 'самотест ЗЕЛЕНИЙ — мутація пережила' : 'самотест не дійшов до вердикту'}`);
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  for (const f of fails) console.log(`ПЕРЕЖИЛА  ${f}`);
  console.log(`ASSETS MUTATION: ${fails.length ? 'FAILED' : 'PASSED'} · спіймано ${caught} із ${CODES.length}`);
  return fails.length ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  if (argv.includes('--self-test')) process.exit(selfTest());
  if (argv.includes('--mutate')) process.exit(mutate());
  const inp = load();
  if (argv.includes('--write-json')) {
    const cr = creditsRows(inp.credits);
    if (!cr.ok) { console.log(`CREDITS_BAD_HEADER ${CREDITS}`); process.exit(1); }
    writeFileSync(join(ROOT, JSON_OUT), buildJson(cr.rows));
    inp.json = readFileSync(join(ROOT, JSON_OUT), 'utf8');
    console.log(`wrote ${JSON_OUT} (${cr.rows.length} files)`);
  }
  const found = check(inp);
  for (const f of found) console.log(`${f.code} ${f.where}: ${f.msg}`);
  const pngs = inp.files.filter((f) => /\.png$/i.test(f)).length;
  const rows = creditsRows(inp.credits);
  const lic = rows.ok ? Object.entries(rows.rows.reduce((m, r) => ({ ...m, [r.licence]: (m[r.licence] ?? 0) + 1 }), {})).map(([k, v]) => `${k}×${v}`).join(', ') : '?';
  console.log(found.length ? `ASSETS: FAILED ${found.length}` : `ASSETS: OK · ${pngs} PNG, ${rows.rows.length} рядків титрів (${lic}), ${registerRows(inp.register).length} рядків реєстру`);
  process.exit(found.length ? 1 : 0);
}

