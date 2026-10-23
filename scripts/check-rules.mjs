#!/usr/bin/env node
// Сторож документів правил (GAME-20): CORE_RULES, SIMULATION_RULES, DATA_CONTRACTS, OPEN_QUESTIONS.
//   node scripts/check-rules.mjs              — перевірити docs/
//   node scripts/check-rules.mjs --self-test  — довести, що кожна перевірка червоніє
// Без залежностей. Порожній розбір — помилка, а не зелене (закон 4).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SCHEMAS } from './validator/schema.mjs';
import { cli } from './lib/cli.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Мінімум рядків на файл: менше — розбір зламався, а не правил поменшало.
const FILES = {
  'docs/CORE_RULES.md': { prefix: 'CR-', min: 40 },
  'docs/SIMULATION_RULES.md': { prefix: 'SIM-', min: 40 },
  'docs/DATA_CONTRACTS.md': { prefix: 'DC-', min: 30 },
  'docs/OPEN_QUESTIONS.md': { prefix: 'OQ-', min: 10 },
};
const RULE_STATUS = new Set(['ACCEPTED', 'PROPOSED']);
const OQ_STATUS = ['OPEN', 'INVESTIGATING', 'DECIDED', 'VERIFIED', 'BLOCKED'];
const OQ_OWNERS = new Set(['власник', 'чат Сайту', 'чат Гри']);

export const CODES = [
  'RULES_TOO_FEW', 'RULE_ID_DUPLICATE', 'RULE_ID_PREFIX', 'RULE_NO_SOURCE', 'RULE_BAD_STATUS',
  'OQ_BAD_OWNER', 'OQ_BAD_STATUS', 'OQ_BAD_DATE', 'DC_UNKNOWN_COLLECTION', 'DC_SCHEMA_UNDOCUMENTED',
];

// Рядок таблиці, перша клітинка якого — id у формі ABC-001 / SIM-TIME-001.
function rows(text) {
  const out = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^\|\s*([A-Z]+(?:-[A-Z0-9]+)*-\d{3})\s*\|(.*)\|\s*$/);
    if (m) out.push({ id: m[1], cells: m[2].split('|').map((c) => c.trim()) });
  }
  return out;
}

export function check(docs, schemaKeys) {
  const found = [];
  const seen = new Map();
  for (const [file, { prefix, min }] of Object.entries(FILES)) {
    const rs = rows(docs[file] ?? '');
    if (rs.length < min) found.push({ code: 'RULES_TOO_FEW', where: file, msg: `${rs.length} < ${min}` });
    for (const r of rs) {
      if (seen.has(r.id)) found.push({ code: 'RULE_ID_DUPLICATE', where: `${file} ${r.id}`, msg: `уже в ${seen.get(r.id)}` });
      else seen.set(r.id, file);
      if (!r.id.startsWith(prefix)) found.push({ code: 'RULE_ID_PREFIX', where: `${file} ${r.id}`, msg: `очікується ${prefix}` });
      const status = r.cells.at(-1 - (prefix === 'OQ-' ? 1 : 0)) ?? '';
      if (prefix === 'OQ-') {
        const [, , , , owner, , date] = r.cells;
        if (!OQ_OWNERS.has(owner)) found.push({ code: 'OQ_BAD_OWNER', where: r.id, msg: owner });
        if (!OQ_STATUS.some((s) => status === s || status.startsWith(`${s} `))) found.push({ code: 'OQ_BAD_STATUS', where: r.id, msg: status });
        if (!/^\d{2}\.\d{2}\.\d{4}$/.test(date ?? '')) found.push({ code: 'OQ_BAD_DATE', where: r.id, msg: String(date) });
        continue;
      }
      const source = r.cells.at(-2) ?? '';
      if (!source) found.push({ code: 'RULE_NO_SOURCE', where: r.id, msg: 'порожнє джерело' });
      if (!RULE_STATUS.has(status)) found.push({ code: 'RULE_BAD_STATUS', where: r.id, msg: status });
    }
  }
  // DC-001…019 — визначення content/: колекція в першій клітинці мусить існувати в SCHEMAS, і навпаки.
  const defs = rows(docs['docs/DATA_CONTRACTS.md'] ?? '').filter((r) => Number(r.id.slice(3)) < 20);
  const documented = new Set();
  for (const r of defs) {
    const name = (r.cells[0].match(/`([a-zA-Z]+)`/) ?? [])[1];
    if (!name || !schemaKeys.includes(name)) found.push({ code: 'DC_UNKNOWN_COLLECTION', where: r.id, msg: r.cells[0] });
    else documented.add(name);
  }
  for (const k of schemaKeys) {
    if (!documented.has(k)) found.push({ code: 'DC_SCHEMA_UNDOCUMENTED', where: 'scripts/validator/schema.mjs', msg: k });
  }
  return found;
}

