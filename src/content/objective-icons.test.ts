// GAME-201 · сторож піктограм цілей. Кожна позначка на мапі (будь-який тригер, крім вогнища й NPC) мусить мати СВОЮ піктограму, а не запасну «зірку»;
// запасна дозволена лише для кроків сюжету (step.*) — список fallbackPrefixes. Мутація (закон 1): прибрати одну відповідність — тест червоніє.
import { describe, expect, it } from 'vitest';
import { FALLBACK_PREFIXES, ICON_FALLBACK, ICON_KEYS, iconCell, objectiveIcon } from './objective-icons';
import items from '../../content/items.json';

const RAW = import.meta.glob<string>('../../public/maps/*.tmj', { query: '?raw', import: 'default', eager: true });
interface Obj { name: string; type?: string }
export function markerSpots(): string[] {
  const out = new Set<string>();
  for (const raw of Object.values(RAW)) {
    const map = JSON.parse(raw) as { layers: { objects?: Obj[] }[] };
    for (const l of map.layers) for (const o of l.objects ?? []) if (o.type === 'trigger' && o.name !== 'obj.campfire') out.add(o.name);
  }
  return [...out].sort();
}

/** Цілі, для яких іконка обов'язкова (не запасна). Окремо від функції, щоб тест не підтакував їй. */
export function missingIcons(spots: readonly string[], resolve: (s: string) => { key: string; fallback: boolean } = objectiveIcon): string[] {
  return spots.filter((s) => !FALLBACK_PREFIXES.some((p) => s.startsWith(p)) && resolve(s).fallback);
}

describe('GAME-201 · іконки цілей', () => {
  const spots = markerSpots();
  it('мапи читаються: є що перевіряти (закон 4: порожнє — збій)', () => {
    expect(spots.length).toBeGreaterThan(60);
    expect(spots).toContain('take.item.tent');
    expect(spots).toContain('req.nora-shore.t1');
  });
  it('кожна ціль із позначкою має свою піктограму, а не запасну', () => {
    expect(missingIcons(spots)).toEqual([]);
  });
  it('кожна річ каталогу й гілка дров мають піктограму', () => {
    for (const i of items as { id: string }[]) expect(objectiveIcon(`pack.${i.id}`).fallback, i.id).toBe(false);
    expect(objectiveIcon('wood.branch.3')).toEqual({ key: 'firewood', fallback: false });
  });
  it('усі ключі таблиць існують в атласі, а запасна — теж', () => {
    expect(ICON_KEYS).toContain(ICON_FALLBACK);
    for (const s of spots) expect(ICON_KEYS, s).toContain(objectiveIcon(s).key);
    expect(iconCell('tent')).toEqual({ x: 0, y: 0 });
  });
  it('мутація: прибрана відповідність спота → сторож червоніє', () => {
    const broken = (s: string) => (s === 'take.item.tent' ? { key: ICON_FALLBACK, fallback: true } : objectiveIcon(s));
    expect(missingIcons(spots, broken)).toEqual(['take.item.tent']);
  });
  it('мутація: невідомий крок без префікса whitelisted → теж червоніє', () => {
    expect(missingIcons(['task.nonexistent'])).toEqual(['task.nonexistent']);
    expect(missingIcons(['step.NEW-001'])).toEqual([]);
  });
});
