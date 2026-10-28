// GAME-175 (зріз 1) · день 1 удома — на мапі. Що доводить цей файл (закон 1: кожен доказ має негативний контроль, що вміє почервоніти):
//  1) сторож контенту: кожна ціль visit/collect квестів дня 1 має об'єкт мапи або «лише розмова» (targetProblems) — і червоніє без рядка / з чужим об'єктом;
//  2) день 1 проходиться ЛИШЕ ходами об'єктів мапи, для всіх комбінацій профіль × транспорт × тварина (повний перебір станів, 0 тупиків);
//  3) кнопка панелі ховається лише там, де на мапі живий об'єкт з тією самою командою, і цей об'єкт справді стоїть на .tmj (нічого не зникає без заміни);
//  4) пакування руками: об'єкт речі кладе/дістає (ті самі PackItem/UnpackItem), не вміщається — веде до багажника; авто завжди доступне.
import { describe, expect, it } from 'vitest';
import { nextCommandId, type Command } from '../core/commands';
import type { CoreDefs } from '../core/defs';
import { packFlag } from '../core/packing';
import { newSim, step, type SimState } from '../core/sim';
import { characterChoices, PANEL_VIEW, storyOffer, type StoryView } from '../view/story-offer';
import { GAME_DEFS } from './slice-defs';
import { CONTENT } from './story';
import { progressKey, type Move } from './moves';
import { enumerateCombos } from '../../scripts/validator/combos.mjs';
import { isBulky, needsLeft, DAY1_QUESTS, DAY1_TARGETS, MAP_LOCATION, MAP_SPOTS, coveredKeys, liveMapSpot, mapKeyFor, moveKey, nextTarget, resolveSpot, spotLabel, targetProblems, type MapTarget } from './map-first';

const DEFS: CoreDefs = GAME_DEFS;
const MAP_VIEW: StoryView = { mapFirst: true, trunk: false, near: null };
const RAW = import.meta.glob<string>('../../public/maps/{home,shop}.tmj', { query: '?raw', import: 'default', eager: true });
const placed = (key: 'home' | 'shop'): string[] => {
  const m = JSON.parse(RAW[`../../public/maps/${key}.tmj`] ?? 'null') as { layers: { name: string; objects?: { name: string; type: string }[] }[] };
  return (m.layers.find((l) => l.name === 'objects')?.objects ?? []).filter((o) => o.type === 'trigger' || o.type === 'npc').map((o) => o.name);
};

const send = (sim: SimState, m: Move): SimState => step(sim, { kind: 'command', command: { ...m, commandId: nextCommandId(sim.game) } as Command }, { defs: DEFS });
const create = (intent: Move): SimState => send(newSim(1, 5_000), intent);
const CHOICES = characterChoices(DEFS);
const ROAD_GOAL = (s: SimState): boolean => s.game.player?.locationId === 'loc.road' && s.game.quests['ST-004']?.status === 'active';

/** Ходи живих об'єктів мапи, що рухають сюжет (без пакування, багажника й розмови): це все, що вміє гравець руками. */
function progressSpots(sim: SimState): { name: string; moves: readonly Move[] }[] {
  const map = mapKeyFor(sim.game.player?.locationId);
  if (map === 'camp') return [];
  return (MAP_SPOTS[map] as readonly string[]).filter((n) => !n.startsWith('pack.') && n !== 'obj.trunk' && !n.startsWith('npc.'))
    .flatMap((name) => { const r = resolveSpot(sim, DEFS, name); return r && r.moves.length > 0 ? [{ name, moves: r.moves }] : []; });
}
const applyAll = (sim: SimState, moves: readonly Move[]): SimState => moves.reduce(send, sim);

