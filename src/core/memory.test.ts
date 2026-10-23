// GAME-48 · пам'ять NPC у ядрі: ефект `remember`, умови `remembers`/`notRemembers`, і головне правило
// картки — `npcMemory` змінюється ЛИШЕ прийнятою командою Choose з ефектом remember у розмові з NPC.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { dispatch, type Command } from './commands';
import { checkDefs, type CoreDefs, type StoryDefs } from './defs';
import { stateHash } from './hash';
import { newSim, step, type Input, type SimState, type StepCtx } from './sim';
import { holds, type StoryDraft } from './story';
import { BIKER, DRIVER, EVENT_DEFS, play, STORY_DEFS, type Step } from './story.fixture';
import type { GameState, PlayerState } from './state';

const tryCmd = (s: GameState, c: Step, defs: CoreDefs = STORY_DEFS) => dispatch(s, { ...c, commandId: 'x1' } as Command, defs);
const START = [{ type: 'Visit', locationId: 'loc.home' }, { type: 'CompleteQuest', questId: 'q.start' }] as const;
const AT_ANN = [...START, { type: 'Visit', locationId: 'loc.shop' }, { type: 'Talk', npcId: 'npc.ann' }] as const;
// У dlg.ann: 0 — велосипедна відповідь (setFlag f.biker + remember m.biker), 2 — «бувай» (безумовна),
// 5 — лише тому, кого Енн пам'ятає велосипедистом, 6 — лише тому, кого не пам'ятає.
const BIKE = 0, BYE = 2, REMEMBERS = 5, NOT_REMEMBERS = 6;
const hashOf = (s: GameState) => stateHash({ ...s, processed: null, seq: null });

describe('пам\'ять NPC: ефект і умови (GAME-48)', () => {
  it('новий стан — ніхто нічого не пам\'ятає', () => {
    expect(play([DRIVER]).npcMemory).toEqual({});
  });

  it('remember запам\'ятовує факт саме NPC розмови; повтор не дублює', () => {
    const once = play([BIKER, ...AT_ANN, { type: 'Choose', choice: BIKE }]);
    expect(once.npcMemory).toEqual({ 'npc.ann': ['m.biker'] });
    const twice = play([{ type: 'Continue' }, { type: 'Continue' }, { type: 'Talk', npcId: 'npc.ann' }, { type: 'Choose', choice: BIKE }], once);
    expect(twice.npcMemory).toEqual({ 'npc.ann': ['m.biker'] });
  });

  it('факти відсортовано й без повторів (форма, яку перевіряє сейв)', () => {
    const defs = structuredClone(STORY_DEFS) as CoreDefs & { story: { dialogues: Record<string, { nodes: Record<string, { choices?: { effects: unknown[] }[] }> }> } };
    const c = defs.story.dialogues['dlg.ann']?.nodes['hi']?.choices?.[BIKE];
    if (c) c.effects = [{ remember: 'm.alpha' }, { remember: 'm.zeta' }, { remember: 'm.alpha' }];   // вставка без сортування (на початок) дала б [zeta, alpha]
    const s = play([BIKER, ...AT_ANN, { type: 'Choose', choice: BIKE }], undefined, defs);
    expect(s.npcMemory).toEqual({ 'npc.ann': ['m.alpha', 'm.zeta'] });
  });

  it('remembers: другий раз Енн упізнає велосипедиста; хто їй цього не казав — CONDITION_FAILED і стан той самий', () => {
    const first = play([BIKER, ...AT_ANN]);
    const r = tryCmd(first, { type: 'Choose', choice: REMEMBERS });
    expect(r).toMatchObject({ ok: false, code: 'CONDITION_FAILED' });
    expect(hashOf(r.state)).toBe(hashOf(first));
    expect(tryCmd(first, { type: 'Choose', choice: NOT_REMEMBERS }).ok).toBe(true);

    const again = play([{ type: 'Choose', choice: BIKE }, { type: 'Continue' }, { type: 'Continue' }, { type: 'Talk', npcId: 'npc.ann' }], first);
    expect(play([{ type: 'Choose', choice: REMEMBERS }], again).dialogue).toEqual({ id: 'dlg.ann', node: 'gossip' });
    expect(tryCmd(again, { type: 'Choose', choice: NOT_REMEMBERS })).toMatchObject({ ok: false, code: 'CONDITION_FAILED' });
  });

  it('пам\'ять — власна: Боб не пам\'ятає того, що запам\'ятала Енн', () => {
    const s = play([BIKER, ...AT_ANN, { type: 'Choose', choice: BIKE }]);
    const p = s.player as PlayerState;
    const d = s as unknown as StoryDraft;
    expect(holds({ remembers: 'm.biker' }, d, p, 'npc.ann')).toBe(true);
    expect(holds({ remembers: 'm.biker' }, d, p, 'npc.bob')).toBe(false);
    expect(holds({ notRemembers: 'm.biker' }, d, p, 'npc.bob')).toBe(true);
    // Без NPC (подія в дорозі) — ніхто нічого не пам'ятає.
    expect(holds({ remembers: 'm.biker' }, d, p)).toBe(false);
    expect(holds({ notRemembers: 'm.biker' }, d, p)).toBe(true);
    // Усередині all/any — та сама пам'ять того самого NPC.
    expect(holds({ all: [{ flag: 'f.biker' }, { any: [{ flag: 'f.never' }, { remembers: 'm.biker' }] }] }, d, p, 'npc.ann')).toBe(true);
    expect(holds({ all: [{ flag: 'f.biker' }, { any: [{ flag: 'f.never' }, { remembers: 'm.biker' }] }] }, d, p, 'npc.bob')).toBe(false);
  });

  it('remember у події в дорозі (без NPC): checkDefs — DEFS_BAD_REF, а гра нічого не запам\'ятовує й не замикає', () => {
    const story = EVENT_DEFS.story as StoryDefs;
    const ev = story.dialogues['dlg.ev-rain'] as StoryDefs['dialogues'][string];
    const defs: CoreDefs = { ...EVENT_DEFS, story: { ...story, dialogues: { ...story.dialogues, 'dlg.ev-rain': { ...ev, nodes: { ...ev.nodes, rain: { choices: [{ next: 'bye', effects: [{ remember: 'm.wet' }] }] } } } } } };
    expect(checkDefs(defs)).toEqual([{ code: 'DEFS_BAD_REF', where: 'dlg.ev-rain/rain: remember without npcId' }]);
    expect(checkDefs(EVENT_DEFS)).toEqual([]);                                // позитивний контроль
    const s = play([BIKER, START[0], START[1], { type: 'Visit', locationId: 'loc.shop' }, { type: 'RoadEvent', eventId: 'dlg.ev-rain' }], undefined, defs);
    const after = play([{ type: 'Choose', choice: 0 }], s, defs);
    expect(after.npcMemory).toEqual({});
    expect(after.dialogue).toEqual({ id: 'dlg.ev-rain', node: 'bye' });
  });
});

