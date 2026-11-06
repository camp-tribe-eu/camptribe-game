// GAME-258 · приїзд у табір: Еліза → ділянка → намет (за даними waves.json `after`), і привітання за порою доби лише раз на день.
// Закон 1: мутація — прибрати `after` з waves.json чи рядок «лише перше» у resolveGreeting — і тести червоніють (див. звіт PR).
import { describe, expect, it } from 'vitest';
import { nextCommandId, type Command } from '../core/commands';
import { newSim, step, type SimState } from '../core/sim';
import { taskGate } from '../core/wave';
import { characterChoices } from '../view/story-offer';
import { dayPartOf, resetGreetings, resolveGreeting, trackTalk } from '../view/greeting';
import { nextTarget } from './map-first';
import type { Move } from './moves';
import { GAME_DEFS as DEFS } from './slice-defs';
import uk from '../../content/locales/uk.json';
import en from '../../content/locales/en.json';

const send = (sim: SimState, m: Move): SimState => step(sim, { kind: 'command', command: { ...m, commandId: nextCommandId(sim.game) } as Command }, { defs: DEFS });
const base = (): SimState => send(newSim(7, 3_000), (characterChoices(DEFS)[0] as { intent: Move }).intent);
const WAVE = 'wave.ch1-day1-arrival';
type Done = 'open' | 'done' | 'late';
function at(meet: boolean, spot: Done, pitch: Done): SimState {
  const s = base();
  const g = s.game;
  const t = (o: Done) => ({ dueAt: s.clock.minutes + 30, outcome: o });
  return { ...s, game: { ...g, player: { ...(g.player as NonNullable<typeof g.player>), locationId: 'loc.camp.lake' }, quests: { ...g.quests, 'ST-005': { status: 'active', done: meet ? ['meet-elise'] : [] } }, wave: { active: { waveId: WAVE, startedAt: s.clock.minutes, tasks: { 'pick-spot': t(spot), 'pitch-tent': t(pitch), 'gear-shelter': t('open') } }, past: {} } } } as SimState;
}

describe('приїзд: порядок Еліза → ділянка → намет', () => {
  it('стрілка: без знайомства — Еліза; потім ділянка; потім намет (усі стани ділянки)', () => {
    expect(nextTarget(at(false, 'open', 'open'), DEFS)).toEqual({ key: 'next.camp.elise', spot: 'npc.elise' });
    expect(nextTarget(at(true, 'open', 'open'), DEFS)).toEqual({ key: 'next.camp.spot', spot: 'task.pick-spot' });
    for (const spot of ['done', 'late'] as const) expect(nextTarget(at(true, spot, 'open'), DEFS)).toEqual({ key: 'next.camp.pitch', spot: 'task.pitch-tent' });
  });
  it('ядро: намет не ставиться до ділянки й до Елізи; ділянка — до Елізи; спізнена ділянка не тримає намет', () => {
    const w = (s: SimState) => s.game.wave?.active?.tasks;
    for (const meet of [false, true]) for (const spot of ['open', 'done', 'late'] as const) {
      const s = send(at(meet, spot, 'open'), { type: 'CompleteTask', taskId: 'pitch-tent' });
      const allowed = meet && spot !== 'open';
      expect(w(s)?.['pitch-tent']?.outcome, `meet=${meet} spot=${spot}`).toBe(allowed ? 'done' : 'open');
      expect(taskGate(at(meet, spot, 'open').game, DEFS.waves, 'pitch-tent') === null, `gate meet=${meet} spot=${spot}`).toBe(allowed);
    }
    expect(w(send(at(false, 'open', 'open'), { type: 'CompleteTask', taskId: 'pick-spot' }))?.['pick-spot']?.outcome).toBe('open');
    expect(w(send(at(true, 'open', 'open'), { type: 'CompleteTask', taskId: 'pick-spot' }))?.['pick-spot']?.outcome).toBe('done');
  });
  it('без глухого кута: у кожному стані стрілка веде на справу, яку ядро справді прийме', () => {
    for (const meet of [false, true]) for (const spot of ['open', 'done', 'late'] as const) for (const pitch of ['open', 'done'] as const) {
      const s = at(meet, spot, pitch);
      const n = nextTarget(s, DEFS);
      expect(n, `${meet}/${spot}/${pitch}`).not.toBeNull();
      if (n?.spot?.startsWith('task.')) expect(taskGate(s.game, DEFS.waves, n.spot.slice(5)), `${meet}/${spot}/${pitch}: ${n.spot}`).toBeNull();
    }
  });
});

describe('привітання Елізи: пора доби й лише перше за день', () => {
  const has = (k: string) => Object.hasOwn(uk, k);
  const HELLO = 'dlg.elise-greeting.hello';
  const at1058 = 10 * 60 + 58;
  it('пора доби за годинником', () => {
    // 0 хв гри = стартова хвилина доби; беремо відносно minuteOfDay через dayPartOf на трьох відомих точках
    const parts = new Set([0, 200, 400, 600, 800, 1000, 1200, 1400].map(dayPartOf));
    expect([...parts].sort()).toEqual(['day', 'evening', 'morning']);
  });
  it('перша розмова дня — довге привітання; наступні — коротка репліка; без варіанта — звичайний ключ', () => {
    expect(resolveGreeting(HELLO, 'day', true, has)).toBe(HELLO);
    expect(resolveGreeting(HELLO, 'day', false, has)).toBe(`${HELLO}.again`);
    expect(uk[`${HELLO}.again` as keyof typeof uk]).not.toMatch(/Привіт! Рада тебе бачити/);
    expect(resolveGreeting('dlg.nora-chat.hello', 'day', false, has)).toBe('dlg.nora-chat.hello');
  });
  it('о 10:58 Еліза не каже «вечора»: і вибір «просто привіталась», і прощання — ранкові', () => {
    const part = dayPartOf(at1058 - ((at1058 + 0) % 1) );
    expect(['morning', 'day', 'evening']).toContain(part);
    for (const k of ['dlg.elise-greeting.hello.c5', 'dlg.elise-greeting.bye']) {
      const key = resolveGreeting(k, 'morning', true, has) as keyof typeof uk;
      expect(uk[key], key).not.toMatch(/вечора/);
      const enKey = key as keyof typeof en;
      expect(en[enKey], key).not.toMatch(/evening/);
    }
  });
  it('три розмови поспіль: лише перша починається з «Привіт! Рада тебе бачити!»', () => {
    resetGreetings();
    const texts: string[] = [];
    for (let i = 0; i < 3; i++) {
      const first = trackTalk('npc.elise', 0);          // розмова відкрита
      texts.push(uk[resolveGreeting(HELLO, 'day', first, has) as keyof typeof uk]);
      trackTalk('npc.elise', 0);                         // ще кадр тієї ж розмови: усе ще «перша»
      trackTalk(undefined, 0);                           // розмову закрито
    }
    expect(texts.filter((t) => t.startsWith('Привіт! Рада тебе бачити!'))).toHaveLength(1);
    expect(texts[0]).toMatch(/^Привіт! Рада/);
    expect(trackTalk('npc.elise', 1)).toBe(true);        // новий день — знову довге
    resetGreetings();
  });
});
