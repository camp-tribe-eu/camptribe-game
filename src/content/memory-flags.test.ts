// GAME-110 · п'ять пам'ятних виборів розділу 1 — прапорці пам'яті без прихованих штрафів. На справжньому контенті:
//  1) п'ять виборів = рядки content/flags.json з `journal: true` (з описом), і кожен факт читає пізніша розмова;
//  2) вибори косметичні: ті, хто їх читає, не чіпають нічого, крім інших пам'ятних фактів (на цьому стоїть exploreView);
//  3) усі 2⁵ = 32 комбінації проходять розділ до кінця в ядрі (sim.step), і гроші / речі / спорядження / квести / навички
//     в кінці ОДНАКОВІ й не гірші за мінімум MIN (нижче) — вибір не забирає нічого мовчки;
//  4) журнал подорожі в стані симуляції містить рівно зроблені вибори, а екран журналу (view-model) має для них текст.
// Закон 1: кожен сторож має негативний контроль — підставлений «вибір, що бере гроші», «вибір, що забирає річ»,
// «згадка, що закриває ціль» — і мусить почервоніти.
import { describe, expect, it } from 'vitest';
import { nextCommandId, type Command } from '../core/commands';
import { canonical } from '../core/hash';
import { newSim, step, type SimState } from '../core/sim';
import type { GameState } from '../core/state';
import { storyOffer } from '../view/story-offer';
import flags from '../../content/flags.json';
import uk from '../../content/locales/uk.json';
import { GAME_DEFS } from './slice-defs';
import { CONTENT, STORY, memorableFacts, type RawContent } from './story';
import { exploreView, type Move } from './moves';

const CTX = { defs: GAME_DEFS };
const START_MONEY = 5_000;          // як у createBridge
const SEED = 20261024;

/** П'ять виборів → їхні факти (значення). Порядок — як у картці. */
const CHOICES = {
  pitch: ['f.pitch-pines', 'f.pitch-lake-view'],
  apple: ['f.road-apple', null],                       // не взяти яблуко — факту немає, і це не штраф
  gear: ['f.gear-plan-basic', 'f.gear-plan-better'],
  advice: ['m.advice-taken', 'm.advice-declined'],
  roles: ['f.roles-route-george', 'f.roles-route-matthew'],
} as const;
type Pick5 = { readonly [K in keyof typeof CHOICES]: 0 | 1 };

/**
 * Мінімум кінця розділу 1 (для PR): стартові 50 € + нагорода «Прибуття» (rw.st-005, 10 €) = 60 €; у руках намет, спальник і
 * дрова; ST-001…ST-005 завершено, розділ закінчено. Жодна комбінація не сміє бути гіршою — і всі мусять бути однаковими.
 */
const MIN = {
  moneyCents: START_MONEY + 1_000,
  items: ['item.tent', 'item.sleeping-bag', 'item.firewood'],
  quests: ['CH1-HOME-001', 'PROLOGUE-HOME-001', 'ST-001', 'ST-002', 'ST-003', 'ST-004', 'ST-005'],
} as const;

type Cond = Record<string, unknown>;
function leaves(c: Cond): Cond[] {
  if (Array.isArray(c.all)) return (c.all as Cond[]).flatMap(leaves);
  if (Array.isArray(c.any)) return (c.any as Cond[]).flatMap(leaves);
  return [c];
}
const readsOf = (c: Cond | undefined): string[] => (c ? leaves(c).flatMap((l) => [l.flag, l.notFlag, l.remembers, l.notRemembers].filter((x): x is string => typeof x === 'string')) : []);

interface RawChoice { textKey: string; next: string; when?: Cond; effects?: Record<string, unknown>[] }
interface RawNode { id: string; next?: string; choices?: RawChoice[] }
const nodesOf = (d: RawContent['dialogues'][number]): RawNode[] => d.nodes as unknown as RawNode[];

