// Детерміноване «випадкове» 0..1 від номера й зерна (ціле хешування, без стану). Живе в ядрі, бо від нього залежить, скільки дарів дає дерево за день (core/forage.ts); вигляд (fx-live) бере звідси ж.
export function hash01(i: number, seed: number): number {
  let t = (Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(seed + 0x7f4a7c15, 0x85ebca6b)) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
