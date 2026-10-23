// Дотикові елементи над канвою (OD-009, GAME-91): джойстик (великий палець) і кругла кнопка дії. DOM, а не Phaser:
// розмір у CSS px гарантовано ≥ 44. Джойстик — не окремий канал руху: він лише тисне/відпускає ті самі `Action`,
// що й клавіші (actions.ts), тож сцена, ядро й детермінізм не знають про нього.
import { FLOAT_ZONE, MIN_TOUCH_PX, TOUCH_CONTROLS, press, release, stickActions, type Action, type ActionTarget, type InputState } from './actions';

const DIRECTIONS: readonly Action[] = ['up', 'down', 'left', 'right'];

export function mountTouchControls(root: HTMLElement, input: InputState, hidden: readonly string[] = []): HTMLElement {
  const pad = document.createElement('div');
  pad.className = 'touch';
  const resets: Array<() => void> = [];
  const stick = buildStick(input, hidden.includes('stick'), resets);
  pad.append(stick.el, buildActionButton(input, hidden.includes('interact'), resets));
  root.append(pad);
  // Плаваюча основа (GAME-95, як у Stardew mobile / Forager / Coromon): дотик у лівій частині екрана під шапкою і не на
  // кнопці й не на панелі — основа з'являється під пальцем. Дотик прямо на спокійній основі лишається як було (GAME-91).
  root.addEventListener('pointerdown', (e) => {
    if (hidden.includes('stick') || e.pointerType === 'mouse' || getComputedStyle(pad).display === 'none') return;
    if (!(e.target instanceof Element) || e.target.closest('button, .ui-header, .ui-overlay, [role="dialog"]')) return;
    if (root.querySelector('[role="dialog"]') !== null) return;
    const r = root.getBoundingClientRect();
    const headerBottom = root.querySelector('.ui-header')?.getBoundingClientRect().bottom ?? r.top;
    if (e.clientX - r.left > r.width * FLOAT_ZONE || e.clientY < headerBottom) return;
    stick.begin(e, true);
  });
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

function buildStick(input: InputState, hide: boolean, resets: Array<() => void>): { el: HTMLElement; begin: (e: PointerEvent, floating: boolean) => void } {
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
    // Назад у спокійне місце (знизу ліворуч, блідий): вбудовані left/bottom прибрано, CSS знову керує розкладкою.
    base.style.left = base.style.bottom = '';
    delete base.dataset.active;
  };
  resets.push(reset);
  const stop = (e: PointerEvent): void => { if (e.pointerId === pointer) reset(); };
  const begin = (e: PointerEvent, floating: boolean): void => {
    if (pointer !== null) return;
    if (floating) {
      // Центр основи — під пальцем. Відступ рахуємо від низу майданчика .touch (він лежить на нижньому краї поля).
      const pr = (base.offsetParent ?? base).getBoundingClientRect();
      const size = base.offsetWidth;
      base.style.left = `${e.clientX - pr.left - size / 2}px`;
      base.style.bottom = `${pr.bottom - e.clientY - size / 2}px`;
    }
    e.preventDefault();
    pointer = e.pointerId;
    base.dataset.active = 'yes';
    try { base.setPointerCapture(e.pointerId); } catch { /* синтетична подія без активного вказівника */ }
    move(e);
  };
  base.addEventListener('pointerdown', (e) => begin(e, false));
  base.addEventListener('pointermove', (e) => { if (e.pointerId === pointer) { e.preventDefault(); move(e); } });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) base.addEventListener(type, stop);
  return { el: base, begin };
}

function buildActionButton(input: InputState, hide: boolean, resets: Array<() => void>): HTMLElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.touch = 'interact';
  b.className = 'touch-interact';
  b.textContent = TOUCH_CONTROLS.interact;
  b.dataset.state = 'idle';   // GAME-95: нема з чим взаємодіяти — кнопка бліда, але натискається (нічого шкідливого не робить)
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

/** Значки цілей кнопки дії: вбудований SVG (шрифт без емодзі дав би «тофу»), колір — з currentColor. */
const TARGET_ICONS: Readonly<Record<ActionTarget, string>> = {
  talk: 'M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
  fire: 'M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-4-1-6 1-10z',
  object: 'M12 3l2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6z',
};

/**
 * Кнопка дії за ціллю поруч (GAME-95): `ready` + значок цілі, коли в зоні є з чим взаємодіяти, інакше `idle`.
 * Сцена знає найближчу ціль (probe.nearKind) — сюди передає лише її рід. Без змін — нічого не пишемо.
 */
export function setActionTarget(pad: HTMLElement, target: ActionTarget | null): void {
  const b = pad.querySelector<HTMLElement>('[data-touch="interact"]');
  if (!b) return;
  const state = target === null ? 'idle' : 'ready';
  if (b.dataset.state === state && (b.dataset.target ?? '') === (target ?? '')) return;
  b.dataset.state = state;
  if (target === null) { delete b.dataset.target; b.textContent = TOUCH_CONTROLS.interact; return; }
  b.dataset.target = target;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', '36');
  svg.setAttribute('height', '36');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', TARGET_ICONS[target]);
  path.setAttribute('fill', 'currentColor');
  svg.append(path);
  b.replaceChildren(svg);
}
