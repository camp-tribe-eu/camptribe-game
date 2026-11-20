// GAME-337 · pendingTrip: крок «Іду до…» відомий зі стану, ще до входу в зону. Мутація (перевірено): прибрати перевірку minigames → «міні-гру зіграно» червоніє.
import { describe, expect, it } from 'vitest';
import { MISSIONS } from '../content/missions';
import type { GameState } from '../core/state';
import mainSource from '../main.ts?raw';
import { guideLive, pendingTrip, tripGuide } from './mission-work';

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
    expect(mainSource).toContain('return guideLive(guideOn, worldHooks.target());');
    expect(mainSource).toContain('const v = guideLive(hintIdle.tick(dt, worldHooks.target(), bridge.state.game), worldHooks.target());');
  });
});
