// GAME-97 · лише збірка e2e (?frameLagMs, test-switches.ts): кожен кадр довший на lagMs, як на слабкому телефоні.
// Годинник реального часу тут — свідомий виняток сторожа no-realtime: він міряє затримку, а не вирішує щось у грі.
import Phaser from 'phaser';

export function addFrameLag(game: Phaser.Game, lagMs: number): void {
  game.events.on(Phaser.Core.Events.STEP, () => {
    const end = performance.now() + lagMs;
    while (performance.now() < end) { /* навмисно зайнятий кадр */ }
  });
}
