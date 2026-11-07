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

/** GAME-265: у виборі вступу — лише родинні профілі (профіль «самостійний дослідник» лишається в контенті для панелі й тестів, але вступ його не пропонує); `soloHero` — лише збірка e2e (?soloHero=1: старі e2e їдуть на велосипеді). */
export const SOLO_PROFILE = 'profile.solo-explorer';
export function introHeroes<T extends { readonly profileKey: string }>(all: readonly T[], soloHero = false): readonly T[] {
  return soloHero ? all : all.filter((c) => c.profileKey !== SOLO_PROFILE);
}

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

/**
 * GAME-257: вступ уже показав «лист → Атлас → план на одну ніч», тож однойменні кроки Прологу (PROLOGUE-HOME-001, ST-001, ST-002) закриваються самим вступом — світ
 * стартує зі зборів (ST-003), а не з повтору. Біт вступу → квести, які він закриває (накопичувально; завершення ідемпотентне — неактивний квест пропускається).
 * Без вступу (старі сейви, тести з пропуском через панель) цього не викликають — поведінка як була.
 */
export type IntroBeat = 'atlas' | 'night' | 'morning';
export const INTRO_BEAT_QUESTS: Readonly<Record<IntroBeat, readonly string[]>> = {
  atlas: ['PROLOGUE-HOME-001', 'ST-001'],          // лист знайдено, Атлас відкрито — «Вечір удома» і «Одна вільна ніч»
  night: ['PROLOGUE-HOME-001', 'ST-001', 'ST-002'], // родинний план розказано — «План на одну ніч»
  morning: ['PROLOGUE-HOME-001', 'ST-001', 'ST-002'], // також для «Пропустити вступ»: ранок завжди застає пролог закритим
};
/** Біт вступу для кроку розкадровки; null — крок нічого не закриває. */
export const introBeatOf = (kind: StepKind): IntroBeat | null => (kind === 'atlas' || kind === 'night' || kind === 'morning' ? kind : null);
