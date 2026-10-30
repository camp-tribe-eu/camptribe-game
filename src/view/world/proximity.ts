// GAME-175 · наближення замість кнопки: стань у зоні об'єкта — кільце заповнюється ≤ 0,8 с — дія. E/тап лишаються миттєвим скороченням.
// Чисті функції без Phaser: сцена лише викликає stepRing кожен кадр. Дія спрацьовує РАЗ на вхід у зону (озброєння знімається, поки гравець не вийде).

/** Час заповнення кільця, с (вимога власника: ≤ 0,8). */
export const RING_S = 0.7;
/** Крок відгуку при роботі (розвантаження речей), с: приблизно кожні півсекунди. */
export const FEEDBACK_S = 0.5;

/** Об'єкти, що спрацьовують самі від наближення (GAME-190: крім дров — їх беруть руками: гілки → колода → удари); решта (NPC, багажник, справи хвиль, вогнище) — лише E/тап. */
export const isAutoSpot = (name: string): boolean => name.startsWith('step.') || (name.startsWith('take.') && name !== 'take.item.firewood') || name.startsWith('pack.') || name.startsWith('req.') || name === 'obj.vehicle';   // GAME-180: req.* — цілі прохань сусідів

export interface Ring { readonly name: string | null; readonly t: number }
export const RING_IDLE: Ring = { name: null, t: 0 };

/**
 * Крок кільця. `near` — найближчий живий об'єкт у зоні (або null); `armed` — чи його дозволено (не спрацьовував у цьому заході в зону);
 * `hold` — чи гравець виконує умову утримання (для авто: стоїть). Змінив ціль чи вийшов — кільце скидається.
 */
export function stepRing(r: Ring, near: string | null, armed: boolean, hold: boolean, dt: number): { ring: Ring; fire: string | null } {
  if (near === null || !armed || !isAutoSpot(near)) return { ring: RING_IDLE, fire: null };
  if (!hold) return { ring: { name: near, t: 0 }, fire: null };
  const t = (r.name === near ? r.t : 0) + dt / RING_S;
  return t >= 1 ? { ring: RING_IDLE, fire: near } : { ring: { name: near, t }, fire: null };
}

/** Чи кільце може взяти об'єкт `near` само: річ на полиці — лише коли вона поточна ціль підказки (повз зайву річ іти можна); решта автооб'єктів — як є. */
export const ringMayTake = (near: string | null, target: string | null): boolean => near !== null && (!near.startsWith('pack.') || near === target);

/**
 * Авто/велосипед рушає лише тоді, коли ВСЕ потрібне вже вкладене: рюкзак порожній і немає жодної потрібної речі поза багажником
 * (ні дрібної, ні громіздкої). Поки чогось бракує — кільце біля авто не заповнюється, їхати «повз» речі не можна.
 */
export const vehicleReady = (carrying: boolean, needs: { readonly small: number; readonly bulky: number }): boolean => !carrying && needs.small + needs.bulky === 0;

/** Відступи безпечної зони від країв видимої частини світу (світові одиниці): верх — під шапкою HUD, низ — над джойстиком і кнопкою дії. */
export interface Insets { readonly top: number; readonly bottom: number; readonly left: number; readonly right: number }
export interface View { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

/**
 * Куди ставити стрілку-покажчик, коли ціль поза безпечною зоною: точка на межі зони (стиснутої на радіус стрілки `r`) по променю від центру зони до цілі,
 * і кут стрілки. Чиста функція: шапка й дотикова панель стрілку не закривають за будь-якого положення цілі.
 */
export function edgeArrow(view: View, to: { readonly x: number; readonly y: number }, ins: Insets, r: number): { x: number; y: number; angle: number } {
  const left = view.x + ins.left + r;
  const right = view.x + view.width - ins.right - r;
  const top = view.y + ins.top + r;
  const bottom = view.y + view.height - ins.bottom - r;
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  const dx = to.x - cx;
  const dy = to.y - cy;
  const k = Math.min((right - left) / 2 / Math.max(Math.abs(dx), 1e-6), (bottom - top) / 2 / Math.max(Math.abs(dy), 1e-6), 1);
  return { x: cx + dx * k, y: cy + dy * k, angle: Math.atan2(dy, dx) };
}

/** Чи ціль у безпечній зоні (тоді показуємо пунктир і гойдалку над нею, а не стрілку на краї). */
export const inSafeZone = (view: View, p: { readonly x: number; readonly y: number }, ins: Insets, margin: number): boolean =>
  p.x > view.x + ins.left + margin && p.x < view.x + view.width - ins.right - margin && p.y > view.y + ins.top + margin && p.y < view.y + view.height - ins.bottom - margin;

/** GAME-186: наскільки (px) слідувач, на якого дивиться герой, «ближчий» за того, що збоку чи позаду. */
export const FACING_BONUS = 12;
type Face = 'up' | 'left' | 'down' | 'right';
export interface Pick { readonly name: string; readonly x: number; readonly y: number; readonly follower: boolean }

/** Косинус між напрямком погляду й напрямком на (dx, dy): 1 — просто перед героєм, −1 — за спиною. */
export function facingDot(f: Face, dx: number, dy: number): number {
  const d = Math.hypot(dx, dy) || 1;
  return ((f === 'left' ? -dx : f === 'right' ? dx : 0) + (f === 'up' ? -dy : f === 'down' ? dy : 0)) / d;
}

/**
 * Хто «найближчий співрозмовник». Спершу всі, крім родини (предмети, Еліза, мешканці): найближчий у зоні `range`. Родина (GAME-179) — лише коли
 * жодного іншого в зоні нема; вона тулиться до героя на 1–2 тайли й міняється слотами від кожного кроку, тож між слідувачами «найближчий» — майже
 * випадковість. Тому їм перевага до `FACING_BONUS` px тому, на кого дивиться герой: повернувся до Метью — говориш із Метью.
 */
export function pickNearest(px: number, py: number, facing: Face, spots: readonly Pick[], range: number): string | null {
  let pick: Pick | null = null;
  let best = range;
  for (const follower of [false, true]) {
    // Хтось не з родини в зоні — родину не розглядаємо. Рахунок слідувача — d мінус до FACING_BONUS: позаду героя він більший за d,
    // тож поріг родини ширший на бонус (рецензія #109); у зону пускає лише `d > range`.
    if (follower) { if (pick) break; best = range + FACING_BONUS; }
    for (const s of spots) {
      if (s.follower !== follower) continue;
      const d = Math.hypot(s.x - px, s.y - py);
      if (d > range) continue;
      const score = follower ? d - FACING_BONUS * facingDot(facing, s.x - px, s.y - py) : d;
      if (score <= best) { best = score; pick = s; }
    }
  }
  return pick?.name ?? null;
}