/**
 * «Косметичний» вибір (на цьому стоїть exploreView у moves.ts): кожен вибір, чия умова читає пам'ятний факт, разом з усім
 * піддеревом розмови до кінця ставить ЛИШЕ пам'ятні факти. Повертає порушення: «діалог/вузол.вибір → ефект».
 */
function cosmeticViolations(content: Pick<RawContent, 'dialogues' | 'flags'>): string[] {
  const mem = new Set(memorableFacts(content));
  const out: string[] = [];
  const harmless = (e: Record<string, unknown>): boolean => (typeof e.setFlag === 'string' && mem.has(e.setFlag)) || (typeof e.remember === 'string' && mem.has(e.remember));
  for (const d of content.dialogues) {
    const byId = new Map(nodesOf(d).map((n) => [n.id, n]));
    for (const n of nodesOf(d)) (n.choices ?? []).forEach((ch, i) => {
      if (!readsOf(ch.when).some((f) => mem.has(f))) return;
      const seen = new Set<string>();
      const stack = [ch.next];
      const effects = (ch.effects ?? []).map((e) => [`${n.id}.choices[${i}]`, e] as const);
      for (let id = stack.pop(); id !== undefined; id = stack.pop()) {
        if (seen.has(id)) continue;
        seen.add(id);
        const node = byId.get(id);
        if (!node) continue;
        if (node.next) stack.push(node.next);
        (node.choices ?? []).forEach((c, j) => { effects.push(...(c.effects ?? []).map((e) => [`${id}.choices[${j}]`, e] as const)); stack.push(c.next); });
      }
      for (const [where, e] of effects) if (!harmless(e)) out.push(`${d.id}/${n.id}.choices[${i}] → ${where}: ${JSON.stringify(e)}`);
    });
  }
  return out;
}

// ── прохід розділу ────────────────────────────────────────────────────────────────────────────────────────────────
/** Підстава для негативних контролів: що зробити зі станом після кожного прийнятого кроку (у грі — нічого). */
type Tamper = (before: SimState, after: SimState, move: Move) => SimState;

function send(s: SimState, move: Move, tamper?: Tamper): SimState {
  const id = nextCommandId(s.game);
  const next = step(s, { kind: 'command', command: { ...move, commandId: id } as Command }, CTX);
  const rec = next.game.processed[id];
  if (!rec?.ok) throw new Error(`${JSON.stringify(move)} → ${rec?.code ?? 'немає запису'} (діалог ${JSON.stringify(s.game.dialogue)})`);
  return tamper ? tamper(s, next, move) : next;
}
const node = (s: SimState): string | null => s.game.dialogue?.node ?? null;

interface Run { readonly pick: Pick5; readonly sim: SimState; readonly readerNodes: string[] }

