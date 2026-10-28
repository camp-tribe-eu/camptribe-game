// GAME-172 «Живий кемпінг» · сторож мапи й мешканців. Закон 1 (мутація): кожна перевірка нижче має мутацію, під якою вона червоніє
// (список — у описі PR; тут біля кожного `it` — що саме ламати).
//  1) мапа ≥ 2× площі старої (20×12) і всі зони табору досяжні пішки зі старту (BFS по шару walls);
//  2) мешканці — з біблії, 4–6, розклад будується, кожна стоянка прохідна й не на цілі взаємодії;
//  3) за весь цикл розкладу жоден мешканець не стоїть у стіні чи на цілі взаємодії; за кожну хвилину хтось рухається;
//  4) чиста функція часу: без Math.random / Date / performance; репліки 4–15 слів, uk і en, без дублів.
import { describe, expect, it } from 'vitest';
import bible from '../../../docs/NARRATIVE_BIBLE.md?raw';
import ambientSource from './ambient.ts?raw';
import uk from '../../i18n/uk.json';
import en from '../../i18n/en.json';
import { BARK_RANGE, RESIDENTS, TILES_PER_MIN, ZONES, buildTimeline, placeAt, residentGrid, walkableAt, type Zone } from './ambient';
import { findPath, gridFromWalls, isSolid, tileOf, type Grid, type Pt, type Tile } from './follow';

const TILE = 32;
/** Площа старої мапи (20×12 клітинок): картка вимагає ≥ 2×. */
const OLD_AREA = 20 * 12;

interface TiledMap { width: number; height: number; layers: { name: string; type: string; data?: number[]; objects?: { name: string; type?: string; class?: string; x: number; y: number }[] }[] }
const RAW = import.meta.glob<string>('../../../public/maps/camp-lake.tmj', { query: '?raw', import: 'default', eager: true });
const map = JSON.parse(Object.values(RAW)[0] ?? '') as TiledMap;
const objs = map.layers.find((l) => l.name === 'objects')?.objects ?? [];
const kind = (o: (typeof objs)[number]): string => String(o.type || o.class || '');
const spawnObj = objs.find((o) => kind(o) === 'spawn');
const spawn: Pt = { x: spawnObj?.x ?? -1, y: spawnObj?.y ?? -1 };
const spots: Pt[] = objs.filter((o) => ['trigger', 'npc', 'anchor'].includes(kind(o))).map((o) => ({ x: o.x, y: o.y }));
const wallData = map.layers.find((l) => l.name === 'walls')?.data ?? [];
const grid = gridFromWalls(map.width, map.height, TILE, wallData);

/** Зони, до яких з `from` пішки НЕ дійти (порожній список — усе досяжне). Саме цю функцію мутація «закрити прохід» робить червоною. */
export function unreachableZones(g: Grid, from: Pt, zones: readonly Zone[]): string[] {
  const start = tileOf(g, from);
  return zones.filter((z) => !findPath(g, start, z.anchor)).map((z) => z.id);
}
const withSolid = (g: Grid, cells: readonly Tile[]): Grid => {
  const solid = [...g.solid];
  for (const t of cells) solid[t.r * g.cols + t.c] = true;
  return { ...g, solid };
};

