// GAME-351 · дорога ДОДОМУ: та сама міні-гра дороги (mg.drive), варіант homebound (mg.drive-home) — коротша, втомлена родина, свої репліки.
// Сторожі: тривалість 90–120 с гри за рівної їзди (за зразком pacing.test.ts), усі три результати досяжні й нічого не блокує, втома вимірна, гроші тягнуться з табору,
// порядок етапів dayStage, результат у сейві (старий сейв без запису, чуже відхиляється), тексти uk+en.
// Мутації (закон 1; кожну прогнано руками, результат — у звіті картки):
//   M1 buildCourse ігнорує variant (завжди траса до озера)            → «тривалість 90–120 с» і «коротша за дорогу до озера» червоніють
//   M2 dayStage не знає 'road-home' (рядок з AFTER_NIGHT прибрано)    → «ранок закрито → дорога додому» і «кожен етап по черзі» червоніють
//   M3 comfortScale/startComfort не діють (втома вимкнена)            → «втома: старт нижче, падає швидше» червоніє
//   M4 homebound-наслідок = arrival.* (затирає f.arrival-*)           → «наслідок home.*, прапорець приїзду не чіпається» червоніє
//   M5 setDriveWallet не доходить (гроші завжди типові)               → «гроші тягнуться з табору» червоніє
//   M6 HOME_BEATS не вживаються в nextBeats                           → «репліки дороги додому свої» червоніє
import { describe, expect, it } from 'vitest';
import { NO_INPUT, openRun, startRun, stepRun, type FrameInput, type MinigameRun, type Outcome } from '../core/minigame';
import { dispatch, type Command } from '../core/commands';
import { initialState } from '../core/state';
import { fromSave, serialize } from '../core/save';
import { newSim } from '../core/sim';
import { DRIVER, SKILL_DEFS, play as playStory } from '../core/story.fixture';
import { LOCALES, type Key } from '../i18n';
import { GAME_DEFS } from './slice-defs';
import { MINIGAME_DEFS, minigameById } from './minigames';
import { DEFAULT_WALLET_CENTS, DRIVE, DRIVE_HOME, HOME_LIMIT_FRAMES, setDriveWallet, type DriveMgState } from './minigames/drive';
import { HOME_BEATS, HOME_BEAT_KEYS, nextBeats } from './drive-script';
import { ROUTE_M, buildCourse, startDrive, stepDrive, type Course } from './drive';
import { dodgeTo, nearCyclist } from './drive.fixture';
import { dayStage } from './sample-day';
import { ROAD_HOME_ID, roadHomeResult } from './road-home';

const SEEDS = [7, 1, 2, 3, 11, 19, 23, 42];
const FRAMES_PER_S = 60;
const laneX = (l: number): number => (l * 2 + 1) / 6;
type Def = typeof DRIVE;
interface Plan { readonly brisk: (s: DriveMgState) => boolean; readonly stop: (s: DriveMgState) => boolean }
const STEADY: Plan = { brisk: () => false, stop: () => false };
/** Жвавіше, поки родина ще не втомилась (комфорт > 72), але не біля камери й велосипедиста; решту — рівно. */
const PARTLY_BRISK: Plan = { brisk: (s) => s.drive.comfort > 72 && !s.drive.cameraAhead && !nearCyclist(s.drive, s.course) && s.drive.fuelL > 0.5, stop: () => false };
const STOP_EVERYWHERE: Plan = { brisk: () => false, stop: () => true };

/** Людина за кермом: помічає перешкоду за ~230 м, дає ввід так, як екран (дотик угорі — темп, унизу — з'їхати, перетягування — смуга). */
function playMg(def: Def, seed: number, plan: Plan): { outcome: Outcome; frames: number; run: MinigameRun } {
  let run = startRun(openRun(def, undefined, seed));
  while (run.phase === 'play') {
    const s = run.state as DriveMgState;
    const taps: { x: number; y: number }[] = [];
    if (plan.brisk(s) !== (s.drive.pace === 'brisk')) taps.push({ x: 0.5, y: 0.1 });
    if (s.drive.offer !== null && plan.stop(s)) taps.push({ x: 0.5, y: 0.9 });
    const to = dodgeTo(s.drive, s.course, 230);
    const input: FrameInput = taps.length > 0 || to !== null ? { taps, drag: to !== null && s.drive.changing === 0 ? { x: laneX(to), y: 0.5 } : null } : NO_INPUT;
    run = stepRun(def, run, input);
  }
  return { outcome: run.outcome as Outcome, frames: run.frame, run };
}
const gameSec = (frames: number): number => frames / FRAMES_PER_S;

