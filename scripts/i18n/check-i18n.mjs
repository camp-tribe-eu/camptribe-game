#!/usr/bin/env node
// Сторож локалізації (GAME-26).
//   node scripts/i18n/check-i18n.mjs              — перевірити src/
//   node scripts/i18n/check-i18n.mjs --self-test  — довести, що кожна перевірка червоніє
// Токени беремо сканером TypeScript: коментарі (українською — норма коду) не рахуються,
// рядки й шаблони — рахуються за ЗНАЧЕННЯМ токена (node.text), тож '\u041f' — теж кирилиця.
// Скануються .ts/.tsx/.mts/.cts/.js/.jsx/.mjs/.cjs і JSON під src/ (крім src/i18n/*.json — це
// словники, їх звіряє LOCALE_*). Тести (*.test.*) і .d.ts — поза скануванням.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { cli } from '../lib/cli.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const CYR = /[Ѐ-ӿ]/;
export const CODES = ['CYRILLIC_LITERAL', 'CYRILLIC_JSON', 'JSON_INVALID', 'LOCALE_KEYS_DIFFER', 'LOCALE_EMPTY_VALUE', 'NOTHING_SCANNED'];

const STRING_KINDS = new Set([
  ts.SyntaxKind.StringLiteral, ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead, ts.SyntaxKind.TemplateMiddle, ts.SyntaxKind.TemplateTail, ts.SyntaxKind.JsxText,
]);

/** Кириличні рядкові токени файлу. JSX-текст сканер віддає лише в режимі JSX — ходимо по AST. */
export function cyrillicLiterals(path, text) {
  const js = /\.(js|jsx|mjs|cjs)$/.test(path);
  const jsx = /\.(tsx|jsx)$/.test(path);
  const kind = js ? (jsx ? ts.ScriptKind.JSX : ts.ScriptKind.JS) : (jsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind);
  const out = [];
  const visit = (node) => {
    // node.text — розкодоване значення («\u041f» → «П»); запис у коді теж перевіряємо.
    if (STRING_KINDS.has(node.kind) && (CYR.test(node.text ?? '') || CYR.test(node.getText(sf)))) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      out.push({ line: line + 1, text: node.getText(sf).slice(0, 60) });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** Кириличні рядкові значення JSON (ключі теж): [{ at: шлях усередині, text }]. JSON.parse розкодовує \u. */
export function cyrillicJson(text) {
  const out = [];
  const visit = (v, at) => {
    if (typeof v === 'string') { if (CYR.test(v)) out.push({ at, text: v.slice(0, 60) }); return; }
    if (Array.isArray(v)) { v.forEach((x, i) => visit(x, `${at}[${i}]`)); return; }
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (CYR.test(k)) out.push({ at: `${at}.${k}`, text: `ключ ${k}` }); visit(x, `${at}.${k}`); }
  };
  visit(JSON.parse(text), '$');
  return out;
}

export function check(files, locales) {
  const found = [];
  if (files.length === 0) found.push({ code: 'NOTHING_SCANNED', where: 'src/', msg: 'жодного файлу — сканер нічого не бачить' });
  for (const { path, text } of files) {
    if (path.endsWith('.json')) {
      let hits;
      try { hits = cyrillicJson(text); } catch (e) { found.push({ code: 'JSON_INVALID', where: path, msg: `не розібрано — не перевірено: ${e.message}` }); continue; }
      for (const h of hits) found.push({ code: 'CYRILLIC_JSON', where: `${path} ${h.at}`, msg: h.text });
      continue;
    }
    for (const lit of cyrillicLiterals(path, text)) found.push({ code: 'CYRILLIC_LITERAL', where: `${path}:${lit.line}`, msg: lit.text });
  }
  const langs = Object.keys(locales);
  const ref = Object.keys(locales[langs[0]] ?? {}).sort().join('|');
  for (const l of langs) {
    if (Object.keys(locales[l]).sort().join('|') !== ref) found.push({ code: 'LOCALE_KEYS_DIFFER', where: `i18n/${l}.json`, msg: 'набір ключів відрізняється' });
    for (const [k, v] of Object.entries(locales[l])) if (typeof v !== 'string' || !v.trim()) found.push({ code: 'LOCALE_EMPTY_VALUE', where: `i18n/${l}.json ${k}`, msg: 'порожньо' });
  }
  return found;
}

/** Чи сканувати файл (шлях відносно кореня, через «/»). */
export function scanned(rel) {
  const name = rel.split('/').pop();
  if (/^src\/i18n\/[^/]+\.json$/.test(rel)) return false;
  if (name.endsWith('.json')) return true;
  return /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(name) && !/\.test\.[cm]?[jt]sx?$/.test(name) && !/\.d\.[cm]?ts$/.test(name);
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (scanned(relative(ROOT, p).split('\\').join('/'))) out.push(p);
  }
  return out;
}

function load() {
  const files = walk(join(ROOT, 'src')).map((p) => ({ path: relative(ROOT, p), text: readFileSync(p, 'utf8') }));
  const locales = Object.fromEntries(['uk', 'en'].map((l) => [l, JSON.parse(readFileSync(join(ROOT, 'src/i18n', `${l}.json`), 'utf8'))]));
  return { files, locales };
}

