#!/usr/bin/env node
// Мутаційний прогін сторожа мап: доводить, що самотест ловить поломку КОЖНОЇ перевірки.
// Закон «Зелене нічого не доводить, поки не почервоніло»: мутація ламає рівно одне місце,
// самотест мусить упасти саме як самотест (рядок «SELF-TEST: FAILED»), а не як зламаний модуль.
//
//   node scripts/maps/mutate.mjs
//
// Мутації робляться в тимчасовій КОПІЇ scripts/maps/, оригінал не чіпається.

import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { CHECKS } from './checks.mjs';
import { cli } from '../lib/cli.mjs';

cli();

const here = dirname(fileURLToPath(import.meta.url));
const C = 'checks.mjs';
const V = 'validate-maps.mjs';

// 1. Вимкнення кожної перевірки цілком. 2. Точкові мутації логіки, де помилка найдорожча.
const mutations = [
  ...CHECKS.map((c) => ({ name: `вимкнено перевірку ${c.id}`, file: C, from: `// @check:${c.id}\n`, to: `// @check:${c.id}\n      return [];\n` })),
  { name: 'прапорці віддзеркалення gid не знімаються', file: C, from: 'const gidOf = (raw) => raw & GID_MASK;', to: 'const gidOf = (raw) => raw;' },
  { name: 'рух по діагоналі дозволено', file: C, from: 'const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];', to: 'const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];' },
  { name: 'NPC треба стати на його клітинку', file: C, from: "(t.kind === 'npc' && neighbours(m, t.i).some((n) => seen[n]))", to: 'false' },
  { name: 'тригер теж досить побачити з сусідньої клітинки', file: C, from: "(t.kind === 'npc' && neighbours", to: '(true && neighbours' },
  { name: 'ціль досить досягти з будь-якої точки появи', file: C, from: 'if (failing.length) out.push(', to: 'if (failing.length === starts.length) out.push(' },
  { name: 'звіт на кожну точку появи замість одного на ціль', file: C, from: 'if (failing.length) out.push(', to: 'for (const _s of failing) out.push(' },
  { name: 'заблокована точка появи теж стартує пошук (дубль звіту)', file: C, from: "o.inside && spawnState(m, o) === 'ok'", to: 'o.inside' },
  { name: 'об’єкти поза мапою не виключаються з пошуку', file: C, from: "if (!TARGET_KINDS.includes(t.kind) || !t.inside) continue;", to: 'if (!TARGET_KINDS.includes(t.kind)) continue;' },
  { name: 'тайловий об’єкт: y як верхній край', file: C, from: 'const top = o.gid ? o.y - h : o.y;', to: 'const top = o.y;' },
  { name: 'прямокутник береться за лівий край, а не центр', file: C, from: 'const cx = o.x + w / 2;', to: 'const cx = o.x;' },
  { name: 'Tiled 1.9 class ігнорується', file: C, from: "const kind = o.type || o.class || '';", to: "const kind = o.type || '';" },
  { name: 'collides тайла в тайлсеті ігнорується', file: C, from: 'if (all || tileCollides.has(gidOf(raw)))', to: 'if (all)' },
  { name: 'будь-який непорожній шар блокує', file: C, from: "const all = prop(layer, 'collides') === true;", to: 'const all = true;' },
  { name: 'групи шарів не розгортаються', file: C, from: "if (l?.type === 'group') flatLayers(l.layers, out);", to: "if (l?.type === 'group') continue;" },
  { name: 'gid перевіряється лише проти останнього gid', file: C, from: 'g >= ts.firstgid && g <= ts.firstgid + ts.tilecount - 1', to: 'g <= ts.firstgid + ts.tilecount - 1' },
  { name: 'структурні помилки не зупиняють решту перевірок', file: C, from: 'if (issues.length) return issues;', to: '' },
  { name: 'NOT_RUN видається як OK', file: C, from: "? { status: 'NOT_RUN'", to: "? { status: 'OK'" },
  { name: 'порожня тека вважається нормою', file: C, from: "if (files.length === 0) return missing(", to: 'if (false) return missing(' },
  { name: '.tmx мовчки ігнорується', file: C, from: '/\\.(tmj|tmx)$/i.test(f)', to: '/\\.tmj$/i.test(f)' },
  { name: 'підтеки maps/ не читаються', file: C, from: 'readdirSync(dir, { recursive: true })', to: 'readdirSync(dir)' },
  { name: 'звірка count послаблена до «не менше»', file: V, from: 'return n === f.count.n ? null', to: 'return n >= f.count.n ? null' },
  { name: 'звірка count вимкнена', file: V, from: 'const cmis = countMismatch(f, issues);', to: 'const cmis = null;' },
  { name: 'звірка покриття сліпа', file: V, from: "filter((c) => c !== 'INTERNAL_ERROR' && !seen.has(c))", to: 'filter(() => false)' },
];

