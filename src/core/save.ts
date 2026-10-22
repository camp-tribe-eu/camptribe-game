// Формат сейву (GAME-33, TD-007, CR-020, CR-060). Чисті функції: рядок ↔ стан симуляції.
// Сховище (IndexedDB) і код відновлення — платформний шар; ядро про браузер не знає.
//
// Правила:
// * кожен сейв має `schemaVersion`; новіша за підтримувану — відмова, а не «спробуємо»;
// * старіша — ланцюжок міграцій MIGRATIONS[v] → v+1 до поточної;
// * контрольна сума — над станом у ТІЙ версії, у якій його записано (до міграцій);
// * кожна випущена версія лишається фікстурою в tests/saves/ назавжди.
import { stateHash } from './hash';
import type { SimState } from './sim';

export const SAVE_FORMAT = 'camplife-save';
export const SAVE_VERSION = 1;

export interface SaveFile {
  readonly format: typeof SAVE_FORMAT;
  readonly schemaVersion: number;
  /** stateHash(sim) — ловить обрізаний чи підправлений руками файл. */
  readonly checksum: string;
  /** Під майбутню прив'язку до акаунта сайту (OD-008). У v1 — завжди null, без мережі. */
  readonly accountId: null;
  readonly sim: SimState;
}

export const LOAD_CODES = ['SAVE_PARSE', 'SAVE_FORMAT', 'SAVE_VERSION_UNSUPPORTED', 'SAVE_CHECKSUM', 'SAVE_SHAPE'] as const;
export type LoadCode = (typeof LOAD_CODES)[number];

export type LoadResult =
  | { readonly ok: true; readonly sim: SimState; readonly fromVersion: number }
  | { readonly ok: false; readonly code: LoadCode; readonly detail: string };

/** Міграції: MIGRATIONS[v] переводить сейв версії v у v+1. Поки що v1 — перша й поточна. */
export const MIGRATIONS: Readonly<Record<number, (sim: unknown) => unknown>> = {};

export function toSave(sim: SimState): SaveFile {
  return { format: SAVE_FORMAT, schemaVersion: SAVE_VERSION, checksum: stateHash(sim), accountId: null, sim };
}

export const serialize = (sim: SimState): string => JSON.stringify(toSave(sim));

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min = 0): boolean => typeof v === 'number' && Number.isSafeInteger(v) && v >= min;

/** Мінімальна перевірка форми поточної версії: решту гарантує контрольна сума. */
function shapeError(sim: unknown): string | null {
  if (!isObj(sim)) return 'sim is not an object';
  const { game, clock, rng, finds } = sim;
  if (!isObj(game) || !isObj(clock) || !Array.isArray(rng) || !isInt(finds)) return 'missing game/clock/rng/finds';
  if (game.schemaVersion !== 1 || !isInt(game.moneyCents) || !isInt(game.seq)) return 'game: version, money or seq';
  if (!isObj(game.inventory) || !Array.isArray(game.grants) || !isObj(game.processed)) return 'game: inventory, grants or processed';
  if (Object.values(game.inventory).some((q) => !isInt(q, 1))) return 'game: inventory quantity';
  if (!isInt(clock.minutes) || typeof clock.accMs !== 'number' || typeof clock.paused !== 'boolean') return 'clock';
  if (rng.length !== 4 || rng.some((w) => !isInt(w) || (w as number) > 0xffff_ffff)) return 'rng';
  return null;
}

export function fromSave(text: string): LoadResult {
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
  return { ok: true, sim: sim as SimState, fromVersion: version as number };
}
