import { describe, expect, it } from 'vitest';
import { GAME_DEFS } from '../content/slice-defs';
import events from '../../content/events.json';
import quests from '../../content/quests.json';
import { explainXp, euros, grantCentsMap, isEmptySum, mergeSums, NO_REWARD, POP_FRAMES, rewardDelta, STICKER_MIN, stickerAt, stickerLive, stickerParts, stickerPlace, type CoreSnap, type RawRewardRow } from './reward-sticker';

const snap = (o: Partial<CoreSnap> = {}): CoreSnap => ({ xp: 0, om: 0, skills: {}, grants: [], ...o });
const L = { xp: 'XP', om: 'ОМ', skill: (id: string) => id.replace('skill.', '') };

describe('GAME-247 · модель наклейки нагороди', () => {
  it('приріст = різниця знімків ядра; нова нагорода дає рівно свої moneyCents', () => {
    const d = rewardDelta(snap({ xp: 10, om: 5, skills: { 'skill.camping': 4 } }), snap({ xp: 25, om: 5, skills: { 'skill.camping': 7, 'skill.cooking': 2 }, grants: ['g.a'] }), { 'g.a': 500 });
    expect(d).toEqual({ cents: 500, xp: 15, om: 0, skills: { 'skill.camping': 3, 'skill.cooking': 2 } });
  });
  it('стара нагорода, зменшення й невідомий grantId — нічого', () => {
    expect(isEmptySum(rewardDelta(snap({ xp: 9, grants: ['g.a'] }), snap({ xp: 3, grants: ['g.a', 'g.x'] }), { 'g.a': 500 }))).toBe(true);
  });
  it('кожна нагорода з визначень гри віддає в моделі точну суму', () => {
    const cents: Record<string, number> = {};
    for (const d of Object.values(GAME_DEFS.interactions)) cents[d.grantId] = d.moneyCents;
    for (const q of Object.values(GAME_DEFS.story?.quests ?? {})) if (q.reward) cents[q.reward.grantId] = q.reward.moneyCents;
    expect(Object.keys(cents).length).toBeGreaterThan(0);
    for (const [g, c] of Object.entries(cents)) expect(rewardDelta(snap(), snap({ grants: [g] }), cents).cents, g).toBe(c);
  });
  it('злиття складає, а не губить; текст і порядок стабільні', () => {
    const m = mergeSums({ cents: 500, xp: 5, om: 0, skills: { 'skill.camping': 2 } }, { cents: 250, xp: 10, om: 3, skills: { 'skill.camping': 1, 'skill.cooking': 5 } });
    expect(m).toEqual({ cents: 750, xp: 15, om: 3, skills: { 'skill.camping': 3, 'skill.cooking': 5 } });
    expect(stickerParts(m, L).map((p) => p.text)).toEqual(['+7,50 €', '+15 XP', '+3 ОМ', '+5 cooking', '+3 camping']);
    expect(mergeSums(NO_REWARD, NO_REWARD)).toEqual(NO_REWARD);
  });
  it('євро: цілі без копійок', () => { expect(euros(500)).toBe('5'); expect(euros(250)).toBe('2,50'); });
});

/** Усе, що в об'єкті-дереві схоже на нагороду з грошима: { grantId, moneyCents | money > 0 }. Обходить ВСІ визначення, а не список місць — нове джерело ловиться само. */
function moneyGrants(node: unknown, out: Map<string, number> = new Map()): Map<string, number> {
  if (Array.isArray(node)) { for (const x of node) moneyGrants(x, out); return out; }
  if (node === null || typeof node !== 'object') return out;
  const o = node as Record<string, unknown>;
  const cents = typeof o.moneyCents === 'number' ? o.moneyCents : typeof o.money === 'number' ? o.money : 0;
  if (typeof o.grantId === 'string' && cents > 0) out.set(o.grantId, cents);
  for (const v of Object.values(o)) moneyGrants(v, out);
  return out;
}

