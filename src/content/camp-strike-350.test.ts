// GAME-350 · ранок «згортаємо табір»: логіка справ, оцінка чистоти, порядок етапів і форма в сейві.
// Мутації (закон 1), кожну прогнано руками — результат у звіті картки:
//   M1 справа `fire` не виконується (tap не зараховує `feel`)       → «кожну справу можна зробити» + «усі справи → закрито» червоніють
//   M2 strikeResult не бере лишене вогнище до уваги (без стелі)       → «лишене вогнище — не краще за сяк-так» червоніє
//   M3 strikeResult не повертає причини (whyKey завжди null)          → «Чому: коли не добре» червоніє
//   M4 команда SaveStrike не пише поле / save не несе його            → «сейв несе ранок» червоніє
//   M5 closeStrike закриває без усіх справ                            → «закрити можна лише коли все розв'язано» червоніє
//   M6 dayStage ігнорує ранок (завжди 'summary' після ночі)           → «після ночі — ранок, потім підсумок» червоніє
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dispatch, type Command } from '../core/commands';
import { initialState } from '../core/state';
import { fromSave, serialize } from '../core/save';
import { newSim } from '../core/sim';
import { DRIVER, SKILL_DEFS, play } from '../core/story.fixture';
import { strikeError } from '../core/camp-strike';
import {
  STRIKE_DEFS, STRIKE_JOBS, WHY_ORDER, allResolved, closeStrike, jobComplete, jobOutcome, startJob, strikeResult, tap, withResult,
  type JobRun, type StrikeJob, type StrikeSave,
} from './camp-strike';
import { dayStage } from './sample-day';
import { SHOWN_ORDER, shownTargets } from './camp-strike';
import type { Outcome } from './minigame';

/** Правильний прохід справи: цілі в порядку списку, лісове пропускаємо. */
const solve = (job: StrikeJob): JobRun => STRIKE_DEFS[job].targets.filter((t) => t.decoy !== true).reduce((r, t) => tap(job, r, t.id), startJob());
const all = (o: Outcome | undefined, over: Partial<Record<StrikeJob, string>> = {}): StrikeSave['results'] => ({ ...Object.fromEntries(STRIKE_JOBS.map((j) => [j, o])), ...over }) as StrikeSave['results'];
const uk = JSON.parse(readFileSync(new URL('../i18n/uk.json', import.meta.url), 'utf8')) as Record<string, string>;
const en = JSON.parse(readFileSync(new URL('../i18n/en.json', import.meta.url), 'utf8')) as Record<string, string>;

describe('справи ранку', () => {
  it('кожну справу можна зробити від початку до кінця без хибних дотиків', () => {
    for (const j of STRIKE_JOBS) {
      const r = solve(j);
      expect(jobComplete(j, r), j).toBe(true);
      expect(r.mistakes, j).toBe(0);
      expect(jobOutcome(r), j).toBe('good');
    }
  });
  it('нічого не вдалось раніше за час: жодна справа не закрита до першого дотику', () => {
    for (const j of STRIKE_JOBS) expect(jobComplete(j, startJob()), j).toBe(false);
  });
  it('порядок має значення: тканина до кілків і багажник до речей — хибний дотик, що нічого не ламає', () => {
    const r = tap('tent', startJob(), 'fold');
    expect(r.done).toEqual([]);
    expect(r.mistakes).toBe(1);
    expect(r.note).toBe('order');
    expect(jobComplete('tent', solve('tent'))).toBe(true);
    expect(tap('car', startJob(), 'shut').mistakes).toBe(1);
  });
  it('лісове (шишка, пір’їна) не береться: дотик хибний, предмет лишається', () => {
    const r = tap('litter', startJob(), 'cone');
    expect(r.done).toEqual([]);
    expect(r.note).toBe('nature');
    expect(jobComplete('litter', ['tin', 'wrap', 'bottle', 'cap'].reduce((x, id) => tap('litter', x, id), startJob()))).toBe(true);
  });
  it('оцінка справи: 0 хибних — добре, 1–2 — нормально, 3+ — сяк-так, лишена — сяк-так', () => {
    const miss = (n: number): JobRun => ({ done: [], mistakes: n, note: 'order' });
    expect([0, 1, 2, 3, 9].map((n) => jobOutcome(miss(n)))).toEqual(['good', 'fine', 'fine', 'scrappy', 'scrappy']);
    expect(jobOutcome(null)).toBe('scrappy');
  });
  it('дотик по вже зробленій цілі повертає той самий хід (не лічиться хибним)', () => {
    const r = tap('tent', startJob(), 'peg1');
    expect(r.done).toEqual(['peg1']);
    expect(tap('tent', r, 'peg1')).toBe(r);
  });
  it('невідомий дотик і дотик після кінця справи нічого не змінюють', () => {
    const r = startJob();
    expect(tap('tent', r, 'nope')).toBe(r);
    const d = solve('fire');
    expect(tap('fire', d, 'pour1')).toBe(d);
  });
  it('усі підписи справ є в обох мовах', () => {
    const keys = STRIKE_JOBS.flatMap((j) => { const d = STRIKE_DEFS[j]; return [d.nameKey, d.hintKey, d.whyKey, ...d.targets.map((t) => t.labelKey)]; });
    for (const k of new Set(keys)) { expect(uk[k], `uk ${k}`).toBeTruthy(); expect(en[k], `en ${k}`).toBeTruthy(); }
    for (const k of ['strike.title', 'strike.note', 'strike.skip', 'strike.finish', 'strike.result', 'strike.why', 'strike.res.good', 'strike.res.fine', 'strike.res.scrappy', 'strike.step.order', 'strike.step.nature', 'strike.step.ok', 'strike.job.done', 'strike.job.left']) { expect(uk[k], k).toBeTruthy(); expect(en[k], k).toBeTruthy(); }
  });
});

