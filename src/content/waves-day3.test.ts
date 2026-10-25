// GAME-170 зріз 3 · W5 «Не залишати слідів до 11:00» (день 3) — ДАНІ БЕЗ ПІДКЛЮЧЕННЯ: етапу дня 3 ще немає в main (GAME-144 —
// чернетка), тож хвиля лежить у tests/waves/ch1-day3-checkout.json разом зі своїм етапом-заглушкою й текстами. Тут доводиться, що
// в день, коли етап з'явиться, хвилю можна перенести в content/waves.json без правок: валідатор на справжньому контенті + W5 чистий
// (0 помилок, і контроль: зламана W5 — червона), а ядро проходить її для кожної комбінації без тупиків.
import { describe, expect, it } from 'vitest';
import type { Command } from '../core/commands';
import type { CoreDefs } from '../core/defs';
import { canonical } from '../core/hash';
import { newSim, step, type SimState } from '../core/sim';
import { matches } from '../core/story';
import { waveView } from '../core/wave';
import { validate } from '../../scripts/validator/checks.mjs';
import { enumerateCombos } from '../../scripts/validator/combos.mjs';
import { loadContent } from '../../scripts/validator/load.mjs';
import bundle from '../../tests/waves/ch1-day3-checkout.json';
import { GAME_DEFS } from './slice-defs';
import { CONTENT } from './story';
import { compileWaves, RAW_WAVES, type RawWave } from './waves';
type Cmd = Command extends infer C ? (C extends Command ? Omit<C, 'commandId'> : never) : never;

const W5 = bundle.wave as RawWave;
const TODAY = new Date().toISOString().slice(0, 10);
type Content = Record<string, unknown> & { waves?: unknown[]; quests: unknown[]; locales: Record<string, Record<string, string>> };

function merged(patch: (w: RawWave) => RawWave = (w) => w): Content {
  const loaded = loadContent('content');
  if (!loaded.content) throw new Error(`контент не завантажився: ${JSON.stringify(loaded.issues)}`);
  const c = structuredClone(loaded.content) as Content;
  const locales = Object.fromEntries(Object.entries(c.locales).map(([lang, dict]) => [lang, { ...dict, ...(bundle.locales as Record<string, Record<string, string>>)[lang] }]));
  return { ...c, quests: [...c.quests, bundle.stage], waves: [...(c.waves ?? []), patch(structuredClone(W5))], locales };
}
// Етап-заглушка навмисно не вшитий у ланцюг квестів (це зробить GAME-144), тож три знахідки про сам етап (недосяжний зі старту,
// без шляху до кінця, без наступного етапу) — очікувані й лише про CH1-D3-001; усе інше — про хвилю, і його мусить бути 0.
const STUB_ONLY = ['NODE_UNREACHABLE', 'NO_PATH_TO_END', 'BRANCH_NO_NEXT'];
const codes = (c: Content): string[] => validate(c, { today: TODAY }).filter((i) => !(i.where === bundle.stage.id && STUB_ONLY.includes(i.code))).map((i) => i.code).sort();

