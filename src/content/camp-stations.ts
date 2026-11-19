// GAME-335 · місця справ на мапі табору (лише зразковий день ?sampleDay=1). Кожна ручна рутина дошки (camp-day) має СВОЄ місце на мапі:
// наявний об'єкт табору (колонка, купа дров, кущ, лавка на сонці, вогнище, берег, намет, авто) — нових малюнків нема (OD-013).
// Підійшов і натиснув дію — відкривається та сама панель рутини, що й з дошки (одна точка входу: CampRoutines.focus).
import { MEMBERS, ROUTINE_IDS, ROUTINES, type Member, type RoutineId } from './camp-day';

export interface Station {
  /** Імʼя цілі на мапі (spot), за яким її знаходять scene і main. */
  readonly spot: string;
  /** Точка (ноги), px мапи camp-lake.tmj: герой стає поруч, виконавець — на сусідній клітинці. */
  readonly at: { readonly x: number; readonly y: number };
  /** Яка наявна річ табору тут стоїть (для людини-рецензента й тесту). */
  readonly object: string;
  /** Піктограма з наявного атласу цілей (objective-icon-atlas). */
  readonly icon: string;
}

export const STATIONS: Readonly<Record<RoutineId, Station>> = {
  water: { spot: 'station.water', at: { x: 656, y: 240 }, object: 'tap.camp', icon: 'water' },
  firewood: { spot: 'station.firewood', at: { x: 720, y: 592 }, object: 'obj.firewood-pile', icon: 'firewood' },
  berries: { spot: 'station.berries', at: { x: 144, y: 336 }, object: 'bush.camp.2', icon: 'apple' },
  lanterns: { spot: 'station.lanterns', at: { x: 272, y: 208 }, object: 'leisure.bench.1', icon: 'lantern' },
  fire: { spot: 'station.fire', at: { x: 112, y: 176 }, object: 'obj.campfire', icon: 'dinner' },
  fish: { spot: 'station.fish', at: { x: 880, y: 400 }, object: 'fish.shore', icon: 'bowl' },
  knots: { spot: 'station.knots', at: { x: 144, y: 80 }, object: 'task.pitch-tent', icon: 'line' },
  tidy: { spot: 'station.tidy', at: { x: 528, y: 592 }, object: 'obj.vehicle', icon: 'litter' },
};

/** Рутина за імʼям цілі на мапі; null — це не місце справи. */
export const stationRoutine = (spot: string): RoutineId | null => ROUTINE_IDS.find((id) => STATIONS[id].spot === spot) ?? null;

/** Хто з родини зараз стоїть на місці справи: власник рутини, що в роботі чи призначена й не зроблена. Герой (тато) — це гравець, його сцена не рухає. */
export function postsOf(live: readonly RoutineId[], hero: Member = 'george'): readonly { readonly member: Member; readonly spot: string }[] {
  const out: { member: Member; spot: string }[] = [];
  for (const id of live) {
    const owner = ROUTINES[id].owner;
    if (owner === hero || !MEMBERS.includes(owner) || out.some((p) => p.member === owner)) continue;
    out.push({ member: owner, spot: STATIONS[id].spot });
  }
  return out;
}