describe('порядок показу кнопок (рев\'ю GAME-350)', () => {
  const required = (j: StrikeJob): string[] => STRIKE_DEFS[j].targets.map((t) => t.id);
  it('показ — та сама множина кнопок, але не в порядку дій: тент, вогнище, авто', () => {
    for (const j of ['tent', 'fire', 'car'] as const) {
      const shown = shownTargets(j).map((t) => t.id);
      expect([...shown].sort(), j).toEqual(required(j).sort());
      expect(shown, j).not.toEqual(required(j));
    }
  });
  it('тап по порядку показу дає хоч один хибний дотик', () => {
    for (const j of ['tent', 'fire', 'car'] as const) {
      const run = shownTargets(j).reduce((r, t) => tap(j, r, t.id), startJob());
      expect(run.mistakes, j).toBeGreaterThanOrEqual(1);
    }
  });
  it('перша показана кнопка завжди хибна, тож «зліва направо» не проходить', () => {
    for (const j of ['tent', 'fire', 'car'] as const) expect(tap(j, startJob(), (shownTargets(j)[0] as { id: string }).id).mistakes, j).toBe(1);
  });
  it('порядок фіксований (без випадку): два виклики однакові; справа без порядку показується як є', () => {
    expect(shownTargets('car')).toEqual(shownTargets('car'));
    expect(SHOWN_ORDER.litter).toBeUndefined();
    expect(shownTargets('litter')).toBe(STRIKE_DEFS.litter.targets);
  });
  it('авто: порядок збігається з підказкою — важке (термосумка, рюкзаки) раніше за легке (стільці, чоботи)', () => {
    expect(required('car')).toEqual(['cooler', 'bags', 'chairs', 'boots', 'shut']);
  });
});

describe('чистота табору', () => {
  it('усі справи добре → «добре» без причини', () => {
    expect(strikeResult(all('good'))).toEqual({ outcome: 'good', whyKey: null });
  });
  it('одна-дві нормальні справи з чотирьох ще «добре»; три — вже «нормально» і причина названа', () => {
    expect(strikeResult(all('good', { car: 'fine' })).outcome).toBe('good');
    expect(strikeResult(all('good', { car: 'fine', tent: 'fine' })).outcome).toBe('good');
    const r = strikeResult(all('good', { car: 'fine', tent: 'fine', litter: 'fine' }));
    expect(r.outcome).toBe('fine');
    expect(r.whyKey).toBe(STRIKE_DEFS.litter.whyKey);
  });
  it('Чому: коли не добре — завжди є ключ причини, а коли добре — його нема', () => {
    for (const j of STRIKE_JOBS) {
      const r = strikeResult(all('good', { [j]: 'scrappy' }));
      expect(r.outcome, j).not.toBe('good');
      expect(r.whyKey, j).toBe(STRIKE_DEFS[j].whyKey);
    }
    expect(strikeResult(all('scrappy')).outcome).toBe('scrappy');
  });
  it('лишене вогнище — не краще за сяк-так; будь-яка інша лишена справа — не краще за нормально', () => {
    expect(strikeResult(all('good', { fire: 'scrappy' })).outcome).toBe('scrappy');
    for (const j of ['litter', 'tent', 'car'] as const) expect(strikeResult(all('good', { [j]: 'scrappy' })).outcome, j).toBe('fine');
  });
  it('причина — найважливіша слабка справа: вогонь, сміття, намет, авто', () => {
    expect(WHY_ORDER).toEqual(['fire', 'litter', 'tent', 'car']);
    expect(strikeResult(all('scrappy')).whyKey).toBe(STRIKE_DEFS.fire.whyKey);
    expect(strikeResult(all('good', { litter: 'fine', car: 'scrappy', tent: 'scrappy' })).whyKey).toBe(STRIKE_DEFS.litter.whyKey);
  });
  it('справа без запису — як лишена, слабкий результат нічого не блокує', () => {
    expect(strikeResult({}).outcome).toBe('scrappy');
    expect(strikeResult({}).whyKey).not.toBeNull();
  });
});

