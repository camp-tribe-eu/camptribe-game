// GAME-309 · дорога як міні-гра на 5 хвилин. Чиста покадрова логіка (без Phaser, без таймерів, без Date):
// усе рухає лише `stepDrive(state, course, { kind: 'tick', dtMs })`. Це не перегони — це «довезти родину
// вчасно, спокійно й без штрафів» (docs/EPISODE-DESIGN.md §4).
//
// Правила, яких ця логіка тримається:
//  * ЖОДНИХ РЕФЛЕКСІВ. Кожна перешкода видна з `VIEW_M` метрів, кожна камера має знак за `CAMERA_SIGN_M`.
//    Найменший час на реакцію рахує `minTelegraphSec()` і стереже тест — звузиш огляд, і він червоніє.
//  * ПРИГОДИ, А НЕ АВАРІЇ. У перешкоду не можна «врізатись»: авто просто їде за нею її швидкістю, доки
//    не перестроїшся. Прокол, об'їзд, затор коштують ЧАС. Ніхто не б'ється, здоров'я в грі немає.
//  * М'ЯКИЙ ПРОВАЛ. Пальне скінчилось — не глухий кут: тебе дотягнуть до колонки (коштує час), і їдеш далі.
//    Спізнився — приїжджаєш однаково, лише вільних ділянок менше.
//  * ЧАС ПРИЇЗДУ ВИРІШУЄ, ЯКІ ДІЛЯНКИ ВІЛЬНІ (ланцюг наслідків, §1). Дорога ставить ОДИН прапорець
//    `f.arrival` (early/ontime/late) за docs/ARRIVAL-CONTRACT.md; набір ділянок рахує приїзд (GAME-310).

/** Смуга: 0 — права (повільна), 1 — середня, 2 — ліва. */
export type Lane = 0 | 1 | 2;
export const LANES: readonly Lane[] = [0, 1, 2];
/** Смуга, з якої починає авто. */
export const START_LANE: Lane = 1;
export type Pace = 'steady' | 'brisk';
/** Три результати — спільні для всіх міні-ігор (каркас GAME-308). */
export type Outcome = 'good' | 'fine' | 'scrappy';

// ── Довжини й швидкості ────────────────────────────────────────────────────────────────────────
/** Довжина ігрової траси в «метрах гри». Смуга прогресу показує з неї реальні кілометри (× `KM_PER_M`). */
export const ROUTE_M = 7200;
/** Траса до озера — 42 км; п'ять хвилин гри — стиснутий їх переказ. */
export const ROUTE_KM = 42;
export const KM_PER_M = ROUTE_KM / ROUTE_M;

export const PACE_MPS: Readonly<Record<Pace, number>> = { steady: 26, brisk: 34 };
/** Скільки метрів попереду видно: з цієї відстані перешкода вже на екрані й уже зрозуміла. */
export const VIEW_M = 560;
/** Знак «контроль швидкості» стоїть за стільки метрів до камери. */
export const CAMERA_SIGN_M = 900;
/**
 * Скільки секунд ДОРОГИ минає за секунду ГРИ. Дорога — «подорож» каркаса (kind journey, 90–180 с живої
 * гри, рішення власника: 2–3 хв), а сама дорога до озера — ~5 хв дорожнього часу: поїздка — її стиснутий
 * переказ, як і 42 км на смузі прогресу.
 * Усі числа нижче — у секундах ДОРОГИ; усе, що бачить гравець (час на реакцію, межа кадрів), ділиться на це.
 */
export const ROAD_SPEEDUP = 2;
/** Скільки мс дороги додає один кадр гри (60 кадрів на секунду гри). */
export const FRAME_ROAD_MS = (1000 / 60) * ROAD_SPEEDUP;
/** Перестроювання триває стільки — рух пальцем, а не влучання. */
export const LANE_CHANGE_MS = 420;
/** Крок кадру обрізається: лаг не має телепортувати авто крізь перешкоду. */
export const MAX_DT_MS = 100;

