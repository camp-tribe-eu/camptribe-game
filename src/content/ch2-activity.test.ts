/// <reference types="node" />
// GAME-290 · CH2-D2-ACTIVITY: тихий водоспад, галявина орхідей, ідеальне фото Вікторії (нагорода-предмет), безпечний варіант за погодою (майстер-клас) і вечір дня 2.
// Закон 1: кожен сторож нижче показано червоним мутацією (текст червоного — в описі PR):
//  1) сцена активності завершувана за КОЖНОЇ погоди з WEATHERS × комбінація профіль/транспорт/тварина × усі вибори сцени — на справжніх командах ядра й справжньому режисері;
//  2) МУТАЦІЯ «прибрано безпечний варіант дощу» (майстер-клас не пропонується в дощ) → авто в дощ не пропонує жодного виходу → сторож червоніє;
//  3) нічого не блокується: водоспад, обраний у ☰ у дощ, завершується без сцени; вечір без вечері (пора спати) завершується сам;
//  4) розділ 1 цього не бачить; сцени не відкриваються до свого етапу.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { enumerateCombos } from '../../scripts/validator/combos.mjs';
import { type Command } from '../core/commands';
import { advance, minuteOfDay } from '../core/clock';
import { fromSave, serialize } from '../core/save';
import { step, todayWeather, type SimState } from '../core/sim';
import { CHAPTER2_START } from '../core/story';
import { WEATHERS, dayOf, weatherOf, type Weather } from '../core/weather';
import { summaryOffer, tomorrowKeyOf } from '../view/story-offer';
import { ch1End } from './ch1-end.fixture';
import { ACTIVITIES, EVENING_QUEST, EVENING_SCENE, MEADOW, PERFECT_ITEM, RAIN_FLAG, WATERFALL, WATERFALL_QUEST, WORKSHOP_QUEST, activityDue, eveningDue, eveningFinishMove, offeredActivities, type ActivityDef } from './ch2-activity';
import { ch2CarDecisions } from './ch2-live';
import { PLAN_QUEST, PLAN_SPOT, TRAIL_BRANCHES } from './ch2-plan';
import { DINNER_SPOT } from './ch2-dinner';
import { liveSpot, spotMove, storyMoves } from './director';
import type { Move } from './moves';
import { GAME_DEFS } from './slice-defs';
import { CONTENT, STORY } from './story';
import { SECONDS, moveSeconds } from './time-model';
import ukC from '../../content/locales/uk.json';
import enC from '../../content/locales/en.json';

const CTX = { defs: GAME_DEFS };
const ACTIVITY = 'CH2-D2-ACTIVITY-001';
let n = 0;
const cmdOf = (m: object): Command => ({ ...m, commandId: `a290-${n++}` } as Command);
const run = (s: SimState, m: object): SimState => {
  const c = cmdOf(m);
  const r = step(s, { kind: 'command', command: c }, CTX);
  const p = r.game.processed[c.commandId];
  if (p?.ok !== true) throw new Error(`${JSON.stringify(m)} → ${p?.ok === false ? p.code : 'без відповіді'}`);
  return r;
};
function settle(s: SimState): SimState {   // подія в дорозі відкриває діалог — закрити, як гравець
  for (let i = 0; s.game.dialogue !== null && i < 40; i++) {
    const before = s.game.dialogue;
    s = step(s, { kind: 'command', command: cmdOf({ type: 'Continue' }) }, CTX);
    if (s.game.dialogue === before) s = step(s, { kind: 'command', command: cmdOf({ type: 'Choose', choice: 0 }) }, CTX);
  }
  return s;
}
/** Режисер, як main.ts direct(): усе, що шле сюжет, ЦІЛИМ пакетом, поки він не замовкне. */
function direct(s: SimState): { sim: SimState; sent: Move[] } {
  const sent: Move[] = [];
  for (let i = 0; i < 12; i++) {
    const batch = storyMoves(s, GAME_DEFS);
    if (batch.length === 0) return { sim: s, sent };
    for (const m of batch) { sent.push(m); s = run(s, m); }
  }
  throw new Error(`режисер не замовкає: ${JSON.stringify(sent)}`);
}

const base = ch1End();
/** Світ із потрібною погодою В МОМЕНТ дії: зерно, для якого weatherOf(зерно, день годинника sim) = w. */
const withWeather = (s: SimState, w: Weather): SimState => { for (let k = 1; k < 5000; k++) if (weatherOf(k, dayOf(s.clock)) === w) return { ...s, worldSeed: k }; throw new Error(`немає зерна з ${w}`); };

