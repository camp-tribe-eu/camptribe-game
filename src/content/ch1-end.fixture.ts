// GAME-286 · стан кінця розділу 1 для тестів розділу 2: ядро само проходить розділ (копія сценарію GAME-264 — своє ім'я команд, щоб не зачепити фікстуру day3-return).
import { dispatch, type Command } from '../core/commands';
import { newSim, step, type SimState } from '../core/sim';
import { initialState } from '../core/state';
import type { Move } from './moves';
import { GAME_DEFS } from './slice-defs';
import { SLEEP } from './test-days';


const CTX = { defs: GAME_DEFS };
let n = 0;
const choose = (choice: number): Move => ({ type: 'Choose', choice });
const next: Move = { type: 'Continue' };
const done = (questId: string): Move => ({ type: 'CompleteQuest', questId });
const visit = (locationId: string): Move => ({ type: 'Visit', locationId });
const talk: Move = { type: 'Talk', npcId: 'npc.elise' };
/**
 * Дні 1–3 до мита, коли родина (авто, кіт) на дорозі додому: CH1-D3-RETURN-001 завершено, лишилось приїхати. Ходи — ті самі, що в day3.test (чисте ядро: вечірні сцени й справи хвиль
 * там не відтворюються годинником), тож журнал і годинник тут зібрано окремо: два справжні сни (Sleep у журналі) і ранок дня 3, 07:00. Це межа фікстури, а не прихована підміна:
 * сторож нижче перевіряє те, що від цього не залежить (кінець розділу вдома, дія «спати», підсумок дня 3, лічильник сну).
 */
export function onRoadHome(): SimState {
  const script: Move[] = [
    { type: 'CreateCharacter', profileId: 'profile.family-teen', transportId: 'transport.car', animalId: 'animal.cat' } as Move,
    done('PROLOGUE-HOME-001'), done('ST-001'), done('ST-002'),
    visit('loc.shop'), { type: 'Pickup', itemId: 'item.tent' }, { type: 'Pickup', itemId: 'item.sleeping-bag' }, { type: 'Checkout' }, done('ST-003'),   // GAME-246: полиця — у кошик, власністю робить каса
    visit('loc.home'), done('CH1-HOME-001'), visit('loc.road'), done('ST-004'), visit('loc.camp.lake'),
    talk, choose(1), next, choose(0), next, { type: 'Pickup', itemId: 'item.firewood' }, done('ST-005'), SLEEP,
    done('CH1-D2-001'), talk, choose(10), choose(1), next, done('CH1-D2-ELISE-001'),
    talk, choose(13), choose(0), next, next, done('CH1-D2-CAMP-001'), done('CH1-D2-FIRE-001'), SLEEP,
    done('CH1-D3-001'), done('CH1-D3-GEAR-001'),
    talk, choose(14), next, choose(0), next, next, done('CH1-D3-ELISE-001'),
    visit('loc.road'), done('CH1-D3-RETURN-001'),
  ];
  let game = initialState(5_000);
  for (const m of script) {
    const r = dispatch(game, { ...m, commandId: `g286-${n++}` } as Command, GAME_DEFS);
    if (!r.ok) throw new Error(`${JSON.stringify(m)} → ${r.code}`);
    game = r.state;
  }
  const base = newSim(7, 5_000);
  const morning3 = base.clock.minutes - (base.clock.minutes % 1440) + 2 * 1440 + 7 * 60;
  const entry = (at: number, type: string, ref: string | null): SimState['journal'][number] => ({ at, commandId: `g286-j${n++}`, type, ref, cents: 5_000 }) as SimState['journal'][number];
  const journal = [entry(base.clock.minutes, 'CreateCharacter', null), entry(base.clock.minutes + 600, 'CompleteQuest', 'ST-005'), entry(base.clock.minutes + 1000, 'Sleep', null), entry(base.clock.minutes + 1500, 'CompleteQuest', 'CH1-D2-FIRE-001'), entry(base.clock.minutes + 2000, 'Sleep', null)];
  return { ...base, game, clock: { ...base.clock, minutes: Math.max(morning3, base.clock.minutes + 2100) }, journal };
}
/** Родина вдома, CH1-D3-HOME-001 завершено: розділ 1 закінчено (campaignEnded), розділ 2 ще не починали. */
export const ch1End = (): SimState => step(step(onRoadHome(), { kind: 'command', command: { type: 'Visit', locationId: 'loc.home', commandId: 'g286-v' } as unknown as Command }, CTX), { kind: 'command', command: { type: 'CompleteQuest', questId: 'CH1-D3-HOME-001', commandId: 'g286-e' } as unknown as Command }, CTX);
