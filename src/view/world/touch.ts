// Дотикові елементи над канвою (OD-009, GAME-91): джойстик (великий палець) і кругла кнопка дії. DOM, а не Phaser:
// розмір у CSS px гарантовано ≥ 44. Джойстик — не окремий канал руху: він лише тисне/відпускає ті самі `Action`,
// що й клавіші (actions.ts), тож сцена, ядро й детермінізм не знають про нього.
import { MIN_TOUCH_PX, TOUCH_CONTROLS, press, release, stickActions, type Action, type InputState } from './actions';

const DIRECTIONS: readonly Action[] = ['up', 'down', 'left', 'right'];

export function mountTouchControls(root: HTMLElement, input: InputState, hidden: readonly string[] = []): HTMLElement {
  const pad = document.createElement('div');
  pad.className = 'touch';
  const resets: Array<() => void> = [];
  pad.append(buildStick(input, hidden.includes('stick'), resets), buildActionButton(input, hidden.includes('interact'), resets));
  root.append(pad);
  // Перерване, після якого pointerup може й не прийти: вікно втратило фокус, вкладка сховалась, сторінка йде.
  // Джойстик під діалогом лише ховається CSS (visibility), тож палець «лишається» натиснутим — відпускаємо сами.
  const releaseAll = (): void => { for (const r of resets) r(); };
  window.addEventListener('blur', releaseAll);
  window.addEventListener('pagehide', releaseAll);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') releaseAll(); });
  // Будь-який діалог/накладка (пауза, історія, журнал, підтвердження): з'явився role="dialog" — відпустити все.
  let dialogOpen = root.querySelector('[role="dialog"]') !== null;
  new MutationObserver(() => {
    const now = root.querySelector('[role="dialog"]') !== null;
    if (now && !dialogOpen) releaseAll();
    dialogOpen = now;
  }).observe(root, { childList: true, subtree: true });
  return pad;
}

function buildStick(input: InputState, hide: boolean, resets: Array<() => void>): HTMLElement {
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
  base.dataset.held = '';

  let pointer: number | null = null;
  const held = new Set<Action>();
  const apply = (next: ReadonlySet<Action>): void => {
    for (const a of DIRECTIONS) {
      if (next.has(a) && !held.has(a)) { press(input, a); held.add(a); }
      else if (!next.has(a) && held.has(a)) { release(input, a); held.delete(a); }
    }
    base.dataset.held = [...held].join(' ');   // видимий стан натиснутих напрямків (e2e: «жоден не лишився»)
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
  const reset = (): void => {
    pointer = null;
    apply(new Set());
    knob.style.transform = '';
  };
  resets.push(reset);
  const stop = (e: PointerEvent): void => { if (e.pointerId === pointer) reset(); };
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

function buildActionButton(input: InputState, hide: boolean, resets: Array<() => void>): HTMLElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.touch = 'interact';
  b.className = 'touch-interact';
  b.textContent = TOUCH_CONTROLS.interact;
  b.style.minWidth = b.style.minHeight = `${MIN_TOUCH_PX + 12}px`;
  if (hide) b.hidden = true;
  const off = (): void => { release(input, 'interact'); b.dataset.held = ''; };
  resets.push(off);
  b.dataset.held = '';
  const down = (e: PointerEvent): void => {
    e.preventDefault();
    try { b.setPointerCapture(e.pointerId); } catch { /* синтетична подія без активного вказівника */ }
    press(input, 'interact');
    b.dataset.held = 'interact';
  };
  const up = (e: Event): void => { e.preventDefault(); off(); };
  b.addEventListener('pointerdown', down);
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture', 'pointerleave'] as const) b.addEventListener(type, up);
  return b;
}
