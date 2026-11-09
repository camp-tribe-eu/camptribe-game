/// <reference types="node" />
// GAME-287 · CH2-D1-WALK: прогулянка лісом із Вікторією і кадр орхідеї (у дощ — краплі на листі). Фото-предмет item.photo.orchid, запис Атласу «засушена орхідея + підпис дідуся».
// Закон 1: кожен сторож нижче показано червоним мутацією (дані тут же — і ще раз мутацією файлу, див. опис PR).
//  1) сцена завершувана за КОЖНОЇ погоди з WEATHERS — на справжніх командах ядра й справжньому режисері (liveSpot/spotMove), а не на моделі;
//  2) мутація «прибрано дощовий варіант» → у дощ живого кадру немає → сторож червоніє;
//  3) запис Атласу є лише після дії-кадру (мутація «запис без фото» → червоніє);
//  4) розділ 1 цього не бачить: кадри мертві, поки не активний квест дня 1 розділу 2.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dispatch, type Command } from '../core/commands';
import { fromSave, serialize } from '../core/save';
import type { SimState } from '../core/sim';
import type { GameState } from '../core/state';
import { WEATHERS, dayOf, weatherOf, type Weather } from '../core/weather';
import { atlasOffer } from '../view/story-offer';
import { ch1End } from './ch1-end.fixture';
import { liveSpot, spotMove } from './director';
import { CH2_DAY1, CH2_PHOTOS, CH2_WALK_QUEST, ORCHID_FLAG, ORCHID_ITEM, liveOrchidSpots, orchidPage, type PhotoDef } from './photos';
import { GAME_DEFS } from './slice-defs';
import { STORY } from './story';
import { route } from '../../tests/e2e/chapter-driver';
import { CHAPTER2_START } from '../core/story';

let n = 0;
const send = (g: GameState, m: object): ReturnType<typeof dispatch> => dispatch(g, { ...m, commandId: `a287-${n++}` } as Command, GAME_DEFS);
const ok = (g: GameState, m: object): GameState => { const r = send(g, m); if (!r.ok) throw new Error(`${JSON.stringify(m)} → ${r.code}`); return r.state; };
const TALK_VIC = { type: 'Talk', npcId: 'npc.victoria' };
const SPOT_OF: Readonly<Record<Weather, string>> = { sunny: 'obj.photo-orchid', cloudy: 'obj.photo-orchid', rain: 'obj.photo-drops' };

const base = ch1End();
/** Світ із потрібною погодою дня: зерно, для якого weatherOf(зерно, день годинника) = w. Погода — функція (зерно, день), тож стан гри не чіпаємо. */
const seedFor = (w: Weather): number => { for (let s = 1; s < 5000; s++) if (weatherOf(s, dayOf(base.clock)) === w) return s; throw new Error(`немає зерна з ${w}`); };
const simOf = (g: GameState, w: Weather): SimState => ({ ...base, game: g, worldSeed: seedFor(w) });

/** Прибуття (дорога → Мюллерталь → господиня → вибір місця) до початку прогулянки: CH2-D1-WALK-001 активний. */
function arrived(): GameState {
  let g = ok(base.game, { type: 'StartChapter2' });
  g = ok(g, { type: 'Visit', locationId: 'loc.road' });
  g = ok(g, { type: 'Visit', locationId: 'loc.camp.mullerthal' });
  g = ok(g, { type: 'Talk', npcId: 'npc.host-mullerthal' });
  g = ok(g, { type: 'Choose', choice: 0 });
  g = ok(g, { type: 'Choose', choice: 1 });
  g = ok(g, { type: 'Continue' });
  g = ok(g, { type: 'CompleteQuest', questId: CHAPTER2_START });
  return g;
}

interface Run { readonly game: GameState; readonly photo: boolean; readonly spot: string | null; readonly states: GameState[] }
/**
 * Уся сцена дня 1 за погоди w: розмова з Вікторією (вибір «Ходімо!»), кадр (якщо режисер дає живий — той, що за погодою), лісова стежка, завершення квесту.
 * `shoot` — як знайти кадр: справжній режисер (liveSpot з погодою зі зерна світу) або підмінений список (мутація даних).
 */
