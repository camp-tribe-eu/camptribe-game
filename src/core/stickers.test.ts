// GAME-182 · наклейки Атласу: ядро видає їх за умовами content/stickers.json, раз і назавжди; старий сейв отримує те, що вже правдиве; сторінка має 12 слотів.
// Закон 1: мутації в кінці файлу — вимкнена умова (видає всі одразу), видача без повтору-захисту, зіпсований порядок у сейві.
import { describe, expect, it } from 'vitest';
import { dispatch } from './commands';
import { fromSave, serialize } from './save';
import { newSim, step, type SimState } from './sim';
import { backfillStickers, grantStickers, stickerHolds, stickersOf, STICKER_SLOTS, type StickerDefs } from './stickers';
import { GAME_DEFS } from '../content/slice-defs';
import { STICKER_DEFS, STICKER_META } from '../content/stickers';
import { STORY } from '../content/story';
import { atlasOffer } from '../view/story-offer';
import { PROLOGUE_BIKE, SEED, START_MONEY } from '../content/replay.scenario';
import stickersJson from '../../content/stickers.json';
import uk from '../../content/locales/uk.json';
import en from '../../content/locales/en.json';
import { STICKER_SLOTS as VALIDATOR_SLOTS } from '../../scripts/validator/codes.mjs';

const OPTS = { story: STORY, stickers: STICKER_DEFS };
const upTo = (n: number): SimState => PROLOGUE_BIKE.slice(0, n).reduce((s, i) => step(s, i, { defs: GAME_DEFS }), newSim(SEED, START_MONEY));
const created = (): SimState => upTo(PROLOGUE_BIKE.findIndex((i) => i.kind === 'command') + 1);
const full = (): SimState => upTo(PROLOGUE_BIKE.length);

describe('наклейки: видача за умовою', () => {
  it('до персонажа — жодної; з персонажем — лише «Дім» (старт-квест активний)', () => {
    const s0 = upTo(PROLOGUE_BIKE.findIndex((i) => i.kind === 'command'));
    expect(stickersOf(s0.game)).toEqual([]);
    expect(stickersOf(created().game)).toEqual(['sticker.home']);
  });
  it('повний прохід розділу: усі наклейки, чиї умови правдиві, — відсортовані, без повторів; інші не видано', () => {
    const g = full().game;
    const have = stickersOf(g);
    expect([...have]).toEqual([...new Set(have)].sort());
    for (const [id, d] of Object.entries(STICKER_DEFS)) expect(have.includes(id), id).toBe(stickerHolds(d.cond, g));
    expect(have).toContain('sticker.home');
    expect(have).toContain('sticker.fire');
    expect(have.length).toBeGreaterThanOrEqual(5);
  });
  it('наклейка не зникає, коли умова перестає бути правдивою (старт-квест уже не active)', () => {
    const g = full().game;
    expect(g.quests['PROLOGUE-HOME-001']?.status).toBe('completed');
    expect(stickersOf(g)).toContain('sticker.home');
  });
  it('повтор нічого не дає: той самий стан — той самий масив (посилання), нова команда не дублює', () => {
    const g = created().game;
    expect(grantStickers(g.stickers, STICKER_DEFS, g)).toBe(g.stickers);
    const r = dispatch(g, { type: 'CompleteQuest', commandId: 'zz1', questId: 'PROLOGUE-HOME-001' }, GAME_DEFS);
    expect(r.ok).toBe(true);
    if (r.ok) expect(stickersOf(r.state).filter((x) => x === 'sticker.home')).toHaveLength(1);
  });
  it('умова не виконана — наклейки немає (контроль: прапорець, якого немає)', () => {
    const g = created().game;
    const defs: StickerDefs = { 'sticker.x': { cond: { flag: 'f.nope' } }, 'sticker.y': { cond: { notFlag: 'f.nope' } }, 'sticker.z': { cond: { all: [{ flag: 'f.nope' }, { notFlag: 'f.nope' }] } } };
    expect(grantStickers(undefined, defs, g)).toEqual(['sticker.y']);
    expect(grantStickers(undefined, { a: { cond: { transport: 'transport.bike' } as never } }, g)).toBeUndefined();   // вид умови, якого наклейки не знають, — завжди хибний
  });
  it('без персонажа ядро нічого не видає (навіть безумовне)', () => {
    const g = upTo(0).game;
    expect(grantStickers(undefined, { a: { cond: { notFlag: 'f.nope' } } }, g)).toBeUndefined();
  });
});

describe('наклейки: сейв', () => {
  it('сейв із наклейками читається так само', () => {
    const s = full();
    const r = fromSave(serialize(s), OPTS);
    expect(r.ok && stickersOf(r.sim.game)).toEqual(stickersOf(s.game));
  });
  it('старий сейв без поля: стає тим, що вже правдиве; повторне завантаження нічого не змінює', () => {
    const s = full();
    const old = { ...s, game: { ...s.game } };
    delete (old.game as { stickers?: unknown }).stickers;
    const r = fromSave(serialize(old), OPTS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(stickersOf(r.sim.game)).toEqual(stickersOf(s.game));
    expect(backfillStickers(r.sim.game, STICKER_DEFS)).toBe(r.sim.game);
    // без каталогу (старі виклики) поле просто лишається порожнім — гра не падає
    const bare = fromSave(serialize(old), { story: STORY });
    expect(bare.ok && stickersOf(bare.sim.game)).toEqual([]);
  });
  it('новий сейв без персонажа лишається без поля', () => {
    const r = fromSave(serialize(upTo(0)), OPTS);
    expect(r.ok && r.sim.game.stickers).toBeUndefined();
  });
  it('зіпсований перелік у сейві відхиляється (SAVE_SHAPE)', () => {
    const s = full();
    for (const bad of [['b', 'a'], ['a', 'a'], [1], 'x']) {
      const r = fromSave(serialize({ ...s, game: { ...s.game, stickers: bad as never } }), OPTS);
      expect(r.ok, JSON.stringify(bad)).toBe(false);
      if (!r.ok) expect(r.code).toBe('SAVE_SHAPE');
    }
  });
});

describe('наклейки: контент і сторінка Атласу', () => {
  it('12 слотів — і в ядрі, і в валідаторі; наклейок не більше', () => {
    expect(STICKER_SLOTS).toBe(12);
    expect(VALIDATOR_SLOTS).toBe(STICKER_SLOTS);
    expect(STICKER_META.length).toBeLessThanOrEqual(STICKER_SLOTS);
    expect(STICKER_META.length).toBeGreaterThanOrEqual(5);   // «Дім» + щонайменше чотири наклейки розділу 1
  });
  it('кожна наклейка має умову й текст uk і en', () => {
    for (const s of stickersJson as { id: string; nameKey: string; textKey: string; cond?: unknown }[]) {
      expect(s.cond, s.id).toBeTruthy();
      for (const k of [s.nameKey, s.textKey]) {
        expect((uk as Record<string, string>)[k], `uk ${k}`).toBeTruthy();
        expect((en as Record<string, string>)[k], `en ${k}`).toBeTruthy();
      }
    }
  });
  it('знімок Атласу: слоти в порядку контенту, отримані — owned, лічильник збігається', () => {
    const a = atlasOffer(created().game);
    expect(a.total).toBe(12);
    expect(a.slots.map((x) => x.id)).toEqual(STICKER_META.map((x) => x.id));
    expect(a.slots.filter((x) => x.owned).map((x) => x.id)).toEqual(['sticker.home']);
    expect(a.count).toBe(1);
    expect(atlasOffer(upTo(0).game).count).toBe(0);
  });
});
