// GAME-216 · заставка першого приїзду в табір: чиста таблиця бітів ≤ 10 с із виходом (останній біт повертає камеру на героя).
// Закон 1: мутації (нижче) — таблиця без виходу, задовга, із надто коротким бітом, порожня — усі червоні.
import { describe, expect, it } from 'vitest';
import { REVEAL_BEATS, REVEAL_MAX_MS, REVEAL_MS, type RevealBeat, revealCenter, revealProblems, totalMs } from './camp-reveal';

const A = { player: { x: 100, y: 100 }, lake: { x: 400, y: 50 }, camp: { x: 200, y: 300 } };

describe('заставка приїзду в табір (GAME-216)', () => {
  it('таблиця чиста: ≤ 10 с, останній біт — player (вихід)', () => {
    expect(REVEAL_MS).toBe(totalMs(REVEAL_BEATS));
    expect(REVEAL_MS).toBeLessThanOrEqual(REVEAL_MAX_MS);
    expect(REVEAL_BEATS.at(-1)?.kind).toBe('player');
    expect(revealProblems(REVEAL_BEATS)).toEqual([]);
  });
  it('камера: починає на героєві, доходить до озера й табору, у кінці знову на героєві; після кінця — null (сцена завершується сама)', () => {
    expect(revealCenter(0, A)).toEqual(A.player);
    const [b0, b1] = REVEAL_BEATS as [RevealBeat, RevealBeat];
    const atLake = revealCenter(b0.ms - 1, A);
    expect(Math.hypot((atLake?.x ?? 0) - A.lake.x, (atLake?.y ?? 0) - A.lake.y)).toBeLessThan(2);
    const atCamp = revealCenter(b0.ms + b1.ms - 1, A);
    expect(Math.hypot((atCamp?.x ?? 0) - A.camp.x, (atCamp?.y ?? 0) - A.camp.y)).toBeLessThan(2);
    const back = revealCenter(REVEAL_MS - 1, A);
    expect(Math.hypot((back?.x ?? 0) - A.player.x, (back?.y ?? 0) - A.player.y)).toBeLessThan(2);
    expect(revealCenter(REVEAL_MS, A)).toBeNull();
    expect(revealCenter(REVEAL_MS + 5_000, A)).toBeNull();
  });
  it('мутації: без виходу (останній не player) — NO_EXIT; > 10 с — TOO_LONG; біт < 0,5 с — TOO_SHORT; порожня — EMPTY', () => {
    expect(revealProblems([{ kind: 'lake', ms: 3000 }, { kind: 'camp', ms: 3000 }])).toContain('NO_EXIT: last beat does not return the camera to the player');
    expect(revealProblems([{ kind: 'lake', ms: 6000 }, { kind: 'player', ms: 5000 }])).toContain('TOO_LONG: 11000 ms > 10000');
    expect(revealProblems([{ kind: 'lake', ms: 200 }, { kind: 'player', ms: 1000 }])).toContain('TOO_SHORT lake: 200 ms < 500');
    expect(revealProblems([])).toContain('EMPTY: no beats');
    // Таблиця без виходу: камера по ній ніколи не вертається — після кінця null усе одно (вихід за часом є завжди), але кінцева точка не герой.
    const noExit: RevealBeat[] = [{ kind: 'lake', ms: 3000 }];
    const end = revealCenter(2999, A, noExit);
    expect(Math.hypot((end?.x ?? 0) - A.player.x, (end?.y ?? 0) - A.player.y)).toBeGreaterThan(100);
  });
});
