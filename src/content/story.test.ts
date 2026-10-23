// GAME-29 · ядро проходить справжній контент так, як його бачить валідатор.
// Для кожної комбінації профіль × транспорт × тварина — повний перебір дій гравця в ядрі:
//  1) квести, які ядро може відкрити, = квести, які валідатор вважає досяжними (ні більше, ні менше);
//  2) з КОЖНОГО досяжного стану кінець розділу ще досяжний — у ядрі немає тупиків;
//  3) кінець досяжний узагалі.
// Розбіжність семантики (when, unlockedBy, requires, вибір переходу) червонить пункт 1 або 2.
import { describe, expect, it } from 'vitest';
import { dispatch, nextCommandId, type Command } from '../core/commands';

import { canonical, stateHash } from '../core/hash';
import { initialState, type GameState } from '../core/state';
import { buildIndex } from '../../scripts/validator/checks.mjs';
import { enumerateCombos, project } from '../../scripts/validator/combos.mjs';
import { GAME_DEFS } from './slice-defs';
import { CONTENT, STORY, compileStory } from './story';
import { isLuckMove, moves as allMoves, progressView, type Move } from './moves';
import { RANK_XP, SKILL_IDS } from '../core/skills';
import { checkDefs, type CoreDefs } from '../core/defs';
import { route } from '../core/story';

// Повний перебір — свідомо важкий (велосипедна гілка з подією й пам'яттю ≈ 5 с локально, з контролем навичок GAME-72 ≈ 7.5 с, на CI довше): власна межа
// часу замість типових 5 с, щоб падіння означало «доказ не вкладається», а не «повільна машина».
const EXHAUSTIVE_MS = 60_000;

// Справжній каталог гри (зріз + сюжет) — як у містку: купівля, продаж і взаємодії теж серед ходів
// (рецензія GAME-29: без них продаж нагороди, що ламає квест, був невидимий).
const DEFS: CoreDefs = GAME_DEFS;
const START_MONEY = 5_000; // як у createBridge
const NO_ANIMAL = 'animal.none';

const moves = (s: GameState): Move[] => allMoves(s, DEFS);

// Ключ — проєкція без навичок (progressView, GAME-72); 32-бітний відбиток, як і раніше, лише для швидкості.
const key = (s: GameState): string => stateHash(progressView(s));

/** Той самий стан, але з навичками на рангах 5 і без практики — контроль «навички не змінюють жодного ходу». */
const MAXED = Object.fromEntries(SKILL_IDS.map((id) => [id, RANK_XP[5] as number]));
const maxed = (s: GameState): GameState => ({ ...s, skills: MAXED, practice: {} });

/**
 * Ті самі сюжетні поля (усе, крім лічильників команд і навичок — як progressView). Дешевше за повний key:
 * поля, яких хід не торкався, — той самий об'єкт в обох станах, і їх не серіалізуємо.
 */
const sameProgress = (a: GameState, b: GameState): boolean => (Object.keys(a) as (keyof GameState)[])
  .every((k) => k === 'processed' || k === 'seq' || k === 'skills' || k === 'practice' || a[k] === b[k] || canonical(a[k]) === canonical(b[k]))
  && Object.keys(a).length === Object.keys(b).length;

/** Розбіжності «той самий хід, інші навички — інший сюжетний наслідок». Порожньо — проєкція key чесна. */
type SkillLeak = { move: Move; base: string; maxed: string };

function explore(first: GameState, leaks: SkillLeak[] = []) {
  const seen = new Map<string, GameState>([[key(first), first]]);
  const edges = new Map<string, Set<string>>();
  const queue = [first];
  for (let s = queue.shift(); s; s = queue.shift()) {
    const k = key(s);
    edges.set(k, new Set());
    for (const m of moves(s)) {
      const r = dispatch(s, { ...m, commandId: nextCommandId(s) } as Command, DEFS);
      // GAME-72: key не бачить навичок — це чесно, лише якщо навички не змінюють ні рішення ядра, ні сюжетного
      // наслідку жодного ходу. Перевірка на КОЖНОМУ стані й ході перебору, а не на вибірці.
      const r2 = dispatch(maxed(s), { ...m, commandId: nextCommandId(s) } as Command, DEFS);
      const same = r.ok && r2.ok ? sameProgress(r.state, r2.state) : !r.ok && !r2.ok && r.code === r2.code;
      if (!same && leaks.length < 5) leaks.push({ move: m, base: r.ok ? 'ok' : r.code, maxed: r2.ok ? 'ok' : r2.code });
      if (!r.ok) continue;
      const nk = key(r.state);
      if (!isLuckMove(m)) edges.get(k)?.add(nk);   // у стан після везіння заходимо, але шлях до кінця — без нього
      if (!seen.has(nk)) { seen.set(nk, r.state); queue.push(r.state); }
    }
    if (seen.size > 200_000) throw new Error('простір станів вибухнув — тест не доводить нічого');
  }
  return { seen, edges };
}

