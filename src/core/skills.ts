// Навички (GAME-72, SIMULATION_RULES SIM-SKL). Вісім напрямів, досвід (XP) — цілі числа, ранг 0–5
// виводиться з досвіду порогами. Досвід дає лише практика: прийнята команда з таблиці practiceOf.
// Повтор тієї самої дії дає дедалі менше, а практика сама не піднімає вище рангу PRACTICE_RANK_CAP.
// RNG тут не споживається — навички не змінюють жодного кидка (SIM-EV-006).

/** Вісім напрямів (SIM-SKL-001). Той самий перелік — у валідаторі (scripts/validator/codes.mjs, звірка в semantics.test). */
export const SKILL_IDS = [
  'skill.planning',
  'skill.camping',
  'skill.mechanics',
  'skill.electrics',
  'skill.cooking',
  'skill.finance',
  'skill.endurance',
  'skill.communication',
] as const;

export type SkillId = (typeof SKILL_IDS)[number];
export const isSkillId = (s: unknown): s is SkillId => (SKILL_IDS as readonly unknown[]).includes(s);

export const MAX_RANK = 5;
/** Поріг досвіду рангу r — RANK_XP[r] (SIM-SKL-005) **(тимч.)**. */
export const RANK_XP: readonly number[] = [0, 10, 30, 60, 100, 150];
/** Досвід за першу практику дії (SIM-SKL-006) **(тимч.)**. */
export const PRACTICE_BASE_XP = 12;
/** Після стількох повторів дія більше не вчить (віддача вже 0) — лічильник далі не росте. */
export const PRACTICE_SATURATION = PRACTICE_BASE_XP;
/** Сама практика не піднімає навичку вище цього рангу (SIM-SKL-007) **(тимч.)**: вище — лише старт професії. */
export const PRACTICE_RANK_CAP = 3;
/** Найбільший досвід, до якого доводить практика: на одиницю менше порогу наступного рангу. */
export const PRACTICE_XP_CAP = (RANK_XP[PRACTICE_RANK_CAP + 1] as number) - 1;

export type Skills = Readonly<Record<string, number>>;

/** Ранг за досвідом: найбільший r, чий поріг досягнуто. */
export function rankOf(xp: number): number {
  let r = 0;
  for (let i = 1; i <= MAX_RANK; i++) if (xp >= (RANK_XP[i] as number)) r = i;
  return r;
}

/** Усі вісім напрямів з нулем — стан до створення персонажа. */
export const zeroSkills = (): Record<string, number> => Object.fromEntries(SKILL_IDS.map((id) => [id, 0]));

/**
 * Старт від професії (SIM-SKL-004): ранг профілю → поріг цього рангу. Невідомий id чи ранг поза 0–5
 * сюди не доходить: їх відсікають валідатор (SKILL_UNKNOWN, SCHEMA_INVALID) і checkDefs (DEFS_BAD_REF/AMOUNT).
 */
export function startSkills(ranks: Readonly<Record<string, number>> | undefined): Record<string, number> {
  const out = zeroSkills();
  for (const [id, r] of Object.entries(ranks ?? {})) if (isSkillId(id)) out[id] = RANK_XP[Math.min(Math.max(r, 0), MAX_RANK)] as number;
  return out;
}

/**
 * Віддача n-го повтору (n — скільки разів ця дія вже вчила): ⌊12 / (n + 1)⌋ — 12, 6, 4, 3, 2, 2, 1, …, 1, 0.
 * Ціле ділення: у стані лише цілі числа.
 */
export const practiceGain = (n: number): number => Math.floor(PRACTICE_BASE_XP / (n + 1));

/**
 * Записати практику: дія `key` вчить навички `skills`. Повертає нові досвід і лічильники або null —
 * дія насичена (віддача 0) і нічого не змінюється. Чиста функція.
 */
export function practise(xp: Skills, counts: Readonly<Record<string, number>>, key: string, skills: readonly SkillId[]):
  { skills: Record<string, number>; practice: Record<string, number> } | null {
  const n = Object.hasOwn(counts, key) ? (counts[key] as number) : 0;
  const gain = practiceGain(n);
  if (gain <= 0) return null;
  const next = { ...xp };
  for (const id of skills) {
    const have = Object.hasOwn(xp, id) ? (xp[id] as number) : 0;
    // Межа практики (SIM-SKL-007): досвід, що вже вище межі (старт професії), не зменшується.
    next[id] = Math.max(have, Math.min(have + gain, PRACTICE_XP_CAP));
  }
  return { skills: next, practice: { ...counts, [key]: n + 1 } };
}
