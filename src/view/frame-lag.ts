// GAME-97 · лише збірка e2e (?frameLagMs, test-switches.ts): кожен кадр довший на lagMs, як на слабкому телефоні.
// GAME-38 · перший кадр: час від початку навігації до першого намальованого кадру Phaser (probe.firstFrameMs) і штучна
// затримка старту (?bootDelayMs, лише e2e) — негативний контроль проби.
// Годинник реального часу тут — свідомий виняток сторожа no-realtime: він міряє затримку, а не вирішує щось у грі.
import Phaser from 'phaser';

function busyWait(ms: number): void {
  const end = performance.now() + ms;
  while (performance.now() < end) { /* навмисно зайнятий цикл */ }
}

export function addFrameLag(game: Phaser.Game, lagMs: number): void {
  game.events.on(Phaser.Core.Events.STEP, () => busyWait(lagMs));
}

/** Навмисно гальмує старт (лише e2e): перший кадр приходить пізніше на ms. */
export function bootDelay(ms: number): void {
  busyWait(ms);
}

/**
 * Перший намальований кадр: performance.now() рахується від початку навігації, тож це і є «від навігації до першого кадру».
 * Лише спостереження для e2e — гра за цим числом нічого не вирішує.
 */
export function onFirstFrame(game: Phaser.Game, record: (msSinceNavigation: number) => void): void {
  game.events.once(Phaser.Core.Events.POST_RENDER, () => record(performance.now()));
}
