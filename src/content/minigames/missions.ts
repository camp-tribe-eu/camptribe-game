// GAME-312 · міні-ігри місій сусідів (каркас GAME-308). Кожна місія — ДВА виходи на місце (EPISODE-DESIGN §9б): спершу робота для людини
// (пісок під плитою, приймач на галявині, ліхтар у наметі Тімо), потім — пристрій для табору, що працює сам (§9а: верша, сонячна зарядка, тент над дровами).
// Чиста логіка: час — лише кадри, випадковість — лише зерно. Три результати; «сяк-так» пускає далі (гірший наслідок у ночі з бурею).
import { defineMinigame, FPS, type AnyMinigame, type Difficulty, type FrameInput, type Outcome } from '../../core/minigame';

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
export const byTime = (t: number, goodS: number, fineS: number): Outcome => (t <= goodS * FPS ? 'good' : t <= fineS * FPS ? 'fine' : 'scrappy');
type Results = { readonly good: string; readonly fine: string; readonly scrappy: string };
const outcomesOf = (key: string, c: Results) => ({
  good: { consequence: c.good, resultKey: `mg.${key}.result.good` },
  fine: { consequence: c.fine, resultKey: `mg.${key}.result.fine` },
  scrappy: { consequence: c.scrappy, resultKey: `mg.${key}.result.scrappy` },
});

// ───────────── Пошук: просіяти мокрий пісок під плитою ─────────────
// Поле 7×4. Обручка в одній клітинці (за зерном). Відкрита клітинка «блищить», якщо обручка поруч: думай, а не мети навмання.
export const SIFT_COLS = 7;
export const SIFT_ROWS = 4;
const CELLS = SIFT_COLS * SIFT_ROWS;
/** Просіяти пригорщу — 2 с: поки сито трясеться, наступної не візьмеш (думай, куди далі). */
export const SCOOP_FRAMES = 2 * FPS;
export interface SiftState { readonly t: number; readonly ring: number; readonly opened: readonly number[]; readonly busy: number }
export interface SiftView { readonly cols: number; readonly rows: number; readonly cells: readonly ('sand' | 'empty' | 'glint' | 'ring')[]; readonly hintRow: number | null; readonly scoops: number; readonly sifting: boolean }
export const siftNear = (a: number, b: number): boolean => Math.abs((a % SIFT_COLS) - (b % SIFT_COLS)) + Math.abs(Math.floor(a / SIFT_COLS) - Math.floor(b / SIFT_COLS)) === 1;
export const siftCell = (s: SiftState, i: number): 'sand' | 'empty' | 'glint' | 'ring' => (!s.opened.includes(i) || (s.busy > 0 && s.opened[s.opened.length - 1] === i) ? 'sand' : i === s.ring ? 'ring' : siftNear(i, s.ring) ? 'glint' : 'empty');
export const siftOutcome = (scoops: number, found: boolean): Outcome => (!found ? 'scrappy' : scoops <= 7 ? 'good' : scoops <= 14 ? 'fine' : 'scrappy');

export const RING_SIFT = defineMinigame<SiftState, SiftView>({
  id: 'mg.ring-sift', titleKey: 'mg.ring.title', introKey: 'mg.ring.intro', hintKey: 'mg.ring.hint',
  limitFrames: 85 * FPS,
  outcomes: outcomesOf('ring', { good: 'ring.quick', fine: 'ring.found', scrappy: 'ring.long' }),
  init: (_d, seed) => ({ t: 0, ring: (((seed * 9301 + 49297) % 233280) + 233280) % 233280 % CELLS, opened: [], busy: 0 }),
  step: (s: SiftState, input: FrameInput): SiftState => {
    const p = input.taps[0];
    if (!p || s.busy > 0) return { ...s, t: s.t + 1, busy: Math.max(0, s.busy - 1) };
    const i = Math.min(SIFT_ROWS - 1, Math.floor(clamp01(p.y) * SIFT_ROWS)) * SIFT_COLS + Math.min(SIFT_COLS - 1, Math.floor(clamp01(p.x) * SIFT_COLS));
    return s.opened.includes(i) ? { ...s, t: s.t + 1 } : { t: s.t + 1, ring: s.ring, opened: [...s.opened, i], busy: SCOOP_FRAMES };
  },
  done: (s) => s.opened.includes(s.ring) && s.busy === 0,
  outcomeOf: (s) => siftOutcome(s.opened.length, s.opened.includes(s.ring)),
  view: (s, d: Difficulty) => ({ cols: SIFT_COLS, rows: SIFT_ROWS, cells: Array.from({ length: CELLS }, (_, i) => siftCell(s, i)), hintRow: d.hint ? Math.floor(s.ring / SIFT_COLS) : null, scoops: s.opened.length, sifting: s.busy > 0 }),
});

