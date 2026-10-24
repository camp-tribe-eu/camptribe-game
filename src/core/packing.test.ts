// GAME-109 · пакування в ядрі: команди йдуть шиною (commandId, відмова без наслідків, журнал, детермінізм, сейв).
import { describe, expect, it } from 'vitest';
import { dispatch, type Command } from './commands';
import { autoPack, packFlag, packedOf, usedUnits } from './packing';
import { PACK_DEFS } from './pack.fixture';
import { fromSave, SAVE_VERSION, serialize } from './save';
import { newSim, run, step, type Input, type SimState } from './sim';
import { BIKER, DRIVER, play } from './story.fixture';
import { initialState, type GameState } from './state';
import type { PackingDefs } from './defs';

const PK = PACK_DEFS.packing as PackingDefs;
const OPEN = { type: 'CompleteQuest', questId: 'q.start' } as const;
const cmd = (commandId: string, c: object): Input => ({ kind: 'command', command: { commandId, ...c } as Command });
const flags = (s: GameState) => s.flags.filter((f) => f.startsWith('f.pack-'));

describe('пакування: команди через шину', () => {
  it('старт персонажа — усе потрібне вже в багажі (автоукладання), решту доводить гравець', () => {
    const s = play([DRIVER], initialState(0), PACK_DEFS);
    expect(flags(s)).toEqual(['f.pack-bag', 'f.pack-tent']);   // стілець (2 од.) уже не вміщається в авто на 4 од.
    expect(usedUnits(s.flags, PK, s.player as NonNullable<GameState['player']>)).toBe(3);
  });

  it('пакування закрите, доки не завершено openAfter, і поза місцями at', () => {
    const early = dispatch(play([DRIVER], initialState(0), PACK_DEFS), { type: 'UnpackItem', commandId: 'p1', itemId: 'item.tent' }, PACK_DEFS);
    expect(early.ok ? 'ok' : early.code).toBe('PACK_CLOSED');
    const away = play([DRIVER, OPEN, { type: 'Visit', locationId: 'loc.shop' }], initialState(0), PACK_DEFS);
    const r = dispatch(away, { type: 'UnpackItem', commandId: 'p2', itemId: 'item.tent' }, PACK_DEFS);
    expect(r.ok ? 'ok' : r.code).toBe('PACK_CLOSED');
  });

  it('покласти / дістати / відмова за місцем: відмова нічого не міняє, крім processed і seq', () => {
    const s0 = play([DRIVER, OPEN], initialState(0), PACK_DEFS);          // авто 4 од.: тент 2 + спальник 1
    const out = dispatch(s0, { type: 'UnpackItem', commandId: 'p3', itemId: 'item.tent' }, PACK_DEFS);
    expect(out.ok && flags(out.state)).toEqual(['f.pack-bag']);
    const chair = dispatch(s0, { type: 'PackItem', commandId: 'p4', itemId: 'item.chair' }, PACK_DEFS);   // 3 + 2 > 4
    expect(chair.ok ? 'ok' : chair.code).toBe('PACK_FULL');
    expect({ ...chair.state, processed: null, seq: null }).toEqual({ ...s0, processed: null, seq: null });
    const unknown = dispatch(s0, { type: 'PackItem', commandId: 'p5', itemId: 'item.dog-bed' }, PACK_DEFS);   // без собаки такої речі немає
    expect(unknown.ok ? 'ok' : unknown.code).toBe('UNKNOWN_ITEM');
  });

  it('той самий commandId — той самий результат без повторного ефекту; інший вміст — COMMAND_ID_REUSED', () => {
    const s0 = play([DRIVER, OPEN], initialState(0), PACK_DEFS);
    const a = dispatch(s0, { type: 'UnpackItem', commandId: 'p6', itemId: 'item.tent' }, PACK_DEFS);
    if (!a.ok) throw new Error(a.code);
    const again = dispatch(a.state, { type: 'UnpackItem', commandId: 'p6', itemId: 'item.tent' }, PACK_DEFS);
    expect(again.ok && again.repeated).toBe(true);
    expect(again.state).toBe(a.state);
    const other = dispatch(a.state, { type: 'UnpackItem', commandId: 'p6', itemId: 'item.bag' }, PACK_DEFS);
    expect(other.ok ? 'ok' : other.code).toBe('COMMAND_ID_REUSED');
  });

  it('AutoPack: повертає набір гри з будь-якого стану; той самий набір — без зміни прапорців', () => {
    const s0 = play([DRIVER, OPEN, { type: 'UnpackItem', itemId: 'item.tent' }, { type: 'PackItem', itemId: 'item.chair' }], initialState(0), PACK_DEFS);
    const r = dispatch(s0, { type: 'AutoPack', commandId: 'p7' }, PACK_DEFS);
    expect(r.ok && flags(r.state)).toEqual(['f.pack-bag', 'f.pack-tent']);
    const p = s0.player as NonNullable<GameState['player']>;
    expect(autoPack(PK, p)).toEqual(['item.tent', 'item.bag']);
  });

  it('лежанка для собаки — лише з собакою: «потрібне» з when', () => {
    const dog = play([{ type: 'CreateCharacter', profileId: 'profile.b', transportId: 'transport.car', animalId: 'animal.dog' }, OPEN], initialState(0), PACK_DEFS);
    expect(packedOf(dog.flags, PK, dog.player as NonNullable<GameState['player']>)).toContain('item.dog-bed');
    const none = play([DRIVER, OPEN], initialState(0), PACK_DEFS);
    expect(none.flags).not.toContain(packFlag('item.dog-bed'));
  });

  it('велосипед: місце 3 — тент 2 + спальник 1 вміщаються, стілець ні', () => {
    const s = play([BIKER, OPEN], initialState(0), PACK_DEFS);
    expect(packedOf(s.flags, PK, s.player as NonNullable<GameState['player']>)).toEqual(['item.tent', 'item.bag']);
    const r = dispatch(s, { type: 'PackItem', commandId: 'p8', itemId: 'item.chair' }, PACK_DEFS);
    expect(r.ok ? 'ok' : r.code).toBe('PACK_FULL');
  });
});