type Combo = { profile: string | null; transport: string | null; animal: string };
const COMBOS = enumerateCombos(CONTENT) as Combo[];
const comboName = (c: Combo): string => `${c.profile}/${c.transport}/${c.animal}`;

/** День 2, вибір виходу «Як провести день» (квест ACTIVITY активний, гравець у кемпінгу, 10:00), погода w; комбінація combo. Шлях: прибуття → прогулянка → вечір → сон → план → гілка (ядром). */
function activityDay(w: Weather, combo?: Combo): SimState {
  const b = combo && base.game.player ? { ...base, game: { ...base.game, player: { ...base.game.player, profileId: combo.profile ?? base.game.player.profileId, transportId: combo.transport ?? base.game.player.transportId, animalId: combo.animal } } } : base;
  let s: SimState = { ...b, worldSeed: 1 };
  const go = (m: object): void => { s = run(s, m); };
  go({ type: 'Sleep' });   // сон кінця розділу 1 → тизер → «Продовжити подорож» (як у живій грі): без нього день розділу в HUD лічився б із зсувом
  go({ type: 'StartChapter2' });
  go({ type: 'Visit', locationId: 'loc.road' }); s = settle(s);
  go({ type: 'Visit', locationId: 'loc.camp.mullerthal' }); s = settle(s);
  go({ type: 'Talk', npcId: 'npc.host-mullerthal' });
  go({ type: 'Choose', choice: 0 }); go({ type: 'Choose', choice: 1 }); go({ type: 'Continue' });
  go({ type: 'CompleteQuest', questId: CHAPTER2_START });
  go({ type: 'Visit', locationId: 'loc.trail.official' }); s = settle(s);
  go({ type: 'CompleteQuest', questId: 'CH2-D1-WALK-001' });
  go({ type: 'Visit', locationId: 'loc.camp.mullerthal' }); s = settle(s);
  s = { ...s, clock: advance(s.clock, (19 * 60 - minuteOfDay(s.clock.minutes) + 1440) % 1440) };   // вечір дня 1 розділу (19:00)
  go({ type: 'Sleep' });
  s = direct(s).sim;   // сюжет завершує день-квест вечора (GAME-288)
  expect(s.game.quests[PLAN_QUEST]?.status, 'квест плану відкрито').toBe('active');
  go({ type: 'CompleteQuest', questId: PLAN_QUEST, to: TRAIL_BRANCHES[0]?.quest });
  go({ type: 'CompleteQuest', questId: TRAIL_BRANCHES[0]?.quest });
  expect(s.game.quests[ACTIVITY]?.status, 'обидві гілки сходяться в ACTIVITY').toBe('active');
  s = withWeather(s, w);
  expect(todayWeather(s)).toBe(w);
  return s;
}

type Dlg = Record<string, { choices?: unknown[] }>;
const NODES = (id: string): Dlg => (GAME_DEFS.story?.dialogues[id]?.nodes ?? {}) as Dlg;
interface Played { readonly sim: SimState; readonly nodes: string[]; readonly seconds: number }
/** Гравець читає сцену до кінця: у вузлах з вибором бере `pick(вузол)`. Секунди — модель часу гравця (як у ch2-plan.test: рядок + кнопка). */
function readScene(from: SimState, scene: string, pick: (node: string) => number): Played {
  let s = from;
  const nodes: string[] = [];
  let seconds = 0;
  for (let i = 0; s.game.dialogue !== null; i++) {
    if (i > 30) throw new Error('розмова не закривається');
    expect(s.game.dialogue.id).toBe(scene);
    const id = s.game.dialogue.node;
    nodes.push(id);
    const m = NODES(scene)[id]?.choices ? { type: 'Choose', choice: pick(id) } : { type: 'Continue' };
    seconds += moveSeconds(m as never) + SECONDS.line;
    s = run(s, m);
  }
  return { sim: s, nodes, seconds };
}
const played = (s: SimState, scene: string): boolean => s.journal.some((e) => e.type === 'StartScene' && e.ref === scene);

interface Day { readonly sim: SimState; readonly nodes: string[]; readonly sent: Move[]; readonly seconds: number; readonly activity: ActivityDef }
/**
 * Рішення дня «як провести»: авто пропонує виходи за погодою (activities), гравець бере `which`-й; ланцюг ходів → режисер сам відкриває сцену → гравець читає з вибором pick → режисер завершує квест.
 * Секунди: відповідь рамки + поїздка (Visit) + сцена + «Далі» до авто.
 */