// ── Пальне ─────────────────────────────────────────────────────────────────────────────────────
export const TANK_START_L = 4.5;
export const TANK_MAX_L = 9.0;
/** Літрів на метр гри: жвава їзда їсть помітно більше — повної траси на старті пального не вистачить. */
export const LITRES_PER_M: Readonly<Record<Pace, number>> = { steady: 0.00042, brisk: 0.00060 };
/** Заправка: стільки секунд стоїмо і стільки коштує бак. */
export const REFUEL_SEC = 22;
export const REFUEL_CENTS = 2600;
/** Сухий бак — не глухий кут: сусід дотягує до колонки. Коштує час, не гроші. */
export const DRY_TANK_SEC = 45;
export const DRY_TANK_FILL_L = 5.0;

// ── Комфорт родини ─────────────────────────────────────────────────────────────────────────────
export const COMFORT_MAX = 100;
/** Три перестроювання за це вікно — вже «різко»: кожне наступне коштує комфорту. */
export const SHARP_WINDOW_MS = 6000;
export const SHARP_CHANGES = 3;
export const SHARP_COST = 12;
/** Жвава їзда повільно точить комфорт (за метр). */
export const BRISK_COMFORT_PER_M = 0.004;
/** Обгін велосипедиста впритул (сусідня смуга, жвавий хід) — не аварія, але неприємно. */
export const CLOSE_PASS_COST = 10;
/** Нижче цього сина заколисує; нижче другого — нервує кішка. */
export const QUEASY_AT = 40;
export const CAT_FRETS_AT = 25;
export const REST_SEC = 18;
export const REST_COMFORT = 30;

// ── Камери й гроші ─────────────────────────────────────────────────────────────────────────────
/** Штраф із грошей родини — справжній, тих самих центів, що й у крамниці. */
export const FINE_CENTS = 9000;

// ── Час приїзду ────────────────────────────────────────────────────────────────────────────────
/** Рано й спокійно — до цієї секунди поїздки. */
export const EARLY_SEC = 285;
/** Рецепція зачиняється на цій секунді: пізніше — «пізно й знервовані». */
export const RECEPTION_SEC = 310;
/** Комфорт, нижче якого приїзд уже не «спокійний», хоч би як рано. */
export const CALM_COMFORT = 70;
/** Комфорт, нижче якого родина приїхала знервована, хоч би як вчасно. */
export const FRAZZLED_COMFORT = 35;

// ── Перешкоди ──────────────────────────────────────────────────────────────────────────────────
export type HazardKind = 'lorry' | 'tractor' | 'roadworks' | 'cyclist';
/** Швидкість перешкоди (м/с): за нею й поїдеш, якщо не перестроївся. */
// Жодна перешкода не стоїть мертво: повз ремонт пускають по черзі, і авто повзе, а не впирається назавжди (інакше — глухий кут).
export const HAZARD_MPS: Readonly<Record<HazardKind, number>> = { lorry: 12, tractor: 6, roadworks: 4, cyclist: 5 };
/** Довжина перешкоди вздовж дороги. */
export const HAZARD_LEN_M: Readonly<Record<HazardKind, number>> = { lorry: 18, tractor: 10, roadworks: 90, cyclist: 4 };
export const HAZARD_KINDS: readonly HazardKind[] = ['lorry', 'roadworks', 'tractor', 'cyclist'];

export interface Hazard { readonly id: string; readonly kind: HazardKind; readonly at: number; readonly lane: Lane }
export interface CameraPost { readonly id: string; readonly at: number }
export type AdventureKind = 'puncture' | 'diversion' | 'jam';
/** Пригода коштує лише час. Затор — не стоянка, а обмеження швидкості на відрізку. */
export const ADVENTURE_SEC: Readonly<Record<'puncture' | 'diversion', number>> = { puncture: 28, diversion: 14 };
export const JAM_MPS = 8;
export const JAM_LEN_M = 300;
export const ADVENTURE_KINDS: readonly AdventureKind[] = ['puncture', 'diversion', 'jam'];
export interface Adventure { readonly id: string; readonly kind: AdventureKind; readonly at: number }
export type StopKind = 'fuel' | 'rest';
/** Скільки метрів видно з'їзд: доки їдеш уздовж нього, зупинка доступна. */
export const STOP_WINDOW_M = 900;
export interface StopPoint { readonly id: string; readonly kind: StopKind; readonly at: number }

