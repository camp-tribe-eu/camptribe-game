// GAME-170 зріз 2 · режисер хвилі W4 «Вечір на трьох фронтах» на СПРАВЖНЬОМУ контенті й справжній симуляції (годинник, журнал).
//
// Що доводиться числом чи цитатою (закон 6):
//  * стартер: на етапі CH1-D2-CAMP-001 режисер шле рівно один StartWave, ядро його ПРИЙМАЄ (processed ok), і вдруге не шле;
//    крок раніше (CH1-D2-ELISE-001) — нічого; варіанти: вело = вечеря+дрова+велосипеди, авто з Мією = вечеря+дрова+Мія;
//  * мапа ⇄ контент: кожна справа має ціль task.<id> на camp-lake.tmj, і кожна ціль task.* — справа хвилі (зламана ціль → червоно);
//  * дотик до цілі закриває справу; ціль не свого варіанта або вже закрита — німа (null);
//  * вогнище: усе встигли → факти [f.fire-allowed, f.fire-dinner-done] і гілка fire; дрова спізнились → гілка lantern;
//    поки хвиля жива чи сцену вже грали — вогнище лише гріє (Interact);
//  * кінець розділу від хвилі не залежить: CompleteQuest CH1-D2-FIRE-001 приймається з живою хвилею;
//  * пакети біля води: прапорець, запис журналу, вдруге — GRANT_ALREADY_GIVEN і об'єкт німий.
import campLake from '../../public/maps/camp-lake.tmj?raw';
import { describe, expect, it } from 'vitest';
import type { Command } from '../core/commands';
import { newSim, step, type SimState } from '../core/sim';
import { progressKey, moves, type Move } from './moves';
import { GAME_DEFS } from './slice-defs';
import { RAW_WAVES, WAVE_CH1_EVENING } from './waves';
import { FIRE_STAGE, TASK_SPOT, fireplaceDue, fireplacePlayed, liveSpot, pendingWave, spotMove, storyMoves } from './director';
import { waveOffer } from '../view/story-offer';

const CTX = { defs: GAME_DEFS };
const CAMP = 'CH1-D2-CAMP-001';
let n = 0;
const send = (s: SimState, m: Move): SimState => step(s, { kind: 'command', command: { ...m, commandId: `dir-${n++}` } as Command }, CTX);
const last = (s: SimState): { ok: boolean; code?: string | undefined } => {
  const r = s.game.processed[`dir-${n - 1}`];
  if (!r) throw new Error('команду не оброблено');
  return r.ok ? { ok: true } : { ok: false, code: r.code };
};
const must = (s: SimState, m: Move): SimState => { const t = send(s, m); const r = last(t); if (!r.ok) throw new Error(`${JSON.stringify(m)} → ${r.code}`); return t; };
const minutes = (s: SimState, k: number): SimState => step(s, { kind: 'frame', realMs: k * 1000 }, CTX);
const done = (questId: string): Move => ({ type: 'CompleteQuest', questId });

/** День 1 (як day2.test.startOf) + ранок дня 2 до того, як CAMP-001 стане активним: далі — пошуком серед ходів меню. */
function toStage(kind: 'bike' | 'car-cat', stage: string): SimState {
  const create: Move = kind === 'bike'
    ? { type: 'CreateCharacter', profileId: 'profile.solo-explorer', transportId: 'transport.bike' }
    : { type: 'CreateCharacter', profileId: 'profile.family-teen', transportId: 'transport.car', animalId: 'animal.cat' };
  const talk: Move = { type: 'Talk', npcId: 'npc.elise' };
  const choose = (choice: number): Move => ({ type: 'Choose', choice });
  const next: Move = { type: 'Continue' };
  const meet: Move[] = kind === 'bike' ? [talk, choose(0), next, next, choose(0), next] : [talk, choose(1), next, choose(0), next];
  let s = newSim(7, 5_000);
  for (const m of [create, done('PROLOGUE-HOME-001'), done('ST-001'), done('ST-002'), { type: 'Visit', locationId: 'loc.shop' } as Move,
    { type: 'Pickup', itemId: 'item.tent' } as Move, { type: 'Pickup', itemId: 'item.sleeping-bag' } as Move, done('ST-003'), { type: 'Visit', locationId: 'loc.home' } as Move,
    done('CH1-HOME-001'), { type: 'Visit', locationId: 'loc.road' } as Move, done('ST-004'), { type: 'Visit', locationId: 'loc.camp.lake' } as Move,
    ...meet, { type: 'Pickup', itemId: 'item.firewood' } as Move, done('ST-005')]) s = must(s, m);
  // Пошук у ширину серед розмов і завершень квестів (без ходів, що ведуть у бік: велозона/відмова), доки етап не стане активним.
  const seen = new Set<string>([progressKey(s.game)]);
  const queue: SimState[] = [s];
  for (let guard = 0; queue.length && guard < 5_000; guard++) {
    const cur = queue.shift() as SimState;
    if (cur.game.quests[stage]?.status === 'active') return cur;
    if (cur.game.campaignEnded) continue;
    for (const m of moves(cur.game, GAME_DEFS)) {
      if (!['Talk', 'Choose', 'Continue', 'CompleteQuest'].includes(m.type)) continue;
      if (m.type === 'CompleteQuest' && (m.to === 'q.elise-bike-area' || m.questId === CAMP || m.questId === FIRE_STAGE)) continue;
      const t = send(cur, m);
      if (!last(t).ok) continue;
      const k = progressKey(t.game);
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push(t);
    }
  }
  throw new Error(`етап ${stage} недосяжний для ${kind}`);
}