function selfTestIn(dir) {
  const r = spawnSync(process.execPath, [join(dir, V), '--self-test'], { encoding: 'utf8' });
  return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
}

// 0. Немутований код мусить бути зеленим — інакше «спіймані» мутації нічого не значать.
const clean = selfTestIn(here);
if (clean.code !== 0) { console.log(clean.out); console.log('MUTATION: ABORT — немутований самотест не зелений'); process.exit(1); }

// Маркери в коді мусять збігатися з реєстром CHECKS один-в-один.
const src = readFileSync(join(here, C), 'utf8');
const markers = [...src.matchAll(/\/\/ @check:([a-z-]+)\n/g)].map((m) => m[1]).sort();
const registry = CHECKS.map((c) => c.id).sort();
if (JSON.stringify(markers) !== JSON.stringify(registry)) {
  console.log(`MUTATION: ABORT — маркери [${markers}] не збігаються з реєстром [${registry}]`);
  process.exit(1);
}

let caught = 0;
const fails = [];
for (const m of mutations) {
  const root = mkdtempSync(join(tmpdir(), 'ct-maps-mut-'));
  // Копія зберігає сусідню scripts/lib/ (спільний суворий розбір аргументів), інакше мутант падає як модуль.
  const tmp = join(root, 'maps');
  try {
    cpSync(here, tmp, { recursive: true });
    cpSync(join(here, '..', 'lib'), join(root, 'lib'), { recursive: true });
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
  } finally { rmSync(root, { recursive: true, force: true }); }
}

// Нешкідливий контроль: змінено лише текст повідомлення — мутація МУСИТЬ пережити (див. mutate-validator.mjs).
{
  const root = mkdtempSync(join(tmpdir(), 'ct-maps-mut-'));
  const tmp = join(root, 'maps');
  try {
    cpSync(here, tmp, { recursive: true });
    cpSync(join(here, '..', 'lib'), join(root, 'lib'), { recursive: true });
    const path = join(tmp, C);
    const text = readFileSync(path, 'utf8');
    const from = "out.push(I('MAP_STRUCTURE', 'мапа', msg))";
    if (text.split(from).length - 1 !== 1) fails.push('контроль: рядок не знайдено рівно раз');
    else {
      writeFileSync(path, text.replace(from, "out.push(I('MAP_STRUCTURE', 'мапа ', msg))"));
      const r = selfTestIn(tmp);
      if (r.code === 0) console.log('пережила  [контроль, так і треба] текст місця MAP_STRUCTURE');
      else fails.push('контроль: нешкідливу мутацію «спіймано» — харнес червоний без дефекту');
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
}

for (const f of fails) console.log(`ПЕРЕЖИЛА  ${f}`);
console.log(`\nMUTATION: ${fails.length === 0 ? 'PASSED' : 'FAILED'} · спіймано ${caught} із ${mutations.length} (перевірок ${CHECKS.length}, точкових ${mutations.length - CHECKS.length})`);
process.exit(fails.length === 0 ? 0 : 1);
