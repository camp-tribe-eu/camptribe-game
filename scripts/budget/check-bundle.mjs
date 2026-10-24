#!/usr/bin/env node
// Сторож бюджету збірки (GAME-38). Межі — перші джерела YouTube Playables і рішення власника від 24.10:
//  * початковий пакет (усе, що вантажиться до готовності гри) — ЗАВЖДИ < 30 MiB (інакше FAIL), БАЖАНО < 15 MiB (інакше WARN).
//    dist/ — верхня межа початкового пакета (гра не довантажує нічого, чого немає в dist/);
//  * кожен файл — БАЖАНО < 512 KiB (WARN), ЗАВЖДИ < 30 MiB (FAIL);
//  * файлів ≤ 8000; кожен сегмент шляху — лише [A-Za-z0-9_.-]; шляхи відносні;
//  * HTML (index.html, spike.html) посилається лише на відносні URL: без початкового «/», «//» і схем http(s):.
// Запуск після `vite build`:
//   node scripts/budget/check-bundle.mjs [--dir dist]   — перевірити збірку, надрукувати справжні числа
//   node scripts/budget/check-bundle.mjs --self-test    — довести на синтетичних теках, що кожен код червоніє
//   node scripts/budget/check-bundle.mjs --mutate       — вимкнути кожну перевірку по черзі: самотест мусить упасти
// Код 0 — немає FAIL (WARN друкується, але не червонить); 1 — є FAIL; 2 — хибний аргумент. Порожня чи відсутня тека — FAIL (закон 4).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cli } from '../lib/cli.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const KiB = 1024;
const MiB = 1024 * KiB;
export const LIMITS = Object.freeze({
  totalWarn: 15 * MiB, totalFail: 30 * MiB, fileWarn: 512 * KiB, fileFail: 30 * MiB, maxFiles: 8000,
});
const SEGMENT = /^[A-Za-z0-9_.-]+$/;
export const CODES = ['TOTAL_FAIL', 'TOTAL_WARN', 'FILE_FAIL', 'FILE_WARN', 'FILE_COUNT', 'BAD_NAME', 'ABS_URL', 'EMPTY'];

/** Усі файли теки: { path: 'a/b.png' (з «/»), size }. */
export function listFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile()) out.push({ path: relative(dir, full).split(sep).join('/'), size: statSync(full).size });
    }
  };
  walk(dir);
  return out;
}