/** Розділ 1 сім'єю на авто (лише в неї є Джордж і всі п'ять виборів) — від персонажа до кінця і ще трохи: згадки. */
function play(pick: Pick5, tamper?: Tamper): Run {
  let s = newSim(SEED, START_MONEY);
  const go = (m: Move): void => { s = send(s, m, tamper); };
  go({ type: 'CreateCharacter', profileId: 'profile.family-teen', transportId: 'transport.car' });
  // Вибори 3 і 5 — план із Джорджем удома: спорядження, потім маршрут.
  go({ type: 'Talk', npcId: 'npc.george' }); go({ type: 'Choose', choice: 0 });
  go({ type: 'Choose', choice: pick.gear }); go({ type: 'Continue' });
  go({ type: 'Choose', choice: pick.roles }); go({ type: 'Continue' }); go({ type: 'Continue' });
  expect(s.game.dialogue).toBeNull();
  go({ type: 'CompleteQuest', questId: 'PROLOGUE-HOME-001' }); go({ type: 'CompleteQuest', questId: 'ST-001' }); go({ type: 'CompleteQuest', questId: 'ST-002' });
  go({ type: 'Visit', locationId: 'loc.shop' }); go({ type: 'Pickup', itemId: 'item.tent' }); go({ type: 'Pickup', itemId: 'item.sleeping-bag' });
  go({ type: 'CompleteQuest', questId: 'ST-003' }); go({ type: 'Visit', locationId: 'loc.home' }); go({ type: 'CompleteQuest', questId: 'CH1-HOME-001' });
  // Вибір 2 — яблука. Подію може кинути сама симуляція після дороги; не кинула — шлемо її, як шле симуляція.
  go({ type: 'Visit', locationId: 'loc.road' });
  if (s.game.dialogue?.id !== 'dlg.road-apples') go({ type: 'RoadEvent', eventId: 'dlg.road-apples' });
  go({ type: 'Choose', choice: pick.apple }); go({ type: 'Continue' });
  go({ type: 'CompleteQuest', questId: 'ST-004', to: 'ST-005' });
  go({ type: 'Visit', locationId: 'loc.camp.lake' });
  // Вибір 1 — місце намету: перша розмова з Елізою (hello.c2 → intro → spot), біля сосон (spot.c1) чи біля води (spot.c5).
  go({ type: 'Talk', npcId: 'npc.elise' }); go({ type: 'Choose', choice: 1 }); go({ type: 'Continue' });
  go({ type: 'Choose', choice: pick.pitch === 0 ? 0 : 4 }); go({ type: 'Continue' });
  // Місце одне: удруге «де поставити?» жодного місця вже не пропонує (enum f.pitch не отримає двох значень).
  go({ type: 'Talk', npcId: 'npc.elise' }); go({ type: 'Choose', choice: 3 });
  const other = nextCommandId(s.game);
  const tried = step(s, { kind: 'command', command: { type: 'Choose', choice: pick.pitch === 0 ? 4 : 0, commandId: other } }, CTX);
  expect(tried.game.processed[other]).toMatchObject({ ok: false, code: 'CONDITION_FAILED' });
  go({ type: 'Choose', choice: 5 }); go({ type: 'Continue' });   // spot.c6 «Намет уже стоїть»
  go({ type: 'Pickup', itemId: 'item.firewood' });
  go({ type: 'CompleteQuest', questId: 'ST-005' });
  expect(s.game.campaignEnded).toBe(true);
  // Вибір 4 — порада Елізи на ранок (лише після «Прибуття»): прийняти чи по-своєму.
  go({ type: 'Talk', npcId: 'npc.elise' }); go({ type: 'Choose', choice: 8 }); go({ type: 'Choose', choice: pick.advice }); go({ type: 'Continue' }); go({ type: 'Continue' });
  // Згадки в пізніших розмовах: кожна гілка-згадка, доречна для цієї комбінації, — до кінця розмови.
  const readerNodes: string[] = [];
  const recall = (hello: number, branch: number): void => {
    go({ type: 'Talk', npcId: 'npc.elise' }); go({ type: 'Choose', choice: hello }); go({ type: 'Choose', choice: branch });
    readerNodes.push(node(s) ?? '—');
    while (s.game.dialogue) go({ type: 'Continue' });
  };
  // Не взяли яблуко — розповідаємо «без пригод» (road.c6): та сама кількість розмов, тож навичка спілкування однакова
  // (інакше різниця в одну розмову виглядала б як штраф вибору, а це штраф тесту).
  recall(6, pick.apple === 0 ? 0 : 5);
  recall(6, pick.roles === 0 ? 1 : 2);
  recall(6, pick.gear === 0 ? 3 : 4);
  recall(7, pick.pitch === 0 ? 0 : 1);
  recall(9, pick.advice);
  return { pick, sim: s, readerNodes };
}

/** Те, чим вибір НЕ сміє платити: гроші, речі, спорядження, квести, кінець розділу, навички. */
const outcome = (g: GameState): string => canonical({ moneyCents: g.moneyCents, inventory: g.inventory, gear: g.gear, grants: g.grants, quests: g.quests, campaignEnded: g.campaignEnded, skills: g.skills });

