// GAME-230 · дружба й подарунки на справжньому контенті: подарунок (реакція, очки, ліміт дня), прохання дають очки, сцена серця грається раз,
// сейв (старий без поля, повний, розмір), каталог дружби з npcs.json. Перебір сюжету дружбу не бачить (side.test / story.test).
// Мутації (закон 1; виводи — у PR): небажаний −1 очко; без ліміту дня; без перевірки «сцена вже грана»; прибрати кроки очок за прохання;
// дозволити останні дрова квесту; Forage без стелі.
import { describe, expect, it } from 'vitest';
import { dispatch, nextCommandId, type Command } from '../core/commands';
import { newSim, step, type SimState } from '../core/sim';
import { fromSave, serialize } from '../core/save';
import { HEART_AT, LIKED_POINTS, REQUEST_POINTS, heartsFor, ptsOf } from '../core/friendship';
import { characterChoices } from '../view/story-offer';
import { dropCount, forageSpent } from '../core/forage';
import type { GameState } from '../core/state';
import { FORAGE_ITEMS, FRIEND_DEFS, canForage, GIFTABLE, HEART_FROM_TOD, HEART_TO_TOD, giftOptions, heartDue, inHeartWindow, reactionFor, todOf } from './friendship';
import type { Move } from './moves';
import { GAME_DEFS as DEFS } from './slice-defs';
import { STORY } from './story';
import { LIFE } from './life';
import items from '../../content/items.json';
import npcs from '../../content/npcs.json';
import uk from '../../content/locales/uk.json';
import en from '../../content/locales/en.json';

const CAMP = 'loc.camp.lake';
const send = (sim: SimState, m: Move): SimState => step(sim, { kind: 'command', command: { ...m, commandId: nextCommandId(sim.game) } as Command }, { defs: DEFS });
const codeOf = (sim: SimState, m: Move): string | null => {
  const r = send(sim, m);
  const rec = r.game.processed[`c${sim.game.seq}`] ?? Object.values(r.game.processed).at(-1);
  return rec?.ok === false ? (rec.code ?? '?') : null;
};
/** Герой у таборі з даним інвентарем. */
function camp(inv: Record<string, number> = {}, extra: Partial<SimState['game']> = {}): SimState {
  const s = send(newSim(7, 3_000), (characterChoices(DEFS)[0] as { intent: Move }).intent);
  const g = s.game;
  return { ...s, game: { ...g, player: { ...(g.player as NonNullable<typeof g.player>), locationId: CAMP }, inventory: { ...g.inventory, ...inv }, ...extra } };
}
const gift = (npcId: string, itemId: string): Move => ({ type: 'GiveGift', npcId, itemId });

describe('каталог дружби з npcs.json', () => {
  it('шестеро мешканців мають вподобання; кожен любить хоч одне; предмети існують; любимий ≠ небажаний', () => {
    const ids = Object.keys(FRIEND_DEFS.prefs);
    expect(ids.sort()).toEqual(['npc.amina', 'npc.claire', 'npc.ingrid', 'npc.luc', 'npc.nora', 'npc.sarah']);
    const known = new Set((items as { id: string }[]).map((i) => i.id));
    for (const [id, p] of Object.entries(FRIEND_DEFS.prefs)) {
      expect(p.likes.length, id).toBeGreaterThan(0);
      for (const it of [...p.likes, ...p.dislikes]) { expect(known.has(it), `${id}:${it}`).toBe(true); expect(GIFTABLE, `${id}:${it}`).toContain(it); }
      expect(p.likes.filter((x) => p.dislikes.includes(x)), id).toEqual([]);
    }
  });
  it('дарувати можна лише дари природи й дрова; жодної риби чи їжі для тварин (Мія й вода — поза подарунками)', () => {
    expect([...GIFTABLE].sort()).toEqual(['item.berries', 'item.firewood', 'item.pine-cone']);
    expect(GIFTABLE.some((i) => /fish|grape|mia/.test(i))).toBe(false);
  });
  it('дві сцени серця: Нора й Інгрід, з 2 сердець; назви предметів і сцен — у двох мовах', () => {
    expect(Object.keys(FRIEND_DEFS.heart).sort()).toEqual(['npc.ingrid', 'npc.nora']);
    for (const h of Object.values(FRIEND_DEFS.heart)) {
      expect(h.at).toBe(2);
      expect(STORY.dialogues[h.scene]?.scene, h.scene).toBeDefined();
      expect((uk as Record<string, string>)[`${h.scene}.title`] && (en as Record<string, string>)[`${h.scene}.title`]).toBeTruthy();
    }
    for (const it of GIFTABLE) expect((uk as Record<string, string>)[it] && (en as Record<string, string>)[it], it).toBeTruthy();
  });
  it('очки за здане прохання йдуть просильнику; прохання за погодою просильника не мають', () => {
    expect(FRIEND_DEFS.requestGivers['f.req-nora-shore-done']).toBe('npc.nora');
    expect(Object.values(FRIEND_DEFS.requestGivers).every((n) => n in FRIEND_DEFS.prefs || n === 'npc.elise')).toBe(true);
  });
});

