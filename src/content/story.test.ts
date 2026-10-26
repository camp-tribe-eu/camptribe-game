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
import { PROGRESS_IGNORED, exploreView, isLuckMove, moves as allMoves, progressView, type Move } from './moves';
import { RANK_XP, SKILL_IDS, zeroSkills } from '../core/skills';
import { checkDefs, type CondDef, type CoreDefs, type PackingDefs } from '../core/defs';
import { packFlag, packItemsFor } from '../core/packing';
import { route } from '../core/story';

// Повний перебір — свідомо важкий (велосипедна гілка з подією й пам'яттю ≈ 5 с локально, з контролем навичок GAME-72 ≈ 7.5 с, на CI довше): власна межа
// часу замість типових 5 с, щоб падіння означало «доказ не вкладається», а не «повільна машина».
// GAME-144: розділ триденний — повні перебори (ядро ≡ валідатор, пакування) заміряно 75–107 с на завантаженому CI-подібному
// контейнері (4 ядра, load ≈ 25); 60 с уже не вистачало.
const EXHAUSTIVE_MS = 240_000;

// Справжній каталог гри (зріз + сюжет) — як у містку: купівля, продаж і взаємодії теж серед ходів
// (рецензія GAME-29: без них продаж нагороди, що ламає квест, був невидимий).
const DEFS: CoreDefs = GAME_DEFS;
const START_MONEY = 5_000; // як у createBridge
const NO_ANIMAL = 'animal.none';

const moves = (s: GameState): Move[] => allMoves(s, DEFS);

// Ключ — проєкція без навичок (progressView, GAME-72) і без пам'ятних фактів (exploreView, GAME-110: вони косметичні —
// доводить memory-flags.test); 32-бітний відбиток, як і раніше, лише для швидкості.
const key = (s: GameState): string => stateHash(exploreView(s, STORY));

/** Той самий стан, але з навичками на рангах 5 і без практики — контроль «навички не змінюють жодного ходу». */
const MAXED = Object.fromEntries(SKILL_IDS.map((id) => [id, RANK_XP[5] as number]));
const maxed = (s: GameState): GameState => ({ ...s, skills: MAXED, practice: {} });
/** І з нулями: стан, до якого перебір дійшов першим, міг уже мати поріг, якого інший шлях до того ж ключа не має (рецензія fbd9c56). */
const zeroed = (s: GameState): GameState => ({ ...s, skills: zeroSkills(), practice: {} });

/**
 * Ті самі сюжетні поля (усе, крім лічильників команд і навичок — як progressView). Дешевше за повний key:
 * поля, яких хід не торкався, — той самий об'єкт в обох станах, і їх не серіалізуємо.
 */
const IGNORED: ReadonlySet<string> = new Set(PROGRESS_IGNORED);
const sameProgress = (a: GameState, b: GameState): boolean => (Object.keys(a) as (keyof GameState)[])
  .every((k) => IGNORED.has(k) || a[k] === b[k] || canonical(a[k]) === canonical(b[k]))
  && Object.keys(a).length === Object.keys(b).length;

/** Розбіжності «той самий хід, інші навички — інший сюжетний наслідок». Порожньо — проєкція key чесна. */
type SkillLeak = { move: Move; base: string; maxed: string };
const SKILL_VARIANTS = [maxed, zeroed];

