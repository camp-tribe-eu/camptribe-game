// GAME-32 · мапа сцени ↔ контент. Валідатор мап доводить «досяжно пішки», але не знає, ЩО стоїть на
// мапі (docs/MAP-VALIDATOR.md, «Чого не перевіряє»). Тут друга половина:
//  1) мапа, яку вантажить сцена, лежить у теці під валідатором мап (npm run validate);
//  2) кожен NPC на мапі — NPC контенту, кожен тригер — взаємодія каталогу;
//  3) кожен NPC локації мапи (locationId) має своє місце на мапі — інакше з ним не заговорити пішки.
import { describe, expect, it } from 'vitest';
import pkg from '../../../package.json';
import sceneSource from './scene.ts?raw';
import { MAP_TILESETS, TILESET_IMAGES } from './art';
import { MAP_LOCATION, MAP_SPOTS, isMapFirstSpot, type MapKey } from '../../content/map-first';

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
export function gameMapFormatProblems(map: TiledMap, key: MapKey = 'camp'): string[] {
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
  // Тайлсети — рівно ті, що сцена реєструє для цієї мапи (art.ts MAP_TILESETS, GAME-93/175): тайли тайлсету, якого сцена не знає, не малюються, але стіни з них колізять.
  const names = (map.tilesets ?? []).map((t) => t.name ?? '').sort().join(',');
  const expected = [...MAP_TILESETS[key]].sort().join(',');
  if (names !== expected) out.push(`тайлсети мапи [${names}] ≠ тайлсети сцени [${expected}]`);
  for (const n of MAP_TILESETS[key]) if (!Object.hasOwn(TILESET_IMAGES, n)) out.push(`тайлсет ${n} є в MAP_TILESETS, але не має картинки в TILESET_IMAGES`);
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
  // Шар `layout` (GAME-146: розкладка інтер'єру для валідатора мап) сцена не читає — він дозволений поруч із `objects`.
  const groups = layers.filter((l) => l.type === 'objectgroup' && l.name !== 'layout');
  if (groups.length !== 1 || groups[0]?.name !== 'objects') out.push('потрібен рівно один шар об\'єктів objects');
  for (const g of groups) {
    for (const o of g.objects ?? []) {
      if (!o.type) out.push(`${o.name}: тип у class без type — Phaser 4 його не копіює, сцена об'єкта не побачить`);
      if (o.point !== true || o.gid !== undefined) out.push(`${o.name}: не точка — сцена й валідатор беруть різні точки прив'язки`);
    }
  }
  return out;
}


export function mapContentProblems(map: TiledMap, defs: CoreDefs, key: MapKey = 'camp'): string[] {
  const st = defs.story;
  if (!st) return ['no story'];
  const out: string[] = [];
  const loc = map.properties?.find((p) => p.name === 'locationId')?.value;
  if (typeof loc !== 'string' || !st.locations[loc]) out.push(`locationId ${String(loc)} не з контенту`);
  if (loc !== MAP_LOCATION[key]) out.push(`locationId ${String(loc)} ≠ локація мапи ${key} (${MAP_LOCATION[key]}) у map-first.ts`);
  const objects = map.layers.find((l) => l.type === 'objectgroup' && l.name === 'objects')?.objects ?? [];
  const typeOf = (o: TiledObject): string => o.type || o.class || '';
  const npcs = objects.filter((o) => typeOf(o) === 'npc').map((o) => o.name);
  for (const n of npcs) if (!st.npcs[n]) out.push(`NPC ${n} — немає в content/npcs.json`);
  for (const n of npcs) if (st.npcs[n] && st.npcs[n]?.locationId !== loc) out.push(`NPC ${n} живе в ${st.npcs[n]?.locationId}, а мапа — ${String(loc)}`);
  // Тригер — взаємодія каталогу або ціль справи хвилі task.<id> (GAME-170 зріз 2): справа з content/waves.json, інакше дотик нікуди не веде.
  const taskIds = new Set(Object.values(defs.waves?.waves ?? {}).flatMap((w) => w.tasks.map((t) => `task.${t.id}`)));
  for (const t of objects.filter((o) => typeOf(o) === 'trigger')) if (!defs.interactions[t.name] && !taskIds.has(t.name) && !isMapFirstSpot(t.name)) out.push(`тригер ${t.name} — немає серед взаємодій каталогу, справ хвиль і об'єктів зрізу 1 (map-first.ts)`);
  // Дім і крамниця: список об'єктів у map-first.ts (MAP_SPOTS) і в .tmj — той самий, без зайвих і без загублених (сюжет знає лише їх).
  if (key !== 'camp') {
    const onMap = objects.filter((o) => typeOf(o) === 'trigger' || typeOf(o) === 'npc').map((o) => o.name).sort();
    const known: string[] = [...MAP_SPOTS[key]].sort();
    for (const n of known) if (!onMap.includes(n)) out.push(`об'єкт ${n} із MAP_SPOTS.${key} немає на мапі`);
    for (const n of onMap) if (!known.includes(n)) out.push(`об'єкт ${n} на мапі ${key} не описано в MAP_SPOTS`);
  }
  for (const [id, n] of Object.entries(st.npcs)) if (n.locationId === loc && !npcs.includes(id)) out.push(`NPC ${id} локації ${String(loc)} не має місця на мапі`);
  return out;
}

