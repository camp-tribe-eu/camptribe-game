// GAME-229 · навички ростуть від дій руками. Закон 1: кожну перевірку тут доведено мутацією (перелік — у PR); тут — вбудовані негативні контролі.
import { describe, expect, it } from 'vitest';
import { dispatch, practiceOf, type Command } from './commands';
import { SAVE_VERSION, fromSave, serialize } from './save';
import { HAND_ACTIONS, MAX_RANK, PRACTICE_RANK_CAP, RANK_XP, SKILL_IDS, isHandAction, practiceGain, rankOf, rankUps, zeroSkills } from './skills';
import { initialState, type GameState } from './state';
import { DRIVER, SKILL_DEFS, play } from './story.fixture';
import v3 from '../../tests/saves/v3.json';

let n = 0;
const hand = (s: GameState, action: string) => dispatch(s, { type: 'Practise', commandId: `h${n++}`, action } as Command, SKILL_DEFS);
const start = (): GameState => play([DRIVER], initialState(0), SKILL_DEFS);

/** Дія `action` стільки разів, скільки сказано; повертає стан після кожної (від 0-го — до дій). */
function repeat(action: string, times: number): GameState[] {
  const out: GameState[] = [start()];
  for (let i = 0; i < times; i++) {
    const r = hand(out[out.length - 1] as GameState, action);
    if (!r.ok) throw new Error(`Practise ${action} → ${r.code}`);
    out.push(r.state);
  }
  return out;
}
const xpOf = (s: GameState, skill: string): number => s.skills[skill] as number;

describe('таблиця дій руками: лише наявні напрями', () => {
  it('кожна дія вчить 1+ із восьми існуючих навичок; нових напрямів немає', () => {
    expect(Object.keys(HAND_ACTIONS).length).toBeGreaterThanOrEqual(5);
    for (const [a, ids] of Object.entries(HAND_ACTIONS)) {
      expect(ids.length, a).toBeGreaterThan(0);
      for (const id of ids) expect(SKILL_IDS as readonly string[], `${a} → ${id}`).toContain(id);
    }
    // Чотири різні навички — не одна на все (мета картки: ростуть різні вміння).
    expect(new Set(Object.values(HAND_ACTIONS).flat()).size).toBeGreaterThanOrEqual(4);
  });
  it('isHandAction: ключі прототипу й сміття — ні', () => {
    for (const bad of ['toString', 'constructor', '__proto__', 'hand:wood', '', 7, null, undefined]) expect(isHandAction(bad), String(bad)).toBe(false);
    expect(isHandAction('wood')).toBe(true);
  });
});

describe('Спосіб перевірки 1: N дій → ранг росте рівно на порозі', () => {
  it('сокира: 1-ша дія → ранг 1 (12 ≥ 10); 7-ма → ранг 2 (12+6+4+3+2+2+1 = 30 ≥ 30); раніше — ні', () => {
    const states = repeat('wood', 12);
    const xp = states.map((s) => xpOf(s, 'skill.mechanics'));
    expect(xp).toEqual([0, 12, 18, 22, 25, 27, 29, 30, 31, 32, 33, 34, 35]);
    const ranks = xp.map(rankOf);
    expect(ranks).toEqual([0, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2]);
    // Рівно ці два кроки дають «Що відкрилось»; між ними й після — тиша.
    const ups = states.slice(1).map((s, i) => rankUps((states[i] as GameState).skills, s.skills));
    expect(ups.map((u) => u.length)).toEqual([1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0]);
    expect(ups[0]).toEqual([{ skill: 'skill.mechanics', rank: 1 }]);
    expect(ups[6]).toEqual([{ skill: 'skill.mechanics', rank: 2 }]);
  });
  it('дія вчить саме свою навичку: намет → табір, рибалка → витривалість, засмажити → кухня; решта не рухається', () => {
    for (const [action, skill] of [['tent', 'skill.camping'], ['fish', 'skill.endurance'], ['grill', 'skill.cooking'], ['wood', 'skill.mechanics']] as const) {
      const s = (repeat(action, 1)[1]) as GameState;
      expect(xpOf(s, skill), action).toBe(12);
      for (const id of SKILL_IDS) if (id !== skill) expect(xpOf(s, id), `${action} не вчить ${id}`).toBe(0);
    }
  });
  it('rankUps: стрибок через кілька порогів дає кожен ранг окремо, по порядку; падіння й однаковий стан — нічого', () => {
    const z = zeroSkills();
    expect(rankUps(z, { ...z, 'skill.camping': 60 })).toEqual([1, 2, 3].map((rank) => ({ skill: 'skill.camping', rank })));
    expect(rankUps({ ...z, 'skill.camping': 60 }, z)).toEqual([]);
    expect(rankUps(z, z)).toEqual([]);
  });
});

