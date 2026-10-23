// Карта дій гравця (GAME-24, GAME-69): одне джерело для клавіатури й дотику.
// Тест звіряє: кожна дія з клавіатури має дотиковий елемент, і навпаки.

export const ACTIONS = ['up', 'down', 'left', 'right', 'interact', 'pause'] as const;
/** Дії сцени. `pause` належить оболонці UI (GAME-25): її кнопку й клавішу обробляє UI, не сцена. */
export const SCENE_ACTIONS = ['up', 'down', 'left', 'right', 'interact'] as const;
export type Action = (typeof ACTIONS)[number];

export const KEY_BINDINGS: Readonly<Record<Action, readonly string[]>> = {
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  interact: ['Space', 'KeyE', 'Enter'],
  pause: ['Escape'],
};

/**
 * KeyboardEvent.code → keyCode, який чекає Phaser. Явна таблиця замість розбору рядка:
 * раніше `Escape`/`Digit1` мовчки давали undefined, і клавіша ніколи не спрацьовувала (рецензія PR #13).
 */
export const KEY_CODES: Readonly<Record<string, number>> = {
  ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39,
  KeyW: 87, KeyA: 65, KeyS: 83, KeyD: 68, KeyE: 69,
  Space: 32, Enter: 13, Escape: 27,
};

/** Дотикові елементи: дія → підпис (символ, не текст — тексти лише через локалізацію, GAME-26). */
export const TOUCH_CONTROLS: Readonly<Record<Action, string>> = {
  up: '▲',
  down: '▼',
  left: '◀',
  right: '▶',
  interact: '●',
  pause: '‖',
};

/** Мінімальний розмір дотикової цілі, CSS px (OD-009, WCAG 2.5.5). */
export const MIN_TOUCH_PX = 44;

/** Утримувані дії → вектор руху; діагональ нормалізується, щоб не бігти швидше. */
export function moveVector(held: ReadonlySet<Action>): { x: number; y: number } {
  const x = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
  const y = (held.has('down') ? 1 : 0) - (held.has('up') ? 1 : 0);
  const len = Math.hypot(x, y);
  return len === 0 ? { x: 0, y: 0 } : { x: x / len, y: y / len };
}

/** Мертва зона джойстика — частка радіуса, до якої стік вважається в центрі (GAME-91). */
export const STICK_DEADZONE = 0.25;
const SIN_HALF_OCTANT = Math.sin(Math.PI / 8);   // 22,5°: межа між вісьовим і діагональним сектором

/**
 * Зсув пальця від центру джойстика → утримувані напрямки (8 секторів по 45°). Той самий набір `Action`, що й у клавіш,
 * тому рух ідеться тим самим шляхом (press/release → consumeFrame → moveVector), і ядро та детермінізм не зачеплено.
 */
export function stickActions(dx: number, dy: number, radius: number): Set<Action> {
  const dist = Math.hypot(dx, dy);
  const out = new Set<Action>();
  if (radius <= 0 || dist < radius * STICK_DEADZONE) return out;
  if (Math.abs(dx) > dist * SIN_HALF_OCTANT) out.add(dx > 0 ? 'right' : 'left');
  if (Math.abs(dy) > dist * SIN_HALF_OCTANT) out.add(dy > 0 ? 'down' : 'up');
  return out;
}

/**
 * Взаємодія спрацьовує на ФРОНТ натискання і не частіше, ніж раз на `cooldownMs`:
 * подвійне натискання (чи дотик + клавіша разом) — одна команда.
 */
export function createActionGate(cooldownMs = 400): (pressedNow: boolean, nowMs: number) => boolean {
  let wasPressed = false;
  let lastFire = Number.NEGATIVE_INFINITY;
  return (pressedNow, nowMs) => {
    const edge = pressedNow && !wasPressed;
    wasPressed = pressedNow;
    if (!edge || nowMs - lastFire < cooldownMs) return false;
    lastFire = nowMs;
    return true;
  };
}

/**
 * Стан введення: `held` — утримувані зараз; `tapped` — натиснуті з минулого кадру (засувка).
 * Без засувки швидке натискання (keydown і keyup між двома кадрами) губиться — знайдено e2e GAME-24.
 */
export interface InputState {
  readonly held: Set<Action>;
  readonly tapped: Set<Action>;
}

export const newInput = (): InputState => ({ held: new Set(), tapped: new Set() });

export function press(input: InputState, action: Action): void {
  input.held.add(action);
  input.tapped.add(action);
}

export function release(input: InputState, action: Action): void {
  input.held.delete(action);
}

/** Знімок кадру: утримувані плюс натиснуті з минулого кадру; засувку скинуто. */
export function consumeFrame(input: InputState): Set<Action> {
  const frame = new Set<Action>([...input.held, ...input.tapped]);
  input.tapped.clear();
  return frame;
}

/** Частка ширини екрана ліворуч, де дотик викликає плаваючий джойстик (GAME-95). */
export const FLOAT_ZONE = 0.4;

/** Рід цілі для кнопки дії: розмова, вогнище, інший об'єкт (GAME-95). */
export type ActionTarget = 'talk' | 'fire' | 'object';

export function actionTarget(kind: 'trigger' | 'npc', name: string): ActionTarget {
  if (kind === 'npc') return 'talk';
  return name === 'obj.campfire' ? 'fire' : 'object';
}

/** Тап по об'єкту: точка об'єкта — його ноги; спрайт стоїть над нею (до 56 px вгору) і трохи ширший за 2×TAP_HALF_W. */
const TAP_HALF_W = 24;
const TAP_UP = 56;
const TAP_DOWN = 8;
/** Дотик — тап, а не жест: зсув не більший за TAP_MAX_MOVE px і коротший за TAP_MAX_MS. */
export const TAP_MAX_MOVE = 10;
export const TAP_MAX_MS = 500;

export function tapHitsSpot(spot: { x: number; y: number }, tap: { x: number; y: number }): boolean {
  const dx = tap.x - spot.x;
  const dy = tap.y - spot.y;
  return Math.abs(dx) <= TAP_HALF_W && dy >= -TAP_UP && dy <= TAP_DOWN;
}