function playActivity(from: SimState, w: Weather, which: number, pick: number, activities: readonly ActivityDef[] = ACTIVITIES): Day {
  const trips = ch2CarDecisions(from.game, w, activities);
  expect(trips.length, `погода ${w}: авто пропонує хоч один вихід («Як провести день?»)`).toBeGreaterThan(0);
  const chain = trips[which] as Move[];
  const activity = ACTIVITIES.find((a) => a.quest === (chain[0] as { to?: string }).to) as ActivityDef;
  let s = from;
  let seconds = SECONDS.walkOnMap;   // дійти до авто
  for (const m of chain) { s = run(s, m); seconds += moveSeconds(m as never); }
  s = settle(s);
  expect(from.game.dialogue, 'сцени ще не було').toBeNull();
  const d1 = direct(s);
  expect(d1.sent.map((m) => (m as { sceneId?: string }).sceneId), 'режисер відкриває сцену цього виходу, і лише її').toEqual([activity.scene]);
  expect(d1.sim.game.dialogue?.id).toBe(activity.scene);
  const sc = readScene(d1.sim, activity.scene, (id) => (activity.id === 'waterfall' ? (id === 'quiet' ? pick & 1 : (pick >> 1) & 1) : pick));   // водоспад: два вибори (тиша, кут) — pick кодує обидва бітами
  seconds += sc.seconds;
  expect(played(sc.sim, activity.scene), 'запис StartScene в журналі').toBe(true);
  const d2 = direct(sc.sim);
  return { sim: d2.sim, nodes: sc.nodes, sent: [...d1.sent, ...d2.sent], seconds, activity };
}

describe('GAME-290 · сцена активності завершувана за КОЖНОЇ погоди', () => {
  it('вибірка названа: комбінацій 5 (enumerateCombos), погод 3, виходів за погодою: сухо 2, дощ 1', () => {
    expect(COMBOS.length).toBe(5);
    expect(WEATHERS.length).toBe(3);
    expect(WEATHERS.map((w) => offeredActivities(w).map((a) => a.id).join('+'))).toEqual(['waterfall+workshop', 'waterfall+workshop', 'workshop']);
    process.stdout.write(`GAME-290 combos: ${COMBOS.map(comboName).join('; ')}\n`);
  });

  let runs = 0;
  const paths = new Set<string>();
  for (const combo of COMBOS) {
    it(`${comboName(combo)}: усі погоди × усі виходи × усі вибори сцени → сцена зіграна, квест завершено, ідеальне фото в рюкзаку, вечір відкрито`, () => {
      for (const w of WEATHERS) {
        const day = activityDay(w, combo);
        const offered = ch2CarDecisions(day.game, w);
        expect(offered.length, `погода ${w}: авто пропонує хоч один вихід («Як провести день?»)`).toBeGreaterThan(0);
        expect(offered.length, `погода ${w}: виходів ${offeredActivities(w).length}`).toBe(offeredActivities(w).length);
        expect(storyMoves(day, GAME_DEFS), 'до рішення сюжет нічого не шле').toEqual([]);
        offered.forEach((_, which) => {
          const maxPick = (offeredActivities(w)[which] as ActivityDef).id === 'waterfall' ? 4 : 3;
          for (let pick = 0; pick < maxPick; pick++) {
            const r = playActivity(day, w, which, pick);
            runs++;
            const g = r.sim.game;
            expect(g.quests[r.activity.quest]?.status, `${r.activity.id}/${w}: квест виходу завершено`).toBe('completed');
            expect(g.quests[EVENING_QUEST]?.status, 'далі — вечір дня 2').toBe('active');
            expect(g.inventory[PERFECT_ITEM], 'ідеальне фото — рівно один примірник').toBe(1);
            expect(g.grants, 'нагорода виходу видана раз').toContain(r.activity.id === 'waterfall' ? 'rw.ch2-d2-waterfall' : 'rw.ch2-d2-workshop');
            expect(g.player?.locationId, 'після сцени родина в кемпінгу').toBe('loc.camp.mullerthal');
            expect(g.flags.includes(RAIN_FLAG), 'прапорець дощу — лише майстер-клас у дощ').toBe(r.activity.id === 'workshop' && w === 'rain');
            expect(storyMoves(r.sim, GAME_DEFS), 'сюжет мовчить після завершення').toEqual([]);
            if (r.activity.id === 'waterfall') {
              expect(r.sim.game.quests[WATERFALL_QUEST]?.done, 'галявину орхідей відмічено').toContain('o2-orchid');
              expect(r.sent.map((m) => m.type)).toEqual(['StartScene', 'Visit', 'CompleteQuest', 'Visit']);
              expect(r.sent.slice(1).map((m) => (m as { locationId?: string }).locationId)).toEqual([MEADOW, undefined, 'loc.camp.mullerthal']);
            } else {
              expect(r.sent.map((m) => m.type)).toEqual(['StartScene', 'CompleteQuest']);
            }
            paths.add(`${r.activity.id}:${r.nodes.join('>')}`);
          }
        });
      }
    });
  }
  it('підсумок вибірки: 5 комбінацій × (водоспад: 2 погоди × 4 вибори + майстер-клас: 3 погоди × 3 вибори) = 85 проходжень; шляхів сцен 4 + 3 (+ вступ дощу)', () => {
    expect(runs).toBe(COMBOS.length * (2 * 4 + 3 * 3));
    const wf = [...paths].filter((p) => p.startsWith('waterfall:'));
    const ws = [...paths].filter((p) => p.startsWith('workshop:'));
    expect(wf.length, 'водоспад: 2 × 2 вибори кута/тиші').toBe(4);
    expect(ws.length, 'майстер-клас: 3 заняття × (сухо/дощ — інший вступ)').toBe(6);
    expect(wf.every((p) => p.includes('open>look>hush>quiet')), 'сцена читається з початку').toBe(true);
    process.stdout.write(`GAME-290 playthroughs: ${runs}; scene paths: waterfall ${wf.length}, workshop ${ws.length}\n`);
  });
});