/** Посилання, що не є відносними: початковий «/», «//», схема (http:, https:, ftp: …); data: і #якір — не посилання на файл. */
export function badUrls(html) {
  const urls = [];
  for (const m of html.matchAll(/\b(?:src|href|poster|action)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) urls.push(m[1] ?? m[2]);
  for (const m of html.matchAll(/\bsrcset\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) for (const part of (m[1] ?? m[2]).split(',')) urls.push(part.trim().split(/\s+/)[0]);
  for (const m of html.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/gi)) urls.push(m[1] ?? m[2] ?? m[3]);
  return urls.filter((u) => u && !/^(data:|#)/i.test(u) && (/^\//.test(u) || /^[a-z][a-z0-9+.-]*:/i.test(u)));
}

/** Чиста перевірка: files — [{path,size}], htmls — { 'index.html': текст }. off — коди, вимкнені для режиму --mutate. */
export function check(files, htmls, off = new Set()) {
  const found = [];
  const add = (severity, code, where, msg) => { if (!off.has(code)) found.push({ severity, code, where, msg }); };
  const total = files.reduce((s, f) => s + f.size, 0);
  if (files.length === 0) add('FAIL', 'EMPTY', '.', 'у теці немає жодного файлу — вимір нічого не доводить');
  if (total >= LIMITS.totalFail) add('FAIL', 'TOTAL_FAIL', '.', `початковий пакет ${total} Б ≥ ${LIMITS.totalFail} Б (30 MiB)`);
  else if (total >= LIMITS.totalWarn) add('WARN', 'TOTAL_WARN', '.', `початковий пакет ${total} Б ≥ ${LIMITS.totalWarn} Б (15 MiB)`);
  if (files.length > LIMITS.maxFiles) add('FAIL', 'FILE_COUNT', '.', `${files.length} файлів > ${LIMITS.maxFiles}`);
  for (const f of files) {
    if (f.size >= LIMITS.fileFail) add('FAIL', 'FILE_FAIL', f.path, `${f.size} Б ≥ ${LIMITS.fileFail} Б (30 MiB)`);
    else if (f.size >= LIMITS.fileWarn) add('WARN', 'FILE_WARN', f.path, `${f.size} Б ≥ ${LIMITS.fileWarn} Б (512 KiB)`);
    const bad = f.path.split('/').filter((s) => !SEGMENT.test(s));
    if (bad.length) add('FAIL', 'BAD_NAME', f.path, `сегмент(и) ${JSON.stringify(bad)} поза [A-Za-z0-9_.-]`);
  }
  for (const [name, html] of Object.entries(htmls)) for (const u of badUrls(html)) add('FAIL', 'ABS_URL', name, `не відносне посилання: ${u.slice(0, 80)}`);
  return found;
}

function loadDir(dir) {
  const files = listFiles(dir);
  const htmls = {};
  for (const f of files) if (/^[^/]+\.html$/.test(f.path)) htmls[f.path] = readFileSync(join(dir, f.path), 'utf8');
  return { files, htmls };
}

const HTML_OK = '<!doctype html><link rel="icon" href="data:image/svg+xml,%3Csvg/%3E"><script type="module" src="./assets/a.js"></script><link href="./assets/b.css">';

/** Синтетичні теки: чиста й по одній зіпсованій на кожен код. Зіпсована мусить дати свій код (і FAIL, якщо код — не WARN), чиста — нічого. */
function selfTest(off = new Set()) {
  const base = mkdtempSync(join(tmpdir(), 'budget-'));
  let bad = 0;
  const build = (name, spec) => {
    const d = join(base, name);
    mkdirSync(join(d, 'assets'), { recursive: true });
    writeFileSync(join(d, 'index.html'), spec.html ?? HTML_OK);
    for (const [p, size] of Object.entries(spec.files ?? { 'assets/a.js': 1000 })) {
      mkdirSync(dirname(join(d, p)), { recursive: true });
      writeFileSync(join(d, p), Buffer.alloc(size));
    }
    return d;
  };
  const sized = (n, size) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`assets/p${i}.bin`, size]));
  const cases = [
    ['clean', build('clean', {}), null],
    ['file exactly 30 MiB', build('f30', { files: { 'assets/big.bin': LIMITS.fileFail } }), 'FILE_FAIL'],
    ['file 31 MiB', build('f31', { files: { 'assets/big.bin': 31 * MiB } }), 'FILE_FAIL'],
    ['total 31 MiB in 1 MiB files', build('t31', { files: sized(31, MiB) }), 'TOTAL_FAIL'],
    ['total 16 MiB in 400 KiB files (warn only)', build('t16', { files: sized(41, 400 * KiB) }), 'TOTAL_WARN'],
    ['file 600 KiB (warn only)', build('w600', { files: { 'assets/mid.bin': 600 * KiB } }), 'FILE_WARN'],
    ['8001 files', build('n8001', { files: Object.fromEntries(Array.from({ length: 8001 }, (_, i) => [`assets/f${i}.txt`, 0])) }), 'FILE_COUNT'],
    ['name with space', build('sp', { files: { 'assets/my file.png': 10 } }), 'BAD_NAME'],
    ['Cyrillic directory', build('cy', { files: { 'assets/мапа/a.png': 10 } }), 'BAD_NAME'],
    ['absolute src', build('abs', { html: '<script type="module" src="/assets/a.js"></script>' }), 'ABS_URL'],
    ['protocol-relative href', build('pr', { html: '<link href="//cdn.example/x.css">' }), 'ABS_URL'],
    ['https src', build('http', { html: '<img src="https://example.com/a.png">' }), 'ABS_URL'],
    ['absolute url() in <style>', build('cssurl', { html: "<style>@font-face{src:url('/fonts/a.ttf')}</style>" }), 'ABS_URL'],
    ['empty dir', (() => { const d = join(base, 'empty'); mkdirSync(d); return d; })(), 'EMPTY'],
  ];
  for (const [label, dir, want] of cases) {
    const { files, htmls } = loadDir(dir);
    const found = check(files, htmls, off);
    const codes = new Set(found.map((f) => f.code));
    const failing = found.some((f) => f.severity === 'FAIL');
    // Чиста тека — без знахідок; зіпсована — свій код; FAIL лише для кодів, що не є WARN (попередження не червонять).
    const ok = want === null ? found.length === 0 : codes.has(want) && failing === !/WARN$/.test(want);
    if (!ok) { bad++; console.log(`SELFTEST FAIL «${label}»: очікували ${want ?? 'чисто'}, є [${[...codes].join(', ')}], FAIL=${failing}`); }
  }
  rmSync(base, { recursive: true, force: true });
  console.log(bad ? `SELFTEST: ${bad} з ${cases.length} випадків не збіглися` : `SELFTEST: OK · ${cases.length} синтетичних тек (кожен код червоніє, чиста — ні)`);
  return bad ? 1 : 0;
}

