// GAME-103 · розмір сейву. Перше джерело YouTube Playables: збережена гра МУСИТЬ бути < 3 МіБ, БАЖАНО < 500 КіБ.
// Найбільший реалістичний сейв: справжній Пролог до кінця контенту (реплей-сценарій), потім журнал і лічильник
// команд добиті до меж (JOURNAL_LIMIT, PROCESSED_LIMIT), потім відпустки на 10 років календаря (скільки з них прийме ліміт відпусток гри). Міряємо рядок, який
// справді лягає в сховище (serialize), у байтах UTF-8, і той самий сейв у вигляді коду відновлення (encodeRestoreCode).
// Друга половина (картка GAME-103, «найбільший сейв, який дає бот на повному проходженні + журнал на межі»): бот
// GAME-37 (той самий, src/content/bot-campaign.test.helpers.ts), найбільший сейв серед його прогонів, журнал добитий до межі.
import { beforeAll, describe, expect, it } from 'vitest';
import { PROCESSED_LIMIT, type Command } from '../core/commands';
import { JOURNAL_LIMIT, newSim, step, type JournalEntry, type SimState } from '../core/sim';
import { fromSave, serialize } from '../core/save';
import { enumerateCombos } from '../../scripts/validator/combos.mjs';
import { uncoveredPairs, variantsFor, type BotRun } from '../content/bot';
import { BOT_SEED, campaign } from '../content/bot-campaign.test.helpers';
import { GAME_DEFS } from '../content/slice-defs';
import { PROLOGUE_BIKE, SEED, START_MONEY } from '../content/replay.scenario';
import { CONTENT, STORY_REV } from '../content/story';
import { DAY_MINUTES, dayOf } from '../core/weather';
import { encodeRestoreCode } from './save-code';
import { createMemoryBackend } from './save-memory';

/** Жорстка межа YouTube: сейв ≥ 3 МіБ платформа не прийме. */
const YT_LIMIT_BYTES = 3 * 1024 * 1024;
/** Бажана межа YouTube. */
const YT_SOFT_BYTES = 500 * 1024;

const CTX = { defs: GAME_DEFS };
const bytes = (s: string): number => new TextEncoder().encode(s).length;
/** Найдовший запис журналу на межах: id по 64 знаки, найдовший тип, дев'ятизначна хвилина. */
const WORST_ENTRY: JournalEntry = { at: 999_999_999, commandId: 'c'.repeat(64), type: 'CompleteQuest', ref: 'r'.repeat(64) };

/** Найбільший реалістичний стан: Пролог до кінця + журнал і processed на межах + відпустки, скільки прийме гра. */
function largestSim(): SimState {
  let s = newSim(SEED, START_MONEY);
  for (const i of PROLOGUE_BIKE) s = step(s, i, CTX);
  if (!s.game.campaignEnded) throw new Error('Пролог не дійшов до кінця — сейв не «найбільший»');
  const cmd = (id: string, command: Record<string, unknown>): void => { s = step(s, { kind: 'command', command: { ...command, commandId: id } as unknown as Command }, CTX); };
  // Пінг-понг між локаціями: кожна прийнята команда — запис журналу й запис processed (обидва мають межі).
  const places = ['loc.home', 'loc.shop', 'loc.road', 'loc.camp.lake'];
  // Подія в дорозі відкриває діалог — його закриваємо (Continue, інакше Choose 0), як гравець.
  let guard = 0;
  const closeDialogue = (): void => {
    while (s.game.dialogue !== null) {
      if (++guard > 20_000) throw new Error('діалог не закривається');
      cmd(`d${guard}`, { type: 'Continue' });
      if (s.game.processed[`d${guard}`]?.ok !== true) cmd(`dc${guard}`, { type: 'Choose', choice: 0 });
    }
  };
  for (let i = 0; i < PROCESSED_LIMIT * 3; i++) { closeDialogue(); cmd(`big${i}`, { type: 'Visit', locationId: places[i % places.length] }); }
  closeDialogue();
  // Календар життя: відпустки на 10 років уперед (за календарем гри), кожна — запис life.leave.
  const calendarDays = 365 * 10;
  for (let day = 0; day < calendarDays; day += 45) {
    if (dayOf(s.clock) !== day) s = step(s, { kind: 'advance', minutes: Math.max(0, day * DAY_MINUTES - s.clock.minutes) }, CTX);
    closeDialogue();
    cmd(`leave${day}`, { type: 'BookLeave', from: day, days: 7 });
  }
  return s;
}

