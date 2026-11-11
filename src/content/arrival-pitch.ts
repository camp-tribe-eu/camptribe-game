// GAME-310 · приїзд у табір: ділянка з характером. Чисті дані й функції (ні Phaser, ні ядра) — ланцюг наслідків
// `docs/EPISODE-DESIGN.md` §1 стає СПРАВЖНІМИ зв'язками стану, які можна довести сторожем і зламати мутацією:
//
//     час приїзду (дорога, GAME-309)  →  які ділянки ще вільні  →  обрана ділянка  →  що робить ніч
//
// Договір із дорогою — `docs/ARRIVAL-CONTRACT.md`: дорога ставить рівно один прапорець `f.arrival-*`, більше
// приїзд від неї не читає нічого. Ділянки не «кращі» й не «гірші»: у кожної є перевага, за яку вночі платиться,
// і ділянка-залишок (біля рецепції) безпечна, та спиться на ній погано щоночі. Тому тут немає очевидного вибору.
//
// Чому ділянки стоять саме на цих об'єктах мапи: `public/maps/camp-lake.tmj` уже має якорі (ANCHORS у
// `scripts/maps/build_camp_lake.py`) — берег озера, південна галявина, двір рецепції й лісова галявина з буками.
// Нових об'єктів мапа не отримує: розстановка (`scripts/art/check_placement.py`) лишається такою, як була.
import type { GameState } from '../core/state';

/** Три результати дороги (EPISODE-DESIGN §4): рано й спокійно / вчасно / пізно й знервовані. */
export const ARRIVAL_TIMES = ['early', 'ontime', 'late'] as const;
export type ArrivalTime = (typeof ARRIVAL_TIMES)[number];

/** Enum-прапорець часу приїзду; значення — `f.arrival-<результат>` (як `f.pitch`, `f.night`). */
export const ARRIVAL_FLAG = 'f.arrival';
export const arrivalFlag = (t: ArrivalTime): string => `${ARRIVAL_FLAG}-${t}`;

/** Дороги ще не грали — родина приїхала вчасно: приїзд ніколи не лишається без договору. */
export const ARRIVAL_DEFAULT: ArrivalTime = 'ontime';

/** Час приїзду з прапорців стану. Кілька прапорців водночас — беремо найпізніший (гірший для гравця — не вигадуємо кращого). */
export function arrivalOf(flags: readonly string[]): ArrivalTime {
  const found = ARRIVAL_TIMES.filter((t) => flags.includes(arrivalFlag(t)));
  return found.length === 0 ? ARRIVAL_DEFAULT : (found[found.length - 1] as ArrivalTime);
}

export const PITCH_IDS = ['water', 'beeches', 'meadow', 'reception'] as const;
export type PitchId = (typeof PITCH_IDS)[number];

/** Обрана ділянка: enum-прапорець `f.spot-<id>` (не плутати зі старим `f.pitch` — то про намет). Його читає ніч. */
export const PITCH_FLAG = 'f.spot';
export const pitchFlag = (p: PitchId): string => `${PITCH_FLAG}-${p}`;
export const pitchTaken = (flags: readonly string[]): PitchId | null => PITCH_IDS.find((p) => flags.includes(pitchFlag(p))) ?? null;

/** Погода ночі: тиха / дощ / буря. Ніч бурі — головна пружина дня (DAY-DESIGN §1). */
export const NIGHT_WEATHERS = ['calm', 'rain', 'storm'] as const;
export type NightWeather = (typeof NIGHT_WEATHERS)[number];

/**
 * Те, що родина встигла зробити вдень і що пом'якшує ніч. Прапорці ставлять рутини дня (DAY-DESIGN §6) —
 * тут лише їхні імена, щоб ніч читала стан, а не вигадувала.
 */
export const PREP_FLAGS = {
  /** Тент натягнуто над столом і речами. */
  tarp: 'f.prep-tarp',
  /** Відтяжки зав'язані як слід (міні-гра «Вузли»): тент тримає й те, що на нього впаде. */
  knots: 'f.prep-knots',
  /** Авто поставлене з навітряного боку — намет за ним. */
  windbreak: 'f.prep-windbreak',
  /** Намет відтягнуто від кромки води, речі підняті з землі. */
  highGround: 'f.prep-high-ground',
} as const;
export type PrepFlag = (typeof PREP_FLAGS)[keyof typeof PREP_FLAGS];

/**
 * Наслідок ночі. `nudge` — дрібниця, вранці смішно; `bite` — ніч зіпсована, але ранок настає.
 * Сили `block` немає навмисно: жодна ділянка не робить ніч непрохідною (OD: провал завжди м'який).
 */
