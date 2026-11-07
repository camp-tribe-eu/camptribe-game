// GAME-109 · «Укласти автоматично» на справжньому контенті: завжди в межах місця й завжди з усім «потрібним»;
// екран пакування (знімок для UI) показує те саме, що веде ядро.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { enumerateCombos } from '../../scripts/validator/combos.mjs';
import { dispatch, nextCommandId, type Command } from '../core/commands';
import type { PackingDefs } from '../core/defs';
import { autoPack, capacityOf, carriedOf, loadCarSet, overflowCandidates, packFlag, packItemsFor, packedOf, takeFlag, usedUnits, withLoaded } from '../core/packing';
import { newSim, step } from '../core/sim';
import type { GameState, PlayerState } from '../core/state';
import { initialState } from '../core/state';
import { storyOffer } from '../view/story-offer';
import { GAME_DEFS } from './slice-defs';
import { CONTENT } from './story';

const PK = GAME_DEFS.packing as PackingDefs;
const NO_ANIMAL = 'animal.none';
const combos = enumerateCombos(CONTENT);
const player = (k: { profile: string | null; transport: string | null; animal: string | null }): PlayerState =>
  ({ profileId: k.profile ?? '', transportId: k.transport ?? '', animalId: k.animal ?? NO_ANIMAL, locationId: 'loc.shop' });

/** Автоукладання в межах місця й із усім «потрібним» (для гравця p). Окрема функція — щоб її саму можна було дати зламаному набору. */
const sound = (pk: PackingDefs, p: PlayerState, set: readonly string[]): { within: boolean; needed: boolean } => {
  const items = packItemsFor(pk, p);
  const units = set.reduce((a, id) => a + (items.find((i) => i.itemId === id)?.units ?? 0), 0);
  return { within: units <= capacityOf(pk, p.transportId), needed: items.filter((i) => i.group === 'needed').every((i) => set.includes(i.itemId)) };
};

describe('контент пакування: 12 речей у трьох групах', () => {
  it('для гравця з кішкою — рівно 17 речей (12 + документи, гаманець, телефони, аптечка, одяг), групи «потрібне», «корисне», «можна лишити» непорожні', () => {
    const cat = packItemsFor(PK, player({ profile: 'profile.family-teen', transport: 'transport.car', animal: 'animal.cat' }));
    expect(cat).toHaveLength(17);
    expect(new Set(cat.map((i) => i.group))).toEqual(new Set(['needed', 'useful', 'leave']));
    // Без кішки переноски немає, і на велосипеді її теж ніхто не побачить (кішка їде лише авто).
    const bike = packItemsFor(PK, player({ profile: 'profile.solo-explorer', transport: 'transport.bike', animal: NO_ANIMAL }));
    expect(bike.map((i) => i.itemId)).not.toContain('item.mia-carrier');
    expect(bike).toHaveLength(14);
  });
});