export interface Course {
  readonly routeM: number;
  readonly hazards: readonly Hazard[];
  readonly cameras: readonly CameraPost[];
  readonly adventures: readonly Adventure[];
  readonly stops: readonly StopPoint[];
  readonly receptionSec: number;
  readonly startFuelL: number;
}

// ── Допомога після двох «сяк-так» поспіль (договір каркасу міні-ігор) ──────────────────────────
export interface DriveHelp { readonly extraFuelL: number; readonly extraSec: number; readonly comfortShield: boolean }
export const NO_HELP: DriveHelp = { extraFuelL: 0, extraSec: 0, comfortShield: false };
/**
 * Допомога ніколи не блокує й ніколи не докоряє: після двох «сяк-так» поспіль родина виїжджає з повнішим
 * баком, рецепція чекає довше, а різкі перестроювання коштують удвічі менше комфорту.
 */
export function helpFor(scrappyStreak: number): DriveHelp {
  return scrappyStreak >= 2 ? { extraFuelL: 1.6, extraSec: 30, comfortShield: true } : NO_HELP;
}

// ── Детермінований кидок траси ─────────────────────────────────────────────────────────────────
function mix32(x: number): number {
  let z = x >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
  return (z ^ (z >>> 16)) >>> 0;
}
const roll = (seed: number, salt: number, span: number): number => (span <= 0 ? 0 : mix32(mix32(seed ^ 0x9e3779b9) ^ Math.imul(salt + 1, 0x27d4eb2f)) % span);

/** Скільки перешкод на трасі: по чотири кожного виду — щоб на 2–3 хв дороги завжди щось було попереду. */
export const HAZARD_SLOTS = HAZARD_KINDS.length * 4;

/**
 * Траса з зерна світу. Місця перешкод, камер і пригод — у фіксованих комірках із невеликим зсувом від
 * зерна: той самий сейв дає ту саму дорогу, а дві різні поїздки не однакові. Перша перешкода стоїть не
 * раніше ніж за `VIEW_M` від старту — інакше гравець побачив би її вже «на собі».
 */
export function buildCourse(seed: number, help: DriveHelp = NO_HELP): Course {
  const first = VIEW_M + 120;
  const span = ROUTE_M - 200 - first;
  const cell = span / HAZARD_SLOTS;
  const hazards: Hazard[] = [];
  for (let i = 0; i < HAZARD_SLOTS; i++) {
    const kind = HAZARD_KINDS[i % HAZARD_KINDS.length] as HazardKind;
    const at = Math.round(first + cell * i + roll(seed, i, Math.floor(cell * 0.5)));
    // Ремонт дороги ЗАВЖДИ в середній смузі — тій, із якої починає авто. Нічого не робити — це теж
    // рішення, і воно має коштувати: не об'їхав ремонт жодного разу — приїхав після закриття рецепції
    // (каркас GAME-308 цього й вимагає: порожній захід мусить дати «сяк-так»). Решта перешкод — по черзі
    // в різних смугах, щоб не можна було просто стати в одну й їхати.
    const lane = (kind === 'roadworks' ? START_LANE : ((roll(seed, 100 + i, 3) + i) % 3)) as Lane;
    hazards.push({ id: `hz-${i}`, kind, at, lane });
  }
  const cameras: CameraPost[] = [
    { id: 'cam-1', at: Math.round(ROUTE_M * 0.33) + roll(seed, 11, 120) },
    { id: 'cam-2', at: Math.round(ROUTE_M * 0.74) + roll(seed, 12, 120) },
  ];
  // Пригода на поїздку РІВНО ОДНА: три за раз зжерли б увесь запас часу, і «вчасно» стало б недосяжним.
  // Яка саме — з зерна; коштує лише час (докладно — ADVENTURE_SEC, JAM_MPS).
  const kind = ADVENTURE_KINDS[roll(seed, 20, ADVENTURE_KINDS.length)] as AdventureKind;
  const adventures: Adventure[] = [{ id: `adv-${kind}`, kind, at: Math.round(ROUTE_M * 0.47) + roll(seed, 21, 400) }];
  const stops: StopPoint[] = [
    { id: 'stop-fuel-1', kind: 'fuel', at: Math.round(ROUTE_M * 0.28) },
    { id: 'stop-rest', kind: 'rest', at: Math.round(ROUTE_M * 0.52) },
    { id: 'stop-fuel-2', kind: 'fuel', at: Math.round(ROUTE_M * 0.80) },
  ];
  return { routeM: ROUTE_M, hazards, cameras, adventures, stops, receptionSec: RECEPTION_SEC + help.extraSec, startFuelL: TANK_START_L + help.extraFuelL };
}