describe('пакування: журнал, детермінізм, сейв', () => {
  const log: Input[] = [
    cmd('j0', { type: 'CreateCharacter', profileId: 'profile.b', transportId: 'transport.car' }),
    cmd('j1', OPEN),
    cmd('j2', { type: 'UnpackItem', itemId: 'item.tent' }),
    cmd('j3', { type: 'PackItem', itemId: 'item.chair' }),
    cmd('j4', { type: 'PackItem', itemId: 'item.tent' }),     // відмова: 1+2+2 > 4
    cmd('j5', { type: 'AutoPack' }),
    cmd('j6', { type: 'AutoPack' }),                           // той самий набір — «порожня» дія
  ];
  const sim = (): SimState => run(newSim(7), log, { defs: PACK_DEFS });

  it('журнал: прийняті зміни пишуться (тип + id речі), відмова й порожня дія — ні', () => {
    expect(sim().journal.map((e) => [e.type, e.ref])).toEqual([
      ['CreateCharacter', 'profile.b'], ['CompleteQuest', 'q.start'], ['UnpackItem', 'item.tent'], ['PackItem', 'item.chair'], ['AutoPack', null],
    ]);
  });

  it('детермінізм: той самий журнал входів — той самий стан побайтно', () => {
    expect(JSON.stringify(sim())).toBe(JSON.stringify(sim()));
  });

  it('сейв: формат лишається v3, прапорці пакування переживають збереження й завантаження', () => {
    expect(SAVE_VERSION).toBe(3);
    const s = step(sim(), cmd('j7', { type: 'UnpackItem', itemId: 'item.bag' }), { defs: PACK_DEFS });
    const back = fromSave(serialize(s));
    expect(back.ok && JSON.stringify(back.sim)).toBe(JSON.stringify(s));
    expect(flags(s.game)).toEqual(['f.pack-tent']);
  });
});
