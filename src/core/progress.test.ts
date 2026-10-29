// GAME-181 · прогресія мандрівника: XP, ОМ, звання. Нагорода — раз за ключ (повтор = 0), числа з контенту, старі сейви читаються.
// Закон 1: кожна перевірка має мутацію, на якій червоніє (кінець файлу): вимкнений запобіжник повтору, квест без XP, звання без порогу.
import { describe, expect, it } from 'vitest';
import { dispatch, type Command, type Safeguards } from './commands';
import { daySummary } from './day-summary';
import { OM_CLEAN, OM_DISCOVERY, OM_SIDE, TITLE_COUNT, TITLE_XP, XP_CHAPTER, XP_DAY, XP_SECRET, award, awardsFor, backfillProgress, progressOf, questAwards, titleOf, titleStep } from './progress';
import { fromSave, serialize } from './save';
import { newSim, step, type SimState } from './sim';
import { initialState } from './state';
import { skillStep, RANK_XP } from './skills';
import { GAME_DEFS, SLICE_DEFS } from '../content/slice-defs';
import { STORY } from '../content/story';
import { goalOf, progressOffer, storyOffer } from '../view/story-offer';
import { PROLOGUE_BIKE, SEED, START_MONEY } from '../content/replay.scenario';
import uk from '../../content/locales/uk.json';
import en from '../../content/locales/en.json';
import quests from '../../content/quests.json';
import { SKILL_IDS } from './skills';
import v1 from '../../tests/saves/v1.json';
import v2 from '../../tests/saves/v2.json';
import v3 from '../../tests/saves/v3.json';

const play = (): SimState => PROLOGUE_BIKE.reduce((s, i) => step(s, i, { defs: GAME_DEFS }), newSim(SEED, START_MONEY));
const SAFE: Safeguards = { commandId: true, grantId: true, rollback: true };

describe('XP за квести: числа — з контенту, межі дня й розділу — з ядра', () => {
  it('крок головного — xp квесту, ОМ 0; побічка — xp квесту й +10 ОМ; межа дня +10; кінець розділу +10 і +30', () => {
    expect(questAwards('ST-001', { optional: false, end: false, xp: 10 })).toEqual([{ key: 'quest:ST-001', xp: 10, om: 0 }]);
    expect(questAwards('q.x', { optional: true, end: false, xp: 15 })).toEqual([{ key: 'quest:q.x', xp: 15, om: OM_SIDE }]);
    expect(questAwards('ST-005', { optional: false, end: false, dayEnd: true, xp: 20 })).toEqual([{ key: 'quest:ST-005', xp: 20, om: 0 }, { key: 'day:ST-005', xp: XP_DAY, om: 0 }]);
    expect(questAwards('END', { optional: false, end: true, xp: 20 }).map((a) => a.xp)).toEqual([20, XP_DAY, XP_CHAPTER]);
    expect(questAwards('ST-009', { optional: false, end: false })).toEqual([]);   // без xp у контенті крок нічого не дає (валідатор такого не пропустить)
  });

  it('кожен квест справжнього контенту має xp у межах (10…20 головний, 15 побічка)', () => {
    for (const q of quests as { id: string; optional: boolean; xp?: number }[]) {
      expect(q.xp, q.id).toBeGreaterThan(0);
      if (q.optional) expect(q.xp, q.id).toBe(15); else { expect(q.xp, q.id).toBeGreaterThanOrEqual(10); expect(q.xp, q.id).toBeLessThanOrEqual(20); }
    }
  });

  it('повний прохід розділу (реплей-сценарій): XP = кроки + 3 межі дня + розділ + секрет; ОМ = побічка + відкриття; ключі без повторів', () => {
    const s = play();
    const stepXp = (quests as { xp: number }[]).reduce((a, q) => a + q.xp, 0);
    const events = s.journal.filter((e) => e.type === 'RoadEvent').length;
    expect(progressOf(s.game).xp).toBe(stepXp + 3 * XP_DAY + XP_CHAPTER + XP_SECRET);
    expect(progressOf(s.game).om).toBe(OM_SIDE + events * OM_DISCOVERY);
    const keys = progressOf(s.game).keys;
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys]).toEqual([...keys].sort());
    expect(titleOf(progressOf(s.game).xp)).toBe(3);      // 310 XP — четверте звання (поріг 300)
  });
});

