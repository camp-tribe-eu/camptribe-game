#!/usr/bin/env node
// Сторож бюджету збірки (GAME-38). Пороги — ЛИШЕ з budgets.json у корені (єдине джерело; нема ключа чи файл битий — FAIL BUDGETS,
// а не тихий дефолт). Межі — перші джерела YouTube Playables і рішення власника від 24.10:
//  * початковий пакет (усе, що вантажиться до готовності гри) — ЗАВЖДИ < 30 MiB (інакше FAIL), БАЖАНО < 15 MiB (інакше WARN).
//    dist/ — верхня межа початкового пакета (гра не довантажує нічого, чого немає в dist/);
//  * кожен файл — БАЖАНО < 512 KiB (WARN), ЗАВЖДИ < 30 MiB (FAIL);
//  * сумарний JS у assets/*.js < jsFailBytes (FAIL JS_FAIL): ловить +2 МБ коду (негативний контроль картки); графіка сюди не входить;
//  * файлів ≤ 8000; кожен сегмент шляху — лише [A-Za-z0-9_.-]; шляхи відносні;
//  * HTML (index.html, spike.html) посилається лише на відносні URL: без початкового «/», «//» і схем http(s):.
//    Межа: читаються лише кореневі *.html (атрибути й url() у <style>); абсолютні URL усередині .js/.css НЕ бачить —
//    їх стереже vite base './' і рецензія; заборону зовнішніх запитів у YouTube-збірці перевіряє окрема картка.
//  * dist/ містить і spike.html зі spike/ (~100 KiB), що до готовності гри не вантажаться: межа консервативна, зайве
//    рахується, а не пропускається.
// Запуск після `vite build`:
//   node scripts/budget/check-bundle.mjs [--dir dist] [--budgets budgets.json] — перевірити збірку, надрукувати справжні числа
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
const mib = (n) => `${(n / MiB).toFixed(2)} MiB`;
const SEGMENT = /^[A-Za-z0-9_.-]+$/;
export const CODES = ['TOTAL_FAIL', 'TOTAL_WARN', 'FILE_FAIL', 'FILE_WARN', 'FILE_COUNT', 'JS_FAIL', 'BAD_NAME', 'ABS_URL', 'EMPTY', 'BUDGETS'];
const OFF = new Set((process.env.BUDGET_MUTATE_OFF ?? '').split(',').filter(Boolean));

/** Ключі budgets.json: кожен — { value: ціле > 0, why: непорожній рядок }. Читають і e2e (game-38, game-97), тож тут перевіряємо всі. */
export const BUDGET_KEYS = ['totalWarnBytes', 'totalFailBytes', 'fileWarnBytes', 'fileFailBytes', 'maxFiles', 'jsFailBytes', 'firstFrameMaxMs', 'fpsMedianMin', 'fpsSamples'];

/** Читає budgets.json і кидає помилку, якщо файл битий, ключа нема, value не ціле > 0 чи why порожній. off.has('BUDGETS') — мутація: без перевірок. */
export function loadBudgets(path, off = OFF) {
  const skip = off.has('BUDGETS');
  let raw;
  try { raw = JSON.parse(readFileSync(path, 'utf8')); } catch (e) { if (skip) return {}; throw new Error(`${path}: не читається як JSON — ${e.message}`); }
  const out = {};
  for (const k of BUDGET_KEYS) {
    const e = raw?.[k];
    if (!skip) {
      if (e === undefined) throw new Error(`${path}: немає ключа «${k}»`);
      if (!Number.isSafeInteger(e?.value) || e.value <= 0) throw new Error(`${path}: «${k}.value» має бути цілим > 0, є ${JSON.stringify(e?.value)}`);
      if (typeof e.why !== 'string' || e.why.trim() === '') throw new Error(`${path}: «${k}.why» порожній — поріг без ціни хибного спрацювання (закон 5)`);
    }
    out[k] = e?.value;
  }
  if (!skip && (out.totalWarnBytes >= out.totalFailBytes || out.fileWarnBytes >= out.fileFailBytes)) throw new Error(`${path}: WARN-поріг не менший за FAIL-поріг`);
  return out;
}