describe('Спосіб перевірки 1б: спадна віддача — що вищий ранг, то менше досвіду за дію', () => {
  it('найбільший приріст за дію в рангу k строго менший, ніж у рангу k−1 (ранги 0 → 1 → 2)', () => {
    const states = repeat('wood', 14);
    const byRank = new Map<number, number[]>();
    for (let i = 1; i < states.length; i++) {
      const before = xpOf(states[i - 1] as GameState, 'skill.mechanics');
      const gain = xpOf(states[i] as GameState, 'skill.mechanics') - before;
      const r = rankOf(before);
      byRank.set(r, [...(byRank.get(r) ?? []), gain]);
    }
    const top = [0, 1, 2].map((r) => Math.max(...(byRank.get(r) as number[])));
    expect(top).toEqual([12, 6, 1]);
    expect(top[1] as number).toBeLessThan(top[0] as number);
    expect(top[2] as number).toBeLessThan(top[1] as number);
  });
  it('та сама крива, що в GAME-72 (practiceGain), без власної: 12, 6, 4, 3, 2, 2, 1…', () => {
    const states = repeat('smash', 8);
    const gains = states.slice(1).map((s, i) => xpOf(s, 'skill.mechanics') - xpOf(states[i] as GameState, 'skill.mechanics'));
    expect(gains).toEqual(Array.from({ length: 8 }, (_, i) => practiceGain(i)));
  });
  it('дія насичується: 13-та вже нічого не дає, а лічильник не росте далі', () => {
    const states = repeat('wood', 14);
    expect(xpOf(states[13] as GameState, 'skill.mechanics')).toBe(xpOf(states[12] as GameState, 'skill.mechanics'));
    expect((states[14] as GameState).practice['hand:wood']).toBe(12);
  });
  it('практика руками теж не вище межі практики: усі три дії «Майстра» разом — ранг не вище PRACTICE_RANK_CAP', () => {
    let s = start();
    for (const a of ['wood', 'repair', 'smash']) for (let i = 0; i < 14; i++) { const r = hand(s, a); if (!r.ok) throw new Error(r.code); s = r.state; }
    expect(rankOf(xpOf(s, 'skill.mechanics'))).toBe(PRACTICE_RANK_CAP);
    expect(rankOf(xpOf(s, 'skill.mechanics'))).toBeLessThan(MAX_RANK);
    expect(xpOf(s, 'skill.mechanics')).toBeLessThan(RANK_XP[PRACTICE_RANK_CAP + 1] as number);
  });
});

describe('ядро: відмови', () => {
  it('невідома дія — INVALID_COMMAND і стан не змінено (окрім запису відмови)', () => {
    const s = start();
    for (const bad of ['', 'dance', 'toString', '__proto__']) {
      const r = hand(s, bad);
      expect(r.ok, bad).toBe(false);
      if (!r.ok) { expect(r.code).toBe('INVALID_COMMAND'); expect(r.state.skills).toEqual(s.skills); expect(r.state.practice).toEqual(s.practice); }
    }
  });
  it('без персонажа вчитись нікому: NO_CHARACTER', () => {
    const r = hand(initialState(0), 'wood');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('NO_CHARACTER');
  });
  it('повтор того самого commandId нічого не вчить удруге', () => {
    const s = start();
    const cmd = { type: 'Practise', commandId: 'same-1', action: 'wood' } as const;
    const a = dispatch(s, cmd, SKILL_DEFS);
    expect(a.ok).toBe(true);
    const b = dispatch(a.state, cmd, SKILL_DEFS);
    expect(b.ok && b.repeated).toBe(true);
    expect(xpOf(b.state, 'skill.mechanics')).toBe(12);
  });
  it('practiceOf: ключ hand:<дія>; невідома дія — null', () => {
    const s = start();
    expect(practiceOf({ type: 'Practise', commandId: 'x', action: 'tent' }, s, s, SKILL_DEFS)).toEqual({ key: 'hand:tent', skills: ['skill.camping'] });
    expect(practiceOf({ type: 'Practise', commandId: 'x', action: 'nope' }, s, s, SKILL_DEFS)).toBeNull();
  });
});

describe('Спосіб перевірки: навички в сейві, старий сейв завантажується', () => {
  it('v3-фікстура (записана до GAME-229) завантажується; практика руками додається поверх, переживає сейв і не роздуває його', () => {
    const r = fromSave(JSON.stringify(v3));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const practiceBefore = JSON.stringify(r.sim.game.practice).length;
    let g = r.sim.game;
    for (const a of Object.keys(HAND_ACTIONS)) for (let i = 0; i < 12; i++) { const d = hand(g, a); if (!d.ok) throw new Error(`${a}: ${d.code}`); g = d.state; }
    const sim = { ...r.sim, game: g };
    const text = serialize(sim);
    const back = fromSave(text);
    expect(back.ok, back.ok ? '' : back.detail).toBe(true);
    if (!back.ok) return;
    expect(back.fromVersion).toBe(SAVE_VERSION);
    expect(back.sim.game.skills).toEqual(g.skills);
    expect(back.sim.game.practice).toEqual(g.practice);
    expect(back.sim.game.practice['hand:wood']).toBe(12);
    // Власний приріст практики руками — ≤ 7 лічильників (~100 байт); решта росту сейву — журнал `processed`, він обмежений 256 записами (PROCESSED_LIMIT).
    expect(JSON.stringify(g.practice).length - practiceBefore).toBeLessThan(200);
    expect(text.length).toBeLessThan(500_000);
  });
});