describe('сторож контенту: кожен крок дня 1 має ціль на мапі', () => {
  const spots = { home: [...MAP_SPOTS.home], shop: [...MAP_SPOTS.shop] };
  it('справжній контент і таблиця — без знахідок', () => {
    expect(targetProblems(CONTENT.quests, DAY1_TARGETS, spots)).toEqual([]);
  });
  it('кожен квест дня 1 є в контенті, а його візити й збирання — лише в таблиці', () => {
    for (const id of DAY1_QUESTS) expect(CONTENT.quests.some((q) => q.id === id), id).toBe(true);
  });
  it('НЕГАТИВНІ КОНТРОЛІ: крок без цілі на мапі, чужий об\'єкт, зайвий рядок, нова ціль без рядка — червоні; «лише розмова» — зелене', () => {
    const without = (k: string): Record<string, MapTarget> => Object.fromEntries(Object.entries(DAY1_TARGETS).filter(([key]) => key !== k));
    for (const k of Object.keys(DAY1_TARGETS)) expect(targetProblems(CONTENT.quests, without(k), spots).join(), `без ${k}`).toContain(`NO_MAP_TARGET ${k}`);
    expect(targetProblems(CONTENT.quests, { ...DAY1_TARGETS, 'ST-003.get-tent': { map: 'shop', spot: 'take.item.ghost' } }, spots).join()).toContain('MAP_TARGET_UNKNOWN ST-003.get-tent');
    expect(targetProblems(CONTENT.quests, { ...DAY1_TARGETS, 'ST-009.nothing': { talkOnly: true } }, spots).join()).toContain('MAP_TARGET_ORPHAN');
    const extra = [...CONTENT.quests, { id: 'ST-003', objectives: [{ id: 'get-hat', kind: 'collect' }] }];   // дубль ST-003 з новою ціллю, якої в таблиці нема
    expect(targetProblems(extra.slice(-1), DAY1_TARGETS, spots, ['ST-003']).join()).toContain('NO_MAP_TARGET ST-003.get-hat');
    expect(targetProblems(CONTENT.quests, { ...without('ST-003.get-lantern'), 'ST-003.get-lantern': { talkOnly: true } }, spots)).toEqual([]);
    expect(targetProblems(CONTENT.quests, DAY1_TARGETS, spots, ['ST-404']).join()).toContain('NO_MAP_QUEST');
  });
});

describe('день 1 — лише ходами об\'єктів мапи (повний перебір станів, усі комбінації старту)', () => {
  it('вибір героя на екрані = усі комбінації контенту (профіль × транспорт × тварина); кожна проходиться нижче', () => { expect(CHOICES.length).toBe(enumerateCombos(CONTENT).length); expect(CHOICES.length).toBeGreaterThanOrEqual(5); });
  for (const c of CHOICES) {
    it(`${c.offer.profileKey} · ${c.offer.transportKey} · ${c.offer.animalKey ?? 'без тварини'}: з кожного стану є хід об'єкта, і всі шляхи ведуть на дорогу`, () => {
      const start = create(c.intent);
      const key = (s: SimState): string => progressKey({ ...s.game, flags: s.game.flags.filter((f) => !f.startsWith('f.pack-')) });
      const seen = new Map<string, SimState>([[key(start), start]]);
      const edges = new Map<string, string[]>();
      for (const queue = [start]; queue.length;) {
        const s = queue.shift() as SimState;
        const out: string[] = [];
        for (const p of progressSpots(s)) {
          const n = applyAll(s, p.moves);
          expect(n.game.seq, `${p.name} прийнято ядром`).toBeGreaterThan(s.game.seq);
          const k = key(n);
          out.push(k);
          if (!seen.has(k)) { seen.set(k, n); queue.push(n); }
        }
        edges.set(key(s), out);
        // Тупик: не дорога, а рухатись нічим. Це і є softlock, якщо панель сховала свої кнопки.
        if (!ROAD_GOAL(s)) expect(out.length, `тупик на ${JSON.stringify({ q: Object.keys(s.game.quests), at: s.game.player?.locationId })}`).toBeGreaterThan(0);
      }
      const goal = [...seen].filter(([, s]) => ROAD_GOAL(s)).map(([k]) => k);
      expect(goal.length).toBeGreaterThan(0);
      // З кожного стану дорога досяжна (зворотний обхід).
      const reach = new Set(goal);
      for (let grew = true; grew;) { grew = false; for (const [from, tos] of edges) if (!reach.has(from) && tos.some((t) => reach.has(t))) { reach.add(from); grew = true; } }
      for (const k of seen.keys()) expect(reach.has(k), 'з цього стану дорога недосяжна').toBe(true);
    });
  }

  it('НЕГАТИВНИЙ КОНТРОЛЬ: без об\'єкта авто (мертвий obj.vehicle) перебір знаходить тупик на подвір\'ї', () => {
    const start = create((CHOICES[0] as { intent: Move }).intent);
    let s = start;
    const dead = (sim: SimState): { name: string; moves: readonly Move[] }[] => progressSpots(sim).filter((p) => p.name !== 'obj.vehicle');
    for (let i = 0; i < 10 && dead(s).length; i++) s = applyAll(s, (dead(s)[0] as { moves: readonly Move[] }).moves);
    expect(ROAD_GOAL(s)).toBe(false);
    expect(dead(s)).toHaveLength(0);   // кроки закінчились, а авто «зламане»: далі нікуди — саме так виглядав би softlock
  });
});

