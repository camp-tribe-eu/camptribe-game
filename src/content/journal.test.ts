// GAME-32 · журнал подорожі: кожна прийнята НОВА команда з переліку журналу — рівно один запис;
// повтор того самого commandId, відмова й команди поза переліком — нуль нових записів.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { dispatch, type Command } from '../core/commands';
import { JOURNAL_TYPES, newSim, step, type Input, type SimState } from '../core/sim';
import { moves } from './moves';
import { GAME_DEFS } from './slice-defs';
import { PROLOGUE_BIKE } from './replay.scenario';

const CTX = { defs: GAME_DEFS };
const listed = (t: string): boolean => (JOURNAL_TYPES as readonly string[]).includes(t);

describe('журнал подорожі (GAME-32)', () => {
  it('Пролог: записів рівно стільки, скільки прийнятих команд із переліку; час — ігрова хвилина тієї миті', () => {
    let s: SimState = newSim(20261023, 5_000);
    let expected = 0;
    for (const i of PROLOGUE_BIKE) {
      if (i.kind === 'command') {
        const r = dispatch(s.game, i.command, GAME_DEFS);
        if (r.ok && !r.repeated && listed(i.command.type)) {
          expected++;
          const before = s.clock.minutes;
          s = step(s, i, CTX);
          expect(s.journal.at(-1)).toMatchObject({ at: before, commandId: i.command.commandId, type: i.command.type });
          continue;
        }
      }
      s = step(s, i, CTX);
    }
    expect(s.journal).toHaveLength(expected);
    expect(expected).toBeGreaterThan(10);                                   // журнал справді щось записав
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
        if (r.ok && !r.repeated && listed(cmd.type)) accepted++;
        s = step(s, { kind: 'command', command: cmd }, CTX);
        used.push(cmd);
        s = step(s, { kind: 'frame', realMs: ms } as Input, CTX);
      }
      expect(s.journal).toHaveLength(accepted);
      expect(new Set(s.journal.map((e) => e.commandId)).size).toBe(s.journal.length);   // жодного commandId двічі
    }), { seed: 20261023, numRuns: 300 });
  });

  it('позитивний контроль: подвійне натискання — справді та сама команда, і запис один', () => {
    let s = newSim(1, 5_000);
    const c: Input = { kind: 'command', command: { type: 'CreateCharacter', commandId: 'd1', profileId: 'profile.solo-explorer', transportId: 'transport.bike' } };
    s = step(step(s, c, CTX), c, CTX);
    expect(s.journal).toHaveLength(1);
  });
});