/** Сторож «без прихованих штрафів»: порушення мінімуму й розбіжність між комбінаціями. Порожньо — зелене. */
function hiddenPenalties(runs: readonly Run[]): string[] {
  const out: string[] = [];
  const label = (r: Run): string => JSON.stringify(r.pick);
  for (const r of runs) {
    const g = r.sim.game;
    if (g.moneyCents < MIN.moneyCents) out.push(`${label(r)}: гроші ${g.moneyCents} < ${MIN.moneyCents}`);
    for (const it of MIN.items) if (!g.inventory[it]) out.push(`${label(r)}: немає ${it}`);
    for (const q of MIN.quests) if (g.quests[q]?.status !== 'completed') out.push(`${label(r)}: ${q} не завершено`);
    if (!g.campaignEnded) out.push(`${label(r)}: розділ не закінчено`);
  }
  const base = runs[0] ? outcome(runs[0].sim.game) : '';
  for (const r of runs.slice(1)) if (outcome(r.sim.game) !== base) out.push(`${label(r)}: кінець розділу інший, ніж у ${label(runs[0] as Run)}`);
  return out;
}

const ALL: Pick5[] = Array.from({ length: 32 }, (_, n) => ({ pitch: (n & 1) as 0 | 1, apple: ((n >> 1) & 1) as 0 | 1, gear: ((n >> 2) & 1) as 0 | 1, advice: ((n >> 3) & 1) as 0 | 1, roles: ((n >> 4) & 1) as 0 | 1 }));
const chosen = (p: Pick5): string[] => (Object.keys(CHOICES) as (keyof typeof CHOICES)[]).map((k) => CHOICES[k][p[k]]).filter((f): f is NonNullable<typeof f> => f !== null).sort();
const factsOf = (g: GameState, mem: ReadonlySet<string>): string[] => [...g.flags, ...Object.values(g.npcMemory).flat()].filter((f) => mem.has(f)).sort();

