#!/usr/bin/env node
// Сторож релізу (GAME-102): версія в package.json = верхній запис CHANGELOG.md, обидві — semver.
//   node scripts/release/check-release.mjs              перевірити репозиторій
//   --self-test                                          кожна перевірка має зламаний приклад, що червоніє
//   --mutate                                             вимкнути кожну перевірку по черзі → самотест мусить упасти
// Код 0 — зелене; 1 — є порушення; 2 — хибний аргумент. Відсутній чи порожній файл — порушення, не тиша (закон 4).
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cli } from '../lib/cli.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
// Офіційний регулярний вираз semver.org (без метаданих збірки не виключаємо: дозволені).
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
const ENTRY = /^## \[([^\]]*)\](.*)$/;
const DATE = /^ — (\d{4})-(\d{2})-(\d{2})(?: |$)/;

const core = (v) => v.split(/[-+]/)[0].split('.').map(Number);
function cmp(a, b) { // порівняння за major.minor.patch; пре-реліз не розрізняємо (досить для «верхній не менший»)
  const x = core(a), y = core(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

/** Кожна перевірка — окремий запис, щоб --mutate міг вимкнути її окремо. */
export const CHECKS = [
  ['PKG_VERSION_MISSING', ({ pkg }) => typeof pkg.version !== 'string' || pkg.version === ''],
  ['PKG_NOT_SEMVER', ({ pkg }) => typeof pkg.version === 'string' && pkg.version !== '' && !SEMVER.test(pkg.version)],
  ['CL_NO_ENTRY', ({ entries }) => entries.length === 0],
  ['CL_NOT_SEMVER', ({ entries }) => entries.some((e) => !SEMVER.test(e.version))],
  ['CL_BAD_DATE', ({ entries }) => entries.some((e) => {
    const m = DATE.exec(e.rest);
    if (!m) return true;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3];
  })],
  ['CL_NOT_NEWEST', ({ entries }) => entries.slice(1).some((e) => SEMVER.test(e.version) && SEMVER.test(entries[0].version) && cmp(e.version, entries[0].version) > 0)],
  ['VERSION_MISMATCH', ({ pkg, entries }) => entries.length > 0 && pkg.version !== entries[0].version],
  ['LOCK_MISSING', ({ lock }) => lock == null],
  ['LOCK_MISMATCH', ({ pkg, lock }) => lock != null && (lock.version !== pkg.version || lock.packages?.['']?.version !== pkg.version)],
];

export function parseChangelog(text) {
  return text.split('\n').map((l) => ENTRY.exec(l)).filter(Boolean).map((m) => ({ version: m[1], rest: m[2] }));
}

/** Повертає масив кодів порушень. skip — множина вимкнених перевірок (лише для --mutate). */
export function evaluate({ pkg, changelog, lock = null }, skip = new Set()) {
  const ctx = { pkg, lock, entries: parseChangelog(changelog) };
  return CHECKS.filter(([code]) => !skip.has(code)).filter(([, f]) => f(ctx)).map(([code]) => code);
}

const GOOD_CL = '# Журнал змін\n\n## [0.2.0] — 2026-11-01\n\n- щось\n\n## [0.1.0] — 2026-10-28 (попередній)\n\n- інше\n';
const lockOf = (v) => ({ version: v, packages: { '': { version: v } } });
const good = (over = {}) => ({ pkg: { version: '0.2.0' }, changelog: GOOD_CL, lock: { version: '0.2.0', packages: { '': { version: '0.2.0' } } }, ...over });
// [назва, вхід, очікуваний код або null для позитивного контролю]
export const FIXTURES = [
  ['позитивний контроль: все збігається', good(), null],
  ['позитивний контроль: пре-реліз 1.0.0-rc.1', good({ pkg: { version: '1.0.0-rc.1' }, changelog: '## [1.0.0-rc.1] — 2026-11-01\n', lock: lockOf('1.0.0-rc.1') }), null],
  ['версії немає в package.json', good({ pkg: {}, lock: lockOf(undefined) }), 'PKG_VERSION_MISSING'],
  ['версія в package.json не semver', good({ pkg: { version: '0.2' }, changelog: '## [0.2] — 2026-11-01\n', lock: lockOf('0.2') }), 'PKG_NOT_SEMVER'],
  ['у CHANGELOG немає жодного запису', good({ changelog: '# Журнал змін\n' }), 'CL_NO_ENTRY'],
  ['запис CHANGELOG не semver', good({ pkg: { version: '0.2.0' }, changelog: GOOD_CL + '\n## [сьогодні] — 2026-10-01\n' }), 'CL_NOT_SEMVER'],
  ['запис без дати чи з неіснуючою датою', good({ changelog: GOOD_CL.replace('2026-11-01', '2026-02-30') }), 'CL_BAD_DATE'],
  ['верхній запис старіший за нижній', good({ pkg: { version: '0.1.0' }, changelog: '## [0.1.0] — 2026-10-28\n\n## [0.2.0] — 2026-11-01\n', lock: lockOf('0.1.0') }), 'CL_NOT_NEWEST'],
  ['версія ≠ верхній запис (мутація картки)', good({ pkg: { version: '0.3.0' }, lock: lockOf('0.3.0') }), 'VERSION_MISMATCH'],
  ['package-lock.json відсутній (тиша — не зелене)', good({ lock: null }), 'LOCK_MISSING'],
  ['package-lock.json відстав від package.json', good({ lock: { version: '0.1.0', packages: { '': { version: '0.2.0' } } } }), 'LOCK_MISMATCH'],
];

export function selfTest(skip = new Set()) {
  const fails = [];
  for (const [name, input, want] of FIXTURES) {
    const got = evaluate(input, skip);
    if (want === null ? got.length !== 0 : !got.includes(want)) fails.push(`${name}: очікував ${want ?? 'нічого'}, отримав [${got.join(', ')}]`);
  }
  const covered = new Set(FIXTURES.map((f) => f[2]).filter(Boolean));
  for (const [code] of CHECKS) if (!covered.has(code)) fails.push(`${code}: немає зламаного прикладу`);
  return fails;
}

function readOrNull(p) { return existsSync(p) ? readFileSync(p, 'utf8') : null; }

function main() {
  const args = cli({ flags: ['self-test', 'mutate'] });
  if (args['self-test']) {
    const fails = selfTest();
    fails.forEach((f) => console.log(`FAIL ${f}`));
    console.log(fails.length ? `RELEASE SELF-TEST: FAILED ${fails.length}` : `RELEASE SELF-TEST: OK · ${FIXTURES.length} прикладів, ${CHECKS.length} перевірок`);
    process.exit(fails.length ? 1 : 0);
  }
  if (args.mutate) {
    let survived = 0;
    for (const [code] of CHECKS) {
      const red = selfTest(new Set([code])).length > 0;
      console.log(`${red ? 'killed ' : 'SURVIVED'} ${code}`);
      if (!red) survived++;
    }
    console.log(survived ? `RELEASE MUTATE: FAILED · ${survived} вижило` : `RELEASE MUTATE: OK · ${CHECKS.length}/${CHECKS.length} мутацій червоніють`);
    process.exit(survived ? 1 : 0);
  }
  const pkgText = readOrNull(join(ROOT, 'package.json'));
  const changelog = readOrNull(join(ROOT, 'CHANGELOG.md'));
  const lockText = readOrNull(join(ROOT, 'package-lock.json'));   // відсутній → LOCK_MISSING, не тиша
  if (!pkgText || !changelog || !changelog.trim()) {
    console.log(`::error::RELEASE FAIL · ${!pkgText ? 'package.json' : 'CHANGELOG.md'} відсутній або порожній`);
    process.exit(1);
  }
  const bad = evaluate({ pkg: JSON.parse(pkgText), changelog, lock: lockText ? JSON.parse(lockText) : null });
  const entries = parseChangelog(changelog);
  if (bad.length) { bad.forEach((c) => console.log(`::error::${c}`)); console.log(`RELEASE: FAILED · ${bad.join(', ')}`); process.exit(1); }
  console.log(`RELEASE: OK · package.json = package-lock = верхній запис CHANGELOG = ${entries[0].version}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