/** Вечеря з Елізою (ціль CAMP-001 byDialogue) — пошуком серед розмов, щоб індекси відповідей не були вшиті в тест. */
function dinnerTalk(s: SimState): SimState {
  const seen = new Set<string>([progressKey(s.game)]);
  const queue: SimState[] = [s];
  for (let guard = 0; queue.length && guard < 5_000; guard++) {
    const cur = queue.shift() as SimState;
    if (cur.game.quests[CAMP]?.done.includes('dinner') && cur.game.dialogue === null) return cur;
    for (const m of moves(cur.game, GAME_DEFS)) {
      if (!['Talk', 'Choose', 'Continue'].includes(m.type)) continue;
      const t = send(cur, m);
      if (!last(t).ok) continue;
      const k = progressKey(t.game);
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push(t);
    }
  }
  throw new Error('вечерю з Елізою не знайдено');
}

const taskIds = (s: SimState): string[] => Object.keys(s.game.wave?.active?.tasks ?? {}).sort();
const spot = (id: string): string => `${TASK_SPOT}${id}`;

describe('режисер W4: стартер хвилі (GAME-170, зріз 2)', () => {
  it('на CH1-D2-ELISE-001 сюжету нічого слати; на CH1-D2-CAMP-001 — рівно один StartWave, який ядро приймає; вдруге — нічого', () => {
    const before = toStage('bike', 'CH1-D2-ELISE-001');
    expect(storyMoves(before, GAME_DEFS)).toEqual([]);
    const at = toStage('bike', CAMP);
    expect(at.game.quests[CAMP]?.status).toBe('active');
    expect(storyMoves(at, GAME_DEFS)).toEqual([{ type: 'StartWave', waveId: WAVE_CH1_EVENING }]);
    const started = send(at, storyMoves(at, GAME_DEFS)[0] as Move);
    expect(last(started)).toEqual({ ok: true });
    expect(started.game.wave?.active?.waveId).toBe(WAVE_CH1_EVENING);
    expect(taskIds(started)).toEqual(['cover-bikes', 'dinner', 'firewood']);
    expect(storyMoves(started, GAME_DEFS)).toEqual([]);
    expect(pendingWave(started.game, GAME_DEFS)).toBeNull();
    // Картка мети: 0/3, кожній справі — її межа в ігрових хвилинах (хвилина старту = зараз).
    expect(waveOffer(started)).toMatchObject({ titleKey: 'wave.ch1-day2-evening', done: 0, total: 3 });
    expect(waveOffer(started)?.tasks.map((t) => [t.id, t.remainingMin])).toEqual([['dinner', 45], ['firewood', 40], ['cover-bikes', 50]]);
  });

  it('авто з Мією: справи — вечеря, дрова, Мія (лише лідер); велосипедів немає', () => {
    const at = toStage('car-cat', CAMP);
    const started = send(at, storyMoves(at, GAME_DEFS)[0] as Move);
    expect(last(started)).toEqual({ ok: true });
    expect(taskIds(started)).toEqual(['dinner', 'find-mia', 'firewood']);
  });

  it('хвиля, що вже була (past), удруге не стартує: після закінчення режисер мовчить і на активному етапі', () => {
    const at = toStage('bike', CAMP);
    const gone = minutes(send(at, storyMoves(at, GAME_DEFS)[0] as Move), 61);
    expect(gone.game.wave?.active).toBeNull();
    expect(Object.values(gone.game.wave?.past[WAVE_CH1_EVENING] ?? {})).toEqual(['late', 'late', 'late']);
    expect(storyMoves(gone, GAME_DEFS)).toEqual([]);
  });
});