describe('GAME-351 · параметри дороги додому', () => {
  it('траса коротша за дорогу до озера, позначена variant, перешкод менше; траса до озера не змінилась', () => {
    for (const seed of SEEDS) {
      const home = buildCourse(seed, undefined, 'homebound');
      const out = buildCourse(seed);
      expect(home.variant, 'homebound').toBe('homebound');
      expect(home.routeM, 'коротша за дорогу до озера').toBeLessThan(out.routeM);
      expect(home.hazards.length).toBeLessThan(out.hazards.length);
      expect(out.variant, 'до озера — без variant').toBeUndefined();
      expect(out.routeM).toBe(ROUTE_M);
    }
  });
  it('у реєстрі є обидві гри; дорога додому — подорож із межею ≤ 150 с живої гри', () => {
    expect(minigameById('mg.drive')).toBe(DRIVE);
    expect(minigameById(ROAD_HOME_ID)).toBe(DRIVE_HOME);
    expect(DRIVE_HOME.limitFrames).toBe(HOME_LIMIT_FRAMES);
    expect(DRIVE_HOME.limitFrames).toBeLessThan(DRIVE.limitFrames);
  });
});

describe('GAME-351 · тривалість: 90–120 с за звичайного темпу (картка R2)', () => {
  it('рівна їзда з об\'їздом перешкод займає 90–120 с гри на кожному зерні; дорога до озера довша', () => {
    for (const seed of SEEDS) {
      const home = gameSec(playMg(DRIVE_HOME, seed, STEADY).frames);
      expect(home, `зерно ${seed}: дорога додому, с`).toBeGreaterThanOrEqual(90);
      expect(home, `зерно ${seed}: дорога додому, с`).toBeLessThanOrEqual(120);
      expect(gameSec(playMg(DRIVE, seed, STEADY).frames), `зерно ${seed}: до озера довша`).toBeGreaterThan(home + 10);
    }
  });
  it('усі три результати досяжні, гра доїжджає сама до межі кадрів (нічого не блокує)', () => {
    for (const seed of SEEDS) {
      const fine = playMg(DRIVE_HOME, seed, STEADY);
      const good = playMg(DRIVE_HOME, seed, PARTLY_BRISK);
      const late = playMg(DRIVE_HOME, seed, STOP_EVERYWHERE);
      expect(fine.outcome, `зерно ${seed}: рівно`).toBe('fine');
      expect(good.outcome, `зерно ${seed}: жвавіше, поки не втомились`).toBe('good');
      expect(late.outcome, `зерно ${seed}: з кожною зупинкою`).toBe('scrappy');
      for (const r of [fine, good, late]) expect(r.frames, `зерно ${seed}: приїхали до межі`).toBeLessThan(r.run.limit);
    }
  });
  it('запас: ідеальна рівна їзда приїздить ≥ 25 с дороги до «вечері» — людині є куди помилитись', () => {
    for (const seed of SEEDS) {
      const st = playMg(DRIVE_HOME, seed, STEADY).run.state as DriveMgState;
      expect(st.course.receptionSec - st.drive.sec, `зерно ${seed}`).toBeGreaterThanOrEqual(25);
    }
  });
  it('гравець, що нічого не робить (порожній ввід), теж доїжджає: «пізно», не глухий кут', () => {
    let run = startRun(openRun(DRIVE_HOME, undefined, 7));
    while (run.phase === 'play') run = stepRun(DRIVE_HOME, run, NO_INPUT);
    expect(run.outcome, 'ремонт дороги стоїть у середній смузі — без руху це «пізно»').toBe('scrappy');
    expect(run.phase).toBe('result');
  });
});

