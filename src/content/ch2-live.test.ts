// GAME-296 · розділ 2 у ЖИВІЙ мапі-першій грі: «ходимо» від «Продовжити подорож» до кінця розділу лише тим, що дає мапа (дотик до об'єкта → рамка вибору → відповідь), ☰ і режисер.
// Гравець іде за підказкою «Далі:» (nextTarget) — отже тест доводить і шлях, і підказку. Раніше розділ 2 проходився ядром і повним перебором, а з Мюллерталя нікуди було їхати.
// Закон 1: сторож червоніє мутаціями нижче (прибрано вихід — прохід зупиняється; HUD-день від сирого дня гри — розбіжність із підсумком).
import { describe, expect, it } from 'vitest';
import { EVENING, advance, minuteOfDay } from '../core/clock';
import { nextCommandId, type Command } from '../core/commands';
import { chapter2Complete } from '../core/story';
import { step, type SimState } from '../core/sim';
import { dayOf } from '../core/weather';
import { chapterDay, goalOf, storyOffer, type StoryView } from '../view/story-offer';
import { agendaOf } from './agenda';
import { ch1End } from './ch1-end.fixture';
import { ch2FinishMove, isExcursion } from './ch2-live';
import { liveSpot, spotMove, storyMoves } from './director';
import { isPlanSpot } from './ch2-plan';
import { MAP_LOCATION, isMapFirstSpot, mapKeyFor, moveKey, nextTarget, resolveSpot, sameMove } from './map-first';
import type { Move } from './moves';
import { GAME_DEFS } from './slice-defs';
import { STORY } from './story';

const DEFS = GAME_DEFS;
const view = (choice: string | null = null): StoryView => ({ mapFirst: true, trunk: false, near: null, backpack: [], choice });
const run = (s: SimState, m: Move): SimState => {
  const c = { ...m, commandId: nextCommandId(s.game) } as Command;
  const r = step(s, { kind: 'command', command: c }, { defs: DEFS });
  const p = r.game.processed[c.commandId];
  if (p?.ok !== true) throw new Error(`${JSON.stringify(m)} → ${p?.ok === false ? p.code : 'без відповіді'}`);
  return r;
};
/** Режисер, як main.ts direct(): усе, що сюжет шле сам, по одному, поки не замовкне. */
function direct(s: SimState): SimState {
  for (let i = 0; i < 20; i++) {
    const mv = storyMoves(s, DEFS)[0];
    if (!mv) return s;
    s = run(s, mv);
  }
  throw new Error('режисер не замовкає');
}
/** Відповідь гравця в рамці розмови (як кнопка): перша відповідь. */
function answer(s: SimState): SimState {
  const o = storyOffer(s, DEFS, view());
  const a = o.offer.dialogue?.answers[0];
  const m = a ? o.intents.get(a.id) : undefined;
  if (!m) throw new Error('розмова без відповіді');
  return direct(run(s, m));
}
const toEvening = (s: SimState): SimState => {
  const tod = minuteOfDay(s.clock.minutes);
  return tod >= EVENING ? s : { ...s, clock: advance(s.clock, EVENING - tod) };
};

interface Step { readonly key: string; readonly spot: string | null; readonly loc: string | null; readonly map: string; readonly day: number }
/**
 * Дотик до об'єкта так, як це робить main.ts: розмова з мешканцем; об'єкт-вказівник із сценою — сцена режисера; решта — resolveSpot (поїздка, вибір); `pick` — яку відповідь рамки натиснути.
 * Кидає, якщо об'єкт мертвий — тест гравця застряг би на ньому.
 */
