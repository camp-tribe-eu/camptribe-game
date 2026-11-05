// GAME-250 · модель першої сторінки Атласу: «Ви тут», перша мета з запискою, ≤5 силуетів, пояснення ≤20 слів, кнопка за режимом. Закон 1: мутація (див. mutation-checked нижче).
import { describe, expect, it } from 'vitest';
import uk from '../i18n/uk.json';
import { MAX_AHEAD, atlasMapModel } from './atlas-model';
import type { OfferAtlas } from './story-types';
import atlasSrc from './Atlas.tsx?raw';

const atlas = (done: boolean): OfferAtlas => ({
  pages: [{ id: 'ch1', titleKey: 'atlas.title', have: done ? 12 : 1, total: 12, pct: 8, done, reward: { xp: 20, om: 5 } }], fillPct: 8,
  slots: [], total: 12, count: 1, photos: { photos: [], taken: 0, total: 3 }, henry: { traces: [], found: 0, total: 0, postcard: false },
});
const L = uk as Record<string, string>;
const words = (s: string): number => s.trim().split(/\s+/).length;

describe('модель сторінки Атласу', () => {
  it('«Дім» — тут; озеро — перша мета з запискою; решта — силуети', () => {
    const m = atlasMapModel(atlas(false), 'intro');
    expect(m.here).toMatchObject({ id: 'home', state: 'here' });
    expect(m.first).toMatchObject({ id: 'lake', state: 'first', noteKey: 'atlas.note.lake' });
    expect(m.places.filter((p) => p.state === 'first')).toHaveLength(1);
    expect(L[m.first.noteKey as string]).toBeTruthy();
    expect(m.ahead.length).toBeGreaterThanOrEqual(1);
    expect(m.ahead.every((p) => p.state === 'ahead' && p.noteKey === null)).toBe(true);
  });
  it('силуетів попереду не більше п’яти і всі мають назву', () => {
    const m = atlasMapModel(atlas(false), 'menu');
    expect(m.ahead.length).toBeLessThanOrEqual(MAX_AHEAD);
    for (const p of m.places) expect(L[p.nameKey], p.id).toBeTruthy();
  });
  it('одне речення пояснення — до 20 слів; легенда й «що дає» на місці', () => {
    const m = atlasMapModel(atlas(false), 'intro');
    expect(words(L[m.sentenceKey] as string)).toBeLessThanOrEqual(20);
    expect(m.gains.map((g) => g.id)).toEqual(['stamps', 'memories', 'routes']);
    expect(L[m.legendKey]).toBeTruthy();
  });
  it('кнопка дії одна: у вступі — планування, з меню — «Закрити»', () => {
    expect(L[atlasMapModel(atlas(false), 'intro').ctaKey]).toBe('Спланувати першу поїздку');
    expect(L[atlasMapModel(atlas(false), 'menu').ctaKey]).toBe('Закрити');
    expect((atlasSrc.match(/data-ui="atlas-cta"/g) ?? []).length).toBe(1);   // у мапі її немає — лише дитина компонента (меню)
  });
  it('коли сторінка має печатку — озеро «з печаткою», а не «перша мета»', () => {
    const m = atlasMapModel(atlas(true), 'menu');
    expect(m.first.state).toBe('stamped');
    expect(m.stamps).toBe(1);
  });
});
