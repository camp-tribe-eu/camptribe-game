// Стан спорядження (GAME-73, SIMULATION_RULES SIM-GEAR-001…006). Мінімальна детермінована модель:
// у кожного предмета спорядження в руках — стан 0…100 і позначка «мокре». Намокає в дорозі, що почалась у дощ;
// мокре, яке не висушили (DryGear), втрачає стан у НАСТУПНІЙ дорозі. Стан знижує лише ціну викупу.
// RNG тут не споживається, годинника ядро не бачить: погоду дороги передає симуляція (sim.step).

import type { ItemDef } from './defs';
import type { GameState } from './state';
import type { Weather } from './weather';

export const CONDITION_MAX = 100;
/** Скільки стану втрачає мокре невисушене спорядження за кожну наступну дорогу (SIM-GEAR-003) **(тимч.)**. */
export const WET_WEAR = 10;

export interface GearState {
  /** 0…100, ціле. */
  readonly condition: number;
  readonly wet: boolean;
}

/** Нове й сухе. Такий запис у стані НЕ зберігається: `gear` тримає лише відхилення (SIM-GEAR-001). */
export const NEW_GEAR: GearState = { condition: CONDITION_MAX, wet: false };

const own = <T>(o: Readonly<Record<string, T>>, k: string): T | undefined => (Object.hasOwn(o, k) ? o[k] : undefined);

export const gearOf = (gear: Readonly<Record<string, GearState>>, itemId: string): GearState => own(gear, itemId) ?? NEW_GEAR;

const isNew = (g: GearState): boolean => g.condition === CONDITION_MAX && !g.wet;

/**
 * Ціна викупу вживаного (SIM-GEAR-004): ⌊викуп × стан / 100⌋. Викуп ≤ ціни купівлі (checkDefs, валідатор), стан ≤ 100 —
 * отже й виплата ≤ ціни купівлі; доказ — властивість fast-check у src/core/gear.test.ts.
 */
export function salePrice(sellCents: number, condition: number): number {
  const c = Math.min(Math.max(Math.trunc(condition), 0), CONDITION_MAX);
  return Math.floor((sellCents * c) / CONDITION_MAX);
}

/** Скільки гравець отримає за предмет зараз: спорядження — за станом, решта — повний викуп. undefined — не викуповується. */
export function sellPriceOf(def: ItemDef | undefined, gear: Readonly<Record<string, GearState>>, itemId: string): number | undefined {
  if (!def || def.sellCents === undefined) return undefined;
  return def.gear ? salePrice(def.sellCents, gearOf(gear, itemId).condition) : def.sellCents;
}

/** Лише записи предметів, що є в інвентарі, і лише відхилення від нового сухого — одна канонічна форма стану. */
export function pruneGear(gear: Readonly<Record<string, GearState>>, inventory: Readonly<Record<string, number>>): Readonly<Record<string, GearState>> {
  const keys = Object.keys(gear);
  if (keys.every((k) => (own(inventory, k) ?? 0) > 0 && !isNew(gear[k] as GearState))) return gear;
  return Object.fromEntries(keys.filter((k) => (own(inventory, k) ?? 0) > 0 && !isNew(gear[k] as GearState)).sort().map((k) => [k, gear[k] as GearState]));
}

/**
 * Лише вологість (late.wetGear хвилі напруги, GAME-170): спорядження в руках стає вологим, стан НЕ знімається — наслідок
 * спізнення м'який і відновний (DryGear). Ідемпотентно: уже вологе — без змін (два спізнення чи дощ не складаються в втрату).
 * Чиста функція; нічого не змінилось — той самий об'єкт стану.
 */
export function wetGearOnly(game: GameState, items: Readonly<Record<string, ItemDef>>): GameState {
  let changed = false;
  const next: Record<string, GearState> = { ...game.gear };
  for (const id of Object.keys(game.inventory).sort()) {
    if (!own(items, id)?.gear || (own(game.inventory, id) ?? 0) < 1) continue;
    const cur = gearOf(game.gear, id);
    if (cur.wet) continue;
    next[id] = { condition: cur.condition, wet: true };
    changed = true;
  }
  return changed ? { ...game, gear: pruneGear(next, game.inventory) } : game;
}