describe('режисер W4: завантаження збереження на CAMP-001 (рішення GAME-170: прийнятно)', () => {
  // Збереження на CAMP-001 без wave (вийшли до старту хвилі) → після завантаження хвиля стартує одразу, строки — від годинника
  // ЗАВАНТАЖЕННЯ. Штрафу немає (пауза між сесіями не з'їдає строк), повторів немає (past). Зафіксовано, щоб це не стало випадковістю.
  it('(a) завантаження на CAMP-001 без хвилі: хвиля стартує рівно раз, строки = годинник завантаження + ліміти', () => {
    const saved = JSON.parse(JSON.stringify(toStage('bike', CAMP))) as SimState; // «збереження»: серіалізований стан без wave
    expect(saved.game.wave?.active ?? null).toBeNull();
    const loaded = minutes(saved, 30); // «завантаження» пізніше: годинник пішов
    const cmds = storyMoves(loaded, GAME_DEFS);
    expect(cmds).toEqual([{ type: 'StartWave', waveId: WAVE_CH1_EVENING }]);
    const s = must(loaded, cmds[0] as Move);
    const limits = Object.fromEntries((RAW_WAVES.find((w) => w.id === WAVE_CH1_EVENING)?.tasks ?? []).map((t) => [t.id, t.limitMin]));
    expect(s.game.wave?.active?.startedAt).toBe(loaded.clock.minutes);
    for (const [id, t] of Object.entries(s.game.wave?.active?.tasks ?? {})) expect(t.dueAt, id).toBe(loaded.clock.minutes + (limits[id] as number));
    expect(storyMoves(s, GAME_DEFS)).toEqual([]); // удруге — нічого
  });

  it('(b) перезавантаження після кінця хвилі: хвиля не стартує знову', () => {
    const at = toStage('bike', CAMP);
    const gone = minutes(must(at, storyMoves(at, GAME_DEFS)[0] as Move), 61);
    expect(gone.game.wave?.active).toBeNull();
    const reloaded = JSON.parse(JSON.stringify(gone)) as SimState;
    expect(storyMoves(reloaded, GAME_DEFS)).toEqual([]);
    expect(storyMoves(minutes(reloaded, 600), GAME_DEFS)).toEqual([]);
    expect(reloaded.game.wave?.past[WAVE_CH1_EVENING]).toBeDefined();
  });
});

