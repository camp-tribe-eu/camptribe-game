#!/usr/bin/env node
// Контентний валідатор і перевірник графа квестів CampLife.
// Специфікація: brain/Передача/05-pershyi-kod.md. Опис формату: docs/CONTENT-VALIDATOR.md.
//
//   node scripts/validate-content.mjs                 перевірити content/
//   node scripts/validate-content.mjs --dir <тека>    перевірити іншу теку
//   node scripts/validate-content.mjs --self-test     довести, що кожна перевірка вміє почервоніти
//   --allow-missing-content                           якщо теки немає — NOT RUN (код 0, з попередженням)
//
// Коди виходу: 0 — перевірено й чисто; 1 — знайдено проблеми або самотест упав;
//              0 + «NOT RUN» — теки немає й це явно дозволено прапорцем.

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContent } from './validator/load.mjs';
import { validate } from './validator/checks.mjs';
import { selfTest } from './validator/self-test.mjs';

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };

if (flag('--self-test')) {
  const r = selfTest();
  console.log(r.text);
  process.exit(r.ok ? 0 : 1);
}

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = resolve(opt('--dir') ?? resolve(repo, 'content'));
const loaded = loadContent(dir, { allowMissing: flag('--allow-missing-content') });

if (loaded.status === 'NOT_RUN') {
  console.log(`::warning::NOT RUN — теки ${dir} немає. Контент ще не написаний, перевіряти нічого. Це не PASS.`);
  process.exit(0);
}

const issues = loaded.issues.length ? loaded.issues : validate(loaded.content, { today: new Date().toISOString().slice(0, 10) });
if (issues.length === 0) {
  const c = loaded.content;
  const n = (k) => (c[k] ?? []).length;
  console.log(`PASS · квестів ${n('quests')}, предметів ${n('items')}, NPC ${n('npcs')}, локацій ${n('locations')}, подій ${n('events')}, фактів ${n('facts')}, мов ${c.meta.locales.length}`);
  process.exit(0);
}
for (const i of issues) console.log(`::error::${i.code} · ${i.where} · ${i.msg}`);
console.log(`\nFAIL · проблем: ${issues.length}`);
process.exit(1);