// ── Стан ───────────────────────────────────────────────────────────────────────────────────────
export type Phase = 'drive' | 'stopped' | 'arrived';
export type StoppedWhy = 'refuel' | 'rest' | 'puncture' | 'diversion' | 'dry';

export interface DriveState {
  readonly phase: Phase;
  /** Секунд поїздки минуло (похідне від кадрів, не від годинника браузера). */
  readonly sec: number;
  readonly metres: number;
  readonly lane: Lane;
  readonly toLane: Lane;
  /** Скільки мс лишилось перестроюватись; 0 — авто стоїть у своїй смузі. */
  readonly changing: number;
  readonly pace: Pace;
  readonly fuelL: number;
  readonly comfort: number;
  readonly moneyCents: number;
  readonly finesCents: number;
  readonly stoppedFor: number;
  readonly stoppedWhy: StoppedWhy | null;
  /** Зупинка, повз яку саме їдемо (кнопка «з'їхати» активна); null — з'їзду поруч немає. */
  readonly offer: StopPoint | null;
  /** Чи попереду камера, про яку вже попередив знак. */
  readonly cameraAhead: boolean;
  /** Мітки часу (мс поїздки) останніх перестроювань — для «різко підряд». */
  readonly recent: readonly number[];
  readonly done: readonly string[];
  readonly help: DriveHelp;
}

export type DriveEventKind =
  | 'lane' | 'lane-busy' | 'sharp' | 'camera-sign' | 'camera-ok' | 'fined' | 'close-pass'
  | 'puncture' | 'diversion' | 'jam' | 'rest' | 'refuel' | 'dry-tank' | 'rolling' | 'queasy' | 'cat' | 'arrived';
export interface DriveEvent { readonly kind: DriveEventKind; readonly at: number }

export type DriveInput =
  | { readonly kind: 'tick'; readonly dtMs: number }
  | { readonly kind: 'lane'; readonly to: Lane }
  | { readonly kind: 'pace'; readonly pace: Pace }
  | { readonly kind: 'stop' };

export function startDrive(course: Course, moneyCents: number, help: DriveHelp = NO_HELP): DriveState {
  return {
    phase: 'drive', sec: 0, metres: 0, lane: START_LANE, toLane: START_LANE, changing: 0, pace: 'steady',
    fuelL: course.startFuelL, comfort: COMFORT_MAX, moneyCents, finesCents: 0,
    stoppedFor: 0, stoppedWhy: null, offer: null, cameraAhead: false, recent: [], done: [], help,
  };
}

const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);
/** Чи займає авто цю смугу зараз: під час перестроювання — обидві (тому перешкода на будь-якій із них гальмує). */
export const occupies = (s: DriveState, lane: Lane): boolean => s.lane === lane || (s.changing > 0 && s.toLane === lane);
const spanHit = (metres: number, h: Hazard): boolean => metres + 2 >= h.at && metres <= h.at + HAZARD_LEN_M[h.kind];

/** Найповільніша перешкода, за якою ми зараз їдемо; null — дорога вільна. */
export function blocker(s: DriveState, c: Course): Hazard | null {
  let out: Hazard | null = null;
  for (const h of c.hazards) if (occupies(s, h.lane) && spanHit(s.metres, h) && (out === null || HAZARD_MPS[h.kind] < HAZARD_MPS[out.kind])) out = h;
  return out;
}

/** Чи тягнеться через цю точку затор. */
const inJam = (c: Course, metres: number): boolean => c.adventures.some((a) => a.kind === 'jam' && metres >= a.at && metres <= a.at + JAM_LEN_M);

/** Швидкість цього кадру (м/с): бажана, обрізана перешкодою і затором. Ніколи не нижче 0. */
export function speedOf(s: DriveState, c: Course): number {
  const want = PACE_MPS[s.pace];
  const b = blocker(s, c);
  const capped = b ? Math.min(want, HAZARD_MPS[b.kind]) : want;
  return Math.max(0, inJam(c, s.metres) ? Math.min(capped, JAM_MPS) : capped);
}