export type NightBite = 'nudge' | 'bite';
export interface NightEffect {
  readonly id: string;
  readonly pitch: PitchId;
  readonly when: readonly NightWeather[];
  readonly bite: NightBite;
  /** Прапорець підготовки, який цей наслідок скасовує. null — скасувати не можна (дозволено лише для `nudge`). */
  readonly cure: PrepFlag | null;
  /** Текст наслідку (content/locales): `night.<ділянка>.<наслідок>`. */
  readonly textKey: string;
}

/** Звідки гравець може дізнатися про характер ділянки ДО вибору (пункт 1 картки: не сліпий вибір). */
export const LEARN_SOURCES = ['host', 'neighbour', 'look'] as const;
export type LearnSource = (typeof LEARN_SOURCES)[number];

export interface PitchDef {
  readonly id: PitchId;
  /** Якір на мапі табору (`public/maps/camp-lake.tmj`), біля якого стоїть ця ділянка. */
  readonly spot: string;
  /** Черга попиту: 1 — розбирають першою. Ділянка з найбільшим числом лишається завжди. */
  readonly demand: number;
  /** Смуга заїзду (src/content/drive-in.ts). */
  readonly lane: string;
  readonly nameKey: string;
  /** За що її беруть. */
  readonly upsideKey: string;
  /** Чим вона віддячить уночі — одним рядком, тим самим, який каже господиня чи видно самому. */
  readonly catchKey: string;
  /** Хто про цю ділянку розкаже (чи що видно самому). */
  readonly learn: readonly LearnSource[];
}

const key = (p: PitchId, part: string): string => `pitch.${p}.${part}`;

export const PITCHES: readonly PitchDef[] = [
  // Біля води: краєвид і два кроки по воду. Низький витоптаний берег видно самому, про мошку каже господиня.
  { id: 'water', spot: 'obj.water', demand: 1, lane: 'lane.water', nameKey: key('water', 'name'), upsideKey: key('water', 'upside'), catchKey: key('water', 'catch'), learn: ['host', 'look'] },
  // Під буками: тінь і затишок. Про гілки знає господиня — торік одна лягла на чужий тент.
  { id: 'beeches', spot: 'obj.firewood-pile', demand: 2, lane: 'lane.beeches', nameKey: key('beeches', 'name'), upsideKey: key('beeches', 'upside'), catchKey: key('beeches', 'catch'), learn: ['host', 'neighbour'] },
  // Відкрита галявина: сухо й рівно. Що тут гуляє вітер, видно по прим'ятій траві, і сусідка це підтвердить.
  { id: 'meadow', spot: 'obj.pitch-2', demand: 3, lane: 'lane.meadow', nameKey: key('meadow', 'name'), upsideKey: key('meadow', 'upside'), catchKey: key('meadow', 'catch'), learn: ['neighbour', 'look'] },
  // Біля рецепції: вода й світло поруч. Шлагбаум чути звідти, де стоїш, — цього не треба пояснювати.
  { id: 'reception', spot: 'obj.reception-desk', demand: 4, lane: 'lane.reception', nameKey: key('reception', 'name'), upsideKey: key('reception', 'upside'), catchKey: key('reception', 'catch'), learn: ['look', 'neighbour'] },
];

export const pitchDef = (p: PitchId): PitchDef => PITCHES.find((d) => d.id === p) as PitchDef;

const eff = (pitch: PitchId, id: string, when: readonly NightWeather[], bite: NightBite, cure: PrepFlag | null): NightEffect =>
  ({ id: `${pitch}.${id}`, pitch, when, bite, cure, textKey: `night.${pitch}.${id}` });

/**
 * Що робить ніч на кожній ділянці. Кожен `bite` має ліки — те, що родина могла зробити вдень; `nudge` ліків
 * може не мати (мошка не лікується нічим, і це не біда).
 */
export const NIGHT_EFFECTS: readonly NightEffect[] = [
  // Біля води: волого, мошка, а в зливу підтоплює — якщо намет лишився на кромці.
  eff('water', 'midges', ['calm', 'rain'], 'nudge', null),
  eff('water', 'damp', ['calm', 'rain', 'storm'], 'nudge', PREP_FLAGS.tarp),
  eff('water', 'flood', ['storm'], 'bite', PREP_FLAGS.highGround),
  // Під буками: затишно, поки буря не струсить гілку на тент.
  eff('beeches', 'drip', ['rain'], 'nudge', PREP_FLAGS.tarp),
  eff('beeches', 'branch', ['storm'], 'bite', PREP_FLAGS.knots),
  // Відкрита галявина: сухо й рівно, але вітрові нема за що зачепитись, крім намету.
  eff('meadow', 'dew', ['calm'], 'nudge', null),
  eff('meadow', 'wind', ['rain', 'storm'], 'bite', PREP_FLAGS.windbreak),
  // Біля рецепції: нічого страшного ніколи — і погано спиться завжди.
  eff('reception', 'gate', ['calm', 'rain', 'storm'], 'nudge', null),
  eff('reception', 'light', ['calm', 'rain', 'storm'], 'nudge', null),
  eff('reception', 'voices', ['calm', 'rain'], 'nudge', null),
];