function selfTest() {
  let failed = 0;
  const okLoc = { uk: { a: 'Так' }, en: { a: 'Yes' } };
  const f = (text, path = 'src/x.ts') => [{ path, text }];
  const cases = [
    ['позитивний контроль: коментар українською, код англійською', f('// Пауза — коментар\n/* ще коментар */\nexport const a = "Pause";\n'), okLoc, ''],
    ['кириличний рядок', f("export const a = 'Пауза';\n"), okLoc, 'CYRILLIC_LITERAL'],
    ['кирилиця в шаблоні', f('export const a = (n: number) => `Пауза ${n} хв`;\n'), okLoc, 'CYRILLIC_LITERAL'],
    ['кирилиця в JSX-тексті', f('export const A = () => <b>Пауза</b>;\n', 'src/x.tsx'), okLoc, 'CYRILLIC_LITERAL'],
    ['кирилиця в повідомленні помилки', f("throw new Error('шар відсутній');\n"), okLoc, 'CYRILLIC_LITERAL'],
    ['ключі мов розходяться', f('export {};\n'), { uk: { a: 'Так', b: 'Ні' }, en: { a: 'Yes' } }, 'LOCALE_KEYS_DIFFER'],
    ['порожній переклад', f('export {};\n'), { uk: { a: 'Так' }, en: { a: ' ' } }, 'LOCALE_EMPTY_VALUE'],
    ['сканер нічого не бачить', [], okLoc, 'NOTHING_SCANNED'],
    // (a) значення токена, а не його запис у коді
    ['кирилиця через \\u-екранування в рядку', f("export const a = '\\u041f\\u0430\\u0443\\u0437\\u0430';\n"), okLoc, 'CYRILLIC_LITERAL'],
    ['кирилиця через \\u{…} у шаблоні', f('export const a = (n: number) => `\\u{41f} ${n}`;\n'), okLoc, 'CYRILLIC_LITERAL'],
    ['кирилиця через \\u-екранування в хвості шаблону', f('export const a = (n: number) => `${n} \\u0445\\u0432`;\n'), okLoc, 'CYRILLIC_LITERAL'],
    // (b) JS-файли
    ['кирилиця в .mjs', f("export const a = 'Пауза';\n", 'src/x.mjs'), okLoc, 'CYRILLIC_LITERAL'],
    ['кирилиця в JSX-тексті .jsx', f('export const A = () => <b>Пауза</b>;\n', 'src/x.jsx'), okLoc, 'CYRILLIC_LITERAL'],
    // (c) JSON поза src/i18n/*.json
    ['кирилиця в значенні JSON', f('{"a": {"b": ["ok", "Пауза"]}}', 'src/content/x.json'), okLoc, 'CYRILLIC_JSON'],
    ['кирилиця в JSON через \\u-екранування', f('{"a": "\\u041f"}', 'src/content/x.json'), okLoc, 'CYRILLIC_JSON'],
    ['JSON, що не розбирається', f('{"a": ', 'src/content/x.json'), okLoc, 'JSON_INVALID'],
    ['позитивний контроль: JSON без кирилиці', f('{"a": ["Pause", 1, null]}', 'src/content/x.json'), okLoc, ''],
    // (d) коментарі звільнені, і з екрануванням теж
    ['позитивний контроль: кирилиця й \\u-екранування лише в коментарях', f("// 'Пауза' \\u041f\n/* `\\u0445в` */\nexport const a = 'Pause'; // ще 'Пауза'\n"), okLoc, ''],
  ];
  // (b)(c) що бере обхід src/
  const walkCases = [
    ['src/a.ts', true], ['src/a.tsx', true], ['src/a.js', true], ['src/a.mjs', true], ['src/a.cjs', true], ['src/a.jsx', true],
    ['src/content/e.json', true], ['src/i18n/deep/x.json', true],
    ['src/i18n/uk.json', false], ['src/i18n/en.json', false], ['src/a.test.ts', false], ['src/a.test.js', false], ['src/env.d.ts', false], ['src/a.css', false],
  ];
  for (const [p, want] of walkCases) {
    const ok = scanned(p) === want;
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} обхід: ${p} ${want ? 'сканується' : 'поза скануванням'}`);
  }
  const hit = new Set();
  for (const [name, files, loc, want] of cases) {
    const got = [...new Set(check(files, loc).map((x) => x.code))].sort().join(',');
    got.split(',').filter(Boolean).forEach((c) => hit.add(c));
    const ok = got === want;
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` — очікувалось [${want}], отримано [${got}]`}`);
  }
  const unproven = CODES.filter((c) => !hit.has(c));
  if (unproven.length) { failed++; console.log(`FAIL коди без прикладу: ${unproven.join(', ')}`); }
  const total = cases.length + walkCases.length;
  console.log(`I18N SELF-TEST: ${failed ? 'FAILED' : 'PASSED'} ${total - failed}/${total} · кодів ${CODES.length}, доведено ${hit.size}`);
  return failed ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  cli({ flags: ['self-test'] });
  if (process.argv.includes('--self-test')) process.exit(selfTest());
  const { files, locales } = load();
  const found = check(files, locales);
  for (const x of found) console.log(`${x.code} ${x.where}: ${x.msg}`);
  console.log(found.length ? `I18N: FAILED ${found.length}` : `I18N: OK · файлів ${files.length}, ключів ${Object.keys(locales.uk).length} × ${Object.keys(locales).length} мови`);
  process.exit(found.length ? 1 : 0);
}