describe('укласти автоматично: завжди в межах місця й завжди з усім «потрібним»', () => {
  it('усі комбінації профіль × транспорт × тварина (вичерпно)', () => {
    expect(combos.length).toBeGreaterThan(1);
    for (const k of combos) {
      const p = player(k);
      const r = sound(PK, p, autoPack(PK, p));
      expect(r, `${k.profile} · ${k.transport} · ${k.animal}`).toEqual({ within: true, needed: true });
    }
  });

  it('властивість: з будь-якого попереднього набору команда AutoPack дає той самий набір, у межах місця, з усім «потрібним» (fast-check)', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: combos.length - 1 }), fc.integer({ min: 0, max: 4095 }), (ci, mask) => {
      const k = combos[ci] as (typeof combos)[number];
      // Стан «пакування відкрите»: персонаж, ST-001…ST-003, крамниця; далі довільний набір прапорців речей.
      let s = initialState(5_000);
      const send = (m: object): void => {
        const r = dispatch(s, { ...m, commandId: nextCommandId(s) } as Command, GAME_DEFS);
        if (!r.ok) throw new Error(`${JSON.stringify(m)} → ${r.code}`);
        s = r.state;
      };
      send({ type: 'CreateCharacter', profileId: k.profile, transportId: k.transport, ...(k.animal === NO_ANIMAL ? {} : { animalId: k.animal }) });
      send({ type: 'CompleteQuest', questId: 'PROLOGUE-HOME-001' }); send({ type: 'CompleteQuest', questId: 'ST-001' }); send({ type: 'CompleteQuest', questId: 'ST-002' });
      send({ type: 'Visit', locationId: 'loc.shop' }); send({ type: 'Pickup', itemId: 'item.tent' }); send({ type: 'Pickup', itemId: 'item.sleeping-bag' }); send({ type: 'Checkout' });
      send({ type: 'CompleteQuest', questId: 'ST-003' });
      const p = s.player as PlayerState;
      for (const [n, i] of packItemsFor(PK, p).entries()) {
        const on = s.flags.includes(packFlag(i.itemId));
        const want = ((mask >> n) & 1) === 1;
        const r = dispatch(s, { type: want ? 'PackItem' : 'UnpackItem', itemId: i.itemId, commandId: nextCommandId(s) } as Command, GAME_DEFS);
        if (on !== want && r.ok) s = r.state;
      }
      expect(usedUnits(s.flags, PK, p)).toBeLessThanOrEqual(capacityOf(PK, p.transportId));
      send({ type: 'AutoPack' });
      const packed = packedOf(s.flags, PK, p);
      expect(packed).toEqual(autoPack(PK, p).sort((a, b) => PK.items.findIndex((x) => x.itemId === a) - PK.items.findIndex((x) => x.itemId === b)));
      expect(sound(PK, p, packed)).toEqual({ within: true, needed: true });
    }), { numRuns: 400, seed: 20261024 });
  });

  it('НЕГАТИВНИЙ КОНТРОЛЬ: сторож уміє червоніти — «потрібного» більше за місце дає needed=false, жадібний набір без пріоритету — within=false', () => {
    const p = player({ profile: 'profile.solo-explorer', transport: 'transport.bike', animal: NO_ANIMAL });
    const tight: PackingDefs = { ...PK, capacity: { ...PK.capacity, 'transport.bike': 8 } };   // «потрібного» 11 од.
    expect(sound(tight, p, autoPack(tight, p)).needed).toBe(false);
    const all = packItemsFor(PK, p).map((i) => i.itemId);                                      // «візьмемо все» — 21 од. на велосипеді
    expect(sound(PK, p, all).within).toBe(false);
  });
});

describe('екран пакування (знімок для UI) ≡ ядро', () => {
  const open = (transport: string) => {
    let sim = newSim(1, 5_000);
    const send = (c: object): void => { sim = step(sim, { kind: 'command', command: { ...c, commandId: nextCommandId(sim.game) } as Command }, { defs: GAME_DEFS }); };
    send({ type: 'CreateCharacter', profileId: 'profile.solo-explorer', transportId: transport });
    const before = storyOffer(sim, GAME_DEFS).offer.packing;
    send({ type: 'CompleteQuest', questId: 'PROLOGUE-HOME-001' }); send({ type: 'CompleteQuest', questId: 'ST-001' }); send({ type: 'CompleteQuest', questId: 'ST-002' });
    send({ type: 'Visit', locationId: 'loc.shop' }); send({ type: 'Pickup', itemId: 'item.tent' }); send({ type: 'Pickup', itemId: 'item.sleeping-bag' }); send({ type: 'Checkout' });
    const midway = storyOffer(sim, GAME_DEFS).offer.packing;
    send({ type: 'CompleteQuest', questId: 'ST-003' });
    return { sim, before, midway, offer: storyOffer(sim, GAME_DEFS) };
  };

  it('закрите, доки ST-003 не завершено; після — місце, групи й дії збігаються з ядром', () => {
    const o = open('transport.bike');
    expect(o.before).toBeNull();
    expect(o.midway).toBeNull();
    const pk = o.offer.offer.packing;
    expect(pk).not.toBeNull();
    expect(pk?.capacity).toBe(12);
    expect(pk?.used).toBe(12);                                    // автоукладання: 11 «потрібного» + ліхтар
    expect(pk?.groups.map((g) => g.group)).toEqual(['needed', 'useful', 'leave']);
    expect(pk?.groups.flatMap((g) => g.items).length).toBe(14);
    // GAME-245: екран лише читає — жодної дії «покласти/дістати» на речах (ні тумблерів, ні автоукладання); єдина дія — «Завантажити», і вона є лише коли є що завантажити.
    for (const i of pk?.groups.flatMap((g) => g.items) ?? []) expect(Object.keys(i).sort()).toEqual(['key', 'state', 'units']);
    expect(pk?.load).toBeNull();                                  // усе вже в авто (старт «за порадою»): завантажувати нічого
    expect(pk?.total).toBe(11);                                   // потрібне 6 + корисне 5 (група «можна лишити» у прогрес не рахується)
    expect(pk?.taken).toBe(7);                                    // автоукладання вмістило 12 од.: 6 потрібного, ліхтар й ще одну корисну річ
    // Підпис: з наметом нічого, без намету — для велосипеда свій.
    expect(pk?.noteKey).toBeNull();
  });

  it('без намету велосипедист бачить підпис про альтанку, водій — про авто', () => {
    for (const [transport, key] of [['transport.bike', 'pack.note.tent-bike'], ['transport.car', 'pack.note.tent-car']] as const) {
      const o = open(transport);
      const after = step(o.sim, { kind: 'command', command: { type: 'UnpackItem', itemId: 'item.tent', commandId: nextCommandId(o.sim.game) } as Command }, { defs: GAME_DEFS });
      expect(storyOffer(after, GAME_DEFS).offer.packing?.noteKey).toBe(key);
    }
  });

  it('у розмові й після виходу з пакувальних місць екрана пакування немає', () => {
    const o = open('transport.bike');
    // GAME-138: дорога відкривається після CH1-HOME-001 (пакування вдома) — спершу додому й завершити його.
    let home = o.sim;
    for (const c of [{ type: 'Visit', locationId: 'loc.home' }, { type: 'CompleteQuest', questId: 'CH1-HOME-001' }]) {
      home = step(home, { kind: 'command', command: { ...c, commandId: nextCommandId(home.game) } as Command }, { defs: GAME_DEFS });
    }
    expect(home.game.quests['CH1-HOME-001']?.status).toBe('completed');
    const road = step(home, { kind: 'command', command: { type: 'Visit', locationId: 'loc.road', commandId: nextCommandId(home.game) } }, { defs: GAME_DEFS });
    expect(storyOffer(road, GAME_DEFS).offer.packing).toBeNull();
    const g: GameState = road.game;
    expect(g.player?.locationId).toBe('loc.road');
  });
});