function touch(s: SimState, name: string, pick: number): SimState {
  if (name.startsWith('npc.')) return direct(run(s, { type: 'Talk', npcId: name }));
  if (isMapFirstSpot(name) && !(isPlanSpot(name) && spotMove(s, name) !== null)) {
    const r = resolveSpot(s, DEFS, name);
    if (!r) throw new Error(`${name}: об'єкт мертвий`);
    if (r.options || r.confirm || r.trips) {
      const o = storyOffer(s, DEFS, view(name));
      const a = o.offer.dialogue?.answers.filter((x) => x.kind !== 'cancel')[pick];
      const intent = a ? o.intents.get(a.id) : undefined;
      if (!intent) throw new Error(`${name}: у рамці вибору нема відповіді ${pick}`);
      const chain = r.trips?.find((t) => t[0] !== undefined && sameMove(t[0], intent)) ?? (r.confirm && moveKey(r.moves.at(-1) as Move) === moveKey(intent) ? r.moves : [intent]);
      for (const m of chain) s = run(s, m);
      return direct(s);
    }
    for (const m of r.moves) s = run(s, m);
    return direct(s);
  }
  const m = spotMove(s, name);
  if (!m || !liveSpot(s, name, DEFS)) throw new Error(`${name}: об'єкт мертвий`);
  return direct(run(s, m));
}

/**
 * Гравець іде за «Далі:» до `until`. Спот null — «вільний час / спати»: ☰ «Лягти спати», якщо воно є, інакше дочекатись вечора (18:00). `pick` — відповідь рамки за id квесту (за замовчуванням перша).
 * Повертає стан і кроки (ключ підказки, об'єкт, локація, мапа, день HUD).
 */
function follow(from: SimState, stop: (s: SimState) => boolean, pick: Readonly<Record<string, number>> = {}): { sim: SimState; steps: Step[] } {
  let s = from;
  const steps: Step[] = [];
  const keysWait: string[] = [];
  for (let i = 0; i < 80 && !stop(s); i++) {
    if (s.game.dialogue !== null) { s = answer(s); continue; }
    const t = nextTarget(s, DEFS);
    const o = storyOffer(s, DEFS, view());
    const loc = s.game.player?.locationId ?? null;
    if (!t) throw new Error(`${i}: підказки «Далі» нема (${loc}, ${Object.entries(s.game.quests).filter(([, q]) => q.status === 'active').map(([k]) => k).join(',')})`);
    steps.push({ key: t.key, spot: t.spot, loc, map: mapKeyFor(loc), day: o.offer.day });
    if (t.spot === null) {
      // ☰ дає «Лягти спати» чи «Відпочити до вечора»; нічого — вільний час: чекаємо вечора (перемотування годинника, як ?skipMinutes в e2e)
      const wait = o.offer.actions.find((a) => a.kind === 'sleep') ?? o.offer.actions.find((a) => a.kind === 'rest');
      const m = wait ? o.intents.get(wait.id) : undefined;
      keysWait.push(`${t.key}:${wait?.kind ?? 'clock'}`);
      s = m ? direct(run(s, m)) : direct(toEvening(s));
      continue;
    }
    const active = Object.keys(s.game.quests).find((q) => s.game.quests[q]?.status === 'active' && STORY.quests[q] !== undefined && !STORY.quests[q]?.optional && q.startsWith('CH2-')) ?? '';
    s = touch(s, t.spot, pick[active] ?? 0);
  }
  if (!stop(s)) throw new Error(`не дійшли за 80 кроків: ${JSON.stringify(steps.slice(-4))}`);
  waits.push(...keysWait);
  return { sim: s, steps };
}
/** Що гравець робив, коли стрілки не було (підказка → дія ☰ чи годинник). */
const waits: string[] = [];

/** «Продовжити подорож»: кінець розділу 1 → сон → дія «chapter» у ☰ (як гравець). */
function startChapter2(): SimState {
  let s = ch1End();
  const z = storyOffer(s, DEFS, view());   // кінець розділу 1: ☰ «Лягти спати» (тизер розділу 2 показує Shell), потім «Продовжити подорож»
  s = run(s, z.intents.get((z.offer.actions.find((a) => a.kind === 'sleep') as { id: string }).id) as Move);
  const o = storyOffer(s, DEFS, view());
  const c = o.offer.actions.find((a) => a.kind === 'chapter');
  const m = c ? o.intents.get(c.id) : undefined;
  if (!m) throw new Error('«Продовжити подорож» немає в ☰');
  s = run(s, m);
  return direct(s);
}