describe('GAME-290 · МУТАЦІЯ «прибрано безпечний варіант дощу»', () => {
  const noRain: ActivityDef[] = ACTIVITIES.map((a) => (a.id === 'workshop' ? { ...a, weathers: a.weathers.filter((x) => x !== 'rain') } : a));
  it('справжні дані: у дощ авто пропонує майстер-клас (і лише його), водоспаду немає', () => {
    const day = activityDay('rain');
    const trips = ch2CarDecisions(day.game, 'rain');
    expect(trips.map((t) => (t[0] as { to?: string }).to)).toEqual([WORKSHOP_QUEST]);
  });
  it('мутація: без безпечного варіанта в дощ авто не пропонує жодного виходу → сторож «кожна погода має вихід» червоніє', () => {
    const day = activityDay('rain');
    expect(() => playActivity(day, 'rain', 0, 0, noRain)).toThrow(/погода rain: авто пропонує хоч один вихід/);
    // а в суху погоду мутація нічого не ламає — сторож червоніє саме на дощі
    expect(() => playActivity(activityDay('sunny'), 'sunny', 0, 0, noRain)).not.toThrow();
    expect(offeredActivities('rain', noRain)).toEqual([]);
  });
});

describe('GAME-290 · розділ ніколи не блокується', () => {
  it('дощ + водоспад, обраний у ☰ (авто його не пропонує): сцени немає, візит на водоспад → квест завершується сам, ідеальне фото видано, вечір відкрито', () => {
    let s = activityDay('rain');
    s = run(s, { type: 'CompleteQuest', questId: ACTIVITY, to: WATERFALL_QUEST });
    expect(activityDue(s, 'rain'), 'у дощ водоспад не має сцени').toBeNull();
    s = run(s, { type: 'Visit', locationId: WATERFALL });
    s = settle(s);
    const d = direct(s);
    expect(d.sent.map((m) => m.type), 'без сцени: завершення + назад у кемпінг').toEqual(['CompleteQuest', 'Visit']);
    expect(played(d.sim, 'dlg.ch2-waterfall')).toBe(false);
    expect(d.sim.game.quests[WATERFALL_QUEST]?.status).toBe('completed');
    expect(d.sim.game.quests[EVENING_QUEST]?.status).toBe('active');
    expect(d.sim.game.inventory[PERFECT_ITEM]).toBe(1);
  });
  it('сухо: майстер-клас з ☰ теж має сцену; обидва виходи ядра лишаються за будь-якої погоди', () => {
    for (const w of WEATHERS) {
      const s = activityDay(w);
      for (const to of [WATERFALL_QUEST, WORKSHOP_QUEST]) expect(step(s, { kind: 'command', command: cmdOf({ type: 'CompleteQuest', questId: ACTIVITY, to }) }, CTX).game.quests[to]?.status, `${w}/${to}`).toBe('active');
    }
  });
  it('вечір дня 2: до 18:00 стіл мертвий; з 18:00 стіл живий, сцена відкривається; без вечері («пора спати» 22:00) квест завершується сам', () => {
    const w: Weather = 'sunny';
    const after = playActivity(activityDay(w), w, 0, 0).sim;
    expect(eveningDue(after), 'ще не 18:00').toBe(false);
    expect(liveSpot(after, DINNER_SPOT)).toBe(false);
    expect(eveningFinishMove(after)).toBeNull();
    const at = (hh: number): SimState => ({ ...after, clock: advance(after.clock, (hh * 60 - minuteOfDay(after.clock.minutes) + 1440) % 1440) });
    const ev = at(19);
    expect(eveningDue(ev)).toBe(true);
    expect(liveSpot(ev, DINNER_SPOT)).toBe(true);
    expect(spotMove(ev, DINNER_SPOT)).toEqual({ type: 'StartScene', sceneId: EVENING_SCENE, facts: [] });
    const night = at(22);
    expect(eveningFinishMove(night), 'ніч — вечір завершується без вечері').toEqual({ type: 'CompleteQuest', questId: EVENING_QUEST });
    expect(storyMoves(night, GAME_DEFS).some((m) => m.type === 'CompleteQuest')).toBe(true);
  });
  it('розділ 1 цього не бачить: у кінці розділу 1 сюжет мовчить, стіл мертвий', () => {
    expect(storyMoves(base, GAME_DEFS)).toEqual([]);
    expect(spotMove(base, DINNER_SPOT)).toBeNull();
    expect(spotMove(base, PLAN_SPOT)).toBeNull();
  });
});

