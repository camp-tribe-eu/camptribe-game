// GAME-320 · rig: сусід із відкритою місією (setStay) о 20:30+ стоїть на посту, а не в наметі. Мутація: у drive замінити `this.stay.has(res.id)` на false → червоніє.
import { describe, expect, it, vi } from 'vitest';
vi.mock('phaser', () => ({ default: {} }));
import { RESIDENTS, buildTimeline, residentGrid, type Timeline } from './ambient';
import { gridFromWalls, type Pt } from './follow';
import { HOMES, sinceEvening } from './neighbours';
import { Neighbours } from './neighbours-rig';

const RAW = import.meta.glob<string>('../../../public/maps/camp-lake.tmj', { query: '?raw', import: 'default', eager: true });
const map = JSON.parse(Object.values(RAW)[0] ?? '') as { width: number; height: number; layers: { name: string; data?: number[]; objects?: { type?: string; class?: string; x: number; y: number }[] }[] };
const objs = map.layers.find((l) => l.name === 'objects')?.objects ?? [];
const spots: Pt[] = objs.filter((o) => ['trigger', 'npc', 'anchor'].includes(String(o.type || o.class))).map((o) => ({ x: o.x, y: o.y }));
const grid = gridFromWalls(map.width, map.height, 32, map.layers.find((l) => l.name === 'walls')?.data ?? []);
const walk = residentGrid(grid, spots);
const i = RESIDENTS.findIndex((r) => r.id === 'npc.amina');
const tl = buildTimeline(walk, RESIDENTS[i] as never) as Timeline;

const fake = (): never => new Proxy(function () { /* stub */ }, { get: (_t, k) => (typeof k === 'symbol' ? () => 0 : k === 'texture' ? { key: 'res-x' } : k === 'anims' ? fake() : fake()), apply: () => fake() }) as never;
function phaseAt(stay: boolean): string {
  const n = new Neighbours({ add: { graphics: fake } } as never, 0);
  n.begin(RESIDENTS.map((r) => r.id));
  n.setStay(new Set(stay ? ['npc.amina'] : []));
  const m = 3 * 1440 + Math.round(21 * 60) - 480;
  expect(sinceEvening(m)).toBeGreaterThan(0);
  expect(HOMES['npc.amina']).toBeDefined();
  return n.drive(i, fake(), walk, tl, m, null, false, false, 'down').phase;
}

describe('GAME-320: rig тримає сусіда з місією на посту', () => {
  it('о 21:00 без місії — вдома, з місією — на розкладі', () => {
    expect(phaseAt(false)).toBe('home');
    expect(phaseAt(true)).toBe('out');
  });
});
