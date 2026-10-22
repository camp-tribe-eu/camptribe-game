// GAME-29 · квести в ядрі: кожне правило з шапки story.ts має тут приклад, що червоніє без нього.
import { describe, expect, it } from 'vitest';
import { dispatch, type Command } from './commands';
import { BIKER, DRIVER, play, STORY_DEFS, type Step } from './story.fixture';
import { stateHash } from './hash';
import { initialState, type GameState } from './state';

const tryCmd = (s: GameState, c: Step) => dispatch(s, { ...c, commandId: 'x1' } as Command, STORY_DEFS);
const START = [{ type: 'Visit', locationId: 'loc.home' }, { type: 'CompleteQuest', questId: 'q.start' }] as const;
// Розмова з Енн відкриває її діалог: «до побачення» (вибір 2) і закрити.
const BYE = [{ type: 'Choose', choice: 2 }, { type: 'Continue' }] as const;
const MID = [{ type: 'Pickup', itemId: 'item.wood' }, { type: 'Visit', locationId: 'loc.shop' }, { type: 'Talk', npcId: 'npc.ann' }, ...BYE] as const;

describe('сюжет у ядрі (GAME-29)', () => {
  it('створення персонажа відкриває стартовий квест і ставить у його локацію', () => {
    const s = play([DRIVER]);
    expect(s.player).toEqual({ profileId: 'profile.b', transportId: 'transport.car', animalId: 'animal.none', locationId: 'loc.home' });
    expect(s.quests).toEqual({ 'q.start': { status: 'active', done: [] } });
  });

  it('водій: шлях за замовчуванням до кінця, нагорода рівно раз, кінець розділу', () => {
    const s = play([DRIVER, ...START, ...MID, { type: 'CompleteQuest', questId: 'q.mid' }, { type: 'CompleteQuest', questId: 'q.end' }]);
    expect(s.campaignEnded).toBe(true);
    expect(s.moneyCents).toBe(1_000);
    expect(s.grants).toEqual(['rw.end']);
    expect(Object.keys(s.quests).sort()).toEqual(['q.end', 'q.mid', 'q.start']);
  });

  it('вибір лише для велосипеда: водію — INVALID_CHOICE, велосипедисту — побічний квест із нагородою', () => {
    expect(tryCmd(play([DRIVER, START[0]]), { type: 'CompleteQuest', questId: 'q.start', to: 'q.side' })).toMatchObject({ ok: false, code: 'INVALID_CHOICE' });
    const s = play([BIKER, START[0], { type: 'CompleteQuest', questId: 'q.start', to: 'q.side' }, { type: 'Visit', locationId: 'loc.shop' }, { type: 'CompleteQuest', questId: 'q.side' }]);
    expect(s.quests['q.side']?.status).toBe('completed');
    expect(s.quests['q.mid']).toEqual({ status: 'active', done: [] });
    expect(s.moneyCents).toBe(500);
    expect(s.inventory).toEqual({ 'item.map': 1 });
  });

  it('прогрес рахується лише для активних квестів: розмова до відкриття q.mid його не зараховує', () => {
    const s = play([BIKER, START[0], { type: 'CompleteQuest', questId: 'q.start', to: 'q.side' }, { type: 'Visit', locationId: 'loc.shop' }, { type: 'Talk', npcId: 'npc.ann' }, ...BYE, { type: 'DeclineQuest', questId: 'q.side' }]);
    expect(s.quests['q.side']?.status).toBe('declined');
    expect(s.quests['q.mid']?.done).toEqual([]);
    expect(s.grants).toEqual([]);                                       // відмова — без нагороди
  });

  it('collect рахується з інвентаря, а не з позначки', () => {
    const noWood = play([DRIVER, ...START, MID[1], MID[2], ...BYE]);
    expect(tryCmd(noWood, { type: 'CompleteQuest', questId: 'q.mid' })).toMatchObject({ ok: false, code: 'QUEST_OBJECTIVES_OPEN' });
    expect(tryCmd(play([{ type: 'Visit', locationId: 'loc.home' }, MID[0]], noWood), { type: 'CompleteQuest', questId: 'q.mid' }).ok).toBe(true);
  });

  it('when на цілі: з собакою треба на собачий майданчик; без собаки він зачинений і ціль не існує', () => {
    const dog = play([{ ...DRIVER, animalId: 'animal.dog' }, ...START, ...MID]);
    expect(tryCmd(dog, { type: 'CompleteQuest', questId: 'q.mid' })).toMatchObject({ ok: false, code: 'QUEST_OBJECTIVES_OPEN' });
    expect(tryCmd(play([{ type: 'Visit', locationId: 'loc.dogpark' }], dog), { type: 'CompleteQuest', questId: 'q.mid' }).ok).toBe(true);
    const noDog = play([DRIVER, ...START, ...MID]);
    expect(tryCmd(noDog, { type: 'Visit', locationId: 'loc.dogpark' })).toMatchObject({ ok: false, code: 'LOCKED' });
    expect(tryCmd(noDog, { type: 'CompleteQuest', questId: 'q.mid' }).ok).toBe(true);
  });

  it('тварина обмежує транспорт так само, як у валідаторі', () => {
    expect(tryCmd(initialState(0), { ...BIKER, animalId: 'animal.dog' })).toMatchObject({ ok: false, code: 'INVALID_CHOICE' });
  });

  it('requires цілі не виконано — відмова відкочує ВСЕ: квест не завершено, нагороди немає', () => {
    const before = play([DRIVER, ...START, ...MID]);
    const r = tryCmd(before, { type: 'CompleteQuest', questId: 'q.mid', to: 'q.gate' });
    expect(r).toMatchObject({ ok: false, code: 'QUEST_REQUIRES_UNMET' });
    expect({ ...r.state, processed: {}, seq: 0 }).toEqual({ ...before, processed: {}, seq: 0 });
    const gold = play([{ type: 'Pickup', itemId: 'item.gold' }, { type: 'CompleteQuest', questId: 'q.mid', to: 'q.gate' }], before);
    expect(gold.quests['q.gate']?.status).toBe('active');
  });

  it('лише вибори без шляху за замовчуванням — треба назвати перехід', () => {
    const defs = structuredClone(STORY_DEFS) as { story: { quests: Record<string, { transitions: { choice: boolean }[] }> } } & typeof STORY_DEFS;
    const first = defs.story.quests['q.start']?.transitions[0];
    if (first) first.choice = true;
    const s = play([DRIVER, START[0]], undefined, defs);
    expect(dispatch(s, { type: 'CompleteQuest', commandId: 'y1', questId: 'q.start' }, defs)).toMatchObject({ ok: false, code: 'INVALID_CHOICE' });
    expect(dispatch(s, { type: 'CompleteQuest', commandId: 'y2', questId: 'q.start', to: 'q.mid' }, defs).ok).toBe(true);
  });

  it('без сюжету в каталозі команди сюжету відмовляють, а не падають', () => {
    expect(dispatch(initialState(0), { ...DRIVER, commandId: 'z1' }, { items: {}, interactions: {} })).toMatchObject({ ok: false, code: 'UNKNOWN_TARGET' });
  });

  it('квест, чий when не збігся, для гравця не існує', () => {
    const s = { ...play([DRIVER]), quests: { 'q.side': { status: 'active' as const, done: [] } } };
    expect(tryCmd(s, { type: 'DeclineQuest', questId: 'q.side' })).toMatchObject({ ok: false, code: 'UNKNOWN_TARGET' });
  });

  it('when лише на переході: вибір q.bonus — тільки з собакою', () => {
    const ready = (create: Step) => play([create, ...START, ...MID, ...(create === DRIVER ? [] : [{ type: 'Visit', locationId: 'loc.dogpark' } as const])]);
    expect(tryCmd(ready(DRIVER), { type: 'CompleteQuest', questId: 'q.mid', to: 'q.bonus' })).toMatchObject({ ok: false, code: 'INVALID_CHOICE' });
    expect(tryCmd(ready({ ...DRIVER, animalId: 'animal.dog' }), { type: 'CompleteQuest', questId: 'q.mid', to: 'q.bonus' }).ok).toBe(true);
  });

  it('прогрес не пишеться в завершені й відхилені квести', () => {
    const s = play([BIKER, START[0], { type: 'CompleteQuest', questId: 'q.start', to: 'q.side' }, { type: 'DeclineQuest', questId: 'q.side' }, { type: 'Visit', locationId: 'loc.shop' }, { type: 'Visit', locationId: 'loc.home' }]);
    expect(s.quests['q.side']).toEqual({ status: 'declined', done: [] });
    expect(s.quests['q.start']).toEqual({ status: 'completed', done: ['look-around'] });
  });

  it('підняти можна лише те, що лежить у локації, де стоїш', () => {
    const s = play([DRIVER, ...START, { type: 'Visit', locationId: 'loc.shop' }]);
    expect(tryCmd(s, { type: 'Pickup', itemId: 'item.wood' })).toMatchObject({ ok: false, code: 'NOT_HERE' });
    expect(tryCmd(s, { type: 'Pickup', itemId: 'item.gold' }).ok).toBe(true);
  });

  it('нагорода зі спільним grantId не видається вдруге (TD-004), квест при цьому завершується', () => {
    const defs = structuredClone(STORY_DEFS) as { story: { quests: Record<string, { reward?: { grantId: string } }> } } & typeof STORY_DEFS;
    const end = defs.story.quests['q.end']?.reward;
    if (end) end.grantId = 'rw.side';
    const s = play([BIKER, START[0], { type: 'CompleteQuest', questId: 'q.start', to: 'q.side' }, { type: 'Visit', locationId: 'loc.shop' }, { type: 'CompleteQuest', questId: 'q.side' },
      { type: 'Visit', locationId: 'loc.home' }, ...MID, { type: 'CompleteQuest', questId: 'q.mid' }, { type: 'CompleteQuest', questId: 'q.end' }], undefined, defs);
    expect(s.moneyCents).toBe(500);
    expect(s.campaignEnded).toBe(true);
  });

  it('транспорт, якого немає в контенті, — UNKNOWN_TARGET, навіть якщо профіль не обмежує транспорт', () => {
    expect(tryCmd(initialState(0), { type: 'CreateCharacter', profileId: 'profile.any', transportId: 'transport.ghost' })).toMatchObject({ ok: false, code: 'UNKNOWN_TARGET' });
    expect(tryCmd(initialState(0), { type: 'CreateCharacter', profileId: 'profile.any', transportId: 'transport.bike' }).ok).toBe(true);
  });

  it('NPC зачинений власним unlockedBy, навіть коли його локація відкрита', () => {
    const s = play([DRIVER]);                                              // loc.home відкрита завжди
    expect(tryCmd(s, { type: 'Talk', npcId: 'npc.bob' })).toMatchObject({ ok: false, code: 'LOCKED' });
    expect(tryCmd(play(START, s), { type: 'Talk', npcId: 'npc.bob' }).ok).toBe(true);
  });

  type Mutable = { story: { quests: Record<string, { when?: unknown; transitions: { on: string; to: string; choice: boolean }[] }> } } & typeof STORY_DEFS;

  it('стартовий квест не для цього гравця — персонажа не створено', () => {
    const defs = structuredClone(STORY_DEFS) as Mutable;
    const q = defs.story.quests['q.start'];
    if (q) q.when = { transports: ['transport.bike'] };
    expect(dispatch(initialState(0), { ...DRIVER, commandId: 'w1' }, defs)).toMatchObject({ ok: false, code: 'INVALID_CHOICE' });
    expect(dispatch(initialState(0), { ...BIKER, commandId: 'w2' }, defs).ok).toBe(true);
  });

  it('цикл: повернення в завершений квест робить його знову активним із чистими цілями', () => {
    const defs = structuredClone(STORY_DEFS) as Mutable;
    const side = defs.story.quests['q.side'];
    if (side) side.transitions = [{ on: 'decline', to: 'q.start', choice: false }];
    const s = play([BIKER, START[0], { type: 'CompleteQuest', questId: 'q.start', to: 'q.side' }, { type: 'DeclineQuest', questId: 'q.side' }], undefined, defs);
    expect(s.quests['q.start']).toEqual({ status: 'active', done: [] });
  });

  it('кінець із переходом (епілог): завершення закінчує розділ — і без вибору, і з вибором', () => {
    const defs = structuredClone(STORY_DEFS) as Mutable;
    const end = defs.story.quests['q.end'];
    if (end) end.transitions = [{ on: 'complete', to: 'q.stuck', choice: true }];
    const atEnd = play([DRIVER, ...START, ...MID, { type: 'CompleteQuest', questId: 'q.mid' }], undefined, defs);
    const plain = play([{ type: 'CompleteQuest', questId: 'q.end' }], atEnd, defs);
    expect(plain.campaignEnded).toBe(true);
    expect(plain.quests['q.stuck']).toBeUndefined();
    const epilogue = play([{ type: 'CompleteQuest', questId: 'q.end', to: 'q.stuck' }], atEnd, defs);
    expect(epilogue.campaignEnded).toBe(true);
    expect(epilogue.quests['q.stuck']?.status).toBe('active');
  });
});