describe('подарунок', () => {
  it('подобається: предмет віддано, +LIKED_POINTS, день запам’ятано; реакція — «liked»', () => {
    const s0 = camp({ [FORAGE_ITEMS.berry]: 2 });
    const s1 = send(s0, gift('npc.nora', FORAGE_ITEMS.berry));
    expect(reactionFor('npc.nora', FORAGE_ITEMS.berry)).toBe('liked');
    expect(s1.game.inventory[FORAGE_ITEMS.berry]).toBe(1);
    expect(ptsOf(s1.game.friend, 'npc.nora')).toBe(LIKED_POINTS);
    expect(s1.game.friend?.gift['npc.nora']).toBe(0);
  });
  it('небажаний і нейтральний: предмет віддано, очки НЕ змінились і ніколи не зменшились', () => {
    const base = camp({ [FORAGE_ITEMS.cone]: 1, [FORAGE_ITEMS.berry]: 1 }, { friend: { pts: { 'npc.amina': 6 }, gift: {}, seen: [] } });
    expect(reactionFor('npc.amina', FORAGE_ITEMS.cone)).toBe('disliked');
    const s1 = send(base, gift('npc.amina', FORAGE_ITEMS.cone));
    expect(s1.game.inventory[FORAGE_ITEMS.cone]).toBeUndefined();
    expect(ptsOf(s1.game.friend, 'npc.amina')).toBe(6);
    expect(s1.game.friend?.gift['npc.amina']).toBe(0);
    // нейтральний: Люк і ягоди — небажане; Інгрід і шишка — любить; Клер і дрова — небажане. Нейтральний: той, кого предмет не згаданий (Сара + шишка)
    expect(reactionFor('npc.sarah', FORAGE_ITEMS.cone)).toBe('neutral');
    const s2 = send(camp({ [FORAGE_ITEMS.cone]: 1 }, { friend: { pts: { 'npc.sarah': 3 }, gift: {}, seen: [] } }), gift('npc.sarah', FORAGE_ITEMS.cone));
    expect(ptsOf(s2.game.friend, 'npc.sarah')).toBe(3);
  });
  it('не більше одного подарунка на NPC за день: вдруге — GRANT_ALREADY_GIVEN, предмет лишається; іншому NPC — можна', () => {
    const s1 = send(camp({ [FORAGE_ITEMS.berry]: 3 }), gift('npc.nora', FORAGE_ITEMS.berry));
    expect(codeOf(s1, gift('npc.nora', FORAGE_ITEMS.berry))).toBe('GRANT_ALREADY_GIVEN');
    const s1b = send(s1, gift('npc.nora', FORAGE_ITEMS.berry));
    expect(s1b.game.inventory[FORAGE_ITEMS.berry]).toBe(2);
    expect(ptsOf(s1b.game.friend, 'npc.nora')).toBe(LIKED_POINTS);
    expect(codeOf(s1, gift('npc.sarah', FORAGE_ITEMS.berry))).toBeNull();
  });
  it('подарунок закінчує розмову з цим мешканцем (рамка зникає, світ іде далі); чужу розмову не чіпає', () => {
    const mine = camp({ [FORAGE_ITEMS.berry]: 2 }, { dialogue: { id: 'dlg.nora-chat', node: 'hello' } });
    expect(send(mine, gift('npc.nora', FORAGE_ITEMS.berry)).game.dialogue).toBeNull();
    const other = camp({ [FORAGE_ITEMS.berry]: 2 }, { dialogue: { id: 'dlg.luc-chat', node: 'hello' } });
    expect(send(other, gift('npc.nora', FORAGE_ITEMS.berry)).game.dialogue).toEqual({ id: 'dlg.luc-chat', node: 'hello' });
  });
  it('наступного дня знову можна (день — з годинника гри)', () => {
    const s1 = send(camp({ [FORAGE_ITEMS.berry]: 3 }), gift('npc.nora', FORAGE_ITEMS.berry));
    const nextDay = { ...s1, clock: { ...s1.clock, minutes: s1.clock.minutes + 1440 } };
    const s2 = send(nextDay, gift('npc.nora', FORAGE_ITEMS.berry));
    expect(ptsOf(s2.game.friend, 'npc.nora')).toBe(2 * LIKED_POINTS);
    expect(s2.game.friend?.gift['npc.nora']).toBe(1);
  });
  it('відмови: немає предмета, предмет не для дарунка, не в таборі, невідомий мешканець, мешканець без вподобань', () => {
    const s = camp({ [FORAGE_ITEMS.berry]: 1, 'item.tent': 1 });
    expect(codeOf(s, gift('npc.nora', FORAGE_ITEMS.cone))).toBe('ITEM_NOT_OWNED');
    expect(codeOf(s, gift('npc.nora', 'item.tent'))).toBe('UNKNOWN_ITEM');
    expect(codeOf(s, gift('npc.nobody', FORAGE_ITEMS.berry))).toBe('UNKNOWN_TARGET');
    expect(codeOf(s, gift('npc.elise', FORAGE_ITEMS.berry))).toBe('UNKNOWN_TARGET');
    const home = { ...s, game: { ...s.game, player: { ...(s.game.player as NonNullable<typeof s.game.player>), locationId: 'loc.home' } } };
    expect(codeOf(home, gift('npc.nora', FORAGE_ITEMS.berry))).toBe('NOT_HERE');
  });
  it('останні дрова, потрібні активному квесту, не дарунок (ITEM_QUEST_LOCKED); зайві — можна', () => {
    const s = camp({ 'item.firewood': 1 }, { quests: { ...camp().game.quests, 'ST-005': { status: 'active', done: [] } } });
    expect(codeOf(s, gift('npc.luc', 'item.firewood'))).toBe('ITEM_QUEST_LOCKED');
    expect(codeOf({ ...s, game: { ...s.game, inventory: { 'item.firewood': 2 } } }, gift('npc.luc', 'item.firewood'))).toBeNull();
  });
  it('Forage: шишка й ягода лягають в інвентар (стеля 20); решта — UNKNOWN_ITEM', () => {
    let s = camp();
    s = send(s, { type: 'Forage', itemId: FORAGE_ITEMS.cone, sourceId: 'pine.camp' });
    expect(s.game.inventory[FORAGE_ITEMS.cone]).toBe(1);
    expect(codeOf(s, { type: 'Forage', itemId: 'item.tent', sourceId: 'pine.camp' })).toBe('UNKNOWN_ITEM');
    const full = { ...s, game: { ...s.game, inventory: { [FORAGE_ITEMS.cone]: 20 } } };
    expect(codeOf(full, { type: 'Forage', itemId: FORAGE_ITEMS.cone, sourceId: 'pine.forest.4' })).toBe('INVALID_AMOUNT');
  });
  it('GAME-244 ч.2: джерело дає раз на день рівно dropCount; вдруге — FORAGE_USED_TODAY; завтра знову; перезавантаження ліміт не скидає', () => {
    const src = 'pine.camp'; const itemId = FORAGE_ITEMS.cone;
    const take = (st: GameState, sourceId: string, day: number, item: string = itemId) => dispatch(st, { type: 'Forage', commandId: nextCommandId(st), itemId: item, sourceId } as Command, DEFS, undefined, day);
    const n0 = dropCount('pine', src, 0);
    let st = camp().game;
    for (let i = 0; i < n0; i++) { const r = take(st, src, 0); expect(r.ok, `збір ${i + 1} з ${n0}`).toBe(true); if (r.ok) st = r.state; }
    expect(st.inventory[itemId]).toBe(n0);
    const again = take(st, src, 0);
    expect(again.ok ? 'ok' : again.code, 'джерело вичерпане сьогодні').toBe('FORAGE_USED_TODAY');
    const reloaded = JSON.parse(JSON.stringify(st)) as GameState;   // збереження → завантаження
    const afterReload = take(reloaded, src, 0);
    expect(afterReload.ok ? 'ok' : afterReload.code, 'перезавантаження не скидає ліміт').toBe('FORAGE_USED_TODAY');
    expect(take(st, 'pine.forest.1', 0).ok, 'інше джерело — окремий ліміт').toBe(true);
    const next = take(st, src, 1);
    expect(next.ok, 'наступного дня джерело знову дає').toBe(true);
    if (next.ok) expect(Object.keys(next.state.friend?.forage?.n ?? {}), 'книга веде один день — старі відпадають').toEqual([src]);
    const wrong = take(st, src, 1, FORAGE_ITEMS.berry);
    expect(wrong.ok ? 'ok' : wrong.code, 'сосна не дає ягід').toBe('UNKNOWN_TARGET');
    expect(forageSpent(st.friend, src, 0), 'вичерпане джерело — спожите').toBe(true);
    expect(forageSpent(st.friend, src, 1), 'завтра — ні').toBe(false);
    expect(forageSpent(st.friend, 'obj.crate', 0), 'ящик — не джерело дарів: вигляд його не блокує').toBe(false);
    const noSrc = take(st, 'obj.crate', 1);
    expect(noSrc.ok ? 'ok' : noSrc.code, 'не джерело').toBe('UNKNOWN_TARGET');
  });
  it('GAME-235: canForage збігається з ядром — на стелі 20 «+1» не показуємо, нічого не додалось', () => {
    for (const have of [0, 1, 19, 20, 25]) {
      const st = { ...camp(), game: { ...camp().game, inventory: { [FORAGE_ITEMS.cone]: have } } };
      const accepted = codeOf(st, { type: 'Forage', itemId: FORAGE_ITEMS.cone, sourceId: 'pine.camp' }) === null;
      expect(canForage(st.game.inventory, FORAGE_ITEMS.cone), `у руках ${have}`).toBe(accepted);
    }
    expect(canForage({}, FORAGE_ITEMS.berry)).toBe(true);
    expect(canForage({ [FORAGE_ITEMS.berry]: 20 }, FORAGE_ITEMS.berry)).toBe(false);
  });
  it('що пропонує UI: триманий дар, лише цьому мешканцю й раз за день', () => {
    const s = camp({ [FORAGE_ITEMS.berry]: 1, 'item.tent': 1 });
    expect(giftOptions(s.game, 'npc.nora', 0)).toEqual([FORAGE_ITEMS.berry]);
    expect(giftOptions(s.game, 'npc.elise', 0)).toEqual([]);
    const after = send(s, gift('npc.nora', FORAGE_ITEMS.berry));
    expect(giftOptions({ ...after.game, inventory: { [FORAGE_ITEMS.berry]: 1 } }, 'npc.nora', 0)).toEqual([]);
  });
});