describe('нагорода раз за ключ (закон: повтор = 0)', () => {
  it('award: той самий ключ удруге — те саме значення (та сама посилка), інший ключ — додається', () => {
    const a = { key: 'quest:A', xp: 10, om: 0 };
    const p1 = award(undefined, [a]);
    expect(p1).toMatchObject({ xp: 10, om: 0, keys: ['quest:A'] });
    expect(award(p1, [a])).toBe(p1);
    expect(award(p1, [{ key: 'quest:B', xp: 5, om: 3 }])).toMatchObject({ xp: 15, om: 3, keys: ['quest:A', 'quest:B'] });
    expect(award(undefined, [])).toBeUndefined();
  });

  /** Взаємодія з відімкненим запобіжником grantId: повторна відповідь ядра приймається, тож тримати XP мусить саме ключ нагороди. */
  const interactTwice = (guard: Safeguards): number => {
    const mk = (id: string): Command => ({ type: 'Interact', commandId: id, targetId: 'obj.campfire' });
    const a = dispatch(initialState(0), mk('c1'), SLICE_DEFS, guard);
    if (!a.ok) throw new Error('перша взаємодія мусить пройти');
    const b = dispatch(a.state, mk('c2'), SLICE_DEFS, guard);
    return progressOf(b.state).xp;
  };
  it('секрет (obj.campfire) двічі, навіть коли grantId не стереже: XP лише раз', () => {
    expect(interactTwice({ ...SAFE, grantId: false })).toBe(XP_SECRET);
    expect(interactTwice(SAFE)).toBe(XP_SECRET);
  });
  it('МУТАЦІЯ: запобіжник нагороди вимкнено (award: false) — XP подвоюється, перевірка вище почервоніла б', () => {
    expect(interactTwice({ ...SAFE, grantId: false, award: false })).toBe(2 * XP_SECRET);
  });
  it('МУТАЦІЯ: dedupe вимкнено — той самий ключ видається знову', () => {
    const a = { key: 'quest:A', xp: 10, om: 0 };
    expect(award(award(undefined, [a], false), [a], false)?.xp).toBe(20);
  });

  it('чистий табір (obj.litter) — ОМ, не XP; відкриття (подія в дорозі) — +5 ОМ раз; невідоме — нічого', () => {
    expect(awardsFor('Interact', 'obj.litter', GAME_DEFS)).toEqual([{ key: 'i:obj.litter', xp: 0, om: OM_CLEAN }]);
    expect(awardsFor('RoadEvent', 'dlg.ev.ch1.road-002', GAME_DEFS)).toEqual([{ key: 'ev:dlg.ev.ch1.road-002', xp: 0, om: OM_DISCOVERY }]);
    expect(awardsFor('Interact', 'obj.nothing', GAME_DEFS)).toEqual([]);
    expect(awardsFor('Pickup', 'item.tent', GAME_DEFS)).toEqual([]);
    expect(awardsFor('CompleteQuest', null, GAME_DEFS)).toEqual([]);
  });

  it('відмова від побічки XP не дає (немає покарання й немає нагороди за «ні»)', () => {
    const s0 = play();
    const quest = Object.keys(STORY.quests).find((q) => STORY.quests[q]?.optional);
    expect(quest).toBeDefined();
    expect(awardsFor('DeclineQuest', quest ?? '', GAME_DEFS)).toEqual([]);
    expect(progressOf(s0.game).keys).not.toContain('quest:none');
  });
});

