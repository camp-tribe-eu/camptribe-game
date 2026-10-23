// GAME-48 · пам'ять NPC на справжньому контенті: Еліза пам'ятає, як ти приїхав. Велосипедист, який сказав
// їй про велосипед, у наступній розмові може спитати про нього; водій — ніколи (ядро, не лише валідатор).
import { describe, expect, it } from 'vitest';
import { dispatch, type Command } from '../core/commands';
import { stateHash } from '../core/hash';
import { fromSave, serialize } from '../core/save';
import { newSim, type SimState } from '../core/sim';
import { initialState, type GameState } from '../core/state';
import type { Move } from './moves';
import { GAME_DEFS } from './slice-defs';
import { STORY } from './story';

const DEFS = GAME_DEFS;
const DLG = 'dlg.elise-greeting';
const C1_BIKE = 0, C2_SPOT = 1, C3_SHELTER = 2;   // відповіді вузла hello

let n = 0;
function play(moves: readonly Move[], from: GameState): GameState {
  let s = from;
  for (const m of moves) {
    const r = dispatch(s, { ...m, commandId: `mm${n++}` } as Command, DEFS);
    if (!r.ok) throw new Error(`${m.type} ${JSON.stringify(m)} → ${r.code}`);
    s = r.state;
  }
  return s;
}
const tryMove = (s: GameState, m: Move) => dispatch(s, { ...m, commandId: `mt${n++}` } as Command, DEFS);

/** Від створення персонажа до першої розмови з Елізою (Пролог за замовчуванням, як у реплеї). */
const TO_ELISE: readonly Move[] = [
  { type: 'Visit', locationId: 'loc.home' }, { type: 'CompleteQuest', questId: 'ST-001' },
  { type: 'Visit', locationId: 'loc.home' }, { type: 'CompleteQuest', questId: 'ST-002' },
  { type: 'Visit', locationId: 'loc.shop' }, { type: 'Pickup', itemId: 'item.tent' }, { type: 'Pickup', itemId: 'item.sleeping-bag' },
  { type: 'CompleteQuest', questId: 'ST-003' }, { type: 'Visit', locationId: 'loc.road' }, { type: 'CompleteQuest', questId: 'ST-004', to: 'ST-005' },
  { type: 'Visit', locationId: 'loc.camp.lake' }, { type: 'Talk', npcId: 'npc.elise' },
];
const atElise = (transportId: string): GameState =>
  play([{ type: 'CreateCharacter', profileId: 'profile.solo-explorer', transportId } as Move, ...TO_ELISE], initialState(5_000));

describe('Еліза пам\'ятає, як ти приїхав (GAME-48)', () => {
  it('велосипедист: перша розмова — лише запам\'ятовує; друга — питання про велосипед і її відповідь', () => {
    const first = atElise('transport.bike');
    expect(first.dialogue).toEqual({ id: DLG, node: 'hello' });
    expect(first.npcMemory).toEqual({});
    expect(tryMove(first, { type: 'Choose', choice: C3_SHELTER })).toMatchObject({ ok: false, code: 'CONDITION_FAILED' });   // ще не казав

    const told = play([{ type: 'Choose', choice: C1_BIKE }], first);
    expect(told.npcMemory).toEqual({ 'npc.elise': ['m.came-by-bike'] });
    const second = play([{ type: 'Continue' }, { type: 'Choose', choice: 0 }, { type: 'Continue' }, { type: 'Talk', npcId: 'npc.elise' }], told);
    expect(second.dialogue).toEqual({ id: DLG, node: 'hello' });
    const asked = play([{ type: 'Choose', choice: C3_SHELTER }], second);
    expect(asked.dialogue).toEqual({ id: DLG, node: 'shelter' });
    // Вихід із нової гілки безумовний: shelter → bye → кінець розмови.
    expect(play([{ type: 'Continue' }, { type: 'Continue' }], asked).dialogue).toBeNull();
  });

  it('велосипедист, що про велосипед не казав (відповів про намет), — питання немає', () => {
    const s = play([{ type: 'Choose', choice: C2_SPOT }, { type: 'Choose', choice: 0 }, { type: 'Continue' }, { type: 'Talk', npcId: 'npc.elise' }], atElise('transport.bike'));
    expect(s.npcMemory).toEqual({});
    expect(tryMove(s, { type: 'Choose', choice: C3_SHELTER })).toMatchObject({ ok: false, code: 'CONDITION_FAILED' });
  });

  it('водій: велосипедної відповіді немає, тож і питання про велосипед — ніколи', () => {
    const first = atElise('transport.car');
    expect(tryMove(first, { type: 'Choose', choice: C1_BIKE })).toMatchObject({ ok: false, code: 'CONDITION_FAILED' });
    const second = play([{ type: 'Choose', choice: C2_SPOT }, { type: 'Choose', choice: 0 }, { type: 'Continue' }, { type: 'Talk', npcId: 'npc.elise' }], first);
    expect(second.npcMemory).toEqual({});
    expect(tryMove(second, { type: 'Choose', choice: C3_SHELTER })).toMatchObject({ ok: false, code: 'CONDITION_FAILED' });
  });

  it('сейв → завантаження зберігає пам\'ять: той самий хеш, і Еліза після завантаження так само пам\'ятає', () => {
    const told = play([{ type: 'Choose', choice: C1_BIKE }, { type: 'Continue' }, { type: 'Choose', choice: 0 }, { type: 'Continue' }], atElise('transport.bike'));
    const sim: SimState = { ...newSim(20261023, 0), game: told };
    const r = fromSave(serialize(sim, 'rev'), { story: STORY });
    expect(r.ok, r.ok ? '' : `${r.code}: ${r.detail}`).toBe(true);
    if (!r.ok) return;
    expect(stateHash(r.sim)).toBe(stateHash(sim));
    expect(r.sim.game.npcMemory).toEqual({ 'npc.elise': ['m.came-by-bike'] });
    const again = play([{ type: 'Talk', npcId: 'npc.elise' }, { type: 'Choose', choice: C3_SHELTER }], r.sim.game);
    expect(again.dialogue).toEqual({ id: DLG, node: 'shelter' });
    // Негативний контроль: той самий сейв без пам'яті (перерахована сума) — питання вже немає.
    const forgot = { ...r.sim.game, npcMemory: {} };
    const r2 = fromSave(serialize({ ...sim, game: forgot }));
    expect(r2.ok && tryMove(play([{ type: 'Talk', npcId: 'npc.elise' }], r2.sim.game), { type: 'Choose', choice: C3_SHELTER })).toMatchObject({ ok: false, code: 'CONDITION_FAILED' });
  });
});
