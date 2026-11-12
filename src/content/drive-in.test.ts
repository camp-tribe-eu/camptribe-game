// GAME-310 · сторожі міні-гри «Заїхати й не зачепити». Закон 1: кожен сторож показано червоним мутацією —
// зламана смуга (замурований прохід) і знята вимога «є куди вивернути кермо» дають РЕД, і текст його видно в описі PR.
import { describe, expect, it } from 'vitest';
import {
  DRIVE_OUTCOMES, LANES, SCRAPES_OK_MAX, canTurn, canUndo, deadEnds, driveFlag, driveLog, driveOutcome, driveStart, driveStep,
  laneOf, logStep, parseLane, reachableStates, solve, undo, type DriveStep, type Lane,
} from './drive-in';
import { PITCHES } from './arrival-pitch';

const run = (lane: Lane, steps: readonly DriveStep[]): ReturnType<typeof driveStart> =>
  steps.reduce((st, s) => driveStep(lane, st, s).state, driveStart(lane));

describe('GAME-310 · смуги заїзду', () => {
  it('у кожної ділянки своя смуга, і вона є в даних', () => {
    for (const p of PITCHES) expect(() => laneOf(p.lane), p.id).not.toThrow();
    expect(new Set(PITCHES.map((p) => p.lane)).size).toBe(PITCHES.length);
  });

  it('кожна смуга проїжджається БЕЗ жодного зачепу, і це не одна пряма', () => {
    for (const [id, lane] of Object.entries(LANES)) {
      const path = solve(lane);
      expect(path, `${id}: смуга непроїжджа`).not.toBeNull();
      const steps = path as readonly DriveStep[];
      expect(steps.length, `${id}: еталонний заїзд ${steps.length} кроків — закоротко чи задовго`).toBeGreaterThanOrEqual(10);
      expect(steps.length, `${id}: еталонний заїзд ${steps.length} кроків — задовго для 1–2 хвилин`).toBeLessThanOrEqual(40);
      expect(steps.filter((s) => s === 'left' || s === 'right').length, `${id}: жодного повороту — це не маневр`).toBeGreaterThanOrEqual(2);
      const end = run(lane, steps);
      expect(end.done, `${id}: еталонний шлях не доводить до ділянки`).toBe(true);
      expect(end.scrapes, `${id}: еталонний шлях зачіпає чуже`).toBe(0);
      expect(driveOutcome(end)).toBe('good');
    }
  });

  it('жодного глухого кута: з будь-якого досяжного стану ділянка лишається досяжною', () => {
    for (const [id, lane] of Object.entries(LANES)) {
      expect(deadEnds(lane), `${id}: глухі кути`).toEqual([]);
      expect(reachableStates(lane).length, `${id}: смуга завузька для маневру`).toBeGreaterThan(20);
    }
  });

  it('МУТАЦІЯ: замурований прохід — сторожі червоніють', () => {
    const broken = parseLane('lane.broken', {
      facing: 'right',
      rows: ['#######', '.S...##', '#####.#', '#....G#', '#######'],
    });
    const walled = { ...broken, cells: broken.cells.map((c, i) => (i === 2 * broken.cols + 5 ? ('hard' as const) : c)) };
    expect(solve(walled), 'замурована смуга мусить лишитись без розв\'язку').toBeNull();
    expect(deadEnds(walled).length, 'замурована смуга мусить дати глухі кути').toBeGreaterThan(0);
  });
});

