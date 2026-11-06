/// <reference types="node" />
// GAME-264 · кінець розділу вдома не глухий кут. Розділ 1 закінчується, коли родина приїхала додому в день 3 (CH1-D3-HOME-001, `end`): стрілка й нотатник мовчать (розділ завершено),
// тож єдиною дією лишався сон — але лише з 18:00 і лише з ☰. Сторож: у кожен час доби на кінці розділу вдома є ДІЯ «спати» (ядро, ☰ і підсумок питають те саме), підсумок розділу готовий,
// а сон справді рахується (лічильник rest.slept, з якого Shell показує тизер розділу 2). Фікстура e2e (tests/e2e/fixtures/day3-return.json) — стан, зібраний ядром, не вигаданий:
// `G264_WRITE=1 npx vitest run src/content/game-264.test.ts` переписує її; без прапорця тест звіряє її з тим, що ядро збирає зараз.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dispatch, type Command } from '../core/commands';
import { serialize } from '../core/save';
import { newSim, step, type SimState } from '../core/sim';
import { initialState } from '../core/state';
import { canSleepNow, chapterComplete } from '../core/story';
import { storyOffer } from '../view/story-offer';
import type { Move } from './moves';
import { GAME_DEFS } from './slice-defs';
import { STORY } from './story';
import { SLEEP } from './test-days';

const FILE = new URL('../../tests/e2e/fixtures/day3-return.json', import.meta.url);
const CTX = { defs: GAME_DEFS };
let n = 0;
const cmd = (s: SimState, m: Move): SimState => step(s, { kind: 'command', command: { ...m, commandId: `g264-${n++}` } as unknown as Command }, CTX);
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
function onRoadHome(): SimState {
  const script: Move[] = [
    { type: 'CreateCharacter', profileId: 'profile.family-teen', transportId: 'transport.car', animalId: 'animal.cat' } as Move,
    done('PROLOGUE-HOME-001'), done('ST-001'), done('ST-002'),
    visit('loc.shop'), { type: 'Pickup', itemId: 'item.tent' }, { type: 'Pickup', itemId: 'item.sleeping-bag' }, done('ST-003'),
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
    const r = dispatch(game, { ...m, commandId: `g264-${n++}` } as Command, GAME_DEFS);
    if (!r.ok) throw new Error(`${JSON.stringify(m)} → ${r.code}`);
    game = r.state;
  }
  const base = newSim(7, 5_000);
  const morning3 = base.clock.minutes - (base.clock.minutes % 1440) + 2 * 1440 + 7 * 60;
  const entry = (at: number, type: string, ref: string | null): SimState['journal'][number] => ({ at, commandId: `g264-j${n++}`, type, ref, cents: 5_000 }) as SimState['journal'][number];
  const journal = [entry(base.clock.minutes, 'CreateCharacter', null), entry(base.clock.minutes + 600, 'CompleteQuest', 'ST-005'), entry(base.clock.minutes + 1000, 'Sleep', null), entry(base.clock.minutes + 1500, 'CompleteQuest', 'CH1-D2-FIRE-001'), entry(base.clock.minutes + 2000, 'Sleep', null)];
  return { ...base, game, clock: { ...base.clock, minutes: Math.max(morning3, base.clock.minutes + 2100) }, journal };
}
const atEnd = (s: SimState): SimState => cmd(cmd(s, visit("loc.home")), done("CH1-D3-HOME-001"));

describe('GAME-264 · кінець розділу: завжди є наступна дія', () => {
  it('фікстура e2e (дорога додому, день 3) = те, що ядро збирає зараз', () => {
    const json = `${serialize(onRoadHome())}\n`;
    if (process.env.G264_WRITE === '1' || !existsSync(FILE)) { writeFileSync(FILE, json); return; }
    expect(readFileSync(FILE, 'utf8'), 'фікстура розійшлась із ядром: перезапиши G264_WRITE=1').toBe(json);
  });

  it('кінець розділу вдома: розділ закрито, підсумок дня 3 готовий, і в КОЖНУ годину доби є дія «спати» (ядро = пропозиція UI)', () => {
    const end = atEnd(onRoadHome());
    expect(end.game.campaignEnded).toBe(true);
    expect(chapterComplete(end.game, STORY)).toBe(true);
    expect(end.game.player?.locationId).toBe('loc.home');
    for (let hour = 0; hour < 24; hour++) {
      const sim: SimState = { ...end, clock: { ...end.clock, minutes: Math.floor(end.clock.minutes / 1440) * 1440 + hour * 60 } };
      expect(canSleepNow(STORY, sim.game, sim.clock.minutes), `${hour}:00 — спати можна`).toBe(true);
      const o = storyOffer(sim, GAME_DEFS).offer;
      expect(o.stage).toBe('ended');
      expect(o.actions.some((a) => a.kind === 'sleep'), `${hour}:00 — у пропозиції є «спати»`).toBe(true);
    }
    const o = storyOffer(end, GAME_DEFS).offer;
    expect(o.daysEnded).toBeGreaterThanOrEqual(3);
    expect(o.summary?.day, 'підсумок розділу — день 3').toBe(3);
    expect(o.summary?.nextKey, 'розділ завершено — «наступного разу» немає').toBeNull();
  });

  it('сон на кінці розділу справді рахується: rest.slept росте (з нього Shell показує тизер розділу 2), розділ лишається завершеним', () => {
    const end = atEnd(onRoadHome());
    const before = storyOffer(end, GAME_DEFS).offer.rest.slept;
    const slept = cmd(end, { type: 'Sleep' });
    expect(storyOffer(slept, GAME_DEFS).offer.rest.slept).toBe(before + 1);
    expect(slept.game.campaignEnded).toBe(true);
  });
});
