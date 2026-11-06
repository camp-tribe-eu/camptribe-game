// GAME-269 · «Відпочити до вечора»: мертве вікно дня (намет стоїть, обов'язкових кроків ще немає) перемотується до 17:30 родинною сценою.
// Сторож: вікно відчинене РІВНО там, де нічого не чекає гравця; негативні контролі — відкритий крок, розмова, після 17:30, без намету.
import { describe, expect, it } from 'vitest';
import { GAME_START_MINUTE, minuteOfDay } from '../core/clock';
import { dispatch, type Command } from '../core/commands';
import { newSim, step, type SimState } from '../core/sim';
import { initialState, type GameState } from '../core/state';
import { canRestNow, REST_SCENE, REST_TO } from '../core/story';
import { storyOffer } from '../view/story-offer';
import { agendaOf } from './agenda';
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
  it('день 1 і день 2: відчинене від ~11:00 до 17:29, зачинене з 17:30', () => {
    expect(canRestNow(STORY, camp(HELD1, 0), at(1, 11))).toBe(true);
    expect(canRestNow(STORY, camp(HELD2, 1), at(2, 12))).toBe(true);
    expect(canRestNow(STORY, camp(HELD2, 1), at(2, 17, 29))).toBe(true);
    expect(canRestNow(STORY, camp(HELD2, 1), at(2, 17, 30))).toBe(false);
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
  it('перемотує до 17:30, відкриває родинну сцену, нічого не відбирає', () => {
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
  });
});