describe('мапа табору: площа й зони', () => {
  it(`площа ≥ 2× старої (${OLD_AREA} клітинок): мапа ${map.width}×${map.height}`, () => {
    expect(map.width * map.height).toBeGreaterThanOrEqual(2 * OLD_AREA);
    expect(grid.cols * grid.rows).toBe(map.width * map.height);
  });

  it('усі зони табору досяжні пішки зі старту (BFS по шару walls)', () => {
    expect(ZONES.length).toBeGreaterThanOrEqual(8);
    for (const z of ZONES) {
      expect(isSolid(grid, z.anchor), `якір ${z.id} у стіні`).toBe(false);
      expect(z.anchor.c >= z.c0 && z.anchor.c <= z.c1 && z.anchor.r >= z.r0 && z.anchor.r <= z.r1, `якір ${z.id} поза своїм прямокутником`).toBe(true);
      let free = 0;
      for (let r = z.r0; r <= z.r1; r++) for (let c = z.c0; c <= z.c1; c++) if (!isSolid(grid, { c, r })) free++;
      expect(free, `у зоні ${z.id} майже нічого прохідного`).toBeGreaterThanOrEqual(6);
    }
    expect(unreachableZones(grid, spawn, ZONES)).toEqual([]);
  });

  it('іменовані об\u2019єкти для наступного зрізу: firewood-pile, water, pitch-1…3 і ще — типу anchor, прохідні й досяжні', () => {
    const anchors = objs.filter((o) => kind(o) === 'anchor');
    const names = anchors.map((o) => o.name);
    for (const n of ['obj.firewood-pile', 'obj.water', 'obj.pitch-1', 'obj.pitch-2', 'obj.pitch-3', 'obj.reception-desk', 'obj.sanitary-door', 'obj.pier-end', 'obj.campfire']) {
      expect([...names, ...objs.map((o) => o.name)], `нема об\u2019єкта ${n}`).toContain(n);
    }
    expect(new Set(names).size, 'імена anchor не унікальні').toBe(names.length);
    for (const a of anchors) expect(findPath(grid, tileOf(grid, spawn), tileOf(grid, { x: a.x, y: a.y })), `${a.name} недосяжний`).not.toBeNull();
  });

  // GAME-173 × GAME-172: мапа тепер має власні точки дозвілля (type=leisure); вони мають перевагу над LEISURE_BY_MAP. Мутація: поставити leisure.* у стіну / на ціль — червоніє.
  it('точки дозвілля родини на мапі: прохідні, досяжні зі старту, не на цілях взаємодії, у новій частині табору теж', () => {
    const lz = objs.filter((o) => kind(o) === 'leisure');
    expect(lz.length, 'нема точок дозвілля на мапі').toBeGreaterThanOrEqual(6);
    const targets = new Set(spots.map((s) => { const t = tileOf(grid, s); return t.r * grid.cols + t.c; }));
    for (const o of lz) {
      const t = tileOf(grid, { x: o.x, y: o.y });
      expect(isSolid(grid, t), `${o.name} у стіні (${t.c},${t.r})`).toBe(false);
      expect(targets.has(t.r * grid.cols + t.c), `${o.name} на цілі взаємодії`).toBe(false);
      expect(findPath(grid, tileOf(grid, spawn), t), `${o.name} недосяжна`).not.toBeNull();
    }
    expect(lz.some((o) => o.x >= 20 * TILE), 'жодної точки дозвілля у новій частині мапи').toBe(true);
  });

  it('кожна ціль взаємодії (тригер, NPC, anchor) досяжна, і вона не в стіні', () => {
    for (const s of spots) {
      const t = tileOf(grid, s);
      expect(findPath(grid, tileOf(grid, spawn), t), `ціль у (${t.c},${t.r}) недосяжна`).not.toBeNull();
    }
  });

  // Мутація: закрити ворота східної стіни старого табору (стовпець 10, рядки 5–8) — і решта мапи недосяжна. Тут — те саме в пам'яті;
  // у файлі — правка scripts/maps/build_camp_lake.py (див. PR: стовпці 10–11 рядки 5–8 → стіна) → цей тест і validate-maps червоні.
  it('мутація «закрити прохід»: ворота замуровані — сторож бачить недосяжні зони', () => {
    const gate: Tile[] = [5, 6, 7, 8].flatMap((r) => [{ c: 10, r }, { c: 11, r }]);
    const closed = withSolid(grid, gate);
    const lost = unreachableZones(closed, spawn, ZONES);
    expect(lost).toContain('reception');
    expect(lost).toContain('pier');
    expect(lost).toContain('clearing');
    expect(lost).not.toContain('tents-old');
  });
});

