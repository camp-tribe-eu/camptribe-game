// GAME-265 · геометрія кімнати вступу — одна на малювання (intro-room.ts), на дотикові об'єкти пошуку зарядки (Intro.tsx) і на e2e (картка дати не лягає на персонажів).
// Чисті числа без полотна й без файлів-картинок: логічні пікселі сцени → CSS-пікселі екрана (полотно розтягнене на весь екран).
export const SCENE_W = 160;
export const WALL_H = 96;   // стіна 3 тайли: полотно 87 px + плінтус до 96
export const FRAME_PX = 64;
export type Who = 'victoria' | 'matthew' | 'george';
/** Лівий край кадру 64 px від краю сцени: ліворуч Вікторія, посередині Метью, праворуч Джордж (тато). */
export const CAST_X: Readonly<Record<Who, number>> = { victoria: 6, matthew: 52, george: 98 };
export const OBJ = { lamp: { dx: 2, w: 24, h: 49 }, shelf: { dx: 104, w: 54, h: 64 }, window: { dx: 22, dy: 14, w: 64, h: 44 } } as const;

export interface Layout { readonly scale: number; readonly w: number; readonly h: number }
export interface Rect { readonly x: number; readonly y: number; readonly w: number; readonly h: number }

/** Ціле збільшення, щоб сцена 160 px влізла за шириною, а стіна з підлогою — за висотою; полотно вкриває весь екран. */
export function roomLayout(cssW: number, cssH: number): Layout {
  const scale = Math.max(1, Math.min(Math.floor(cssW / SCENE_W), Math.floor(cssH / 120), 6));
  return { scale, w: Math.ceil(cssW / scale), h: Math.ceil(cssH / scale) };
}

export interface RoomGeometry {
  readonly ox: number; readonly y0: number; readonly floorY: number; readonly castY: number;
  /** Прямокутники в CSS-пікселях екрана. */
  readonly lamp: Rect; readonly shelf: Rect; readonly window: Rect;
  readonly cast: (who: Who, family: boolean) => Rect;
}

export function roomGeometry(cssW: number, cssH: number): RoomGeometry {
  const { w, h } = roomLayout(cssW, cssH);
  const ox = w >= 240 ? 4 : Math.floor((w - SCENE_W) / 2);   // вбік — сцена ліворуч, лист праворуч; у портреті — по центру
  const y0 = Math.max(0, Math.min(Math.round(h * 0.1), h - WALL_H - 34));   // висока кімната (портрет) — стіна трохи нижче верху
  const floorY = y0 + WALL_H;
  const feetY = Math.min(floorY + (h > 300 ? 40 : 0), Math.floor(h * 0.6));
  const castY = feetY - 58;
  const sx = cssW / w;
  const sy = cssH / h;
  const r = (x: number, y: number, rw: number, rh: number): Rect => ({ x: x * sx, y: y * sy, w: rw * sx, h: rh * sy });
  return {
    ox, y0, floorY, castY,
    lamp: r(ox + OBJ.lamp.dx, floorY - OBJ.lamp.h + 4, OBJ.lamp.w, OBJ.lamp.h),
    shelf: r(ox + OBJ.shelf.dx, floorY - OBJ.shelf.h + 4, OBJ.shelf.w, OBJ.shelf.h),
    window: r(ox + OBJ.window.dx, y0 + OBJ.window.dy, OBJ.window.w, OBJ.window.h),
    cast: (who, family) => r(ox + CAST_X[who] + (who === 'matthew' && !family ? 18 : 0), castY, FRAME_PX, FRAME_PX),
  };
}