const waterfallDone = (s: SimState): boolean => s.game.quests['CH2-D2-WATERFALL-001']?.status === 'completed';

describe('GAME-296 · живий прохід розділу 2: від «Продовжити подорож» до водоспаду лише дотиками', () => {
  it('шлях: дім → дорога → Мюллерталь → господиня → стежка → вечеря → сон → план → вставка → день → водоспад; кожен крок має «Далі»', () => {
    const { sim, steps } = follow(startChapter2(), waterfallDone);
    const keys = steps.map((x) => x.key);
    expect(keys.slice(0, 3), 'спершу авто двічі, потім господиня').toEqual(['next.ch2.drive', 'next.ch2.drive', 'next.ch2.host']);
    for (const k of ['next.ch2.walk', 'next.ch2.dinner', 'next.ch2.sleep', 'next.ch2.plan', 'next.ch2.trail', 'next.ch2.activity']) expect(keys.join(' '), k).toContain(k);
    expect(sim.game.quests['CH2-D2-EVENING-001']?.status, 'після водоспаду — вечір дня 2').toBe('active');
    expect(sim.game.quests['CH2-D2-WATERFALL-001']?.done, 'відповідь «Піти до водоспаду» їде туди й назад, а крок водоспаду завершується сам').toContain('o1-waterfall');
    expect(keys, 'після відповіді нової цілі при авто, яку воно не відкриє, нема').not.toContain('next.ch2.waterfall');
    expect(sim.game.player?.locationId, 'поїздка туди й назад: гравець знову в кемпінгу').toBe(MAP_LOCATION.mullerthal);
    expect(steps.every((x) => !isExcursion(x.loc)), 'локацій без мапи гравець не бачить: поїздки — туди й назад в одній відповіді').toBe(true);
    expect(steps.every((x) => x.map !== 'camp'), 'жодного кроку на мапі табору біля озера').toBe(true);
  });

  it('до кінця розділу 2 (водоспад → вечір → сон → Шенген → збір → додому) теж лише дотиками', () => {
    const { sim } = follow(startChapter2(), (s) => chapter2Complete(s.game, STORY));
    expect(sim.game.quests['CH2-SCHENGEN-001']?.status).toBe('completed');
    expect(sim.game.quests['CH2-D3-HOME-001']?.status).toBe('completed');
    expect(sim.game.campaignEnded).toBe(true);
  });

  it('майстер-клас — друга відповідь «Як проведемо день?»: теж доходить до кінця розділу', () => {
    const { sim } = follow(startChapter2(), (s) => chapter2Complete(s.game, STORY), { 'CH2-D2-ACTIVITY-001': 1 });
    expect(sim.game.quests['CH2-D2-WORKSHOP-001']?.status).toBe('completed');
    expect(sim.game.quests['CH2-D2-WATERFALL-001']).toBeUndefined();
  });

  it('галявина орхідей — окрема поїздка, коли крок водоспаду активний (рішення з ☰ панельного режиму): не завершує квест, а позначає необов\'язкову ціль', () => {
    const atActivity = follow(startChapter2(), (s) => s.game.quests['CH2-D2-ACTIVITY-001']?.status === 'active').sim;
    const toWaterfall = run(atActivity, { type: 'CompleteQuest', questId: 'CH2-D2-ACTIVITY-001', to: 'CH2-D2-WATERFALL-001' });
    const o = storyOffer(toWaterfall, DEFS, view('obj.vehicle'));
    expect(o.offer.dialogue?.key, 'поїздка: «Куди вирушаємо?»').toBe('choice.trip');
    expect(o.offer.dialogue?.answers.filter((a) => a.kind === 'visit').map((a) => a.key)).toEqual(['loc.waterfall', 'loc.meadow.orchid']);
    const after = touch(toWaterfall, 'obj.vehicle', 1);
    expect(after.game.quests['CH2-D2-WATERFALL-001']?.status).toBe('active');
    expect(after.game.quests['CH2-D2-WATERFALL-001']?.done).toEqual(['o2-orchid']);
    expect(after.game.player?.locationId).toBe(MAP_LOCATION.mullerthal);
  });

  it('вибір дня — рамка «Як проведемо день?» з двома відповідями; водоспад — туди й назад, майстер-клас — без поїздки', () => {
    const atActivity = follow(startChapter2(), (s) => s.game.quests['CH2-D2-ACTIVITY-001']?.status === 'active').sim;
    const o = storyOffer(atActivity, DEFS, view('obj.vehicle'));
    expect(o.offer.dialogue?.key).toBe('choice.day');
    expect(o.offer.dialogue?.answers.filter((a) => a.kind === 'choose').map((a) => a.key)).toEqual(['q.ch2-d2-activity-001.waterfall', 'q.ch2-d2-activity-001.workshop']);
    const visits = (s: SimState): number => s.journal.filter((e) => e.type === 'Visit').length;
    expect(visits(touch(atActivity, 'obj.vehicle', 0)) - visits(atActivity), 'водоспад: два візити (туди й назад)').toBe(2);
    expect(visits(touch(atActivity, 'obj.vehicle', 1)) - visits(atActivity), 'майстер-клас: без поїздки').toBe(0);
  });

  it('МУТАЦІЯ «прибрано вихід»: без поїздки з Мюллерталя прохід зупиняється — сторож червоніє', () => {
    // Лише дані: вказівник стежки й авто мертві, як було до картки (vehicleMoves → null).
    const s0 = follow(startChapter2(), (s) => s.game.quests['CH2-D1-WALK-001']?.status === 'active').sim;
    expect(resolveSpot(s0, DEFS, 'exit.trail.official'), 'контроль: вказівник живий').not.toBeNull();
    const dead = { ...s0, game: { ...s0.game, quests: { ...s0.game.quests, 'CH2-D1-WALK-001': { ...(s0.game.quests['CH2-D1-WALK-001'] as { status: string; done: string[] }), status: 'completed' as const } } } } as SimState;
    expect(resolveSpot(dead, DEFS, 'exit.trail.official'), 'вказівник без активного квесту німий').toBeNull();
    expect(() => follow(dead, (s) => waterfallDone(s))).toThrow();
  });
});