/**
 * Скільки секунд ГРИ (тих, що відчуває гравець) є на реакцію, щоб `kind` не загальмував: перешкода
 * з'являється за `VIEW_M`, зближення — різниця швидкостей, і все ділиться на `ROAD_SPEEDUP`. Камера
 * рахується окремо (`cameraTelegraphSec`): їй потрібен не маневр, а скидання швидкості.
 * Це число — головна обіцянка картки: рефлексів гра не вимагає.
 */
export function telegraphSec(kind: HazardKind, pace: Pace, viewM: number = VIEW_M): number {
  const closing = PACE_MPS[pace] - HAZARD_MPS[kind];
  return closing <= 0 ? Infinity : viewM / closing / ROAD_SPEEDUP;
}
export const cameraTelegraphSec = (pace: Pace, signM: number = CAMERA_SIGN_M): number => signM / PACE_MPS[pace] / ROAD_SPEEDUP;

/** Найменший час на реакцію з усіх перешкод, камер і обох швидкостей — те, що стереже тест. */
export function minTelegraphSec(viewM: number = VIEW_M, signM: number = CAMERA_SIGN_M): number {
  const all = [...HAZARD_KINDS.flatMap((k) => [telegraphSec(k, 'steady', viewM), telegraphSec(k, 'brisk', viewM)]), cameraTelegraphSec('steady', signM), cameraTelegraphSec('brisk', signM)];
  return Math.min(...all);
}
/** Нижче цього числа міні-гра перестає бути «без рефлексів». */
export const MIN_TELEGRAPH_SEC = 8;

// ── Крок ───────────────────────────────────────────────────────────────────────────────────────
export interface StepResult { readonly state: DriveState; readonly events: readonly DriveEvent[] }

export function stepDrive(s: DriveState, c: Course, input: DriveInput): StepResult {
  if (s.phase === 'arrived') return { state: s, events: [] };
  if (input.kind === 'pace') return { state: s.phase === 'drive' ? { ...s, pace: input.pace } : s, events: [] };
  if (input.kind === 'lane') return laneInput(s, input.to);
  if (input.kind === 'stop') return stopInput(s);
  return tick(s, c, input.dtMs);
}

function laneInput(s: DriveState, to: Lane): StepResult {
  const at = s.sec;
  if (s.phase !== 'drive' || s.changing > 0 || to === s.lane) return { state: s, events: [{ kind: 'lane-busy', at }] };
  const ms = s.sec * 1000;
  const recent = [...s.recent.filter((t) => ms - t <= SHARP_WINDOW_MS), ms];
  const sharp = recent.length >= SHARP_CHANGES;
  const cost = sharp ? (s.help.comfortShield ? SHARP_COST / 2 : SHARP_COST) : 0;
  const comfort = clamp(s.comfort - cost, 0, COMFORT_MAX);
  const events: DriveEvent[] = [{ kind: 'lane', at }];
  if (sharp) events.push({ kind: 'sharp', at });
  return { state: mood({ ...s, toLane: to, changing: LANE_CHANGE_MS, recent, comfort }, events, at), events };
}

function stopInput(s: DriveState): StepResult {
  const at = s.sec;
  const offer = s.offer;
  if (s.phase !== 'drive' || offer === null) return { state: s, events: [] };
  if (offer.kind === 'rest') {
    const comfort = clamp(s.comfort + REST_COMFORT, 0, COMFORT_MAX);
    return { state: { ...s, phase: 'stopped', stoppedWhy: 'rest', stoppedFor: REST_SEC, comfort, offer: null, done: [...s.done, offer.id] }, events: [{ kind: 'rest', at }] };
  }
  return {
    state: { ...s, phase: 'stopped', stoppedWhy: 'refuel', stoppedFor: REFUEL_SEC, fuelL: TANK_MAX_L, moneyCents: s.moneyCents - REFUEL_CENTS, offer: null, done: [...s.done, offer.id] },
    events: [{ kind: 'refuel', at }],
  };
}