// ── властивість картки: пам'ять змінює лише прийнята команда Choose з ефектом remember ──────────

const DEFS: CoreDefs = EVENT_DEFS;   // сюжет + дороги + подія в дорозі: годинник, RNG і кидок події теж у грі
const CTX: StepCtx = { defs: DEFS };
const cmd = (c: Step): Input => ({ kind: 'command', command: c as Command });
const input: fc.Arbitrary<Input> = fc.oneof(
  // Розмова з Енн і велосипедна відповідь — частіше: без них пам'ять майже не росте.
  { weight: 2, arbitrary: fc.constantFrom<Step>({ type: 'Talk', npcId: 'npc.ann' }, { type: 'Choose', choice: BIKE }).map(cmd) },
  { weight: 6, arbitrary: fc.constantFrom<Step>(
    DRIVER, BIKER,
    { type: 'Visit', locationId: 'loc.home' }, { type: 'Visit', locationId: 'loc.shop' },
    { type: 'Talk', npcId: 'npc.ann' }, { type: 'Talk', npcId: 'npc.bob' },
    { type: 'CompleteQuest', questId: 'q.start' }, { type: 'Pickup', itemId: 'item.wood' },
    { type: 'Continue' }, { type: 'RoadEvent', eventId: 'dlg.ev-rain' },
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((choice) => ({ type: 'Choose', choice }) as Step),
  ).map(cmd) },
  { weight: 1, arbitrary: fc.oneof(
    fc.integer({ min: 0, max: 5_000 }).map((realMs): Input => ({ kind: 'frame', realMs })),
    fc.integer({ min: 1, max: 600 }).map((minutes): Input => ({ kind: 'advance', minutes })),
    fc.constantFrom<Input>({ kind: 'pause' }, { kind: 'resume' }),
  ) },
);

// Журнал: інколи — з готовим початком (персонаж біля Енн), інакше випадкова послідовність майже ніколи
// не доходить до розмови, і властивість зелена й без правила (позитивний контроль нижче це ловить).
const PREFIX = (who: Step): Input[] => [who, ...START, { type: 'Visit', locationId: 'loc.shop' } as Step].map(cmd);
const journal: fc.Arbitrary<Input[]> = fc.tuple(fc.constantFrom<Step | null>(BIKER, DRIVER, null), fc.array(input, { minLength: 10, maxLength: 120 }))
  .map(([who, rest]) => (who ? [...PREFIX(who), ...rest] : rest));

type StepFn = (s: SimState, i: Input, ctx: StepCtx) => SimState;