const RAW = import.meta.glob<string>('../../../public/maps/*.tmj', { query: '?raw', import: 'default', eager: true });
const byName = new Map(Object.entries(RAW).map(([k, v]) => [k.replace(/^.*\//, ''), v] as const));
const MAPS = [...byName.keys()].sort();
const mapOf = (f: string): TiledMap => JSON.parse(byName.get(f) ?? 'null') as TiledMap;
/** Файл мапи → ключ сцени. Нова мапа в public/maps/ без рядка тут — червоний тест: сцена не знає, що з нею робити. */
const KEY_OF: Readonly<Record<string, MapKey>> = { 'camp-lake.tmj': 'camp', 'home.tmj': 'home', 'shop.tmj': 'shop' };
const keyOf = (f: string): MapKey => { const k = KEY_OF[f]; if (!k) throw new Error(`public/maps/${f}: мапа без ключа сцени (KEY_OF у map-content.test.ts, scene.ts, map-first.ts)`); return k; };

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
      expect(mapContentProblems(mapOf(f), GAME_DEFS, keyOf(f))).toEqual([]);
    });
    it(`${f}: формат, який сцена читає так само, як валідатор мап`, () => {
      expect(gameMapFormatProblems(mapOf(f), keyOf(f))).toEqual([]);
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

  it('GAME-175 · дім і крамниця: об\'єкти мапи = MAP_SPOTS, локація, тайлсети — негативні контролі', () => {
    const objs = (m: TiledMap): TiledObject[] => m.layers.find((l) => l.name === 'objects')?.objects ?? [];
    for (const [file, key] of [['home.tmj', 'home'], ['shop.tmj', 'shop']] as const) {
      const base = mapOf(file);
      expect(mapContentProblems(base, GAME_DEFS, key), file).toEqual([]);
      const lost = structuredClone(base); const l = lost.layers.find((x) => x.name === 'objects'); if (l) l.objects = objs(lost).filter((o) => o.name !== 'obj.vehicle');
      expect(mapContentProblems(lost, GAME_DEFS, key).join(), `${file}: загублено obj.vehicle`).toContain('obj.vehicle');
      const extra = structuredClone(base); objs(extra).push({ name: 'step.ST-999', type: 'trigger' });
      expect(mapContentProblems(extra, GAME_DEFS, key).join(), `${file}: зайвий об'єкт`).toContain('step.ST-999');
      const away = structuredClone(base); const p = away.properties?.find((x) => x.name === 'locationId'); if (p) p.value = 'loc.camp.lake';
      expect(mapContentProblems(away, GAME_DEFS, key).join(), `${file}: чужа локація`).toContain('локація мапи');
      const thin = structuredClone(base); thin.tilesets = (thin.tilesets ?? []).filter((t) => t.name !== 'home-shelf');
      expect(gameMapFormatProblems(thin, key).join(), `${file}: тайлсет прибрано`).toContain('тайлсети');
    }
    // Мапа дому без `layout` не плутається, а `layout` поруч з `objects` — дозволений; другий шар об'єктів — ні.
    const dup = structuredClone(mapOf('home.tmj')); dup.layers.push({ name: 'objects2', type: 'objectgroup', objects: [] });
    expect(gameMapFormatProblems(dup, 'home').join()).toContain('objects');
  });
});
