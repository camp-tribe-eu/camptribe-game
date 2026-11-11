// GAME-311 · ніч із бурею: що з рутин дня відгукнулось. Головне правило картки — КОЖНА з семи рутин
// міняє ніч, і це доводиться мутацією: прибери будь-яку ланку з nightOf — camp-night.test червоніє.
//
// Ніч НІКОЛИ не блокує й ніколи не закінчує гру: blocked завжди false, ранок настає завжди (`morning`).
// Світ просто реагує: не зарядив ліхтарі — темно; не сховав їжу — лисиця; нема сухих дров — холодна вечеря.

import type { Outcome } from './minigame';
import { ROUTINE_IDS, type RoutineId } from './camp-day';
import type { Weather } from '../core/weather';

export type Severity = 'good' | 'plain' | 'rough';
export interface NightBeat {
  /** Від якої рутини цей слід. */
  readonly routine: RoutineId | 'camp';
  readonly id: string;
  readonly severity: Severity;
}

export interface NightFacts {
  readonly results: Readonly<Partial<Record<RoutineId, Outcome>>>;
  /** Скільки ліхтарів справді світить (lantern-charge.litCount). */
  readonly litLanterns: number;
  /** Скільки сухих дров під тентом (firewood-stack.dryLogs) і чи вистачає їх на вечерю. */
  readonly dryLogs: number;
  /** Скільки води донесли (water-carry.waterScore, частка відра). */
  readonly water: number;
  /** Скільки риби лишили на вечерю і скільки гірких ягід потрапило в миску. */
  readonly fish: number;
  readonly bitterBerries: number;
  /** Чи лишилась їжа надворі (night-camp.foodOutside). */
  readonly foodOutside: boolean;
  /** Скільки раундів табір стояв порожній (camp-day.emptyRounds). */
  readonly emptyRounds: number;
  readonly weather: Weather;
}

export const NIGHT_FACTS: NightFacts = {
  results: {}, litLanterns: 0, dryLogs: 0, water: 0, fish: 0, bitterBerries: 0, foodOutside: true, emptyRounds: 0, weather: 'rain',
};

const did = (f: NightFacts, id: RoutineId): Outcome | undefined => f.results[id];

/** Ніч за фактами дня. Порядок слідів — як вони стаються: вечеря, світло, табір, буря, ранок. */
export function nightOf(f: NightFacts): { readonly beats: readonly NightBeat[]; readonly blocked: false; readonly morning: true } {
  const beats: NightBeat[] = [];

  // ВОДА: пити, готувати, мити. Донесли повне відро — чай і вмитись; донесли мало — ощадний вечір; не ходили — спрага.
  const water = did(f, 'water');
  beats.push(water === undefined
    ? { routine: 'water', id: 'night.water.none', severity: 'rough' }
    : f.water >= 0.75
      ? { routine: 'water', id: 'night.water.full', severity: 'good' }
      : { routine: 'water', id: 'night.water.short', severity: 'plain' });

  // ДРОВА: сухі під тентом — вогонь переживе зливу; вогкі або жодних — холодна вечеря.
  const wood = did(f, 'firewood');
  beats.push(wood === undefined
    ? { routine: 'firewood', id: 'night.wood.none', severity: 'rough' }
    : f.dryLogs >= 4
      ? { routine: 'firewood', id: 'night.wood.dry', severity: 'good' }
      : { routine: 'firewood', id: 'night.wood.damp', severity: 'plain' });

  // ВОГОНЬ: вечеря й вечір біля вогню. Без вогню — холодна вечеря з банки, і це не покарання, а просто інший вечір.
  const fire = did(f, 'fire');
  beats.push(fire === undefined
    ? { routine: 'fire', id: 'night.fire.none', severity: 'rough' }
    : fire === 'good'
      ? { routine: 'fire', id: 'night.fire.warm', severity: 'good' }
      : { routine: 'fire', id: 'night.fire.smoky', severity: 'plain' });

  // РИБА: краща вечеря. Нема — вечеря проста, але вечеря є.
  const fish = did(f, 'fish');
  beats.push(fish !== undefined && f.fish >= 2
    ? { routine: 'fish', id: 'night.fish.supper', severity: 'good' }
    : fish !== undefined
      ? { routine: 'fish', id: 'night.fish.one', severity: 'plain' }
      : { routine: 'fish', id: 'night.fish.none', severity: 'plain' });

  // ЯГОДИ: доповнити стіл. Гіркий двійник у мисці — вечеря з гримасою (і жодної шкоди).
  const berries = did(f, 'berries');
  beats.push(berries === undefined
    ? { routine: 'berries', id: 'night.berries.none', severity: 'plain' }
    : f.bitterBerries > 0
      ? { routine: 'berries', id: 'night.berries.bitter', severity: 'plain' }
      : { routine: 'berries', id: 'night.berries.sweet', severity: 'good' });

  // ЛІХТАРІ: світло вночі. Буря без світла — темно й страшно; один ліхтар — тьмяно, але видно.
  const lanterns = did(f, 'lanterns');
  beats.push(lanterns === undefined || f.litLanterns === 0
    ? { routine: 'lanterns', id: 'night.light.dark', severity: 'rough' }
    : f.litLanterns >= 3
      ? { routine: 'lanterns', id: 'night.light.bright', severity: 'good' }
      : { routine: 'lanterns', id: 'night.light.dim', severity: 'plain' });

  // ПОРЯДОК: щоб не прийшли звірі. Їжа надворі — лисиця; прибрано — ніч тиха.
  const tidy = did(f, 'tidy');
  beats.push(tidy === undefined || f.foodOutside
    ? { routine: 'tidy', id: 'night.tidy.fox', severity: 'rough' }
    : { routine: 'tidy', id: 'night.tidy.quiet', severity: 'good' });

  // Порожній табір: нікого не лишили стерегти — ворони на столі ще завидна.
  if (f.emptyRounds > 0) beats.push({ routine: 'camp', id: 'night.camp.crows', severity: 'plain' });
  // Буря сама: у дощ вітер б'є дужче, і це тло для всього вище.
  beats.push({ routine: 'camp', id: f.weather === 'rain' ? 'night.storm.wet' : 'night.storm.wind', severity: 'plain' });

  return { beats, blocked: false, morning: true };
}

/** Чи ніч відрізняється для цих двох наборів фактів — сторож ланцюга наслідків. */
export const nightKeys = (f: NightFacts): readonly string[] => nightOf(f).beats.map((b) => b.id);
/** Наскільки ніч вийшла важкою: скільки слідів «rough». Ніколи не перетворюється на програш. */
export const roughCount = (f: NightFacts): number => nightOf(f).beats.filter((b) => b.severity === 'rough').length;
/** Кожна рутина має свій слід у ночі — перелік для сторожа. */
export const NIGHT_ROUTINES: readonly RoutineId[] = ROUTINE_IDS;
