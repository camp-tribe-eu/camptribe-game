// GAME-303 · розстановка кімнати кадру вступу — чиста геометрія без полотна (тест: intro-plan.test.ts). Закон розстановки (docs/LAYOUT_RULES.md, brief §2.10): тверді речі стоять
// НА підлозі — низ речі нижче лінії плінтуса (`floorY`) і в смузі підлоги; спинка, узголів'я й шафа — біля стіни (верх речі вище лінії плінтуса); на стіні висять лише картина й вікно.
// Вигляд 3/4, як у решті гри: ліжко — узголів'ям до стіни, а тіло з ковдрою лежить на підлозі, бо підлога під ним глибша за плінтус.
import type { RoomId } from '../content/intro-scene';

export type PieceId = 'bed' | 'sofa' | 'coffee' | 'lamp' | 'plant' | 'dresser' | 'painting' | 'window';
export interface Rect { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
export interface Piece extends Rect {
  readonly id: PieceId;
  /** Висить на стіні (картина, вікно): низ не обов'язково на підлозі. */
  readonly wall: boolean;
  /** Спинка/узголів'я/шафа притулені до стіни: верх речі вище лінії плінтуса. */
  readonly backToWall: boolean;
}
export interface RoomPlan {
  readonly floorY: number;
  readonly cx: number;
  readonly feet: number;
  /** Де стоїть людина: центр по x, ноги по y, і в який бік дивиться. */
  readonly person: { readonly x: number; readonly dir: 'down' | 'left' | 'right' };
  /** Речі в порядку малювання: за низом (y-сортування — що нижче на екрані, те попереду). */
  readonly pieces: readonly Piece[];
  /** Вікно малюється лише там, де стіна досить висока. */
  readonly glow: { readonly x: number; readonly y: number };
}

export const SIZE = { bed: { w: 64, h: 96 }, sofa: { w: 55, h: 34 }, coffee: { w: 48, h: 26 }, lamp: { w: 24, h: 49 }, plant: { w: 32, h: 73 }, dresser: { w: 32, h: 27 }, painting: { w: 38, h: 30 }, window: { w: 64, h: 44 } } as const;
/** Скільки пікселів узголів'я ліжка вище за його «підлогу» (спинка стоїть на лінії плінтуса). */
export const BED_HEADBOARD = 22;

export function floorLine(h: number): number {
  // Низький кадр (панель комікса) — стіна невисока, більшість кадру — підлога під ліжком; високий (повний кадр портрета) — стіна вища, щоб підлога не була порожньою пусткою.
  const tall = Math.min(Math.round(h * 0.5), h - 125);
  return Math.min(h - 78, Math.max(36, Math.round(h * 0.34), tall));
}

const piece = (id: PieceId, x: number, base: number, o: { wall?: boolean; back?: boolean } = {}): Piece => {
  const { w, h } = SIZE[id];
  return { id, x: Math.round(x), y: Math.round(base - h), w, h, wall: o.wall === true, backToWall: o.back === true };
};

/** Розстановка кімнати для полотна w×h (логічні пікселі). Усе вміщається в ±65 px від центру, тож і вузький портретний кадр (130 px) нічого не обрізає збоку. */
export function roomPlan(w: number, h: number, room: RoomId): RoomPlan {
  const floorY = floorLine(h);
  const cx = Math.round(w / 2);
  const feet = Math.max(floorY + 30, Math.min(h - 6, floorY + Math.round((h - floorY) * 0.78)));
  const out: Piece[] = [];
  let person: RoomPlan['person'];
  let glowX: number;
  if (room === 'george') {
    // Вітальня: диван спинкою до стіни, журнальний столик перед ним, картина над диваном, вазон — лише там, де стіна його вміщає; тато стоїть ліворуч.
    out.push(piece('sofa', cx - 28, floorY + 20, { back: true }), piece('coffee', cx - 24, floorY + 56));
    if (floorY >= 50) out.push(piece('painting', cx - 19, floorY - 20, { wall: true }));
    if (floorY + 14 - SIZE.plant.h >= 0) out.push(piece('plant', cx + 30, floorY + 14, { back: true }));
    person = { x: cx - 52, dir: 'right' };
    glowX = cx + 20;
  } else {
    // Спальні: ліжко узголів'ям до стіни (його низ — глибоко в смузі підлоги), поруч торшер і тумба, людина — перед ними.
    out.push(piece('bed', cx - 58, floorY - BED_HEADBOARD + SIZE.bed.h, { back: true }));
    if (room === 'victoria') out.push(piece('dresser', cx + 6, floorY + 14, { back: true }));
    out.push(piece('lamp', cx + (room === 'victoria' ? 40 : 8), floorY + 22));
    if (floorY >= 54) out.push(piece('window', cx - 2, floorY - 6, { wall: true }));
    person = { x: cx + (room === 'victoria' ? 24 : 42), dir: room === 'victoria' ? 'left' : 'down' };
    glowX = cx + (room === 'victoria' ? 52 : 20);
  }
  const sorted = [...out].sort((a, b) => (a.wall === b.wall ? a.y + a.h - (b.y + b.h) : a.wall ? -1 : 1));
  return { floorY, cx, feet, person, pieces: sorted, glow: { x: glowX, y: floorY - 6 } };
}
