// GAME-350 · ранок після ночі: «згортаємо табір, не лишаємо слідів». Чиста логіка без часу й DOM — години немає, лише дотики.
// Чотири справи, кожна — короткий порядок дій з правилом: кілки перед тканиною, лісове лишається лісу, вогнище спершу заливають,
// важке в авто йде вниз. Хибний дотик нічого не ламає — лише лічиться; «лишити як є» завжди відкрито (слабкий результат не блокує, EPISODE-DESIGN §11).
// Результат «чистота табору» (good/fine/scrappy + причина) пише ядро в `game.strike` (src/core/camp-strike.ts), його читає підсумок дня.
// Наступний етап епізоду (дорога додому, прихід додому) вставляється ПІСЛЯ цього: SampleDay.dayStage() веде strike → summary.
import { grade, type Outcome } from './minigame';
import { STRIKE_JOBS, type StrikeJob, type StrikeSave } from '../core/camp-strike';

export { STRIKE_JOBS };
export type { StrikeJob, StrikeSave };

export interface StrikeTarget {
  readonly id: string;
  /** Ключ підпису кнопки (uk/en у src/i18n). */
  readonly labelKey: string;
  /** Що мусить бути зроблене раніше; інакше дотик — хибний. */
  readonly needs?: readonly string[];
  /** Лісове: брати не треба. Дотик — хибний, предмет лишається. */
  readonly decoy?: boolean;
}
export interface StrikeJobDef {
  readonly id: StrikeJob;
  readonly nameKey: string;
  readonly hintKey: string;
  /** Причина слабкого результату цієї справи («Чому:»). */
  readonly whyKey: string;
  readonly targets: readonly StrikeTarget[];
}

const pegs = ['peg1', 'peg2', 'peg3', 'peg4'];
export const STRIKE_DEFS: Readonly<Record<StrikeJob, StrikeJobDef>> = {
  tent: {
    id: 'tent', nameKey: 'strike.job.tent', hintKey: 'strike.hint.tent', whyKey: 'strike.why.tent',
    targets: [
      ...pegs.map((id) => ({ id, labelKey: 'strike.t.peg' })),
      { id: 'fold', labelKey: 'strike.t.fold', needs: pegs },
      { id: 'bag', labelKey: 'strike.t.tentbag', needs: ['fold'] },
    ],
  },
  litter: {
    id: 'litter', nameKey: 'strike.job.litter', hintKey: 'strike.hint.litter', whyKey: 'strike.why.litter',
    targets: [
      { id: 'tin', labelKey: 'strike.t.tin' },
      { id: 'cone', labelKey: 'strike.t.cone', decoy: true },
      { id: 'wrap', labelKey: 'strike.t.wrap' },
      { id: 'feather', labelKey: 'strike.t.feather', decoy: true },
      { id: 'bottle', labelKey: 'strike.t.bottle' },
      { id: 'cap', labelKey: 'strike.t.cap' },
    ],
  },
  fire: {
    id: 'fire', nameKey: 'strike.job.fire', hintKey: 'strike.hint.fire', whyKey: 'strike.why.fire',
    targets: [
      { id: 'pour1', labelKey: 'strike.t.pour' },
      { id: 'pour2', labelKey: 'strike.t.pour' },
      { id: 'pour3', labelKey: 'strike.t.pour' },
      { id: 'stir', labelKey: 'strike.t.stir', needs: ['pour1', 'pour2', 'pour3'] },
      { id: 'feel', labelKey: 'strike.t.feel', needs: ['stir'] },
    ],
  },
  car: {
    id: 'car', nameKey: 'strike.job.car', hintKey: 'strike.hint.car', whyKey: 'strike.why.car',
    targets: [
      { id: 'cooler', labelKey: 'strike.t.cooler' },
      { id: 'bags', labelKey: 'strike.t.bags', needs: ['cooler'] },
      { id: 'chairs', labelKey: 'strike.t.chairs', needs: ['bags'] },
      { id: 'boots', labelKey: 'strike.t.boots', needs: ['chairs'] },
      { id: 'shut', labelKey: 'strike.t.shut', needs: ['cooler', 'bags', 'chairs', 'boots'] },
    ],
  },
};

/** Порядок, у якому кнопки ПОКАЗАНО (GAME-350, рев'ю): навмисно не збігається з потрібним (інакше гравець просто йде зліва направо). Фіксований, без часу й випадку:
 *  однаковий у кожному запуску й у кожного гравця; правило порядку каже підказка справи. Справа без `needs` (сміття) показується як є. */