/** Наслідки цієї ночі: погода ночі + те, що родина встигла. Порожньо — ніч минула спокійно. */
export function nightAt(pitch: PitchId, weather: NightWeather, prep: readonly string[] = []): readonly NightEffect[] {
  return NIGHT_EFFECTS.filter((e) => e.pitch === pitch && e.when.includes(weather) && (e.cure === null || !prep.includes(e.cure)));
}

/** Ціна ночі числом — лише щоб порівнювати ділянки між собою в сторожах (у грі гравець бачить рядки, не число). */
export const nightCost = (pitch: PitchId, weather: NightWeather, prep: readonly string[] = []): number =>
  nightAt(pitch, weather, prep).reduce((s, e) => s + (e.bite === 'bite' ? 3 : 1), 0);

/** Ніч прохідна: жоден наслідок не замикає гру. `block` у моделі немає — сторож доводить це на всіх ділянках і погодах. */
export const nightPassable = (pitch: PitchId, weather: NightWeather, prep: readonly string[] = []): boolean =>
  nightAt(pitch, weather, prep).every((e) => e.bite === 'nudge' || e.bite === 'bite');

/**
 * Вільні ділянки на мить приїзду: рано — усі, пізніше — лише ті, що нікому не знадобились.
 * Порядок — як у PITCHES (черга попиту), щоб UI показував їх завжди однаково.
 * `pitches` підміняють лише тести мутацій (закон 1): зламані дані мусять червоніти.
 */
export function freePitches(arrival: ArrivalTime, pitches: readonly PitchDef[] = PITCHES): readonly PitchId[] {
  const taken = arrival === 'early' ? 0 : arrival === 'ontime' ? 1 : 2;
  return pitches.filter((d) => d.demand > taken).map((d) => d.id);
}

/** Вільні ділянки за станом гри (час приїзду — з прапорців). */
export const freePitchesOf = (g: Pick<GameState, 'flags'>): readonly PitchId[] => freePitches(arrivalOf(g.flags));

/** Чи можна зайняти цю ділянку зараз: тільки з вільних. Зайнята — сусідське авто вже стоїть, і це видно. */
export const pitchAvailable = (arrival: ArrivalTime, p: PitchId): boolean => freePitches(arrival).includes(p);

/** Що гравець уже дізнався: ділянки, чий характер розкрило хоч одне джерело з `heard`. */
export const learnedPitches = (heard: readonly LearnSource[], pitches: readonly PitchDef[] = PITCHES): readonly PitchId[] =>
  pitches.filter((d) => d.learn.some((s) => heard.includes(s))).map((d) => d.id);

/** Чи гравець може дізнатися про характер УСІХ вільних ділянок цими джерелами (вибір не сліпий). */
export const choiceInformed = (arrival: ArrivalTime, heard: readonly LearnSource[], pitches: readonly PitchDef[] = PITCHES): boolean => {
  const known = learnedPitches(heard, pitches);
  return freePitches(arrival, pitches).every((p) => known.includes(p));
};

/** Реакція родини на обрану ділянку: свій рядок на кожну (`family.<ділянка>` у content/locales). */
export const familyLineKey = (p: PitchId): string => `family.${p}`;

// ───────── сторожі ланцюга (кожен червоніє від мутації даних, закон 1) ─────────

/**
 * Ланка «час приїзду → набір вільних ділянок» ЖИВА: пізніше приїхав — строго менше вибору, вибір лишається
 * завжди (≥ 2), і остання ділянка не займається ніколи. Порожньо — ланка ціла.
 */
export function checkArrivalChain(pitches: readonly PitchDef[] = PITCHES): string[] {
  const out: string[] = [];
  const sets = ARRIVAL_TIMES.map((t) => ({ t, free: freePitches(t, pitches) }));
  for (const { t, free } of sets) if (free.length < 2) out.push(`${t}: free pitches ${free.length} < 2 — no choice left`);
  for (let i = 1; i < sets.length; i++) {
    const prev = sets[i - 1] as { t: ArrivalTime; free: readonly PitchId[] };
    const cur = sets[i] as { t: ArrivalTime; free: readonly PitchId[] };
    if (!cur.free.every((p) => prev.free.includes(p))) out.push(`${cur.t}: free pitches are not a subset of ${prev.t}`);
    if (cur.free.length >= prev.free.length) out.push(`${cur.t}: arriving later did not cost a pitch (${prev.free.length} → ${cur.free.length})`);
  }
  return out;
}