/** Той самий хід із кожним варіантом навичок: сюжетний наслідок мусить збігтися з базовим `r`. */
function leaksOf(s: GameState, m: Move, r: ReturnType<typeof dispatch>, run: typeof dispatch): SkillLeak[] {
  const out: SkillLeak[] = [];
  for (const variant of SKILL_VARIANTS) {
    const r2 = run(variant(s), { ...m, commandId: nextCommandId(s) } as Command, DEFS);
    const same = r.ok && r2.ok ? sameProgress(r.state, r2.state) : !r.ok && !r2.ok && r.code === r2.code;
    if (!same) out.push({ move: m, base: r.ok ? 'ok' : r.code, maxed: `${variant.name}:${r2.ok ? 'ok' : r2.code}` });
  }
  return out;
}

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
      for (const l of leaksOf(s, m, r, dispatch)) if (leaks.length < 5) leaks.push(l);
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
    // GAME-141: велозона — вибір на дні 2 (з CH1-D2-ELISE-001), а не з ST-004.
    const d2elise = STORY.quests['CH1-D2-ELISE-001'];
    expect(d2elise?.transitions.map((t) => [t.to, t.choice])).toEqual([['CH1-D2-CAMP-001', false], ['q.elise-bike-area', true]]);
    expect(STORY.quests['ST-004']?.transitions.map((t) => [t.to, t.choice])).toEqual([['ST-005', false]]);
    // GAME-141: межа дня й кінець розділу — різні поля; ST-005 — лише межа дня 1.
    expect([STORY.quests['ST-005']?.dayEnd, STORY.quests['ST-005']?.end]).toEqual([true, false]);
    expect([STORY.quests['CH1-D2-FIRE-001']?.dayEnd, STORY.quests['CH1-D2-FIRE-001']?.end]).toEqual([true, false]);   // GAME-144: межа дня 2, кінець — удома в день 3
    expect([STORY.quests['CH1-D3-HOME-001']?.dayEnd, STORY.quests['CH1-D3-HOME-001']?.end]).toEqual([true, true]);
    expect(STORY.quests['ST-004'] && 'dayEnd' in STORY.quests['ST-004']).toBe(false);   // поле лише зі значенням true
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
    expect(hello?.choices?.[0]).toEqual({ next: 'bike', when: { all: [{ transport: 'transport.bike' }, { notRemembers: 'm.came-by-bike' }, { notFlag: 'f.elise-met' }] }, effects: [{ setFlag: 'f.elise-met' }, { remember: 'm.came-by-bike' }] }); // GAME-141: велозону закриває вже не привітання, а вузол bikezone дня 2
    // GAME-84 №5: «знайомство» — лише тому, хто ще не знайомий; прапорець/пам'ять доходять до ядра як є
    expect(hello?.choices?.[1]).toEqual({ next: 'intro', when: { notFlag: 'f.elise-met' }, effects: [{ setFlag: 'f.elise-met' }] });
    expect(hello?.choices?.[3]).toEqual({ next: 'spot', when: { flag: 'f.elise-met' }, effects: [] });
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

describe('ключ перебору ховає рівно лічильники й навички (рецензія fbd9c56)', () => {
  // Сторож витоку вище доводить чесність ключа лише для полів, які він сам пропускає. Якщо progressView почне
  // ховати ще щось (прапорці, пам'ять NPC), сторож цього не побачить — тож список закріплено тут.
  it('PROGRESS_IGNORED — саме processed, seq, skills, practice', () => {
    expect([...PROGRESS_IGNORED].sort()).toEqual(['practice', 'processed', 'seq', 'skills']);
  });
  it('progressView обнуляє саме PROGRESS_IGNORED, решта полів стану — без змін', () => {
    const s = initialState(START_MONEY);
    const v = progressView(s) as Record<string, unknown>;
    expect(Object.keys(v).sort()).toEqual(Object.keys(s).sort());
    const hidden = Object.keys(s).filter((k) => v[k] !== (s as unknown as Record<string, unknown>)[k]).sort();
    expect(hidden).toEqual([...PROGRESS_IGNORED].sort());
  });
});

describe('сторож витоку навичок уміє почервоніти (рецензія 3c4bc9f)', () => {
  // Підставне ядро з порогами, яких у справжньому немає: без цих контролів обидва варіанти можна тихо прибрати.
  const created = dispatch(initialState(START_MONEY), { type: 'CreateCharacter', commandId: 'e0', profileId: 'profile.solo-explorer', transportId: 'transport.bike' }, DEFS);
  const s = created.ok ? created.state : initialState(START_MONEY);
  const m: Move = { type: 'Visit', locationId: 'loc.home' };   // перший хід Прологу
  const r = dispatch(s, { ...m, commandId: nextCommandId(s) } as Command, DEFS);
  const T1 = RANK_XP[1] as number, T5 = RANK_XP[5] as number;
  const gated = (need: (xp: number) => boolean): typeof dispatch => (st, cmd, defs) =>
    need(st.skills['skill.planning'] ?? 0) ? dispatch(st, cmd, defs) : { ok: false, code: 'CONDITION_FAILED' } as ReturnType<typeof dispatch>;
  it('старт має планування між порогами (інакше контролі нижче нічого не доводять)', () => {
    expect(r.ok).toBe(true);
    expect(s.skills['skill.planning']).toBeGreaterThanOrEqual(T1);
    expect(s.skills['skill.planning']).toBeLessThan(T5);
  });
  it('поріг, який видно лише з нулями (планування ≥ 10), — витік через zeroed', () => {
    expect(leaksOf(s, m, r, gated((xp) => xp >= T1)).map((l) => l.maxed)).toEqual(['zeroed:CONDITION_FAILED']);
  });
  it('поріг, який видно лише на рангу 5 (планування < 150), — витік через maxed', () => {
    expect(leaksOf(s, m, r, gated((xp) => xp < T5)).map((l) => l.maxed)).toEqual(['maxed:CONDITION_FAILED']);
  });
  it('справжнє ядро — витоків немає', () => {
    expect(leaksOf(s, m, r, dispatch)).toEqual([]);
  });
});