/** Повідомлення про самопочуття родини — рівно раз на перетин межі. */
function mood(s: DriveState, events: DriveEvent[], at: number): DriveState {
  let done = s.done;
  if (s.comfort < QUEASY_AT && !done.includes('mood-queasy')) { done = [...done, 'mood-queasy']; events.push({ kind: 'queasy', at }); }
  if (s.comfort < CAT_FRETS_AT && !done.includes('mood-cat')) { done = [...done, 'mood-cat']; events.push({ kind: 'cat', at }); }
  return done === s.done ? s : { ...s, done };
}

function tick(s: DriveState, c: Course, dtMsRaw: number): StepResult {
  const dtMs = clamp(dtMsRaw, 0, MAX_DT_MS);
  const dt = dtMs / 1000;
  const events: DriveEvent[] = [];
  const at = s.sec + dt;
  if (s.phase === 'stopped') {
    const left = s.stoppedFor - dt;
    if (left > 0) return { state: { ...s, sec: at, stoppedFor: left }, events };
    events.push({ kind: 'rolling', at });
    return { state: { ...s, sec: at, phase: 'drive', stoppedFor: 0, stoppedWhy: null }, events };
  }

  // перестроювання
  let lane = s.lane; let changing = s.changing;
  if (changing > 0) { changing = Math.max(0, changing - dtMs); if (changing === 0) lane = s.toLane; }

  const mps = speedOf(s, c);
  const from = s.metres;
  const metres = Math.min(c.routeM, from + mps * dt);
  const moved = metres - from;

  // пальне й комфорт
  let fuelL = s.fuelL - moved * LITRES_PER_M[s.pace];
  let comfort = s.comfort - (s.pace === 'brisk' ? moved * BRISK_COMFORT_PER_M : 0);
  let moneyCents = s.moneyCents; let finesCents = s.finesCents;
  let done = s.done; let cameraAhead = s.cameraAhead;
  const crossed = (x: number): boolean => from < x && metres >= x;

  // знаки, камери, пригоди, велосипедисти — усе, що ми щойно проїхали
  for (const cam of c.cameras) {
    if (crossed(cam.at - CAMERA_SIGN_M)) { cameraAhead = true; events.push({ kind: 'camera-sign', at }); }
    if (crossed(cam.at)) {
      cameraAhead = false;
      if (s.pace === 'brisk') { finesCents += FINE_CENTS; moneyCents -= FINE_CENTS; events.push({ kind: 'fined', at }); } else events.push({ kind: 'camera-ok', at });
    }
  }
  for (const h of c.hazards) {
    if (h.kind !== 'cyclist' || !crossed(h.at)) continue;
    const near = Math.abs(lane - h.lane) <= 1;
    if (near && s.pace === 'brisk' && !done.includes(`pass-${h.id}`)) { comfort -= CLOSE_PASS_COST; done = [...done, `pass-${h.id}`]; events.push({ kind: 'close-pass', at }); }
  }
  let phase: Phase = 'drive'; let stoppedFor = 0; let stoppedWhy: StoppedWhy | null = null;
  for (const a of c.adventures) {
    if (a.kind === 'jam') { if (crossed(a.at)) events.push({ kind: 'jam', at }); continue; }
    if (!crossed(a.at) || done.includes(a.id)) continue;
    done = [...done, a.id];
    phase = 'stopped'; stoppedWhy = a.kind; stoppedFor = ADVENTURE_SEC[a.kind];
    events.push({ kind: a.kind, at });
  }

  // сухий бак — м'який провал: дотягли до колонки, коштує час, не глухий кут
  if (fuelL <= 0 && phase === 'drive') {
    fuelL = DRY_TANK_FILL_L;
    phase = 'stopped'; stoppedWhy = 'dry'; stoppedFor = DRY_TANK_SEC;
    events.push({ kind: 'dry-tank', at });
  }
  fuelL = Math.max(0, fuelL);

  // з'їзд поруч: кнопка «зупинитись» доступна, поки їдемо вздовж нього
  const offer = c.stops.find((p) => !done.includes(p.id) && metres >= p.at && metres <= p.at + STOP_WINDOW_M) ?? null;

  if (metres >= c.routeM) { phase = 'arrived'; stoppedWhy = null; stoppedFor = 0; events.push({ kind: 'arrived', at }); }

  const next: DriveState = {
    ...s, sec: at, metres, lane, toLane: changing > 0 ? s.toLane : lane, changing,
    fuelL, comfort: clamp(comfort, 0, COMFORT_MAX), moneyCents, finesCents,
    phase, stoppedFor, stoppedWhy, offer: phase === 'drive' ? offer : null, cameraAhead, done,
  };
  return { state: mood(next, events, at), events };
}