describe('панель ховає кнопку лише там, де мапа дає ту саму дію — і об\'єкт стоїть на .tmj', () => {
  /** Дії, які мапа забрала з панелі в цьому стані: повний перелік мінус перелік мапи-першої. */
  const hidden = (sim: SimState): string[] => {
    const all = storyOffer(sim, DEFS, PANEL_VIEW).offer.actions.map((a) => a.id);
    const kept = new Set(storyOffer(sim, DEFS, MAP_VIEW).offer.actions.map((a) => a.id));
    const full = storyOffer(sim, DEFS, PANEL_VIEW);
    return all.filter((id) => !kept.has(id)).map((id) => moveKey(full.intents.get(id) as Move));
  };
  /** Знахідки: схована дія, якої немає ні в живого об'єкта, ні фізично на мапі. */
  const orphans = (sim: SimState, onMap: Readonly<Record<'home' | 'shop', readonly string[]>>): string[] => {
    const map = mapKeyFor(sim.game.player?.locationId);
    if (map === 'camp') return hidden(sim);
    return hidden(sim).filter((k) => !(MAP_SPOTS[map] as readonly string[]).some((n) => onMap[map].includes(n) && (resolveSpot(sim, DEFS, n)?.moves ?? []).some((m) => moveKey(m) === k) || (k.startsWith('Talk|') && onMap[map].includes(k.slice(5)))));
  };
  const real = { home: placed('home'), shop: placed('shop') };

  it('на кожному стані шляху дня 1: усе сховане має живий об\'єкт, що стоїть на мапі; на дорозі й у таборі не ховається нічого', () => {
    for (const c of CHOICES) {
      let s = create(c.intent);
      let hiddenSeen = 0;
      for (let i = 0; i < 40 && !ROAD_GOAL(s); i++) {
        expect(orphans(s, real), `${c.offer.profileKey}/${c.offer.transportKey}`).toEqual([]);
        hiddenSeen += hidden(s).length;
        const next = nextTarget(s, DEFS);
        const spot = progressSpots(s).find((p) => p.name === next?.spot) ?? progressSpots(s)[0];
        if (!spot) break;
        s = applyAll(s, spot.moves);
      }
      expect(ROAD_GOAL(s)).toBe(true);
      expect(hiddenSeen, 'мапа справді забрала дії з панелі').toBeGreaterThan(8);
      expect(hidden(s), 'на дорозі панель — як була').toEqual([]);
    }
  });

  it('НЕГАТИВНИЙ КОНТРОЛЬ: об\'єкт є в таблиці, але його немає на .tmj — схована кнопка стає сиротою', () => {
    const s = create((CHOICES[0] as { intent: Move }).intent);                    // дім, перший крок — стіл на кухні
    expect(orphans(s, real)).toEqual([]);
    const lost = { ...real, home: real.home.filter((n) => n !== 'step.PROLOGUE-HOME-001') };
    expect(orphans(s, lost), 'без об\'єкта на мапі кнопка «Виконати» зникла б задарма').toEqual(['CompleteQuest|PROLOGUE-HOME-001']);
  });

  it('режим ?panelActs=1 (PANEL_VIEW) показує все, як було: на старті дня 1 кнопка завершення кроку є', () => {
    const s = create((CHOICES[0] as { intent: Move }).intent);
    expect(storyOffer(s, DEFS, PANEL_VIEW).offer.actions.some((a) => a.kind === 'complete')).toBe(true);
    expect(storyOffer(s, DEFS, MAP_VIEW).offer.actions.some((a) => a.kind === 'complete')).toBe(false);
  });

  it('мертвий об\'єкт не ховає кнопку: крамниця без живого прилавка (ціль не виконано) — «Виконати» не було б і так; з вимкненою мапою (дорога) кнопки на місці', () => {
    let s = create((CHOICES[0] as { intent: Move }).intent);
    s = applyAll(s, (progressSpots(s)[0] as { moves: readonly Move[] }).moves);
    expect(coveredKeys(s, DEFS).has('CompleteQuest|ST-001')).toBe(true);
    expect(coveredKeys(s, DEFS).has('CompleteQuest|PROLOGUE-HOME-001')).toBe(false);   // уже пройдений крок — не покритий
    const road = { ...s, game: { ...s.game, player: { ...(s.game.player as NonNullable<SimState['game']['player']>), locationId: 'loc.road' } } };
    expect(coveredKeys(road, DEFS).size, 'на дорозі мапа нічого не забирає').toBe(0);
  });
});

