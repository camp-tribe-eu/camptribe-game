// GAME-32 · мапа сцени ↔ контент. Валідатор мап доводить «досяжно пішки», але не знає, ЩО стоїть на
// мапі (docs/MAP-VALIDATOR.md, «Чого не перевіряє»). Тут друга половина:
//  1) мапа, яку вантажить сцена, лежить у теці під валідатором мап (npm run validate);
//  2) кожен NPC на мапі — NPC контенту, кожен тригер — взаємодія каталогу;
//  3) кожен NPC локації мапи (locationId) має своє місце на мапі — інакше з ним не заговорити пішки.
import { describe, expect, it } from 'vitest';
import pkg from '../../../package.json';
import sceneSource from './scene.ts?raw';
import type { CoreDefs } from '../../core/defs';
import { GAME_DEFS } from '../../content/slice-defs';

interface TiledObject { name: string; type?: string; class?: string }
interface TiledMap { properties?: { name: string; value: unknown }[]; layers: { name: string; type: string; objects?: TiledObject[] }[] }


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
  for (const t of objects.filter((o) => typeOf(o) === 'trigger')) if (!defs.interactions[t.name]) out.push(`тригер ${t.name} — немає серед взаємодій каталогу`);
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
    for (const p of loaded) expect(p).toMatch(/^maps\/[^/]+\.tmj$/);
    for (const p of loaded) expect(MAPS).toContain(p?.replace('maps/', ''));
    const validate = (pkg as { scripts: Record<string, string> }).scripts.validate ?? '';
    expect(validate).toContain('validate-maps.mjs --dir public/maps');
  });

  for (const f of MAPS) {
    it(`${f}: NPC і тригери — з контенту, кожен NPC локації — на мапі`, () => {
      expect(mapContentProblems(mapOf(f), GAME_DEFS)).toEqual([]);
    });
  }

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
