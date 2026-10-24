// GAME-114 · сторож: жоден шаблон вигляду (родина + NPC) не збігається з іншим. Збіг = ті самі шари в тому ж порядку І ті самі tint.
// GAME-147 · сильніше: кожна пара мусить відрізнятися на екрані — іншим набором шарів (тіло/зачіска) АБО кольором волосся чи
// сорочки на відчутну відстань; інакше два персонажі з «різними» tint на 1 одиницю пройшли б перший сторож. Мутація: скопіювати
// вигляд Victoria в Anna → обидва тести червоні.
import { describe, expect, it } from 'vitest';
import { ANNA_LOOK, ELISE_LOOK, FAMILY_LOOKS, NPC_LOOKS, PET_SHEETS, PLAYER_LOOK } from './art';
import type { LayerSpec } from './character';

const signature = (look: readonly LayerSpec[]): string => JSON.stringify(look.map((l) => [l.url, l.tint ?? null]));
const urls = (look: readonly LayerSpec[]): string => [...look.map((l) => l.url)].sort().join('\n');
const dist = (a: readonly number[] | undefined, b: readonly number[] | undefined): number =>
  !a || !b ? Infinity : Math.hypot(...a.map((v, i) => v - (b[i] ?? 0)));
const layer = (look: readonly LayerSpec[], part: RegExp): LayerSpec | undefined => look.find((l) => part.test(l.url));
/** Мінімальна відстань кольору (0–441), з якої два відтінки читаються як різні на спрайті 32 px. */
const MIN_TINT_DIST = 60;

describe('шаблони вигляду', () => {
  const all: ReadonlyArray<readonly [string, readonly LayerSpec[]]> = [
    ...Object.entries(FAMILY_LOOKS).map(([k, v]) => [`family.${k}`, v] as const),
    ...Object.entries(NPC_LOOKS).map(([k, v]) => [`npc.${k}`, v] as const),
  ];

  it('жодні два шаблони (родина + NPC) не однакові', () => {
    const seen = new Map<string, string>();
    for (const [name, look] of all) {
      const sig = signature(look);
      expect(seen.get(sig), `${name} збігається з ${seen.get(sig) ?? ''}`).toBeUndefined();
      seen.set(sig, name);
    }
    expect(all.length).toBeGreaterThanOrEqual(5);
  });

  it('кожна пара відрізняється набором шарів або кольором волосся/сорочки на ≥ 60', () => {
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const [na, a] = all[i] as (typeof all)[number];
        const [nb, b] = all[j] as (typeof all)[number];
        if (urls(a) !== urls(b)) continue;
        const hair = dist(layer(a, /\/hair\//)?.tint, layer(b, /\/hair\//)?.tint);
        const shirt = dist(layer(a, /\/torso\//)?.tint, layer(b, /\/torso\//)?.tint);
        expect(Math.max(hair, shirt), `${na} і ${nb}: ті самі шари, волосся ${hair.toFixed(0)}, сорочка ${shirt.toFixed(0)}`).toBeGreaterThanOrEqual(MIN_TINT_DIST);
      }
    }
  });

  it('гравець — George, Eliza й Anna в реєстрі NPC — саме ELISE_LOOK і ANNA_LOOK', () => {
    expect(PLAYER_LOOK).toBe(FAMILY_LOOKS.george);
    expect(NPC_LOOKS.elise).toBe(ELISE_LOOK);
    expect(NPC_LOOKS.anna).toBe(ANNA_LOOK);
  });

  it('Matthew — підліток: тіло teen і менша голова, не тіло George; Anna — не хвіст Victoria/Eliza', () => {
    expect(urls(FAMILY_LOOKS.matthew)).toMatch(/\/body\/bodies\/teen\//);
    expect(urls(FAMILY_LOOKS.matthew)).toMatch(/\/head\/heads\/human\/male_small\//);
    expect(urls(FAMILY_LOOKS.matthew)).not.toMatch(/\/body\/bodies\/male\//);
    expect(urls(ANNA_LOOK)).not.toMatch(/ponytail/);
    expect(urls(ANNA_LOOK)).toMatch(/\/hair\/pixie\//);
  });

  it('кожен шаблон має рівно одне тіло, одну голову й одну зачіску (шар fg/bg хвоста — одна зачіска)', () => {
    for (const [name, look] of all) {
      const count = (re: RegExp): number => look.filter((l) => re.test(l.url)).length;
      expect(count(/\/body\//), `${name}: тіло`).toBe(1);
      expect(count(/\/head\//), `${name}: голова`).toBe(1);
      expect(count(/\/hair\/(?!.*\/(bg|fg)\/)/) + Math.min(1, count(/\/hair\/.*\/(bg|fg)\//)), `${name}: зачіска`).toBe(1);
    }
  });
});

describe('аркуш кішки Mia', () => {
  it('опис аркуша узгоджений: 4 напрямки ходьби в різних рядках, усі клітинки в межах 4×5', () => {
    const m = PET_SHEETS.mia;
    expect(m.frame).toBe(32);
    expect(new Set(Object.values(m.walkRow)).size).toBe(4);
    for (const r of Object.values(m.walkRow)) expect(r).toBeLessThan(m.rows);
    expect(m.walkCols).toBeLessThanOrEqual(m.cols);
    for (const [r, c] of m.lyingCells) { expect(r).toBeLessThan(m.rows); expect(c).toBeLessThan(m.cols); }
    expect(m.sitRow).toBeLessThan(m.rows);
    expect(m.url).toMatch(/cat_mia/);
  });
});
