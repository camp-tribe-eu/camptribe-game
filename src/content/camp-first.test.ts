// GAME-183 · табір без ☰: сторожі (закон 1 — кожен вміє почервоніти, мутації нижче).
//  1) Повний шлях через табір справжнім ядром, випадкова прогулянка на фіксованих зернах: гравець у таборі робить усе ЛИШЕ тим, що дає мапа (розмова, об'єкти, вибір
//     у рамці, відповіді в розмові) — і в КОЖНОМУ досяжному стані табору панель ☰ (storyOffer у справжньому режимі mapFirst) пропонує 0 ходів сюжету, яких мапа не покриває,
//     а стрілка «Далі» веде до ЖИВОЇ цілі на мапі. Мутація: викинути один ключ покриття → панель знову показує кнопку → тест червоний.
//  2) Кожен крок квесту табору має об'єкт на мапі. Мутація: прибрати об'єкт із .tmj → червоний.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextCommandId, type Command } from '../core/commands';
import { seedRng, nextInt } from '../core/rng';
import { newSim, step, type SimState } from '../core/sim';
import quests from '../../content/quests.json';
import campMap from '../../public/maps/camp-lake.tmj?raw';
import { characterChoices, PANEL_VIEW, storyOffer, type StoryView } from '../view/story-offer';
import { storyMoves, liveSpot, spotMove } from './director';
import { CAMP_STEP_QUESTS, MAP_LOCATION, MAP_SPOTS, campStepProblems, mapKeyFor, npcLive, resolveSpot } from './map-first';
import type { Move } from './moves';
import { REQUESTS, liveRequestSpot } from './requests';
import { GAME_DEFS as DEFS } from './slice-defs';

// Мутація покриття: тест підміняє coveredKeys і викидає один ключ — сторож «панель без непокритих ходів» мусить це побачити.
const hoisted = vi.hoisted(() => ({ drop: null as string | null, noArrow: false }));
vi.mock('./map-first', async (orig) => {
  const m = await orig<typeof import('./map-first')>();
  return { ...m, nextTarget: (...a: Parameters<typeof m.nextTarget>) => (hoisted.noArrow ? null : m.nextTarget(...a)), coveredKeys: (sim: SimState, defs: Parameters<typeof m.coveredKeys>[1]) => (hoisted.drop === null ? m.coveredKeys(sim, defs) : new Set([...m.coveredKeys(sim, defs)].filter((k) => k !== hoisted.drop))) };
});
beforeEach(() => { hoisted.drop = null; hoisted.noArrow = false; });

const send = (sim: SimState, m: Move): SimState => step(sim, { kind: 'command', command: { ...m, commandId: nextCommandId(sim.game) } as Command }, { defs: DEFS });
const MAP_VIEW: StoryView = { mapFirst: true, trunk: false, near: null, backpack: [] };
const WAVE_TASKS = Object.values(DEFS.waves?.waves ?? {}).flatMap((w) => w.tasks.map((t) => `task.${t.id}`));
const MAP_OBJECTS = (JSON.parse(campMap) as { layers: { name: string; objects?: { name: string }[] }[] }).layers.find((l) => l.name === 'objects')?.objects?.map((o) => o.name) ?? [];

interface Walk { problems: string[]; ended: boolean; campStates: number; stepsSeen: Set<string>; choicesSeen: Set<string>; moveKinds: Set<string> }

/** Ходи, які гравець робить ногами на мапі локації, де стоїть (GAME-183: дім, крамниця, дорога, табір): те саме, що скаже сцена (main.ts actOnMap/talkOnMap) — без жодної кнопки ☰. Вибір (options) розкладено на окремі ходи. */
function campMapMoves(sim: SimState, seen: Walk): Move[] {
  const g = sim.game;
  const out: Move[] = [];
  const map = mapKeyFor(g.player?.locationId);
  if (map === 'camp') {
    if (npcLive(g, DEFS, 'npc.elise')) out.push({ type: 'Talk', npcId: 'npc.elise' });
    for (const name of [...WAVE_TASKS, 'obj.campfire', 'obj.litter']) {
      if (!liveSpot(sim, name, DEFS)) continue;
      const m = spotMove(sim, name);
      if (m) out.push(m);
    }
    for (const r of REQUESTS) for (const t of r.targets) if (liveRequestSpot(g, t.spot)) out.push({ type: 'Interact', targetId: t.spot });
  }
  for (const name of MAP_SPOTS[map] as readonly string[]) {
    if (name.startsWith('npc.')) { if (npcLive(g, DEFS, name)) out.push({ type: 'Talk', npcId: name }); continue; }
    if (name.startsWith('pack.') || name === 'obj.trunk') continue;   // пакування — сітка багажника, не крок сюжету (доводить packing.test)
    const r = resolveSpot(sim, DEFS, name);
    if (!r) continue;
    if (name.startsWith('step.')) seen.stepsSeen.add(`${map}:${name.slice(5)}`);
    if (r.options) { seen.choicesSeen.add(`${name}:${r.options.length}`); out.push(...r.options); } else if (r.moves[0]) out.push(r.moves[0]);
  }
  return out;
}