describe('GAME-351 · втомлена родина, гроші, наслідок, репліки', () => {
  it('втома: старт комфорту нижче, а різкі перестроювання вдаряють дужче, ніж до озера', () => {
    const home = buildCourse(7, undefined, 'homebound');
    const out = buildCourse(7);
    const h0 = startDrive(home, 0);
    const o0 = startDrive(out, 0);
    expect(h0.comfort).toBeLessThan(o0.comfort);
    const lanes = [0, 1, 2, 1] as const;
    const swerve = (c: Course, s0: typeof h0): number => {
      let s = s0;
      for (const to of lanes) { s = stepDrive(s, c, { kind: 'lane', to }).state; s = { ...s, changing: 0, lane: s.toLane }; }
      return s0.comfort - s.comfort;
    };
    expect(swerve(home, h0), 'спад комфорту від різких перестроювань').toBeGreaterThan(swerve(out, o0));
    expect(swerve(out, o0), 'контроль: до озера різкі перестроювання теж коштують').toBeGreaterThan(0);
  });
  // За рецензією (закон 1): жвава їзда й близький об'їзд велосипедиста теж множаться на втому, не лише перестроювання.
  // Мутація (перевірено): прибрати `* scale` у BRISK_COMFORT_PER_M чи в CLOSE_PASS_COST (drive.ts) → відповідний тест червоніє.
  const bare = (c: Course): Course => ({ ...c, hazards: [], cameras: [], adventures: [] });
  const briskDrop = (c: Course): number => {
    let s = startDrive(c, 0);
    const c0 = s.comfort;
    s = stepDrive(s, c, { kind: 'pace', pace: 'brisk' }).state;
    for (let i = 0; i < 300; i++) s = stepDrive(s, c, { kind: 'tick', dtMs: 100 }).state;
    return c0 - s.comfort;
  };
  it('втома: жвава їзда їсть комфорт швидше, ніж до озера', () => {
    const home = bare(buildCourse(7, undefined, 'homebound'));
    const out = bare(buildCourse(7));
    expect(briskDrop(out), 'контроль: жвава їзда до озера теж коштує').toBeGreaterThan(0);
    expect(briskDrop(home)).toBeGreaterThan(briskDrop(out));
  });
  it('втома: близький об\'їзд велосипедиста коштує дужче, ніж до озера', () => {
    const passDrop = (c0: Course): number => {
      const c: Course = { ...bare(c0), hazards: [{ id: 'cy', kind: 'cyclist', at: 200, lane: startDrive(c0, 0).lane }] };
      const flat = briskDrop(bare(c0));
      return briskDrop(c) - flat;
    };
    const home = buildCourse(7, undefined, 'homebound');
    const out = buildCourse(7);
    expect(passDrop(out), 'контроль: близький об\'їзд до озера теж коштує').toBeGreaterThan(0);
    expect(passDrop(home)).toBeGreaterThan(passDrop(out));
  });
  it('гроші тягнуться з табору: гаманець після ночі — старт дороги додому; до озера — типовий', () => {
    setDriveWallet(12_345);
    try {
      expect((DRIVE_HOME.init({ timeScale: 1, bandScale: 1, hint: false }, 7) as DriveMgState).drive.moneyCents).toBe(12_345);
      expect((DRIVE.init({ timeScale: 1, bandScale: 1, hint: false }, 7) as DriveMgState).drive.moneyCents).toBe(DEFAULT_WALLET_CENTS);
    } finally { setDriveWallet(DEFAULT_WALLET_CENTS); }
  });
  it('наслідок home.*, прапорець приїзду не чіпається; три різні наслідки; результат лягає в сейв-запис', () => {
    expect(MINIGAME_DEFS[ROAD_HOME_ID]).toEqual({ good: 'home.early', fine: 'home.ontime', scrappy: 'home.late' });
    let s = playStory([DRIVER], initialState(50_000), SKILL_DEFS);
    s = { ...s, flags: [...s.flags, 'f.arrival-ontime'] };
    const r = dispatch(s, { type: 'FinishMinigame', commandId: 'rh1', minigameId: ROAD_HOME_ID, outcome: 'fine' } as Command, { ...GAME_DEFS, ...SKILL_DEFS, minigames: MINIGAME_DEFS });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.flags, 'f.arrival-* — лише від дороги до озера').toEqual(s.flags);
    expect(r.state.minigames?.[ROAD_HOME_ID]?.consequence).toBe('home.ontime');
    expect(roadHomeResult(r.state.minigames)).toBe('fine');
  });
  it('репліки дороги додому свої: немає «кемпінг за 4 км» і «обрати місце», є «вдома»; ключі в uk і en', () => {
    const c = buildCourse(7, undefined, 'homebound');
    const s = { ...startDrive(c, 0), metres: c.routeM * 0.95 };
    const ids = nextBeats(s, c, [], new Set()).map((b) => b.id);
    expect(ids).toContain('home-almost');
    expect(ids).not.toContain('sign-camp');
    expect(ids).not.toContain('lake');
    expect(nextBeats(s, c, [{ kind: 'arrived', at: 1 }], new Set()).map((b) => b.id)).toContain('home-arrived');
    expect(nextBeats(s, c, [{ kind: 'arrived', at: 1 }], new Set()).map((b) => b.id)).not.toContain('arrived');
    expect(HOME_BEATS.some((b) => b.on === 'cat')).toBe(false);
    for (const k of HOME_BEAT_KEYS) for (const lang of ['uk', 'en'] as const) {
      const text = LOCALES[lang][k as Key];
      expect(text?.trim(), `${lang} ${k}`).toBeTruthy();
      expect(text.length, `${lang} ${k}: рядок ≤ 70 знаків`).toBeLessThanOrEqual(70);
    }
    expect(LOCALES.uk['ui.drive.home.arrived' as Key]).not.toBe(LOCALES.uk['ui.drive.beat.arrived' as Key]);
  });
  it('тексти гри: назва, вступ, підказка, три різні результати, смуга «до вечері» і рядок підсумку — uk і en', () => {
    for (const lang of ['uk', 'en'] as const) {
      const L = LOCALES[lang] as Record<string, string>;
      for (const k of ['mg.drive-home.title', 'mg.drive-home.intro', 'mg.drive-home.hint', 'ui.drive.home.etaOk', 'ui.drive.home.etaLate', 'road.home.result']) expect(L[k]?.trim(), `${lang} ${k}`).toBeTruthy();
      expect(new Set(['good', 'fine', 'scrappy'].map((o) => L[`mg.drive-home.result.${o}`])).size, `${lang}: три різні результати`).toBe(3);
      expect(new Set(['good', 'fine', 'scrappy'].map((o) => L[`road.home.res.${o}`])).size).toBe(3);
      expect(L['mg.drive-home.intro'], 'вступ дороги додому — не вступ дороги до озера').not.toBe(L['mg.drive.intro']);
    }
  });
});