/**
 * Дорога зі спорядженням (SIM-GEAR-002, -003): спершу мокре з минулого разу втрачає WET_WEAR стану (не нижче 0) і лишається
 * мокрим, потім дощ дня виїзду мочить усе спорядження в руках. Сухе в сонце — без змін: звичайного зносу v1 немає.
 * Чиста функція; нічого не змінилось — той самий об'єкт стану.
 */
export function wearAfterTrip(game: GameState, items: Readonly<Record<string, ItemDef>>, weather: Weather): GameState {
  let changed = false;
  const next: Record<string, GearState> = { ...game.gear };
  for (const id of Object.keys(game.inventory).sort()) {
    if (!own(items, id)?.gear || (own(game.inventory, id) ?? 0) < 1) continue;
    const cur = gearOf(game.gear, id);
    const after: GearState = {
      condition: cur.wet ? Math.max(0, cur.condition - WET_WEAR) : cur.condition,
      wet: cur.wet || weather === 'rain',
    };
    if (after.condition !== cur.condition || after.wet !== cur.wet) { next[id] = after; changed = true; }
  }
  return changed ? { ...game, gear: pruneGear(next, game.inventory) } : game;
}

type GearKind = NonNullable<ItemDef['gear']>['kind'];

/**
 * Проблема спорядження для сцени «Не зовсім за планом» (GAME-144, R1-04) — лише з ФАКТИЧНОГО стану речей у руках, без кидка
 * й без зміни стану. Мокре — `wet`; сухе, але вже з втратою стану — `worn`. Порядок: спершу намет, потім спальник, у межах
 * виду мокре раніше за зношене, далі за id. Ліхтар стану в ядрі не має (простий предмет, не спорядження — GAME-73), тож
 * проблеми ліхтаря немає: canon — «лише якщо стан підтримується грою». null — усе сухе й ціле: нейтральна сцена.
 */
export interface GearIssue { readonly itemId: string; readonly kind: GearKind; readonly state: 'wet' | 'worn' }

/** Варіанти сцени: вид × стан. Той самий перелік — GEAR_CHECK_VARIANTS у scripts/validator/codes.mjs (звірка — day3.test). */
export const GEAR_SCENE_VARIANTS = ['tent-wet', 'tent-worn', 'sleeping-bag-wet', 'sleeping-bag-worn'] as const;
export const gearSceneVariant = (i: GearIssue): (typeof GEAR_SCENE_VARIANTS)[number] => `${i.kind}-${i.state}`;

export function gearIssue(game: Pick<GameState, 'inventory' | 'gear'>, items: Readonly<Record<string, ItemDef>>): GearIssue | null {
  const held = Object.keys(game.inventory).filter((id) => (own(game.inventory, id) ?? 0) > 0 && own(items, id)?.gear).sort();
  for (const kind of ['tent', 'sleeping-bag'] as const) {
    const mine = held.filter((id) => own(items, id)?.gear?.kind === kind);
    const wet = mine.find((id) => gearOf(game.gear, id).wet);
    if (wet) return { itemId: wet, kind, state: 'wet' };
    const worn = mine.find((id) => gearOf(game.gear, id).condition < CONDITION_MAX);
    if (worn) return { itemId: worn, kind, state: 'worn' };
  }
  return null;
}

/**
 * Дешевші альтернативи речі (GAME-113): речі того ж виду нижчого тиру, що вже в руках або коштують менше. Річ без ціни —
 * стартова річ сюжету (намет і спальник тиру 1 лежать у крамниці задарма, compileGear), тож для неї ціна — 0.
 * Порожньо — «брак грошей» глухий кут: валідатор (ECON_NO_CHEAPER_ALTERNATIVE) і тест economy-ch1 стережуть, що так не буває.
 * Без позик: це лише перелік речей, гроші не змінюються.
 */
export function cheaperAlternatives(items: Readonly<Record<string, ItemDef>>, inventory: Readonly<Record<string, number>>, itemId: string): string[] {
  const a = own(items, itemId);
  if (!a?.gear || a.buyCents === undefined) return [];
  return Object.keys(items).sort().filter((id) => {
    const b = own(items, id);
    if (id === itemId || !b?.gear || b.gear.kind !== a.gear?.kind || b.gear.tier >= a.gear.tier) return false;
    return (own(inventory, id) ?? 0) > 0 || (b.buyCents ?? 0) < (a.buyCents as number);
  });
}
