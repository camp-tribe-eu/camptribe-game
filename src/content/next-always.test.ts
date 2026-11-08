// GAME-174 · «Що далі?»: гравець на мапі ЗАВЖДИ бачить наступний крок. Сторож (закон 1 — червоніє мутаціями нижче).
// Перебір: випадкові прогулянки справжнім ядром на фіксованих зернах (той самий рух, що в camp-first.test: гравець робить лише те, що дає мапа й розмова).
// У КОЖНОМУ досяжному стані на мапі (не розмова, не кінець розділу) мусить бути: (1) нотатник має підсвічений відкритий пункт — його «Далі» бачить гравець
// (мапа-перша гра ховає нижній рядок «Далі», нотатник — і є рядок); (2) підказка nextTarget не порожня і веде до ЖИВОГО об'єкта цієї ж мапи (чи виходу — авто).
// Запасний шлях (панель «Подорож» сама / ☰ пульсує) не потрібен, доки стан без підказки недосяжний — саме це й доводить сторож.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextCommandId, type Command } from '../core/commands';
import { seedRng, nextInt } from '../core/rng';
import { newSim, step, type SimState } from '../core/sim';
import { agendaOf } from './agenda';
import { characterChoices, storyOffer, type StoryView } from '../view/story-offer';
import { storyMoves, liveSpot, spotMove } from './director';
import { MAP_LOCATION, MAP_SPOTS, mapKeyFor, nextTarget, npcLive, resolveSpot } from './map-first';
import type { Move } from './moves';
import { REQUESTS, liveRequestSpot } from './requests';
import { GAME_DEFS as DEFS } from './slice-defs';

// Мутація: nextTarget мовчить — або скрізь, або лише поки активний один квест (один крок).
const hoisted = vi.hoisted(() => ({ nullAll: false, nullQuest: null as string | null }));
vi.mock('./map-first', async (orig) => {
  const m = await orig<typeof import('./map-first')>();
  return {
    ...m,
    nextTarget: (...a: Parameters<typeof m.nextTarget>) => {
      if (hoisted.nullAll) return null;
      if (hoisted.nullQuest !== null && a[0].game.quests[hoisted.nullQuest]?.status === 'active') return null;
      return m.nextTarget(...a);
    },
  };
});
beforeEach(() => { hoisted.nullAll = false; hoisted.nullQuest = null; });

const send = (sim: SimState, m: Move): SimState => step(sim, { kind: 'command', command: { ...m, commandId: nextCommandId(sim.game) } as Command }, { defs: DEFS });
const MAP_VIEW: StoryView = { mapFirst: true, trunk: false, near: null, backpack: [] };
const WAVE_TASKS = Object.values(DEFS.waves?.waves ?? {}).flatMap((w) => w.tasks.map((t) => `task.${t.id}`));

interface Res { problems: string[]; states: number; byMap: Record<string, number>; quests: Set<string> }

function moves(sim: SimState): Move[] {
  const g = sim.game;
  const out: Move[] = [];
  const map = mapKeyFor(g.player?.locationId);
  if (map === 'camp') {
    if (npcLive(g, DEFS, 'npc.elise')) out.push({ type: 'Talk', npcId: 'npc.elise' });
    for (const name of [...WAVE_TASKS, 'obj.campfire', 'obj.litter']) { if (!liveSpot(sim, name, DEFS)) continue; const m = spotMove(sim, name); if (m) out.push(m); }
    for (const r of REQUESTS) for (const t of r.targets) if (liveRequestSpot(g, t.spot)) out.push({ type: 'Interact', targetId: t.spot });
  }
  for (const name of MAP_SPOTS[map] as readonly string[]) {
    if (name.startsWith('npc.')) { if (npcLive(g, DEFS, name)) out.push({ type: 'Talk', npcId: name }); continue; }
    if (name.startsWith('pack.') || name === 'obj.trunk') continue;
    const r = resolveSpot(sim, DEFS, name);
    if (!r) continue;
    if (r.options) out.push(...r.options); else if (r.moves[0]) out.push(r.moves[0]);
  }
  return out;
}

