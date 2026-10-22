#!/usr/bin/env node
// Валідатор мап Tiled CampLife (GAME-23): точка появи не замурована, тригер і NPC досяжні пішки.
// Опис формату й перевірок: docs/MAP-VALIDATOR.md.
//
//   node scripts/maps/validate-maps.mjs                        перевірити maps/
//   node scripts/maps/validate-maps.mjs --dir <тека>           перевірити іншу теку
//   node scripts/maps/validate-maps.mjs --self-test            довести, що кожна перевірка вміє почервоніти
//   --allow-missing-maps                                       мап немає — NOT RUN (код 0, з попередженням)
//
// Коди виходу: 0 — перевірено й чисто; 1 — знайдено проблеми або самотест упав;
//              0 + «NOT RUN» — мап немає й це явно дозволено прапорцем.

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { CODES, CHECKS, validateMap, loadMaps, summarize } from './checks.mjs';
import { baseline, FIXTURES, FILE_FIXTURES } from './fixtures.mjs';

const codeSet = (issues) => [...new Set(issues.map((i) => i.code))].sort();

export function selfTest() {
  const lines = [];
  let ran = 0, failed = 0;
  const covered = new Set();
  const report = (ok, name, detail) => {
    ran++;
    if (!ok) failed++;
    lines.push(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n       ${detail}`}`);
  };

  // 1. Інвентар: кожна перевірка має код, кожен код має відому перевірку, очікування не вигадані.
  const checkIds = new Set(CHECKS.map((c) => c.id));
  const inv = [];
  for (const [code, { check }] of Object.entries(CODES)) if (!['loader', 'runner'].includes(check) && !checkIds.has(check)) inv.push(`код ${code} належить неіснуючій перевірці ${check}`);
  for (const id of checkIds) if (!Object.values(CODES).some((v) => v.check === id)) inv.push(`перевірка ${id} не має жодного коду`);
  for (const f of [...FIXTURES, ...FILE_FIXTURES]) for (const e of f.expect) if (!(e in CODES)) inv.push(`приклад «${f.name}» чекає невідомий код ${e}`);
  report(inv.length === 0, 'інвентар перевірок і кодів узгоджений', inv.join('; '));

  // 2. count — точна кількість знахідок коду: стереже від дублів, яких множина кодів не бачить.
  const countMismatch = (f, issues) => {
    if (!f.count) return null;
    const n = issues.filter((i) => i.code === f.count.code).length;
    return n === f.count.n ? null : `${f.count.code}: очікував ${f.count.n}, отримав ${n}`;
  };
  const one = [{ code: 'X' }];
  const cm = [countMismatch({ count: { code: 'X', n: 0 } }, one), countMismatch({ count: { code: 'X', n: 2 } }, one), countMismatch({ count: { code: 'X', n: 1 } }, one)];
  report(cm[0] !== null && cm[1] !== null && cm[2] === null, 'звірка count червоніє на більше й менше, мовчить на рівне', JSON.stringify(cm));

  const judge = (f) => {
    const map = baseline();
    let issues;
    // Приклад, що впав винятком, — червоний рядок самотесту, а не мовчазний обрив набору.
    try { f.patch(map); issues = validateMap(map, 'fixture'); }
    catch (e) { return { got: ['<виняток>'], want: f.expect, bad: [`виняток: ${e?.message ?? e}`] }; }
    const got = codeSet(issues);
    const want = [...f.expect].sort();
    const bad = [];
    if (!isDeepStrictEqual(got, want)) bad.push(`очікував [${want.join(', ')}], отримав [${got.join(', ')}] · ${issues.map((i) => `${i.code}: ${i.where}: ${i.msg}`).join(' | ').slice(0, 400)}`);
    const cmis = countMismatch(f, issues);
    if (cmis) bad.push(cmis);
    return { got, want, bad };
  };
  const withCount = FIXTURES.find((f) => f.count);
  const wrong = (d) => judge({ ...withCount, count: { ...withCount.count, n: withCount.count.n + d } }).bad.length > 0;
  report(!!withCount && wrong(+1) && wrong(-1), 'приклад із хибним count падає — і на «замало», і на «забагато»', 'оцінка прикладу не звіряє count в обидва боки');

  for (const f of FIXTURES) {
    const { got, want, bad } = judge(f);
    got.forEach((x) => want.includes(x) && covered.add(x));
    report(bad.length === 0, f.name, bad.join('; '));
  }

  // 3. Файлові приклади для завантажувача.
  for (const f of FILE_FIXTURES) {
    const root = mkdtempSync(join(tmpdir(), 'ct-maps-'));
    const dir = join(root, 'maps');
    try {
      if (f.files === 'baseline') { mkdirSync(join(dir, 'nested'), { recursive: true }); writeFileSync(join(dir, 'nested', 'base.tmj'), JSON.stringify(baseline())); }
      else if (f.files) { mkdirSync(dir); for (const [n, t] of Object.entries(f.files)) writeFileSync(join(dir, n), t); }
      const r = loadMaps(dir, { allowMissing: !!f.allowMissing });
      const got = codeSet(r.issues);
      const want = [...f.expect].sort();
      got.forEach((x) => want.includes(x) && covered.add(x));
      let ok = r.status === f.expectStatus && isDeepStrictEqual(got, want);
      let detail = `статус ${r.status} (чекав ${f.expectStatus}), коди [${got.join(', ')}] (чекав [${want.join(', ')}])`;
      if (ok && f.roundTrip) {
        ok = r.maps.length === 1 && isDeepStrictEqual(r.maps[0].map, baseline()) && validateMap(r.maps[0].map).length === 0;
        detail = 'з диска прочитано не те, що записано, або воно не проходить валідацію';
      }
      report(ok, `[файли] ${f.name}`, detail);
    } catch (e) {
      report(false, `[файли] ${f.name}`, `виняток: ${e?.message ?? e}`);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }

  // 4. Покриття: кожен код (крім INTERNAL_ERROR) хоч раз спрацював там, де його чекали.
  // На зеленому наборі покриття завжди повне, тож сама звірка має власний доказ, що вміє почервоніти.
  const gap = (seen) => Object.keys(CODES).filter((c) => c !== 'INTERNAL_ERROR' && !seen.has(c));
  const allButOne = new Set(Object.keys(CODES).slice(1));
  report(gap(allButOne).length === 1 && gap(new Set(Object.keys(CODES))).length === 0, 'звірка покриття червоніє на пропущений код, мовчить на повний набір', JSON.stringify(gap(allButOne)));
  const uncovered = gap(covered);
  report(uncovered.length === 0, 'кожен код має зламаний приклад, на якому він спрацював', `без доказу: ${uncovered.join(', ')}`);

  // 5. Звірка числа кроків із базою: набір, що обірвався, не сміє виглядати як пройдений.
  const expected = 1 + 2 + FIXTURES.length + FILE_FIXTURES.length + 2; // інвентар, 2 звірки count, приклади, 2 звірки покриття
  const before = ran;
  report(before === expected, `до звірки виконано ${before} кроків із ${expected} очікуваних`, 'набір обірвався або пропустив приклади');

  const broken = FIXTURES.filter((f) => f.expect.length).length + FILE_FIXTURES.filter((f) => f.expect.length).length;
  const positive = FIXTURES.length + FILE_FIXTURES.length - broken;
  lines.push('');
  lines.push(failed === 0
    ? `SELF-TEST: PASSED ${ran}/${ran} · зламаних прикладів ${broken}, позитивних контролів ${positive} · перевірок ${CHECKS.length}, кодів ${Object.keys(CODES).length - 1}, кожен доведено`
    : `SELF-TEST: FAILED ${failed} of ${ran}`);
  return { ok: failed === 0, text: lines.join('\n') };
}

// ---------- CLI ----------

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };

if (flag('--self-test')) {
  const r = selfTest();
  console.log(r.text);
  process.exit(r.ok ? 0 : 1);
}

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dir = resolve(opt('--dir') ?? join(repo, 'maps'));
const loaded = loadMaps(dir, { allowMissing: flag('--allow-missing-maps') });

if (loaded.status === 'NOT_RUN') {
  console.log(`::warning::NOT RUN — ${loaded.why} (${dir}). Перевіряти нічого. Це не PASS.`);
  process.exit(0);
}

const issues = [...loaded.issues];
for (const { name, map } of loaded.maps) issues.push(...validateMap(map, name));

if (issues.length === 0) {
  const t = { spawns: 0, triggers: 0, npcs: 0, walkable: 0, tiles: 0 };
  for (const { map } of loaded.maps) for (const [k, v] of Object.entries(summarize(map))) t[k] += v;
  console.log(`PASS · мап ${loaded.maps.length} · точок появи ${t.spawns}, тригерів ${t.triggers}, NPC ${t.npcs} → пар «точка появи → ціль» перевірено ${loaded.maps.reduce((a, { map }) => { const s = summarize(map); return a + s.spawns * (s.triggers + s.npcs); }, 0)} · прохідних клітинок ${t.walkable} із ${t.tiles}`);
  process.exit(0);
}
for (const i of issues) console.log(`::error::${i.code} · ${i.where} · ${i.msg}`);
console.log(`\nFAIL · проблем: ${issues.length}`);
process.exit(1);