describe('п’ять пам’ятних виборів (GAME-110)', () => {
  const MEM = new Set(STORY.memorable ?? []);

  it('№1 реєстр: п’ять виборів = рядки flags.json з journal і описом; ядро знає рівно їхні факти', () => {
    const rows = (flags as { id: string; journal?: boolean; note?: string }[]).filter((f) => f.journal === true);
    expect(rows.map((r) => r.id).sort()).toEqual(['f.gear-plan', 'f.pitch', 'f.road-apple', 'f.roles', 'm.advice-declined', 'm.advice-taken']);
    for (const r of rows) expect((r.note ?? '').length, r.id).toBeGreaterThan(40);
    const expected = Object.values(CHOICES).flat().filter((f): f is NonNullable<typeof f> => f !== null).sort();
    expect([...MEM].sort()).toEqual(expected);
    expect(expected).toHaveLength(9);      // 5 виборів: чотири по два значення + «взяли яблуко»
  });

  it('№1 читачі: кожен пам’ятний факт читає умова в ІНШОМУ виборі, ніж той, що його ставить', () => {
    const readers = new Map<string, string[]>();
    for (const d of CONTENT.dialogues) for (const n of nodesOf(d)) (n.choices ?? []).forEach((ch, i) => {
      const sets = new Set((ch.effects ?? []).map((e) => e.setFlag ?? e.remember));
      for (const f of readsOf(ch.when)) if (MEM.has(f) && !sets.has(f)) readers.set(f, [...(readers.get(f) ?? []), `${d.id}/${n.id}.choices[${i}]`]);
    });
    for (const f of MEM) expect(readers.get(f)?.length ?? 0, f).toBeGreaterThan(0);
    expect(readers.size).toBe(9);
  });

  it('№2 косметичні: згадки не ставлять нічого, крім пам’ятних фактів (на цьому стоїть exploreView)', () => {
    expect(cosmeticViolations(CONTENT)).toEqual([]);
  });

  // Запис Memory бере id команди вибору: вибір із двома пам'ятними фактами дав би два записи з одним commandId (рецензія PR #61).
  const multiMemorable = (content: Pick<RawContent, 'dialogues' | 'flags'>): string[] => {
    const mem = new Set(memorableFacts(content));
    return content.dialogues.flatMap((d) => nodesOf(d).flatMap((n) => (n.choices ?? []).flatMap((ch, i) => {
      const facts = (ch.effects ?? []).filter((e) => (typeof e.setFlag === 'string' && mem.has(e.setFlag)) || (typeof e.remember === 'string' && mem.has(e.remember)));
      return facts.length > 1 ? [`${d.id}/${n.id}.choices[${i}]: ${facts.length}`] : [];
    })));
  };
  it('№3 один вибір ставить не більше одного пам\u2019ятного факту (інакше дубль commandId у журналі)', () => {
    expect(multiMemorable(CONTENT)).toEqual([]);
    const broken = structuredClone(CONTENT);
    const ch = broken.dialogues.flatMap((d) => nodesOf(d).flatMap((n) => n.choices ?? []))
      .find((c) => (c.effects ?? []).some((e) => typeof e.setFlag === 'string' && memorableFacts(broken).includes(e.setFlag)));
    const other = memorableFacts(broken).find((f) => f.startsWith('f.') && !(ch?.effects ?? []).some((e) => e.setFlag === f));
    ch?.effects?.push({ setFlag: other ?? '' });
    expect(multiMemorable(broken)).toHaveLength(1);              // негативний контроль: другий факт у тому ж виборі — червоне
  });

  it('№2 негативний контроль: згадка, що закриває ціль чи стартує квест, — червоне', () => {
    const broken = structuredClone(CONTENT);
    const elise = broken.dialogues.find((d) => d.id === 'dlg.elise-greeting');
    const road = elise && nodesOf(elise).find((n) => n.id === 'road');
    if (road?.choices?.[0]) road.choices[0].effects = [{ completeObjective: { quest: 'ST-005', objective: 'pitch-tent' } }];
    const advice = elise && nodesOf(elise).find((n) => n.id === 'advice');
    advice?.choices?.[0]?.effects?.push({ startQuest: 'q.elise-bike-area' });
    const v = cosmeticViolations(broken);
    // Три: зламана згадка road.c1 — і як сама (читає f.road-apple), і як піддерево hello.c7; startQuest — у піддереві hello.c9.
    expect(v).toHaveLength(3);
    expect(v.join('\n')).toContain('completeObjective');
    expect(v.join('\n')).toContain('startQuest');
  });

  it('№2 exploreView ховає рівно пам\u2019ятні факти: решта прапорців і пам\u2019яті лишається в ключі перебору', () => {
    const g = (RUNS[31] as Run).sim.game;
    const bare: GameState = { ...g, flags: g.flags.filter((f) => !MEM.has(f)), npcMemory: { 'npc.elise': [] } };
    expect(canonical(exploreView(g, STORY))).toBe(canonical(exploreView(bare, STORY)));
    expect(canonical(exploreView({ ...g, flags: g.flags.filter((f) => f !== 'f.night-tent') }, STORY))).not.toBe(canonical(exploreView(g, STORY)));
    expect(canonical(exploreView({ ...g, npcMemory: { ...g.npcMemory, 'npc.elise': ['m.came-by-bike'] } }, STORY))).not.toBe(canonical(exploreView(g, STORY)));
  });

  const RUNS = ALL.map((p) => play(p));

  it('№2 перебір не порожній: 32 різні комбінації справді зроблено, у кожній — рівно її факти', () => {
    expect(RUNS).toHaveLength(32);
    expect(new Set(RUNS.map((r) => factsOf(r.sim.game, MEM).join())).size).toBe(32);
    for (const r of RUNS) expect(factsOf(r.sim.game, MEM), JSON.stringify(r.pick)).toEqual(chosen(r.pick));
  });

  it('№2 без прихованих штрафів: усі 32 кінці розділу однакові й не гірші за мінімум', () => {
    expect(hiddenPenalties(RUNS)).toEqual([]);
    const g = (RUNS[0] as Run).sim.game;
    expect(g.moneyCents).toBeGreaterThanOrEqual(MIN.moneyCents);
  });

  it('№2 згадки спрацьовують у ядрі: кожна доречна гілка відкривається й закривається розмовою', () => {
    for (const r of RUNS) {
      const want = [r.pick.apple === 0 ? 'road-apple' : 'bye', r.pick.roles === 0 ? 'road-george' : 'road-matthew', r.pick.gear === 0 ? 'road-basic' : 'road-better',
        r.pick.pitch === 0 ? 'place-pines' : 'place-lake', r.pick.advice === 0 ? 'again-yes' : 'again-no'];
      expect(r.readerNodes, JSON.stringify(r.pick)).toEqual(want);
      expect(r.sim.game.dialogue).toBeNull();
    }
  });

  it('№2 негативний контроль: «вибір бере гроші без пояснення» — червоне на кожній комбінації з ним', () => {
    const fee: Tamper = (b, a, m) => (m.type === 'Choose' && a.game.flags.includes('f.gear-plan-better') && !b.game.flags.includes('f.gear-plan-better') ? { ...a, game: { ...a.game, moneyCents: a.game.moneyCents - 1_500 } } : a);
    const bad = hiddenPenalties(ALL.map((p) => play(p, fee)));
    // 16 комбінацій із «глянути краще»: кожна нижча за мінімум і інша, ніж базова (базова — комбінація 0, без вибору).
    expect(bad.filter((x) => x.includes('гроші'))).toHaveLength(16);
    expect(bad.filter((x) => x.includes('кінець розділу інший'))).toHaveLength(16);
  });

  it('№2 негативний контроль: «по-своєму» мовчки забирає спальник — червоне', () => {
    const take: Tamper = (b, a, m) => {
      const gone = m.type === 'Choose' && (a.game.npcMemory['npc.elise'] ?? []).includes('m.advice-declined') && !(b.game.npcMemory['npc.elise'] ?? []).includes('m.advice-declined');
      if (!gone) return a;
      const inventory = Object.fromEntries(Object.entries(a.game.inventory).filter(([id]) => id !== 'item.sleeping-bag'));
      return { ...a, game: { ...a.game, inventory } };
    };
    const bad = hiddenPenalties(ALL.map((p) => play(p, take)));
    expect(bad.filter((x) => x.includes('немає item.sleeping-bag'))).toHaveLength(16);
  });

  it('№3 журнал у стані симуляції: записи Memory — рівно зроблені вибори, по одному на вибір, з id команди вибору', () => {
    for (const r of RUNS) {
      const mem = r.sim.journal.filter((e) => e.type === 'Memory');
      expect(mem.map((e) => e.ref).sort(), JSON.stringify(r.pick)).toEqual(chosen(r.pick));
      expect(new Set(mem.map((e) => e.commandId)).size).toBe(mem.length);
      for (const e of mem) expect(r.sim.game.processed[e.commandId]?.ok).toBe(true);
    }
  });

  it('№3 екран журналу (view-model): кожен запис Memory має текст journal.<факт> у uk', () => {
    for (const r of [RUNS[0], RUNS[31]] as Run[]) {
      const shown = storyOffer(r.sim, GAME_DEFS).offer.journal.filter((e) => e.type === 'Memory');
      expect(shown.length).toBe(chosen(r.pick).length);
      for (const e of shown) {
        expect(e.key).toMatch(/^journal\.[fm]\./);
        expect((uk as Record<string, string>)[e.key as string], e.key ?? '').toBeTruthy();
      }
    }
  });
});
