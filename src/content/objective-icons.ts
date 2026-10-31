// GAME-201 · яка піктограма стоїть над ціллю: річ завдання (вудка над стійкою, намет над наметом), а не безликий кубик. Один вибір для мапи (сцена)
// й для HUD (Shell). Дані — objective-icons.json; малюнки — assets/icons/objective_icons.png (усі 31 клітинки — FAL від LPC, CC-BY-SA 3.0, ART-031; scripts/assets/build_objective_icons.py),
// клітинки — objective-icon-atlas.json. Крок сюжету без речі (step.*) — запасна «зірка»: це перелічено явно (fallbackPrefixes), решта без іконки — помилка тесту.
import data from './objective-icons.json';
import atlas from './objective-icon-atlas.json';
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
  const item = /^(?:pack|take)\.(item\.[\w-]+)$/.exec(spot);
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
