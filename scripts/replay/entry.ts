// Точка входу реплеїв для Node (GAME-34). Збирається `vite build --ssr` (так само, як гра: glob,
// JSON, TS) — і саме тому годиться для перевірки «дві різні збірки → той самий хеш».
//   node <збірка>/entry.mjs            JSON { файл: фінальний хеш | "ERR …" } на stdout
//   node <збірка>/entry.mjs --record   перезаписати еталони з поточного ядра (свідомо!)
import { writeFileSync } from 'node:fs';
import { describeInput, record, replay, type ReplayFile } from '../../src/core/replay';
import { fromSave, serialize } from '../../src/core/save';
import { newSim } from '../../src/core/sim';
import { GAME_DEFS } from '../../src/content/slice-defs';
import { PROLOGUE_BIKE, SEED, START_MONEY } from '../../src/content/replay.scenario';

const ctx = { defs: GAME_DEFS };
const argv = process.argv.slice(2);
if (argv.some((a) => a !== '--record')) { console.log(`::error::CLI_UNKNOWN_ARG · ${argv.join(' ')} · дозволено: --record`); process.exit(2); }

if (argv.includes('--record')) {
  const start = newSim(SEED, START_MONEY);
  const file: ReplayFile = { save: serialize(start), log: PROLOGUE_BIKE, hashes: record(start, PROLOGUE_BIKE, ctx) };
  writeFileSync(`${process.env.REPLAY_ROOT ?? '.'}/tests/replays/prologue-bike.json`, JSON.stringify(file, null, 1) + '\n');
  console.log(`записано tests/replays/prologue-bike.json · входів ${file.log.length} · кінець ${file.hashes.at(-1)}`);
} else {
  const files = import.meta.glob<ReplayFile>('../../tests/replays/*.json', { eager: true, import: 'default' });
  const out: Record<string, string> = {};
  for (const [path, f] of Object.entries(files)) {
    const s = fromSave(f.save);
    if (!s.ok) { out[path] = `ERR сейв ${s.code}`; continue; }
    const r = replay(s.sim, f, ctx);
    out[path.replace(/^.*\//, '')] = r.ok ? r.final : `ERR #${r.index} ${describeInput(r.input)}`;
  }
  console.log(JSON.stringify(out));
}