function walk(seed: number, steps: number, combo: number): Res {
  const res: Res = { problems: [], states: 0, byMap: {}, quests: new Set() };
  let rng = seedRng(seed);
  const rnd = (n: number): number => { const r = nextInt(rng, n); rng = r.state; return r.value; };
  const choices = characterChoices(DEFS);
  let sim = send(newSim(seed, 3_000), (choices[combo % choices.length] as { intent: Move }).intent);
  const advancing = (m: Move): boolean => send(sim, m).game.quests !== sim.game.quests;
  for (let i = 0; i < steps && !sim.game.campaignEnded; i++) {
    for (const m of storyMoves(sim, DEFS)) sim = send(sim, m);
    const g = sim.game;
    let cands: Move[];
    if (g.player !== null && g.dialogue === null) {
      const { offer } = storyOffer(sim, DEFS, MAP_VIEW);
      if (offer.stage === 'play') {
        res.states++;
        const map = mapKeyFor(g.player.locationId);
        res.byMap[map] = (res.byMap[map] ?? 0) + 1;
        const act = Object.entries(g.quests).filter(([, q]) => q.status === 'active').map(([id]) => id);
        for (const q of act) res.quests.add(q);
        const ctx = `${i}: ${map}; квести: ${act.join(',')}; хвиля: ${g.wave?.active?.waveId ?? '-'}`;
        const cur = agendaOf(sim, DEFS)?.items.find((x) => x.current && !x.done);
        if (!cur) res.problems.push(`${ctx} — у нотатнику немає підсвіченого пункту «Далі»`);
        const n = nextTarget(sim, DEFS);
        const spot = offer.hint.nextSpot;
        if (!n || !offer.hint.next) res.problems.push(`${ctx} — підказки «Далі» немає`);
        else if (spot === null) res.problems.push(`${ctx} — «${n.key}» без об'єкта`);
        else {
          const live = spot.startsWith('npc.') ? npcLive(g, DEFS, spot) : liveSpot(sim, spot, DEFS);
          const here = spot.startsWith('npc.') || spot.startsWith('obj.') || (MAP_SPOTS[map] as readonly string[]).includes(spot) || WAVE_TASKS.includes(spot) || spot.startsWith('req.') || REQUESTS.some((r) => r.targets.some((t) => t.spot === spot));
          if (!live) res.problems.push(`${ctx} — «${n.key}» → ${spot} мертвий`);
          else if (!here) res.problems.push(`${ctx} — «${n.key}» → ${spot} не на мапі ${map}`);
        }
      }
      cands = moves(sim);
      const leaving = g.quests['CH1-D3-RETURN-001']?.status === 'active' || g.quests['CH1-D3-HOME-001']?.status === 'active';
      if (g.player.locationId === MAP_LOCATION.camp && !leaving && rnd(12) !== 0) { const stay = cands.filter((m) => m.type !== 'Visit'); if (stay.length > 0) cands = stay; }
    } else {
      const { offer, intents } = storyOffer(sim, DEFS, MAP_VIEW);
      cands = (offer.dialogue ? offer.dialogue.answers : offer.actions).flatMap((a) => { const m = intents.get(a.id); return m ? [m] : []; });
    }
    if (cands.length === 0) { sim = step(sim, { kind: 'advance', minutes: 30 }, { defs: DEFS }); continue; }
    const adv = cands.filter(advancing);
    const pick = adv.length > 0 && rnd(10) < 8 ? adv[rnd(adv.length)] : cands[rnd(cands.length)];
    if (!pick) continue;
    const before = sim;
    sim = send(sim, pick);
    if (sim === before) sim = step(sim, { kind: 'advance', minutes: 20 }, { defs: DEFS });
    else if (rnd(4) === 0) sim = step(sim, { kind: 'advance', minutes: 5 }, { defs: DEFS });
  }
  return res;
}

const SEEDS = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
const run = (n = SEEDS.length): Res[] => SEEDS.slice(0, n).map((s, i) => walk(s, 800, i));

describe('GAME-174 · жодного стану розділу 1 без видимого наступного кроку', () => {
  it(`${SEEDS.length} зерен × профілі/транспорти: у кожному стані на мапі є «Далі» з живою ціллю на цій мапі`, () => {
    const all = run();
    for (const [i, r] of all.entries()) expect(r.problems.slice(0, 5), `зерно ${SEEDS[i]}`).toEqual([]);
    const states = all.reduce((n, r) => n + r.states, 0);
    const maps = new Set(all.flatMap((r) => Object.keys(r.byMap)));
    const quests = new Set(all.flatMap((r) => [...r.quests]));
    // Перебір справді обійшов усі мапи й головні кроки (інакше «0 проблем» нічого не доводить).
    for (const m of ['home', 'shop', 'road', 'camp']) expect(maps.has(m), `мапа ${m} не відвідана`).toBe(true);
    for (const q of ['PROLOGUE-HOME-001', 'ST-001', 'ST-002', 'ST-003', 'CH1-HOME-001', 'ST-004', 'ST-005', 'CH1-D2-001', 'CH1-D2-FIRE-001', 'CH1-D3-001']) expect(quests.has(q), `крок ${q} не зустрівся`).toBe(true);
    expect(states, 'перевірено станів').toBeGreaterThan(500);
    console.info(`GAME-174: перевірено станів ${states}; за мапами ${JSON.stringify(all.reduce<Record<string, number>>((a, r) => { for (const [k, v] of Object.entries(r.byMap)) a[k] = (a[k] ?? 0) + v; return a; }, {}))}`);
  }, 900_000);

  it('мутація: nextTarget мовчить скрізь — сторож червоніє', () => {
    hoisted.nullAll = true;
    const reds = run(3).flatMap((r) => r.problems);
    expect(reds.length, 'без підказки сторож лишився зеленим — він сліпий').toBeGreaterThan(0);
    expect(reds.some((p) => p.includes('підказки «Далі» немає'))).toBe(true);
  }, 600_000);

  it('мутація: nextTarget мовчить на ОДНОМУ кроці — сторож червоніє саме там', () => {
    for (const q of ['ST-003', 'CH1-HOME-001', 'ST-005', 'CH1-D2-FIRE-001']) {
      hoisted.nullQuest = q;
      const reds = run().flatMap((r) => r.problems);
      expect(reds.some((p) => p.includes(q)), `без підказки на кроці ${q} сторож лишився зеленим`).toBe(true);
    }
  }, 1_800_000);
});