describe('прохання → очки дружби', () => {
  it('здача прохання Нори дає REQUEST_POINTS рівно раз', () => {
    const g = camp().game;
    const flags = ['f.req-nora-shore-taken', 'f.req-nora-shore-t1', 'f.req-nora-shore-t2', 'f.req-nora-shore-t3'];
    const s = { ...camp({}, { flags, dialogue: { id: 'dlg.nora-chat', node: 'turnin' } }), clock: camp().clock };
    expect(g.friend).toBeUndefined();
    const s1 = send(s, { type: 'Choose', choice: 0 });
    expect(s1.game.flags).toContain('f.req-nora-shore-done');
    expect(ptsOf(s1.game.friend, 'npc.nora')).toBe(REQUEST_POINTS);
    expect(ptsOf(s1.game.friend, 'npc.ingrid')).toBe(0);
    // повторна розмова-здача (прапорець уже є) нових очок не дає
    const again = send({ ...s1, game: { ...s1.game, dialogue: { id: 'dlg.nora-chat', node: 'turnin' } } }, { type: 'Choose', choice: 0 });
    expect(ptsOf(again.game.friend, 'npc.nora')).toBe(REQUEST_POINTS);
  });
});

describe('сцена серця', () => {
  const NORA_AT = HEART_AT[1] as number;   // 2 серця
  const ready = (): SimState => camp({}, { friend: { pts: { 'npc.nora': NORA_AT }, gift: {}, seen: [] } });
  /** Програти діалог до кінця (перший вибір, інакше «далі»). */
  function play(s: SimState): SimState {
    let cur = s;
    for (let i = 0; i < 40 && cur.game.dialogue !== null; i++) {
      const d = STORY.dialogues[cur.game.dialogue.id];
      const node = d?.nodes[cur.game.dialogue.node];
      cur = send(cur, node?.choices ? { type: 'Choose', choice: 0 } : { type: 'Continue' });
    }
    return cur;
  }
  it('на порозі серць сцена відкривається, грається до кінця й записується; удруге — CONDITION_FAILED (ніколи не повторюється)', () => {
    const s0 = ready();
    expect(heartsFor(s0.game.friend, 'npc.nora')).toBe(2);
    const s1 = send(s0, { type: 'HeartEvent', npcId: 'npc.nora' });
    expect(s1.game.dialogue?.id).toBe('dlg.heart-nora');
    expect(s1.game.friend?.seen).toEqual(['npc.nora']);
    const s2 = play(s1);
    expect(s2.game.dialogue).toBeNull();
    expect(codeOf(s2, { type: 'HeartEvent', npcId: 'npc.nora' })).toBe('CONDITION_FAILED');
    // навіть із ще більшою дружбою
    const more = { ...s2, game: { ...s2.game, friend: { ...(s2.game.friend as NonNullable<typeof s2.game.friend>), pts: { 'npc.nora': 99 } } } };
    expect(codeOf(more, { type: 'HeartEvent', npcId: 'npc.nora' })).toBe('CONDITION_FAILED');
    expect(heartDue(more.game, 16 * 60 - 8 * 60)).toBeNull();
  });
  it('на 1 очко нижче порога — відмова; сцена іншого мешканця незалежна', () => {
    const low = camp({}, { friend: { pts: { 'npc.nora': NORA_AT - 1 }, gift: {}, seen: [] } });
    expect(codeOf(low, { type: 'HeartEvent', npcId: 'npc.nora' })).toBe('CONDITION_FAILED');
    const both = camp({}, { friend: { pts: { 'npc.nora': NORA_AT, 'npc.ingrid': NORA_AT }, gift: {}, seen: ['npc.nora'] } });
    expect(codeOf(both, { type: 'HeartEvent', npcId: 'npc.nora' })).toBe('CONDITION_FAILED');
    expect(send(both, { type: 'HeartEvent', npcId: 'npc.ingrid' }).game.dialogue?.id).toBe('dlg.heart-ingrid');
  });
  it('мешканець без сцени (Сара) і не в таборі — відмова', () => {
    expect(codeOf(camp({}, { friend: { pts: { 'npc.sarah': 99 }, gift: {}, seen: [] } }), { type: 'HeartEvent', npcId: 'npc.sarah' })).toBe('UNKNOWN_TARGET');
    const s = ready();
    const away = { ...s, game: { ...s.game, player: { ...(s.game.player as NonNullable<typeof s.game.player>), locationId: 'loc.home' } } };
    expect(codeOf(away, { type: 'HeartEvent', npcId: 'npc.nora' })).toBe('NOT_HERE');
  });
  it('година сцени: [15:00, 18:00) за годинником гри; межі ±1 хвилина; у розмові чи поза табором — ні', () => {
    const at = (tod: number): number => tod - 8 * 60 + 1440;   // хвилина годинника, якій відповідає tod
    expect([inHeartWindow(at(HEART_FROM_TOD - 1)), inHeartWindow(at(HEART_FROM_TOD)), inHeartWindow(at(HEART_TO_TOD - 1)), inHeartWindow(at(HEART_TO_TOD))]).toEqual([false, true, true, false]);
    expect(todOf(at(HEART_FROM_TOD))).toBe(HEART_FROM_TOD);
    const s = ready();
    expect(heartDue(s.game, at(HEART_FROM_TOD))).toBe('npc.nora');
    expect(heartDue(s.game, at(HEART_FROM_TOD - 1))).toBeNull();
    expect(heartDue({ ...s.game, dialogue: { id: 'dlg.nora-chat', node: 'hello' } }, at(HEART_FROM_TOD))).toBeNull();
    expect(heartDue({ ...s.game, player: { ...(s.game.player as NonNullable<typeof s.game.player>), locationId: 'loc.home' } }, at(HEART_FROM_TOD))).toBeNull();
  });
});