// ───────────────────────────── GAME-109 · пакування: будь-який набір речей — розділ завершуваний ─────────────────────────────
// Пакування не серед moves() (інакше перебір множився б на 2^12), тож його доводить окремий перебір:
// для КОЖНОЇ комбінації й КОЖНОЇ підмножини речей — набір складається командами пакування (вміщається ⇔ усі PackItem прийняті),
// і з нього розділ доходить до кінця БЕЗ повернення до пакування (хід «пакувати» у пошуку немає). Доказ — свідок: шлях ходів, який
// відтворюється з кожного набору команда за командою. Свідка шукаємо перебором раз на клас наборів, що однаково читаються діалогами
// (прапорці f.pack-*, які читає хоч одна умова), — а відтворення з КОЖНОГО набору перевіряє, що клас справді був однаковим.

describe('пакування (GAME-109): усі підмножини речей → розділ завершуваний без повернення до пакування', () => {
  const PK = GAME_DEFS.packing as PackingDefs;
  const BIG = 60_000;

  /** Стан: персонаж створений, пролог дійшов до відкритого пакування (крамниця, ST-003 завершено, намет і спальник в руках). */
  function atPacking(k: { profile: string | null; transport: string | null; animal: string | null }, defs: CoreDefs): GameState {
    let s = initialState(START_MONEY);
    const run = (m: Move): void => {
      const r = dispatch(s, { ...m, commandId: nextCommandId(s) } as Command, defs);
      if (!r.ok) throw new Error(`${m.type} → ${r.code}`);
      s = r.state;
    };
    run({ type: 'CreateCharacter', profileId: k.profile ?? '', transportId: k.transport ?? '', ...(k.animal === NO_ANIMAL ? {} : { animalId: k.animal ?? '' }) } as Move);
    run({ type: 'CompleteQuest', questId: 'PROLOGUE-HOME-001' }); run({ type: 'CompleteQuest', questId: 'ST-001' });
    run({ type: 'CompleteQuest', questId: 'ST-002' });
    run({ type: 'Visit', locationId: 'loc.shop' });
    run({ type: 'Pickup', itemId: 'item.tent' });
    run({ type: 'Pickup', itemId: 'item.sleeping-bag' });
    run({ type: 'CompleteQuest', questId: 'ST-003' });
    return s;
  }

  const send = (s: GameState, m: Move, defs: CoreDefs) => dispatch(s, { ...m, commandId: nextCommandId(s) } as Command, defs);

  /** Скласти набір `want` командами пакування: спершу дістати зайве, далі покласти потрібне. `full` — хоч одна річ не вмістилась. */
  function packSet(open: GameState, want: ReadonlySet<string>, defs: CoreDefs): { state: GameState; full: boolean } {
    let s = open;
    const p = s.player as NonNullable<GameState['player']>;
    const items = packItemsFor(PK, p);
    for (const i of items) if (!want.has(i.itemId) && s.flags.includes(packFlag(i.itemId))) {
      const r = send(s, { type: 'UnpackItem', itemId: i.itemId }, defs);
      if (!r.ok) throw new Error(`Unpack → ${r.code}`);
      s = r.state;
    }
    let full = false;
    for (const i of items) if (want.has(i.itemId) && !s.flags.includes(packFlag(i.itemId))) {
      const r = send(s, { type: 'PackItem', itemId: i.itemId }, defs);
      if (r.ok) s = r.state; else if (r.code === 'PACK_FULL') full = true; else throw new Error(`Pack → ${r.code}`);
    }
    return { state: s, full };
  }

  /** Свідок: найкоротший (за ходами, без везіння) шлях до кінця розділу з `first`; null — кінця немає. */
  function witness(first: GameState, defs: CoreDefs): Move[] | null {
    const k = (s: GameState): string => stateHash(progressView(s));
    const nodes: { s: GameState; parent: number; move: Move | null }[] = [{ s: first, parent: -1, move: null }];
    const seen = new Set<string>([k(first)]);
    for (let i = 0; i < nodes.length; i++) {
      const cur = (nodes[i] as (typeof nodes)[number]).s;
      if (cur.campaignEnded) {
        const path: Move[] = [];
        for (let n = i; n > 0; n = (nodes[n] as (typeof nodes)[number]).parent) path.unshift((nodes[n] as (typeof nodes)[number]).move as Move);
        return path;
      }
      for (const m of allMoves(cur, defs)) {
        if (isLuckMove(m)) continue;
        const r = send(cur, m, defs);
        if (!r.ok) continue;
        const nk = k(r.state);
        if (seen.has(nk)) continue;
        seen.add(nk);
        nodes.push({ s: r.state, parent: i, move: m });
        if (nodes.length > BIG) throw new Error('простір станів вибухнув — свідок нічого не доводить');
      }
    }
    return null;
  }

  function replays(first: GameState, path: readonly Move[], defs: CoreDefs): boolean {
    let s = first;
    for (const m of path) {
      const r = send(s, m, defs);
      if (!r.ok) return false;
      s = r.state;
    }
    return s.campaignEnded;
  }

  /** Прапорці f.pack-*, які читає хоч одна умова розмов з NPC (flag/notFlag, у т. ч. у all/any). */
  const readPackFlags = (st: typeof STORY): Set<string> => {
    const out = new Set<string>();
    const walk = (c: CondDef): void => {
      if ('flag' in c) out.add(c.flag); else if ('notFlag' in c) out.add(c.notFlag);
      else if ('all' in c) c.all.forEach(walk); else if ('any' in c) c.any.forEach(walk);
    };
    // Події в дорозі (trigger) — поза класами (GAME-108): у них заходять лише ходом везіння, а свідок його не бере, тож
    // прапорець, який читає лише подія (f.pack-lantern-2 у «Трьох однакових ліхтарях»), шляху свідка не змінює.
    for (const d of Object.values(st.dialogues)) if (!d.trigger) for (const n of Object.values(d.nodes)) for (const ch of n.choices ?? []) if (ch.when) walk(ch.when);
    return new Set([...out].filter((f) => f.startsWith('f.pack-')));
  };

  /** Перебір усіх наборів для однієї комбінації; повертає підсумок і набори, з яких розділ не завершити. */
  function sweep(k: { profile: string | null; transport: string | null; animal: string | null }, defs: CoreDefs) {
    const open = atPacking(k, defs);
    const p = open.player as NonNullable<GameState['player']>;
    const items = packItemsFor(PK, p);
    const cap = PK.capacity[p.transportId] as number;
    const read = readPackFlags(defs.story as typeof STORY);
    const witnesses = new Map<string, Move[] | null>();
    const out = { masks: 0, fit: 0, rejected: 0, completable: 0, stuck: [] as string[], oracleMismatch: 0, classes: 0 };
    for (let mask = 0; mask < 1 << items.length; mask++) {
      const want = new Set(items.filter((_, i) => (mask >> i) & 1).map((i) => i.itemId));
      const units = items.reduce((a, i) => a + (want.has(i.itemId) ? i.units : 0), 0);
      const { state, full } = packSet(open, want, defs);
      out.masks++;
      // Оракул вміщення — проста сума з контенту, а не usedUnits ядра: вміщається ⇔ жодна річ не відхилена PACK_FULL.
      if (full !== units > cap) out.oracleMismatch++;
      if (full) { out.rejected++; continue; }
      out.fit++;
      const cls = items.filter((i) => read.has(packFlag(i.itemId))).map((i) => (want.has(i.itemId) ? 1 : 0)).join('');
      if (!witnesses.has(cls)) { witnesses.set(cls, witness(state, defs)); out.classes++; }
      const w = witnesses.get(cls) ?? null;
      if (w !== null && replays(state, w, defs)) out.completable++;
      else out.stuck.push([...want].join(','));
    }
    return out;
  }

  const combos = enumerateCombos(CONTENT);
  const tally = { masks: 0, fit: 0, rejected: 0, completable: 0, classes: 0 };

  for (const k of combos) {
    it(`${k.profile} · ${k.transport} · ${k.animal}: кожна підмножина — або не вміщається, або завершуваний розділ`, () => {
      const r = sweep(k, DEFS);
      expect(r.oracleMismatch, 'вміщається ⇔ сума одиниць ≤ місця').toBe(0);
      expect(r.masks).toBeGreaterThanOrEqual(2 ** 9);   // без кішки — 9 речей, з кішкою — 12
      expect(r.fit, 'пакування приймає й відхиляє: обидва боки').toBeGreaterThan(0);
      expect(r.rejected).toBeGreaterThan(0);
      expect(r.fit + r.rejected).toBe(r.masks);
      expect(r.stuck.slice(0, 3), `набір, з якого розділ не завершити (${r.stuck.length} із ${r.fit})`).toEqual([]);
      expect(r.completable).toBe(r.fit);
      for (const key of ['masks', 'fit', 'rejected', 'completable', 'classes'] as const) tally[key] += r[key];
    }, EXHAUSTIVE_MS);
  }

  for (const k of combos) {
    it(`${k.profile} · ${k.transport} · ${k.animal}: з порожнього багажу тупиків немає в жодному досяжному стані (повний перебір)`, () => {
      const first = packSet(atPacking(k, DEFS), new Set(), DEFS).state;
      expect(first.flags.some((f) => f.startsWith('f.pack-'))).toBe(false);
      const { seen, edges } = explore(first);
      const back = new Map<string, string[]>();
      for (const [from, tos] of edges) for (const to of tos) back.set(to, [...(back.get(to) ?? []), from]);
      const canEnd = new Set([...seen].filter(([, s]) => s.campaignEnded).map(([h]) => h));
      const stack = [...canEnd];
      for (let h = stack.pop(); h !== undefined; h = stack.pop()) for (const p of back.get(h) ?? []) if (!canEnd.has(p)) { canEnd.add(p); stack.push(p); }
      expect(canEnd.size).toBeGreaterThan(0);
      expect([...seen.keys()].filter((h) => !canEnd.has(h)).length, 'тупик').toBe(0);
    }, EXHAUSTIVE_MS);
  }

  it('підсумок: скільки наборів перебрано (для звіту) і що класів читання прапорців більше одного', () => {
    console.log(`PACKING SWEEP: комбінацій ${combos.length}, наборів ${tally.masks}, вміщається ${tally.fit}, відхилено за місцем ${tally.rejected}, завершуваних ${tally.completable}, класів свідків ${tally.classes}`);
    expect(tally.completable).toBe(tally.fit);
    expect(tally.classes).toBeGreaterThan(combos.length);   // і «намет є», і «намету нема» — свідки різні
  });

  it('НЕГАТИВНИЙ КОНТРОЛЬ: без запасних ночівель (авто й альтанка) набір без намету червоніє', () => {
    const c = structuredClone(CONTENT);
    const dlg = c.dialogues.find((d) => d.id === 'dlg.elise-greeting');
    const spot = dlg?.nodes.find((n) => n.id === 'spot');
    if (spot?.choices) spot.choices = spot.choices.filter((ch) => !JSON.stringify(ch).includes('f.night-car') && !JSON.stringify(ch).includes('f.night-gazebo'));
    const mutated: CoreDefs = { ...DEFS, story: compileStory(c) };
    for (const k of combos) {
      const r = sweep(k, mutated);
      expect(r.stuck.length, `${k.transport}: без запасної ночівлі наборів без намету мало б не вистачати`).toBeGreaterThan(0);
      expect(r.stuck.every((s) => !s.split(',').includes('item.tent')), 'застрягають лише набори БЕЗ намету').toBe(true);
    }
  }, EXHAUSTIVE_MS);
});
