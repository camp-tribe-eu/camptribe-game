#!/usr/bin/env node
// Сторож локалізації (GAME-26).
//   node scripts/i18n/check-i18n.mjs              — перевірити src/
//   node scripts/i18n/check-i18n.mjs --self-test  — довести, що кожна перевірка червоніє
// Токени беремо сканером TypeScript: коментарі (українською — норма коду) не рахуються,
// рядки й шаблони — рахуються. Тести (*.test.*) і файли локалізації — поза скануванням.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const CYR = /[Ѐ-ӿ]/;
export const CODES = ['CYRILLIC_LITERAL', 'LOCALE_KEYS_DIFFER', 'LOCALE_EMPTY_VALUE', 'NOTHING_SCANNED'];

const STRING_KINDS = new Set([
  ts.SyntaxKind.StringLiteral, ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead, ts.SyntaxKind.TemplateMiddle, ts.SyntaxKind.TemplateTail, ts.SyntaxKind.JsxText,
]);

/** Кириличні рядкові токени файлу. JSX-текст сканер віддає лише в режимі JSX — ходимо по AST. */
export function cyrillicLiterals(path, text) {
  const kind = path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind);
  const out = [];
  const visit = (node) => {
    if (STRING_KINDS.has(node.kind) && CYR.test(node.getText(sf))) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      out.push({ line: line + 1, text: node.getText(sf).slice(0, 60) });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

export function check(files, locales) {
  const found = [];
  if (files.length === 0) found.push({ code: 'NOTHING_SCANNED', where: 'src/', msg: 'жодного файлу — сканер нічого не бачить' });
  for (const { path, text } of files) {
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

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx|mts|cts)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

function load() {
  const files = walk(join(ROOT, 'src')).map((p) => ({ path: relative(ROOT, p), text: readFileSync(p, 'utf8') }));
  const locales = Object.fromEntries(['uk', 'en'].map((l) => [l, JSON.parse(readFileSync(join(ROOT, 'src/i18n', `${l}.json`), 'utf8'))]));
  return { files, locales };
}

function selfTest() {
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
  ];
  let failed = 0;
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
  console.log(`I18N SELF-TEST: ${failed ? 'FAILED' : 'PASSED'} ${cases.length - failed}/${cases.length} · кодів ${CODES.length}, доведено ${hit.size}`);
  return failed ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--self-test')) process.exit(selfTest());
  const { files, locales } = load();
  const found = check(files, locales);
  for (const x of found) console.log(`${x.code} ${x.where}: ${x.msg}`);
  console.log(found.length ? `I18N: FAILED ${found.length}` : `I18N: OK · файлів ${files.length}, ключів ${Object.keys(locales.uk).length} × ${Object.keys(locales).length} мови`);
  process.exit(found.length ? 1 : 0);
}
