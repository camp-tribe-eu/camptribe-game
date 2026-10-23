// Дотикові кнопки над канвою (OD-009). DOM, а не Phaser: розмір у CSS px гарантовано ≥ 44.
import { SCENE_ACTIONS, MIN_TOUCH_PX, TOUCH_CONTROLS, press, release, type Action, type InputState } from './actions';

export function mountTouchControls(root: HTMLElement, input: InputState, hidden: readonly Action[] = []): HTMLElement {
  const pad = document.createElement('div');
  pad.className = 'touch';
  for (const action of SCENE_ACTIONS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.touch = action;
    b.className = `touch-${action}`;
    b.textContent = TOUCH_CONTROLS[action];
    // aria-label ставить оболонка UI мовою гравця (Shell.tsx); англійського id дії гравець не чує.
    b.style.minWidth = b.style.minHeight = `${MIN_TOUCH_PX + 12}px`;
    if (hidden.includes(action)) b.hidden = true;
    const down = (e: Event): void => { e.preventDefault(); press(input, action); };
    const up = (e: Event): void => { e.preventDefault(); release(input, action); };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('pointerleave', up);
    pad.append(b);
  }
  root.append(pad);
  return pad;
}
