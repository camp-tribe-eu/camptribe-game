// Дотикові елементи над канвою (OD-009, GAME-91): джойстик (великий палець) і кругла кнопка дії. DOM, а не Phaser:
// розмір у CSS px гарантовано ≥ 44. Джойстик — не окремий канал руху: він лише тисне/відпускає ті самі `Action`,
// що й клавіші (actions.ts), тож сцена, ядро й детермінізм не знають про нього.
import { MIN_TOUCH_PX, TOUCH_CONTROLS, press, release, stickActions, type Action, type InputState } from './actions';

const DIRECTIONS: readonly Action[] = ['up', 'down', 'left', 'right'];

export function mountTouchControls(root: HTMLElement, input: InputState, hidden: readonly string[] = []): HTMLElement {
  const pad = document.createElement('div');
  pad.className = 'touch';
  pad.append(buildStick(input, hidden.includes('stick')), buildActionButton(input, hidden.includes('interact')));
  root.append(pad);
  return pad;
}

function buildStick(input: InputState, hide: boolean): HTMLElement {
  const base = document.createElement('div');
  base.className = 'touch-stick';
  base.dataset.touch = 'stick';
  base.setAttribute('role', 'group');   // aria-label ставить оболонка UI мовою гравця (Shell.tsx)
  base.style.minWidth = base.style.minHeight = `${MIN_TOUCH_PX + 12}px`;
  const knob = document.createElement('div');
  knob.className = 'touch-knob';
  knob.setAttribute('aria-hidden', 'true');
  base.append(knob);
  if (hide) base.hidden = true;

  let pointer: number | null = null;
  const held = new Set<Action>();
  const apply = (next: ReadonlySet<Action>): void => {
    for (const a of DIRECTIONS) {
      if (next.has(a) && !held.has(a)) { press(input, a); held.add(a); }
      else if (!next.has(a) && held.has(a)) { release(input, a); held.delete(a); }
    }
  };
  const move = (e: PointerEvent): void => {
    const r = base.getBoundingClientRect();
    const radius = r.width / 2;
    let dx = e.clientX - (r.left + radius);
    let dy = e.clientY - (r.top + r.height / 2);
    apply(stickActions(dx, dy, radius));
    // Ручка не виходить за край основи, хоч палець і може піти далі (він захоплений).
    const dist = Math.hypot(dx, dy);
    const reach = radius - knob.offsetWidth / 2;
    if (dist > reach && dist > 0) { dx *= reach / dist; dy *= reach / dist; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  const stop = (e: PointerEvent): void => {
    if (e.pointerId !== pointer) return;
    pointer = null;
    apply(new Set());
    knob.style.transform = '';
  };
  base.addEventListener('pointerdown', (e) => {
    if (pointer !== null) return;
    e.preventDefault();
    pointer = e.pointerId;
    try { base.setPointerCapture(e.pointerId); } catch { /* синтетична подія без активного вказівника */ }
    move(e);
  });
  base.addEventListener('pointermove', (e) => { if (e.pointerId === pointer) { e.preventDefault(); move(e); } });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) base.addEventListener(type, stop);
  return base;
}

function buildActionButton(input: InputState, hide: boolean): HTMLElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.touch = 'interact';
  b.className = 'touch-interact';
  b.textContent = TOUCH_CONTROLS.interact;
  b.style.minWidth = b.style.minHeight = `${MIN_TOUCH_PX + 12}px`;
  if (hide) b.hidden = true;
  const down = (e: Event): void => { e.preventDefault(); press(input, 'interact'); };
  const up = (e: Event): void => { e.preventDefault(); release(input, 'interact'); };
  b.addEventListener('pointerdown', down);
  b.addEventListener('pointerup', up);
  b.addEventListener('pointercancel', up);
  b.addEventListener('pointerleave', up);
  return b;
}