describe('GAME-290 · вечір, підсумок дня 2 і час гравця за моделлю', () => {
  const picks = [0, 1];
  it('вечір: сцена (8–9 вузлів) → сюжет завершує квест → сон → підсумок «день 2» з тизером; обидві гілки фото (водоспад / майстер-клас)', () => {
    for (const which of [0, 1]) {
      const w: Weather = 'sunny';
      const day = playActivity(activityDay(w), w, which, 0);
      let s = { ...day.sim, clock: advance(day.sim.clock, (19 * 60 - minuteOfDay(day.sim.clock.minutes) + 1440) % 1440) };
      s = run(s, spotMove(s, DINNER_SPOT) as object);
      const ev = readScene(s, EVENING_SCENE, (id) => (id === 'ask' ? picks[0] as number : 0));
      expect(ev.nodes, `фото: ${which === 0 ? 'з водоспаду' : 'з майстер-класу'}`).toContain(which === 0 ? 'w1' : 'w2');
      expect(ev.nodes).not.toContain(which === 0 ? 'w2' : 'w1');
      const d = direct(ev.sim);
      expect(d.sent).toEqual([{ type: 'CompleteQuest', questId: EVENING_QUEST }]);
      s = run(d.sim, { type: 'Sleep' });
      const o = summaryOffer(s, GAME_DEFS).summary;
      expect(o?.day, 'день 2 розділу').toBe(2);
      expect(o?.tomorrowKey).toBe('sum.tomorrow.ch2.2');
      expect(tomorrowKeyOf(2, true)).toBe('sum.tomorrow.ch2.2');
    }
  });
  it('час дня 2 за моделлю гравця (time-model.ts): план + вставка + рішення + сцена + вечір + сон + підсумок — число в описі PR', () => {
    const all = [...secs()].flat();
    const lo = Math.min(...all);
    const hi = Math.max(...all);
    process.stdout.write(`GAME-290 activity+evening model seconds: min ${lo}, max ${hi}\n`);
    expect(lo).toBeGreaterThan(60);
    expect(hi).toBeLessThan(600);
  });
  function secs(): number[][] {
    const out: number[][] = [];
    for (const w of WEATHERS) {
      const day = activityDay(w);
      offeredActivities(w).forEach((_, which) => {
        const a = playActivity(day, w, which, 0);
        let s = { ...a.sim, clock: advance(a.sim.clock, (19 * 60 - minuteOfDay(a.sim.clock.minutes) + 1440) % 1440) };
        s = run(s, spotMove(s, DINNER_SPOT) as object);
        const ev = readScene(s, EVENING_SCENE, () => 0);
        // план (7 вузлів) і вставка стежки (6) — окремі сцени GAME-289, їх секунди беремо з тієї ж моделі: вузол = рядок + кнопка; прохід до столу — walkOnMap
        const plan = 7 * (SECONDS.line + moveSeconds({ type: 'Continue' } as never)) + SECONDS.walkOnMap;
        const trail = 6 * (SECONDS.line + moveSeconds({ type: 'Continue' } as never)) + SECONDS.walkOnMap;
        out.push([plan + trail + a.seconds + SECONDS.walkOnMap + ev.seconds + moveSeconds({ type: 'Sleep' } as never) + SECONDS.summary]);
      });
    }
    return out;
  }
});

