// GAME-200 · заповнення Атласу: відсоток по сторінці, нагорода за повну сторінку раз за ключ — і лише за повну.
// Закон 1: сторож «нагорода без заповнення» мусить уміти почервоніти — мутант `complete = () => true` (нагорода без заповнення) ловиться тим самим сторожем.
import { describe, expect, it } from 'vitest';
import { atlasAwards, pageComplete, pageFill, type AtlasPageRule } from './atlas-fill';
import { progressOf } from './progress';
import { stickersOf } from './stickers';
import { newSim, step, type SimState } from './sim';
import { GAME_DEFS } from '../content/slice-defs';
import { ATLAS_PAGES, STICKER_META } from '../content/stickers';
import { PROLOGUE_BIKE, SEED, START_MONEY } from '../content/replay.scenario';
import { atlasOffer } from '../view/story-offer';

const PAGE: AtlasPageRule = { id: 't', stickers: ['a', 'b', 'c', 'd'], xp: 20, om: 5 };
const full = (): SimState => PROLOGUE_BIKE.reduce((s, i) => step(s, i, { defs: GAME_DEFS }), newSim(SEED, START_MONEY));

/** Сторож: для кожного неповного набору нагород бути не повинно. Повертає порушення (порожньо — сторож зелений). */
function rewardGuard(awards: typeof atlasAwards, complete?: Parameters<typeof atlasAwards>[2]): string[] {
  const bad: string[] = [];
  for (let n = 0; n < PAGE.stickers.length; n++) {
    const have = PAGE.stickers.slice(0, n);
    if (awards(have, [PAGE], complete).length > 0) bad.push(`нагорода при ${n}/${PAGE.stickers.length}`);
  }
  return bad;
}

describe('Атлас: відсоток заповнення', () => {
  it('рахує відсоток, не округлює вгору до 100, ігнорує чужі наклейки', () => {
    expect(pageFill([], PAGE.stickers)).toEqual({ have: 0, total: 4, pct: 0 });
    expect(pageFill(['a'], PAGE.stickers)).toEqual({ have: 1, total: 4, pct: 25 });
    expect(pageFill(['a', 'b', 'x'], PAGE.stickers)).toEqual({ have: 2, total: 4, pct: 50 });
    expect(pageFill(['a', 'b', 'c'], ['a', 'b', 'c', 'd', 'e', 'f'])).toEqual({ have: 3, total: 6, pct: 50 });
    expect(pageFill(Array.from({ length: 2 }, () => 'a'), Array.from({ length: 3 }, (_, i) => `s${i}`)).pct).toBe(0);
    expect(pageFill(['s0', 's1'], ['s0', 's1', 's2']).pct).toBe(66);
    expect(pageFill(PAGE.stickers, PAGE.stickers).pct).toBe(100);
    expect(pageFill(['a'], []).pct).toBe(0);
  });
  it('порожня сторінка не «повна»', () => { expect(pageComplete([], [])).toBe(false); });
  it('нагорода — лише за повну сторінку, з ключем atlas:<id>', () => {
    expect(atlasAwards(PAGE.stickers.slice(0, 3), [PAGE])).toEqual([]);
    expect(atlasAwards(PAGE.stickers, [PAGE])).toEqual([{ key: 'atlas:t', xp: 20, om: 5 }]);
    expect(atlasAwards(undefined, [PAGE])).toEqual([]);
    expect(atlasAwards(PAGE.stickers, undefined)).toEqual([]);
  });
});

describe('Атлас: контент і ядро', () => {
  it('сторінка ch1 — наклейки з stickers.json (крім листівки Генрі), усі існують', () => {
    const ids = STICKER_META.map((m) => m.id);
    const ch1 = ATLAS_PAGES.find((p) => p.id === 'ch1');
    expect(ch1?.stickers.length).toBeGreaterThan(0);
    for (const s of ch1?.stickers ?? []) expect(ids).toContain(s);
    expect(ch1?.stickers).not.toContain('sticker.henry-postcard');
  });
  it('повний прохід Прологу: нагорода atlas:ch1 є рівно тоді, коли ВСІ наклейки сторінки отримано', () => {
    const g = full().game;
    const have = stickersOf(g);
    const ch1 = ATLAS_PAGES[0] as AtlasPageRule;
    const owns = ch1.stickers.every((x) => have.includes(x));
    expect(progressOf(g).keys.includes('atlas:ch1')).toBe(owns);
    expect(owns).toBe(false);   // Пролог без прохань сусідів не заповнює сторінку (контроль: тест не тривіальний)
  });
  it('через dispatch: неповна сторінка нагороди не дає, повна — раз', () => {
    const base = full().game;
    const two = { ...GAME_DEFS, atlasPages: [{ id: 'x', stickers: ['sticker.home', 'sticker.plan'], xp: 7, om: 0 }, { id: 'y', stickers: ['sticker.home', 'sticker.fire', 'sticker.radio'], xp: 9, om: 0 }] };
    const g = PROLOGUE_BIKE.reduce((st, i) => step(st, i, { defs: two }), newSim(SEED, START_MONEY)).game;
    const keys = progressOf(g).keys;
    expect(stickersOf(g)).toEqual(expect.arrayContaining(['sticker.home', 'sticker.plan', 'sticker.fire']));
    expect(stickersOf(g)).not.toContain('sticker.radio');
    expect(keys).toContain('atlas:x');          // обидві наклейки є → видано
    expect(keys).not.toContain('atlas:y');      // radio немає → не видано
    expect(progressOf(g).xp - progressOf(base).xp).toBe(7);   // рівно раз: +7, не +16 і не +14
  });
  it('офер Атласу: сторінки з відсотком і загальний відсоток узгоджені з наклейками й слідами', () => {
    const a = atlasOffer(full().game);
    const ch1 = a.pages.find((p) => p.id === 'ch1');
    expect(ch1?.total).toBe((ATLAS_PAGES[0] as AtlasPageRule).stickers.length);
    expect(ch1?.pct).toBe(Math.floor(((ch1?.have ?? 0) * 100) / (ch1?.total ?? 1)));
    expect(ch1?.done).toBe(false);
    expect(a.pages.map((p) => p.id)).toEqual(['ch1', 'henry']);
    const tot = a.pages.reduce((x, p) => x + p.total, 0);
    const have = a.pages.reduce((x, p) => x + p.have, 0);
    expect(a.fillPct).toBe(Math.floor((have * 100) / tot));
  });
});

describe('мутація «нагорода без заповнення» (закон 1)', () => {
  it('справжній код — зелений: 0 порушень', () => { expect(rewardGuard(atlasAwards)).toEqual([]); });
  it('мутант complete = () => true — ЧЕРВОНИЙ: сторож бачить нагороду на кожній неповній сторінці', () => {
    const bad = rewardGuard(atlasAwards, () => true);
    expect(bad.length).toBe(PAGE.stickers.length);
  });
  it('мутант complete = some (одна наклейка досить) — ЧЕРВОНИЙ', () => {
    expect(rewardGuard(atlasAwards, (h, s) => s.some((x) => h.includes(x))).length).toBeGreaterThan(0);
  });
});