describe('пакування руками і багажник (GAME-109 на мапі)', () => {
  /** Стан «вдома, пакування відкрите» для комбінації: кроки 1–3 і крамниця пройдено ходами мапи. */
  function packingOpenFor(intent: Move): SimState {
    let s = create(intent);
    for (let i = 0; i < 30 && !(s.game.quests['CH1-HOME-001']?.status === 'active' && s.game.player?.locationId === 'loc.home'); i++) {
      const next = nextTarget(s, DEFS);
      const spot = progressSpots(s).find((p) => p.name === next?.spot) ?? progressSpots(s)[0];
      if (!spot) throw new Error('шлях до пакування обірвано');
      s = applyAll(s, spot.moves);
    }
    return s;
  }
  it('об\'єкти речей: кладуть і дістають ті самі PackItem/UnpackItem; двічі = як було; вміщається завжди, бо автоукладання вже в межах місця', () => {
    for (const c of CHOICES) {
      const s0 = packingOpenFor(c.intent);
      expect(s0.game.player?.locationId).toBe('loc.home');
      const items = (MAP_SPOTS.home as readonly string[]).filter((n) => n.startsWith('pack.'));
      let live = 0;
      for (const name of items) {
        const r = resolveSpot(s0, DEFS, name);
        if (!r) continue;          // переноска, миска й ковдра Мії — лише з кішкою
        live++;
        const id = name.slice(5);
        if (r.moves.length === 0) { expect(r.ui, `${name}: не вміщається → до багажника`).toBe('trunk'); continue; }   // автоукладання вже набило багажник
        const once = applyAll(s0, r.moves);
        expect(once.game.flags.includes(packFlag(id)) !== s0.game.flags.includes(packFlag(id)), `${name} міняє прапорець речі`).toBe(true);
        const back = applyAll(once, resolveSpot(once, DEFS, name)?.moves ?? []);
        expect(back.game.flags, `${name} двічі = як було`).toEqual(s0.game.flags);
        expect(spotLabel(s0, DEFS, name)?.label).toMatch(/^pack\.(in|out)$/);
      }
      expect(live, 'у кожного гравця є що брати: 9 речей, з кішкою — 12').toBe(c.offer.animalKey ? 12 : 9);
      expect(items.length).toBe(12);
    }
  });
  it('не вміщається → об\'єкт живий і веде до багажника (сітка скаже чому); авто й багажник живі за будь-якого пакування', () => {
    const c = CHOICES.find((x) => x.offer.transportKey === 'transport.bike' || /велосипед/i.test(x.offer.transportKey)) ?? (CHOICES[0] as (typeof CHOICES)[number]);
    let s = packingOpenFor(c.intent);
    for (const name of (MAP_SPOTS.home as readonly string[]).filter((n) => n.startsWith('pack.'))) {   // усе розпаковано
      const r = resolveSpot(s, DEFS, name);
      if (r && s.game.flags.includes(packFlag(name.slice(5)))) s = applyAll(s, r.moves);
    }
    expect(resolveSpot(s, DEFS, 'obj.vehicle')?.moves.map((m) => m.type)).toEqual(['CompleteQuest', 'Visit']);
    for (const name of (MAP_SPOTS.home as readonly string[]).filter((n) => n.startsWith('pack.'))) {   // усе, що вміститься, — в багажник
      const r = resolveSpot(s, DEFS, name);
      if (r && r.moves.length) s = applyAll(s, r.moves);
    }
    const full = (MAP_SPOTS.home as readonly string[]).filter((n) => n.startsWith('pack.')).map((n) => resolveSpot(s, DEFS, n)).filter((r) => r && r.moves.length === 0);
    expect(full.length, 'вантаж заповнено: решта речей веде до багажника').toBeGreaterThan(0);
    expect(full.every((r) => r?.ui === 'trunk')).toBe(true);
    expect(resolveSpot(s, DEFS, 'obj.trunk')?.ui).toBe('trunk');
    expect(resolveSpot(s, DEFS, 'obj.vehicle')?.moves.map((m) => m.type)).toEqual(['CompleteQuest', 'Visit']);
  });
  it('пакування закрите до кінця крамниці: об\'єктів речей і багажника немає (нічого брати з порожніх кімнат)', () => {
    const s = create((CHOICES[0] as { intent: Move }).intent);
    for (const name of (MAP_SPOTS.home as readonly string[]).filter((n) => n.startsWith('pack.') || n === 'obj.trunk')) expect(liveMapSpot(s, DEFS, name), name).toBe(false);
  });
  it('НЕГАТИВНИЙ КОНТРОЛЬ: з відхиленим ядром ходом об\'єкт мертвий — спробувати завершити квест, якого немає, нічого не дає', () => {
    const s = create((CHOICES[0] as { intent: Move }).intent);
    expect(resolveSpot(s, DEFS, 'step.ST-002')).toBeNull();                       // ST-002 ще не активний
    expect(resolveSpot(s, DEFS, 'take.item.tent')).toBeNull();                    // не в крамниці
    expect(resolveSpot(s, DEFS, 'obj.ghost')).toBeNull();
    expect(MAP_LOCATION.home).toBe('loc.home');
  });
});

