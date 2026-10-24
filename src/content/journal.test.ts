// GAME-32 · журнал подорожі: кожна прийнята НОВА команда з переліку журналу — рівно один запис;
// повтор того самого commandId, відмова й команди поза переліком — нуль нових записів.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { dispatch, type Command } from '../core/commands';
import { JOURNAL_LIMIT, JOURNAL_TYPES, changedGame, newSim, step, type Input, type SimState } from '../core/sim';
import { moves } from './moves';
import { GAME_DEFS } from './slice-defs';
import { PROLOGUE_BIKE, START_MONEY } from './replay.scenario';

const CTX = { defs: GAME_DEFS };
const listed = (t: string): boolean => (JOURNAL_TYPES as readonly string[]).includes(t);
/** GAME-110: пам'ятні факти, яких до вибору не було, — кожен дає запис Memory (вибір у розмові сам у журнал не пишеться). */
const MEMORABLE = GAME_DEFS.story?.memorable ?? [];
const known = (g: SimState['game']): Set<string> => new Set([...g.flags, ...Object.values(g.npcMemory).flat()]);
const newMemories = (a: SimState['game'], b: SimState['game']): string[] => MEMORABLE.filter((f) => known(b).has(f) && !known(a).has(f));

describe('журнал подорожі (GAME-32)', () => {
  it('Пролог: записів рівно стільки, скільки прийнятих команд із переліку; час — ігрова хвилина тієї миті', () => {
    let s: SimState = newSim(20261023, START_MONEY);
    let expected = 0;
    let memories = 0;
    for (const i of PROLOGUE_BIKE) {
      if (i.kind === 'command') {
        const r = dispatch(s.game, i.command, GAME_DEFS);
        if (r.ok && !r.repeated && listed(i.command.type) && changedGame(s.game, r.state)) {
          expected++;
          const before = s.clock.minutes;
          s = step(s, i, CTX);
          expect(s.journal.at(-1)).toMatchObject({ at: before, commandId: i.command.commandId, type: i.command.type });
          continue;
        }
        if (r.ok && !r.repeated && i.command.type === 'Choose') {
          const facts = newMemories(s.game, r.state);
          expected += facts.length;
          memories += facts.length;
          const before = s.clock.minutes;
          s = step(s, i, CTX);
          expect(s.journal.slice(s.journal.length - facts.length)).toEqual(facts.map((ref) => ({ at: before, commandId: i.command.commandId, type: 'Memory', ref })));
          continue;
        }
      }
      s = step(s, i, CTX);
    }
    expect(s.journal).toHaveLength(expected);
    expect(expected).toBeGreaterThan(10);                                   // журнал справді щось записав
    expect(memories).toBeGreaterThan(0);                                    // і пам'ятний вибір (місце намету) — теж (GAME-110)
    expect(s.journal.map((e) => e.type)).toEqual(expect.arrayContaining(['CreateCharacter', 'Visit', 'BuyItem', 'CompleteQuest', 'Interact']));
    expect(s.journal.some((e) => e.type === ('Talk' as never))).toBe(false); // розмова — не подія журналу
  });

  it('властивість: повтор commandId і відмови не пишуть нічого (fast-check, зерно 20261023, 300 послідовностей)', () => {
    // Ходи — справжні дії зі стану; іноді повторюємо ВЖЕ використаний commandId (як подвійний клік).
    fc.assert(fc.property(fc.array(fc.tuple(fc.nat(1000), fc.boolean(), fc.integer({ min: 1, max: 250 })), { minLength: 5, maxLength: 60 }), (plan) => {
      let s: SimState = newSim(1, 5_000);
      s = step(s, { kind: 'command', command: { type: 'CreateCharacter', commandId: 'j0', profileId: 'profile.solo-explorer', transportId: 'transport.bike' } }, CTX);
      const used: Command[] = [];
      let accepted = 1;
      let n = 1;
      for (const [pick, repeat, ms] of plan) {
        let cmd: Command;
        if (repeat && used.length) cmd = used[pick % used.length] as Command;              // той самий commandId і вміст
        else { const ms_ = moves(s.game, GAME_DEFS); cmd = { ...ms_[pick % ms_.length], commandId: `j${n++}` } as Command; }
        const r = dispatch(s.game, cmd, GAME_DEFS);
        if (r.ok && !r.repeated && listed(cmd.type) && changedGame(s.game, r.state)) accepted++;
        if (r.ok && !r.repeated && cmd.type === 'Choose') accepted += newMemories(s.game, r.state).length;   // GAME-110
        s = step(s, { kind: 'command', command: cmd }, CTX);
        used.push(cmd);
        s = step(s, { kind: 'frame', realMs: ms } as Input, CTX);
      }
      expect(s.journal).toHaveLength(accepted);
      expect(new Set(s.journal.map((e) => e.commandId)).size).toBe(s.journal.length);   // жодного commandId двічі
    }), { seed: 20261023, numRuns: 300 });
  });

  it('дія, що нічого не змінила (прийти туди, де стоїш), — без запису; та сама дія зі зміною — з записом', () => {
    let s: SimState = newSim(1, 5_000);
    const cmd = (c: Record<string, unknown>, id: string): Input => ({ kind: 'command', command: { ...c, commandId: id } as Command });
    s = step(s, cmd({ type: 'CreateCharacter', profileId: 'profile.solo-explorer', transportId: 'transport.bike' }, 'k0'), CTX);
    // GAME-84 №1: ціль «озирнись удома» виконана самим стартом, тож Visit удома нічого не міняє — запису немає (раніше це була «зміна»).
    s = step(s, cmd({ type: 'Visit', locationId: 'loc.home' }, 'k1'), CTX);
    expect(s.journal).toHaveLength(1);
    s = step(s, cmd({ type: 'CompleteQuest', questId: 'PROLOGUE-HOME-001' }, 'k1a'), CTX);
    s = step(s, cmd({ type: 'CompleteQuest', questId: 'ST-001' }, 'k1b'), CTX);
    s = step(s, cmd({ type: 'CompleteQuest', questId: 'ST-002' }, 'k1c'), CTX);
    s = step(s, cmd({ type: 'Visit', locationId: 'loc.shop' }, 'k1d'), CTX);   // справжній переїзд — зміна
    const n = s.journal.length;
    expect(n).toBe(5);
    for (let i = 2; i < 52; i++) s = step(s, cmd({ type: 'Visit', locationId: 'loc.shop' }, `k${i}`), CTX);
    expect(s.journal).toHaveLength(n);
    expect(Object.keys(s.game.processed).length).toBeGreaterThan(50);       // команди справді прийняті, а не відхилені
  });

  it(`журнал тримає лише останні ${JOURNAL_LIMIT} записів — найновіші`, () => {
    let s: SimState = newSim(1, 5_000);
    const cmd = (c: Record<string, unknown>, id: string): Input => ({ kind: 'command', command: { ...c, commandId: id } as Command });
    s = step(s, cmd({ type: 'CreateCharacter', profileId: 'profile.solo-explorer', transportId: 'transport.bike' }, 'p0'), CTX);
    // Журнал уже повний (як після довгої подорожі): нова дія зі зміною витісняє найстаріший запис.
    const old = Array.from({ length: JOURNAL_LIMIT }, (_, i) => ({ at: i, commandId: `old${i}`, type: 'Visit' as const, ref: 'loc.home' }));
    s = { ...s, journal: old };
    s = step(s, cmd({ type: 'CompleteQuest', questId: 'PROLOGUE-HOME-001' }, 'p1'), CTX);
    const id = 2;
    expect(s.journal).toHaveLength(JOURNAL_LIMIT);
    expect(s.journal.at(-1)?.commandId).toBe(`p${id - 1}`);
    expect(s.journal[0]?.commandId).toBe('old1');
  });

  it('позитивний контроль: подвійне натискання — справді та сама команда, і запис один', () => {
    let s = newSim(1, 5_000);
    const c: Input = { kind: 'command', command: { type: 'CreateCharacter', commandId: 'd1', profileId: 'profile.solo-explorer', transportId: 'transport.bike' } };
    s = step(step(s, c, CTX), c, CTX);
    expect(s.journal).toHaveLength(1);
  });
});
