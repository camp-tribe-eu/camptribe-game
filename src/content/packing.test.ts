// GAME-109 · «Укласти автоматично» на справжньому контенті: завжди в межах місця й завжди з усім «потрібним»;
// екран пакування (знімок для UI) показує те саме, що веде ядро.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { enumerateCombos } from '../../scripts/validator/combos.mjs';
import { dispatch, nextCommandId, type Command } from '../core/commands';
import type { PackingDefs } from '../core/defs';
import { autoPack, capacityOf, packFlag, packItemsFor, packedOf, usedUnits } from '../core/packing';
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
  it('для гравця з кішкою — рівно 12 речей, групи «потрібне», «корисне», «можна лишити» непорожні', () => {
    const cat = packItemsFor(PK, player({ profile: 'profile.family-teen', transport: 'transport.car', animal: 'animal.cat' }));
    expect(cat).toHaveLength(12);
    expect(new Set(cat.map((i) => i.group))).toEqual(new Set(['needed', 'useful', 'leave']));
    // Без кішки переноски немає, і на велосипеді її теж ніхто не побачить (кішка їде лише авто).
    const bike = packItemsFor(PK, player({ profile: 'profile.solo-explorer', transport: 'transport.bike', animal: NO_ANIMAL }));
    expect(bike.map((i) => i.itemId)).not.toContain('item.mia-carrier');
    expect(bike).toHaveLength(9);
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
      send({ type: 'CompleteQuest', questId: 'ST-001' }); send({ type: 'CompleteQuest', questId: 'ST-002' });
      send({ type: 'Visit', locationId: 'loc.shop' }); send({ type: 'Pickup', itemId: 'item.tent' }); send({ type: 'Pickup', itemId: 'item.sleeping-bag' });
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
    const tight: PackingDefs = { ...PK, capacity: { ...PK.capacity, 'transport.bike': 8 } };   // «потрібного» 9 од.
    expect(sound(tight, p, autoPack(tight, p)).needed).toBe(false);
    const all = packItemsFor(PK, p).map((i) => i.itemId);                                      // «візьмемо все» — 15 од. на велосипеді
    expect(sound(PK, p, all).within).toBe(false);
  });
});

describe('екран пакування (знімок для UI) ≡ ядро', () => {
  const open = (transport: string) => {
    let sim = newSim(1, 5_000);
    const send = (c: object): void => { sim = step(sim, { kind: 'command', command: { ...c, commandId: nextCommandId(sim.game) } as Command }, { defs: GAME_DEFS }); };
    send({ type: 'CreateCharacter', profileId: 'profile.solo-explorer', transportId: transport });
    const before = storyOffer(sim, GAME_DEFS).offer.packing;
    send({ type: 'CompleteQuest', questId: 'ST-001' }); send({ type: 'CompleteQuest', questId: 'ST-002' });
    send({ type: 'Visit', locationId: 'loc.shop' }); send({ type: 'Pickup', itemId: 'item.tent' }); send({ type: 'Pickup', itemId: 'item.sleeping-bag' });
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
    expect(pk?.capacity).toBe(10);
    expect(pk?.used).toBe(10);                                    // автоукладання: 9 «потрібного» + ліхтар
    expect(pk?.groups.map((g) => g.group)).toEqual(['needed', 'useful', 'leave']);
    expect(pk?.groups.flatMap((g) => g.items).length).toBe(9);
    // Кожна дія з екрана — справді прийнята ядром команда; річ, що не вміщається, дії не має.
    for (const i of pk?.groups.flatMap((g) => g.items) ?? []) {
      if (i.action) expect(o.offer.intents.has(i.action.id)).toBe(true);
      else expect(i.packed).toBe(false);
    }
    expect(pk?.groups.flatMap((g) => g.items).filter((i) => i.action === null).length).toBeGreaterThan(0);
    // Підпис: з наметом нічого, без намету — для велосипеда свій.
    expect(pk?.noteKey).toBeNull();
  });

  it('без намету велосипедист бачить підпис про альтанку, водій — про авто', () => {
    for (const [transport, key] of [['transport.bike', 'pack.note.tent-bike'], ['transport.car', 'pack.note.tent-car']] as const) {
      const o = open(transport);
      const tent = o.offer.offer.packing?.groups.flatMap((g) => g.items).find((i) => i.key === 'item.tent');
      const act = o.offer.intents.get(tent?.action?.id ?? '');
      expect(act).toEqual({ type: 'UnpackItem', itemId: 'item.tent' });
      const after = step(o.sim, { kind: 'command', command: { ...act, commandId: nextCommandId(o.sim.game) } as Command }, { defs: GAME_DEFS });
      expect(storyOffer(after, GAME_DEFS).offer.packing?.noteKey).toBe(key);
    }
  });

  it('у розмові й після виходу з пакувальних місць екрана пакування немає', () => {
    const o = open('transport.bike');
    const road = step(o.sim, { kind: 'command', command: { type: 'Visit', locationId: 'loc.road', commandId: nextCommandId(o.sim.game) } }, { defs: GAME_DEFS });
    expect(storyOffer(road, GAME_DEFS).offer.packing).toBeNull();
    const g: GameState = road.game;
    expect(g.player?.locationId).toBe('loc.road');
  });
});
