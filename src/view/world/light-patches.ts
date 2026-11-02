// GAME-210 · плями світла з вікон на підлозі інтер'єрів (дім, крамниця). Чиста геометрія: знаходить вікна в шарі `above` мапи й повертає чотирикутники
// (дрібні вкладені шари дають м'яку кромку). Сцена малює їх ОДИН раз у статичну текстуру (не щокадру); вдень — повні, до ночі — гаснуть (`patchAlpha`).
// Колір — FIRE_CORE з палітри LPC (art/palette/lpc.json), нових файлів графіки немає.

export interface WindowSpot { readonly col: number; readonly topRow: number; readonly bottomRow: number }
export interface Quad { readonly pts: readonly [number, number][]; readonly alpha: number }

/** Індекси у home-windows-doors (від firstgid): 0,1 — верх вікна; 3,4 — середина; 6,7 — низ (два тайли завширшки). */
const SILL_L = 6;
const SILL_R = 7;
const BODY = new Set([0, 1, 3, 4]);
const LEN = 80;      // на скільки px пляма лягає на підлогу від вікна
const SKEW = 0.38;   // світло зліва згори: пляма з'їжджає вправо
const LAYERS = 3;

/** Вікна: пари тайлів низу (firstgid+6, +7) у шарі `above` (рядкова розкладка data), угору — поки йдуть тайли вікна. */
export function findWindows(data: readonly number[], width: number, height: number, firstgid: number): WindowSpot[] {
  const at = (c: number, r: number): number => (c < 0 || r < 0 || c >= width || r >= height ? -1 : (data[r * width + c] ?? 0) - firstgid);
  const out: WindowSpot[] = [];
  for (let r = 0; r < height; r++) {
    for (let c = 0; c + 1 < width; c++) {
      if (at(c, r) !== SILL_L || at(c + 1, r) !== SILL_R) continue;
      let top = r;
      while (BODY.has(at(c, top - 1))) top--;
      out.push({ col: c, topRow: top, bottomRow: r });
    }
  }
  return out;
}

/** Чотирикутники плями від вікна: північна стіна (вікно у верхній половині мапи) — пляма лягає вниз від підвіконня, південна — угору. */
export function patchQuads(w: WindowSpot, mapRows: number, tile: number): Quad[] {
  const south = (w.topRow + w.bottomRow) / 2 > mapRows / 2;
  const x0 = w.col * tile;
  const x1 = x0 + 2 * tile;
  const y0 = south ? w.topRow * tile : (w.bottomRow + 1) * tile;
  const dir = south ? -1 : 1;
  const quads: Quad[] = [];
  for (let k = 0; k < LAYERS; k++) {
    const inX = k * 5;
    const len = LEN - k * 12;
    const dx = len * SKEW;
    quads.push({
      pts: [[x0 + inX, y0], [x1 - inX, y0], [x1 - inX + dx, y0 + dir * len], [x0 + inX + dx, y0 + dir * len]],
      alpha: 0.16,
    });
  }
  return quads;
}

/** Яскравість плями за темрявою доби (daylight.ts: 0 — день … maxDarkness — глибока ніч): вдень 1, вночі 0 (світла з вікон нема). */
export const patchAlpha = (darkness: number, maxDarkness: number): number => Math.max(0, 1 - darkness / maxDarkness);
