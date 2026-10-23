#!/usr/bin/env node
// Контентний валідатор і перевірник графа квестів CampLife.
// Специфікація: brain/Передача/05-pershyi-kod.md. Опис формату: docs/CONTENT-VALIDATOR.md.
//
//   node scripts/validate-content.mjs                 перевірити content/
//   node scripts/validate-content.mjs --dir <тека>    перевірити іншу теку
//   node scripts/validate-content.mjs --self-test     довести, що кожна перевірка вміє почервоніти
//   --allow-missing-content                           якщо теки немає — NOT RUN (код 0, з попередженням)
//   --fail-on-warnings                                попередження теж валять запуск (щотижневий facts-fresh, GAME-56)
//
// Коди виходу: 0 — перевірено й чисто (попередження ::warning:: код не псують); 1 — знайдено проблеми або самотест упав;
//              0 + «NOT RUN» — теки немає й це явно дозволено прапорцем.

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContent } from './validator/load.mjs';
import { validate } from './validator/checks.mjs';
import { selfTest } from './validator/self-test.mjs';
import { enumerateCombos } from './validator/combos.mjs';
import { verdict } from './validator/verdict.mjs';
import { cli } from './lib/cli.mjs';

const args = cli({ flags: ['self-test', 'allow-missing-content', 'fail-on-warnings'], options: ['dir'] });
const flag = (f) => args[f.slice(2)] === true;
const opt = (f) => args[f.slice(2)];

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
// GAME-56: попередження (давній факт) друкуються як ::warning:: і код виходу не псують.
const { exitCode, errors, warnings } = verdict(issues);
for (const i of warnings) console.log(`::warning::${i.code} · ${i.where} · ${i.msg}`);
const warned = warnings.length ? ` · попереджень ${warnings.length}` : '';
if (exitCode === 0 && !(flag('--fail-on-warnings') && warnings.length)) {
  const c = loaded.content;
  const n = (k) => (c[k] ?? []).length;
  console.log(`PASS · квестів ${n('quests')}, предметів ${n('items')}, NPC ${n('npcs')}, локацій ${n('locations')}, подій ${n('events')}, фактів ${n('facts')}, доріг ${n('roads')}, діалогів ${n('dialogues')} (вузлів ${(c.dialogues ?? []).reduce((s, d) => s + d.nodes.length, 0)}), мов ${c.meta.locales.length} · профілів ${n('profiles')}, транспортів ${n('transports')}, тварин ${n('animals')} → комбінацій перевірено ${enumerateCombos(c).length}${warned}`);
  process.exit(0);
}
for (const i of errors) console.log(`::error::${i.code} · ${i.where} · ${i.msg}`);
console.log(`\nFAIL · проблем: ${errors.length}${warned}${errors.length ? '' : ' (--fail-on-warnings)'}`);
process.exit(1);
