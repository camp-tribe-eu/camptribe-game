// Seeded RNG ядра (ARCHITECTURE §3.3, CR-034): sfc32. Стан — чотири uint32, лежить у сейві,
// тож завантаження не «перекидає кубик». Чисті функції: стан на вхід — новий стан на вихід.

export type RngState = readonly [number, number, number, number];

/** splitmix32 — розгорнути одне число-зерно в чотири незалежні слова стану. */
export function seedRng(seed: number): RngState {
  let s = seed >>> 0;
  const next = (): number => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
  const st: [number, number, number, number] = [next(), next(), next(), next()];
  // sfc32 рекомендує прогріти генератор.
  let warm: RngState = st;
  for (let i = 0; i < 12; i++) warm = nextUint32(warm).state;
  return warm;
}

export function nextUint32(state: RngState): { value: number; state: RngState } {
  let [a, b, c, d] = state;
  const t = (((a + b) | 0) + d) | 0;
  d = (d + 1) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  c = (c + t) | 0;
  return { value: t >>> 0, state: [a >>> 0, b >>> 0, c >>> 0, d >>> 0] };
}

/** Ціле в [0, n) без зсуву (відкидання хвоста). */
export function nextInt(state: RngState, n: number): { value: number; state: RngState } {
  if (!Number.isInteger(n) || n < 1 || n > 0x1_0000_0000) throw new RangeError(`nextInt: n=${n}`);
  const limit = 0x1_0000_0000 - (0x1_0000_0000 % n);
  let s = state;
  for (;;) {
    const r = nextUint32(s);
    s = r.state;
    if (r.value < limit) return { value: r.value % n, state: s };
  }
}