describe('звання', () => {
  it('десять звань, пороги зростають із 0; звання за XP — найбільший досягнутий поріг', () => {
    expect(TITLE_COUNT).toBe(10);
    expect(TITLE_XP[0]).toBe(0);
    for (let i = 1; i < TITLE_XP.length; i++) expect(TITLE_XP[i]).toBeGreaterThan(TITLE_XP[i - 1] as number);
    expect(titleOf(0)).toBe(0);
    expect(titleOf((TITLE_XP[1] as number) - 1)).toBe(0);
    expect(titleOf(TITLE_XP[1] as number)).toBe(1);
    expect(titleOf(1_000_000)).toBe(TITLE_COUNT - 1);
    expect(titleStep(30)).toEqual({ index: 0, into: 30, span: TITLE_XP[1] });
    expect(titleStep(1_000_000).span).toBe(0);
  });

  it('друге звання — після п’ятого кроку головного квесту (PROLOGUE, ST-001…003, CH1-HOME-001): XP 60 — до виїзду з дому', () => {
    const order = ['PROLOGUE-HOME-001', 'ST-001', 'ST-002', 'ST-003', 'CH1-HOME-001'];
    const xp = order.reduce((a, id) => a + ((quests as { id: string; xp: number }[]).find((q) => q.id === id)?.xp ?? 0), 0);
    expect(xp).toBeGreaterThanOrEqual(TITLE_XP[1] as number);
    expect(xp - ((quests as { id: string; xp: number }[]).find((q) => q.id === 'CH1-HOME-001')?.xp ?? 0)).toBeLessThan(TITLE_XP[1] as number);   // п’ятий крок — саме той, що дає звання
  });

  it('тексти звань і родинні рядки є в обох мовах (10 назв, 9 рядків: першого звання «досягати» не треба)', () => {
    for (const [name, loc] of [['uk', uk], ['en', en]] as const) {
      const l = loc as Record<string, string>;
      for (let i = 1; i <= TITLE_COUNT; i++) expect(l[`title.${i}`], `${name} title.${i}`).toBeTruthy();
      for (let i = 2; i <= TITLE_COUNT; i++) expect(l[`title.${i}.family`], `${name} title.${i}.family`).toBeTruthy();
    }
  });
});

describe('навички: шкала рангу поверх ядра (skills.ts), тексти з контенту', () => {
  it('skillStep: ранг, смужка до наступного, «наставник» з рангу 3, вищий ранг без смужки', () => {
    expect(skillStep(0)).toEqual({ rank: 0, from: 0, to: 10, pct: 0, mentor: false });
    expect(skillStep(5)).toMatchObject({ rank: 0, pct: 50 });
    expect(skillStep(RANK_XP[2] as number)).toMatchObject({ rank: 2, pct: 0, mentor: false });
    expect(skillStep(99)).toMatchObject({ rank: 3, mentor: true });
    expect(skillStep(150)).toEqual({ rank: 5, from: 150, to: null, pct: 100, mentor: false });
  });
  it('вісім навичок × (назва + п’ять рангів + п’ять «що відкриє») у обох мовах', () => {
    for (const [name, loc] of [['uk', uk], ['en', en]] as const) {
      const l = loc as Record<string, string>;
      for (const id of SKILL_IDS) {
        expect(l[id], `${name} ${id}`).toBeTruthy();
        for (let r = 1; r <= 5; r++) { expect(l[`${id}.r${r}`], `${name} ${id}.r${r}`).toBeTruthy(); expect(l[`${id}.r${r}.unlock`], `${name} ${id}.r${r}.unlock`).toBeTruthy(); }
      }
    }
  });
});