describe('діалоги в ядрі (GAME-29, формат DC-011)', () => {
  const AT_ANN = [...START, { type: 'Visit', locationId: 'loc.shop' }, { type: 'Talk', npcId: 'npc.ann' }] as const;
  const hashOf = (s: GameState) => stateHash({ ...s, processed: null, seq: null });

  it('розмова відкриває діалог NPC на стартовому вузлі; «далі» на вузлі з виборами — INVALID_CHOICE', () => {
    const s = play([DRIVER, ...AT_ANN]);
    expect(s.dialogue).toEqual({ id: 'dlg.ann', node: 'hi' });
    expect(tryCmd(s, { type: 'Continue' })).toMatchObject({ ok: false, code: 'INVALID_CHOICE' });
  });

  it('хибна умова — CONDITION_FAILED, і стан побайтно той самий (хеш до = після)', () => {
    const s = play([DRIVER, ...AT_ANN]);
    const r = tryCmd(s, { type: 'Choose', choice: 0 });                       // лише для велосипеда
    expect(r).toMatchObject({ ok: false, code: 'CONDITION_FAILED' });
    expect(hashOf(r.state)).toBe(hashOf(s));
  });

  it('умова transport і ефект setFlag', () => {
    const s = play([BIKER, ...AT_ANN.slice(0, 1), { type: 'CompleteQuest', questId: 'q.start' }, ...AT_ANN.slice(2), { type: 'Choose', choice: 0 }]);
    expect(s.flags).toEqual(['f.biker']);
    expect(s.dialogue).toEqual({ id: 'dlg.ann', node: 'bike' });
  });

  it('all + notFlag: плітки — лише після знайомства і не велосипедисту', () => {
    const first = play([DRIVER, ...AT_ANN]);
    expect(tryCmd(first, { type: 'Choose', choice: 1 })).toMatchObject({ ok: false, code: 'CONDITION_FAILED' });
    const again = play([...BYE, { type: 'Talk', npcId: 'npc.ann' }], first);
    expect(again.flags).toEqual(['f.met']);
    expect(tryCmd(again, { type: 'Choose', choice: 1 }).ok).toBe(true);
    const biker = play([BIKER, START[0], { type: 'CompleteQuest', questId: 'q.start' }, { type: 'Visit', locationId: 'loc.shop' }, { type: 'Talk', npcId: 'npc.ann' }, { type: 'Choose', choice: 0 }, { type: 'Continue' }, { type: 'Continue' },
      { type: 'Talk', npcId: 'npc.ann' }, ...BYE, { type: 'Talk', npcId: 'npc.ann' }]);
    expect(biker.flags).toEqual(['f.biker', 'f.met']);
    expect(tryCmd(biker, { type: 'Choose', choice: 1 })).toMatchObject({ ok: false, code: 'CONDITION_FAILED' });
  });

  it('any + startQuest із невиконаним requires — відмова, і прапорці не змінились (відкат)', () => {
    const met = play([DRIVER, ...AT_ANN, ...BYE, { type: 'Talk', npcId: 'npc.ann' }]);
    const r = tryCmd(met, { type: 'Choose', choice: 4 });                     // q.gate вимагає золото
    expect(r).toMatchObject({ ok: false, code: 'QUEST_REQUIRES_UNMET' });
    expect(hashOf(r.state)).toBe(hashOf(met));
  });

  it('умова quest/status і startQuest: після q.mid Енн відкриває q.secret', () => {
    const s = play([DRIVER, ...START, ...MID, { type: 'CompleteQuest', questId: 'q.mid', to: 'q.end' }]);
    const before = play([{ type: 'Talk', npcId: 'npc.ann' }], s);
    const after = play([{ type: 'Choose', choice: 3 }], before);
    expect(after.quests['q.secret']).toEqual({ status: 'active', done: [] });
    expect(tryCmd(play([DRIVER, ...AT_ANN]), { type: 'Choose', choice: 3 })).toMatchObject({ ok: false, code: 'CONDITION_FAILED' });
  });

  it('completeObjective закриває ціль лише в активному квесті', () => {
    const s = play([DRIVER, ...START, { type: 'Talk', npcId: 'npc.bob' }, { type: 'Choose', choice: 0 }]);
    expect(s.quests['q.mid']?.done).toEqual(['meet-ann']);
    // q.side (велосипедист) — q.mid ще не відкрито: той самий ефект нічого не робить
    const side = play([BIKER, START[0], { type: 'CompleteQuest', questId: 'q.start', to: 'q.side' }, { type: 'Talk', npcId: 'npc.bob' }, { type: 'Choose', choice: 0 }]);
    expect(side.quests['q.mid']).toBeUndefined();
    // завершений квест ефект теж не чіпає
    const done = play([DRIVER, ...START, { type: 'Pickup', itemId: 'item.wood' }, { type: 'Talk', npcId: 'npc.bob' }, { type: 'Choose', choice: 0 }, { type: 'Continue' },
      { type: 'CompleteQuest', questId: 'q.mid' }, { type: 'Talk', npcId: 'npc.bob' }]);
    expect(done.quests['q.mid']).toEqual({ status: 'completed', done: ['meet-ann'] });
    const hacked = { ...done, quests: { ...done.quests, 'q.mid': { status: 'completed' as const, done: [] } } };
    expect(play([{ type: 'Choose', choice: 0 }], hacked).quests['q.mid']?.done).toEqual([]);
  });

  it('«далі» йде за next, а на end закриває розмову', () => {
    const s = play([DRIVER, ...AT_ANN, { type: 'Choose', choice: 2 }]);
    expect(s.dialogue).toEqual({ id: 'dlg.ann', node: 'bye' });
    expect(play([{ type: 'Continue' }], s).dialogue).toBeNull();
  });

  it('хибний індекс вибору — INVALID_CHOICE', () => {
    const s = play([DRIVER, ...AT_ANN]);
    for (const choice of [-1, 99, 1.5]) expect(tryCmd(s, { type: 'Choose', choice })).toMatchObject({ ok: false, code: 'INVALID_CHOICE' });
  });

  it('сейв із діалогом, якого вже немає в контенті, не падає — NO_DIALOGUE', () => {
    const s = { ...play([DRIVER]), dialogue: { id: 'dlg.ghost', node: 'x' } };
    expect(tryCmd(s, { type: 'Continue' })).toMatchObject({ ok: false, code: 'NO_DIALOGUE' });
  });
});
