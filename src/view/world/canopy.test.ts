// GAME-210 · крони над героєм і плями світла. Кожен тест має мутацію, що його червонить (див. PR): bandOverHero `>`→`<`, глибина смуги в сцені, fade-ціль 1, плями-кількість, patchAlpha не гасне.
import { describe, expect, it } from 'vitest';
import { CANOPY_FADE_PER_S, CANOPY_UNDER, bandOverHero, nextCanopyAlpha } from './canopy';
import { MAX_DARKNESS } from './daylight';
import { findWindows, patchAlpha, patchQuads, type WindowSpot } from './light-patches';
import sceneSource from './scene.ts?raw';

const MAPS = import.meta.glob<string>('../../../public/maps/{home,shop,camp-lake}.tmj', { query: '?raw', import: 'default', eager: true });
const map = (name: string): { width: number; height: number; layers: { name: string; data?: number[] }[]; tilesets: { name: string; firstgid: number }[] } =>
  JSON.parse(Object.entries(MAPS).find(([k]) => k.endsWith(`/${name}.tmj`))?.[1] ?? 'null');

describe('крона над героєм (GAME-210)', () => {
  it('смуга з більшою глибиною за героя лежить НАД ним; з меншою чи рівною — під ним', () => {
    expect(bandOverHero(128, 100)).toBe(true);
    expect(bandOverHero(128, 140)).toBe(false);
    expect(bandOverHero(128, 128)).toBe(false);
  });

  it('сцена будує глибину смуг як (рядок основи + 1) × тайл і порівнює через bandOverHero (мутація: глибина смуги нижче героя — червоніє)', () => {
    expect(sceneSource).toMatch(/\(base \+ 1\) \* TILE : DEPTH\.always/);
    expect(sceneSource).toMatch(/bandOverHero\(b\.layer\.depth, this\.player\.depth\)/);
  });

  it('під кроною герой видно: прозорість іде до CANOPY_UNDER (<1), без перекриття — назад до 1', () => {
    let a = 1;
    for (let i = 0; i < 60; i++) a = nextCanopyAlpha(a, true, true, 1 / 60);
    expect(a).toBe(CANOPY_UNDER);
    expect(a).toBeLessThan(1);
    for (let i = 0; i < 60; i++) a = nextCanopyAlpha(a, true, false, 1 / 60);
    expect(a).toBe(1);
  });

  it('крона НЕ під героєм (смуга позаду нього) лишається непрозорою навіть при перекритті кадрів', () => {
    expect(nextCanopyAlpha(1, false, true, 1)).toBe(1);
  });

  it('рух плавний і покадровий: один кадр 16 мс не стрибає одразу в ціль', () => {
    const a = nextCanopyAlpha(1, true, true, 0.016);
    expect(a).toBeLessThan(1);
    expect(a).toBeGreaterThan(CANOPY_UNDER);
    expect(1 - a).toBeCloseTo(CANOPY_FADE_PER_S * 0.016 * (1 - CANOPY_UNDER), 10);
  });

  it('no-realtime: ні tween, ні таймерів реального часу в коді крон і плям', () => {
    for (const src of [sceneSource.slice(sceneSource.indexOf('private makePatches'), sceneSource.indexOf('Запекти шари')), ]) {
      expect(src).not.toMatch(/tweens|setTimeout|setInterval|Date\.now|performance\.now|time\.addEvent|delayedCall/);
    }
  });
});

describe('плями світла з вікон (GAME-210)', () => {
  const windowsOf = (name: string): ReturnType<typeof findWindows> => {
    const m = map(name);
    const above = m.layers.find((l) => l.name === 'above')?.data ?? [];
    const ts = m.tilesets.find((t) => t.name === 'home-windows-doors');
    return findWindows(above, m.width, m.height, ts?.firstgid ?? -1);
  };

  it('дім: чотири вікна (3,5,15,21 стовпці) у рядках 0–2 — плями лягають ВНИЗ від підвіконня', () => {
    const w = windowsOf('home');
    expect(w.map((x) => x.col)).toEqual([3, 5, 15, 21]);
    expect(w.every((x) => x.topRow === 0 && x.bottomRow === 2)).toBe(true);
    const q = patchQuads(w[0] as WindowSpot, map('home').height, 32);
    expect(q.length).toBeGreaterThanOrEqual(3);
    expect(Math.min(...q.flatMap((c) => c.pts.map((p) => p[1])))).toBe(96);   // підвіконня — низ рядка 2
    expect(Math.max(...q.flatMap((c) => c.pts.map((p) => p[1])))).toBeGreaterThan(96);
  });

  it('крамниця: два вікна в південній стіні (стовпці 2 і 10) — плями лягають УГОРУ на підлогу', () => {
    const w = windowsOf('shop');
    expect(w.map((x) => x.col)).toEqual([2, 10]);
    const q = patchQuads(w[0] as WindowSpot, map('shop').height, 32);
    expect(Math.max(...q.flatMap((c) => c.pts.map((p) => p[1])))).toBe(320);   // верх вікна — рядок 10
    expect(Math.min(...q.flatMap((c) => c.pts.map((p) => p[1])))).toBeLessThan(320);
  });

  it('у таборі вікон нема — плям нема', () => {
    expect(windowsOf('camp-lake')).toEqual([]);
  });

  it('світло з вікон: вдень повне, вночі нуль, у сутінках між ними', () => {
    expect(patchAlpha(0, MAX_DARKNESS)).toBe(1);
    expect(patchAlpha(MAX_DARKNESS, MAX_DARKNESS)).toBe(0);
    const mid = patchAlpha(MAX_DARKNESS / 2, MAX_DARKNESS);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });

  it('плями малюються один раз у текстуру, а не щокадру: makePatches викликається лише з enterMap, не з update', () => {
    const upd = sceneSource.slice(sceneSource.indexOf('override update('));
    expect(upd).not.toMatch(/makePatches|fillPoints|addDynamicTexture/);
    expect(sceneSource).toMatch(/this\.makePatches\(key, map\)/);
  });
});
