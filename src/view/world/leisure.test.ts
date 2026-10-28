// GAME-173 · розклад родини по точках дозвілля: різні тайли, не в стінах, не на цілях взаємодії, не на героєві, шлях існує.
// Мутації (кожна — червоний тест, перевірено; див. PR): без `reach.delete(best)` (двоє на одній точці); без перевірки `avoidTiles`. Стіну відсіює сам `findPath` (null для твердого тайла), окремої перевірки немає.
import { describe, expect, it } from 'vitest';
import { gridFromWalls, tileOf } from './follow';
import { LEISURE_BY_MAP, assignLeisure, leisureFromObjects } from './leisure';

const TILE = 32;
// 6×3: стіна-перегородка в колонці 3 з проходом лише знизу; точка (5,0) за перегородкою далеко, (4,1) близько, (3,0) — у стіні.
const g = gridFromWalls(6, 3, TILE, [0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
const hero = { x: 0.5 * TILE, y: 0.5 * TILE };
const tileIdx = (c: number, r: number): number => r * g.cols + c;

describe('assignLeisure', () => {
  const spots = [
    { kind: 'campfire', c: 3, r: 0, face: 'down' }, { kind: 'bench', c: 2, r: 1, face: 'left' }, { kind: 'shore', c: 5, r: 2, face: 'up' }, { kind: 'tent', c: 5, r: 0, face: 'down' },
  ] as const;
  it('кожному своя точка: різні тайли, не в стіні', () => {
    const out = assignLeisure(g, hero, 3, spots, new Set());
    const tiles = out.map((s) => (s ? `${s.c},${s.r}` : null));
    expect(tiles.every((t) => t !== null)).toBe(true);
    expect(new Set(tiles).size).toBe(3);
    expect(tiles).not.toContain('3,0');   // стіна
  });
  it('не на цілі взаємодії, не на героєві', () => {
    const out = assignLeisure(g, tileOfHeroSpot(), 2, spots, new Set([tileIdx(2, 1)]));
    for (const s of out) expect(s).not.toBeNull();
    expect(out.map((s) => `${s?.c},${s?.r}`)).not.toContain('2,1');
    expect(out.map((s) => `${s?.c},${s?.r}`)).not.toContain('0,0');
  });
  it('точок менше за родину — решта null (лишаються у строю)', () => {
    const out = assignLeisure(g, hero, 3, [spots[1]], new Set());
    expect(out.filter((s) => s === null).length).toBe(2);
  });
});

function tileOfHeroSpot(): { x: number; y: number } { const t = tileOf(g, hero); return { x: (t.c + 0.5) * TILE, y: (t.r + 0.5) * TILE }; }

describe('дані точок', () => {
  it('мапа кемпінгу має ≥ 4 види й не менше точок, ніж членів родини', () => {
    const list = LEISURE_BY_MAP['camp-lake'] ?? [];
    expect(new Set(list.map((s) => s.kind)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(list.map((s) => `${s.c},${s.r}`)).size).toBe(list.length);
  });
  it('leisureFromObjects читає об\'єкти мапи, пропускає чужі й невідомі', () => {
    const out = leisureFromObjects([
      { name: 'leisure.bench.1', type: 'leisure', x: 70, y: 40, properties: [{ name: 'face', value: 'left' }] },
      { name: 'leisure.sofa', type: 'leisure', x: 0, y: 0 },
      { name: 'obj.campfire', type: 'trigger', x: 0, y: 0 },
    ], TILE);
    expect(out).toEqual([{ kind: 'bench', c: 2, r: 1, face: 'left' }]);
  });
});