function walk(seed: number, steps: number, combo: number): Walk {
  const w: Walk = { problems: [], ended: false, campStates: 0, stepsSeen: new Set(), choicesSeen: new Set(), moveKinds: new Set() };
  let rng = seedRng(seed);
  const rnd = (n: number): number => { const r = nextInt(rng, n); rng = r.state; return r.value; };
  const choices = characterChoices(DEFS);
  let sim = send(newSim(seed, 3_000), (choices[combo % choices.length] as { intent: Move }).intent);
  const advancing = (m: Move): boolean => send(sim, m).game.quests !== sim.game.quests;
  for (let i = 0; i < steps && !sim.game.campaignEnded; i++) {
    for (const m of storyMoves(sim, DEFS)) sim = send(sim, m);
    const g = sim.game;
    const atCamp = g.player?.locationId === MAP_LOCATION.camp;
    const inMap = g.player !== null;
    let cands: Move[];
    if (inMap && g.dialogue === null) {
      w.campStates++;
      const { offer } = storyOffer(sim, DEFS, MAP_VIEW);
      // 1) панель у таборі: жодного ходу сюжету (усе дає мапа)
      for (const a of offer.actions) w.problems.push(`${i}: ☰ пропонує «${a.kind} ${a.key ?? ''}» у таборі (квести: ${Object.entries(g.quests).filter(([, q]) => q.status === 'active').map(([id]) => id).join(',')})`);
      // 2) стрілка «Далі» — на живу ціль на мапі, поки розділ іде
      const spot = offer.hint.nextSpot;
      const live = spot !== null && (spot.startsWith('npc.') ? npcLive(g, DEFS, spot) : liveSpot(sim, spot, DEFS));
      if (offer.stage === 'play' && !live) w.problems.push(`${i}: стрілка «Далі» (${String(offer.hint.next)} → ${String(spot)}) не веде до живої цілі в таборі; квести: ${Object.entries(g.quests).filter(([, q]) => q.status === 'active').map(([id, q]) => `${id}[${q.done.join('+')}]`).join(',')}; хвиля: ${g.wave?.active?.waveId ?? '-'}; предмети: ${Object.keys(g.inventory).join('+')}`);
      cands = campMapMoves(sim, w);
      // Авто в таборі лишає його: поки сюжет табору триває, виїжджаємо рідко (інакше прогулянка тікала б на дорогу й крок вогнища, вечір дня 2, не ставав би живим).
      const leaving = g.quests['CH1-D3-RETURN-001']?.status === 'active' || g.quests['CH1-D3-HOME-001']?.status === 'active';
      if (atCamp && !leaving && rnd(12) !== 0) { const stay = cands.filter((m) => m.type !== 'Visit'); if (stay.length > 0) cands = stay; }
    } else {
      // У розмовах і на екрані вибору героя: відповіді (у розмові їх показує рамка, не панель).
      const { offer, intents } = storyOffer(sim, DEFS, g.player ? MAP_VIEW : PANEL_VIEW);
      cands = (offer.dialogue ? offer.dialogue.answers : offer.actions).flatMap((a) => { const m = intents.get(a.id); return m ? [m] : []; });
    }
    if (cands.length === 0) { sim = step(sim, { kind: 'advance', minutes: 30 }, { defs: DEFS }); continue; }
    const adv = cands.filter(advancing);
    const pick = adv.length > 0 && rnd(10) < 8 ? adv[rnd(adv.length)] : cands[rnd(cands.length)];
    if (!pick) continue;
    w.moveKinds.add(pick.type);
    const before = sim;
    sim = send(sim, pick);
    if (sim === before) sim = step(sim, { kind: 'advance', minutes: 20 }, { defs: DEFS });
    else if (rnd(4) === 0) sim = step(sim, { kind: 'advance', minutes: 5 }, { defs: DEFS });
  }
  w.ended = sim.game.campaignEnded;
  return w;
}

const SEEDS = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26];

