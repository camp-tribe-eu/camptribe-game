// GAME-337 · pendingTrip: крок «Іду до…» відомий зі стану, ще до входу в зону. Мутація (перевірено): прибрати перевірку minigames → «міні-гру зіграно» червоніє.
import { describe, expect, it } from 'vitest';
import { MISSIONS } from '../content/missions';
import type { GameState } from '../core/state';
import { pendingTrip } from './mission-work';

const g = (flags: string[], minigames: Record<string, unknown> = {}): GameState => ({ flags, minigames } as unknown as GameState);
const m = MISSIONS[0];
const t = m?.trips[0];

describe('pendingTrip', () => {
  it('прапорця походу нема — null', () => { expect(pendingTrip(g([]))).toBeNull(); });
  it('прапорець є, міні-гру не зіграно — цей похід', () => { expect(pendingTrip(g([t?.flag ?? '']))).toBe(t); });
  it('міні-гру зіграно — похід минув', () => { expect(pendingTrip(g([t?.flag ?? ''], { [t?.minigame ?? '']: { last: 'good' } }))).toBeNull(); });
  it('місію здано — похід не висить', () => { expect(pendingTrip(g([t?.flag ?? '', m?.doneFlag ?? '']))).toBeNull(); });
});