describe('фонові мешканці', () => {
  const walk = residentGrid(grid, spots);

  it('4–6 мешканців, усі з біблії (розділ 3), id унікальні', () => {
    expect(RESIDENTS.length).toBeGreaterThanOrEqual(4);
    expect(RESIDENTS.length).toBeLessThanOrEqual(6);
    expect(new Set(RESIDENTS.map((r) => r.id)).size).toBe(RESIDENTS.length);
    for (const r of RESIDENTS) expect(bible, `${r.id} немає в біблії`).toContain(`| ${r.id} |`);
  });

  it('кожна стоянка — прохідна клітинка, не ціль взаємодії; розклад будується', () => {
    const spotTiles = new Set(spots.map((s) => { const t = tileOf(grid, s); return `${t.c},${t.r}`; }));
    for (const r of RESIDENTS) {
      expect(r.stops.length).toBeGreaterThanOrEqual(3);
      for (const s of r.stops) {
        expect(isSolid(grid, s), `${r.id}: стоянка (${s.c},${s.r}) у стіні`).toBe(false);
        expect(spotTiles.has(`${s.c},${s.r}`), `${r.id}: стоянка (${s.c},${s.r}) на цілі взаємодії`).toBe(false);
      }
      expect(buildTimeline(walk, r), `${r.id}: розклад не будується`).not.toBeNull();
    }
  });

  // Мутація: у RESIDENTS поставити стоянку в стіну / на тригер (напр. c:4,r:7 — task.dinner) → цей тест і попередній червоні.
  // Мутація 2: у residentGrid не додавати клітинки цілей → шлях пройде крізь ціль, червоніє «не на цілі взаємодії».
  it('за весь цикл розкладу (крок 0,25 хв) мешканець завжди на прохідній клітинці й не на цілі взаємодії', () => {
    const spotTiles = new Set(spots.map((s) => { const t = tileOf(grid, s); return `${t.c},${t.r}`; }));
    for (const r of RESIDENTS) {
      const tl = buildTimeline(walk, r);
      if (!tl) throw new Error(`${r.id}: no timeline`);
      let moved = 0;
      for (let m = 0; m < tl.cycle * 2; m += 0.25) {
        const p = placeAt(walk, tl, m);
        const t = tileOf(grid, p);
        expect(walkableAt(grid, p), `${r.id} о ${m} хв у стіні (${t.c},${t.r})`).toBe(true);
        expect(spotTiles.has(`${t.c},${t.r}`), `${r.id} о ${m} хв на цілі взаємодії (${t.c},${t.r})`).toBe(false);
        if (p.moving) moved++;
      }
      expect(moved, `${r.id} ніколи не рухається`).toBeGreaterThan(0);
    }
  });

  it('жива сцена: у будь-яке вікно 60 хв (= 60 с гри) рухається хоча б 4 мешканці, і кожен ходить не рідше ніж раз на цикл', () => {
    const tls = RESIDENTS.map((r) => buildTimeline(walk, r));
    for (let start = 0; start < 600; start += 10) {
      let walking = 0;
      for (const tl of tls) {
        if (!tl) throw new Error('no timeline');
        let any = false;
        for (let m = start; m < start + 60; m += 0.5) if (placeAt(walk, tl, m).moving) { any = true; break; }
        if (any) walking++;
      }
      expect(walking, `вікно ${start}–${start + 60} хв: рухаються лише ${walking}`).toBeGreaterThanOrEqual(4);
    }
  });

  it('позиція — чиста функція часу: той самий час → та сама клітинка; крок між сусідніми кроками не стрибає', () => {
    for (const r of RESIDENTS) {
      const tl = buildTimeline(walk, r);
      if (!tl) throw new Error('no timeline');
      let prev = placeAt(walk, tl, 0);
      expect(placeAt(walk, tl, 0)).toEqual(prev);
      for (let m = 0.05; m < tl.cycle; m += 0.05) {
        const p = placeAt(walk, tl, m);
        expect(Math.hypot(p.x - prev.x, p.y - prev.y), `${r.id} стрибнув о ${m.toFixed(2)} хв`).toBeLessThanOrEqual(TILES_PER_MIN * TILE * 0.05 + 0.5);
        prev = p;
      }
    }
  });

  it('шлях між стоянками не проходить крізь ціль взаємодії: наявність цілі на прямій змушує обхід', () => {
    // Контроль, що residentGrid справді щось робить: task.dinner (4,7) стоїть на стежці рядка 7 — шлях (1,7)→(8,7) мусить її обійти.
    const direct = findPath(grid, { c: 1, r: 7 }, { c: 8, r: 7 }) as Tile[];
    const around = findPath(walk, { c: 1, r: 7 }, { c: 8, r: 7 }) as Tile[];
    expect(direct.some((t) => t.c === 4 && t.r === 7)).toBe(true);
    expect(around.some((t) => t.c === 4 && t.r === 7)).toBe(false);
  });

  it('BARK_RANGE — у межах двох-трьох клітинок', () => {
    expect(BARK_RANGE).toBeGreaterThanOrEqual(TILE * 2);
    expect(BARK_RANGE).toBeLessThanOrEqual(TILE * 3);
  });
});

describe('репліки мешканців', () => {
  const words = (s: string): number => s.trim().split(/\s+/).length;
  const lines = RESIDENTS.flatMap((r) => r.barks.map((k) => ({ id: r.id, key: k })));

  it('кожен має ≥ 2 реплік; ключі є в uk і en; 4–15 слів; uk ≤ 140 символів', () => {
    for (const r of RESIDENTS) expect(r.barks.length, `${r.id}: реплік`).toBeGreaterThanOrEqual(2);
    for (const { id, key } of lines) {
      const u = (uk as Record<string, string>)[key];
      const e = (en as Record<string, string>)[key];
      expect(u, `${id}: ${key} немає в uk`).toBeTruthy();
      expect(e, `${id}: ${key} немає в en`).toBeTruthy();
      for (const [lang, text] of [['uk', u], ['en', e]] as const) {
        const n = words(text ?? '');
        expect(n, `${key} (${lang}): ${n} слів`).toBeGreaterThanOrEqual(4);
        expect(n, `${key} (${lang}): ${n} слів`).toBeLessThanOrEqual(15);
      }
      expect((u ?? '').length).toBeLessThanOrEqual(140);
    }
  });

  it('жодна репліка не повторюється — ні між мешканцями, ні з довідником фраз героїв', () => {
    const seen = new Set<string>();
    for (const { key } of lines) {
      const u = (uk as Record<string, string>)[key] ?? '';
      expect(seen.has(u), `дубль: ${u}`).toBe(false);
      seen.add(u);
      expect(bible.includes(`«${u}»`), `репліка вже є в довіднику фраз: ${u}`).toBe(false);
    }
  });
});

describe('детермінізм джерела', () => {
  // Мутація: додати `Math.random()` у ambient.ts → червоний.
  it('ambient.ts не читає ні Math.random, ні годинник стіни', () => {
    const code = ambientSource.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/Math\.random|Date\.now|new Date|performance\.now/);
  });
});