/** Мутація: вимикаємо код — самотест мусить упасти (інакше перевірка нічого не стереже). */
function mutate() {
  const self = fileURLToPath(import.meta.url);
  if (spawnSync(process.execPath, [self, '--self-test'], { encoding: 'utf8' }).status !== 0) { console.log('MUTATE: чистий самотест уже червоний'); return 1; }
  let bad = 0;
  for (const code of CODES) {
    const r = spawnSync(process.execPath, [self, '--self-test'], { encoding: 'utf8', env: { ...process.env, BUDGET_MUTATE_OFF: code } });
    const red = r.status !== 0;
    console.log(`${red ? 'OK  ' : 'FAIL'} вимкнено ${code} → самотест ${red ? 'червоний' : 'ЗЕЛЕНИЙ (перевірка нічого не стереже)'}`);
    if (!red) bad++;
  }
  console.log(bad ? `MUTATE: FAILED ${bad}` : `MUTATE: OK · ${CODES.length} перевірок, кожна червоніє при вимкненні`);
  return bad ? 1 : 0;
}

const mib = (n) => `${(n / MiB).toFixed(2)} MiB`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = cli({ flags: ['self-test', 'mutate'], options: ['dir'] });
  const off = new Set((process.env.BUDGET_MUTATE_OFF ?? '').split(',').filter(Boolean));
  if (args['self-test']) process.exit(selfTest(off));
  if (args.mutate) process.exit(mutate());
  const dir = args.dir ? resolve(process.cwd(), args.dir) : join(ROOT, 'dist');
  if (!existsSync(dir) || !statSync(dir).isDirectory()) { console.log(`EMPTY ${dir}: теки немає — спершу \`npm run build\``); process.exit(1); }
  const { files, htmls } = loadDir(dir);
  const found = check(files, htmls);
  for (const f of found) console.log(`${f.severity} ${f.code} ${f.where}: ${f.msg}`);
  const total = files.reduce((s, f) => s + f.size, 0);
  const largest = files.reduce((m, f) => (f.size > m.size ? f : m), { path: '-', size: 0 });
  const over = files.filter((f) => f.size >= LIMITS.fileWarn).length;
  const fails = found.filter((f) => f.severity === 'FAIL').length;
  const warns = found.length - fails;
  console.log(`BUDGET: ${fails ? `FAILED ${fails}` : 'OK'} · разом ${total} Б (${mib(total)}; WARN ≥ 15, FAIL ≥ 30), найбільший ${largest.path} ${largest.size} Б (${(largest.size / KiB).toFixed(1)} KiB), файлів ${files.length} (≤ ${LIMITS.maxFiles}), ≥ 512 KiB: ${over}, WARN ${warns}`);
  process.exit(fails ? 1 : 0);
}
