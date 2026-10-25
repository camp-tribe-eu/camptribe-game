// GAME-32 · мапа сцени ↔ контент. Валідатор мап доводить «досяжно пішки», але не знає, ЩО стоїть на
// мапі (docs/MAP-VALIDATOR.md, «Чого не перевіряє»). Тут друга половина:
//  1) мапа, яку вантажить сцена, лежить у теці під валідатором мап (npm run validate);
//  2) кожен NPC на мапі — NPC контенту, кожен тригер — взаємодія каталогу;
//  3) кожен NPC локації мапи (locationId) має своє місце на мапі — інакше з ним не заговорити пішки.
import { describe, expect, it } from 'vitest';
import pkg from '../../../package.json';
import sceneSource from './scene.ts?raw';
import { TILESET_IMAGES } from './art';

// Файли сцени гри (src/view/world). Сторінка спайка (src/view/spike) має свою мапу й гри не стосується.
const WORLD_SOURCES = import.meta.glob<string>(['./**/*.ts', '!./**/*.test.ts'], { query: '?raw', import: 'default', eager: true });
import type { CoreDefs } from '../../core/defs';
import { GAME_DEFS } from '../../content/slice-defs';

interface TiledObject { name: string; type?: string; class?: string; point?: boolean; gid?: number }
interface TiledLayer {
  name: string; type: string; objects?: TiledObject[]; properties?: { name: string; value: unknown }[];
  offsetx?: number; offsety?: number; x?: number; y?: number; parallaxx?: number; parallaxy?: number; visible?: boolean; opacity?: number; data?: number[]; layers?: TiledLayer[];
}
interface TiledMap { properties?: { name: string; value: unknown }[]; layers: TiledLayer[]; tilesets?: { name?: string; tiles?: { properties?: { name: string }[] }[] }[] }

/**
 * Формат мапи, який сцена читає ТАК САМО, як валідатор мап (рецензія ea1e98e: чотири правки мапи
 * проходили валідатор, але в грі поводились інакше):
 *  - стіни — лише шар `walls` з collides=true (сцена блокує кожен непорожній тайл шару walls; валідатор —
 *    шари з collides і тайли з collides; без цього правила вони розходяться);
 *  - тип об'єкта — у `type` (Phaser 4 копіює `type`, але не `class`);
 *  - об'єкти — точки, без зсуву шару (валідатор бере центр і не знає offsetx/offsety; сцена — x/y
 *    об'єкта плюс зсув шару: для точок без зсуву це та сама клітинка).
 */
export function gameMapFormatProblems(map: TiledMap): string[] {
  const out: string[] = [];
  // Групи шарів — ні: Phaser називає вкладений шар «група/walls» і додає зсув групи (друге коло рецензії).
  if (map.layers.some((l) => l.type === 'group')) out.push('групи шарів: сцена шукає walls і objects на верхньому рівні');
  const layers = map.layers;
  // Зсув і паралакс будь-якого шару: Phaser зсуває сітку колізій (ParseTileLayers: x = offsetx), валідатор — ні.
  for (const l of layers) {
    if ((l.offsetx ?? 0) !== 0 || (l.offsety ?? 0) !== 0) out.push(`шар ${l.name}: зсув offsetx/offsety — валідатор його не знає`);
    if ((l.parallaxx ?? 1) !== 1 || (l.parallaxy ?? 1) !== 1) out.push(`шар ${l.name}: паралакс — сцена й валідатор бачать різні місця`);
    if ((l.x ?? 0) !== 0 || (l.y ?? 0) !== 0) out.push(`шар ${l.name}: x/y шару — Phaser зсуває шар, валідатор ні`);
  }
  // Тайлсети — рівно ті, що сцена реєструє (art.ts, GAME-93): тайли тайлсету, якого сцена не знає, не малюються, але стіни з них колізять.
  const names = (map.tilesets ?? []).map((t) => t.name ?? '').sort().join(',');
  if (names !== Object.keys(TILESET_IMAGES).sort().join(',')) out.push(`тайлсети мапи [${names}] ≠ тайлсети сцени [${Object.keys(TILESET_IMAGES).sort().join(',')}]`);
  // Шари, які сцена створює за іменем: відсутній — виняток у грі. 3/4-глибина: above (верхівки) і decor (тіні) — тайлові, без колізій.
  for (const need of ['ground', 'decor', 'walls', 'above']) {
    if (layers.filter((l) => l.name === need && l.type === 'tilelayer').length !== 1) out.push(`потрібен рівно один тайловий шар ${need}`);
  }
  // Біти gid понад три прапорці віддзеркалення: валідатор їх знімає, Phaser (0x10000000) — ні.
  for (const l of layers) if ((l.data ?? []).some((g) => (g & 0x10000000) !== 0)) out.push(`шар ${l.name}: gid з бітом 0x10000000 — Phaser такий тайл не малює`);
  const collides = (l: TiledLayer): boolean => l.properties?.some((p) => p.name === 'collides' && p.value === true) ?? false;
  const walls = layers.filter((l) => l.name === 'walls');
  if (walls.length !== 1 || walls[0]?.type !== 'tilelayer' || !collides(walls[0])) out.push('потрібен рівно один тайловий шар walls з collides=true');
  if (walls[0] && (walls[0].visible === false || walls[0].opacity === 0)) out.push('шар walls невидимий — стіни колізять, але їх не видно');
  for (const l of layers) if (l.name !== 'walls' && collides(l)) out.push(`шар ${l.name} має collides, але сцена блокує лише walls`);
  if (map.tilesets?.some((t) => t.tiles?.some((x) => x.properties?.some((p) => p.name === 'collides')))) out.push('collides на тайлі тайлсета: сцена його не читає');
  const groups = layers.filter((l) => l.type === 'objectgroup');
  if (groups.length !== 1 || groups[0]?.name !== 'objects') out.push('потрібен рівно один шар об\'єктів objects');
  for (const g of groups) {
    for (const o of g.objects ?? []) {
      if (!o.type) out.push(`${o.name}: тип у class без type — Phaser 4 його не копіює, сцена об'єкта не побачить`);
      if (o.point !== true || o.gid !== undefined) out.push(`${o.name}: не точка — сцена й валідатор беруть різні точки прив'язки`);
    }
  }
  return out;
}


