// GAME-179 · чи гравець просить менше руху (prefers-reduced-motion). Рамка розмови тоді показує рядок одразу, без друку.
export const calmMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