describe('розмір сейву проти лімітів YouTube (GAME-103)', () => {
  const sim = largestSim();
  const json = serialize(sim, STORY_REV);
  const size = bytes(json);

  it('сценарій справді «найбільший»: кінець контенту, журнал і processed на межах, відпустки (скільки дозволяє ліміт відпусток гри) є', () => {
    expect(sim.game.campaignEnded).toBe(true);
    expect(sim.journal).toHaveLength(JOURNAL_LIMIT);
    expect(Object.keys(sim.game.processed)).toHaveLength(PROCESSED_LIMIT);
    expect(sim.game.life.leave.length).toBeGreaterThanOrEqual(2);
  });

  it('сейв читається назад без втрат (міряємо справжній сейв, а не уламок)', () => {
    const r = fromSave(json, { ...(GAME_DEFS.story ? { story: GAME_DEFS.story } : {}), ...(GAME_DEFS.life ? { life: GAME_DEFS.life } : {}) });
    expect(r.ok, r.ok ? '' : `${r.code} ${r.detail}`).toBe(true);
    expect(r.ok && serialize(r.sim, STORY_REV)).toBe(json);
  });

  it('< 3 МіБ (жорстка межа YouTube) і < 500 КіБ (бажана); число друкується', () => {
    console.info(`GAME-103 max save: ${size} bytes (${(size / 1024).toFixed(1)} KiB); journal ${sim.journal.length}/${JOURNAL_LIMIT}, processed ${Object.keys(sim.game.processed).length}/${PROCESSED_LIMIT}, leave ${sim.game.life.leave.length}`);
    expect(size).toBeLessThan(YT_LIMIT_BYTES);
    expect(size).toBeLessThan(YT_SOFT_BYTES);
  });

  it('найгірший випадок на межах: журнал на JOURNAL_LIMIT записів із найдовшими id (64 знаки) — теж < 3 МіБ і < 500 КіБ', () => {
    const stuffed = { ...sim, journal: Array.from({ length: JOURNAL_LIMIT }, () => WORST_ENTRY) };
    const n = bytes(serialize(stuffed, STORY_REV));
    console.info(`GAME-103 worst-case at caps: ${n} bytes (${(n / 1024).toFixed(1)} KiB)`);
    expect(n).toBeLessThan(YT_LIMIT_BYTES);
    expect(n).toBeLessThan(YT_SOFT_BYTES);
  });

  it('код відновлення того самого сейву теж < 3 МіБ і < 500 КіБ', async () => {
    const n = bytes(await encodeRestoreCode(json));
    console.info(`GAME-103 restore code: ${n} bytes (${(n / 1024).toFixed(1)} KiB)`);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(YT_LIMIT_BYTES);
    expect(n).toBeLessThan(YT_SOFT_BYTES);
  });

  it('у сховищі лежать main + prev: обидва слоти разом теж у межах (запас на ротацію)', async () => {
    const mem = createMemoryBackend();
    await mem.write(json); await mem.write(json);
    const total = [...mem.slots.values()].reduce((n, v) => n + bytes(v), 0);
    expect(total).toBeLessThan(YT_LIMIT_BYTES);
  });

  // Негативні контролі: сторож мусить уміти почервоніти.
  const over = (padBytes: number): number => bytes(serialize({ ...sim, journal: sim.journal }, STORY_REV).replace(/}$/, `,"pad":"${'x'.repeat(padBytes)}"}`));

  it('негативний контроль: сейв, роздутий до 3 МіБ, не проходить жорстку межу', () => {
    expect(over(YT_LIMIT_BYTES) < YT_LIMIT_BYTES).toBe(false);
  });

  it('негативний контроль: журнал з межею ×1000 (500 000 записів) — понад 3 МіБ', () => {
    const entry = sim.journal[0];
    if (!entry) throw new Error('журнал порожній');
    const inflated = { ...sim, journal: Array.from({ length: JOURNAL_LIMIT * 1000 }, () => entry) };
    expect(bytes(serialize(inflated, STORY_REV)) < YT_LIMIT_BYTES).toBe(false);
  });

  it('негативний контроль: журнал, добитий до 500 КіБ, порушує бажану межу — межа чутлива, а не декоративна', () => {
    const entry = sim.journal[0];
    if (!entry) throw new Error('журнал порожній');
    const per = bytes(JSON.stringify(entry)) + 1;
    const need = Math.ceil((YT_SOFT_BYTES - size) / per) + 1;
    const inflated = { ...sim, journal: [...sim.journal, ...Array.from({ length: need }, () => entry)] };
    expect(bytes(serialize(inflated, STORY_REV)) < YT_SOFT_BYTES).toBe(false);
  });
});