describe('GAME-290 · тексти: пара uk/en, довжина, зміст', () => {
  const RAW = (name: string): { nodes: { id: string; choices?: unknown[] }[] } => JSON.parse(readFileSync(new URL(`../../content/dialogue/${name}.json`, import.meta.url), 'utf8')) as { nodes: { id: string; choices?: unknown[] }[] };
  it('кожен ключ сцен — у uk і en, репліка ≤ 110 знаків; предмет має назву', () => {
    for (const name of ['ch2-waterfall', 'ch2-workshop', 'ch2-evening']) for (const x of RAW(name).nodes) {
      for (const k of [`dlg.${name}.${x.id}`, ...(x.choices ?? []).map((_, i) => `dlg.${name}.${x.id}.c${i + 1}`)]) for (const [lang, l] of [['uk', ukC], ['en', enC]] as const) {
        const t = (l as Record<string, string>)[k];
        expect(t, `${lang}/${k}`).toBeTruthy();
        expect(Array.from(t as string).length, `${lang}/${k}`).toBeLessThanOrEqual(110);
      }
    }
    for (const l of [ukC, enC]) expect((l as Record<string, string>)['item.photo.perfect']).toBeTruthy();
  });
});

describe('GAME-290 · сейв дня 2 для e2e і розмір', () => {
  // вечір дня 2 (19:00) після водоспаду (сонце) і після майстер-класу (дощ): стартові стани e2e вечері
  for (const [name, w, which] of [['waterfall', 'sunny', 0], ['workshop', 'rain', 0]] as const) {
    const file = new URL(`../../tests/e2e/fixtures/ch2-evening-${name}.json`, import.meta.url);
    it(`сейв «вечір дня 2 після ${name}» = те, що ядро збирає зараз (G290_WRITE=1 переписує)`, () => {
      n = 995_000;
      const a = playActivity(activityDay(w), w, which, 0).sim;
      const json = `${serialize({ ...a, clock: advance(a.clock, (19 * 60 - minuteOfDay(a.clock.minutes) + 1440) % 1440) })}\n`;
      if (process.env.G290_WRITE === '1') { writeFileSync(file, json); return; }
      expect(existsSync(file), 'немає фікстури: G290_WRITE=1').toBe(true);
      expect(readFileSync(file, 'utf8'), 'фікстура розійшлась із ядром').toBe(json);
      const l = fromSave(json, { story: STORY });
      if (!l.ok) throw new Error(`${l.code} ${l.detail}`);
      expect(eveningDue(l.sim), 'у сейві стіл вечері живий').toBe(true);
    });
  }
  for (const w of ['sunny', 'rain'] as const) {
    const file = new URL(`../../tests/e2e/fixtures/ch2-activity-${w}.json`, import.meta.url);
    it(`сейв «день 2, вибір виходу, ${w}» = те, що ядро збирає зараз (G290_WRITE=1 переписує); сейв < 500 КБ`, () => {
      n = 990_000;   // ідентифікатори команд у сейві не залежать від порядку інших тестів
      const sim = activityDay(w);
      const json = `${serialize(sim)}\n`;
      expect(new TextEncoder().encode(json).length, 'сейв < 500 КБ').toBeLessThan(500 * 1024);
      if (process.env.G290_WRITE === '1') { writeFileSync(file, json); return; }
      expect(existsSync(file), 'немає фікстури: G290_WRITE=1').toBe(true);
      expect(readFileSync(file, 'utf8'), 'фікстура розійшлась із ядром').toBe(json);
      const l = fromSave(json, { story: STORY });
      if (!l.ok) throw new Error(`${l.code} ${l.detail}`);
      expect(todayWeather(l.sim)).toBe(w);
      expect(l.sim.game.quests[ACTIVITY]?.status).toBe('active');
    });
  }
});
