// GAME-230 · чиста математика дружби: пороги сердець (межі ±1), очки за реакцію (ніколи мінус), ліміт «раз на день», сцена серця раз.
// Мутації (перевірено, див. PR): HEART_AT[1] 5→6 → «пороги ±1» червоніє; giftPoints небажаного −1 → «небажаний подарунок не віднімає»;
// canGiftToday завжди true → «один подарунок на NPC за день»; прибрати перевірку seen у heartEventDue → «сцена серця не повторюється».
import { describe, expect, it } from 'vitest';
import {
  HEART_AT, LIKED_POINTS, MAX_HEARTS, NO_FRIEND, POINTS_CAP, REQUEST_POINTS, addPoints, canGiftToday, giftPoints, giveGift, heartEventDue, heartsOf, markHeartSeen, ptsOf, reactionOf,
  type FriendDefs,
} from './friendship';

const DEFS: FriendDefs = {
  prefs: { 'npc.a': { likes: ['item.x'], dislikes: ['item.y'] } }, giftable: ['item.x', 'item.y', 'item.z'], forage: ['item.x'],
  heart: { 'npc.a': { scene: 'dlg.heart-a', at: 2 } }, requestGivers: {},
};

describe('пороги сердець', () => {
  it('п’ять сердець, пороги зростають', () => {
    expect(HEART_AT).toHaveLength(MAX_HEARTS);
    expect([...HEART_AT].sort((a, b) => a - b)).toEqual([...HEART_AT]);
    expect(new Set(HEART_AT).size).toBe(MAX_HEARTS);
  });
  it('кожен поріг: на 1 нижче — на серце менше; на порозі й на 1 вище — серце є (±1)', () => {
    HEART_AT.forEach((at, i) => {
      expect(heartsOf(at - 1), `${at - 1}`).toBe(i);
      expect(heartsOf(at), `${at}`).toBe(i + 1);
      expect(heartsOf(at + (i === MAX_HEARTS - 1 ? 1 : 0)), `${at}+`).toBe(i + 1);
    });
    expect(heartsOf(0)).toBe(0);
    expect(heartsOf(POINTS_CAP)).toBe(MAX_HEARTS);
  });
  it('конкретні числа: 1 очко — без серця, 2 — перше, 5 — друге', () => {
    expect([heartsOf(1), heartsOf(2), heartsOf(4), heartsOf(5)]).toEqual([0, 1, 1, 2]);
  });
});

describe('очки й подарунки', () => {
  it('реакція за вподобаннями: любить / не любить / решта нейтрально; без вподобань — нейтрально', () => {
    const p = DEFS.prefs['npc.a'];
    expect([reactionOf(p, 'item.x'), reactionOf(p, 'item.y'), reactionOf(p, 'item.z'), reactionOf(undefined, 'item.x')]).toEqual(['liked', 'disliked', 'neutral', 'neutral']);
  });
  it('подобається дає очки; нейтральний і небажаний — рівно нуль', () => {
    expect([giftPoints('liked'), giftPoints('neutral'), giftPoints('disliked')]).toEqual([LIKED_POINTS, 0, 0]);
  });
  it('небажаний подарунок не віднімає очок навіть у того, у кого вони вже є', () => {
    const f0 = addPoints(NO_FRIEND, 'npc.a', 7);
    const f1 = giveGift(f0, 'npc.a', 'disliked', 3);
    expect(ptsOf(f1, 'npc.a')).toBe(7);
    expect(ptsOf(giveGift(f0, 'npc.a', 'neutral', 3), 'npc.a')).toBe(7);
    expect(ptsOf(giveGift(f0, 'npc.a', 'liked', 3), 'npc.a')).toBe(7 + LIKED_POINTS);
  });
  it('очки не перевищують стелі й не стають від’ємними', () => {
    expect(ptsOf(addPoints(NO_FRIEND, 'npc.a', 10_000), 'npc.a')).toBe(POINTS_CAP);
    expect(ptsOf(addPoints(NO_FRIEND, 'npc.a', -5), 'npc.a')).toBe(0);
    expect(REQUEST_POINTS).toBeGreaterThan(0);
  });
  it('один подарунок на NPC за день: сьогодні вдруге — ні, іншому NPC — так, завтра — знову', () => {
    const f = giveGift(undefined, 'npc.a', 'liked', 4);
    expect(canGiftToday(f, 'npc.a', 4)).toBe(false);
    expect(canGiftToday(f, 'npc.b', 4)).toBe(true);
    expect(canGiftToday(f, 'npc.a', 5)).toBe(true);
    expect(canGiftToday(undefined, 'npc.a', 0)).toBe(true);
  });
});

describe('сцена серця', () => {
  it('готова рівно з порогу `at` серць, ще не грана; після markHeartSeen — ніколи знову', () => {
    const at = DEFS.heart['npc.a']?.at as number;
    const below = addPoints(NO_FRIEND, 'npc.a', (HEART_AT[at - 1] as number) - 1);
    const on = addPoints(NO_FRIEND, 'npc.a', HEART_AT[at - 1] as number);
    expect(heartEventDue(below, DEFS, 'npc.a')).toBe(false);
    expect(heartEventDue(on, DEFS, 'npc.a')).toBe(true);
    const seen = markHeartSeen(on, 'npc.a');
    expect(heartEventDue(seen, DEFS, 'npc.a')).toBe(false);
    expect(heartEventDue(addPoints(seen, 'npc.a', 50), DEFS, 'npc.a')).toBe(false);
    expect(heartEventDue(on, DEFS, 'npc.nobody')).toBe(false);
    expect(heartEventDue(on, undefined, 'npc.a')).toBe(false);
  });
  it('seen відсортований і без повторів', () => {
    const f = markHeartSeen(markHeartSeen(markHeartSeen(NO_FRIEND, 'npc.b'), 'npc.a'), 'npc.b');
    expect(f.seen).toEqual(['npc.a', 'npc.b']);
  });
});