const BUDGETS_PATH = join(ROOT, 'budgets.json');
const toLimits = (b) => Object.freeze({ totalWarn: b.totalWarnBytes, totalFail: b.totalFailBytes, fileWarn: b.fileWarnBytes, fileFail: b.fileFailBytes, maxFiles: b.maxFiles, jsFail: b.jsFailBytes });
/** Межі в байтах із budgets.json; ставить CLI (битий файл — FAIL BUDGETS і код 1 ще до будь-якої перевірки). */
let LIMITS = null;
/** Сумарний JS: лише assets/*.js (без підтек) — код, що вантажиться; графіка росте з контентом і має свої межі. */
export const isJs = (path) => /^assets\/[^/]+\.js$/.test(path);

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
export function check(files, htmls, off = new Set(), limits = LIMITS) {
  const LIMITS = limits;
  const found = [];
  const add = (severity, code, where, msg) => { if (!off.has(code)) found.push({ severity, code, where, msg }); };
  const total = files.reduce((s, f) => s + f.size, 0);
  if (files.length === 0) add('FAIL', 'EMPTY', '.', 'у теці немає жодного файлу — вимір нічого не доводить');
  if (total >= LIMITS.totalFail) add('FAIL', 'TOTAL_FAIL', '.', `початковий пакет ${total} Б ≥ ${LIMITS.totalFail} Б (${mib(LIMITS.totalFail)})`);
  else if (total >= LIMITS.totalWarn) add('WARN', 'TOTAL_WARN', '.', `початковий пакет ${total} Б ≥ ${LIMITS.totalWarn} Б (${mib(LIMITS.totalWarn)})`);
  if (files.length > LIMITS.maxFiles) add('FAIL', 'FILE_COUNT', '.', `${files.length} файлів > ${LIMITS.maxFiles}`);
  const js = files.filter((f) => isJs(f.path)).reduce((s, f) => s + f.size, 0);
  if (js >= LIMITS.jsFail) add('FAIL', 'JS_FAIL', 'assets/*.js', `сумарний JS ${js} Б ≥ ${LIMITS.jsFail} Б (budgets.json jsFailBytes)`);
  for (const f of files) {
    if (f.size >= LIMITS.fileFail) add('FAIL', 'FILE_FAIL', f.path, `${f.size} Б ≥ ${LIMITS.fileFail} Б (${mib(LIMITS.fileFail)})`);
    else if (f.size >= LIMITS.fileWarn) add('WARN', 'FILE_WARN', f.path, `${f.size} Б ≥ ${LIMITS.fileWarn} Б (${(LIMITS.fileWarn / KiB).toFixed(0)} KiB)`);
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
const HTML_BYTES = Buffer.byteLength(HTML_OK);

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
  const many = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`assets/f${i}.txt`, 0]));
  const sized = (n, size) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`assets/p${i}.bin`, size]));
  const cases = [
    ['clean', build('clean', {}), null],
    ['file exactly 30 MiB', build('f30', { files: { 'assets/big.bin': LIMITS.fileFail } }), 'FILE_FAIL'],
    ['file 31 MiB', build('f31', { files: { 'assets/big.bin': 31 * MiB } }), 'FILE_FAIL'],
    ['total 31 MiB in 1 MiB files', build('t31', { files: sized(31, MiB) }), 'TOTAL_FAIL'],
    ['total 16 MiB in 400 KiB files (warn only)', build('t16', { files: sized(41, 400 * KiB) }), 'TOTAL_WARN'],
    ['file 600 KiB (warn only)', build('w600', { files: { 'assets/mid.bin': 600 * KiB } }), 'FILE_WARN'],
    // Рівно на межі й на байт/файл нижче (рецензія PR #52: без цього зсув порога на одиницю лишався зеленим).
    // index.html — теж файл пакета: його розмір і його самого враховано.
    ['8001 files with index.html', build('n8001', { files: many(LIMITS.maxFiles) }), 'FILE_COUNT'],
    ['8000 files with index.html', build('n8000', { files: many(LIMITS.maxFiles - 1) }), null, 'FILE_COUNT'],
    ['file exactly 512 KiB', build('w512', { files: { 'assets/mid.bin': LIMITS.fileWarn } }), 'FILE_WARN'],
    ['file 512 KiB − 1', build('w511', { files: { 'assets/mid.bin': LIMITS.fileWarn - 1 } }), null],
    ['file 30 MiB − 1', build('f30m', { files: { 'assets/big.bin': LIMITS.fileFail - 1 } }), 'TOTAL_FAIL', 'FILE_FAIL'],
    ['total exactly 30 MiB', build('t30', { files: { 'assets/big.bin': LIMITS.totalFail - HTML_BYTES } }), 'TOTAL_FAIL'],
    ['total 30 MiB − 1', build('t30m', { files: { 'assets/big.bin': LIMITS.totalFail - HTML_BYTES - 1 } }), 'TOTAL_WARN', 'TOTAL_FAIL'],
    ['total exactly 15 MiB', build('t15', { files: { 'assets/big.bin': LIMITS.totalWarn - HTML_BYTES } }), 'TOTAL_WARN'],
    ['total 15 MiB − 1', build('t15m', { files: { 'assets/big.bin': LIMITS.totalWarn - HTML_BYTES - 1 } }), 'FILE_WARN', 'TOTAL_WARN'],
    // JS_FAIL: рівно на межі й на байт нижче; негативний контроль картки (+2 000 000 Б у pad-*.js до коду розміру 24.10); PNG не рахується.
    ['js exactly jsFail', build('j0', { files: { 'assets/a.js': LIMITS.jsFail } }), 'JS_FAIL'],
    ['js jsFail − 1', build('j1', { files: { 'assets/a.js': LIMITS.jsFail - 1 } }), 'FILE_WARN', 'JS_FAIL'],
    ['js split across files, sum = jsFail', build('j2', { files: { 'assets/a.js': LIMITS.jsFail - 1000, 'assets/b.js': 1000 } }), 'JS_FAIL'],
    ['card: code of 24.10 + 2 000 000 B pad-x.js', build('jpad', { files: { 'assets/phaser.js': 1_367_759, 'assets/main.js': 165_160, 'assets/pad-x.js': 2_000_000 } }), 'JS_FAIL'],
    ['png bigger than jsFail is not JS', build('jpng', { files: { 'assets/a.js': 1000, 'assets/big.png': LIMITS.jsFail + MiB } }), 'FILE_WARN', 'JS_FAIL'],
    ['name with space', build('sp', { files: { 'assets/my file.png': 10 } }), 'BAD_NAME'],
    ['Cyrillic directory', build('cy', { files: { 'assets/мапа/a.png': 10 } }), 'BAD_NAME'],
    ['absolute src', build('abs', { html: '<script type="module" src="/assets/a.js"></script>' }), 'ABS_URL'],
    ['protocol-relative href', build('pr', { html: '<link href="//cdn.example/x.css">' }), 'ABS_URL'],
    ['https src', build('http', { html: '<img src="https://example.com/a.png">' }), 'ABS_URL'],
    ['absolute url() in <style>', build('cssurl', { html: "<style>@font-face{src:url('/fonts/a.ttf')}</style>" }), 'ABS_URL'],
    ['empty dir', (() => { const d = join(base, 'empty'); mkdirSync(d); return d; })(), 'EMPTY'],
  ];
  // BUDGETS: битий budgets.json мусить кидати помилку, справжній — ні.
  const goodRaw = JSON.parse(readFileSync(BUDGETS_PATH, 'utf8'));
  const bcases = [
    ['budgets: broken JSON', '{ "totalWarnBytes": ', true],
    ['budgets: missing jsFailBytes', JSON.stringify({ ...goodRaw, jsFailBytes: undefined }), true],
    ['budgets: value is a string', JSON.stringify({ ...goodRaw, fpsSamples: { value: '5', why: 'x' } }), true],
    ['budgets: value 0', JSON.stringify({ ...goodRaw, fpsMedianMin: { value: 0, why: 'x' } }), true],
    ['budgets: empty why', JSON.stringify({ ...goodRaw, jsFailBytes: { value: 1, why: ' ' } }), true],
    ['budgets: warn ≥ fail', JSON.stringify({ ...goodRaw, totalWarnBytes: { ...goodRaw.totalFailBytes } }), true],
    ['budgets: repository file', JSON.stringify(goodRaw), false],
  ];
  for (const [label, text, wantThrow] of bcases) {
    const p = join(base, 'budgets.json');
    writeFileSync(p, text);
    let threw = false;
    try { loadBudgets(p, off); } catch { threw = true; }
    if (threw !== wantThrow) { bad++; console.log(`SELFTEST FAIL «${label}»: очікували ${wantThrow ? 'помилку' : 'без помилки'}, є ${threw ? 'помилка' : 'без помилки'}`); }
  }
  for (const [label, dir, want, absent] of cases) {
    const { files, htmls } = loadDir(dir);
    const found = check(files, htmls, off);
    const codes = new Set(found.map((f) => f.code));
    const failing = found.some((f) => f.severity === 'FAIL');
    // Чиста тека — без знахідок; зіпсована — свій код; FAIL лише для кодів, що не є WARN (попередження не червонять).
    // absent — код, якого тут бути НЕ може (випадок на байт/файл нижче межі).
    const ok = (want === null ? (absent ? !codes.has(absent) : found.length === 0) : codes.has(want) && failing === !/WARN$/.test(want)) && !(absent && codes.has(absent));
    if (!ok) { bad++; console.log(`SELFTEST FAIL «${label}»: очікували ${want ?? 'чисто'}, є [${[...codes].join(', ')}], FAIL=${failing}`); }
  }
  rmSync(base, { recursive: true, force: true });
  const n = cases.length + bcases.length;
  console.log(bad ? `SELFTEST: ${bad} з ${n} випадків не збіглися` : `SELFTEST: OK · ${cases.length} синтетичних тек + ${bcases.length} варіантів budgets.json (кожен код червоніє, чиста — ні)`);
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = cli({ flags: ['self-test', 'mutate'], options: ['dir', 'budgets'] });
  const off = OFF;
  // Пороги — до будь-якої перевірки: без них вимір нічого не доводить (закон 4). Самотест бере межі зі справжнього budgets.json.
  try { LIMITS = toLimits(loadBudgets(args.budgets ? resolve(process.cwd(), args.budgets) : BUDGETS_PATH, off)); } catch (e) { console.log(`FAIL BUDGETS ${e.message}`); process.exit(1); }
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
  const js = files.filter((f) => isJs(f.path)).reduce((s, f) => s + f.size, 0);
  const fails = found.filter((f) => f.severity === 'FAIL').length;
  const warns = found.length - fails;
  console.log(`BUDGET: ${fails ? `FAILED ${fails}` : 'OK'} · разом ${total} Б (${mib(total)}; WARN ≥ ${mib(LIMITS.totalWarn)}, FAIL ≥ ${mib(LIMITS.totalFail)}), JS ${js} Б (FAIL ≥ ${LIMITS.jsFail} Б, запас ${LIMITS.jsFail - js} Б), найбільший ${largest.path} ${largest.size} Б (${(largest.size / KiB).toFixed(1)} KiB), файлів ${files.length} (≤ ${LIMITS.maxFiles}), ≥ ${(LIMITS.fileWarn / KiB).toFixed(0)} KiB: ${over}, WARN ${warns}`);
  process.exit(fails ? 1 : 0);
}