export function mapContentProblems(map: TiledMap, defs: CoreDefs): string[] {
  const st = defs.story;
  if (!st) return ['no story'];
  const out: string[] = [];
  const loc = map.properties?.find((p) => p.name === 'locationId')?.value;
  if (typeof loc !== 'string' || !st.locations[loc]) out.push(`locationId ${String(loc)} не з контенту`);
  const objects = map.layers.find((l) => l.type === 'objectgroup' && l.name === 'objects')?.objects ?? [];
  const typeOf = (o: TiledObject): string => o.type || o.class || '';
  const npcs = objects.filter((o) => typeOf(o) === 'npc').map((o) => o.name);
  for (const n of npcs) if (!st.npcs[n]) out.push(`NPC ${n} — немає в content/npcs.json`);
  for (const n of npcs) if (st.npcs[n] && st.npcs[n]?.locationId !== loc) out.push(`NPC ${n} живе в ${st.npcs[n]?.locationId}, а мапа — ${String(loc)}`);
  // Тригер — взаємодія каталогу або ціль справи хвилі task.<id> (GAME-170 зріз 2): справа з content/waves.json, інакше дотик нікуди не веде.
  const taskIds = new Set(Object.values(defs.waves?.waves ?? {}).flatMap((w) => w.tasks.map((t) => `task.${t.id}`)));
  for (const t of objects.filter((o) => typeOf(o) === 'trigger')) if (!defs.interactions[t.name] && !taskIds.has(t.name)) out.push(`тригер ${t.name} — немає серед взаємодій каталогу й справ хвиль`);
  for (const [id, n] of Object.entries(st.npcs)) if (n.locationId === loc && !npcs.includes(id)) out.push(`NPC ${id} локації ${String(loc)} не має місця на мапі`);
  return out;
}