// GAME-245 · речі на своїх місцях удома: взяти раз, завантажити одним рухом, не влізло — вибір «що лишимо вдома».
describe('GAME-245: узяти / завантажити / лишити (ядро)', () => {
  const start = (transport: string, animal?: string) => {
    let s = initialState(5_000);
    const send = (m: object): { ok: boolean; code?: string } => {
      const r = dispatch(s, { ...m, commandId: nextCommandId(s) } as Command, GAME_DEFS);
      if (r.ok) s = r.state;
      return r.ok ? { ok: true } : { ok: false, code: r.code };
    };
    send({ type: 'CreateCharacter', profileId: 'profile.solo-explorer', transportId: transport, ...(animal ? { animalId: animal } : {}) });
    for (const q of ['PROLOGUE-HOME-001', 'ST-001', 'ST-002']) send({ type: 'CompleteQuest', questId: q });
    send({ type: 'Visit', locationId: 'loc.shop' }); send({ type: 'Pickup', itemId: 'item.tent' }); send({ type: 'Pickup', itemId: 'item.sleeping-bag' }); send({ type: 'Checkout' });
    send({ type: 'CompleteQuest', questId: 'ST-003' });
    // Старт «за порадою» складає все в авто; удома його розкладають (як map-first unpackMoves) — речі знову на своїх місцях.
    for (const id of packedOf(s.flags, PK, s.player as PlayerState)) send({ type: 'UnpackItem', itemId: id });
    return { get s(): GameState { return s; }, send, p: (): PlayerState => s.player as PlayerState };
  };
  const ids = (p: PlayerState): string[] => packItemsFor(PK, p).map((i) => i.itemId);

  it('взяти — в один бік: повторне «взяти» відхилено, назад із сумки повертає лише «лишити» (не тумблер)', () => {
    const g = start('transport.bike');
    expect(g.send({ type: 'TakeItem', itemId: 'item.lantern' })).toEqual({ ok: true });
    expect(g.s.flags).toContain(takeFlag('item.lantern'));
    expect(g.send({ type: 'TakeItem', itemId: 'item.lantern' })).toEqual({ ok: false, code: 'PACK_ALREADY' });
    expect(carriedOf(g.s.flags, PK, g.p())).toEqual(['item.lantern']);
    expect(g.send({ type: 'TakeItem', itemId: 'item.mia-carrier' }).code).toBe('UNKNOWN_ITEM');   // без кішки такої речі нема
  });

  it('«Завантажити» кладе в авто все взяте, сумка порожніє, прапорців «у сумці» не лишається', () => {
    const g = start('transport.bike');
    for (const id of ['item.documents', 'item.wallet', 'item.snacks']) expect(g.send({ type: 'TakeItem', itemId: id }).ok).toBe(true);
    expect(g.send({ type: 'LoadCar' })).toEqual({ ok: true });
    expect(packedOf(g.s.flags, PK, g.p())).toEqual(['item.documents', 'item.wallet', 'item.snacks']);
    expect(carriedOf(g.s.flags, PK, g.p())).toEqual([]);
    expect(g.send({ type: 'LoadCar' }).code).toBe('PACK_NOT_PACKED');   // порожня сумка — нічого завантажувати
  });

  it('не влізло: «потрібне» лишається в авто, надлишок — у сумці; «лишити» повертає річ додому (прапорця немає) і сумка порожніє', () => {
    const g = start('transport.bike');
    for (const id of ids(g.p())) g.send({ type: 'TakeItem', itemId: id });   // вся хата: 21 од. на 12
    expect(g.send({ type: 'LoadCar' })).toEqual({ ok: true });
    const used = usedUnits(g.s.flags, PK, g.p());
    expect(used).toBeLessThanOrEqual(12);
    const items = packItemsFor(PK, g.p());
    expect(items.filter((i) => i.group === 'needed').every((i) => g.s.flags.includes(packFlag(i.itemId)))).toBe(true);
    const over = overflowCandidates(PK, g.p(), g.s.flags);
    expect(over.length).toBeGreaterThan(0);
    expect(over[0]?.group).toBe('leave');                              // спершу «можна лишити»
    for (const o of over) {
      expect(g.send({ type: 'LeaveItem', itemId: o.itemId })).toEqual({ ok: true });
      expect(g.s.flags).not.toContain(takeFlag(o.itemId));            // вдома: ні в сумці, ні в авто
      expect(g.s.flags).not.toContain(packFlag(o.itemId));
    }
    expect(carriedOf(g.s.flags, PK, g.p())).toEqual([]);
  });

  it('НЕ ТУПИК: пізно взяте «потрібне» витісняє раніше завантажену подушку, а не застрягає — потрібне завжди в авто, сумка порожніє після «лишити»', () => {
    const g = start('transport.bike');
    const pick = (list: string[]): void => { for (const id of list) g.send({ type: 'TakeItem', itemId: id }); g.send({ type: 'LoadCar' }); };
    pick(['item.big-cushion', 'item.lantern-2', 'item.lantern-3', 'item.clothes', 'item.first-aid', 'item.phones', 'item.snacks', 'item.lantern']);   // 12 од. «лишнього» вже в авто
    pick(ids(g.p()).filter((id) => PK.items.find((i) => i.itemId === id)?.group === 'needed'));
    const needed = packItemsFor(PK, g.p()).filter((i) => i.group === 'needed');
    expect(needed.every((i) => g.s.flags.includes(packFlag(i.itemId))), 'усе потрібне в авто').toBe(true);
    for (const o of overflowCandidates(PK, g.p(), g.s.flags)) g.send({ type: 'LeaveItem', itemId: o.itemId });
    expect(carriedOf(g.s.flags, PK, g.p())).toEqual([]);              // вихід є: авто не блокує виїзд
    expect(usedUnits(g.s.flags, PK, g.p())).toBeLessThanOrEqual(12);
  });

  it('усі комбінації профіль × транспорт × тварина: взяти все → «Завантажити» → «лишити» кожне зайве → сумка порожня, «потрібне» в авто', () => {
    for (const k of combos) {
      const p = player(k);
      let flags: string[] = [];
      for (const i of packItemsFor(PK, p)) flags.push(takeFlag(i.itemId));
      flags = withLoaded(flags, PK, loadCarSet(PK, p, flags));
      for (const o of overflowCandidates(PK, p, flags)) flags = flags.filter((f) => f !== takeFlag(o.itemId));
      const label = `${k.profile} · ${k.transport} · ${k.animal}`;
      expect(carriedOf(flags, PK, p), label).toEqual([]);
      expect(sound(PK, p, packedOf(flags, PK, p)), label).toEqual({ within: true, needed: true });
    }
  });
});