// ── Що дорога віддає приїздові (docs/ARRIVAL-CONTRACT.md, GAME-310) ───────────────────────────
/**
 * Значення прапорця `f.arrival` — ЄДИНЕ, що дорога передає далі. Набір вільних ділянок рахує приїзд
 * (`freePitches`, GAME-310): другого договору тут немає й бути не повинно.
 */
export type Arrival = 'early' | 'ontime' | 'late';
/** Міст назв із docs/ARRIVAL-CONTRACT.md §1: результат міні-гри → значення прапорця. */
export const ARRIVAL_BY_DRIVE: Readonly<Record<Outcome, Arrival>> = { good: 'early', fine: 'ontime', scrappy: 'late' };
/** Тег наслідку для каркаса міні-ігор (MinigameDef.outcomes[*].consequence): його читає сценарій приїзду. */
export const arrivalConsequence = (o: Outcome): string => `arrival.${ARRIVAL_BY_DRIVE[o]}`;

export interface DriveResult {
  readonly outcome: Outcome;
  readonly arrivalSec: number;
  /** Секунд після закриття рецепції; 0 — встигли. */
  readonly lateSec: number;
  readonly comfort: number;
  readonly finesCents: number;
  readonly moneyCents: number;
  readonly fuelL: number;
  /** Скільки настрою родина втратить увечері через дорогу (0 — нічого). */
  readonly moodPenalty: number;
  /** Значення прапорця `f.arrival` для приїзду (GAME-310). */
  readonly arrival: Arrival;
}

/**
 * Підсумок поїздки. «Сяк-так» — це спізнення або знервована родина; він НЕ блокує приїзд, лише звужує
 * вибір ділянки. Рахується з доїханого стану: поки `phase !== 'arrived'`, підсумку ще немає.
 */
export function driveOutcome(s: DriveState, c: Course): Outcome {
  const lateSec = Math.max(0, s.sec - c.receptionSec);
  const comfort = Math.round(s.comfort);
  if (s.phase !== 'arrived') return 'scrappy';   // кадри скінчились раніше за дорогу — це «пізно», не глухий кут
  if (lateSec > 0 || comfort < FRAZZLED_COMFORT) return 'scrappy';
  return s.sec <= EARLY_SEC && comfort >= CALM_COMFORT && s.finesCents === 0 ? 'good' : 'fine';
}

export function driveResult(s: DriveState, c: Course): DriveResult {
  const lateSec = Math.max(0, s.sec - c.receptionSec);
  const comfort = Math.round(s.comfort);
  const outcome = driveOutcome(s, c);
  return {
    outcome, arrivalSec: Math.round(s.sec * 10) / 10, lateSec: Math.round(lateSec * 10) / 10, comfort,
    finesCents: s.finesCents, moneyCents: s.moneyCents, fuelL: Math.round(s.fuelL * 100) / 100,
    moodPenalty: Math.max(0, Math.round((COMFORT_MAX - comfort) / 10)),
    arrival: ARRIVAL_BY_DRIVE[outcome],
  };
}

/** Частка пройденого шляху 0..1 і кілометри для смуги прогресу. */
export const progressOf = (s: DriveState, c: Course): number => clamp(s.metres / c.routeM, 0, 1);
export const kmDone = (s: DriveState): number => Math.round(s.metres * KM_PER_M * 10) / 10;
export const kmLeft = (s: DriveState, c: Course): number => Math.round((c.routeM - s.metres) * KM_PER_M * 10) / 10;
/**
 * Чи встигаємо до закриття рецепції, якщо далі їхати як зараз. Це і є головне число смуги прогресу:
 * не «швидше за всіх», а «встигнемо чи ні».
 */
export function etaSec(s: DriveState, c: Course): number {
  const mps = PACE_MPS[s.pace];
  return s.sec + s.stoppedFor + (c.routeM - s.metres) / mps;
}
export const willMakeReception = (s: DriveState, c: Course): boolean => etaSec(s, c) <= c.receptionSec;