describe('GAME-277 · карта grantId → центи з усіх джерел контенту', () => {
  const map = grantCentsMap(GAME_DEFS, events as readonly RawRewardRow[]);
  it('кожен grantId із грошима в контенті (визначення гри, quests.json, events.json) є в карті з точною сумою', () => {
    const found = moneyGrants([GAME_DEFS, quests, events]);
    expect(found.size, 'у контенті є нагороди з грошима (інакше звірка порожня)').toBeGreaterThan(0);
    for (const [g, c] of found) expect(map[g], g).toBe(c);
  });
  it('джерела по одному: подія контенту з грошима, квест і взаємодія дають свою суму', () => {
    const ev = grantCentsMap({ interactions: {} }, [{ reward: { grantId: 'rw.ev-x', money: 700 } }]);
    expect(ev).toEqual({ 'rw.ev-x': 700 });
    expect(grantCentsMap({ interactions: { 'obj.a': { grantId: 'rw.a', moneyCents: 250 } } })).toEqual({ 'rw.a': 250 });
    expect(grantCentsMap({ interactions: {}, story: { quests: { 'Q.1': { reward: { grantId: 'rw.q', moneyCents: 500, items: [] } } } } as never })).toEqual({ 'rw.q': 500 });
  });
  it('нагорода події без грошей — 0, не NaN', () => { expect(grantCentsMap({ interactions: {} }, [{ reward: { grantId: 'rw.ev-y' } }])).toEqual({ 'rw.ev-y': 0 }); });
});

describe('GAME-277 · наклейка, що перескочила годинник (сон), не губиться', () => {
  it('не показана й час стрибнув — життя відлічується від першого показу; показана — спливає як звичайно', () => {
    const jump = 1440;
    expect(stickerAt({ at: 100, seen: false }, 100 + jump)).toBe(100 + jump);
    expect(stickerLive(stickerAt({ at: 100, seen: false }, 100 + jump), 100 + jump)).toBe(true);
    expect(stickerLive(stickerAt({ at: 100, seen: true }, 100 + jump), 100 + jump), 'вже показану не воскрешаємо').toBe(false);
    expect(stickerAt({ at: 100, seen: false }, 100 + STICKER_MIN - 1), 'без стрибка — як було').toBe(100);
    expect(stickerLive(100, 99), 'годинник назад — не живе').toBe(false);
  });
});

describe('OD-029 · наклейка над героєм', () => {
  const base = { heroX: 200, heroTop: 400, w: 120, h: 28, vw: 390, age: 0, topInset: 60 };
  it('низ підпису вище верху героя на по центру; піднімається; згасає за кадрами', () => {
    const a = stickerPlace(base);
    expect(a.top + base.h, 'над героєм, не на ньому').toBeLessThanOrEqual(base.heroTop - 32);   // >= 32 px: місце «!»/«…» над головою (число свідомо не імпортоване — мутація константи мусить червоніти)
    expect(a.left + base.w / 2).toBe(base.heroX);
    expect(stickerPlace({ ...base, age: 60 }).top, 'піднімається').toBeLessThan(a.top);
    expect(stickerPlace({ ...base, age: 100 }).opacity).toBe(1);
    expect(stickerPlace({ ...base, age: 200 }).opacity).toBeGreaterThan(0);
    expect(stickerPlace({ ...base, age: 200 }).opacity).toBeLessThan(1);
    expect(stickerPlace({ ...base, age: POP_FRAMES }).opacity).toBe(0);
  });
  it('біля краю екрана лишається в межах', () => {
    expect(stickerPlace({ ...base, heroX: 5 }).left).toBeGreaterThanOrEqual(4);
    const r = stickerPlace({ ...base, heroX: 389 });
    expect(r.left + base.w).toBeLessThanOrEqual(base.vw - 4);
  });
});

describe('GAME-302 · підказка про XP', () => {
  it("пояснюємо лише першу наклейку, де є XP (мутація: завжди true / ігнорувати XP — червоніє)", () => {
    expect(explainXp({ cents: 0, xp: 15, om: 0, skills: {} }, false)).toBe(true);
    expect(explainXp({ cents: 500, xp: 0, om: 3, skills: {} }, false)).toBe(false);   // без XP — нема що пояснювати
    expect(explainXp({ cents: 0, xp: 15, om: 0, skills: {} }, true)).toBe(false);     // уже пояснювали — вдруге не лізе
  });
});
