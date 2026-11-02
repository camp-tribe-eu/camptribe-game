// GAME-210 · «передній план»: крони дерев і дахи намету лежать НАД героєм, коли той стоїть позаду них (глибина смуги > глибини героя),
// а поки герой під кроною — крона стає напівпрозорою, щоб він не зникав (Eastward / Fields of Mistria). Лише відображення: нічого не пише в ядро.
// Прозорість рухається покадрово від dt кадру (без tween і таймерів реального часу — сторож «no-realtime»).

/** Прозорість крони, під якою стоїть герой: видно і крону, і його. */
export const CANOPY_UNDER = 0.5;
/** Швидкість зміни прозорості, 1/с: повна зміна 1 → 0,5 за ≈ 0,15 с — м'яко, без стрибка. */
export const CANOPY_FADE_PER_S = 3.5;

/** Смуга лежить над героєм (закриває його), якщо її глибина більша за глибину героя (y ніг). Єдине місце цього правила: сцена, зонд і тест беруть його звідси. */
export const bandOverHero = (bandDepth: number, heroDepth: number): boolean => bandDepth > heroDepth;

/** Наступна прозорість смуги: до CANOPY_UNDER, якщо смуга над героєм і його кадр її перекриває (`overlap`), інакше до 1; крок — від dt (секунди). */
export function nextCanopyAlpha(current: number, over: boolean, overlap: boolean, dtSec: number): number {
  const target = over && overlap ? CANOPY_UNDER : 1;
  const step = CANOPY_FADE_PER_S * Math.max(0, dtSec) * (1 - CANOPY_UNDER);
  return current < target ? Math.min(target, current + step) : Math.max(target, current - step);
}
