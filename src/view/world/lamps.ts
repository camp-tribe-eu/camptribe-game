// GAME-231 · «Ніч у таборі»: ліхтарі табору вмикаються о 18:00 м'яким теплим колом світла й вимикаються вранці. ЛИШЕ відображення: нічого не пише в ядро й сейв.
// Ліхтарі — ті, що вже стоять на мапі (шар `above`: верх ліхтаря camp-props 126 і тайл стовпа 140 під ним); нових файлів графіки немає.
// Світло малюється покадрово (прозорість від доби й дрібного мерехтіння — як glowAlpha вогнища), колір — FIRE_CORE/FIRE_GLOW із палітри LPC.
// Масштаб: ≈ 28 px на метр, тож коло радіусом LAMP_RADIUS (56 px) — ≈ 2 м під ліхтарем, а не заливка всієї стежки.
import { MAX_DARKNESS } from './daylight';

/** Ліхтарі вмикаються о 18:00 (картка GAME-231) і гаснуть, коли вже ранок (на початку світанку 06:30 з daylight.ts). */
export const LAMPS_ON_MINUTE = 18 * 60;
export const LAMPS_OFF_MINUTE = 6 * 60 + 30;
/** Радіус кола світла, px (2 м при 28 px/м). */
export const LAMP_RADIUS = 56;
/** Де на тайлі верхівки світить скло ліхтаря (px від верху тайла): за малюнком 126 — рядки 22–27. */
export const BULB_DY = 24;
const TILE = 32;
/** Індекси у camp-props (від firstgid): верх ліхтаря й тайл стовпа під ним. */
const HEAD = 126;
const POST = 140;

export interface LampSpot { readonly x: number; readonly y: number }

/** Ліхтарі в шарі `above` (рядкова розкладка data): верх ліхтаря, під яким стоїть тайл стовпа. Точка — центр скла. */
export function findLamps(data: readonly number[], width: number, height: number, firstgid: number): LampSpot[] {
  const at = (c: number, r: number): number => (c < 0 || r < 0 || c >= width || r >= height ? -1 : (data[r * width + c] ?? 0) - firstgid);
  const out: LampSpot[] = [];
  for (let r = 0; r + 1 < height; r++) {
    for (let c = 0; c < width; c++) if (at(c, r) === HEAD && at(c, r + 1) === POST) out.push({ x: c * TILE + TILE / 2, y: r * TILE + BULB_DY });
  }
  return out;
}

/** Чи горять ліхтарі о цій хвилині доби (0…1439): з 18:00 до 06:30. */
export function lampsOn(minuteOfDay: number): boolean {
  const m = ((minuteOfDay % 1440) + 1440) % 1440;
  return m >= LAMPS_ON_MINUTE || m < LAMPS_OFF_MINUTE;
}

/** Яскравість кола світла: 0, коли ліхтарі вимкнені; увімкнені — від м'якого (сутінки, світла ще вдосталь) до повного (ніч) з повільним мерехтінням від часу сцени. */
export function lampAlpha(minuteOfDay: number, darkness: number, timeMs: number): number {
  if (!lampsOn(minuteOfDay)) return 0;
  const flicker = 1 + 0.025 * Math.sin(timeMs / 410) + 0.015 * Math.sin(timeMs / 97);
  const dusk = Math.min(1, Math.max(0, darkness) / MAX_DARKNESS);
  return Math.min(1, (0.35 + 0.5 * dusk) * flicker);
}