describe('W5 «Не залишати слідів до 11:00» — дані дня 3 без підключення (GAME-170, зріз 3)', () => {
  it('W5 ще не в content/waves.json (етапу CH1-D3-001 немає в main); у пакеті — етап-заглушка в локації табору', () => {
    expect(RAW_WAVES.some((w) => w.id === W5.id)).toBe(false);
    expect(GAME_DEFS.story?.quests[bundle.stage.id]).toBeUndefined();
    expect(bundle.stage.locationId).toBe('loc.camp.lake');
  });

  it('валідатор: справжній контент + етап-заглушка + W5 — 0 помилок; контроль: без наслідку late / з Мією біля води — червоно', () => {
    expect(codes(merged())).toEqual([]);
    expect(validate(merged(), { today: TODAY }).map((i) => i.code).sort()).toEqual([...STUB_ONLY].sort());   // саме ці три, і лише про заглушку
    expect(codes(merged((w) => ({ ...w, tasks: w.tasks.map((t) => (t.id === 'clean-up' ? { ...t, late: undefined as never } : t)) })))).toContain('WAVE_OUTCOME_MISSING');
    expect(codes(merged((w) => ({ ...w, tasks: w.tasks.map((t) => (t.id === 'mia-carrier-home' ? { ...t, targets: [{ id: 'spot.shore', safe: false }] } : t)) })))).toContain('WAVE_ANIMAL_UNSAFE');
    // Набір справ W5 не повторює жодної хвилі розділу 1 (WAVE_REPEATED мовчить), а строки — 30–60 хв (≈ с).
    for (const t of W5.tasks) { expect(t.limitMin).toBeGreaterThanOrEqual(30); expect(t.limitMin).toBeLessThanOrEqual(60); }
  });

  it('ядро: для кожної комбінації W5 стартує на етапі-заглушці, варіант за сценарієм, повний перебір без тупиків, усе-late без поразки', () => {
    const story = GAME_DEFS.story;
    if (!story) throw new Error('немає сюжету');
    const DEFS: CoreDefs = { ...GAME_DEFS, waves: compileWaves([...RAW_WAVES, W5]), story: { ...story, quests: { ...story.quests, [bundle.stage.id]: { optional: false, end: false, locationId: 'loc.camp.lake', objectives: [], transitions: [] } } } };
    const CTX = { defs: DEFS };
    const cmd = (s: SimState, c: Cmd): SimState => step(s, { kind: 'command', command: { ...c, commandId: `d${s.game.seq}` } as Command }, CTX);
    const ok = (s: SimState): boolean => s.game.processed[`d${s.game.seq - 1}`]?.ok === true;
    const W = DEFS.waves?.waves[W5.id];
    if (!W) throw new Error('W5 не скомпільовано');
    const ended = (s: SimState): boolean => s.game.wave?.active === null && s.game.wave.past[W5.id] !== undefined;
    let combosTried = 0;
    for (const k of enumerateCombos(CONTENT)) {
      const p = { profileId: k.profile ?? '', transportId: k.transport ?? '', animalId: k.animal === 'animal.none' ? undefined : k.animal } as never;
      if (!matches(W.when, p)) continue;
      combosTried++;
      let s = cmd(newSim(3, 5_000), { type: 'CreateCharacter', profileId: k.profile ?? '', transportId: k.transport ?? '', ...(k.animal === 'animal.none' ? {} : { animalId: k.animal }) });
      s = step(s, { kind: 'advance', minutes: 3 * 1440 + 10 * 60 }, CTX);
      s = { ...s, game: { ...s.game, quests: { ...s.game.quests, [bundle.stage.id]: { status: 'active', done: [] } } } };
      s = cmd(s, { type: 'StartWave', waveId: W5.id });
      expect(ok(s), `${k.profile} ${k.transport} ${k.animal}`).toBe(true);
      const ids = (waveView(s.game, s.clock.minutes)?.tasks.map((t) => t.id) ?? []).sort();
      expect(ids).toEqual(['clean-up', 'pack-tent', 'walk-site', ...(k.animal === 'animal.cat' ? ['mia-carrier-home'] : [])].sort());
      if (k.animal === 'animal.cat') {
        const h = cmd(s, { type: 'CompleteTask', taskId: 'mia-carrier-home', actor: 'helper' });
        expect(h.game.processed[`d${h.game.seq - 1}`]?.code).toBe('TASK_LEADER_ONLY');
      }
      const late = step(s, { kind: 'frame', realMs: 61_000 }, CTX);
      expect(ended(late)).toBe(true);
      expect(Object.values(late.game.wave?.past[W5.id] ?? {})).toEqual(ids.map(() => 'late'));
      expect(late.game.campaignEnded).toBe(false);
      // Повний перебір «зробити» × «дочекатись строку».
      const key = (x: SimState): string => canonical({ w: x.game.wave, m: x.clock.minutes });
      const seen = new Set<string>([key(s)]);
      const queue = [s];
      let finals = 0;
      for (let cur = queue.shift(); cur; cur = queue.shift()) {
        if (ended(cur)) { finals++; continue; }
        const v = waveView(cur.game, cur.clock.minutes);
        if (!v) throw new Error('живої хвилі немає, хоч вона не закінчена');
        const open = v.tasks.filter((t) => t.outcome === 'open');
        expect(open.length).toBeGreaterThan(0);
        const next: SimState[] = open.map((t) => { const n = cmd(cur as SimState, { type: 'CompleteTask', taskId: t.id }); expect(ok(n), t.id).toBe(true); return n; });
        const soonest = Math.min(...open.map((t) => t.remainingMin));
        next.push(step(cur, { kind: 'advance', minutes: soonest + 1 }, CTX), step(cur, { kind: 'advance', minutes: soonest }, CTX));
        for (const n of next) { const h = key(n); if (!seen.has(h)) { seen.add(h); queue.push(n); } }
        expect(seen.size).toBeLessThan(5_000);
      }
      expect(finals).toBeGreaterThan(1);
    }
    expect(combosTried).toBeGreaterThan(1);
  });
});
