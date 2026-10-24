// Телефон чи ні (GAME-96): телефон грають ЛИШЕ горизонтально (рішення власника 23.10.2026), тож сторч показуємо накладку «Поверни».
// Чиста функція — щоб її перевіряв юніт-тест, а не око. Браузер не вміє замкнути орієнтацію поза повним екраном.

/** Найкоротший бік екрана телефона, CSS px. Найбільший телефон — ≈ 430; найменший планшет (iPad mini) — 744, тож межа 500 розділяє їх із запасом. */
export const PHONE_SHORT_SIDE_MAX = 500;

/** Телефон = дотиковий вказівник І короткий бік ≤ 500. Десктоп без дотику й планшет (короткий бік ≥ 744) — ніколи. */
export function isPhone(touch: boolean, width: number, height: number): boolean {
  return touch && Math.min(width, height) <= PHONE_SHORT_SIDE_MAX;
}

/** Накладка «Поверни телефон»: телефон, і екран вищий за ширину. */
export function needsRotate(touch: boolean, width: number, height: number): boolean {
  return isPhone(touch, width, height) && height > width;
}

/** Є дотик: грубий вказівник хоч десь (як і дотикові кнопки в index.html) або точки дотику. */
export function hasTouch(): boolean {
  try {
    return window.matchMedia('(any-pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  } catch {
    return false;
  }
}