describe('GAME-310 · кроки, кермо й відкат', () => {
  const lane = laneOf('lane.water');

  it('тверде не пускає: крок відхилено, нічого не змінилось', () => {
    const st = driveStart(lane);
    const r = driveStep(lane, { ...st, facing: 'up' }, 'forward');
    expect(r.outcome).toBe('blocked');
    expect(r.state.steps).toBe(0);
    expect(r.state.scrapes).toBe(0);
  });

  it('назад можна завжди: крок назад повертає рівно туди, звідки приїхав', () => {
    const fwd = driveStep(lane, driveStart(lane), 'forward');
    expect(fwd.outcome).toBe('moved');
    const back = driveStep(lane, fwd.state, 'back');
    expect(back.outcome).toBe('moved');
    expect(back.state.at).toEqual(driveStart(lane).at);
    expect(back.state.facing).toBe(driveStart(lane).facing);
  });

  it('кермо вивертається лише там, де є куди, і відмова нічого не ламає', () => {
    const tight = parseLane('lane.tight', { facing: 'right', rows: ['#####', '.S.G#', '#####'] });
    const st = driveStart(tight);
    expect(canTurn(tight, st), 'у щілині між твердим кермо не вивернеш').toBe(false);
    const r = driveStep(tight, st, 'left');
    expect(r.outcome).toBe('blocked');
    expect(r.state).toEqual(st);
    // МУТАЦІЯ правила: прибрати вимогу «є куди вивернути» — у тій самій щілині поворот стає можливим,
    // і сторож вище («у щілині кермо не вивернеш») червоніє.
    const roomy = { ...tight, cells: tight.cells.map((c, i) => (i === 2 * tight.cols + 1 ? ('free' as const) : c)) };
    expect(canTurn(roomy, st), 'мутація: з вільним боком кермо вивертається').toBe(true);
  });

  it('відкат повертає клітинку й напрямок, але не стирає зачіп: сусід уже вийшов', () => {
    let log = driveLog(lane);
    expect(canUndo(log)).toBe(false);
    expect(undo(log)).toEqual(log);
    const before = log.state;
    log = logStep(lane, log, 'forward').log;
    expect(canUndo(log)).toBe(true);
    const scraped = logStep(lane, log, 'forward');
    const after = undo(scraped.log);
    expect(after.state.at).toEqual(log.state.at);
    expect(after.state.facing).toBe(log.state.facing);
    expect(after.state.scrapes).toBe(scraped.log.state.scrapes);
    expect(undo(after).state.at).toEqual(before.at);
  });
});

describe('GAME-310 · зачіп — м\'який провал, не ворота', () => {
  const lane = laneOf('lane.water');

  it('зачіп лишає авто на місці, рахується й пускає далі', () => {
    // смуга води: перед чужим тентом у рядку 1 (клітинка 5,1) — зачіп, а не стіна
    let st = driveStart(lane);
    for (let i = 0; i < 3; i++) st = driveStep(lane, st, 'forward').state;
    const hit = driveStep(lane, st, 'forward');
    expect(hit.outcome).toBe('scrape');
    expect(hit.state.at).toEqual(st.at);
    expect(hit.state.scrapes).toBe(1);
    const again = driveStep(lane, hit.state, 'forward');
    expect(again.outcome, 'після зачепу гра триває, а не зупиняється').toBe('scrape');
    expect(again.state.scrapes).toBe(2);
  });

  it('після будь-якої кількості зачепів ділянка лишається досяжною', () => {
    for (const [id, l] of Object.entries(LANES)) {
      // навмисно псуємо заїзд: ідемо вперед, доки не впремось, і кожен зачіп робимо ще двічі
      let st = driveStart(l);
      for (let i = 0; i < 12; i++) st = driveStep(l, st, 'forward').state;
      const rest = solve(l, st);
      expect(rest, `${id}: після зачепів смуга стала непроїжджою`).not.toBeNull();
      const end = (rest as readonly DriveStep[]).reduce((s, step) => driveStep(l, s, step).state, st);
      expect(end.done, `${id}: після зачепів ділянки не дістатись`).toBe(true);
      expect(['good', 'ok', 'rough']).toContain(driveOutcome(end));
    }
  });

  it('три результати, і жоден не блокує', () => {
    const path = solve(lane) as readonly DriveStep[];
    const clean = run(lane, path);
    expect(driveOutcome(clean)).toBe('good');
    expect(driveOutcome({ ...clean, scrapes: 1 })).toBe('ok');
    expect(driveOutcome({ ...clean, scrapes: SCRAPES_OK_MAX })).toBe('ok');
    expect(driveOutcome({ ...clean, scrapes: SCRAPES_OK_MAX + 1 })).toBe('rough');
    expect(new Set(DRIVE_OUTCOMES.map((o) => driveFlag(o))).size).toBe(DRIVE_OUTCOMES.length);
    for (const o of DRIVE_OUTCOMES) expect(driveFlag(o)).toMatch(/^f\.drive-in-[a-z]+$/);
    // найгірший результат не заважає доїхати: та сама ділянка, та сама подорож далі
    expect(run(lane, path).done).toBe(true);
  });
});
