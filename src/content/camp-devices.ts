// GAME-311 · табір, що працює сам (EPISODE-DESIGN §9а, рішення власника 12.11): «ферма, перекладена на табір».
// Рутини двох порід:
//  * ЛИШЕ РУКАМИ, завжди: вогонь (вечеря на вогнищі) і ягоди. Для них пристрою немає й не буде — інакше зникає гра.
//  * НАЛАГОДИ РАЗ — І ПРАЦЮЄ: вода (бочка під дощ + фільтр), ліхтарі (сонячна станція), дрова (накрита дровітня,
//    син підтримує запас), порядок (ящик-сховок, лисиця не відкриє), риба (верша: поставив зранку — вибрав увечері).
// Пристрій будується з матеріалів і знання, що приносять пригоди; після цього рутина БІЛЬШЕ НЕ ПОТРЕБУЄ рук і не
// їсть часу дня. Йому треба легкого догляду (хвилина, не година): без догляду працює гірше, але НІКОЛИ не ламається
// назавжди (стан не падає нижче MIN_CARE, результат завжди є). Ніч читає і ручне, і налагоджене — та сама модель.
// Чисто: жодного годинника — знос рахується частинами дня, які передає гра.

import { ROUTINE_IDS, type CampDay, type RoutineId } from './camp-day';
import type { NightFacts } from './camp-night';
import type { Outcome } from './minigame';

export const DEVICE_IDS = ['rain-barrel', 'solar-station', 'woodpile', 'food-box', 'fish-trap'] as const;
export type DeviceId = (typeof DEVICE_IDS)[number];

export interface DeviceDef {
  readonly id: DeviceId;
  /** Яку рутину бере на себе. */
  readonly routine: RoutineId;
  /** Що треба принести з пригод: матеріали й знання. */
  readonly materials: readonly string[];
  readonly knowhow: string;
  /** Що саме доглянути (ключ тексту дії догляду). */
  readonly upkeep: 'clear-leaves' | 'turn-panel' | 'teach-restock' | 'check-latch' | 'move-trap';
}

export const DEVICES: Readonly<Record<DeviceId, DeviceDef>> = {
  'rain-barrel': { id: 'rain-barrel', routine: 'water', materials: ['barrel', 'filter'], knowhow: 'know.rain-water', upkeep: 'clear-leaves' },
  'solar-station': { id: 'solar-station', routine: 'lanterns', materials: ['solar-panel', 'cable'], knowhow: 'know.solar', upkeep: 'turn-panel' },
  woodpile: { id: 'woodpile', routine: 'firewood', materials: ['tarp', 'rope'], knowhow: 'know.woodpile', upkeep: 'teach-restock' },
  'food-box': { id: 'food-box', routine: 'tidy', materials: ['box', 'latch'], knowhow: 'know.food-storage', upkeep: 'check-latch' },
  'fish-trap': { id: 'fish-trap', routine: 'fish', materials: ['net', 'willow'], knowhow: 'know.fish-trap', upkeep: 'move-trap' },
};

/** Лише руками, завжди. Сторож: для них немає пристрою, і збудувати його не можна. */
export const HANDS_ONLY: readonly RoutineId[] = ['fire', 'berries'];
export const deviceFor = (r: RoutineId): DeviceId | null => (HANDS_ONLY.includes(r) ? null : DEVICE_IDS.find((d) => DEVICES[d].routine === r) ?? null);
export const automatable = (r: RoutineId): boolean => deviceFor(r) !== null;

/** Стан доглянутості 0..1: свіжозбудований — 1; за кожну частину дня без догляду спадає; нижче MIN_CARE не падає. */
export const DECAY_PER_PART = 0.2;
export const MIN_CARE = 0.2;
/** Нижче — дошка показує «ось-ось закінчиться». */
export const LOW_AT = 0.5;
export type Devices = Readonly<Partial<Record<DeviceId, { readonly care: number }>>>;
export interface Pack { readonly materials: readonly string[]; readonly knowhow: readonly string[] }

