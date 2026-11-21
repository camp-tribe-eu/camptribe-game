// GAME-337 · pendingTrip: крок «Іду до…» відомий зі стану, ще до входу в зону. Мутація (перевірено): прибрати перевірку minigames → «міні-гру зіграно» червоніє.
import { describe, expect, it } from 'vitest';
import { MISSIONS } from '../content/missions';
import type { GameState } from '../core/state';
import mainSource from '../main.ts?raw';
import { guideLive, missionTarget, pendingTrip, reportBack, tripGuide } from './mission-work';
import { goalNames } from '../content/sample-day';

const g = (flags: string[], minigames: Record<string, unknown> = {}): GameState => ({ flags, minigames } as unknown as GameState);
const m = MISSIONS[0];
const t = m?.trips[0];

describe('pendingTrip', () => {
  it('прапорця походу нема — null', () => { expect(pendingTrip(g([]))).toBeNull(); });
  it('прапорець є, міні-гру не зіграно — цей похід', () => { expect(pendingTrip(g([t?.flag ?? '']))).toBe(t); });
  it('міні-гру зіграно — похід минув', () => { expect(pendingTrip(g([t?.flag ?? ''], { [t?.minigame ?? '']: { last: 'good' } }))).toBeNull(); });
  it('місію здано — похід не висить', () => { expect(pendingTrip(g([t?.flag ?? '', m?.doneFlag ?? '']))).toBeNull(); });
});

// GAME-340 · стрілка до цілі походу. Мутація (перевірено): tripGuide завжди false → червоніє.
describe('tripGuide', () => {
  it('ціль «trip.*» — стрілка є; інші цілі й порожня — ні (там діє навчання)', () => {
    expect(tripGuide('trip.sanitary')).toBe(true);
    expect(tripGuide('trip.pier')).toBe(true);
    expect(tripGuide('npc.luc')).toBe(false);
    expect(tripGuide(null)).toBe(false);
  });
});

// GAME-340 · Аміна: навчання вже скінчилось (guide=false), а ціль — зона походу: стрілка мусить лишитись. Мутація (перевірено): guideLive повертає лише base → червоніє.
describe('guideLive', () => {
  it('навчання скінчилось, ціль — похід → стрілка; ціль — NPC → ні', () => {
    expect(guideLive(false, 'trip.sanitary')).toBe(true);
    expect(guideLive(false, 'npc.luc')).toBe(false);
    expect(guideLive(true, null)).toBe(true);
  });
  it('обидва гачки main.ts (guide і hintTick) беруть її з guideLive', () => {
    expect(mainSource).toContain('return guideLive(guideOn, worldHooks.target(), reportGiver());');
    expect(mainSource).toContain('const v = guideLive(hintIdle.tick(dt, worldHooks.target(), bridge.state.game), worldHooks.target(), reportGiver());');
  });
});

// GAME-346 · після міні-гри місії ціль веде назад до видавця. Мутація (перевірено): reportBack завжди null → усі «назад» червоніють; прибрати `!g.flags.includes(second.flag)` → «друга частина відкрита — вже не назад» червоніє.
describe('reportBack / missionTarget (GAME-346)', () => {
  for (const mis of MISSIONS) {
    const [a, b] = mis.trips;
    it(`${mis.id}: ходу ще нема — нікуди; гра 1 не зіграна — до зони; зіграна — до ${mis.giver}`, () => {
      expect(reportBack(g([]))).toBeNull();
      expect(missionTarget(g([a.flag]))).toBe(`trip.${a.zone}`);
      expect(missionTarget(g([a.flag], { [a.minigame]: { last: 'good' } }))).toBe(mis.giver);
    });
    it(`${mis.id}: розмова відкрила другу частину — знов зона, а не видавець; гру 2 зіграно — знов до видавця; здано — нікуди`, () => {
      const played = { [a.minigame]: { last: 'scrappy' } };
      expect(missionTarget(g([a.flag, b.flag], played))).toBe(`trip.${b.zone}`);
      expect(reportBack(g([a.flag, b.flag], played))).toBeNull();
      expect(missionTarget(g([a.flag, b.flag], { ...played, [b.minigame]: { last: 'scrappy' } }))).toBe(mis.giver);
      expect(missionTarget(g([a.flag, b.flag, mis.doneFlag], { ...played, [b.minigame]: { last: 'scrappy' } }))).toBeNull();
    });
  }
  it('стрілка до видавця — лише коли він і є «назад»; інший NPC її не отримує', () => {
    expect(guideLive(false, 'npc.claire', 'npc.claire')).toBe(true);
    expect(guideLive(false, 'npc.luc', 'npc.claire')).toBe(false);
    expect(guideLive(false, 'npc.claire', null)).toBe(false);
  });
  it('чип цілі називає лише того, до кого вертатись', () => {
    expect(goalNames('day', ['npc.amina', 'npc.luc', 'npc.claire'], 'npc.claire')).toEqual(['npc.claire']);
    expect(goalNames('day', ['npc.amina', 'npc.luc'], null)).toEqual(['npc.amina', 'npc.luc']);
  });
});