describe('сюжет: ядро ≡ валідатор на справжньому контенті (GAME-29)', () => {
  const combos = enumerateCombos(CONTENT);

  it('комбінацій більше нуля (інакше перевірка нижче порожня й зелена)', () => {
    expect(combos.length).toBeGreaterThan(1);
  });

  for (const k of combos) {
    const label = `${k.profile} · ${k.transport} · ${k.animal}`;
    it(label, () => {
      const created = dispatch(initialState(START_MONEY), {
        type: 'CreateCharacter', commandId: 'e0', profileId: k.profile ?? '', transportId: k.transport ?? '',
        ...(k.animal === NO_ANIMAL ? {} : { animalId: k.animal }),
      }, DEFS);
      expect(created.ok, label).toBe(true);
      const leaks: SkillLeak[] = [];
      const { seen, edges } = explore(created.state, leaks);
      expect(leaks, 'навички змінили хід — progressKey більше не чесний').toEqual([]);

      // 1) множини квестів збігаються
      const opened = new Set<string>();
      for (const s of seen.values()) for (const q of Object.keys(s.quests)) opened.add(q);
      const expected = buildIndex(project(CONTENT, k)).reachable;
      expect([...opened].sort()).toEqual([...expected].sort());

      // 2–3) кінець досяжний із кожного стану
      const ended = [...seen].filter(([, s]) => s.campaignEnded).map(([h]) => h);
      expect(ended.length).toBeGreaterThan(0);
      const back = new Map<string, string[]>();
      for (const [from, tos] of edges) for (const to of tos) back.set(to, [...(back.get(to) ?? []), from]);
      const canEnd = new Set(ended);
      const stack = [...ended];
      for (let h = stack.pop(); h !== undefined; h = stack.pop()) {
        for (const p of back.get(h) ?? []) if (!canEnd.has(p)) { canEnd.add(p); stack.push(p); }
      }
      const stuck = [...seen.keys()].filter((h) => !canEnd.has(h));
      expect(stuck.length, stuck.length ? `тупик: ${JSON.stringify(seen.get(stuck[0] ?? '')?.quests)}` : '').toBe(0);
      // 4) GAME-48: репліка за пам'яттю Елізи досяжна в ядрі рівно там, де Еліза може запам'ятати
      // велосипед, — у велосипедиста; у водія вузла shelter немає в жодному стані.
      const shelter = [...seen.values()].some((s) => s.dialogue?.id === 'dlg.elise-greeting' && s.dialogue.node === 'shelter');
      expect(shelter, 'shelter').toBe(k.transport === 'transport.bike');
    }, EXHAUSTIVE_MS);
  }
});