describe('ранок закривається, коли розв’язано ВСЕ', () => {
  const full = (): StrikeSave => STRIKE_JOBS.reduce<StrikeSave | undefined>((s, j) => withResult(s, j, jobOutcome(solve(j))), undefined) as StrikeSave;
  it('усі справи зроблено → закрито, результат «добре»', () => {
    const s = closeStrike(full());
    expect(s?.closed).toBe(true);
    expect(strikeResult((s as StrikeSave).results).outcome).toBe('good');
  });
  it('закрити можна лише коли все розв’язано: три з чотирьох — запис не змінюється', () => {
    let s: StrikeSave | undefined;
    for (const j of STRIKE_JOBS.slice(0, 3)) s = withResult(s, j, 'good');
    expect(allResolved((s as StrikeSave).results)).toBe(false);
    expect(closeStrike(s)).toBe(s);
    expect(closeStrike(undefined)).toBeUndefined();
  });
  it('слабкий прохід (усе лишено як є) теж закривається — нічого не блокує', () => {
    const s = STRIKE_JOBS.reduce<StrikeSave | undefined>((x, j) => withResult(x, j, jobOutcome(null)), undefined);
    const c = closeStrike(s);
    expect(c?.closed).toBe(true);
    expect(strikeResult((c as StrikeSave).results).outcome).toBe('scrappy');
  });
  it('запис справи після закриття не відкриває ранок знову', () => {
    expect(withResult(closeStrike(full()), 'tent', 'fine').closed).toBe(true);
  });
});

describe('етап дня після ночі', () => {
  it('до ночі — день; після ночі — ранок, поки не закрито; тоді (GAME-351) дорога додому і підсумок', () => {
    expect(dayStage('evening', undefined)).toBe('day');
    expect(dayStage(null, undefined)).toBe('day');
    expect(dayStage('done', undefined)).toBe('strike');
    expect(dayStage('done', { closed: false, results: { tent: 'good' } })).toBe('strike');
    // GAME-351: після закритого ранку йде дорога додому, і лише потім підсумок (повний порядок — drive-home-351.test.ts).
    expect(dayStage('done', { closed: true, results: all('good') })).toBe('road-home');
    expect(dayStage('done', { closed: true, results: all('good') }, 'fine')).toBe('summary');
  });
});

describe('сейв несе ранок', () => {
  const DEFS = { ...SKILL_DEFS };
  const start = () => play([DRIVER], initialState(50_000), DEFS);
  const saved: StrikeSave = { closed: true, results: all('fine') };
  it('команда пише поле, збереження й завантаження повертають його, розмір крихітний', () => {
    const r = dispatch(start(), { type: 'SaveStrike', commandId: 's1', strike: saved } as Command, DEFS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.strike).toEqual(saved);
    const text = serialize({ ...newSim(7, 0), game: r.state });
    const back = fromSave(text);
    expect(back.ok && back.sim.game.strike).toEqual(saved);
    expect(JSON.stringify(saved).length).toBeLessThan(200);
  });
  it('старий сейв без поля вантажиться, поле лишається порожнім', () => {
    const back = fromSave(serialize({ ...newSim(7, 0), game: start() }));
    expect(back.ok).toBe(true);
    expect(back.ok && back.sim.game.strike).toBeUndefined();
  });
  it('чуже не пускається ні командою, ні сейвом', () => {
    const bads = [null, { closed: 'yes', results: {} }, { closed: false, results: { tent: 'perfect' } }, { closed: false, results: { sauna: 'good' } }, { closed: true, results: { tent: 'good' } }, { closed: false, results: {}, pad: 'x'.repeat(600) }];
    for (const bad of bads) {
      expect(strikeError(bad), JSON.stringify(bad)).not.toBeNull();
      expect(dispatch(start(), { type: 'SaveStrike', commandId: 's2', strike: bad } as unknown as Command, DEFS).ok, JSON.stringify(bad)).toBe(false);
    }
    const g = { ...start(), strike: { closed: true, results: { tent: 'good' } } as unknown as StrikeSave };
    expect(fromSave(serialize({ ...newSim(7, 0), game: g })).ok).toBe(false);
  });
});