/**
 * Ланка «обрана ділянка → що робить ніч» ЖИВА: у кожної ділянки свій, несхожий на інші набір наслідків,
 * і в бурю кожна чимось відгукується (інакше вибір нічого не вартий).
 */
export function checkPitchesDiffer(effects: readonly NightEffect[] = NIGHT_EFFECTS, pitches: readonly PitchDef[] = PITCHES): string[] {
  const out: string[] = [];
    // Підпис ночі — БЕЗ імені ділянки в id: інакше дві однакові ночі під різними іменами здавались би різними.
  const sig = (p: PitchId): string => effects.filter((e) => e.pitch === p).map((e) => `${e.id.split('.').slice(1).join('.')}:${e.bite}:${[...e.when].sort().join('/')}`).sort().join('|');
  for (const d of pitches) {
    if (sig(d.id) === '') out.push(`${d.id}: night does nothing here — the pitch has no character`);
    if (effects.filter((e) => e.pitch === d.id && e.when.includes('storm')).length === 0) out.push(`${d.id}: storm night passes without a trace`);
  }
  for (let i = 0; i < pitches.length; i++) {
    for (let j = i + 1; j < pitches.length; j++) {
      const a = pitches[i] as PitchDef;
      const b = pitches[j] as PitchDef;
      if (sig(a.id) === sig(b.id)) out.push(`${a.id} and ${b.id}: same night — choosing between them is cosmetic`);
    }
  }
  return out;
}

/**
 * Ніч ніколи не непрохідна: сила наслідку — лише `nudge` чи `bite`, кожен `bite` має ліки (те, що родина
 * могла зробити вдень), і за повної підготовки жодного `bite` не лишається на жодній ділянці.
 */
export function checkNightSoft(effects: readonly NightEffect[] = NIGHT_EFFECTS, pitches: readonly PitchDef[] = PITCHES): string[] {
  const out: string[] = [];
  const all = Object.values(PREP_FLAGS);
  for (const e of effects) {
    if (e.bite !== 'nudge' && e.bite !== 'bite') out.push(`${e.id}: unknown severity «${String(e.bite)}» — only nudge and bite exist`);
    if (e.bite === 'bite' && e.cure === null) out.push(`${e.id}: a bite with no cure — nothing the family does can help`);
  }
  for (const d of pitches) {
    for (const w of NIGHT_WEATHERS) {
      const left = effects.filter((e) => e.pitch === d.id && e.when.includes(w) && (e.cure === null || !all.includes(e.cure)));
      if (left.some((e) => e.bite === 'bite')) out.push(`${d.id}/${w}: a bite survives full preparation`);
    }
  }
  return out;
}

/**
 * Ділянки нерівні, але жодна не «найкраща»: за повної підготовки тиха ділянка-залишок програє, а без
 * підготовки виграє. Так вибір лишається вибором, а не правильною відповіддю.
 */
export function checkNoDominantPitch(effects: readonly NightEffect[] = NIGHT_EFFECTS, pitches: readonly PitchDef[] = PITCHES): string[] {
  const out: string[] = [];
  const cost = (p: PitchId, w: NightWeather, prep: readonly string[]): number =>
    effects.filter((e) => e.pitch === p && e.when.includes(w) && (e.cure === null || !prep.includes(e.cure))).reduce((s, e) => s + (e.bite === 'bite' ? 3 : 1), 0);
  const full = Object.values(PREP_FLAGS) as string[];
  for (const d of pitches) {
    const better = pitches.some((o) => o.id !== d.id && NIGHT_WEATHERS.some((w) => cost(o.id, w, full) < cost(d.id, w, full) || cost(o.id, w, []) < cost(d.id, w, [])));
    if (!better) out.push(`${d.id}: no other pitch is ever better — this one is simply the right answer`);
  }
  return out;
}

/**
 * Вибір не сліпий і не підказаний: про КОЖНУ ділянку є звідки дізнатися, і жодне джерело саме по собі
 * не розкриває всіх — доводиться і спитати, і роздивитись.
 */
export function checkLearnable(pitches: readonly PitchDef[] = PITCHES): string[] {
  const out: string[] = [];
  for (const d of pitches) if (d.learn.length === 0) out.push(`${d.id}: nothing tells the player about this pitch — a blind pick`);
  for (const s of LEARN_SOURCES) {
    if (pitches.every((d) => d.learn.includes(s))) out.push(`${s}: one source tells everything — nothing left to find out`);
  }
  for (const t of ARRIVAL_TIMES) {
    if (!choiceInformed(t, [...LEARN_SOURCES], pitches)) out.push(`${t}: a free pitch cannot be learned about at all`);
  }
  return out;
}