describe('GAME-296 · нотатник розділу 2: підказка Мюллерталя, а не намет і риболовля табору біля озера', () => {
  it('після водоспаду до вечора: «Далі» — ☰ «Відпочити до вечора»; нотатник не пропонує табір біля озера', () => {
    const s = follow(startChapter2(), waterfallDone).sim;
    const o = storyOffer(s, DEFS, view());
    expect(nextTarget(s, DEFS)?.key).toBe('next.ch2.rest');
    expect(o.offer.actions.some((a) => a.kind === 'rest'), '☰ дає «Відпочити до вечора»').toBe(true);
    const items = agendaOf(s, DEFS)?.items ?? [];
    expect(items.map((i) => i.label), 'нотатник — рівно підказка розділу 2').toEqual([{ ui: 'next.ch2.rest' }]);
    expect(items.every((i) => i.map === 'mullerthal'), 'пункти — на мапі Мюллерталя').toBe(true);
    expect(waits.some((w) => w.startsWith('next.ch2.free') || w.startsWith('next.ch2.sleep')), 'прохід чекав вечора й спав за підказкою').toBe(true);
  });
});

describe('GAME-296 · мета й «Далі» у розділі 2 (reuse розділу 1: goalOf + nextTarget)', () => {
  it('на КОЖНОМУ кроці живого проходу є мета в HUD (назва головного квесту) і підказка «Далі»', () => {
    let s = startChapter2();
    let n = 0;
    for (let i = 0; i < 80 && !chapter2Complete(s.game, STORY); i++) {
      if (s.game.dialogue === null) {
        const goal = goalOf(s.game, STORY, s.clock.minutes);
        expect(goal, `крок ${i}: мета є (${Object.keys(s.game.quests).filter((q) => s.game.quests[q]?.status === 'active').join(',')})`).not.toBeNull();
        expect(storyOffer(s, DEFS, view()).offer.goal?.key, 'HUD бачить ту саму мету').toBe(goal?.key);
        expect(nextTarget(s, DEFS), `крок ${i}: «Далі»`).not.toBeNull();
        n++;
      }
      const here = s;
      s = follow(here, (x) => x !== here).sim;   // один крок (відповідь у розмові — теж крок)
    }
    expect(n, 'крок без діалогу — не менше 12 знімків стану проходу').toBeGreaterThanOrEqual(12);
  });

  it('мета розділу 2 — назва квесту, на якому гравець; перед стартом розділу й після його кінця мети нема', () => {
    const end1 = ch1End();
    expect(goalOf(end1.game, STORY), 'кінець розділу 1: мети нема (як було)').toBeNull();
    const s = startChapter2();
    expect(goalOf(s.game, STORY)?.key).toBe('q.ch2-arrival-001');
    const done = follow(s, (x) => chapter2Complete(x.game, STORY)).sim;
    expect(goalOf(done.game, STORY), 'розділ 2 завершено').toBeNull();
  });
});

