// GAME-189 · намет руками (OD-022): чиста детермінована логіка. Жодного годинника, Phaser чи випадковості: стан міняють ЛИШЕ вхід гравця (act)
// й крок кадру (tick). Прямого шляху «справу виконано без вводу» немає: фаза `done` досяжна тільки з ударом по 4-му кілку (act у діапазоні зеленого).
// Сцена (view/world/tent.ts) лише малює цей стан і, коли подія `done`, шле ядру ту саму команду, що й раніше (CompleteTask через об'єкт task.pitch-tent).

export const PEGS = 4;
/** Повний хід маркера туди-назад, мс. Повільно навмисно: телефон, перший раз у грі, жодного штрафу. */
export const PERIOD_MS = 2400;
/** Зелена смуга шкали (частка 0..1). Широка: це гра про рух руками, а не іспит на реакцію. */
export const BAND = { from: 0.32, to: 0.68 } as const;
/** Скільки гравець бачить помилку (мс) — лише для хитання намету. */
export const WOBBLE_MS = 500;

export type TentPhase = 'idle' | 'place' | 'peg' | 'done';
/** GAME-203: найбільше помічників (мама й Метью тягнуть відтяжки); кожен знімає з тата один кілок, але два кілки тато б'є завжди. */
export const MAX_HELPERS = 2;
export const MIN_PEGS = 2;
/** Скільки кілків на руки тата з `helpers` помічниками: 4 сам, 3 з одним, 2 з двома. Чиста функція — її читає сцена й e2e. */
export const pegsFor = (helpers: number): number => Math.max(MIN_PEGS, PEGS - Math.max(0, Math.min(MAX_HELPERS, Math.trunc(helpers))));
export interface TentState {
  readonly phase: TentPhase;
  /** Забито кілків (0..need). */
  readonly pegs: number;
  /** GAME-203: скільки кілків треба забити тату (pegsFor(helpers)); решту тримають помічники відтяжками. */
  readonly need: number;
  /** Мс від початку поточного ходу маркера. */
  readonly t: number;
  /** Скільки промахів було (лише для відгуку; на хід гри не впливає — штрафу немає). */
  readonly misses: number;
}
export type TentEvent = 'none' | 'started' | 'placed' | 'blocked' | 'hit' | 'miss' | 'done';
export type TentInput = { readonly kind: 'tick'; readonly dtMs: number } | { readonly kind: 'act'; readonly placeOk: boolean };

export const IDLE: TentState = { phase: 'idle', pegs: 0, need: PEGS, t: 0, misses: 0 };
/** `helpers` — скільки членів родини тягнуть відтяжки (GAME-203): з ними кілків на руки тата менше. */
export const startTent = (helpers = 0): TentState => ({ phase: 'place', pegs: 0, need: pegsFor(helpers), t: 0, misses: 0 });

/** Позиція маркера 0..1 у мить t: трикутна хвиля (вниз-вгору), без розривів. */
export function markerAt(t: number): number {
  const x = (((t % PERIOD_MS) + PERIOD_MS) % PERIOD_MS) / PERIOD_MS;
  return x < 0.5 ? x * 2 : 2 - x * 2;
}
export const inBand = (pos: number): boolean => pos >= BAND.from && pos <= BAND.to;

/** Один крок автомата. Повертає новий стан і подію для відгуку (звук, пил, хитання). */
export function stepTent(s: TentState, i: TentInput): { state: TentState; event: TentEvent } {
  if (i.kind === 'tick') {
    if (s.phase !== 'peg' || !(i.dtMs > 0)) return { state: s, event: 'none' };
    return { state: { ...s, t: s.t + i.dtMs }, event: 'none' };
  }
  if (s.phase === 'place') return i.placeOk ? { state: { ...s, phase: 'peg', t: 0 }, event: 'placed' } : { state: s, event: 'blocked' };
  if (s.phase !== 'peg') return { state: s, event: 'none' };
  if (!inBand(markerAt(s.t))) return { state: { ...s, t: 0, misses: s.misses + 1 }, event: 'miss' };
  const pegs = s.pegs + 1;
  return pegs >= s.need ? { state: { ...s, phase: 'done', pegs, t: 0 }, event: 'done' } : { state: { ...s, pegs, t: 0 }, event: 'hit' };
}

/** Чи місце під намет придатне: поблизу цілі справи, усі кути підошви вільні, чужих об'єктів мапи в підошві нема. */
export const FOOT = { w: 48, h: 32 } as const;
export const PLACE_RADIUS = 72;
export function placeOk(at: { x: number; y: number }, spot: { x: number; y: number }, solidAt: (x: number, y: number) => boolean, others: readonly { x: number; y: number }[]): boolean {
  if (Math.hypot(at.x - spot.x, at.y - spot.y) > PLACE_RADIUS) return false;
  const hx = FOOT.w / 2;
  const hy = FOOT.h / 2;
  for (const [dx, dy] of [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy], [0, 0]] as const) if (solidAt(at.x + dx, at.y + dy)) return false;
  return !others.some((o) => Math.abs(o.x - at.x) < hx && Math.abs(o.y - at.y) < hy);
}