describe('підказка «Далі: …»', () => {
  it('на кожному кроці шляху вказує на ЖИВИЙ об\'єкт мапи (або без об\'єкта на дорозі)', () => {
    for (const c of CHOICES) {
      let s = create(c.intent);
      for (let i = 0; i < 40 && !ROAD_GOAL(s); i++) {
        const n = nextTarget(s, DEFS);
        expect(n, 'підказка є на кожному кроці дня 1').not.toBeNull();
        expect(n?.spot !== null && liveMapSpot(s, DEFS, n?.spot ?? ''), `«${n?.key}» вказує на мертвий ${n?.spot}`).toBe(true);
        s = applyAll(s, (progressSpots(s).find((p) => p.name === n?.spot) as { moves: readonly Move[] }).moves);
      }
      // Подія в дорозі (шанс) відкриває розмову — тоді підказка мовчить, її веде екран подорожі; без неї — одна підказка про ☰.
      expect(nextTarget({ ...s, game: { ...s.game, dialogue: null } }, DEFS)).toEqual({ key: 'next.road', spot: null });
    }
  });
  it('у знімку для UI: рядок «Далі» й підпис дії біля об\'єкта; без персонажа — нічого', () => {
    const s = create((CHOICES[0] as { intent: Move }).intent);
    const o = storyOffer(s, DEFS, { ...MAP_VIEW, near: 'step.PROLOGUE-HOME-001' }).offer;
    expect(o.hint).toEqual({ backpack: 0, next: 'next.prologue-home-001', nextSpot: 'step.PROLOGUE-HOME-001', near: { label: 'near.step.prologue-home-001', itemKey: null } });
    expect(storyOffer(newSim(1, 5_000), DEFS, MAP_VIEW).offer.hint).toEqual({ backpack: 0, next: null, nextSpot: null, near: null });
  });
});

