#!/usr/bin/env node
// GAME-34 · «два прогони на різних збірках однієї гілки — однаковий хеш». Дві справді різні збірки
// реплею (без мініфікації ES2022 і з мініфікацією ES2020 — бандли мусять різнитися байтами, інакше
// перевірка порожня) → кожен еталон у tests/replays/ дає збережений фінальний хеш в обох.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cli } from '../lib/cli.mjs';

cli();
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BUILDS = [['es2022-raw', ['--minify', 'false', '--target', 'es2022']], ['es2020-min', ['--minify', '--target', 'es2020']]];
const tmp = mkdtempSync(join(tmpdir(), 'ct-replay-'));
let bad = 0;
try {
  const expected = Object.fromEntries(readdirSync(join(ROOT, 'tests', 'replays')).filter((f) => f.endsWith('.json'))
    .map((f) => [f, JSON.parse(readFileSync(join(ROOT, 'tests', 'replays', f), 'utf8')).hashes.at(-1)]));
  if (Object.keys(expected).length === 0) { console.log('::error::REPLAY BUILDS: еталонів 0 — нема що перевіряти'); process.exit(1); }
  const bundles = [];
  for (const [name, flags] of BUILDS) {
    const out = join(tmp, name);
    const b = spawnSync('npx', ['vite', 'build', '--ssr', 'scripts/replay/entry.ts', '--outDir', out, '--emptyOutDir', '--logLevel', 'error', ...flags], { cwd: ROOT, encoding: 'utf8' });
    if (b.status !== 0) { bad++; console.log(`FAIL збірка ${name}: ${b.stdout}${b.stderr}`); continue; }
    bundles.push(readFileSync(join(out, 'entry.js'), 'utf8'));
    const r = spawnSync(process.execPath, [join(out, 'entry.js')], { cwd: ROOT, encoding: 'utf8' });
    let got = {};
    try { got = JSON.parse(r.stdout); } catch { bad++; console.log(`FAIL ${name}: не JSON — ${r.stdout}${r.stderr}`); continue; }
    for (const [f, h] of Object.entries(expected)) {
      if (got[f] === h) console.log(`ok   ${name} · ${f} → ${h}`);
      else { bad++; console.log(`FAIL ${name} · ${f}: очікував ${h}, отримав ${got[f] ?? '—'}`); }
    }
  }
  if (bundles.length === 2 && bundles[0] === bundles[1]) { bad++; console.log('FAIL збірки однакові байт у байт — перевірка «різних збірок» порожня'); }
  console.log(bad ? `REPLAY BUILDS: FAILED ${bad}` : `REPLAY BUILDS: OK · ${BUILDS.length} різні збірки × ${Object.keys(expected).length} еталон(и) → однаковий хеш`);
} finally { rmSync(tmp, { recursive: true, force: true }); }
process.exit(bad ? 1 : 0);
