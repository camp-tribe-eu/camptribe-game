// GAME-265 · геометрія кімнати вступу — одна на малювання (intro-room.ts), на дотикові об'єкти пошуку зарядки (Intro.tsx) і на e2e (картка дати не лягає на персонажів).
// Чисті числа без полотна й без файлів-картинок: логічні пікселі сцени → CSS-пікселі екрана (полотно розтягнене на весь екран).
export const SCENE_W = 160;
export const WALL_H = 96;   // стіна 3 тайли: полотно 87 px + плінтус до 96
export const FRAME_PX = 64;
export type Who = 'victoria' | 'matthew' | 'george';
/** Лівий край кадру 64 px від краю сцени: ліворуч Вікторія, посередині Метью, праворуч Джордж (тато). */
export const CAST_X: Readonly<Record<Who, number>> = { victoria: 6, matthew: 52, george: 98 };
export const OBJ = { lamp: { dx: 2, w: 24, h: 49 }, shelf: { dx: 104, w: 54, h: 64 }, window: { dx: 22, dy: 14, w: 64, h: 44 } } as const;

/** GAME-300: меблі стоять основою на 2 px нижче лінії плінтуса (вростають у підлогу), ноги людей — щонайменше на 4 px нижче: стоять НА підлозі й перед меблями, не на полиці. */
export const BASE_DROP = 2;
export const FEET_MIN_DROP = 4;
/** GAME-300: де в кадрі 64×64 стоять ноги (рядок) і де тіло (непрозорі стовпці/зріст); castY = feetY − FEET_ROW. */
export const FEET_ROW = 58;
export const BODY = { dx: 19, w: 26, h: 49 } as const;
/** GAME-300: найменша висота кімнати в логічних px: стіна 96 + підлога, на якій видно ноги над рамкою розмови (на телефоні вбік при 120 підлогу закривала рамка — стояли «в повітрі»). */
export const MIN_ROOM_H = 150;

export interface Layout { readonly scale: number; readonly w: number; readonly h: number }
export interface Rect { readonly x: number; readonly y: number; readonly w: number; readonly h: number }

/** Ціле збільшення, щоб сцена 160 px влізла за шириною, а стіна з підлогою — за висотою; полотно вкриває весь екран. */
export function roomLayout(cssW: number, cssH: number): Layout {
  const scale = Math.max(1, Math.min(Math.floor(cssW / SCENE_W), Math.floor(cssH / MIN_ROOM_H), 6));
  return { scale, w: Math.ceil(cssW / scale), h: Math.ceil(cssH / scale) };
}

export interface RoomGeometry {
  readonly ox: number; readonly y0: number; readonly floorY: number; readonly castY: number;
  /** Прямокутники в CSS-пікселях екрана. */
  readonly lamp: Rect; readonly shelf: Rect; readonly window: Rect;
  readonly cast: (who: Who, family?: boolean) => Rect;
  /** GAME-300: підошви (низ тіла) і тіло без прозорих полів кадру, CSS px — для перевірки «стоїть на підлозі, не наїжджає на полицю». */
  readonly feet: (who: Who, family?: boolean) => Rect;
  readonly body: (who: Who, family?: boolean) => Rect;
  readonly feetY: number;
}

/** Метью соло стоїть ліворуч від полиці (раніше +18 px — на самій полиці). */
const castX = (who: Who): number => CAST_X[who];

export function roomGeometry(cssW: number, cssH: number): RoomGeometry {
  const { w, h } = roomLayout(cssW, cssH);
  const ox = w >= 240 ? 4 : Math.floor((w - SCENE_W) / 2);   // вбік — сцена ліворуч, лист праворуч; у портреті — по центру
  // GAME-300: рамка розмови займає ≈ 29–34 % екрана знизу (знімки), тож ноги — не нижче ~62 % (вбік/ПК) чи ~72 % (сторч/квадрат) висоти. Стіну піднімаємо
  // (аж до верху екрана), щоб лінія підлоги й ноги ВМІСТИЛИСЬ над рамкою: раніше ноги ловили 0,6·h, що на ПК/вбік — на стіні, над підлогою, а у висоти h = 150
  // підлога (floorY = 111) ховалась під рамкою. Ноги завжди нижче лінії підлоги: floorY + FEET_MIN_DROP … floorY + 40.
  const capY = Math.floor(h * (cssH >= cssW * 0.9 ? 0.72 : 0.62));
  const y0 = Math.max(0, Math.min(Math.round(h * 0.1), h - WALL_H - 34, capY - FEET_MIN_DROP - WALL_H));   // висока кімната (портрет) — стіна трохи нижче верху
  const floorY = y0 + WALL_H;
  const feetY = Math.max(floorY + FEET_MIN_DROP, Math.min(floorY + (h > 300 ? 40 : 0), capY));
  const castY = feetY - FEET_ROW;
  const sx = cssW / w;
  const sy = cssH / h;
  const r = (x: number, y: number, rw: number, rh: number): Rect => ({ x: x * sx, y: y * sy, w: rw * sx, h: rh * sy });
  return {
    ox, y0, floorY, castY,
    lamp: r(ox + OBJ.lamp.dx, floorY - OBJ.lamp.h + BASE_DROP, OBJ.lamp.w, OBJ.lamp.h),
    shelf: r(ox + OBJ.shelf.dx, floorY - OBJ.shelf.h + BASE_DROP, OBJ.shelf.w, OBJ.shelf.h),
    window: r(ox + OBJ.window.dx, y0 + OBJ.window.dy, OBJ.window.w, OBJ.window.h),
    cast: (who) => r(ox + castX(who), castY, FRAME_PX, FRAME_PX),
    feet: (who) => r(ox + castX(who) + BODY.dx, feetY - 4, BODY.w, 4),
    body: (who) => r(ox + castX(who) + BODY.dx, feetY - BODY.h, BODY.w, BODY.h),
    feetY,
  };
}