function load() {
  return Object.fromEntries(Object.keys(FILES).map((f) => [f, readFileSync(join(ROOT, f), 'utf8')]));
}

function selfTest() {
  const base = load();
  const keys = Object.keys(SCHEMAS);
  const codesOf = (docs, k = keys) => [...new Set(check(docs, k).map((f) => f.code))].sort().join(',');
  const edit = (file, from, to) => {
    if (!base[file].includes(from)) throw new Error(`самотест: еталонний рядок зник з ${file}: ${from}`);
    return { ...base, [file]: base[file].replace(from, to) };
  };
  const C = 'docs/CORE_RULES.md', S = 'docs/SIMULATION_RULES.md', D = 'docs/DATA_CONTRACTS.md', O = 'docs/OPEN_QUESTIONS.md';
  const cases = [
    ['позитивний контроль: справжні docs/', base, ''],
    ['дубль id між файлами', edit(S, '| SIM-TIME-001 |', '| CR-001 |'), 'RULE_ID_DUPLICATE,RULE_ID_PREFIX'],
    ['чужий префікс', edit(C, '| CR-070 |', '| SIM-ZZZ-070 |'), 'RULE_ID_PREFIX'],
    ['порожнє джерело', edit(C, '| GDD Core Rules §11; закон 1 | ACCEPTED |', '|  | ACCEPTED |'), 'RULE_NO_SOURCE'],
    ['невідомий статус', edit(C, '| GDD Core Rules §11; закон 1 | ACCEPTED |', '| GDD Core Rules §11; закон 1 | MAYBE |'), 'RULE_BAD_STATUS'],
    ['невідомий адресат', edit(O, '| чат Сайту | OPEN | 22.10.2026 |', '| сусід | OPEN | 22.10.2026 |'), 'OQ_BAD_OWNER'],
    ['невідомий статус питання', edit(O, '| чат Сайту | OPEN | 22.10.2026 |', '| чат Сайту | DONE | 22.10.2026 |'), 'OQ_BAD_STATUS'],
    ['дата не в форматі', edit(O, '| чат Сайту | OPEN | 22.10.2026 |', '| чат Сайту | OPEN | вчора |'), 'OQ_BAD_DATE'],
    ['контракт на неіснуючу колекцію', edit(D, '| DC-009 | `events` |', '| DC-009 | `happenings` |'), 'DC_SCHEMA_UNDOCUMENTED,DC_UNKNOWN_COLLECTION'],
    ['колекція в коді без контракту', base, 'DC_SCHEMA_UNDOCUMENTED', [...keys, 'weather']],
    ['розбір нічого не знайшов', { ...base, [S]: '' }, 'RULES_TOO_FEW'],
  ];
  let failed = 0;
  const hit = new Set();
  for (const [name, docs, want, k] of cases) {
    const got = codesOf(docs, k);
    got.split(',').filter(Boolean).forEach((c) => hit.add(c));
    const ok = got === want;
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` — очікувалось [${want}], отримано [${got}]`}`);
  }
  const unproven = CODES.filter((c) => !hit.has(c));
  if (unproven.length) { failed++; console.log(`FAIL коди без прикладу, на якому вони спрацювали: ${unproven.join(', ')}`); }
  console.log(`RULES SELF-TEST: ${failed ? 'FAILED' : 'PASSED'} ${cases.length - failed}/${cases.length} · кодів ${CODES.length}, доведено ${hit.size}`);
  return failed ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  cli({ flags: ['self-test'] });
  if (process.argv.includes('--self-test')) process.exit(selfTest());
  const found = check(load(), Object.keys(SCHEMAS));
  for (const f of found) console.log(`${f.code} ${f.where}: ${f.msg}`);
  const n = Object.keys(FILES).reduce((s, f) => s + rows(load()[f]).length, 0);
  console.log(found.length ? `RULES: FAILED ${found.length}` : `RULES: OK · ${n} рядків у ${Object.keys(FILES).length} файлах`);
  process.exit(found.length ? 1 : 0);
}
