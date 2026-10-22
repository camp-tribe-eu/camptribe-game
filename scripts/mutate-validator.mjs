#!/usr/bin/env node
// Мутаційний прогін: доводить, що самотест ловить поломку КОЖНОЇ перевірки.
// Закон «Зелене нічого не доводить, поки не почервоніло»: мутація ламає рівно одне місце,
// самотест мусить упасти саме як самотест (рядок «SELF-TEST: FAILED»), а не як зламаний модуль.
//
//   node scripts/mutate-validator.mjs
//
// Мутації робляться в тимчасовій КОПІЇ scripts/, оригінал не чіпається.

import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { CHECKS } from './validator/checks.mjs';

const scripts = dirname(fileURLToPath(import.meta.url));
const CHECKS_FILE = 'validator/checks.mjs';
const COMBOS_FILE = 'validator/combos.mjs';

// 1. Вимкнення кожної перевірки цілком. 2. Точкові мутації логіки, де помилка найдорожча.
const mutations = [
  ...CHECKS.map((c) => ({ name: `вимкнено перевірку ${c.id}`, file: CHECKS_FILE, from: `// @check:${c.id}\n`, to: `// @check:${c.id}\n      return [];\n` })),
  { name: 'відмова рахується як завершення', file: CHECKS_FILE, from: "u === X && tr.on === 'complete'", to: 'u === X' },
  { name: 'unlockedBy ігнорується', file: CHECKS_FILE, from: '!ent.unlockedBy || guaranteed', to: 'true || guaranteed' },
  { name: 'нагорода будь-якого квесту вважається гарантованою', file: CHECKS_FILE, from: 'for (const X of guaranteed.get(q)) if (Q.get(X)', to: 'for (const X of Q.keys()) if (Q.get(X)' },
  { name: 'петля на себе не вважається циклом', file: CHECKS_FILE, from: 'comp.length > 1 || next(comp[0]).includes(comp[0])', to: 'comp.length > 1' },
  { name: 'необов\u2019язкова ціль теж перевіряється', file: CHECKS_FILE, from: 'if (!o.required) continue;', to: '' },
  { name: 'схемні помилки не зупиняють змістові перевірки', file: CHECKS_FILE, from: 'if (issues.length) return issues;', to: '' },
  { name: 'NOT_RUN видається як OK', file: 'validator/load.mjs', from: "return { status: 'NOT_RUN'", to: "return { status: 'OK'" },
  { name: 'порожній контент вважається нормою', file: 'validator/load.mjs', from: '|| content.quests.length === 0', to: '' },
  { name: 'комбінації запускаються й на брудному контенті', file: CHECKS_FILE, from: 'if (issues.length === 0) issues.push(...runOne(combos));', to: 'issues.push(...runOne(combos));' },
  { name: 'when на переходах ігнорується', file: COMBOS_FILE, from: 'matches(t.when, k) && ids.has(t.to)', to: 'ids.has(t.to)' },
  { name: 'NPC і локації поза комбінацією доступні', file: COMBOS_FILE, from: ': { ...strip(e), unlockedBy: NEVER }', to: ': strip(e)' },
  { name: 'перебирається лише перша комбінація', file: COMBOS_FILE, from: 'for (const k of all) {', to: 'for (const k of all.slice(0, 1)) {' },
  { name: 'комбінації без тварини пропущено', file: COMBOS_FILE, from: '[NO_ANIMAL, ...ids(\'animals\')]', to: 'ids(\'animals\')' },
  { name: 'недосяжні в комбінації квести не відсікаються', file: COMBOS_FILE, from: '(!keep || keep.has(q.id))', to: 'true' },
];

function selfTestIn(dir) {
  const r = spawnSync(process.execPath, [join(dir, 'validate-content.mjs'), '--self-test'], { encoding: 'utf8' });
  return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
}

// 0. Немутований код мусить бути зеленим — інакше «спіймані» мутації нічого не значать.
const clean = selfTestIn(scripts);
if (clean.code !== 0) { console.log(clean.out); console.log('MUTATION: ABORT — немутований самотест не зелений'); process.exit(1); }

// Маркери в коді мусять збігатися з реєстром CHECKS один-в-один.
const src = readFileSync(join(scripts, CHECKS_FILE), 'utf8');
const markers = [...src.matchAll(/\/\/ @check:([a-z-]+)\n/g)].map((m) => m[1]).sort();
const registry = CHECKS.map((c) => c.id).sort();
if (JSON.stringify(markers) !== JSON.stringify(registry)) {
  console.log(`MUTATION: ABORT — маркери [${markers}] не збігаються з реєстром [${registry}]`);
  process.exit(1);
}

let caught = 0;
const fails = [];
for (const m of mutations) {
  const tmp = mkdtempSync(join(tmpdir(), 'ct-mut-'));
  try {
    cpSync(scripts, tmp, { recursive: true });
    const path = join(tmp, m.file);
    const text = readFileSync(path, 'utf8');
    const hits = text.split(m.from).length - 1;
    // Мутація, що не знайшла свого рядка, звітує як «пережила» — тому вимагаємо рівно одне входження.
    if (hits !== 1) { fails.push(`${m.name}: рядок мутації знайдено ${hits} разів, а не 1`); continue; }
    writeFileSync(path, text.replace(m.from, m.to));
    const r = selfTestIn(tmp);
    const asSelfTest = /SELF-TEST: FAILED \d+ of \d+/.test(r.out);
    if (r.code !== 0 && asSelfTest) { caught++; console.log(`спіймано  ${m.name}`); }
    else fails.push(`${m.name}: ${r.code === 0 ? 'самотест ЗЕЛЕНИЙ — мутація пережила' : 'самотест не дійшов до вердикту (впав як модуль)'}`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

for (const f of fails) console.log(`ПЕРЕЖИЛА  ${f}`);
console.log(`\nMUTATION: ${fails.length === 0 ? 'PASSED' : 'FAILED'} · спіймано ${caught} із ${mutations.length} (перевірок ${CHECKS.length}, точкових ${mutations.length - CHECKS.length})`);
process.exit(fails.length === 0 ? 0 : 1);