function playScene(w: Weather, shoot: (sim: SimState, w: Weather) => string | null): Run {
  let g = arrived();
  const states: GameState[] = [g];
  const push = (x: GameState): GameState => { states.push(x); return x; };
  expect(g.quests[CH2_WALK_QUEST]?.status).toBe('active');
  g = push(ok(g, TALK_VIC));
  expect(g.dialogue).toEqual({ id: 'dlg.victoria-chat', node: 'hi' });
  g = push(ok(g, { type: 'Continue' }));
  expect(g.dialogue?.node, 'квест прогулянки активний — Вікторія кличе в ліс').toBe('walk');
  g = push(ok(g, { type: 'Choose', choice: 0 }));
  expect(g.quests[CH2_WALK_QUEST]?.done, 'розмова косметична: прогрес квесту не чіпає').toEqual([]);
  g = push(ok(g, { type: 'Continue' }));
  expect(g.dialogue?.node, 'кадру ще немає — підказка, а не «ого, який кадр»').toBe('walk-tip');
  g = push(ok(g, { type: 'Continue' }));
  expect(g.dialogue).toBeNull();
  // кадр
  const spot = shoot(simOf(g, w), w);
  let photo = false;
  if (spot !== null) {
    const mv = spotMove(simOf(g, w), spot);
    expect(mv, `${spot}: дотик до кадру — Interact`).toEqual({ type: 'Interact', targetId: spot });
    g = push(ok(g, mv as object));
    photo = true;
  }
  // лісова стежка (офіційна) і завершення
  g = push(ok(g, { type: 'Visit', locationId: 'loc.trail.official' }));
  expect(g.quests[CH2_WALK_QUEST]?.done).toEqual(['o1-official']);
  g = push(ok(g, { type: 'CompleteQuest', questId: CH2_WALK_QUEST }));
  return { game: g, photo, spot, states };
}
const real = (sim: SimState, w: Weather): string | null => {
  const live = Object.values(SPOT_OF).filter((s, i, a) => a.indexOf(s) === i).filter((s) => liveSpot(sim, s, GAME_DEFS));
  expect(live.length, `за погоди ${w} живий рівно один кадр`).toBeLessThanOrEqual(1);
  return live[0] ?? null;
};

describe('GAME-287 · сцена завершувана за будь-якої погоди (перебір WEATHERS)', () => {
  it('перебір не порожній і охоплює дощ', () => {
    expect([...WEATHERS].sort()).toEqual(['cloudy', 'rain', 'sunny']);
    for (const w of WEATHERS) expect(weatherOf(seedFor(w), dayOf(base.clock)), w).toBe(w);
  });

  it.each(WEATHERS)('погода %s: кадр є і лише «свій», фото → предмет + прапорець + запис Атласу, квест завершено, наступний (вечір) відкрито', (w) => {
    const r = playScene(w, real);
    expect(r.spot, `кадр за погоди ${w}`).toBe(SPOT_OF[w]);
    expect(r.photo).toBe(true);
    expect(r.game.inventory[ORCHID_ITEM], 'предмет-фото в рюкзаку').toBe(1);
    expect(r.game.flags).toContain(ORCHID_FLAG);
    expect(r.game.grants, 'нагорода саме цього кадру').toContain(w === 'rain' ? 'rw.photo-drops' : 'rw.photo-orchid');
    expect(r.game.quests[CH2_WALK_QUEST]?.status).toBe('completed');
    expect(r.game.quests['CH2-D1-SUMMARY-001']?.status, 'прогрес не втрачено: день 1 іде далі').toBe('active');
    const page = atlasOffer(r.game).orchid;
    expect(page).toEqual({ found: true, shot: w === 'rain' ? 'drops' : 'orchid' });
  });

  it.each(WEATHERS)('погода %s: сцену можна пройти й БЕЗ кадру (фото косметичне — жодного покарання) — квест завершується, запису в Атласі нема', (w) => {
    const r = playScene(w, () => null);
    expect(r.photo).toBe(false);
    expect(r.game.quests[CH2_WALK_QUEST]?.status).toBe('completed');
    expect(atlasOffer(r.game).orchid).toEqual({ found: false, shot: null });
    expect(r.game.inventory[ORCHID_ITEM]).toBeUndefined();
  });

  it.each(WEATHERS)('погода %s: повторний кадр — відмова ядра (нагорода раз), другого предмета нема; мертвий кадр режисера', (w) => {
    const g = arrived();
    const sp = SPOT_OF[w];
    const once = ok(g, { type: 'Interact', targetId: sp });
    const again = send(once, { type: 'Interact', targetId: sp });
    expect(again.ok).toBe(false);
    expect(liveSpot(simOf(once, w), sp, GAME_DEFS), 'кадр знято — позначка гасне').toBe(false);
    expect(once.inventory[ORCHID_ITEM]).toBe(1);
  });

  it('МУТАЦІЯ «прибрано дощовий варіант»: у дощ живого кадру нема, сцена лишається без фото → сторож червоніє; сонце й хмари — як були', () => {
    const noRain: readonly PhotoDef[] = CH2_PHOTOS.filter((p) => p.when !== 'rain');
    const g = arrived();
    expect(liveOrchidSpots(g, 'rain', noRain), 'без дощового варіанта дощ лишається без кадру').toEqual([]);
    for (const w of ['sunny', 'cloudy'] as const) expect(liveOrchidSpots(g, w, noRain), w).toEqual(['obj.photo-orchid']);
    const mutated = (sim: SimState, w: Weather): string | null => liveOrchidSpots(sim.game, w, noRain)[0] ?? null;
    expect(playScene('rain', mutated).photo, 'мутований сценарій у дощ — без фото').toBe(false);
    expect(playScene('sunny', mutated).photo, 'контроль: у суху погоду сторож не червоніє «завжди»').toBe(true);
    // справжні дані: у КОЖНУ погоду рівно один живий кадр
    for (const w of WEATHERS) expect(liveOrchidSpots(g, w), w).toEqual([SPOT_OF[w]]);
  });
});

