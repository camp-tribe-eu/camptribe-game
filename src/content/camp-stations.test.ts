// GAME-335 · місця справ на мапі табору. Закон 1: сторож, що не вміє почервоніти, — не сторож, тож кожна перевірка має мутацію в цьому ж файлі.
import { describe, expect, it } from 'vitest';
import { ICON_KEYS, objectiveIcon } from './objective-icons';
import { ROUTINE_IDS, ROUTINES, type RoutineId } from './camp-day';
import { STATIONS, postsOf, stationRoutine, type Station } from './camp-stations';
import { REACTIONS } from '../view/world/camp-alive';

const RAW = import.meta.glob<string>('../../public/maps/camp-lake.tmj', { query: '?raw', import: 'default', eager: true });
interface Obj { name: string; x: number; y: number }
const MAP = JSON.parse(Object.values(RAW)[0] as string) as { width: number; height: number; tilewidth: number; layers: { name: string; data?: number[]; objects?: Obj[] }[] };
const WALLS = MAP.layers.find((l) => l.name === 'walls')?.data ?? [];
const OBJECTS = MAP.layers.flatMap((l) => l.objects ?? []);
const TILE = MAP.tilewidth;
const INTERACT_RANGE = TILE * 1.5;   // як у scene.ts

/** Рутини без місця на мапі (порожньо — добре). */
export const missingStations = (table: Partial<Record<RoutineId, Station>>): RoutineId[] => ROUTINE_IDS.filter((id) => table[id] === undefined);
/** Місця, що стоять на стіні чи поза мапою (порожньо — добре). */
export const blockedStations = (table: Partial<Record<RoutineId, Station>>): RoutineId[] => ROUTINE_IDS.filter((id) => {
  const s = table[id];
  if (!s) return false;
  const c = Math.floor(s.at.x / TILE); const r = Math.floor(s.at.y / TILE);
  return c < 0 || r < 0 || c >= MAP.width || r >= MAP.height || (WALLS[r * MAP.width + c] ?? 0) > 0;
});
const objectAt = (name: string): { x: number; y: number } | null => {
  const o = OBJECTS.find((x) => x.name === name) ?? REACTIONS.find((x) => x.id === name)?.at;
  return o ? { x: o.x, y: o.y } : null;
};

describe('GAME-335 · місця справ табору', () => {
  it('мапа читається: є стіни й об\'єкти (закон 4: порожнє — збій)', () => {
    expect(WALLS.length).toBe(MAP.width * MAP.height);
    expect(OBJECTS.length).toBeGreaterThan(50);
  });

  it('кожна ручна рутина дошки має своє місце на мапі', () => {
    expect(missingStations(STATIONS)).toEqual([]);
    expect(Object.keys(STATIONS).sort()).toEqual([...ROUTINE_IDS].sort());
  });
  it('мутація: прибране одне місце → сторож червоніє', () => {
    const rest: Partial<Record<RoutineId, Station>> = { ...STATIONS };
    delete rest.fire;
    expect(missingStations(rest)).toEqual(['fire']);
  });

  it('місце — наявна річ табору: точка поруч із її об\'єктом на мапі (нових малюнків нема)', () => {
    for (const id of ROUTINE_IDS) {
      const s = STATIONS[id];
      const o = objectAt(s.object);
      expect(o, `${id}: об'єкт ${s.object} є на мапі чи в живих речах табору`).not.toBeNull();
      expect(Math.hypot((o?.x ?? 0) - s.at.x, (o?.y ?? 0) - s.at.y), `${id}: далеко від ${s.object}`).toBeLessThanOrEqual(TILE * 2);
    }
  });

  it('місце стоїть на прохідній клітинці в межах мапи', () => {
    expect(blockedStations(STATIONS)).toEqual([]);
  });
  it('мутація: місце на стіні (колонка в мурі) → сторож червоніє', () => {
    expect(blockedStations({ ...STATIONS, water: { ...STATIONS.water, at: { x: 656, y: 200 } } })).toEqual(['water']);
  });

  it('місця не злипаються: найближчу ціль у зоні дії не переплутати (≥ 1,5 зони між точками)', () => {
    for (const a of ROUTINE_IDS) for (const b of ROUTINE_IDS) {
      if (a >= b) continue;
      const d = Math.hypot(STATIONS[a].at.x - STATIONS[b].at.x, STATIONS[a].at.y - STATIONS[b].at.y);
      expect(d, `${a} ↔ ${b}`).toBeGreaterThan(INTERACT_RANGE);
    }
  });

  it('імена цілей унікальні, зворотний пошук знаходить рутину, а чужа ціль — ні', () => {
    expect(new Set(ROUTINE_IDS.map((id) => STATIONS[id].spot)).size).toBe(ROUTINE_IDS.length);
    for (const id of ROUTINE_IDS) expect(stationRoutine(STATIONS[id].spot)).toBe(id);
    expect(stationRoutine('obj.campfire')).toBeNull();
  });

  it('кожне місце має справжню піктограму з атласу (не запасну «зірку»)', () => {
    for (const id of ROUTINE_IDS) {
      const ic = objectiveIcon(STATIONS[id].spot);
      expect(ic.fallback, id).toBe(false);
      expect(ic.key, id).toBe(STATIONS[id].icon);
      expect(ICON_KEYS).toContain(ic.key);
    }
  });

  it('виконавець стоїть на місці своєї справи; тато (герой) — ні; один виконавець — одне місце', () => {
    expect(postsOf(['fire'])).toEqual([{ member: 'victoria', spot: STATIONS.fire.spot }]);
    expect(postsOf(['water', 'berries'])).toEqual([{ member: 'matthew', spot: STATIONS.water.spot }, { member: 'victoria', spot: STATIONS.berries.spot }]);
    expect(postsOf(['fire', 'tidy']).map((p) => p.spot)).toEqual([STATIONS.fire.spot]);
    for (const id of ROUTINE_IDS.filter((r) => ROUTINES[r].owner === 'george')) expect(postsOf([id]), id).toEqual([]);
    expect(postsOf([])).toEqual([]);
  });
  it('мутація: якби тато не був героєм, його справа теж мала б виконавця', () => {
    expect(postsOf(['fish'], 'victoria')).toEqual([{ member: 'george', spot: STATIONS.fish.spot }]);
  });
});
