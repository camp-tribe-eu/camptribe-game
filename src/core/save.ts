// Формат сейву (GAME-33, TD-007, CR-020, CR-060). Чисті функції: рядок ↔ стан симуляції.
// Сховище (IndexedDB) і код відновлення — платформний шар; ядро про браузер не знає.
//
// Правила:
// * кожен сейв має `schemaVersion`; новіша за підтримувану — відмова, а не «спробуємо»;
// * старіша — ланцюжок міграцій MIGRATIONS[v] → v+1 до поточної;
// * контрольна сума — над станом у ТІЙ версії, у якій його записано (до міграцій);
// * кожна випущена версія лишається фікстурою в tests/saves/ назавжди.
import type { StoryDefs } from './defs';
import { matches } from './story';
import { stateHash } from './hash';
import { isJournalType, type SimState } from './sim';
import { PRACTICE_SATURATION, SKILL_IDS, zeroSkills } from './skills';
import { REJECT_CODES } from './state';

export const SAVE_FORMAT = 'camplife-save';
export const SAVE_VERSION = 2;

export interface SaveFile {
  readonly format: typeof SAVE_FORMAT;
  readonly schemaVersion: number;
  /** stateHash(sim) — ловить обрізаний чи підправлений руками файл. */
  readonly checksum: string;
  /** Під майбутню прив'язку до акаунта сайту (OD-008). У v1 — завжди null, без мережі. */
  readonly accountId: null;
  /**
   * Відбиток сюжету, з яким записано сейв (рецензія TL). Лише для діагностики: сумісне оновлення
   * контенту сейв НЕ відкидає — відкидає лише посилання на те, чого в контенті вже немає.
   */
  readonly contentRev?: string | null;
  readonly sim: SimState;
}

export const LOAD_CODES = ['SAVE_PARSE', 'SAVE_FORMAT', 'SAVE_VERSION_UNSUPPORTED', 'SAVE_CHECKSUM', 'SAVE_SHAPE', 'SAVE_CONTENT_MISMATCH'] as const;
export type LoadCode = (typeof LOAD_CODES)[number];

export type LoadResult =
  | { readonly ok: true; readonly sim: SimState; readonly fromVersion: number; readonly contentRev: string | null }
  | { readonly ok: false; readonly code: LoadCode; readonly detail: string };

/** Міграції: MIGRATIONS[v] переводить сейв версії v у v+1. Кожна — чиста й не губить жодного поля. */
export const MIGRATIONS: Readonly<Record<number, (sim: unknown) => unknown>> = {
  // v1 → v2 (GAME-29): з'явились персонаж і квести. Старий сейв — гра до створення персонажа.
  // GAME-46: зерно світу (погода дня). Зерна v1 не зберігав, а з RNG стану його не відновити —
  // тож усім сейвам v1 однаково 0: детерміновано, той самий v1 завжди дає ту саму погоду.
  // GAME-48: пам'ять NPC. До персонажа розмов не було — NPC нічого не пам'ятають.
  // GAME-72: навички. До персонажа вчитись нікому — усі вісім напрямів 0, практики немає.
  1: (sim) => {
    const s = sim as { game: Record<string, unknown> };
    return { ...s, journal: [], worldSeed: 0, game: { ...s.game, schemaVersion: 2, player: null, quests: {}, campaignEnded: false, flags: [], npcMemory: {}, skills: zeroSkills(), practice: {}, dialogue: null } };
  },
};

export function toSave(sim: SimState, contentRev: string | null = null): SaveFile {
  return { format: SAVE_FORMAT, schemaVersion: SAVE_VERSION, checksum: stateHash(sim), accountId: null, contentRev, sim };
}

export const serialize = (sim: SimState, contentRev: string | null = null): string => JSON.stringify(toSave(sim, contentRev));

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min = 0): boolean => typeof v === 'number' && Number.isSafeInteger(v) && v >= min;

