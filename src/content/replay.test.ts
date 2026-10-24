// GAME-34 · реплей-тести: сейв + журнал → той самий хеш після кожного входу (Node, CI).
// Перезаписати еталон свідомо: npm run replay:record (і пояснити в коміті, ЯКЕ правило змінилось —
// інакше це приховування регресії). Дві різні збірки → той самий хеш: npm run replay:builds.
import { describe, expect, it } from 'vitest';
import { dispatch } from '../core/commands';
import type { CoreDefs, StoryDefs } from '../core/defs';
import { describeInput, record, replay, type ReplayFile } from '../core/replay';
import { fromSave } from '../core/save';
import { findsSystem, newSim, step, type SimState, type System } from '../core/sim';
import { nextInt } from '../core/rng';
import { GAME_DEFS } from './slice-defs';
import { PROLOGUE_BIKE, SEED, START_MONEY } from './replay.scenario';

const FILES = import.meta.glob<ReplayFile>('../../tests/replays/*.json', { eager: true, import: 'default' });
const CTX = { defs: GAME_DEFS };

const startOf = (f: ReplayFile): SimState => {
  const r = fromSave(f.save);
  if (!r.ok) throw new Error(`сейв реплею не читається: ${r.code} ${r.detail}`);
  return r.sim;
};

describe('реплеї журналу (GAME-34)', () => {
  it('еталонів більше нуля (порожня тека — не «усе гаразд»)', () => {
    expect(Object.keys(FILES).length).toBeGreaterThan(0);
  });

  for (const [path, file] of Object.entries(FILES)) {
    it(`${path.replace(/^.*\//, '')}: кожен вхід дає збережений хеш`, () => {
      const r = replay(startOf(file), file, CTX);
      expect(r.ok, r.ok ? '' : `розійшлось на #${r.index}: ${describeInput(r.input)} · ${r.expected} → ${r.actual}`).toBe(true);
      expect(r.ok && r.final).toBe(file.hashes.at(-1));
    });
  }

  it('сценарій еталону справді проходить Пролог (інакше реплей сторожить порожнечу)', () => {
    let s = newSim(SEED, START_MONEY);
    const rejected: string[] = [];
    for (const i of PROLOGUE_BIKE) {
      if (i.kind === 'command') { const r = dispatch(s.game, i.command, GAME_DEFS); if (!r.ok) rejected.push(`${i.command.type}:${r.code}`); }
      s = step(s, i, CTX);
    }
    expect(rejected).toEqual(['Pickup:ITEM_ALREADY_HELD', 'PackItem:PACK_FULL']);     // лише навмисна відмова (GAME-81: дрова в таборі тепер підбираються — їх не купили наперед)
    expect(s.game.campaignEnded).toBe(true);
    expect(s.game.grants).toEqual(['rw.campfire-warmth', 'rw.q-elise-bike-area', 'rw.st-005']);
    expect(s.finds).toBeGreaterThan(0);                                                      // RNG справді працював
    expect(PROLOGUE_BIKE.map((i) => i.kind)).toEqual(expect.arrayContaining(['frame', 'command', 'pause', 'resume', 'advance']));
  });
});

describe('негативні контролі: зміна формули без оновлення еталону червоніє й називає перший вхід', () => {
  const file = FILES['../../tests/replays/prologue-bike.json'] as ReplayFile;

  it('формула каталогу: нагорода ST-005 на 1 цент більша → розходиться саме на завершенні ST-005', () => {
    const story = GAME_DEFS.story as StoryDefs;
    const st005 = story.quests['ST-005'] as StoryDefs['quests'][string];
    const defs: CoreDefs = { ...GAME_DEFS, story: { ...story, quests: { ...story.quests, 'ST-005': { ...st005, reward: { ...(st005.reward as NonNullable<typeof st005.reward>), moneyCents: 1001 } } } } };
    const r = replay(startOf(file), file, { defs });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(describeInput(r.input)).toMatch(/^command CompleteQuest ST-005 \(r\d+\)$/);
  });

  it('формула системи: шанс знахідки 1/49 замість 1/50 → розходиться на кадрі', () => {
    const tweaked: System = (s, steps) => {
      let rng = s.rng; let finds = s.finds;
      for (let i = 0; i < steps; i++) { const r = nextInt(rng, 49); rng = r.state; if (r.value === 0) finds++; }
      return { ...s, rng, finds };
    };
    const r = replay(startOf(file), file, { defs: GAME_DEFS, systems: [tweaked] });
    // Незалежно: перший індекс, де запис зі зміненою системою розходиться з еталоном (рецензія GAME-34:
    // «/^frame /» пропускав реплей, що звітує ОСТАННІЙ кадр розбіжності, а не перший).
    const first = record(startOf(file), file.log, { defs: GAME_DEFS, systems: [tweaked] }).findIndex((h, i) => h !== file.hashes[i]);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.index).toBe(first); expect(describeInput(r.input)).toMatch(/^frame /); }
    // позитивний контроль: справжня система — зелена
    expect(replay(startOf(file), file, { defs: GAME_DEFS, systems: [findsSystem] }).ok).toBe(true);
  });

  it('порожній чи неузгоджений журнал — не «усе гаразд»', () => {
    expect(replay(startOf(file), { log: [], hashes: [] }, CTX).ok).toBe(false);
    expect(replay(startOf(file), { log: file.log, hashes: file.hashes.slice(1) }, CTX).ok).toBe(false);
  });
});