describe('GAME-183 · табір без ☰: панель не пропонує жодного ходу сюжету, стрілка веде до живої цілі', () => {
  it(`${SEEDS.length} зерен × усі профілі/транспорти: 0 непокритих ходів панелі в таборі, кінець розділу досяжний мапою`, () => {
    const all = SEEDS.map((s, i) => walk(s, 900, i));
    for (const [i, w] of all.entries()) expect(w.problems.slice(0, 5), `зерно ${SEEDS[i]}`).toEqual([]);
    expect(all.filter((w) => w.ended).length, 'хоч більшість прогулянок доходить до кінця розділу (не застрягли)').toBeGreaterThanOrEqual(Math.ceil(SEEDS.length * 0.75));
    const seen = new Set(all.flatMap((w) => [...w.stepsSeen]));
    // Прогулянка справді торкнулась кроків табору (інакше «0 проблем» нічого не доводить).
    for (const q of ['ST-005', 'CH1-D2-001', 'CH1-D2-ELISE-001', 'CH1-D2-CAMP-001', 'CH1-D2-FIRE-001', 'CH1-D3-001', 'CH1-D3-GEAR-001', 'CH1-D3-ELISE-001']) expect(seen.has(`camp:${q}`), `крок ${q} жодного разу не ставав живим об'єктом`).toBe(true);
    for (const q of ['road:ST-004', 'home:CH1-D3-HOME-001', 'shop:ST-003', 'home:ST-002']) expect(seen.has(q), `крок ${q} (дім/крамниця/дорога) жодного разу не ставав живим об'єктом`).toBe(true);
    expect(all.reduce((n, w) => n + w.campStates, 0)).toBeGreaterThan(600);
  }, 900_000);

  it('мутація: кожен викинутий ключ покриття повертає кнопку в панель — сторож червоніє', () => {
    for (const key of ['Talk|npc.elise', 'CompleteQuest|ST-004', 'CompleteQuest|ST-003', 'CompleteQuest|CH1-D3-HOME-001', 'CompleteQuest|ST-005', 'CompleteQuest|CH1-D3-GEAR-001', 'Visit|loc.road', 'CompleteQuest|CH1-D2-FIRE-001']) {
      hoisted.drop = key;
      const reds = SEEDS.map((s, i) => walk(s, 900, i)).flatMap((w) => w.problems);
      expect(reds.length, `без ключа ${key} сторож лишився зеленим — він сліпий`).toBeGreaterThan(0);
    }
  }, 1_800_000);

  it('мутація: стрілка «Далі» зникла (nextTarget → null) — сторож «стрілка веде до живої цілі» червоніє', () => {
    hoisted.noArrow = true;
    const reds = SEEDS.slice(0, 4).map((s, i) => walk(s, 900, i)).flatMap((w) => w.problems);
    expect(reds.filter((r) => r.includes('стрілка')).length, 'без стрілки сторож лишився зеленим — він сліпий').toBeGreaterThan(0);
  }, 600_000);
});

describe('GAME-183 · кожен крок квесту табору має місце на мапі', () => {
  const list = quests as { id: string; locationId?: string }[];
  it('content/quests.json ↔ MAP_SPOTS.camp ↔ camp-lake.tmj: порожньо', () => {
    expect(campStepProblems(list, MAP_SPOTS.camp, MAP_OBJECTS)).toEqual([]);
    expect(CAMP_STEP_QUESTS.length).toBeGreaterThanOrEqual(10);
  });
  it('мутація: об\'єкт прибрано з .tmj → NO/NOT_ON_MAP; квест без кроку → NO_CAMP_SPOT; зайвий крок → ORPHAN', () => {
    expect(campStepProblems(list, MAP_SPOTS.camp, MAP_OBJECTS.filter((n) => n !== 'step.CH1-D3-GEAR-001')).join()).toContain('CAMP_SPOT_NOT_ON_MAP CH1-D3-GEAR-001');
    expect(campStepProblems(list, (MAP_SPOTS.camp as readonly string[]).filter((n) => n !== 'step.CH1-D2-CAMP-001'), MAP_OBJECTS).join()).toContain('NO_CAMP_SPOT CH1-D2-CAMP-001');
    expect(campStepProblems(list, [...MAP_SPOTS.camp, 'step.CH1-NOPE'], [...MAP_OBJECTS, 'step.CH1-NOPE']).join()).toContain('CAMP_SPOT_ORPHAN step.CH1-NOPE');
    expect(campStepProblems([...list, { id: 'CH1-D4-NEW', locationId: MAP_LOCATION.camp }], MAP_SPOTS.camp, MAP_OBJECTS).join()).toContain('NO_CAMP_SPOT CH1-D4-NEW');
  });
});
