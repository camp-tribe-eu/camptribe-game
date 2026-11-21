// GAME-269 · «Відпочити до вечора»: мертве вікно дня (намет стоїть, обов'язкових кроків ще немає) перемотується до 18:00 родинною сценою.
// Сторож: вікно відчинене РІВНО там, де нічого не чекає гравця; негативні контролі — відкритий крок, розмова, після 18:00, без намету.
import { describe, expect, it } from 'vitest';
import { GAME_START_MINUTE, minuteOfDay } from '../core/clock';
import { dispatch, type Command } from '../core/commands';
import { newSim, step, type SimState } from '../core/sim';
import { initialState, type GameState } from '../core/state';
import { canRestNow, REST_SCENE, REST_TO } from '../core/story';
import { storyOffer } from '../view/story-offer';
import { agendaOf } from './agenda';
import { spotMove } from './director';
import { nextTarget, resolveSpot, spotLabel, TENT_SPOT } from './map-first';
import { GAME_DEFS } from './slice-defs';
import { STORY } from './story';

const at = (day: number, hh: number, mm = 0): number => (day - 1) * 1440 + hh * 60 + mm - GAME_START_MINUTE;
function camp(quests: GameState['quests'], slept: number, extra: Partial<GameState> = {}): GameState {
  return { ...initialState(0), slept, player: { profileId: 'profile.solo-explorer', transportId: 'transport.bike', animalId: 'animal.none', locationId: 'loc.camp.lake' }, flags: ['f.night-tent'], quests, ...extra };
}
const HELD1 = { 'CH1-D2-001': { status: 'active' as const, done: [] } };           // день 1, після намету: крок дня 2 чекає сну
const HELD2 = { 'CH1-D2-CAMP-001': { status: 'active' as const, done: [] } };      // день 2 після ELISE-001: вечірній крок чекає 18:00
const simOf = (g: GameState, minutes: number): SimState => { const s = newSim(1, 0); return { ...s, game: g, clock: { ...s.clock, minutes } }; };
const rest = (s: SimState): SimState => step(s, { kind: 'command', command: { type: 'RestUntilEvening', commandId: 'r1' } as Command }, { defs: GAME_DEFS });

describe('GAME-269 · вікно відпочинку', () => {
  it('день 1 і день 2: відчинене від ~11:00 до 17:59, зачинене з 18:00', () => {
    expect(canRestNow(STORY, camp(HELD1, 0), at(1, 11))).toBe(true);
    expect(canRestNow(STORY, camp(HELD2, 1), at(2, 12))).toBe(true);
    expect(canRestNow(STORY, camp(HELD2, 1), at(2, 17, 30)), 'GAME-356: 17:30 — ще вікно').toBe(true);
    expect(canRestNow(STORY, camp(HELD2, 1), at(2, 17, 59))).toBe(true);
    expect(canRestNow(STORY, camp(HELD2, 1), at(2, 18, 0))).toBe(false);
  });
  it('негативні контролі: відкритий обов\'язковий крок, відкрита справа хвилі, розмова, без намету, не в таборі', () => {
    expect(canRestNow(STORY, camp({ ...HELD2, 'ST-005': { status: 'active', done: [] } }, 1), at(2, 12)), 'крок ST-005 відкритий').toBe(false);
    expect(canRestNow(STORY, camp(HELD2, 1, { wave: { active: { waveId: 'w', tasks: { t: { outcome: 'open', dueAt: 9999 } } }, past: {} } } as unknown as Partial<GameState>), at(2, 12)), 'справа хвилі відкрита').toBe(false);
    expect(canRestNow(STORY, camp(HELD2, 1, { dialogue: { id: 'dlg.x', node: 's1' } }), at(2, 12)), 'розмова').toBe(false);
    expect(canRestNow(STORY, camp(HELD2, 1, { flags: [] }), at(2, 12)), 'без намету').toBe(false);
    expect(canRestNow(STORY, camp(HELD2, 1, { player: { profileId: 'p', transportId: 't', animalId: 'a', locationId: 'loc.shop' } }), at(2, 12)), 'не в таборі').toBe(false);
    expect(canRestNow(STORY, camp({}, 1), at(2, 12)), 'немає чого чекати').toBe(false);
  });
});