describe('сейв', () => {
  it('старий сейв без `friend` вантажиться як є, і новий день/подарунок працює з нього', () => {
    const old = camp();
    expect('friend' in old.game).toBe(false);
    const r = fromSave(serialize(old), { story: STORY, life: LIFE });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.sim.game.friend).toBeUndefined(); expect(send({ ...r.sim, game: { ...r.sim.game, inventory: { [FORAGE_ITEMS.berry]: 1 } } }, gift('npc.nora', FORAGE_ITEMS.berry)).game.friend?.pts['npc.nora']).toBe(LIKED_POINTS); }
  });
  it('сейв із дружбою повертається побайтно; розмір малий (≪ 500 КБ)', () => {
    let s = camp({ [FORAGE_ITEMS.berry]: 1 });
    s = send(s, gift('npc.nora', FORAGE_ITEMS.berry));
    const text = serialize(s);
    const r = fromSave(text, { story: STORY, life: LIFE });
    expect(r.ok && r.sim.game.friend).toEqual(s.game.friend);
    expect(text.length).toBeLessThan(500 * 1024);
  });
  it('зіпсована дружба відхиляється (SAVE_SHAPE): від’ємні очки, очки понад стелю, день не число, seen не відсортовано', () => {
    const s = camp({}, {});
    const bad = (friend: unknown): string => { const r = fromSave(serialize({ ...s, game: { ...s.game, friend } as never }), { story: STORY, life: LIFE }); return r.ok ? 'ok' : r.code; };
    expect(bad({ pts: { 'npc.nora': 3 }, gift: { 'npc.nora': 0 }, seen: ['npc.a', 'npc.b'] })).toBe('ok');
    expect(bad({ pts: { 'npc.nora': -1 }, gift: {}, seen: [] })).toBe('SAVE_SHAPE');
    expect(bad({ pts: { 'npc.nora': 100 }, gift: {}, seen: [] })).toBe('SAVE_SHAPE');
    expect(bad({ pts: {}, gift: { 'npc.nora': 'x' }, seen: [] })).toBe('SAVE_SHAPE');
    expect(bad({ pts: {}, gift: {}, seen: ['npc.b', 'npc.a'] })).toBe('SAVE_SHAPE');
  });
});

describe('дані npcs.json', () => {
  it('поля gifts/heart стоять лише в мешканців табору', () => {
    for (const n of npcs as { id: string; gifts?: unknown; heart?: unknown }[]) if (n.gifts || n.heart) expect(n.id in FRIEND_DEFS.prefs).toBe(true);
  });
});