describe('GAME-296 · один день розділу в HUD і підсумку', () => {
  it('HUD «День N» = день розділу, що й «Підсумок дня N»: день 1 → сон → підсумок «1», HUD нового дня «2»', () => {
    let s = startChapter2();
    expect(storyOffer(s, DEFS, view()).offer.day, 'старт розділу 2 — «День 1», а не сирий день гри').toBe(1);
    const evening = follow(s, (x) => x.game.quests['CH2-D1-SUMMARY-001']?.status === 'completed').sim;
    s = evening;
    const hudBefore = storyOffer(s, DEFS, view()).offer.day;
    expect(hudBefore, 'у кінці дня 1 розділу HUD каже «День 1»').toBe(1);
    const o = storyOffer(s, DEFS, view());
    const sleep = o.offer.actions.find((a) => a.kind === 'sleep');
    s = direct(run(s, o.intents.get((sleep as { id: string }).id) as Move));
    const after = storyOffer(s, DEFS, view()).offer;
    expect(after.summary?.day, 'підсумок вчорашнього дня — «день 1»').toBe(1);
    expect(after.day, 'HUD нового ранку — «День 2» (підсумок + 1), а не «День 4»').toBe((after.summary?.day ?? NaN) + 1);
    expect(dayOf(s.clock) + 1 - after.day, 'розбіжність — рівно дні розділу 1').toBeGreaterThan(0);
  });

  it('МУТАЦІЯ «HUD від сирого дня гри»: розбіжність із підсумком видно', () => {
    const s = follow(startChapter2(), (x) => x.game.quests['CH2-D1-SUMMARY-001']?.status === 'completed').sim;
    const o = storyOffer(s, DEFS, view()).offer;
    const raw = Math.max(dayOf(s.clock) + 1, (s.game.slept ?? 0) + 1);
    expect(raw, 'сирий день гри відрізняється від дня розділу — без chapterDay HUD брехав би').not.toBe(o.day);
    expect(chapterDay(s, DEFS, raw)).toBe(o.day);
    expect(chapterDay(ch1End(), DEFS, 3), 'розділ 1 — без змін').toBe(3);
  });
});

describe('GAME-296 · завершення кроків розділу 2 режисером', () => {
  it('режисер не завершує крок, чиї цілі не зроблені, і не чіпає квести з вибором чи сценою', () => {
    const s = startChapter2();
    expect(ch2FinishMove(s, () => true), 'ARRIVAL: господиню ще не зустріли — нічого').toBeNull();
    const atPlan = follow(s, (x) => x.game.quests['CH2-D2-PLAN-001']?.status === 'active').sim;
    expect(ch2FinishMove(atPlan, () => true), 'PLAN — сцена й вибір, не авто-завершення').toBeNull();
    const atActivity = follow(s, (x) => x.game.quests['CH2-D2-ACTIVITY-001']?.status === 'active').sim;
    expect(ch2FinishMove(atActivity, () => true), 'ACTIVITY — вибір гравця').toBeNull();
  });
});