describe('збірка сюжету з content/ (src/content/story.ts)', () => {
  it('choiceKey → вибір; money → центи; item → itemId', () => {
    const st004 = STORY.quests['ST-004'];
    expect(st004?.transitions.map((t) => [t.to, t.choice])).toEqual([['ST-005', false], ['q.elise-bike-area', true]]);
    expect(STORY.quests['ST-005']?.reward?.moneyCents).toBe(1_000);
    const c = structuredClone(CONTENT);
    const q = c.quests[0];
    if (q) q.reward = { grantId: 'rw.x', money: 7, items: [{ item: 'item.tent', qty: 2 }] };
    expect(compileStory(c).quests[q?.id ?? '']?.reward).toEqual({ grantId: 'rw.x', moneyCents: 7, items: [{ itemId: 'item.tent', qty: 2 }] });
  });

  it('діалоги: умова й ефекти репліки доходять до ядра, файли теки dialogue/ — усі', () => {
    // Окремий лінивий glob (лише шляхи): збірка не загубила й не перейменувала жодного файлу.
    const files = Object.keys(import.meta.glob('../../content/dialogue/*.json'));
    expect(files.length).toBeGreaterThan(0);
    expect(Object.keys(STORY.dialogues).sort()).toEqual(files.map((f) => `dlg.${f.replace(/^.*\/|\.json$/g, '')}`).sort());
    const hello = STORY.dialogues['dlg.elise-greeting']?.nodes['hello'];
    expect(hello?.choices?.[0]).toEqual({ next: 'bike', when: { all: [{ transport: 'transport.bike' }, { notRemembers: 'm.came-by-bike' }] }, effects: [{ setFlag: 'f.elise-met' }, { remember: 'm.came-by-bike' }] });
    // GAME-48: умова на пам'ять доходить до ядра як є
    expect(hello?.choices?.[2]).toEqual({ next: 'shelter', when: { remembers: 'm.came-by-bike' }, effects: [] });
    expect(STORY.dialogues['dlg.elise-greeting']?.nodes['bye']).toEqual({ end: true });
  });

  it('те, чого ядро ще не вміє, не проходить мовчки: deliver і продаж у NPC — помилка збірки', () => {
    const a = structuredClone(CONTENT);
    const o = a.quests[0]?.objectives[0];
    if (o) o.kind = 'deliver';
    expect(() => compileStory(a)).toThrow(/deliver/);
    const b = structuredClone(CONTENT);
    const n = b.npcs[0];
    if (n) n.sells = ['item.tent'];
    expect(() => compileStory(b)).toThrow(/sells/);
  });

  it('каталог сюжету цілий для ядра (checkDefs)', () => {
    expect(checkDefs(DEFS)).toEqual([]);
  });

  it('GAME-72: startSkills профілю → ранги в ядрі, і CreateCharacter ставить старт професії', () => {
    expect(STORY.profiles['profile.solo-explorer']?.startSkills).toEqual({ 'skill.camping': 2, 'skill.endurance': 2, 'skill.planning': 1, 'skill.mechanics': 1 });
    const r = dispatch(initialState(0), { type: 'CreateCharacter', commandId: 'g72', profileId: 'profile.solo-explorer', transportId: 'transport.bike' }, DEFS);
    expect(r.ok && r.state.skills).toEqual({
      'skill.planning': 10, 'skill.camping': 30, 'skill.mechanics': 10, 'skill.electrics': 0,
      'skill.cooking': 0, 'skill.finance': 0, 'skill.endurance': 30, 'skill.communication': 0,
    });
  });

  it('GAME-72: risk дороги доходить до ядра лише там, де задано; без нього сюжет той самий', () => {
    expect(STORY.roads?.some((r) => Object.values(r.ways).some((w) => 'risk' in w))).toBe(false);
    const c = structuredClone(CONTENT);
    const way = c.roads?.[0]?.ways[0];
    if (way) way.risk = 2;
    const st = compileStory(c);
    expect(st.roads?.[0]?.ways[way?.transport ?? '']).toEqual({ minutes: way?.minutes, cents: way?.cents, risk: 2 });
    expect(st.roads?.[1]?.ways[way?.transport ?? '']).toEqual({ minutes: way?.minutes, cents: way?.cents, risk: 2 });   // twoWay — і назад
  });
});

describe('дороги справжнього контенту: ядро ≡ валідатор (GAME-31)', () => {
  it('доріг більше нуля, і ядро знаходить дорогу між КОЖНОЮ парою локацій для кожного транспорту', () => {
    expect(STORY.roads?.length ?? 0).toBeGreaterThan(0);
    const locs = Object.keys(STORY.locations);
    let pairs = 0;
    for (const t of STORY.transports) for (const a of locs) for (const b of locs) {
      expect(route(STORY, a, b, t), `${t}: ${a} → ${b}`).not.toBeNull();
      pairs++;
    }
    expect(pairs).toBe(STORY.transports.length * locs.length * locs.length);
  });

  it('негативний контроль: без дороги до озера велосипедом — ядро теж не доїде', () => {
    const c = structuredClone(CONTENT);
    const r = c.roads?.find((x) => x.to === 'loc.camp.lake');
    if (r) r.ways = r.ways.filter((w) => w.transport !== 'transport.bike');
    expect(route(compileStory(c), 'loc.home', 'loc.camp.lake', 'transport.bike')).toBeNull();
  });
});