/** Мінімальна перевірка форми поточної версії: решту гарантує контрольна сума. */
function shapeError(sim: unknown): string | null {
  if (!isObj(sim)) return 'sim is not an object';
  const { game, clock, rng, finds, journal, worldSeed } = sim;
  if (!isObj(game) || !isObj(clock) || !Array.isArray(rng) || !isInt(finds)) return 'missing game/clock/rng/finds';
  if (!isInt(worldSeed) || (worldSeed as number) > 0xffff_ffff) return 'worldSeed';
  if (!Array.isArray(journal) || journal.some((e) => !isObj(e) || !isInt(e.at) || typeof e.commandId !== 'string' || !isJournalType(e.type) || !(e.ref === null || typeof e.ref === 'string'))) return 'journal';
  if (game.schemaVersion !== 2 || !isInt(game.moneyCents) || !isInt(game.seq)) return 'game: version, money or seq';
  if (!isObj(game.inventory) || !Array.isArray(game.grants) || !isObj(game.processed)) return 'game: inventory, grants or processed';
  if (Object.values(game.inventory).some((q) => !isInt(q, 1))) return 'game: inventory quantity';
  if (game.grants.some((g) => typeof g !== 'string')) return 'game: grant ids';
  if (Object.values(game.processed).some((r) => !isObj(r) || typeof r.ok !== 'boolean' || typeof r.fp !== 'string' || (!r.ok && !(REJECT_CODES as readonly unknown[]).includes(r.code)))) return 'game: processed records';
  if (typeof game.campaignEnded !== 'boolean' || !isObj(game.quests)) return 'game: quests';
  if (Object.values(game.quests).some((q) => !isObj(q) || !['active', 'completed', 'declined'].includes(q.status as string) || !Array.isArray(q.done) || q.done.some((o) => typeof o !== 'string'))) return 'game: quest progress';
  if (!Array.isArray(game.flags) || game.flags.some((f) => typeof f !== 'string')) return 'game: flags';
  // Пам'ять NPC (GAME-48): факти — рядки, відсортовані й без повторів (так їх пише лише ядро).
  if (!isObj(game.npcMemory) || Object.values(game.npcMemory).some((m) => !Array.isArray(m) || m.some((f, i) => typeof f !== 'string' || (i > 0 && !((m[i - 1] as string) < f))))) return 'game: npcMemory';
  // Навички (GAME-72): рівно вісім відомих id, досвід — ціле ≥ 0; лічильник практики — ціле 1…насичення.
  if (!isObj(game.skills) || Object.keys(game.skills).sort().join() !== [...SKILL_IDS].sort().join() || Object.values(game.skills).some((x) => !isInt(x))) return 'game: skills';
  if (!isObj(game.practice) || Object.values(game.practice).some((n) => !isInt(n, 1) || (n as number) > PRACTICE_SATURATION)) return 'game: practice';
  const dl = game.dialogue;
  if (dl !== null && (!isObj(dl) || typeof dl.id !== 'string' || typeof dl.node !== 'string')) return 'game: dialogue';
  const p = game.player;
  if (p !== null && (!isObj(p) || typeof p.profileId !== 'string' || typeof p.transportId !== 'string' || typeof p.animalId !== 'string' || !(p.locationId === null || typeof p.locationId === 'string'))) return 'game: player';
  if (!isInt(clock.minutes) || typeof clock.accMs !== 'number' || typeof clock.paused !== 'boolean') return 'clock';
  if (rng.length !== 4 || rng.some((w) => !isInt(w) || (w as number) > 0xffff_ffff)) return 'rng';
  return null;
}

/**
 * Посилання сейву, яких у нинішньому сюжеті вже немає (квест прибрали, локацію перейменували):
 * такий сейв у грі застряг би назавжди (UNKNOWN_TARGET на кожну спробу). Діалог не перевіряється —
 * зниклий вузол гра відпускає сама (liveDialogue у story.ts). Пам'ять NPC (npcMemory) теж свідомо не перевіряється:
 * її лише читають умови, тож факт зниклого NPC просто ніколи не збігається й гравця не замикає.
 */
export function danglingRefs(game: SimState['game'], st: StoryDefs): string[] {
  const out: string[] = [];
  const p = game.player;
  for (const [q, prog] of Object.entries(game.quests)) {
    const def = Object.hasOwn(st.quests, q) ? st.quests[q] : undefined;
    if (!def) out.push(`quest ${q}`);
    // Квест є, але вже не для цього гравця: кожна спроба — UNKNOWN_TARGET (рецензія сейвів).
    else if (p && prog.status === 'active' && !matches(def.when, p)) out.push(`quest ${q} (when)`);
  }
  if (p) {
    const profile = Object.hasOwn(st.profiles, p.profileId) ? st.profiles[p.profileId] : undefined;
    const animal = p.animalId === 'animal.none' ? {} : Object.hasOwn(st.animals, p.animalId) ? st.animals[p.animalId] : undefined;
    if (!profile) out.push(`profile ${p.profileId}`);
    if (!st.transports.includes(p.transportId)) out.push(`transport ${p.transportId}`);
    if (!animal) out.push(`animal ${p.animalId}`);
    // Пара, яку контент більше не дозволяє: валідатор доводить лише дозволені комбінації.
    if (profile?.transports && !profile.transports.includes(p.transportId)) out.push(`profile ${p.profileId} × ${p.transportId}`);
    if (animal?.transports && !animal.transports.includes(p.transportId)) out.push(`animal ${p.animalId} × ${p.transportId}`);
    if (p.locationId !== null && !Object.hasOwn(st.locations, p.locationId)) out.push(`location ${p.locationId}`);
  }
  return out;
}

export function fromSave(text: string, opts: { readonly story?: StoryDefs } = {}): LoadResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, code: 'SAVE_PARSE', detail: String(e) };
  }
  if (!isObj(raw) || raw.format !== SAVE_FORMAT) return { ok: false, code: 'SAVE_FORMAT', detail: 'not a CampLife save' };
  const version = raw.schemaVersion;
  if (!isInt(version, 1) || (version as number) > SAVE_VERSION) {
    return { ok: false, code: 'SAVE_VERSION_UNSUPPORTED', detail: `version ${String(version)}, supported up to ${SAVE_VERSION}` };
  }
  if (typeof raw.checksum !== 'string' || stateHash(raw.sim) !== raw.checksum) {
    return { ok: false, code: 'SAVE_CHECKSUM', detail: 'checksum mismatch' };
  }
  let sim: unknown = raw.sim;
  for (let v = version as number; v < SAVE_VERSION; v++) {
    const migrate = MIGRATIONS[v];
    if (!migrate) return { ok: false, code: 'SAVE_VERSION_UNSUPPORTED', detail: `no migration ${v}→${v + 1}` };
    sim = migrate(sim);
  }
  const bad = shapeError(sim);
  if (bad) return { ok: false, code: 'SAVE_SHAPE', detail: bad };
  if (opts.story) {
    const missing = danglingRefs((sim as SimState).game, opts.story);
    if (missing.length) return { ok: false, code: 'SAVE_CONTENT_MISMATCH', detail: `not in current content: ${missing.join(', ')}` };
  }
  const contentRev = typeof raw.contentRev === 'string' ? raw.contentRev : null;
  return { ok: true, sim: sim as SimState, fromVersion: version as number, contentRev };
}