describe('GAME-269 · команда', () => {
  it('перемотує до 18:00, відкриває родинну сцену, нічого не відбирає', () => {
    const s0 = simOf(camp(HELD2, 1), at(2, 12));
    const s1 = rest(s0);
    expect(minuteOfDay(s1.clock.minutes)).toBe(REST_TO);
    expect(s1.game.dialogue?.id).toBe(REST_SCENE);
    expect(s1.game.moneyCents).toBe(s0.game.moneyCents);
    expect(s1.game.slept).toBe(1);
  });
  it('поза вікном ядро відмовляє й час не рухається', () => {
    const s0 = simOf(camp({ ...HELD2, 'ST-005': { status: 'active', done: [] } }, 1), at(2, 12));
    const r = dispatch(s0.game, { type: 'RestUntilEvening', commandId: 'r2' }, GAME_DEFS, undefined, undefined, undefined, s0.clock.minutes);
    expect(r.ok).toBe(false);
    expect(rest(s0).clock.minutes).toBe(s0.clock.minutes);
  });
  it('☰ і нотатник пропонують дію лише у вікні', () => {
    const inWin = simOf(camp(HELD2, 1), at(2, 12));
    expect(storyOffer(inWin, GAME_DEFS, { mapFirst: true, trunk: false, near: null }).offer.actions.some((a) => a.kind === 'rest')).toBe(true);
    expect(agendaOf(inWin, GAME_DEFS)?.items.map((i) => i.id)).toEqual(['rest', 'fish', 'neighbours']);
    const out = simOf(camp({ ...HELD2, 'ST-005': { status: 'active', done: [] } }, 1), at(2, 12));
    expect(storyOffer(out, GAME_DEFS, { mapFirst: true, trunk: false, near: null }).offer.actions.some((a) => a.kind === 'rest')).toBe(false);
    expect(agendaOf(out, GAME_DEFS)?.items.some((i) => i.id === 'rest') ?? false).toBe(false);
  });
  it('підказки узгоджені: стрілка «Далі» веде до намету, підпис намету — «Відпочити до вечора»', () => {
    const inWin = simOf(camp({ ...HELD2, 'ST-005': { status: 'completed', done: [] } }, 1), at(2, 12));   // у грі намет (ST-005) на цей час уже завершено
    expect(nextTarget(inWin, GAME_DEFS)).toEqual({ key: 'next.camp.rest', spot: TENT_SPOT });
    expect(spotLabel(inWin, GAME_DEFS, TENT_SPOT)?.label).toBe('act.rest');
  });
});

// GAME-356 · мертвий маркер 17:31–18:00: стрілка «Далі» вела до вогнища, яке в цю пів години нічого не робило. Сторож: у КОЖНУ хвилину доби, у кожному «чекальному» стані табору,
// ціль nextTarget має дію, яку ядро ПРИЙМАЄ; цілі без об'єкта (spot: null) — не про цей сторож.
const actionable = (s: SimState): { spot: string; ok: boolean } | null => {
  const n = nextTarget(s, GAME_DEFS);
  if (!n || n.spot === null || n.spot.startsWith('npc.')) return null;   // розмови (npc.*) живі чи ні — справа GAME-174 (next-always.test.ts), у вигаданому стані тут їх немає
  const move = n.spot === TENT_SPOT ? resolveSpot(s, GAME_DEFS, n.spot)?.moves[0] ?? null : spotMove(s, n.spot);
  if (!move) return { spot: n.spot, ok: false };
  // Відмова ядра (UNKNOWN_TARGET: вогнище без дії) теж переписує стан журналом помилок — тож міряємо саме `ok`, а не «стан змінився».
  const r = dispatch(s.game, { ...move, commandId: 'g356' } as Command, GAME_DEFS, undefined, undefined, undefined, s.clock.minutes);
  return { spot: n.spot, ok: r.ok };
};
// Вогнище дає ОДНУ разову нагороду (`rw.campfire-warmth`, side.ts): найгірший випадок для мертвого маркера — гравець її вже взяв, і дотик нічого не робить (GRANT_ALREADY_GIVEN).
const WARMED = { grants: ['rw.campfire-warmth'] };
const WAITING: readonly [string, GameState][] = [
  ['день 1, крок дня 2 чекає сну', camp({ 'ST-005': { status: 'completed', done: [] }, ...HELD1 }, 0, WARMED)],
  ['день 2, вечірній крок чекає 18:00', camp({ 'ST-005': { status: 'completed', done: [] }, ...HELD2 }, 1, WARMED)],
];
describe('GAME-356 · маркер «Далі» у таборі завжди веде до дії', () => {
  it('кожна хвилина 08:00–23:59 обох днів: ціль має дію, яку приймає ядро', () => {
    const bad: string[] = [];
    let checked = 0;
    for (const [name, g] of WAITING) for (let m = 8 * 60; m < 24 * 60; m++) {
      const day = (g.slept ?? 0) + 1;
      const a = actionable(simOf(g, at(day, 0, m)));
      if (a === null) continue;
      checked++;
      if (!a.ok) bad.push(`${name} ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')} → ${a.spot}`);
    }
    expect(checked, 'сторож щось перевірив').toBeGreaterThan(500);
    expect(bad.slice(0, 5), `хвилин без дії: ${bad.length}`).toEqual([]);
  });
});
