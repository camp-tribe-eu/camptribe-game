// GAME-229 · підсумок дня: категорії «розгортаються» по одній, лічильник «прокручується». Механізм — той самий, що в картці розділу (EpisodeCard):
// CSS-анімація із затримкою на елементі (`--rv-delay`), а не таймер чи кадр у коді — сторож no-realtime тут нічого не рахує, «менше руху» все показує одразу
// (index.html, @media prefers-reduced-motion). Текст і кінцеві числа завжди в DOM (екранний читач, тести); анімація — лише поява й косметичний лічильник.
/** Одна категорія з'являється через стільки мс після попередньої. */
export const REVEAL_STEP_MS = 280;
/** Скільки триває «прокрутка» лічильника, мс. */
export const COUNT_MS = 900;

/** Затримка появи категорії №i (з нуля), мс: перша — одразу, далі по кроку. */
export const revealDelay = (index: number): number => Math.max(0, index) * REVEAL_STEP_MS;

/** Лічильник стартує разом із першою категорією; тривалість не залежить від числа (завжди COUNT_MS). */
export const countStyle = (target: number): Record<string, string | number> => ({ '--to': Math.max(0, Math.floor(target)), '--count-ms': `${COUNT_MS}ms` });
