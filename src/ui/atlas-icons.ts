// Піктограми наклейок Атласу (GAME-182): 8×8 пікселів, намальовано в atlas-icons.json — без зовнішніх файлів і без ліцензій. Один символ = один піксель;
// колір — з палітри, крапка — прозорий. Силует нез'ясованої наклейки робить CSS (filter), а не окремий малюнок. Піктограма «star» — запасна, «atlas» — книжка вступу.
import data from './atlas-icons.json';

const PALETTE: Readonly<Record<string, string>> = data.palette;
const ICONS: Readonly<Record<string, readonly string[]>> = data.icons;

export const ICON_IDS: readonly string[] = Object.keys(ICONS).filter((k) => k !== 'star' && k !== 'atlas');

/** Прямокутники піксельної піктограми для SVG viewBox 0 0 8 8. */
export function iconRects(icon: string): { x: number; y: number; fill: string }[] {
  const rows = ICONS[icon] ?? (ICONS.star as readonly string[]);
  const out: { x: number; y: number; fill: string }[] = [];
  rows.forEach((row, y) => [...row].forEach((ch, x) => { const fill = PALETTE[ch]; if (fill) out.push({ x, y, fill }); }));
  return out;
}
