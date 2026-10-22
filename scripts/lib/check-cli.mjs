#!/usr/bin/env node
// Сторож сторожів (закон 4): кожен скрипт перевірки на незнайомий прапорець мусить вийти з кодом 2
// і назвати його, а не тихо перевірити щось інше й сказати PASS (експеримент GAME-19: `--content`
// замість `--dir` дав зелене про чужу теку). Новий сторож — додай у GUARDS.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const GUARDS = [
  ['node', 'scripts/validate-content.mjs'],
  ['node', 'scripts/mutate-validator.mjs'],
  ['node', 'scripts/check-rules.mjs'],
  ['node', 'scripts/maps/validate-maps.mjs'],
  ['node', 'scripts/maps/mutate.mjs'],
  ['node', 'scripts/assets/check-assets.mjs'],
  ['node', 'scripts/i18n/check-i18n.mjs'],
  ['node', 'scripts/skills/check-skill-codes.mjs'],
  ['node', 'scripts/campsites/check-campsites.mjs'],
  ['node', 'scripts/replay/check-builds.mjs'],
  ['python3', 'scripts/i18n/font_glyphs.py'],
];
// Різні форми помилки: схожий на справжній прапорець, зі значенням, опечатка.
const BOGUS = [['--content', 'content'], ['--selftest'], ['--dir=']];

let bad = 0;
for (const [bin, script] of GUARDS) {
  for (const extra of BOGUS) {
    const r = spawnSync(bin, [script, ...extra], { cwd: ROOT, encoding: 'utf8', timeout: 60_000 });
    const out = `${r.stdout}${r.stderr}`;
    const ok = r.status === 2 && out.includes('CLI_UNKNOWN_ARG');
    // --dir= — порожнє значення справжнього прапорця; у скриптів без --dir це теж незнайоме.
    if (!ok) { bad++; console.log(`FAIL ${script} ${extra.join(' ')} → код ${r.status}, ${out.split('\n')[0]}`); }
  }
}
console.log(bad ? `CLI GUARD: FAILED ${bad}` : `CLI GUARD: OK · ${GUARDS.length} сторожів × ${BOGUS.length} хибних аргументів → код 2`);
process.exit(bad ? 1 : 0);
