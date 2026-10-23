// GAME-33 · властивість сейву: serialize → fromSave не губить нічого (однаковий stateHash), а
// serialize∘fromSave∘serialize — ідемпотентний. Випадкові послідовності валідних входів із нової гри.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Command } from './commands';
import type { CoreDefs } from './defs';
import { DEFS } from './determinism.fixture';
import { stateHash } from './hash';
import { fromSave, serialize } from './save';
import { newSim, run, type Input } from './sim';
import { BIKER, DRIVER, GEAR_DEFS, type Step } from './story.fixture';

/** Фіксоване зерно: збій відтворюється тим самим числом. */
const SEED = 20261023;

// Абетка валідних входів: кадри, пауза, довгі дії і команди, що змінюють УСІ частини стану — персонаж, квести,
// діалог, предмети, гроші, спорядження (рецензія PR #34: з самим Interact властивість не бачила inventory/quests).
// Каталог — сюжет зі спорядженням (GEAR_DEFS) плюс 5 точок нагород (DEFS). Відмовлені команди теж лишаються в журналі
// (processed) — і це теж стан, який сейв мусить зберегти.
const PROP_DEFS: CoreDefs = { ...GEAR_DEFS, interactions: DEFS.interactions };
const ITEMS = Object.keys(GEAR_DEFS.items);
const pick = <T>(xs: readonly T[]) => fc.constantFrom(...xs);
const cmd = (command: Step): Input => ({ kind: 'command', command: { ...command, commandId: 'x' } as Command });
const input: fc.Arbitrary<Input> = fc.oneof(
  fc.integer({ min: 16, max: 5000 }).map((realMs): Input => ({ kind: 'frame', realMs })),
  fc.integer({ min: 1, max: 600 }).map((minutes): Input => ({ kind: 'advance', minutes })),
  fc.constant<Input>({ kind: 'pause' }),
  fc.constant<Input>({ kind: 'resume' }),
  pick([BIKER, DRIVER]).map((c) => cmd(c)),
  pick(['loc.home', 'loc.shop', 'loc.dogpark']).map((locationId) => cmd({ type: 'Visit', locationId })),
  fc.integer({ min: 0, max: 6 }).map((choice) => cmd({ type: 'Choose', choice })),
  fc.constant(cmd({ type: 'Continue' })),
  pick(['item.wood', 'item.gold']).map((itemId) => cmd({ type: 'Pickup', itemId })),
  pick(['q.start', 'q.mid', 'q.side', 'q.gate', 'q.end']).map((questId) => cmd({ type: 'CompleteQuest', questId })),
  pick(ITEMS).map((itemId) => cmd({ type: 'BuyItem', itemId })),
  pick(ITEMS).map((itemId) => cmd({ type: 'SellItem', itemId })),
  pick(ITEMS).map((itemId) => cmd({ type: 'DryGear', itemId })),
  fc.integer({ min: 0, max: 4 }).map((n) => cmd({ type: 'Interact', targetId: `obj.spot-${n}` })),
);
// Зв'язки, які окремі випадкові команди майже не складають: розмова з виборами (прапори, пам'ять NPC) і поїздки
// туди-назад зі спорядженням (дощ на дорозі мочить намет — gear). Без них ці частини стану в вибірці ~0 (виміряно).
const chunk: fc.Arbitrary<Input[]> = fc.oneof(
  { weight: 4, arbitrary: input.map((x) => [x]) },
  // Розмова — лише тут (окремий Talk без виходу лишав гравця в діалозі до кінця прогону, IN_DIALOGUE на все). Випадковий вибір частіше за все недоступний (CONDITION_FAILED) і лишає гравця в діалозі; тому після нього —
  // завжди доступний вибір 2 в Енн («бувай», ставить f.met) і Continue: розмова закінчується, прапор і пам'ять лягають у стан.
  { weight: 1, arbitrary: fc.integer({ min: 0, max: 6 })
    .map((choice) => [cmd({ type: 'Visit', locationId: 'loc.home' }), cmd({ type: 'CompleteQuest', questId: 'q.start' }), cmd({ type: 'Visit', locationId: 'loc.shop' }), cmd({ type: 'Talk', npcId: 'npc.ann' }), cmd({ type: 'Choose', choice }),
      cmd({ type: 'Choose', choice: 2 }), cmd({ type: 'Continue' })]) },
  // Погода — на день (SIM-WX-005): поїздки розносимо по днях, щоб деякі випали на дощ і намочили спорядження.
  { weight: 1, arbitrary: fc.tuple(pick(['item.tent-a', 'item.bag-a']), fc.integer({ min: 1, max: 4 }))
    .map(([itemId, trips]) => [cmd(DRIVER), cmd({ type: 'BuyItem', itemId }),
      ...Array.from({ length: trips }, (): Input[] => [cmd({ type: 'Visit', locationId: 'loc.shop' }), { kind: 'advance', minutes: 1440 },
        cmd({ type: 'Visit', locationId: 'loc.home' })]).flat()]) },
);
const journal = (opts: { minLength?: number; maxLength: number }) => fc.array(chunk, opts).map((xs) => xs.flat());

// commandId має бути детермінованим у межах одного прогону, тож нумеруємо після генерації.
const numbered = (xs: readonly Input[]): Input[] =>
  xs.map((x, i) => (x.kind === 'command' ? { kind: 'command', command: { ...x.command, commandId: `c${i}` } } as Input : x));

const play = (seed: number, log: readonly Input[]) => run(newSim(seed, 50_000), numbered(log), { defs: PROP_DEFS });

describe('властивість сейву (GAME-33, fast-check)', () => {
  it('fromSave(serialize(s)) дає той самий stateHash; serialize∘fromSave∘serialize — ідемпотентний', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 2 ** 31 }), journal({ maxLength: 60 }), (seed, log) => {
      const s = play(seed, log);
      const text = serialize(s);
      const r = fromSave(text);
      expect(r.ok, r.ok ? '' : `${r.code}: ${r.detail}`).toBe(true);
      if (!r.ok) return;
      expect(stateHash(r.sim)).toBe(stateHash(s));
      expect(serialize(r.sim)).toBe(text);
    }), { seed: SEED, numRuns: 300 });
  });

  it('позитивний контроль: вибірка справді змінює КОЖНУ частину стану (інакше властивість порожня для неї)', () => {
    const base = newSim(0, 50_000).game;
    const parts = ['moneyCents', 'inventory', 'grants', 'player', 'quests', 'flags', 'npcMemory', 'gear', 'processed'] as const;
    const changed: Record<string, number> = Object.fromEntries(parts.map((p) => [p, 0]));
    fc.assert(fc.property(fc.integer({ min: 0, max: 2 ** 31 }), journal({ minLength: 10, maxLength: 60 }), (seed, log) => {
      const g = play(seed, log).game;
      for (const p of parts) if (JSON.stringify(g[p]) !== JSON.stringify(base[p])) changed[p] = (changed[p] ?? 0) + 1;
    }), { seed: SEED, numRuns: 100 });
    // Поріг 5 зі 100: частина не може тихо випасти з вибірки. Виміряно на SEED: гроші 98, предмети 93, нагороди 60,
    // персонаж 95, квести 95, прапори 78, пам'ять NPC 6 (лише велосипедист у розмові з Енн), спорядження 43, журнал 100.
    for (const p of parts) expect(changed[p], `${p}: ${JSON.stringify(changed)}`).toBeGreaterThanOrEqual(5);
  });
});