// ───────────── Тримати в смузі: шкала, що пливе (станція / сонце / натяг мотузки) ─────────────
// Повзунок тягнеш пальцем; ціль повільно «пливе» (вітер, хмари, порив). Тримай сигнал, поки смуга не заповниться.
export interface HoldParams { readonly id: string; readonly key: string; readonly half: number; readonly sway: number; readonly periodS: number; readonly lockS: number; readonly goodS: number; readonly fineS: number; readonly limitS: number; readonly results: Results }
export interface HoldState { readonly t: number; readonly dial: number; readonly base: number; readonly lock: number }
export interface HoldView { readonly dial: number; readonly station: number | null; readonly signal: number; readonly lock: number; readonly need: number }
export const holdTarget = (p: HoldParams, s: HoldState): number => clamp01(s.base + p.sway * Math.sin(s.t / (p.periodS * FPS)));
export const holdSignal = (p: HoldParams, s: HoldState, d: Difficulty): number => Math.max(0, 1 - Math.abs(s.dial - holdTarget(p, s)) / (p.half * d.bandScale));
export function holdGame(p: HoldParams): AnyMinigame {
  const need = Math.round(p.lockS * FPS);
  return defineMinigame<HoldState, HoldView>({
    id: p.id, titleKey: `mg.${p.key}.title`, introKey: `mg.${p.key}.intro`, hintKey: `mg.${p.key}.hint`,
    limitFrames: p.limitS * FPS,
    outcomes: outcomesOf(p.key, p.results),
    init: (_d, seed) => ({ t: 0, dial: 0.05, base: 0.3 + ((((seed * 7919) % 400) + 400) % 400) / 1000, lock: 0 }),
    step: (s: HoldState, input: FrameInput, d: Difficulty): HoldState => {
      const tapX = input.taps[0]?.x;
      const dial = input.drag ? clamp01(input.drag.x) : tapX !== undefined ? clamp01(tapX) : s.dial;
      const next = { ...s, t: s.t + 1, dial };
      return { ...next, lock: holdSignal(p, next, d) >= 0.7 ? s.lock + 1 : Math.max(0, s.lock - 1) };
    },
    done: (s) => s.lock >= need,
    outcomeOf: (s) => (s.lock < need ? 'scrappy' : byTime(s.t, p.goodS, p.fineS)),
    view: (s, d) => ({ dial: s.dial, station: d.hint ? holdTarget(p, s) : null, signal: holdSignal(p, s, d), lock: s.lock, need }),
  });
}

// ───────────── Ритм: рівно, а не швидко (динамо / плетіння) ─────────────
export interface RhythmParams { readonly id: string; readonly key: string; readonly beat: number; readonly tol: number; readonly need: number; readonly goodS: number; readonly fineS: number; readonly limitS: number; readonly results: Results }
export interface RhythmState { readonly t: number; readonly lastTap: number | null; readonly charge: number; readonly jerks: number }
export interface RhythmView { readonly charge: number; readonly need: number; readonly pulse: number; readonly hint: boolean; readonly jerks: number }
export const evenTap = (p: RhythmParams, interval: number, d: Difficulty): boolean => Math.abs(interval - p.beat) <= p.tol * d.bandScale;
export function rhythmGame(p: RhythmParams): AnyMinigame {
  return defineMinigame<RhythmState, RhythmView>({
    id: p.id, titleKey: `mg.${p.key}.title`, introKey: `mg.${p.key}.intro`, hintKey: `mg.${p.key}.hint`,
    limitFrames: p.limitS * FPS,
    outcomes: outcomesOf(p.key, p.results),
    init: () => ({ t: 0, lastTap: null, charge: 0, jerks: 0 }),
    step: (s: RhythmState, input: FrameInput, d: Difficulty): RhythmState => {
      if (input.taps.length === 0) return { ...s, t: s.t + 1 };
      if (s.lastTap === null) return { ...s, t: s.t + 1, lastTap: s.t };
      const even = evenTap(p, s.t - s.lastTap, d);
      return { t: s.t + 1, lastTap: s.t, charge: even ? s.charge + 1 : Math.max(0, s.charge - 1), jerks: even ? s.jerks : s.jerks + 1 };
    },
    done: (s) => s.charge >= p.need,
    outcomeOf: (s) => (s.charge < p.need ? 'scrappy' : byTime(s.t, p.goodS, p.fineS)),
    view: (s, d) => ({ charge: s.charge, need: p.need, pulse: (s.t % p.beat) / p.beat, hint: d.hint, jerks: s.jerks }),
  });
}

// Перший вихід кожної місії — робота для людини.
export const TUNE: HoldParams = { id: 'mg.aerial-tune', key: 'aerial', half: 0.1, sway: 0.12, periodS: 3, lockS: 15, goodS: 35, fineS: 60, limitS: 85, results: { good: 'aerial.clear', fine: 'aerial.ok', scrappy: 'aerial.crackle' } };
export const CRANK: RhythmParams = { id: 'mg.lantern-crank', key: 'lantern', beat: 40, tol: 8, need: 36, goodS: 35, fineS: 60, limitS: 85, results: { good: 'lantern.full', fine: 'lantern.half', scrappy: 'lantern.flicker' } };
export const AERIAL_TUNE = holdGame(TUNE);
export const LANTERN_CRANK = rhythmGame(CRANK);
// Другий вихід — пристрій для табору (§9а), з тим, що дала людина: сітка, панель, мотузка.
export const WEAVE: RhythmParams = { id: 'mg.trap-weave', key: 'trap', beat: 50, tol: 10, need: 30, goodS: 40, fineS: 65, limitS: 90, results: { good: 'trap.tight', fine: 'trap.ok', scrappy: 'trap.loose' } };
export const AIM: HoldParams = { id: 'mg.panel-aim', key: 'panel', half: 0.12, sway: 0.08, periodS: 5, lockS: 12, goodS: 35, fineS: 60, limitS: 85, results: { good: 'panel.full-sun', fine: 'panel.part-sun', scrappy: 'panel.shade' } };
export const TIE: HoldParams = { id: 'mg.tarp-tie', key: 'tarp', half: 0.09, sway: 0.15, periodS: 2.5, lockS: 10, goodS: 35, fineS: 60, limitS: 85, results: { good: 'tarp.taut', fine: 'tarp.ok', scrappy: 'tarp.sag' } };
export const TRAP_WEAVE = rhythmGame(WEAVE);
export const PANEL_AIM = holdGame(AIM);
export const TARP_TIE = holdGame(TIE);

export const MISSION_MINIGAMES: readonly AnyMinigame[] = [RING_SIFT, AERIAL_TUNE, LANTERN_CRANK, TRAP_WEAVE, PANEL_AIM, TARP_TIE];
