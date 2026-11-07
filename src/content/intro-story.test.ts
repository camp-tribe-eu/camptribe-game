import { describe, expect, it } from 'vitest';
import { shopOpen, isNight, minuteOfDay } from '../core/clock';
import uk from '../i18n/uk.json';
import { dispatch, nextCommandId } from '../core/commands';
import { initialState, type GameState } from '../core/state';
import { GAME_DEFS } from './slice-defs';
import { INTRO_BEAT_QUESTS, INTRO_START_LABEL, SOLO_PROFILE, introHeroes, introBeatOf, INTRO_START_TOD, INTRO_STEPS, MORNING_AT, PICK_AT, afterPick, skipTarget } from './intro-story';

describe('вступ як розкадровка (GAME-249)', () => {
  it('порядок: пошук → лист → вибір → Атлас → план → ніч → ранок → метушня → мета', () => {
    expect(INTRO_STEPS.map((s) => s.kind)).toEqual(['search', 'letter', 'pick', 'atlas', 'line', 'line', 'line', 'line', 'night', 'morning', 'line', 'line', 'line', 'goal']);
  });
  it('ніч до сну, ранок після; останній рядок ночі — «Завтра рано. Спати.»', () => {
    expect(INTRO_STEPS.slice(0, MORNING_AT).every((s) => s.phase === 'night')).toBe(true);
    expect(INTRO_STEPS.slice(MORNING_AT).every((s) => s.phase === 'morning')).toBe(true);
    expect((uk as Record<string, string>)[INTRO_STEPS[MORNING_AT - 2]?.text ?? '']).toBe('Завтра рано. Спати.');
  });
  it('пропуск: без героя — до вибору, а після вибору — на ранок удома, ніколи повз ранок', () => {
    for (let i = 0; i < MORNING_AT; i++) expect(skipTarget(i, false)).toBe(i < PICK_AT ? PICK_AT : MORNING_AT);
    for (let i = 0; i < MORNING_AT; i++) expect(skipTarget(i, true)).toBe(MORNING_AT);
    expect(afterPick(true)).toBe(MORNING_AT);
    expect(afterPick(false)).toBe(PICK_AT + 1);
    for (let i = MORNING_AT; i < INTRO_STEPS.length; i++) expect(skipTarget(i, true)).toBeNull();
  });
  it('старт світу — 08:00 ранку: годинник ядра, не ніч, крамниця відчинена (підпис кроку «ранок» бере час із годинника)', () => {
    expect(INTRO_START_TOD).toBe(8 * 60);
    expect(INTRO_START_LABEL).toBe('08:00');
    expect(minuteOfDay(0)).toBe(INTRO_START_TOD);
    expect(isNight(0)).toBe(false);
    expect(shopOpen(0)).toBe(true);
    expect(uk['intro.morning' as keyof typeof uk]).toContain(INTRO_START_LABEL);
  });
});

describe('GAME-257: вступ закриває пролог, світ стартує зі зборів', () => {
  const create = (): GameState => {
    const r = dispatch(initialState(10_000), { type: 'CreateCharacter', commandId: 'c0', profileId: 'profile.solo-explorer', transportId: 'transport.bike' }, GAME_DEFS);
    if (!r.ok) throw new Error(r.code);
    return r.state;
  };
  /** Те саме, що робить main.introBeat: CompleteQuest для кожного ще активного квесту біта. */
  const play = (g: GameState, beat: 'atlas' | 'night' | 'morning'): GameState => {
    let s = g;
    for (const q of INTRO_BEAT_QUESTS[beat]) {
      if (s.quests[q]?.status !== 'active') continue;
      const r = dispatch(s, { type: 'CompleteQuest', commandId: nextCommandId(s), questId: q }, GAME_DEFS);
      if (!r.ok) throw new Error(`${q}: ${r.code}`);
      s = r.state;
    }
    return s;
  };
  const activeOf = (g: GameState): string[] => Object.entries(g.quests).filter(([, v]) => v.status === 'active').map(([k]) => k);

  it('після героя активний PROLOGUE-HOME-001; усі біти разом ведуть до єдиного активного ST-003', () => {
    const g = create();
    expect(activeOf(g)).toEqual(['PROLOGUE-HOME-001']);
    const a = play(g, 'atlas');
    expect(activeOf(a)).toEqual(['ST-002']);
    const n = play(a, 'night');
    expect(activeOf(n)).toEqual(['ST-003']);
    expect(play(n, 'morning')).toBe(n);   // ідемпотентно
  });
  it('«Пропустити вступ» (одразу біт morning) дає той самий стан, що й повний вступ', () => {
    const full = play(play(create(), 'atlas'), 'night');
    const skipped = play(create(), 'morning');
    expect(activeOf(skipped)).toEqual(['ST-003']);
    expect(skipped.quests).toEqual(full.quests);
    expect(skipped.moneyCents).toBe(full.moneyCents);
  });
  it('кроки розкадровки, що кличуть біт: atlas, night, morning', () => {
    expect(INTRO_STEPS.map((s) => introBeatOf(s.kind)).filter((b) => b !== null)).toEqual(['atlas', 'night', 'morning']);
  });
  it('GAME-265: вступ пропонує лише родину; соло — тільки з перемикачем e2e', () => {
    const all = [{ profileKey: 'profile.family-teen', n: 1 }, { profileKey: SOLO_PROFILE, n: 2 }, { profileKey: 'profile.family-teen', n: 3 }];
    expect(introHeroes(all).map((c) => c.n)).toEqual([1, 3]);
    expect(introHeroes(all, true)).toHaveLength(3);
  });
});
