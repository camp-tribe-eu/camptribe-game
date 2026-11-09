// GAME-201 · яка піктограма стоїть над ціллю: річ завдання (вудка над стійкою, намет над наметом), а не безликий кубик. Один вибір для мапи (сцена)
// й для HUD (Shell). Дані — objective-icons.json; малюнки — assets/icons/objective_icons.png (усі 31 клітинки — FAL від LPC, CC-BY-SA 3.0, ART-031; scripts/assets/build_objective_icons.py),
// клітинки — objective-icon-atlas.json. Крок сюжету без речі (step.*) — запасна «зірка»: це перелічено явно (fallbackPrefixes), решта без іконки — помилка тесту.
// GAME-215: слід дідуся (trace.*) теж у fallbackPrefixes — сцена малює його не піктограмою, а позначкою олівцем (scene.ts drawTrace).
import data from './objective-icons.json';
import atlas from './objective-icon-atlas.json';
import itemAtlas from './item-icon-atlas.json';
import { REQUESTS } from './requests';

const ITEMS: Readonly<Record<string, string>> = data.items;
const SPOTS: Readonly<Record<string, string>> = data.spots;
const REQ_ICONS: Readonly<Record<string, string>> = data.requestIcons;
const CELLS: Readonly<Record<string, number>> = atlas.cells;
export const ICON_FALLBACK: string = data.fallback;
export const ICON_SIZE: number = atlas.size;
export const ICON_COLS: number = atlas.cols;
export const ICON_KEYS: readonly string[] = Object.keys(CELLS);
export const FALLBACK_PREFIXES: readonly string[] = data.fallbackPrefixes;

export interface ObjectiveIcon { readonly key: string; /** true — ключ узято із запасних, а не з таблиці. */ readonly fallback: boolean }

/** Піктограма цілі за назвою об'єкта мапи (`take.item.tent`, `req.nora-shore.t1`, `task.pitch-tent`, `wood.branch.2`…). */
export function objectiveIcon(spot: string): ObjectiveIcon {
  const fb: ObjectiveIcon = { key: ICON_FALLBACK, fallback: true };
  const hit = (k: string | undefined): ObjectiveIcon => (k !== undefined && k in CELLS ? { key: k, fallback: false } : fb);
  if (spot in SPOTS) return hit(SPOTS[spot]);
  const item = /^(?:pack|take)\.(item\.[\w.-]+)$/.exec(spot);
  if (item?.[1]) return hit(ITEMS[item[1]]);
  if (spot.startsWith('wood.branch.')) return hit(ITEMS['item.firewood']);
  for (const r of REQUESTS) {
    const t = r.targets.find((x) => x.spot === spot);
    if (t) return hit(REQ_ICONS[t.icon]);
  }
  return fb;
}

/** Клітинка піктограми в атласі (px): де брати її на аркуші. */
export function iconCell(key: string): { x: number; y: number } {
  const i = CELLS[key] ?? CELLS[ICON_FALLBACK] ?? 0;
  return { x: (i % ICON_COLS) * ICON_SIZE, y: Math.floor(i / ICON_COLS) * ICON_SIZE };
}

/** Номер клітинки (кадр спрайтшита сцени й позиція CSS-аркуша в HUD). */
export const iconIndex = (key: string): number => CELLS[key] ?? CELLS[ICON_FALLBACK] ?? 0;

/** CSS-тло однієї клітинки атласу в масштабі scale (для HUD; живе поза src/ui — це рядки CSS, а не текст для людей). */
export function iconCss(key: string, sheetUrl: string, scale: number): Record<string, string> {
  const c = iconCell(key);
  const px = ICON_SIZE * scale;
  return { width: `${px}px`, height: `${px}px`, backgroundImage: `url(${sheetUrl})`, backgroundSize: `${ICON_COLS * px}px auto`, backgroundPosition: `-${c.x * scale}px -${c.y * scale}px` };
}

/** GAME-244: «місце» речі для піктограми (рюкзак): та сама клітинка аркуша, що й у пакуванні вдома. */
export const itemSpot = (itemId: string): string => `pack.${itemId}`;

// GAME-263 · іконки речей 32×32 (assets/icons/item_icons.png, ART-033): рюкзак показує їх у 2× = 64 px, картка «взято» — у 2× (нижча за стару 80-px, не налазить на підказку «Далі»). Речі без такої іконки лишаються
// на 16-px атласі цілей (він показується в 4× = 64 px). Ключ клітинки — з item-icon-atlas.json (його пише scripts/assets/build_item_icons.py).
const ITEM_ICON_OF: Readonly<Record<string, string>> = {
  'item.tent': 'tent', 'item.tent-anna': 'tent', 'item.tent-trek': 'tent', 'item.tent-family': 'tent', 'item.trailer-tent': 'tent',
  'item.sleeping-bag': 'bag', 'item.sleeping-bag-anna': 'bag', 'item.sleeping-bag-synthetic': 'bag', 'item.sleeping-bag-down': 'bag', 'item.sleeping-bag-winter': 'bag',
  'item.lantern': 'lantern', 'item.lantern-2': 'lantern', 'item.lantern-3': 'lantern', 'item.firewood': 'firewood', 'item.pine-cone': 'pine-cone', 'item.berries': 'berries',
  'item.documents': 'documents', 'item.wallet': 'wallet', 'item.phones': 'phone', 'item.first-aid': 'first-aid', 'item.clothes': 'clothes',
};
const ITEM_CELLS: Readonly<Record<string, number>> = itemAtlas.cells;
export const ITEM_ICON_SIZE: number = itemAtlas.size;
export const ITEM_ICON_COLS: number = itemAtlas.cols;
export const ITEM_ICON_KEYS: readonly string[] = Object.keys(ITEM_CELLS);

/** Ключ 32-px іконки речі за місцем (`pack.item.tent`, `take.item.wallet`); null — для речі іконки в цьому атласі нема. */
export function itemIconKey(spot: string): string | null {
  const m = /^(?:pack|take)\.(item\.[\w.-]+)$/.exec(spot);
  const k = m?.[1] === undefined ? undefined : ITEM_ICON_OF[m[1]];
  return k !== undefined && k in ITEM_CELLS ? k : null;
}

/** CSS-тло клітинки 32-px атласу речей у масштабі scale (ціле — пікселі лишаються чіткими). */
export function itemIconCss(key: string, sheetUrl: string, scale: number): Record<string, string> {
  const px = ITEM_ICON_SIZE * scale;
  return { width: `${px}px`, height: `${px}px`, backgroundImage: `url(${sheetUrl})`, backgroundSize: `${ITEM_ICON_COLS * px}px auto`, backgroundPosition: `-${(ITEM_CELLS[key] ?? 0) * px}px 0px` };
}
