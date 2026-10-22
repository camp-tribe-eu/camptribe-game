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
  readonly sim: SimState;
}

export const LOAD_CODES = ['SAVE_PARSE', 'SAVE_FORMAT', 'SAVE_VERSION_UNSUPPORTED', 'SAVE_CHECKSUM', 'SAVE_SHAPE'] as const;
export type LoadCode = (typeof LOAD_CODES)[number];

export type LoadResult =
  | { readonly ok: true; readonly sim: SimState; readonly fromVersion: number }
  | { readonly ok: false; readonly code: LoadCode; readonly detail: string };

/** Міграції: MIGRATIONS[v] переводить сейв версії v у v+1. Кожна — чиста й не губить жодного поля. */
export const MIGRATIONS: Readonly<Record<number, (sim: unknown) => unknown>> = {
  // v1 → v2 (GAME-29): з'явились персонаж і квести. Старий сейв — гра до створення персонажа.
  1: (sim) => {
    const s = sim as { game: Record<string, unknown> };
    return { ...s, game: { ...s.game, schemaVersion: 2, player: null, quests: {}, campaignEnded: false, flags: [], dialogue: null } };
  },
};

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
  if (game.schemaVersion !== 2 || !isInt(game.moneyCents) || !isInt(game.seq)) return 'game: version, money or seq';
  if (!isObj(game.inventory) || !Array.isArray(game.grants) || !isObj(game.processed)) return 'game: inventory, grants or processed';
  if (Object.values(game.inventory).some((q) => !isInt(q, 1))) return 'game: inventory quantity';
  if (game.grants.some((g) => typeof g !== 'string')) return 'game: grant ids';
  if (Object.values(game.processed).some((r) => !isObj(r) || typeof r.ok !== 'boolean' || typeof r.fp !== 'string' || (!r.ok && !(REJECT_CODES as readonly unknown[]).includes(r.code)))) return 'game: processed records';
  if (typeof game.campaignEnded !== 'boolean' || !isObj(game.quests)) return 'game: quests';
  if (Object.values(game.quests).some((q) => !isObj(q) || !['active', 'completed', 'declined'].includes(q.status as string) || !Array.isArray(q.done) || q.done.some((o) => typeof o !== 'string'))) return 'game: quest progress';
  if (!Array.isArray(game.flags) || game.flags.some((f) => typeof f !== 'string')) return 'game: flags';
  const dl = game.dialogue;
  if (dl !== null && (!isObj(dl) || typeof dl.id !== 'string' || typeof dl.node !== 'string')) return 'game: dialogue';
  const p = game.player;
  if (p !== null && (!isObj(p) || typeof p.profileId !== 'string' || typeof p.transportId !== 'string' || typeof p.animalId !== 'string' || !(p.locationId === null || typeof p.locationId === 'string'))) return 'game: player';
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
