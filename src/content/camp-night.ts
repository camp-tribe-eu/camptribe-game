// GAME-311 · ніч із бурею: що з рутин дня відгукнулось. Головне правило картки — КОЖНА з восьми рутин
// міняє ніч, і це доводиться мутацією: прибери будь-яку ланку з nightOf — camp-night.test червоніє.
//
// Ніч НІКОЛИ не блокує й ніколи не закінчує гру: blocked завжди false, ранок настає завжди (`morning`).
// Світ просто реагує: не зарядив ліхтарі — темно; не сховав їжу — лисиця; нема сухих дров — холодна вечеря.

import type { Outcome } from './minigame';
import { ROUTINE_IDS, type RoutineId } from './camp-day';
import type { Weather } from '../core/weather';
import { nightAt, type NightWeather, type PitchId } from './arrival-pitch';
import { MISSIONS } from './missions';

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
  /** GAME-319: скільки ягід реально в мисці. Без поля (старий сейв) — ніч читає як раніше. */
  readonly berries?: number | undefined;
  /** Чи лишилась їжа надворі (night-camp.foodOutside). */
  readonly foodOutside: boolean;
  /** Скільки раундів табір стояв порожній (camp-day.emptyRounds). */
  readonly emptyRounds: number;
  readonly weather: Weather;
  /** GAME-310: ділянка, яку взяли, погода ночі й прапорці підготовки. Без `pitch` ніч читає лише рутини (як було). */
  readonly pitch?: PitchId;
  readonly nightWeather?: NightWeather;
  readonly prep?: readonly string[];
  /** GAME-314: прапорці гри (місії сусідів). Ніч читає їх тією самою моделлю, що й рутини: зроблена місія — слід, незроблена — інший слід. */
  readonly missions?: readonly string[];
}

export const NIGHT_FACTS: NightFacts = {
  results: {}, litLanterns: 0, dryLogs: 0, water: 0, fish: 0, bitterBerries: 0, foodOutside: true, emptyRounds: 0, weather: 'rain',
};

