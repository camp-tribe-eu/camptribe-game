// Самотест: доводить, що кожна перевірка вміє почервоніти, і що жодна не стріляє по коректному.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { CODES } from './codes.mjs';
import { CHECKS, validate } from './checks.mjs';
import { loadContent } from './load.mjs';
import { COLLECTIONS } from './schema.mjs';
import { baseline, comboBaseline, FIXTURES, FILE_FIXTURES, TODAY } from './fixtures.mjs';

const codeSet = (issues) => [...new Set(issues.map((i) => i.code))].sort();

function writeBaseline(dir, override = {}) {
  const c = baseline();
  mkdirSync(join(dir, 'locales'), { recursive: true });
  writeFileSync(join(dir, 'meta.json'), JSON.stringify(c.meta));
  for (const k of COLLECTIONS) if (c[k] !== undefined) writeFileSync(join(dir, `${k}.json`), JSON.stringify(c[k]));
  for (const [lang, t] of Object.entries(c.locales)) writeFileSync(join(dir, 'locales', `${lang}.json`), JSON.stringify(t));
  for (const [name, text] of Object.entries(override)) writeFileSync(join(dir, name), text);
}

export function selfTest() {
  const lines = [];
  let ran = 0, failed = 0;
  const covered = new Set();
  const report = (ok, name, detail) => {
    ran++;
    if (!ok) failed++;
    lines.push(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n       ${detail}`}`);
  };

  // 1. Інвентар: кожна перевірка має коди, кожен код має відому перевірку, очікування не вигадані.
  const checkIds = new Set(CHECKS.map((c) => c.id));
  const inv = [];
  for (const [code, { check }] of Object.entries(CODES)) {
    if (!['loader', 'runner'].includes(check) && !checkIds.has(check)) inv.push(`код ${code} належить неіснуючій перевірці ${check}`);
  }
  for (const id of checkIds) if (!Object.values(CODES).some((v) => v.check === id)) inv.push(`перевірка ${id} не має жодного коду`);
  for (const f of [...FIXTURES, ...FILE_FIXTURES]) for (const e of f.expect) if (!(e in CODES)) inv.push(`приклад «${f.name}» чекає невідомий код ${e}`);
  report(inv.length === 0, 'інвентар перевірок і кодів узгоджений', inv.join('; '));

  // 2. Приклади в пам'яті: точний збіг множини кодів.
  for (const f of FIXTURES) {
    const c = f.base === 'combo' ? comboBaseline() : baseline();
    f.patch(c);
    const got = codeSet(validate(c, { today: TODAY }));
    const want = [...f.expect].sort();
    got.forEach((x) => want.includes(x) && covered.add(x));
    report(isDeepStrictEqual(got, want), f.name, `очікував [${want.join(', ')}], отримав [${got.join(', ')}]`);
  }

  // 3. Файлові приклади для завантажувача.
  for (const f of FILE_FIXTURES) {
    const root = mkdtempSync(join(tmpdir(), 'ct-validator-'));
    const dir = join(root, 'content');
    try {
      if (f.files === 'baseline') { mkdirSync(dir); writeBaseline(dir, f.override); }
      const r = loadContent(dir, { allowMissing: !!f.allowMissing });
      const got = codeSet(r.issues);
      const want = [...f.expect].sort();
      got.forEach((x) => want.includes(x) && covered.add(x));
      let ok = r.status === f.expectStatus && isDeepStrictEqual(got, want);
      let detail = `статус ${r.status} (чекав ${f.expectStatus}), коди [${got.join(', ')}] (чекав [${want.join(', ')}])`;
      if (ok && f.roundTrip) {
        ok = isDeepStrictEqual(r.content, baseline()) && validate(r.content, { today: TODAY }).length === 0;
        detail = 'з диска прочитано не те, що записано, або воно не проходить валідацію';
      }
      report(ok, `[файли] ${f.name}`, detail);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }

  // 4. Покриття: кожен код (крім INTERNAL_ERROR) хоч раз спрацював там, де його чекали.
  const uncovered = Object.keys(CODES).filter((c) => c !== 'INTERNAL_ERROR' && !covered.has(c));
  report(uncovered.length === 0, 'кожен код має зламаний приклад, на якому він спрацював', `без доказу: ${uncovered.join(', ')}`);

  // 5. Звірка числа прогонів із базою: набір, що обірвався, не сміє виглядати як пройдений.
  const expected = 1 + FIXTURES.length + FILE_FIXTURES.length + 1;
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
