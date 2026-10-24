// Пакування (GAME-109): що гравець кладе в транспорт перед першою дорогою. Стан — НЕ нове поле, а прапорці
// `f.pack-<річ>` у `flags` (формат сейву v3 не змінюється). Місце міряється в одиницях (units), не сіткою.
// Правила — лише з каталогу `PackingDefs` (content/packing.json): команда несе намір, а не ефект (CR-041).
import type { PackingDefs, PackItemDef } from './defs';
import { matches } from './story';
import type { GameState, PlayerState } from './state';

/** Прапорець «річ спакована»: `item.tent` → `f.pack-tent`. Той самий формат знає валідатор (діалоги читають його як звичайний). */
export const packFlag = (itemId: string): string => `f.pack-${itemId.replace(/^item\./, '')}`;

/** Речі, що існують для цього гравця (переноска — лише з кішкою). Порядок — як у контенті. */
export const packItemsFor = (pk: PackingDefs, p: PlayerState): PackItemDef[] => pk.items.filter((i) => matches(i.when, p));

export const capacityOf = (pk: PackingDefs, transportId: string): number =>
  Object.hasOwn(pk.capacity, transportId) ? (pk.capacity[transportId] as number) : 0;

/** Спаковані речі гравця (id), у порядку контенту. */
export function packedOf(flags: readonly string[], pk: PackingDefs, p: PlayerState): string[] {
  return packItemsFor(pk, p).filter((i) => flags.includes(packFlag(i.itemId))).map((i) => i.itemId);
}

export function usedUnits(flags: readonly string[], pk: PackingDefs, p: PlayerState): number {
  return packItemsFor(pk, p).filter((i) => flags.includes(packFlag(i.itemId))).reduce((a, i) => a + i.units, 0);
}

const ORDER = { needed: 0, useful: 1, leave: 2 } as const;

/**
 * «Укласти автоматично»: спершу все «потрібне», далі «корисне», далі «можна лишити»; у групі — за порядком контенту;
 * річ, що не влізла, пропускається, а наступна, менша, може влізти. Детерміновано. Валідатор доводить, що «потрібне»
 * вміщається в кожен транспорт (PACK_NEEDED_OVERFLOW), тож воно завжди в наборі, а набір ніколи не переливає місце.
 */
export function autoPack(pk: PackingDefs, p: PlayerState): string[] {
  const cap = capacityOf(pk, p.transportId);
  let used = 0;
  const out: string[] = [];
  const sorted = packItemsFor(pk, p).map((i, n) => ({ i, n })).sort((a, b) => ORDER[a.i.group] - ORDER[b.i.group] || a.n - b.n);
  for (const { i } of sorted) if (used + i.units <= cap) { out.push(i.itemId); used += i.units; }
  return out;
}

/** Прапорці з уже наявних: усі пакувальні прибрано, спаковане — додано. Відсортовано, як решта `flags`. */
export function withPacked(flags: readonly string[], pk: PackingDefs, packed: readonly string[]): string[] {
  const all = new Set(pk.items.map((i) => packFlag(i.itemId)));
  return [...flags.filter((f) => !all.has(f)), ...packed.map(packFlag)].sort();
}

/** Чи відкрите пакування: персонаж є, розділ не закінчився, розмови немає, гравець у місці з `at`, `openAfter` завершено. */
export function packingOpen(pk: PackingDefs, d: Pick<GameState, 'player' | 'quests' | 'campaignEnded' | 'dialogue'>): boolean {
  const p = d.player;
  if (!p || d.campaignEnded || d.dialogue !== null || p.locationId === null || !pk.at.includes(p.locationId)) return false;
  return pk.openAfter === undefined || (Object.hasOwn(d.quests, pk.openAfter) && d.quests[pk.openAfter]?.status === 'completed');
}