/** GAME-332: ліхтаря немає в авто — лишили вдома (f.left-lantern, «Багажник») чи не брали, і жодного іншого не взяли: світити нічим. Прапорців пакування немає (старий сейв, фікстури) — false, ніч як була. */
export const NO_LAMP = 'f.left-lantern';
const LAMPS = ['f.pack-lantern', 'f.pack-lantern-2', 'f.pack-lantern-3'] as const;
export const noLamp = (f: Pick<NightFacts, 'missions'>): boolean => {
  const m = f.missions;
  if (m === undefined || LAMPS.some((x) => m.includes(x))) return false;
  return m.includes(NO_LAMP) || m.some((x) => x.startsWith('f.pack-'));   // лишили або не брали, коли пакування було: однаково темно
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

  // GAME-333: тент не втримався (лусне чи не натягнуто) — речі під ним не сухі; дощ чи вітер міняє лише слова.
  const knots = did(f, 'knots');
  const rain = f.weather === 'rain';
  const tarpFailed = knots !== 'good' && knots !== 'fine';

  // ДРОВА: сухі під тентом — вогонь переживе зливу; вогкі або жодних — холодна вечеря.
  // GAME-319: «Дров немає — вечеря холодна» суперечить вогню, що горів (хай і димів): дрова й вогонь не суперечать: слід дров стоїть лише поруч зі слідом вогню того ж роду (обидва були або обидва ні).
  const fire = did(f, 'fire');
  const wood = did(f, 'firewood');
  // GAME-348: сусідові сухі дрова (місія) і «наші вогкі/розкидані» не суперечать, якщо слід дров це визнає: тоді ключ із `.shared`.
  const sharedDry = MISSIONS.some((m) => m.night.some((l) => l.fact === 'f.storm-dry-wood' && f.missions?.includes(l.flag) === true));
  const sh = (id: string): string => (sharedDry ? `${id}.shared` : id);
  if ((wood === undefined) === (fire === undefined)) {
    beats.push(wood === undefined
      ? { routine: 'firewood', id: 'night.wood.none', severity: 'rough' }
      : f.dryLogs >= 4
        ? tarpFailed
          ? { routine: 'firewood', id: sh(rain ? 'night.wood.soaked' : 'night.wood.scattered'), severity: 'plain' }
          : { routine: 'firewood', id: 'night.wood.dry', severity: 'good' }
        : { routine: 'firewood', id: sh('night.wood.damp'), severity: 'plain' });
  }

  // ВОГОНЬ: вечеря й вечір біля вогню. Без вогню — холодна вечеря з банки, і це не покарання, а просто інший вечір.
  beats.push(fire === undefined
    ? { routine: 'fire', id: 'night.fire.none', severity: 'rough' }
    : fire === 'good'
      ? { routine: 'fire', id: 'night.fire.warm', severity: 'good' }
      : { routine: 'fire', id: 'night.fire.smoky', severity: 'plain' });

  // РИБА: краща вечеря. Нема — вечеря проста, але вечеря є.
  const fish = did(f, 'fish');
  // GAME-349: без вогню риба не «на вогні» — окремий слід (лишили на завтра), щоб ніч не сперечалась із «Вогню не було».
  beats.push(fish !== undefined && f.fish >= 2
    ? { routine: 'fish', id: fire === undefined ? 'night.fish.supper.cold' : 'night.fish.supper', severity: 'good' }
    : fish !== undefined && f.fish >= 1
      ? { routine: 'fish', id: 'night.fish.one', severity: 'plain' }
      : { routine: 'fish', id: 'night.fish.none', severity: 'plain' });

  // ЯГОДИ: доповнити стіл. Гіркий двійник у мисці — вечеря з гримасою (і жодної шкоди).
  const berries = did(f, 'berries');
  beats.push(berries === undefined || f.berries === 0
    ? { routine: 'berries', id: 'night.berries.none', severity: 'plain' }
    : f.bitterBerries > 0
      ? { routine: 'berries', id: 'night.berries.bitter', severity: 'plain' }
      : { routine: 'berries', id: 'night.berries.sweet', severity: 'good' });

  // ЛІХТАРІ: світло вночі. Буря без світла — темно й страшно; один ліхтар — тьмяно, але видно.
  const lanterns = did(f, 'lanterns');
  beats.push(lanterns === undefined || f.litLanterns === 0 || noLamp(f)
    ? { routine: 'lanterns', id: 'night.light.dark', severity: 'rough' }
    : f.litLanterns >= 3
      ? { routine: 'lanterns', id: 'night.light.bright', severity: 'good' }
      : { routine: 'lanterns', id: 'night.light.dim', severity: 'plain' });

  // ПОРЯДОК: щоб не прийшли звірі. Їжа надворі — лисиця; прибрано — ніч тиха.
  const tidy = did(f, 'tidy');
  beats.push(tidy === undefined || f.foodOutside
    ? { routine: 'tidy', id: 'night.tidy.fox', severity: 'rough' }
    : { routine: 'tidy', id: 'night.tidy.quiet', severity: 'good' });

  // ВУЗЛИ (GAME-333): відтяжки тенту в бурю. Добре — тримає; нормально — провис, але тримає; сяк-так — мотузка лусне, і речі під тентом мокрі; не ходили — тент не натягнуто.
  const w = (id: string): string => (rain ? id : `${id}.wind`);
  beats.push(knots === 'good'
    ? { routine: 'knots', id: w('night.knots.held'), severity: 'good' }
    : knots === 'fine'
      ? { routine: 'knots', id: w('night.knots.sag'), severity: 'plain' }
      : { routine: 'knots', id: w(knots === 'scrappy' ? 'night.knots.snap' : 'night.knots.none'), severity: 'rough' });

  // Порожній табір: нікого не лишили стерегти — ворони на столі ще завидна.
  if (f.emptyRounds > 0) beats.push({ routine: 'camp', id: 'night.camp.crows', severity: 'plain' });
  // Буря сама: у дощ вітер б'є дужче, і це тло для всього вище.
  beats.push({ routine: 'camp', id: f.weather === 'rain' ? 'night.storm.wet' : 'night.storm.wind', severity: 'plain' });

  // GAME-310: ту саму ніч далі веде модель ділянки (arrival-pitch.nightAt) — вона не дублюється, а доповнює рутини.
  if (f.pitch !== undefined) {
    for (const e of nightAt(f.pitch, f.nightWeather ?? 'storm', f.prep ?? [])) {
      beats.push({ routine: 'camp', id: e.textKey, severity: e.bite === 'bite' ? 'rough' : 'plain' });
    }
  }

  // GAME-314: місії сусідів входять у ТУ САМУ ніч. Кожна зроблена дає свої сліди (MissionDef.night), незроблена — один слід «лишилось, як було».
  if (f.missions !== undefined) {
    for (const m of MISSIONS) {
      const earned = m.night.filter((l) => f.missions?.includes(l.flag));
      if (earned.length === 0) beats.push({ routine: 'camp', id: `night.mission.${m.id}.none`, severity: 'plain' });
      // GAME-323: «вогонь із першого сірника» не стоїть поруч із «вогню не було».
      for (const l of earned) if (l.fact !== 'f.storm-dry-wood' || fire !== undefined) beats.push({ routine: 'camp', id: `night.mission.${l.fact}`, severity: 'good' });
    }
  }

  return { beats, blocked: false, morning: true };
}

/** Чи ніч відрізняється для цих двох наборів фактів — сторож ланцюга наслідків. */
export const nightKeys = (f: NightFacts): readonly string[] => nightOf(f).beats.map((b) => b.id);
/** Наскільки ніч вийшла важкою: скільки слідів «rough». Ніколи не перетворюється на програш. */
export const roughCount = (f: NightFacts): number => nightOf(f).beats.filter((b) => b.severity === 'rough').length;
/** Кожна рутина має свій слід у ночі — перелік для сторожа. */
export const NIGHT_ROUTINES: readonly RoutineId[] = ROUTINE_IDS;
