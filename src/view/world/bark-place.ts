// GAME-346 · де стоїть репліка мешканця. Раніше її притискали лише до краю кадру, і біля лавки вона лягала на підпис «Хитка лавка: підійди й натисни» (L05):
// підпис дії під ногами героя важливіший за балаканину сусіда — репліка зсувається над підписом (а як там нема місця — під нього).
export interface Box { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number }

const hit = (a: Box, b: Box): boolean => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

/**
 * Нижня точка репліки (низ тексту; світові одиниці). `bottom` — де її поставили (над головою, уже втиснуту в кадр), `x0..x1` — її ширина по X, `h` — висота,
 * `hint` — рамка підпису дії (null — його нема), `viewTop` — верх кадру. Перетину з підписом нема: або над ним, або під ним.
 */
export function barkAvoiding(bottom: number, x0: number, x1: number, h: number, hint: Box | null, viewTop: number): number {
  if (!hint || !hit({ x0, y0: bottom - h, x1, y1: bottom }, hint)) return bottom;
  const above = hint.y0 - 2;
  return above - h >= viewTop ? Math.round(above) : Math.round(hint.y1 + 2 + h);
}
