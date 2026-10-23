#!/usr/bin/env node
// GAME-19 п.2–3: довести, що SKILL.md достатній. tests/skill-quests/ — копія content/ + 3 квести,
// написані строго за скілом game-content (NPC+talk+діалог, collect, deliver-замінник collect+talk).
//   node scripts/check-skill-quests.mjs     позитив мусить бути PASS; негатив (два optional без decline,
//                                           зроблений мутацією в пам'яті й записаний у тимчасову теку)
//                                           мусить дати OPTIONAL_NO_DECLINE ×2 і код 1 від справжнього CLI.
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { cli } from './lib/cli.mjs';

cli({ flags: [], options: [] });
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = join(root, 'scripts', 'validate-content.mjs');
const probe = join(root, 'tests', 'skill-quests');
const run = (dir) => spawnSync('node', [cliPath, '--dir', dir], { encoding: 'utf8' });
const fail = (m) => { console.error(`FAIL · ${m}`); process.exit(1); };

const pos = run(probe);
if (pos.status !== 0 || !/^PASS/m.test(pos.stdout)) fail(`позитивна проба не PASS (код ${pos.status})\n${pos.stdout}`);
for (const id of ['q.nora-hello', 'q.pinecone-hunt', 'q.nora-parcel']) {
  if (!readFileSync(join(probe, 'quests.json'), 'utf8').includes(`"id": "${id}"`)) fail(`у пробі немає ${id}`);
}
console.log(pos.stdout.trim().split('\n').pop());

const tmp = mkdtempSync(join(tmpdir(), 'skill-quests-broken-'));
try {
  cpSync(probe, tmp, { recursive: true });
  const qs = JSON.parse(readFileSync(join(tmp, 'quests.json'), 'utf8'));
  let cut = 0;
  for (const id of ['q.nora-hello', 'q.pinecone-hunt']) {
    const q = qs.find((x) => x.id === id);
    q.transitions = q.transitions.filter((t) => t.on !== 'decline');
    cut++;
  }
  writeFileSync(join(tmp, 'quests.json'), JSON.stringify(qs, null, 2));
  const neg = run(tmp);
  const hits = (neg.stdout.match(/OPTIONAL_NO_DECLINE/g) ?? []).length;
  if (cut !== 2 || neg.status !== 1 || hits !== 2) fail(`негатив не почервонів як треба: код ${neg.status}, OPTIONAL_NO_DECLINE ×${hits}\n${neg.stdout}`);
  console.log(neg.stdout.split('\n').filter((l) => /OPTIONAL_NO_DECLINE|^FAIL/.test(l)).join('\n'));
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log('PASS · skill-quests: позитив зелений, негатив червоний (OPTIONAL_NO_DECLINE ×2, код 1)');
