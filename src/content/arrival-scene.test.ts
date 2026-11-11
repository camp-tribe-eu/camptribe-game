/// <reference types="node" />
// GAME-310 · сторож: оголошені факти сцен і те, що шле стартер, — одне й те саме, і сцени справді є в контенті.
// Закон 1: мутація (зайвий факт у JSON, факт не з того набору) червоніє — тексти в описі PR.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ARRIVAL_SCENE, ARRIVAL_SCENE_FACTS, SCRAPE_SCENE, SCRAPE_SCENE_FACTS, arrivalFacts, outcomeOfScrapes, scrapeFacts, startArrival, startScrape } from './arrival-scene';
import { ARRIVAL_TIMES, arrivalFlag } from './arrival-pitch';
import { SCRAPES_OK_MAX, driveFlag } from './drive-in';

interface SceneFile { readonly id: string; readonly scene?: { readonly facts?: readonly string[]; readonly atQuest?: string }; readonly nodes: readonly { readonly id: string }[] }
const scene = (file: string): SceneFile => JSON.parse(readFileSync(new URL(`../../content/dialogue/${file}.json`, import.meta.url), 'utf8')) as SceneFile;

describe('GAME-310 · стартери сцен приїзду', () => {
  it('факти сцени приїзду збігаються з JSON, і стартер шле рівно один — справжній', () => {
    const file = scene('camp-arrival');
    expect(file.id).toBe(ARRIVAL_SCENE);
    expect(file.scene?.facts).toEqual([...ARRIVAL_SCENE_FACTS]);
    expect(file.scene?.atQuest).toBe('ST-005');
    for (const t of ARRIVAL_TIMES) {
      expect(arrivalFacts([arrivalFlag(t)])).toEqual([arrivalFlag(t)]);
      expect((ARRIVAL_SCENE_FACTS as readonly string[]).includes(arrivalFlag(t))).toBe(true);
    }
    expect(arrivalFacts([]), 'дороги не грали — сцена каже «вчасно», а не мовчить').toEqual([arrivalFlag('ontime')]);
    const cmd = startArrival('c310-1', [arrivalFlag('late')]);
    expect(cmd).toEqual({ type: 'StartScene', commandId: 'c310-1', sceneId: ARRIVAL_SCENE, facts: [arrivalFlag('late')] });
  });

  it('факти сцени сусіда збігаються з JSON і йдуть від зачепів, а не від настрою', () => {
    const file = scene('camp-scrape');
    expect(file.id).toBe(SCRAPE_SCENE);
    expect(file.scene?.facts).toEqual([...SCRAPE_SCENE_FACTS]);
    expect(scrapeFacts({ scrapes: 0 })).toEqual([driveFlag('good')]);
    expect(scrapeFacts({ scrapes: SCRAPES_OK_MAX })).toEqual([driveFlag('ok')]);
    expect(scrapeFacts({ scrapes: SCRAPES_OK_MAX + 1 })).toEqual([driveFlag('rough')]);
    expect(outcomeOfScrapes(7)).toBe('rough');
    expect(startScrape('c310-2', { scrapes: 1 })).toEqual({ type: 'StartScene', commandId: 'c310-2', sceneId: SCRAPE_SCENE, facts: [driveFlag('ok')] });
  });

  it('у кожної сцени є вузли й кінець, і обидві належать приїздові в табір', () => {
    for (const f of ['camp-arrival', 'camp-scrape']) {
      const file = scene(f);
      expect(file.nodes.length, `${f}: порожня сцена`).toBeGreaterThan(3);
      expect(file.scene?.atQuest).toBe('ST-005');
    }
  });
});