export const SHOWN_ORDER: Readonly<Partial<Record<StrikeJob, readonly string[]>>> = {
  tent: ['bag', 'peg2', 'fold', 'peg4', 'peg1', 'peg3'],
  fire: ['feel', 'pour2', 'stir', 'pour1', 'pour3'],
  car: ['shut', 'chairs', 'bags', 'boots', 'cooler'],
};
export const shownTargets = (job: StrikeJob): readonly StrikeTarget[] => {
  const order = SHOWN_ORDER[job];
  const all = STRIKE_DEFS[job].targets;
  return order ? order.map((id) => all.find((t) => t.id === id) as StrikeTarget) : all;
};

/** Хід однієї справи: що вже зроблено, скільки хибних дотиків і про що сказати гравцеві. */
export interface JobRun { readonly done: readonly string[]; readonly mistakes: number; readonly note: 'none' | 'order' | 'nature' }
export const startJob = (): JobRun => ({ done: [], mistakes: 0, note: 'none' });

export function tap(job: StrikeJob, run: JobRun, targetId: string): JobRun {
  const t = STRIKE_DEFS[job].targets.find((x) => x.id === targetId);
  if (!t || run.done.includes(t.id) || jobComplete(job, run)) return run;
  if (t.decoy === true) return { ...run, mistakes: run.mistakes + 1, note: 'nature' };
  if ((t.needs ?? []).some((n) => !run.done.includes(n))) return { ...run, mistakes: run.mistakes + 1, note: 'order' };
  return { ...run, done: [...run.done, t.id], note: 'none' };
}

/** Справу зроблено, коли виконано кожну ціль, що не є лісовою. */
export const jobComplete = (job: StrikeJob, run: JobRun): boolean => STRIKE_DEFS[job].targets.every((t) => t.decoy === true || run.done.includes(t.id));

/** Результат справи: без хибних дотиків — добре, один-два — нормально, більше — сяк-так. Лишена як є — сяк-так (але не блокує). */
export const jobOutcome = (run: JobRun | null): Outcome => (run === null ? 'scrappy' : run.mistakes === 0 ? 'good' : run.mistakes <= 2 ? 'fine' : 'scrappy');

const POINTS: Readonly<Record<Outcome, number>> = { good: 2, fine: 1, scrappy: 0 };
const ORDER: readonly Outcome[] = ['scrappy', 'fine', 'good'];
const worse = (a: Outcome, b: Outcome): Outcome => (ORDER.indexOf(a) <= ORDER.indexOf(b) ? a : b);
/** Що найважливіше для «без сліду»: спершу вогонь, потім сміття, намет, авто (порядок і для причини, і для стелі). */
export const WHY_ORDER: readonly StrikeJob[] = ['fire', 'litter', 'tent', 'car'];

const asOutcome = (v: string | undefined): Outcome => (v === 'good' || v === 'fine' ? v : 'scrappy');

export interface StrikeResult { readonly outcome: Outcome; /** Ключ причини; null — коли результат добрий. */ readonly whyKey: string | null }
/** Чистота табору з результатів справ. Справа без запису — як лишена. Будь-яка слабка справа — не краще за «нормально» (і причина названа), лишене вогнище — не краще за «сяк-так». */
export function strikeResult(results: StrikeSave['results']): StrikeResult {
  const each = STRIKE_JOBS.map((j) => asOutcome(results[j]));
  let outcome = grade(each.reduce((n, o) => n + POINTS[o], 0) / (2 * STRIKE_JOBS.length));
  if (each.includes('scrappy')) outcome = worse(outcome, 'fine');   // лишена чи зіпсована справа не ховається за добрими іншими: «добре» завжди без причини
  if (asOutcome(results.fire) === 'scrappy') outcome = worse(outcome, 'scrappy');
  if (outcome === 'good') return { outcome, whyKey: null };
  const weak = WHY_ORDER.find((j) => asOutcome(results[j]) !== 'good');
  return { outcome, whyKey: weak ? STRIKE_DEFS[weak].whyKey : null };
}

/** Усі справи розв'язано (зроблено або лишено) — можна рушати. */
export const allResolved = (results: StrikeSave['results']): boolean => STRIKE_JOBS.every((j) => results[j] !== undefined);

/** Запис справи у сейв-форму: нова пара «справа → результат»; «closed» лише через closeStrike. */
export const withResult = (s: StrikeSave | undefined, job: StrikeJob, outcome: Outcome): StrikeSave => ({ closed: s?.closed ?? false, results: { ...(s?.results ?? {}), [job]: outcome } });
/** Закрити ранок: лише коли всі справи розв'язано (інакше запис не змінюється). */
export const closeStrike = (s: StrikeSave | undefined): StrikeSave | undefined => (s !== undefined && allResolved(s.results) ? { ...s, closed: true } : s);
