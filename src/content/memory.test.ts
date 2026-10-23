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
const C1_BIKE = 0, C2_SPOT = 1, C3_SHELTER = 2, C4_AGAIN = 3, C5_HI = 4;   // відповіді вузла hello

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
  { type: 'CompleteQuest', questId: 'ST-001' }, { type: 'CompleteQuest', questId: 'ST-002' },   // GAME-84 №1: «Піти: Дім» удома не потрібне
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
    const second = play([{ type: 'Continue' }, { type: 'Continue' }, { type: 'Choose', choice: 0 }, { type: 'Continue' }, { type: 'Talk', npcId: 'npc.elise' }], told);
    expect(second.dialogue).toEqual({ id: DLG, node: 'hello' });
    // Удруге «де лишити велосипед?» не питають — вона вже пам'ятає (рецензія GAME-48).
    expect(tryMove(second, { type: 'Choose', choice: C1_BIKE })).toMatchObject({ ok: false, code: 'CONDITION_FAILED' });
    const asked = play([{ type: 'Choose', choice: C3_SHELTER }], second);
    expect(asked.dialogue).toEqual({ id: DLG, node: 'shelter' });
    // Вихід із нової гілки безумовний: shelter → bye → кінець розмови.
    expect(play([{ type: 'Continue' }, { type: 'Continue' }], asked).dialogue).toBeNull();
  });

  it('велосипедист, що про велосипед не казав (відповів про намет), — питання немає', () => {
    const s = play([{ type: 'Choose', choice: C2_SPOT }, { type: 'Continue' }, { type: 'Choose', choice: 0 }, { type: 'Continue' }, { type: 'Talk', npcId: 'npc.elise' }], atElise('transport.bike'));
    expect(s.npcMemory).toEqual({});
    expect(tryMove(s, { type: 'Choose', choice: C3_SHELTER })).toMatchObject({ ok: false, code: 'CONDITION_FAILED' });
  });

  it('водій: велосипедної відповіді немає, тож і питання про велосипед — ніколи', () => {
    const first = atElise('transport.car');
    expect(tryMove(first, { type: 'Choose', choice: C1_BIKE })).toMatchObject({ ok: false, code: 'CONDITION_FAILED' });
    const second = play([{ type: 'Choose', choice: C2_SPOT }, { type: 'Continue' }, { type: 'Choose', choice: 0 }, { type: 'Continue' }, { type: 'Talk', npcId: 'npc.elise' }], first);
    expect(second.npcMemory).toEqual({});
    expect(tryMove(second, { type: 'Choose', choice: C3_SHELTER })).toMatchObject({ ok: false, code: 'CONDITION_FAILED' });
  });

  it('сейв → завантаження зберігає пам\'ять: той самий хеш, і Еліза після завантаження так само пам\'ятає', () => {
    const told = play([{ type: 'Choose', choice: C1_BIKE }, { type: 'Continue' }, { type: 'Continue' }, { type: 'Choose', choice: 0 }, { type: 'Continue' }], atElise('transport.bike'));
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

  // GAME-84 №5: Еліза не вітається наново. Подання себе («Я Еліза…») — окремий вузол intro; у повторній розмові до нього
  // не дійти жодним шляхом, а саме привітання hello не називає її (воно однакове й для першої, і для другої розмови).
  describe('GAME-84 №5 · повторна розмова: без нового знайомства', () => {
    /** Усі вузли, до яких можна дійти з поточного стану розмови будь-якими відповідями (повний перебір). */
    function reachableNodes(from: GameState): Set<string> {
      const seen = new Set<string>();
      const queue = [from];
      const keys = new Set<string>();
      for (let s = queue.shift(); s; s = queue.shift()) {
        if (!s.dialogue) continue;
        seen.add(s.dialogue.node);
        const k = JSON.stringify([s.dialogue, s.flags, s.npcMemory]);
        if (keys.has(k)) continue;
        keys.add(k);
        for (const m of [{ type: 'Continue' }, ...[0, 1, 2, 3, 4, 5].map((choice) => ({ type: 'Choose', choice }))] as Move[]) {
          const r = tryMove(s, m);
          if (r.ok) queue.push(r.state);
        }
      }
      return seen;
    }
    const secondTalk = (transportId: string, first: readonly Move[]): GameState => play([...first, { type: 'Talk', npcId: 'npc.elise' }], atElise(transportId));

    it('перша розмова: знайомство (intro) досяжне — інакше «до нього не дійти» нижче нічого не доводить', () => {
      for (const t of ['transport.car', 'transport.bike']) expect(reachableNodes(atElise(t)).has('intro'), t).toBe(true);
    });

    it('друга розмова після знайомства: intro недосяжне, але розмова є й закінчується', () => {
      const cases: [string, readonly Move[]][] = [
        ['transport.car', [{ type: 'Choose', choice: C2_SPOT }, { type: 'Continue' }, { type: 'Choose', choice: 0 }, { type: 'Continue' }]],
        ['transport.bike', [{ type: 'Choose', choice: C1_BIKE }, { type: 'Continue' }, { type: 'Continue' }, { type: 'Choose', choice: 0 }, { type: 'Continue' }]],
        ['transport.bike', [{ type: 'Choose', choice: C2_SPOT }, { type: 'Continue' }, { type: 'Choose', choice: 0 }, { type: 'Continue' }]],
      ];
      for (const [t, first] of cases) {
        const again = secondTalk(t, first);
        expect(again.dialogue, t).toEqual({ id: DLG, node: 'hello' });
        const nodes = reachableNodes(again);
        expect(nodes.has('intro'), `${t}: ${first.map((m) => m.type).join()}`).toBe(false);
        expect(nodes.has('bye')).toBe(true);
        // Те, що пропонували б «знайомство» вдруге, — відмова ядра; «нагадай» і «просто привіталась» — доступні.
        expect(tryMove(again, { type: 'Choose', choice: C2_SPOT })).toMatchObject({ ok: false, code: 'CONDITION_FAILED' });
        expect(tryMove(again, { type: 'Choose', choice: C4_AGAIN }).ok).toBe(true);
        expect(tryMove(again, { type: 'Choose', choice: C5_HI }).ok).toBe(true);
      }
    });

    it('«просто привіталась» не знайомить і не ставить прапорця: тоді знайомство ще попереду', () => {
      const hi = secondTalk('transport.car', [{ type: 'Choose', choice: C5_HI }, { type: 'Continue' }]);
      expect(hi.flags).not.toContain('f.elise-met');
      expect(reachableNodes(hi).has('intro')).toBe(true);
    });

    it('привітання hello однакове для обох розмов і не називає її; ім\'я лунає лише у вузлі intro (uk і en)', async () => {
      const { default: uk } = await import('../../content/locales/uk.json');
      const { default: en } = await import('../../content/locales/en.json');
      for (const [lang, d, name] of [['uk', uk, 'Еліза'], ['en', en, 'Elise']] as const) {
        const L = d as Record<string, string>;
        expect(L[`${DLG}.hello`], lang).toBeTruthy();
        expect(L[`${DLG}.hello`], lang).not.toContain(name);
        expect(L[`${DLG}.intro`], lang).toContain(name);
      }
    });
  });
});
