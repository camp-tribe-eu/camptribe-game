// GAME-304 · сторож «нічого не лежить на підлозі»: кожна річ зі списку пакування має контейнер на мапі дому, а об'єктів `pack.<річ>` (річ просто на підлозі) немає.
// Закон 1: сторож показано червоним. `GUARD_MAP=<шлях до .tmj>` підставляє іншу мапу дому — так доведено, що сторож червоніє на стані ДО GAME-304
// (мапа з origin/main: 17 речей на підлозі, жодного контейнера). Мутація «річ назад на підлогу» — нижче, у цьому ж файлі.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONTAINERS, boxSpot, containerProblems, containerOfItem } from './containers';
import { MAP_SPOTS } from './map-first';

const MAP = process.env.GUARD_MAP ?? 'public/maps/home.tmj';
const homeSpots = (path: string): string[] => {
  const m = JSON.parse(readFileSync(path, 'utf8')) as { layers: { name: string; objects?: { name: string; type: string }[] }[] };
  return (m.layers.find((l) => l.name === 'objects')?.objects ?? []).filter((o) => o.type === 'trigger' || o.type === 'npc').map((o) => o.name);
};
const PACKING = (JSON.parse(readFileSync('content/packing.json', 'utf8')) as { items: { item: string }[] }).items.map((i) => i.item);

describe('GAME-304: нічого не лежить на підлозі (сторож контейнерів)', () => {
  it('СТОРОЖ на справжніх даних: кожна з 17 речей — у контейнері, контейнери стоять на мапі дому, на підлозі нічого', () => {
    expect(PACKING).toHaveLength(17);
    expect(containerProblems(PACKING, CONTAINERS, homeSpots(MAP))).toEqual([]);
  });

  it('мапа дому й MAP_SPOTS.home знають ті самі контейнери', () => {
    const onMap = homeSpots(MAP).filter((n) => n.startsWith('box.')).sort();
    expect(onMap).toEqual(CONTAINERS.map((c) => boxSpot(c.id)).sort());
    expect((MAP_SPOTS.home as readonly string[]).filter((n) => n.startsWith('box.')).sort()).toEqual(onMap);
  });

  it('кожна річ — у ПЕРЕДБАЧУВАНОМУ місці: їжа й вода — холодильник, намет і спорядження — комора, одяг і документи — шафа, гаманець — тумба', () => {
    const where = (id: string): string | undefined => containerOfItem(`item.${id}`)?.id;
    for (const id of ['water', 'snacks', 'simple-dinner']) expect(where(id), id).toBe('fridge');
    for (const id of ['tent', 'sleeping-bag', 'lantern', 'lantern-2', 'lantern-3', 'big-cushion']) expect(where(id), id).toBe('storeroom');
    for (const id of ['clothes', 'documents', 'first-aid']) expect(where(id), id).toBe('wardrobe');
    for (const id of ['wallet', 'phones']) expect(where(id), id).toBe('nightstand');
    for (const id of ['mia-carrier', 'mia-bowl-food', 'mia-blanket']) expect(where(id), id).toBe('mia');
  });

  describe('НЕГАТИВНИЙ КОНТРОЛЬ (закон 1): сторож уміє почервоніти', () => {
    const good = homeSpots(MAP);
    it('річ назад на підлогу (з\'явився pack.<річ> на мапі) → ITEM_ON_FLOOR', () => {
      expect(containerProblems(PACKING, CONTAINERS, [...good, 'pack.item.water'])).toEqual(['ITEM_ON_FLOOR pack.item.water']);
    });
    it('річ прибрано з контейнера (отже лежала б на підлозі) → ITEM_NO_CONTAINER', () => {
      const broken = CONTAINERS.map((c) => (c.id === 'fridge' ? { ...c, items: c.items.filter((i) => i !== 'item.snacks') } : c));
      expect(containerProblems(PACKING, broken, good)).toEqual(['ITEM_NO_CONTAINER item.snacks']);
    });
    it('річ у двох контейнерах → ITEM_TWO_CONTAINERS; чужа річ у контейнері → CONTAINER_UNKNOWN_ITEM', () => {
      const two = CONTAINERS.map((c) => (c.id === 'nightstand' ? { ...c, items: [...c.items, 'item.water'] } : c));
      expect(containerProblems(PACKING, two, good)).toEqual(['ITEM_TWO_CONTAINERS item.water']);
      const alien = CONTAINERS.map((c) => (c.id === 'nightstand' ? { ...c, items: [...c.items, 'item.ghost'] } : c));
      expect(containerProblems(PACKING, alien, good)).toEqual(['CONTAINER_UNKNOWN_ITEM nightstand item.ghost']);
    });
    it('контейнер зник з мапи → CONTAINER_NOT_ON_MAP', () => {
      expect(containerProblems(PACKING, CONTAINERS, good.filter((n) => n !== 'box.wardrobe'))).toEqual(['CONTAINER_NOT_ON_MAP wardrobe']);
    });
    it('стан ДО GAME-304 (17 об\'єктів pack.* і жодного контейнера на мапі) сторож не пропускає', () => {
      const before = [...good.filter((n) => !n.startsWith('box.')), ...PACKING.map((i) => `pack.${i}`)];
      const p = containerProblems(PACKING, CONTAINERS, before);
      expect(p.filter((x) => x.startsWith('ITEM_ON_FLOOR'))).toHaveLength(17);
      expect(p.filter((x) => x.startsWith('CONTAINER_NOT_ON_MAP'))).toHaveLength(CONTAINERS.length);
    });
  });
});