describe('рюкзак і потреби (GAME-175: дрібне — в рюкзак, громіздке — одразу в багажник)', () => {
  function packingState(): SimState {
    let s = create((CHOICES[0] as { intent: Move }).intent);
    for (let i = 0; i < 30 && !(s.game.quests['CH1-HOME-001']?.status === 'active' && s.game.player?.locationId === 'loc.home'); i++) {
      const next = nextTarget(s, DEFS);
      const spot = progressSpots(s).find((p) => p.name === next?.spot) ?? progressSpots(s)[0];
      if (!spot) throw new Error('шлях обірвано');
      s = applyAll(s, spot.moves);
    }
    return s;
  }
  it('громіздке = місце ≥ 2 (намет, спальник), дрібне = 1 (вода-2, ліхтар)', () => {
    expect(isBulky(DEFS, 'item.tent')).toBe(true);
    expect(isBulky(DEFS, 'item.sleeping-bag')).toBe(true);
    expect(isBulky(DEFS, 'item.simple-dinner')).toBe(false);
    expect(isBulky(DEFS, 'item.lantern')).toBe(false);
  });
  it('потреби: те, що в рюкзаку, вже не бракує; у багажнику — теж; рюкзак ненульовий → ціль підказки — авто', () => {
    const s = send(send(packingState(), { type: 'UnpackItem', itemId: 'item.simple-dinner' }), { type: 'UnpackItem', itemId: 'item.tent' });   // старт автоукладає все потрібне — дістаємо дві речі
    const all = needsLeft(s, DEFS);
    expect(all).toEqual(expect.arrayContaining(['item.simple-dinner', 'item.tent']));
    const small = all.find((i) => !isBulky(DEFS, i));
    if (!small) throw new Error('немає дрібного потрібного');
    expect(needsLeft(s, DEFS, [small])).toHaveLength(Math.max(0, all.length - 1));
    expect(needsLeft(s, DEFS, [small])).not.toContain(small);
    expect(nextTarget(s, DEFS, [small])).toEqual({ key: 'next.unload', spot: 'obj.vehicle' });
    expect(needsLeft(newSim(1, 5_000), DEFS)).toEqual([]);
  });
  it('НЕГАТИВНИЙ КОНТРОЛЬ: поза пакуванням (до крамниці) потреб немає, а рюкзак підказку не міняє', () => {
    const s = create((CHOICES[0] as { intent: Move }).intent);
    expect(nextTarget(s, DEFS, ['item.water'])?.key).not.toBe('next.unload');
  });
});
