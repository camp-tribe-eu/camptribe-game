// GAME-106 · підсумок дня на екрані = підсумок ядра, рядок у рядок: шар view лише дає назви (ключі текстів), нічого не
// додає й не губить. Інакше «лише факти» ядра нічого б не доводили про те, що бачить гравець.
import { describe, expect, it } from 'vitest';
import type { Command } from '../core/commands';
import { daySummary, NIGHT_PREFIX } from '../core/day-summary';
import { newSim, step, type SimState } from '../core/sim';
import { GAME_DEFS } from '../content/slice-defs';
import { PROLOGUE_BIKE, SEED, START_MONEY } from '../content/replay.scenario';
import { nameKey, storyOffer, summaryOffer } from './story-offer';

const CTX = { defs: GAME_DEFS };
let n = 0;
const cmd = (s: SimState, c: Record<string, unknown>): SimState => step(s, { kind: 'command', command: { ...c, commandId: `v${n++}` } as unknown as Command }, CTX);

/** Пролог автом із зерном: подія в дорозі — кидок симуляції; повертає стан у кінці дня 1. */
function carDay(seed: number): SimState {
  let s = cmd(newSim(seed, 5_000), { type: 'CreateCharacter', profileId: 'profile.solo-explorer', transportId: 'transport.car' });
  for (const c of [{ type: 'CompleteQuest', questId: 'PROLOGUE-HOME-001' }, { type: 'CompleteQuest', questId: 'ST-001' }, { type: 'CompleteQuest', questId: 'ST-002' }, { type: 'Visit', locationId: 'loc.shop' },
    { type: 'Pickup', itemId: 'item.tent' }, { type: 'Pickup', itemId: 'item.sleeping-bag' }, { type: 'CompleteQuest', questId: 'ST-003' },
    { type: 'Visit', locationId: 'loc.home' }, { type: 'CompleteQuest', questId: 'CH1-HOME-001' }, { type: 'Visit', locationId: 'loc.road' }]) s = cmd(s, c);
  for (let i = 0; s.game.dialogue && i < 20; i++) { const d = s.game.dialogue; s = cmd(s, { type: 'Continue' }); if (s.game.dialogue === d) s = cmd(s, { type: 'Choose', choice: 1 }); }
  for (const c of [{ type: 'CompleteQuest', questId: 'ST-004' }, { type: 'Visit', locationId: 'loc.camp.lake' }, { type: 'Talk', npcId: 'npc.elise' }, { type: 'Choose', choice: 1 },
    { type: 'Continue' }, { type: 'Choose', choice: 0 }, { type: 'Continue' }, { type: 'Pickup', itemId: 'item.firewood' }, { type: 'CompleteQuest', questId: 'ST-005' }]) s = cmd(s, c);
  return s;
}

const expected = (sim: SimState) => {
  const sum = daySummary(sim, 1, GAME_DEFS);
  return sum && sum.sections.map((x) => ({ kind: x.kind, keys: x.ids.map((id) => (x.kind === 'night' ? `sum.night.${id.slice(NIGHT_PREFIX.length)}` : nameKey(id))) }));
};

describe('підсумок на екрані = підсумок ядра (GAME-106)', () => {
  const days = Array.from({ length: 16 }, (_, i) => carDay(100 + i));
  const withEvent = days.filter((s) => s.journal.some((e) => e.type === 'RoadEvent'));
  const without = days.filter((s) => !s.journal.some((e) => e.type === 'RoadEvent'));

  it('обидва випадки є серед зерен: подія в дорозі сталась і не сталась; день 1 завершено в кожному', () => {
    expect(days.every((s) => s.game.campaignEnded)).toBe(true);
    expect(withEvent.length).toBeGreaterThan(0);
    expect(without.length).toBeGreaterThan(0);
  });

  it('кожна секція й кожен ключ — з ядра; ключ назви існує (не null); гроші ті самі', () => {
    for (const s of [...days, (() => { let p = newSim(SEED, START_MONEY); for (const i of PROLOGUE_BIKE) p = step(p, i, CTX); return p; })()]) {
      const o = summaryOffer(s, GAME_DEFS);
      expect(o.daysEnded).toBe(1);
      expect(o.summary?.sections).toEqual(expected(s));
      expect(o.summary?.sections.flatMap((x) => x.keys).includes(null as never)).toBe(false);
      expect(o.summary?.money).toEqual(daySummary(s, 1, GAME_DEFS)?.money);
      expect(storyOffer(s, GAME_DEFS).offer.summary).toEqual(o.summary);   // той самий підсумок іде в знімок для UI
    }
  });

  it('без події в дорозі — секції «У дорозі» на екрані немає; з подією — є, і саме її назва', () => {
    for (const s of without) expect(summaryOffer(s, GAME_DEFS).summary?.sections.some((x) => x.kind === 'events')).toBe(false);
    for (const s of withEvent) expect(summaryOffer(s, GAME_DEFS).summary?.sections.find((x) => x.kind === 'events')?.keys).toEqual(['dlg.road-apples.title']);
  });

  it('до кінця дня підсумку на екрані немає (daysEnded 0)', () => {
    const s = cmd(newSim(1, 5_000), { type: 'CreateCharacter', profileId: 'profile.solo-explorer', transportId: 'transport.car' });
    expect(summaryOffer(s, GAME_DEFS)).toEqual({ daysEnded: 0, summary: null });
  });
});