const RAW = import.meta.glob<string>('../../../public/maps/*.tmj', { query: '?raw', import: 'default', eager: true });
const byName = new Map(Object.entries(RAW).map(([k, v]) => [k.replace(/^.*\//, ''), v] as const));
const MAPS = [...byName.keys()].sort();
const mapOf = (f: string): TiledMap => JSON.parse(byName.get(f) ?? 'null') as TiledMap;

describe('мапа сцени ↔ контент (GAME-32)', () => {
  it('сцена вантажить лише мапи з public/maps/, і цю теку перевіряє npm run validate', () => {
    expect(MAPS.length).toBeGreaterThan(0);
    const loaded = [...sceneSource.matchAll(/tilemapTiledJSON\(\s*'[^']*'\s*,\s*'([^']+)'/g)].map((m) => m[1]);
    expect(loaded.length).toBeGreaterThan(0);
    // Кожен виклик у будь-якому файлі сцени — розпізнаний цим шаблоном (рецензія: інші лапки, змінна,
    // об'єктна форма чи інший файл обходили перевірку).
    const calls = Object.values(WORLD_SOURCES).reduce((n, src) => n + (src.match(/tilemapTiledJSON\s*\(/g) ?? []).length, 0);
    expect(calls).toBe(loaded.length);
    for (const p of loaded) expect(p).toMatch(/^maps\/[^/]+\.tmj$/);
    for (const p of loaded) expect(MAPS).toContain(p?.replace('maps/', ''));
    const validate = (pkg as { scripts: Record<string, string> }).scripts.validate ?? '';
    expect(validate).toContain('validate-maps.mjs --dir public/maps');
  });

  for (const f of MAPS) {
    it(`${f}: NPC і тригери — з контенту, кожен NPC локації — на мапі`, () => {
      expect(mapContentProblems(mapOf(f), GAME_DEFS)).toEqual([]);
    });
    it(`${f}: формат, який сцена читає так само, як валідатор мап`, () => {
      expect(gameMapFormatProblems(mapOf(f))).toEqual([]);
    });
  }

  it('негативні контролі формату: кожна правка, що проходила валідатор, але ламала гру, — червона', () => {
    const base = mapOf('camp-lake.tmj');
    const objs = (m: TiledMap): TiledObject[] => m.layers.find((l) => l.name === 'objects')?.objects ?? [];
    const cases: [string, (m: TiledMap) => void, string][] = [
      ['walls без collides', (m) => { const w = m.layers.find((l) => l.name === 'walls'); if (w) w.properties = []; }, 'walls'],
      ['шар walls перейменовано', (m) => { const w = m.layers.find((l) => l.name === 'walls'); if (w) w.name = 'wall'; }, 'walls'],
      ['class замість type', (m) => { for (const o of objs(m)) { o.class = o.type ?? ''; delete o.type; } }, 'class'],
      ['прямокутник замість точки', (m) => { const o = objs(m)[0]; if (o) o.point = false; }, 'не точка'],
      ['зсув шару об\'єктів', (m) => { const g = m.layers.find((l) => l.name === 'objects'); if (g) g.offsetx = 56; }, 'зсув'],
      ['другий шар з collides', (m) => { m.layers.push({ name: 'rocks', type: 'tilelayer', properties: [{ name: 'collides', value: true }] }); }, 'rocks'],
      ['зсув шару walls (стіна наїжджає на точку появи)', (m) => { const w = m.layers.find((l) => l.name === 'walls'); if (w) w.offsetx = -64; }, 'walls: зсув'],
      ['паралакс шару walls', (m) => { const w = m.layers.find((l) => l.name === 'walls'); if (w) w.parallaxx = 0.5; }, 'паралакс'],
      ['walls у групі шарів', (m) => { const w = m.layers.find((l) => l.name === 'walls'); if (w) { m.layers = m.layers.filter((l) => l !== w); m.layers.push({ name: 'g', type: 'group', layers: [w] }); } }, 'групи'],
      ['чужий тайлсет', (m) => { m.tilesets?.push({ name: 'other' }); }, 'тайлсети'],
      ['тайлсет сцени прибрано з мапи', (m) => { m.tilesets = (m.tilesets ?? []).filter((t) => t.name !== 'camp-car'); }, 'тайлсети'],
      ['немає шару above', (m) => { m.layers = m.layers.filter((l) => l.name !== 'above'); }, 'above'],
      ['gid із бітом 0x10000000', (m) => { const w = m.layers.find((l) => l.name === 'walls'); if (w?.data) w.data[0] = (w.data[0] ?? 0) | 0x10000000; }, '0x10000000'],
      ['x шару walls (стара властивість Tiled)', (m) => { const w = m.layers.find((l) => l.name === 'walls'); if (w) w.x = 2; }, 'x/y'],
      ['невидимі стіни', (m) => { const w = m.layers.find((l) => l.name === 'walls'); if (w) w.visible = false; }, 'невидимий'],
    ];
    for (const [what, patch, mark] of cases) {
      const m = structuredClone(base);
      patch(m);
      expect(gameMapFormatProblems(m).join(' | '), what).toContain(mark);
    }
  });

  it('негативні контролі: чужий NPC, невідомий тригер, NPC локації без місця, чужа локація', () => {
    const base = mapOf('camp-lake.tmj');
    const objs = (m: TiledMap): TiledObject[] => m.layers.find((l) => l.name === 'objects')?.objects ?? [];
    const ghost = structuredClone(base); objs(ghost).push({ name: 'npc.ghost', type: 'npc' });
    expect(mapContentProblems(ghost, GAME_DEFS).join()).toContain('npc.ghost');
    const trig = structuredClone(base); objs(trig).push({ name: 'obj.nothing', type: 'trigger' });
    expect(mapContentProblems(trig, GAME_DEFS).join()).toContain('obj.nothing');
    const lost = structuredClone(base); const l = lost.layers.find((x) => x.name === 'objects'); if (l) l.objects = objs(lost).filter((o) => o.name !== 'npc.elise');
    expect(mapContentProblems(lost, GAME_DEFS).join()).toContain('npc.elise');
    const away = structuredClone(base); const p = away.properties?.find((x) => x.name === 'locationId'); if (p) p.value = 'loc.home';
    expect(mapContentProblems(away, GAME_DEFS).join()).toContain('живе в loc.camp.lake');
  });
});
