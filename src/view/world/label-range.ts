// GAME-225 · підпис справи руками висить лише поруч із нею (чиста функція, без Phaser — тестується окремо).
type Pt = { x: number; y: number };
/** Відстань (px), ближче якої показується підпис справи. */
export const LABEL_RANGE = 110;
/** Герой достатньо близько до справи (`block` — колода, `branches` — непідібрані гілки), щоб показувати підпис. */
export function labelNear(hero: Pt, block: Pt, branches: readonly Pt[], range: number = LABEL_RANGE): boolean {
  return [block, ...branches].some((p) => Math.hypot(p.x - hero.x, p.y - hero.y) <= range);
}
