// GAME-189 · на ST-005 у таборі підпис цілі й стрілка завжди називають те саме місце/дію (власник застряг: «не кажуть де»).
// Мутація (закон 1): повернути старий рядок — «поки не зроблено обидва, стрілка на Елізу» — і тест червоніє на стані «намет можна ставити».
import { describe, expect, it } from 'vitest';
import { nextCommandId, type Command } from '../core/commands';
import { newSim, step, type SimState } from '../core/sim';
import { characterChoices } from '../view/story-offer';
import { PITCH_TASK, nextTarget } from './map-first';
import { liveSpot } from './director';
import type { Move } from './moves';
import { GAME_DEFS as DEFS } from './slice-defs';

const send = (sim: SimState, m: Move): SimState => step(sim, { kind: 'command', command: { ...m, commandId: nextCommandId(sim.game) } as Command }, { defs: DEFS });
const base = (): SimState => send(newSim(7, 3_000), (characterChoices(DEFS)[0] as { intent: Move }).intent);
const WAVE = 'wave.ch1-day1-arrival';

interface Case { meet: boolean; pitch: boolean; task: 'open' | 'done' | 'late' | 'none'; wood: boolean }
/** Стан табору на ST-005: які цілі кроку зроблено, у якому стані справа хвилі «Намет» і чи є дрова. */
function at(c: Case): SimState {
  const s = base();
  const g = s.game;
  const done = [...(c.meet ? ['meet-elise'] : []), ...(c.pitch ? ['pitch-tent'] : [])];
  const tasks = c.task === 'none' ? {} : { 'pitch-tent': { dueAt: s.clock.minutes + 30, outcome: c.task } };
  return { ...s, game: { ...g, player: { ...(g.player as NonNullable<typeof g.player>), locationId: 'loc.camp.lake' }, quests: { ...g.quests, 'ST-005': { status: 'active', done } }, inventory: c.wood ? { ...g.inventory, 'item.firewood': 1 } : g.inventory, wave: { active: c.task === 'none' ? null : { waveId: WAVE, startedAt: s.clock.minutes, tasks }, past: {} } } } as SimState;
}

const CASES: Case[] = [];
for (const meet of [false, true]) for (const pitch of [false, true]) for (const task of ['open', 'done', 'late', 'none'] as const) for (const wood of [false, true]) CASES.push({ meet, pitch, task, wood });
/** Що кожен підпис обіцяє: куди веде стрілка. */
const SPOT_OF: Readonly<Record<string, string>> = { 'next.camp.pitch': `task.${PITCH_TASK}`, 'next.camp.elise': 'npc.elise', 'next.camp.elise.spot': 'npc.elise', 'next.camp.firewood': 'take.item.firewood', 'next.camp.task': '' };

describe('ST-005 у таборі: підпис і стрілка збігаються', () => {
  it(`усі ${CASES.length} станів: ключ підпису ↔ місце стрілки; «постав намет» лише коли справа жива й місце є; «спитай Елізу» лише коли намет-крок не зроблено`, () => {
    for (const c of CASES) {
      const s = at(c);
      const n = nextTarget(s, DEFS);
      const label = JSON.stringify(c);
      expect(n, label).not.toBeNull();
      const { key } = n as NonNullable<typeof n>;
      const spot = n?.spot ?? '';
      if (key === 'next.camp.task') expect(spot.startsWith('task.'), label).toBe(true);
      else if (key in SPOT_OF) expect(spot, `${label}: підпис ${key} веде не туди`).toBe(SPOT_OF[key]);
      else expect(key.startsWith('next.camp.'), `${label}: несподіваний підпис ${key}`).toBe(true);
      if (key === 'next.camp.pitch') { expect(c.task, label).toBe('open'); expect(liveSpot(s, spot, DEFS), `${label}: ціль «постав намет» мусить бути живим об'єктом`).toBe(true); }
      if (key === 'next.camp.elise.spot') { expect(c.meet && !c.pitch, label).toBe(true); expect(c.task === 'open', label).toBe(false); }
      // Головне: поки справа «Намет» відкрита, стрілка НІКОЛИ не на Елізу.
      if (c.task === 'open') expect(spot, label).toBe(`task.${PITCH_TASK}`);
    }
  });
  it('після знайомства з Елізою й відкритої справи стрілка — на місце намету з підписом «постав намет тут» (не на Елізу)', () => {
    const n = nextTarget(at({ meet: true, pitch: false, task: 'open', wood: false }), DEFS);
    expect(n).toEqual({ key: 'next.camp.pitch', spot: 'task.pitch-tent' });
  });
});
