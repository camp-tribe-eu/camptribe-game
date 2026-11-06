// GAME-268 · шлюз малювання: поки світ повністю закритий екраном (ui/world-cover.ts), Phaser не малює кадри.
// Не `loop.sleep()`: сон зупинив би й STEP (фонова мікшерка на паузі, мінікарта), а `scene.visible=false` стер би полотно
// (clearBeforeRender) — під напівпрозорою накладкою світ зник би. Тому лише пропускаємо сам крок малювання (preRender,
// scene.render, postRender): жодного виклику GL — полотно тримає останній показаний кадр.
// Один кадр усе ж малюється: при закритті на накладку (щоб лишився кінцевий стан) і після зміни розміру полотна (воно стирається).
import type Phaser from 'phaser';

export interface RenderGate {
  setCovered(covered: boolean): void;
  /** Намалювати ще один кадр, навіть коли закрито (змінився розмір полотна). */
  refresh(): void;
  /** Скільки кадрів справді намальовано (лише читання — e2e). */
  rendered(): number;
}

interface Drawing { preRender(): void; postRender(): void }

export function installRenderGate(game: Phaser.Game): RenderGate {
  let covered = false;
  let once = false;
  let drawn = 0;
  let drawing = true;   // чи малюється поточний крок (preRender → render → postRender одного кадру)
  const renderer = game.renderer as unknown as Drawing;
  const { preRender, postRender } = renderer;
  const sceneRender = game.scene.render.bind(game.scene);
  renderer.preRender = function (): void {
    drawing = !covered || once;
    once = false;
    if (!drawing) return;
    drawn += 1;
    preRender.call(renderer);
  };
  // Пропущений кадр: SceneManager.render сам скидає isProcessing — скидаємо й тут, інакше add/bringToTop під час закритого світу мовчки стануть у чергу (рецензія Fable #195).
  game.scene.render = (r): void => { if (drawing) sceneRender(r); else (game.scene as unknown as { isProcessing: boolean }).isProcessing = false; };
  renderer.postRender = function (): void { if (drawing) postRender.call(renderer); };
  return {
    setCovered(next) { if (next && !covered) once = true; covered = next; },
    refresh() { once = true; },
    rendered: () => drawn,
  };
}