describe('режисер W4: цілі на мапі', () => {
  const map = JSON.parse(campLake) as { layers: { name: string; objects?: { name: string; type: string }[] }[] };
  const triggers = (map.layers.find((l) => l.name === 'objects')?.objects ?? []).filter((o) => o.type === 'trigger').map((o) => o.name);

  it('кожна справа кожної хвилі має ціль task.<id> на мапі табору, і кожна ціль task.* — справа хвилі', () => {
    const tasks = RAW_WAVES.flatMap((w) => w.tasks.map((t) => spot(t.id))).sort();
    expect(tasks.length).toBeGreaterThanOrEqual(3);
    expect(triggers.filter((t) => t.startsWith(TASK_SPOT)).sort()).toEqual(tasks);
    expect(triggers).toContain('obj.litter');
  });

  it('дотик до цілі закриває справу (CompleteTask прийнято); закрита ціль і ціль не свого варіанта — німі', () => {
    const at = toStage('bike', CAMP);
    const s0 = send(at, storyMoves(at, GAME_DEFS)[0] as Move);
    expect(liveSpot(s0, spot('firewood'))).toBe(true);
    expect(liveSpot(s0, spot('find-mia')), 'Мія вдома — цілі немає у варіанті вело').toBe(false);
    expect(spotMove(s0, spot('find-mia'))).toBeNull();
    const m = spotMove(s0, spot('firewood'));
    expect(m).toEqual({ type: 'CompleteTask', taskId: 'firewood' });
    const s1 = send(s0, m as Move);
    expect(last(s1)).toEqual({ ok: true });
    expect(s1.game.wave?.active?.tasks['firewood']?.outcome).toBe('done');
    expect(liveSpot(s1, spot('firewood'))).toBe(false);
    expect(spotMove(s1, spot('firewood'))).toBeNull();
    expect(waveOffer(s1)).toMatchObject({ done: 1, total: 3 });
    // Строк минув — ціль гасне ще до того, як settleWave запише late (хвилина dueAt + 1).
    const late = minutes(s1, 46);
    expect(liveSpot(late, spot('dinner'))).toBe(false);
    expect(late.game.wave?.active?.tasks['dinner']?.outcome).toBe('late');
  });

  it('усі три в строк → хвиля закінчена, кожна done; вогнище на етапі вечора відкриває сцену з обома фактами й гілкою fire', () => {
    const at = toStage('bike', CAMP);
    let s = send(at, storyMoves(at, GAME_DEFS)[0] as Move);
    for (const id of ['firewood', 'cover-bikes', 'dinner']) s = must(minutes(s, 5), spotMove(s, spot(id)) as Move);
    expect(s.game.wave?.active).toBeNull();
    expect(s.game.wave?.past[WAVE_CH1_EVENING]).toEqual({ dinner: 'done', firewood: 'done', 'cover-bikes': 'done' });
    expect(waveOffer(s)).toBeNull();
    // Вогнище на етапі вечері (FIRE-001 ще не активний) — лише Interact.
    expect(spotMove(s, 'obj.campfire')).toEqual({ type: 'Interact', targetId: 'obj.campfire' });
    s = must(dinnerTalk(s), done(CAMP));
    expect(s.game.quests[FIRE_STAGE]?.status).toBe('active');
    expect(fireplaceDue(s)).toBe(true);
    const scene = spotMove(s, 'obj.campfire');
    expect(scene).toEqual({ type: 'StartScene', sceneId: 'dlg.ch1-fire', facts: ['f.fire-allowed', 'f.fire-dinner-done'] });
    s = must(s, scene as Move);
    expect(s.game.dialogue).toEqual({ id: 'dlg.ch1-fire', node: 'open' });
    s = must(s, { type: 'Continue' });
    expect(s.game.dialogue?.node).toBe('fire');
    expect(fireplacePlayed(s)).toBe(true);
    // Сцену грали — вогнище знову лише гріє (навіть коли розмову закрито).
    while (s.game.dialogue) s = must(s, s.game.dialogue.node === 'l7' ? { type: 'Choose', choice: 1 } : { type: 'Continue' });
    expect(fireplaceDue(s)).toBe(false);
    expect(spotMove(s, 'obj.campfire')).toEqual({ type: 'Interact', targetId: 'obj.campfire' });
    s = must(s, done(FIRE_STAGE));
    expect(s.game.campaignEnded).toBe(true);
  });

  it('дрова спізнились (решта встигли) → факт f.fire-allowed не ставиться, сцена йде гілкою lantern', () => {
    const at = toStage('bike', CAMP);
    let s = send(at, storyMoves(at, GAME_DEFS)[0] as Move);
    s = must(s, spotMove(s, spot('dinner')) as Move);
    s = must(s, spotMove(s, spot('cover-bikes')) as Move);
    s = minutes(s, 41);
    expect(s.game.wave?.past[WAVE_CH1_EVENING]).toEqual({ dinner: 'done', firewood: 'late', 'cover-bikes': 'done' });
    s = must(dinnerTalk(s), done(CAMP));
    const scene = spotMove(s, 'obj.campfire');
    expect(scene).toEqual({ type: 'StartScene', sceneId: 'dlg.ch1-fire', facts: ['f.fire-dinner-done'] });
    s = must(must(s, scene as Move), { type: 'Continue' });
    expect(s.game.dialogue?.node).toBe('lantern');
  });

  it('CAMP-001 завершено, поки хвиля ще жива: вогнище лише гріє, доки хвиля не закінчиться; кінець розділу хвилі не чекає', () => {
    const at = toStage('bike', CAMP);
    let s = send(at, storyMoves(at, GAME_DEFS)[0] as Move);
    s = must(dinnerTalk(s), done(CAMP));
    expect(s.game.wave?.active).not.toBeNull();
    expect(fireplaceDue(s)).toBe(false);
    expect(spotMove(s, 'obj.campfire')).toEqual({ type: 'Interact', targetId: 'obj.campfire' });
    const ended = must(s, done(FIRE_STAGE));
    expect(ended.game.campaignEnded).toBe(true);
    expect(ended.game.wave?.active).not.toBeNull();
    // А якщо дочекатись: хвиля згасла (усе late) — сцена відкривається, з ліхтарем.
    const waited = minutes(s, 61);
    expect(fireplaceDue(waited)).toBe(true);
    expect(spotMove(waited, 'obj.campfire')).toEqual({ type: 'StartScene', sceneId: 'dlg.ch1-fire', facts: [] });
  });

  it('пакети біля води: прапорець f.litter-cleaned-ch1, запис журналу Interact; вдруге — GRANT_ALREADY_GIVEN, об\'єкт німий', () => {
    const at = toStage('bike', CAMP);
    expect(liveSpot(at, 'obj.litter')).toBe(true);
    const s = send(at, spotMove(at, 'obj.litter') as Move);
    expect(last(s)).toEqual({ ok: true });
    expect(s.game.flags).toContain('f.litter-cleaned-ch1');
    expect(s.journal.at(-1)).toMatchObject({ type: 'Interact', ref: 'obj.litter' });
    expect(liveSpot(s, 'obj.litter')).toBe(false);
    expect(last(send(s, { type: 'Interact', targetId: 'obj.litter' }))).toEqual({ ok: false, code: 'GRANT_ALREADY_GIVEN' });
  });
});