describe('GAME-287 · запис Атласу — лише від дії-кадру', () => {
  /** Стани сцени, де запис Атласу вже є, а кадру не було (немає предмета, прапорця чи нагороди). Порожньо — запис без фото неможливий. */
  function entriesWithoutPhoto(ps: readonly PhotoDef[]): string[] {
    const out: string[] = [];
    for (const w of WEATHERS) {
      const r = playScene(w, () => null);   // сцена без кадру: жоден стан не має права показувати запис
      r.states.forEach((s, i) => {
        const page = orchidPage(s.flags, s.grants, ps);
        const photoDone = (s.inventory[ORCHID_ITEM] ?? 0) > 0 && s.flags.includes(ORCHID_FLAG) && s.grants.some((x) => x.startsWith('rw.photo-orchid') || x === 'rw.photo-drops');
        if (page.found && !photoDone) out.push(`${w}#${i}: запис Атласу без фото`);
      });
    }
    return out;
  }
  it('жодного стану сцени без кадру, де запис Атласу є; після Interact — запис, предмет і прапорець разом', () => {
    expect(entriesWithoutPhoto(CH2_PHOTOS)).toEqual([]);
    for (const w of WEATHERS) {
      const g = arrived();
      expect(atlasOffer(g).orchid?.found).toBe(false);
      const shot = ok(g, { type: 'Interact', targetId: SPOT_OF[w] });
      expect(atlasOffer(shot).orchid?.found).toBe(true);
      expect(shot.inventory[ORCHID_ITEM]).toBe(1);
      expect(shot.flags).toContain(ORCHID_FLAG);
    }
  });
  it('МУТАЦІЯ «запис без фото»: запис прив’язано до прапорця, який ставить розмова з господинею (не кадр) → сторож червоніє', () => {
    const hostFlag: PhotoDef[] = CH2_PHOTOS.map((p) => ({ ...p, flag: 'f.ch2-spot-stream' }));
    const found = entriesWithoutPhoto(hostFlag);
    expect(found.length, 'мутований запис показується без кадру').toBeGreaterThan(0);
    expect(found[0]).toMatch(/запис Атласу без фото/);
  });
  it('запис і підпис дідуся — у кожній мові, дослівна цитата картки', () => {
    const ui = (l: 'uk' | 'en'): Record<string, string> => JSON.parse(readFileSync(new URL(`../i18n/${l}.json`, import.meta.url), 'utf8')) as Record<string, string>;
    expect(ui('uk')['atlas.orchid.note']).toContain('Шукай там, де скелі плачуть у сонячний день');
    expect(ui('en')['atlas.orchid.note']).toMatch(/rocks weep/);
    for (const l of ['uk', 'en'] as const) for (const k of ['photo.orchid', 'photo.drops', 'atlas.orchid']) expect(ui(l)[k], `${l}/${k}`).toBeTruthy();
  });
});

