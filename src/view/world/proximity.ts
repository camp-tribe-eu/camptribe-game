// GAME-175 · наближення замість кнопки: стань у зоні об'єкта — кільце заповнюється ≤ 0,8 с — дія. E/тап лишаються миттєвим скороченням.
// Чисті функції без Phaser: сцена лише викликає stepRing кожен кадр. Дія спрацьовує РАЗ на вхід у зону (озброєння знімається, поки гравець не вийде).

/** Час заповнення кільця, с (вимога власника: ≤ 0,8). */
export const RING_S = 0.7;
/** Крок відгуку при роботі (розвантаження речей), с: приблизно кожні півсекунди. */
export const FEEDBACK_S = 0.5;

/** Об'єкти, що спрацьовують самі від наближення; решта (NPC, багажник, справи хвиль, вогнище) — лише E/тап. */
export const isAutoSpot = (name: string): boolean => name.startsWith('step.') || name.startsWith('take.') || name.startsWith('pack.') || name === 'obj.vehicle';

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
