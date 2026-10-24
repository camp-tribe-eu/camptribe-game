// GAME-103 · розмір сейву. Перше джерело YouTube Playables: збережена гра МУСИТЬ бути < 3 МіБ, БАЖАНО < 500 КіБ.
// Найбільший реалістичний сейв: справжній Пролог до кінця контенту (реплей-сценарій), потім журнал і лічильник
// команд добиті до меж (JOURNAL_LIMIT, PROCESSED_LIMIT), потім 10 ігрових років відпусток. Міряємо рядок, який
// справді лягає в сховище (serialize), у байтах UTF-8, і той самий рядок у вигляді коду відновлення.
import { describe, expect, it } from 'vitest';
import { PROCESSED_LIMIT, type Command } from '../core/commands';
import { JOURNAL_LIMIT, newSim, step, type SimState } from '../core/sim';
import { fromSave, serialize } from '../core/save';
import { GAME_DEFS } from '../content/slice-defs';
import { PROLOGUE_BIKE, SEED, START_MONEY } from '../content/replay.scenario';
import { STORY_REV } from '../content/story';
import { DAY_MINUTES, dayOf } from '../core/weather';
import { createMemoryBackend } from './save-memory';

/** Жорстка межа YouTube: сейв ≥ 3 МіБ платформа не прийме. */
const YT_LIMIT_BYTES = 3 * 1024 * 1024;
/** Бажана межа YouTube. */
const YT_SOFT_BYTES = 500 * 1024;

const CTX = { defs: GAME_DEFS };
const bytes = (s: string): number => new TextEncoder().encode(s).length;

/** Найбільший реалістичний стан: Пролог до кінця + журнал і processed на межах + 10 років відпусток. */
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
    const worst = { at: 999_999_999, commandId: 'c'.repeat(64), type: 'CompleteQuest' as const, ref: 'r'.repeat(64) };
    const stuffed = { ...sim, journal: Array.from({ length: JOURNAL_LIMIT }, () => worst) };
    const n = bytes(serialize(stuffed, STORY_REV));
    console.info(`GAME-103 worst-case at caps: ${n} bytes (${(n / 1024).toFixed(1)} KiB)`);
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