describe('GAME-287 · розділ 1 цього не бачить; квест не завершити без прогулянки', () => {
  it('до початку дня 1 розділу 2 обидва кадри мертві за будь-якої погоди; активний квест прогулянки або вечора — рівно один за погодою', () => {
    const ch1 = base.game;
    expect(ch1.quests[CH2_WALK_QUEST]).toBeUndefined();
    for (const w of WEATHERS) for (const sp of Object.values(SPOT_OF)) expect(liveSpot(simOf(ch1, w), sp, GAME_DEFS), `${sp}/${w} у розділі 1`).toBe(false);
    for (const q of CH2_DAY1) {
      const g = { ...arrived(), quests: { ...arrived().quests, [q]: { status: 'active', done: [] } } } as GameState;
      for (const w of WEATHERS) expect(liveOrchidSpots(g, w), `${q}/${w}`).toEqual([SPOT_OF[w]]);
    }
    const done = { ...arrived(), quests: { ...arrived().quests, [CH2_WALK_QUEST]: { status: 'completed', done: [] }, 'CH2-D1-SUMMARY-001': { status: 'completed', done: [] } } } as GameState;
    for (const w of WEATHERS) expect(liveOrchidSpots(done, w), `день 1 минув / ${w}`).toEqual([]);
  });
  it('у розділі 1 Вікторія не кличе в ліс: Talk → «Далі» веде до звичайного вузла', () => {
    let g = ok(base.game, TALK_VIC);
    g = ok(g, { type: 'Continue' });
    expect(g.dialogue?.node).toBe('hello');
  });
  it('квест прогулянки: ціль — лісова стежка; розмова з Вікторією нічого не пише в стан квесту (без цього простір станів перебору GAME-48 удвічі більший)', () => {
    let g = arrived();
    expect(send(g, { type: 'CompleteQuest', questId: CH2_WALK_QUEST }).ok, 'без стежки завершити не можна').toBe(false);
    const quests = g.quests;
    g = ok(g, TALK_VIC);
    g = ok(g, { type: 'Continue' });
    g = ok(g, { type: 'Choose', choice: 0 });
    g = ok(g, { type: 'Continue' });
    g = ok(g, { type: 'Continue' });
    expect(g.dialogue).toBeNull();
    expect(g.quests, 'розмова про прогулянку не змінила квести').toEqual(quests);
    expect(g.flags, 'і не поставила прапорців').toEqual(arrived().flags);
    g = ok(g, { type: 'Visit', locationId: 'loc.trail.official' });
    expect(send(g, { type: 'CompleteQuest', questId: CH2_WALK_QUEST }).ok).toBe(true);
  });
  it('Вікторія після кадру реагує («ого, який кадр»): розвилка за прапорцем із запасним виходом', () => {
    let g = ok(arrived(), { type: 'Interact', targetId: 'obj.photo-orchid' });
    g = ok(g, TALK_VIC);
    g = ok(g, { type: 'Continue' });
    g = ok(g, { type: 'Choose', choice: 0 });
    g = ok(g, { type: 'Continue' });
    expect(g.dialogue?.node).toBe('walk-shown');
  });
});

describe('GAME-287 · сейви для e2e (tests/e2e/fixtures/ch2-walk-<погода>.json)', () => {
  const file = (w: string): URL => new URL(`../../tests/e2e/fixtures/ch2-walk-${w}.json`, import.meta.url);
  it('сейв = те, що ядро збирає зараз; G287_WRITE=1 переписує', () => {
    for (const w of ['sunny', 'rain'] as const) {
      const json = `${serialize(simOf(arrived(), w))}\n`;
      if (process.env.G287_WRITE === '1') { writeFileSync(file(w), json); continue; }
      expect(existsSync(file(w)), `немає фікстури ${w}: G287_WRITE=1`).toBe(true);
      expect(readFileSync(file(w), 'utf8'), `фікстура ${w} розійшлась із ядром`).toBe(json);
      const l = fromSave(json, { story: STORY });
      if (!l.ok) throw new Error(`${l.code} ${l.detail}`);
      expect(l.sim.game.quests[CH2_WALK_QUEST]?.status, 'сейв завантажується: прогулянка активна').toBe('active');
      expect(weatherOf(l.sim.worldSeed, dayOf(l.sim.clock)), `погода дня в сейві ${w}`).toBe(w);
    }
  });
});

describe('GAME-287 · мапа Мюллерталя має обидва кадри', () => {
  interface Tmj { layers: { name: string; objects?: { name: string; type: string; x: number; y: number }[] }[] }
  const map = JSON.parse(readFileSync(new URL('../../public/maps/mullerthal.tmj', import.meta.url), 'utf8')) as Tmj;
  const objs = map.layers.find((l) => l.name === 'objects')?.objects ?? [];
  it('obj.photo-orchid і obj.photo-drops — якорі (anchor) на мапі, по одному; назви збігаються з CH2_PHOTOS', () => {
    for (const p of CH2_PHOTOS) expect(objs.filter((o) => o.name === p.spot && o.type === 'anchor'), p.spot).toHaveLength(1);
    expect(CH2_PHOTOS.map((p) => p.spot).sort()).toEqual(['obj.photo-drops', 'obj.photo-orchid']);
  });
  it('обидва кадри досяжні пішки і від точки появи, і від авто (маршрут по сітці стін .tmj існує)', () => {
    for (const from of ['s.start', 's.car']) {
      const o = objs.find((x) => x.name === from) as { x: number; y: number };
      for (const p of CH2_PHOTOS) expect(route('mullerthal', [o.x, o.y], p.spot).length, `${from} → ${p.spot}`).toBeGreaterThan(1);
    }
  });
});