export function canBuild(pack: Pack, id: DeviceId): boolean {
  const d = DEVICES[id];
  return d.materials.every((m) => pack.materials.includes(m)) && pack.knowhow.includes(d.knowhow);
}
/** Збудувати: потрібні матеріали й знання з пригод. Для рутини «лише руками» пристрою немає — нічого не буде. */
export function build(devs: Devices, pack: Pack, id: DeviceId): Devices {
  if (HANDS_ONLY.includes(DEVICES[id].routine) || !canBuild(pack, id) || devs[id]) return devs;
  return { ...devs, [id]: { care: 1 } };
}
/** Час іде: кожна частина дня без догляду трохи гірша, але не нижче MIN_CARE — пристрій не ламається назавжди. */
export function wear(devs: Devices, parts: number): Devices {
  const out: Partial<Record<DeviceId, { care: number }>> = {};
  for (const id of DEVICE_IDS) {
    const d = devs[id];
    if (d) out[id] = { care: Math.max(MIN_CARE, d.care - DECAY_PER_PART * Math.max(0, parts)) };
  }
  return out;
}
/** Догляд — хвилина роботи: бочку від листя, панель до сонця, вершу на інше місце. Повертає пристрій до ладу. */
export const tend = (devs: Devices, id: DeviceId): Devices => (devs[id] ? { ...devs, [id]: { care: 1 } } : devs);

/** Як пристрій упорався сам: доглянутий — добре, підзанедбаний — нормально, занедбаний — сяк-так. Результат є ЗАВЖДИ. */
export const autoOutcome = (care: number): Outcome => (care >= 0.7 ? 'good' : care >= 0.4 ? 'fine' : 'scrappy');

export type BoardStatus = 'auto' | 'low' | 'hands';
/** Дошка табору одним поглядом: працює саме / ось-ось закінчиться / чекає рук. */
export function statusOf(devs: Devices, r: RoutineId): BoardStatus {
  const id = deviceFor(r);
  const d = id ? devs[id] : undefined;
  if (!d) return 'hands';
  return d.care < LOW_AT ? 'low' : 'auto';
}
export const runsItself = (devs: Devices, r: RoutineId): boolean => statusOf(devs, r) !== 'hands';

/** Пристрої відпрацювали день: їхні рутини закриті самі, БЕЗ хвилин дня й без рук (ручний крок прибрано). */
export function withDevices(day: CampDay, devs: Devices): CampDay {
  let d: CampDay = day;
  for (const r of ROUTINE_IDS) {
    const id = deviceFor(r);
    const dev = id ? devs[id] : undefined;
    if (dev && d.results[r] === undefined) d = { ...d, results: { ...d.results, [r]: autoOutcome(dev.care) } };
  }
  return d;
}

/** Що пристрої дають ночі: та сама модель фактів, що й ручні рутини (camp-night). */
export function deviceFacts(devs: Devices, f: NightFacts): NightFacts {
  const care = (id: DeviceId): number | undefined => devs[id]?.care;
  const water = care('rain-barrel');
  const solar = care('solar-station');
  const wood = care('woodpile');
  const box = care('food-box');
  const trap = care('fish-trap');
  return {
    ...f,
    water: water !== undefined ? Math.max(f.water, water) : f.water,
    litLanterns: solar !== undefined ? Math.max(f.litLanterns, solar >= 0.7 ? 3 : solar >= 0.4 ? 2 : 1) : f.litLanterns,
    dryLogs: wood !== undefined ? Math.max(f.dryLogs, Math.round(6 * wood)) : f.dryLogs,
    // ящик із засувкою: доглянутий — їжа сховано; занедбаний — засувку заїло, і лисиця таки дістала
    foodOutside: box !== undefined ? box < 0.4 : f.foodOutside,
    fish: trap !== undefined ? Math.max(f.fish, trap >= 0.7 ? 2 : 1) : f.fish,
  };
}