/** Вхід, після якого пам'ять змінилась не так, як дозволяє правило; plus — скільки разів вона законно росла. */
function audit(inputs: readonly Input[], stepFn: StepFn): { bad: string[]; grew: number } {
  const bad: string[] = [];
  let grew = 0;
  let s = newSim(7, 0);
  inputs.forEach((i, n) => {
    const withId: Input = i.kind === 'command' ? { kind: 'command', command: { ...i.command, commandId: `m${n}` } } : i;
    const before = s.game;
    const r = withId.kind === 'command' ? dispatch(before, withId.command, DEFS) : null;
    s = stepFn(s, withId, CTX);
    const changed = stateHash(before.npcMemory) !== stateHash(s.game.npcMemory);
    // Що мала б зробити ця команда: вибір у розмові з NPC, прийнятий ядром, з ефектом remember.
    const dlg = before.dialogue ? DEFS.story?.dialogues[before.dialogue.id] : undefined;
    const choice = withId.kind === 'command' && withId.command.type === 'Choose' ? dlg?.nodes[before.dialogue?.node ?? '']?.choices?.[withId.command.choice] : undefined;
    const facts = r?.ok && dlg?.npcId !== undefined ? (choice?.effects ?? []).flatMap((e) => ('remember' in e ? [e.remember] : [])) : [];
    const known = dlg?.npcId !== undefined ? before.npcMemory[dlg.npcId] ?? [] : [];
    const expectChange = facts.some((f) => !known.includes(f));
    if (changed !== expectChange) bad.push(`#${n} ${withId.kind === 'command' ? withId.command.type : withId.kind}: changed=${changed}, expected=${expectChange}`);
    if (changed && expectChange) {
      grew++;
      const now = s.game.npcMemory[dlg?.npcId ?? ''] ?? [];
      if (!facts.every((f) => now.includes(f))) bad.push(`#${n}: remember did not store ${facts.join(',')}`);
      // Решта NPC — побайтно ті самі.
      const others = (m: GameState['npcMemory']) => stateHash(Object.fromEntries(Object.entries(m).filter(([k]) => k !== dlg?.npcId)));
      if (others(before.npcMemory) !== others(s.game.npcMemory)) bad.push(`#${n}: memory of another NPC changed`);
    }
  });
  return { bad, grew };
}

describe('властивість: npcMemory змінює лише команда (GAME-48, fast-check)', () => {
  const runs = { seed: 20261023, numRuns: 400 };

  it('400 випадкових журналів (команди, кадри, перемотка, пауза, подія в дорозі): жодної зміни пам\'яті поза Choose+remember', () => {
    let grew = 0;
    fc.assert(fc.property(journal, (inputs) => {
      const r = audit(inputs, step);
      grew += r.grew;
      expect(r.bad).toEqual([]);
    }), runs);
    // Позитивний контроль: генератор справді доходить до запам'ятовування (інакше властивість сторожить порожнечу).
    expect(grew).toBeGreaterThan(40);
  });

  it('мутація: «розмова теж запам\'ятовує» (Talk пише в пам\'ять) — властивість червоніє', () => {
    const leaky: StepFn = (s, i, ctx) => {
      const next = step(s, i, ctx);
      if (i.kind !== 'command' || i.command.type !== 'Talk' || next.game === s.game || next.game.dialogue === null) return next;
      return { ...next, game: { ...next.game, npcMemory: { ...next.game.npcMemory, [i.command.npcId]: ['m.leak'] } } };
    };
    let caught = false;
    fc.assert(fc.property(journal, (inputs) => {
      if (audit(inputs, leaky).bad.length) caught = true;
    }), runs);
    expect(caught).toBe(true);
  });

  it('мутація: відхилена команда (CONDITION_FAILED) протікає в пам\'ять — властивість червоніє', () => {
    const leaky: StepFn = (s, i, ctx) => {
      const next = step(s, i, ctx);
      if (i.kind !== 'command' || i.command.type !== 'Choose') return next;
      const r = dispatch(s.game, i.command, DEFS);
      if (r.ok || r.code !== 'CONDITION_FAILED') return next;
      return { ...next, game: { ...next.game, npcMemory: { ...next.game.npcMemory, 'npc.ann': ['m.rejected'] } } };
    };
    const inputs: Input[] = [BIKER, ...START, { type: 'Visit', locationId: 'loc.shop' }, { type: 'Talk', npcId: 'npc.ann' }, { type: 'Choose', choice: REMEMBERS }].map((c) => cmd(c as Step));
    expect(audit(inputs, step).bad).toEqual([]);                                   // позитивний контроль
    expect(audit(inputs, leaky).bad.length).toBeGreaterThan(0);
  });
});

describe('пам\'ять через бар\'єр «команда»: прямий доступ', () => {
  it('dispatch повертає новий стан і не мутує старий (заморожений) — пам\'ять у старому стані та сама', () => {
    const s = play([BIKER, ...AT_ANN]);
    const frozen = Object.freeze({ ...s, npcMemory: Object.freeze({}) });
    const r = tryCmd(frozen, { type: 'Choose', choice: BIKE });
    expect(r.ok).toBe(true);
    expect(frozen.npcMemory).toEqual({});
    expect(r.state.npcMemory).toEqual({ 'npc.ann': ['m.biker'] });
  });

  it('водій не може запам\'ятатись велосипедистом: велосипедна відповідь для нього не існує', () => {
    const s = play([DRIVER, ...AT_ANN]);
    expect(tryCmd(s, { type: 'Choose', choice: BIKE })).toMatchObject({ ok: false, code: 'CONDITION_FAILED' });
    expect(play([{ type: 'Choose', choice: BYE }], s).npcMemory).toEqual({});
  });
});