// ---- найбільший сейв, який дає бот GAME-37 (картка GAME-103, «Спосіб перевірки») ----
/**
 * Скільки прогонів бота міряємо. Той самий бот, те саме зерно, що й bot.test.ts (BOT_SEED), і префікс тієї самої
 * послідовності прогонів (перші BOT_RUNS із 2000; прогін i — завжди той самий варіант і зерно BOT_SEED + i).
 * Чому досить: (1) тест нижче вимагає, щоб ці прогони покривали КОЖНУ дозволену пару осей (профіль, транспорт, тварина,
 * бічна гілка, гроші) — як головна кампанія; (2) бот обмежений maxSteps 80, тож його сейв не росте з N: N лише
 * перебирає варіанти, а їх усі пари вже покрито; (3) 300 — той самий розмір, що в bot.test для «виправленого контенту»,
 * і замір іде ~5 с проти ~35 с на 2000 (межа ≈ 20 с на тест).
 * Звірено разово (24.10.2026, той самий код): усі 2000 прогонів — макс. 4 273 Б (прогін #1652, зерно 20262675), після
 * добивання журналу 100 272 Б; на 300 — 4 250 Б і 100 249 Б. Різниця 23 Б (0,02 % бажаної межі), запас до 500 КіБ ~5×.
 */
const BOT_RUNS = 300;

interface BotSave { readonly index: number; readonly run: BotRun; readonly sim: SimState; readonly size: number }

/** Сейв прогону: стан, на якому бот зупинився, у сім-обгортці гри (годинник/RNG нової гри, зерно прогону). */
const botSim = (run: BotRun): SimState => ({ ...newSim(run.seed), game: run.final });

/** Найбільший сейв серед прогонів. Порожній список — збій, а не «0 байтів»: замір без прогонів нічого не доводить. */
function maxBotSave(runs: readonly BotRun[]): BotSave {
  let best: BotSave | null = null;
  for (const [index, run] of runs.entries()) {
    const sim = botSim(run);
    const size = bytes(serialize(sim, STORY_REV));
    if (best === null || size > best.size) best = { index, run, sim, size };
  }
  if (best === null) throw new Error('немає прогонів бота — замір розміру вакуумний');
  return best;
}

describe(`розмір сейву: найбільший сейв бота GAME-37 (${BOT_RUNS} прогонів, зерно ${BOT_SEED}) + журнал на межі`, () => {
  let runs: BotRun[] = [];
  beforeAll(() => { runs = campaign(GAME_DEFS, BOT_RUNS, BOT_SEED); }, 120_000);

  it('замір не вакуумний: прогонів рівно BOT_RUNS (> 0), усі пари осей покриті, бот доходить до кінця', () => {
    expect(runs.length, 'немає прогонів бота').toBeGreaterThan(0);
    expect(runs).toHaveLength(BOT_RUNS);
    expect(uncoveredPairs(variantsFor(enumerateCombos(CONTENT)), runs)).toEqual([]);
    expect(runs.filter((r) => r.verdict === 'ended').length).toBeGreaterThan(0);
    expect(runs.filter((r) => r.verdict === 'softlock' || r.verdict === 'unknown')).toEqual([]);
  });

  it('найбільший сейв бота — справжній сейв (читається назад без втрат)', () => {
    const max = maxBotSave(runs);
    const json = serialize(max.sim, STORY_REV);
    const r = fromSave(json, { ...(GAME_DEFS.story ? { story: GAME_DEFS.story } : {}), ...(GAME_DEFS.life ? { life: GAME_DEFS.life } : {}) });
    expect(r.ok, r.ok ? '' : `${r.code} ${r.detail}`).toBe(true);
    expect(r.ok && serialize(r.sim, STORY_REV)).toBe(json);
  });

  it('найбільший сейв бота, журнал добитий до JOURNAL_LIMIT найдовшими записами, — < 3 МіБ і < 500 КіБ; числа друкуються', () => {
    const max = maxBotSave(runs);
    // Бот ходить ядром (dispatch), без журналу подорожі: його журнал порожній — добиваємо всі JOURNAL_LIMIT записів.
    const padded: SimState = { ...max.sim, journal: [...max.sim.journal, ...Array.from({ length: JOURNAL_LIMIT - max.sim.journal.length }, () => WORST_ENTRY)] };
    const n = bytes(serialize(padded, STORY_REV));
    const v = max.run.variant;
    console.info(`GAME-103 bot max save: ${max.size} bytes (${(max.size / 1024).toFixed(1)} KiB) — run #${max.index} of ${runs.length}, seed ${max.run.seed}, `
      + `${v.profile}/${v.transport}/${v.animal}/${v.side}/${v.money}, ${max.run.verdict}, ${max.run.steps} steps, processed ${Object.keys(max.run.final.processed).length}; `
      + `with journal ${padded.journal.length}/${JOURNAL_LIMIT}: ${n} bytes (${(n / 1024).toFixed(1)} KiB)`);
    expect(padded.journal).toHaveLength(JOURNAL_LIMIT);
    expect(n).toBeGreaterThan(max.size);
    expect(n).toBeLessThan(YT_LIMIT_BYTES);
    expect(n).toBeLessThan(YT_SOFT_BYTES);
  });

  it('негативний контроль: без прогонів замір падає, а не повертає «0 байтів»', () => {
    expect(() => maxBotSave([])).toThrow(/немає прогонів/);
  });
});
