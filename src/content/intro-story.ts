// GAME-249 · розкадровка вступу як чиста модель (без DOM): ніч — пошук зарядки, лист, вибір героя, Атлас, родинний план, сон; далі суботній ранок — будильник,
// метушня, мета. Компонент Intro.tsx лише малює кроки звідси; порядок кроків і куди веде «Пропустити вступ» перевіряє intro-story.test.ts.
import { GAME_START_MINUTE, minuteOfDay } from '../core/clock';
import type { Key } from '../i18n';

export type StepKind = 'search' | 'letter' | 'pick' | 'atlas' | 'line' | 'night' | 'morning' | 'goal';
export interface Step {
  readonly kind: StepKind;
  readonly who: string | null;
  readonly text: Key | null;
  /** Ніч (дощ, лампа) чи ранок (світло, без дощу): від цього залежать кімната, дощ за вікном і звук. */
  readonly phase: 'night' | 'morning';
}

const n = (kind: StepKind, who: string | null = null, text: Key | null = null): Step => ({ kind, who, text, phase: 'night' });
const m = (kind: StepKind, who: string | null = null, text: Key | null = null): Step => ({ kind, who, text, phase: 'morning' });

export const INTRO_STEPS: readonly Step[] = [
  n('search', null, 'intro.narr1'),
  n('letter'),
  n('pick', 'npc.victoria', 'intro.pick'),
  n('atlas'),
  n('line', 'npc.matthew', 'intro.matthew1'),
  n('line', 'npc.george', 'intro.george1'),
  n('line', 'npc.victoria', 'intro.victoria1'),
  n('line', 'npc.victoria', 'intro.victoria.bed'),
  n('night'),
  m('morning'),
  m('line', 'npc.victoria', 'intro.chaos.victoria'),
  m('line', 'npc.matthew', 'intro.chaos.matthew'),
  m('line', 'npc.george', 'intro.chaos.george'),
  m('goal'),
];

export const PICK_AT = INTRO_STEPS.findIndex((s) => s.kind === 'pick');
export const MORNING_AT = INTRO_STEPS.findIndex((s) => s.kind === 'morning');
/** Кількість кроків до вибору героя (включно з ним) — e2e міряє «перший вибір ≤ 15 с». */
export const INTRO_STEPS_TO_PICK = PICK_AT + 1;
/** Хвилина доби, з якої стартує світ після вступу (годинник ядра: GAME_START_MINUTE, 08:00; ставити 07:00 означало б зсунути крамницю й усі еталонні реплеї): те саме число, що показує годинник у грі. */
export const INTRO_START_TOD = minuteOfDay(0);
export const INTRO_START_LABEL = `${String(Math.floor(INTRO_START_TOD / 60)).padStart(2, '0')}:${String(INTRO_START_TOD % 60).padStart(2, '0')}`;

/**
 * Куди веде «Пропустити вступ» з кроку `i`: до вибору героя, поки героя немає (вибір лишається), інакше — на ранок удома (MORNING_AT). З ранкових кроків — null:
 * вступ закінчено, світ стартує вдома вранці. Ніколи не веде «до машини» повз ранок.
 */
export function skipTarget(i: number, created: boolean): number | null {
  if (i >= MORNING_AT) return null;
  if (!created && i < PICK_AT) return PICK_AT;
  return MORNING_AT;
}

/** Крок після вибору героя: звичайний — Атлас; якщо вступ пропущено — одразу ранок. */
export const afterPick = (skipped: boolean): number => (skipped ? MORNING_AT : PICK_AT + 1);

export { GAME_START_MINUTE };