describe('підсумок дня: що день дав', () => {
  it('день 1 реплей-сценарію: XP кроків дня 1 + межа дня; лише видане', () => {
    const s = play();
    const day1 = ['PROLOGUE-HOME-001', 'ST-001', 'ST-002', 'ST-003', 'CH1-HOME-001', 'ST-004', 'ST-005'];
    const xp = day1.reduce((a, id) => a + ((quests as { id: string; xp: number }[]).find((q) => q.id === id)?.xp ?? 0), 0) + XP_DAY + XP_SECRET;
    expect(daySummary(s, 1, GAME_DEFS)?.reward.xp).toBe(xp);
    // День 2: велозона (побічка) — +10 ОМ; XP — кроки дня 2 + межа дня 2.
    const day2 = ['CH1-D2-001', 'CH1-D2-ELISE-001', 'q.elise-bike-area', 'CH1-D2-CAMP-001', 'CH1-D2-FIRE-001'];
    expect(daySummary(s, 2, GAME_DEFS)?.reward).toEqual({ xp: day2.reduce((a, id) => a + ((quests as { id: string; xp: number }[]).find((q) => q.id === id)?.xp ?? 0), 0) + XP_DAY, om: OM_SIDE });
  });
  it('нагорода, якої ключа в стані немає (старий сейв без прогресії), в підсумок не потрапляє', () => {
    const s = play();
    const { progress: _dropped, ...game } = s.game;
    void _dropped;
    expect(daySummary({ ...s, game }, 1, GAME_DEFS)?.reward).toEqual({ xp: 0, om: 0 });
  });
});

describe('сейв: поле progress, старі сейви', () => {
  const OPTS = { story: STORY, ...(GAME_DEFS.life ? { life: GAME_DEFS.life } : {}) };
  it('круговий обхід: прогресія зберігається й читається назад тим самим', () => {
    const s = play();
    const r = fromSave(serialize(s), OPTS);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.sim.game.progress).toEqual(s.game.progress);
  });
  it('старі сейви v1, v2, v3 (tests/saves) завантажуються; без квестів — прогресії немає (нулі за замовчуванням)', () => {
    for (const [f, fixture] of [['v1', v1], ['v2', v2], ['v3', v3]] as const) {
      const r = fromSave(JSON.stringify(fixture), {});
      expect(r.ok, f).toBe(true);
      if (r.ok) expect(progressOf(r.sim.game), f).toEqual({ xp: 0, om: 0, keys: [], cosmetics: [] });
    }
  });
  it('сейв до GAME-181 з уже завершеними квестами: XP зараховано один раз із завершеного; повторне завантаження нічого не додає', () => {
    const s = play();
    const old = { ...s, game: { ...s.game } };
    delete (old.game as { progress?: unknown }).progress;
    const r = fromSave(serialize(old), OPTS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const stepXp = (quests as { xp: number }[]).reduce((a, q) => a + q.xp, 0);
    expect(progressOf(r.sim.game).xp).toBe(stepXp + 3 * XP_DAY + XP_CHAPTER);   // секрети й відкриття зі старого сейву не відновити
    const again = fromSave(serialize(r.sim), OPTS);
    expect(again.ok && progressOf(again.sim.game)).toEqual(progressOf(r.sim.game));
    expect(backfillProgress(r.sim.game, STORY)).toBe(r.sim.game);
  });
  it('зіпсована прогресія в сейві відхиляється (SAVE_SHAPE), а не мовчки читається', () => {
    const s = play();
    for (const bad of [{ xp: -1, om: 0, keys: [], cosmetics: [] }, { xp: 1.5, om: 0, keys: [], cosmetics: [] }, { xp: 1, om: 0, keys: ['b', 'a'], cosmetics: [] }, { xp: 1, om: 0, keys: ['a', 'a'], cosmetics: [] }, { xp: 1, om: 0, keys: [], cosmetics: [1] }, 'x']) {
      const r = fromSave(serialize({ ...s, game: { ...s.game, progress: bad as never } }), OPTS);
      expect(r.ok, JSON.stringify(bad)).toBe(false);
      if (!r.ok) expect(r.code).toBe('SAVE_SHAPE');
    }
  });
});