describe('GAME-351 · порядок етапів і сейв', () => {
  const closed = { closed: true, results: { tent: 'good', litter: 'good', fire: 'good', car: 'good' } } as const;
  it('ранок закрито → дорога додому; дорогу пройдено → підсумок; кожен етап по черзі', () => {
    expect(dayStage('evening', undefined)).toBe('day');
    expect(dayStage('done', undefined, null)).toBe('strike');
    expect(dayStage('done', { closed: false, results: { tent: 'good' } }, 'good')).toBe('strike');
    expect(dayStage('done', closed, null)).toBe('road-home');
    expect(dayStage('done', closed)).toBe('road-home');
    for (const o of ['good', 'fine', 'scrappy']) expect(dayStage('done', closed, o), `результат ${o}`).toBe('summary');
  });
  it('поганий результат (пізно й сонні) не блокує: scrappy веде в підсумок так само, як good', () => {
    expect(dayStage('done', closed, 'scrappy')).toBe(dayStage('done', closed, 'good'));
  });
  const DEFS = { ...SKILL_DEFS, minigames: MINIGAME_DEFS };
  const start = () => playStory([DRIVER], initialState(50_000), SKILL_DEFS);
  it('результат дороги додому проходить сейв туди й назад (команда → serialize → fromSave)', () => {
    for (const o of ['good', 'fine', 'scrappy'] as const) {
      const r = dispatch(start(), { type: 'FinishMinigame', commandId: `rt-${o}`, minigameId: ROAD_HOME_ID, outcome: o } as Command, DEFS);
      expect(r.ok, o).toBe(true);
      if (!r.ok) return;
      const back = fromSave(serialize({ ...newSim(7, 0), game: r.state }));
      expect(back.ok, o).toBe(true);
      expect(back.ok && roadHomeResult(back.sim.game.minigames), o).toBe(o);
    }
  });
  it('старий сейв без запису вантажиться, і дорогу додому ще не їхали', () => {
    const back = fromSave(serialize({ ...newSim(7, 0), game: start() }));
    expect(back.ok).toBe(true);
    expect(back.ok && roadHomeResult(back.sim.game.minigames)).toBeNull();
    expect(roadHomeResult(undefined)).toBeNull();
  });
  it('чуже відхиляється сейвом, а читання не вірить чужому запису', () => {
    const bad = { ...start(), minigames: { [ROAD_HOME_ID]: { last: 'perfect', consequence: 'home.early', plays: 1, scrappyStreak: 0 } } } as unknown as ReturnType<typeof start>;
    expect(fromSave(serialize({ ...newSim(7, 0), game: bad })).ok).toBe(false);
    expect(roadHomeResult({ [ROAD_HOME_ID]: { last: 'perfect', consequence: 'x', plays: 1, scrappyStreak: 0 } } as never)).toBeNull();
    expect(roadHomeResult({ 'mg.drive': { last: 'good', consequence: 'arrival.early', plays: 1, scrappyStreak: 0 } })).toBeNull();
  });
});