describe('мутація «квест без XP»: ядро не вигадує нагороду', () => {
  it('той самий прохід із квестом без xp дає на цю суму менше (перевірка вище на повну суму почервоніла б)', () => {
    const story = STORY;
    const { xp: _dropped, ...st001 } = story.quests['ST-001'] as NonNullable<(typeof story.quests)[string]>;
    void _dropped;
    const bare = { ...GAME_DEFS, story: { ...story, quests: { ...story.quests, 'ST-001': st001 } } };
    const s = PROLOGUE_BIKE.reduce((a, i) => step(a, i, { defs: bare }), newSim(SEED, START_MONEY));
    expect(progressOf(s.game).xp).toBe(progressOf(play().game).xp - 10);
  });
});

describe('екран: ціль у HUD і блок прогресу в знімку сюжету', () => {
  const created = (): SimState => step(newSim(SEED, START_MONEY), { kind: 'command', command: { type: 'CreateCharacter', commandId: 'e0', profileId: 'profile.solo-explorer', transportId: 'transport.bike' } }, { defs: GAME_DEFS });
  it('ціль — назва активного ГОЛОВНОГО квесту; до персонажа й після кінця розділу цілі немає; бічний квест її не перебиває', () => {
    expect(storyOffer(newSim(SEED, 0), GAME_DEFS).offer.goal).toBeNull();
    expect(storyOffer(created(), GAME_DEFS).offer.goal).toEqual({ key: 'q.prologue-home-001' });
    const end = play();
    expect(storyOffer(end, GAME_DEFS).offer.stage).toBe('ended');
    expect(storyOffer(end, GAME_DEFS).offer.goal).toBeNull();
    const s = created();
    const side = Object.keys(STORY.quests).find((q) => STORY.quests[q]?.optional) as string;
    const withSide = { ...s.game, quests: { ...s.game.quests, [side]: { status: 'active' as const, done: [] } } };
    expect(goalOf(withSide, STORY)).toEqual({ key: 'q.prologue-home-001' });   // побічка активна, а ціль — крок головного
  });
  it('знімок: XP/ОМ/звання за станом, вісім навичок із ключами рангів і «що відкриє наступний ранг»', () => {
    const o = storyOffer(play(), GAME_DEFS).offer.progress;
    expect(o.xp).toBe(progressOf(play().game).xp);
    expect(o.title).toMatchObject({ index: 3, key: 'title.4', nextKey: 'title.5' });
    expect(o.skills.map((x) => x.id)).toEqual([...SKILL_IDS]);
    for (const sk of o.skills) {
      expect(sk.key).toBe(sk.id);
      if (sk.rank > 0) expect(sk.rankKey).toBe(`${sk.id}.r${sk.rank}`); else expect(sk.rankKey).toBeNull();
      expect(sk.unlockKey).toBe(sk.rank < 5 ? `${sk.id}.r${sk.rank + 1}.unlock` : null);
    }
    expect(progressOffer(initialState(0)).title).toMatchObject({ index: 0, key: 'title.1', nextKey: 'title.2', into: 0, span: 60 });
  });
  it('підсумок дня в знімку: нагорода, «Наступного разу» — активний головний квест; після кінця розділу — null', () => {
    const day1 = PROLOGUE_BIKE.reduce((s, i) => (s.game.quests['ST-005']?.status === 'completed' ? s : step(s, i, { defs: GAME_DEFS })), newSim(SEED, START_MONEY));
    const sum = storyOffer(day1, GAME_DEFS).offer.summary;
    expect(sum?.nextKey).toBe('q.ch1-d2-001');
    expect(sum?.reward.xp).toBeGreaterThan(0);
    expect(storyOffer(play(), GAME_DEFS).offer.summary?.nextKey).toBeNull();
  });
});
