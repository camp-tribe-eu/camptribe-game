// GAME-180 · прохання сусідів: дані ↔ мапа ↔ діалоги ↔ ядро. Повний шлях кожного з п'яти прохань на справжньому ядрі (розмова → «Беруся» → цілі → здача → журнал),
// відмова без наслідків, дані мапи й текстів, правила трекера/стрілки/«!». Негативні контролі в кінці (мутації, що мусять червоніти).
import { FISH_FACTS } from './fish-fork';
import { describe, expect, it } from 'vitest';
import { dispatch, type Command } from '../core/commands';
import { initialState, type GameState } from '../core/state';
import { newSim, step, type SimState } from '../core/sim';
import { SKILL_IDS } from '../core/skills';
import uk from '../../content/locales/uk.json';
import en from '../../content/locales/en.json';
import flagsJson from '../../content/flags.json';
import { exploreView, type Move } from './moves';
import { GAME_DEFS } from './slice-defs';
import { CONTENT, STORY } from './story';
import mapRaw from '../../public/maps/camp-lake.tmj?raw';
import { REQUESTS, REQUEST_FLAG_PREFIX, miaSpots, compileRequests, liveRequestSpot, requestFlag, requestMarker, requestOf, requestReward, requestStatus, requestTarget, requestsDone, trackerRows, type RequestDef } from './requests';
import { liveSpot } from './director';
import { storyOffer } from '../view/story-offer';
import { STICKER_DEFS } from './stickers';

let n = 0;
const send = (s: GameState, m: Move) => dispatch(s, { ...m, commandId: `rq${n++}` } as Command, GAME_DEFS);
function play(moves: readonly Move[], from: GameState): GameState {
  let s = from;
  for (const m of moves) {
    const r = send(s, m);
    if (!r.ok) throw new Error(`${m.type} ${JSON.stringify(m)} → ${r.code}`);
    s = r.state;
  }
  return s;
}
const TO_CAMP: readonly Move[] = [
  { type: 'CreateCharacter', profileId: 'profile.solo-explorer', transportId: 'transport.bike' } as Move,
  { type: 'CompleteQuest', questId: 'PROLOGUE-HOME-001' }, { type: 'CompleteQuest', questId: 'ST-001' }, { type: 'CompleteQuest', questId: 'ST-002' },
  { type: 'Visit', locationId: 'loc.shop' }, { type: 'Pickup', itemId: 'item.tent' }, { type: 'Pickup', itemId: 'item.sleeping-bag' },
  { type: 'CompleteQuest', questId: 'ST-003' }, { type: 'Visit', locationId: 'loc.home' }, { type: 'CompleteQuest', questId: 'CH1-HOME-001' },
  { type: 'Visit', locationId: 'loc.road' }, { type: 'CompleteQuest', questId: 'ST-004' }, { type: 'Visit', locationId: 'loc.camp.lake' },
];
const atCamp = (): GameState => play(TO_CAMP, initialState(5_000));

/** Вибори вузла з сирого контенту (там є textKey; ядру вони не потрібні). */
const choicesOf = (dialogueId: string, node: string): { textKey: string }[] =>
  ((CONTENT.dialogues.find((d) => d.id === dialogueId)?.nodes ?? []) as unknown as { id: string; choices?: { textKey: string }[] }[]).find((x) => x.id === node)?.choices ?? [];

/** Крок розмови: 'n' — «Далі»; інакше — вибір, чий textKey закінчується на цей рядок (вузол визначає сам). */
function say(from: GameState, npcId: string, steps: readonly string[]): GameState {
  let s = play([{ type: 'Talk', npcId }], from);
  for (const st of steps) {
    const d = s.dialogue;
    if (!d) throw new Error(`розмова скінчилась до кроку ${st}`);
    const node = STORY.dialogues[d.id]?.nodes[d.node];
    if (st === 'n') { s = play([{ type: 'Continue' }], s); continue; }
    const idx = choicesOf(d.id, d.node).findIndex((c) => c.textKey.endsWith(st));
    if (idx < 0 || !node) throw new Error(`у вузлі ${d.node} немає вибору ${st}`);
    s = play([{ type: 'Choose', choice: idx }], s);
  }
  return s;
}
const finish = (s: GameState): GameState => { let t = s; for (let i = 0; i < 10 && t.dialogue; i++) t = play([{ type: 'Continue' }], t); return t; };
const touch = (s: GameState, spot: string): GameState => play([{ type: 'Interact', targetId: spot }], s);

const MAP = JSON.parse(mapRaw) as { layers: { name: string; objects?: { name: string; type?: string }[] }[] };
const MAP_NAMES = new Set((MAP.layers.find((l) => l.name === 'objects')?.objects ?? []).filter((o) => o.type === 'trigger' || o.type === 'npc').map((o) => o.name));
const LOC = uk as Record<string, string>;
const LOC_EN = en as Record<string, string>;

/** Репліка просильника в розмові: що саме клікає гравець (кінець ланцюжка — подяка). */
const PATH: Record<string, { offer: readonly string[]; turnin: readonly string[] }> = {
  'req.nora-shore': { offer: ['n', 'offer.c1', 'n'], turnin: ['n', 'turnin.c1', 'n'] },
  'req.ingrid-birds': { offer: ['n', 'offer.c1', 'n'], turnin: ['n', 'turnin.c1', 'n'] },
  'req.luc-chain': { offer: ['n', 'offer.c1', 'n'], turnin: ['n', 'turnin.c1', 'n'] },
  'req.sarah-snack': { offer: ['n', 'offer.c1', 'n'], turnin: ['n', 'turnin.c1', 'n'] },
  'req.elise-lantern': { offer: ['hello.req0', 'n', 'offer.c1', 'n'], turnin: ['hello.req0', 'n', 'turnin.c1', 'n'] },
  // GAME-184 · продовження арок (after): пропозиція offer2, здача turnin2 (у Інгрід — сцена біля вогнища: «Ходімо» → два «Далі» → «Назвемо його Мія|Метью»; у Нори перед здачею — рядок found-mia|found-bag)
  'req.nora-camera': { offer: ['n', 'offer2.c1', 'n'], turnin: ['n', 'n', 'n', 'turnin2.c1', 'n'] },   // gate → found → found-mia|found-bag → turnin2
  'req.ingrid-starmap': { offer: ['n', 'offer2.c1', 'n'], turnin: ['n', 'turnin2.c1', 'n', 'n', '.c1', 'n'] },
  'req.luc-radio': { offer: ['n', 'offer2.c1', 'n'], turnin: ['n', 'turnin2.c1', 'n'] },
};
/** Перше (без `after`) прохання арки — і кроки, що ведуть до продовження (GAME-184). */
const FIRSTS = REQUESTS.filter((r) => r.after === undefined);
const FOLLOWS = REQUESTS.filter((r) => r.after !== undefined);
/** Пройти прохання повністю на ядрі (розмова, цілі, здача): стан після здачі. */
function complete(from: GameState, r: RequestDef): GameState {
  const p = PATH[r.id] as { offer: readonly string[]; turnin: readonly string[] };
  let s = finish(say(from, r.giver, p.offer));
  for (const t of r.targets) s = touch(s, t.spot);
  return finish(say(s, r.giver, p.turnin));
}

describe('GAME-180 · дані прохань', () => {
  it('вісім прохань: п’ять сусідів (Нора, Інгрід, Люк, Еліза, Сара) і три продовження арок (GAME-184); кожне — просильник, ≥ 1 ціль, нагорода-гачок для GAME-181', () => {
    expect(REQUESTS.map((r) => r.giver).sort()).toEqual(['npc.elise', 'npc.ingrid', 'npc.ingrid', 'npc.luc', 'npc.luc', 'npc.nora', 'npc.nora', 'npc.sarah']);
    expect(FOLLOWS.map((r) => [r.id, r.after])).toEqual([['req.nora-camera', 'req.nora-shore'], ['req.ingrid-starmap', 'req.ingrid-birds'], ['req.luc-radio', 'req.luc-chain']]);
    for (const r of FOLLOWS) expect(REQUESTS.find((x) => x.id === r.after)?.giver, `${r.id}: after — того ж просильника`).toBe(r.giver);
    for (const r of REQUESTS) {
      expect(STORY.npcs[r.giver], r.id).toBeDefined();
      expect(r.targets.length, r.id).toBeGreaterThanOrEqual(1);
      expect(r.reward.xp).toBeGreaterThan(0);
      expect(r.reward.om).toBeGreaterThan(0);
      for (const s of r.reward.skills) expect(SKILL_IDS as readonly string[]).toContain(s);
      expect(requestReward(r.id)).toEqual(r.reward);
    }
    expect(REQUESTS.find((r) => r.id === 'req.nora-shore')?.targets).toHaveLength(3);
  });

  it('кожна ціль — об’єкт мапи табору і взаємодія ядра; кожен прапорець у реєстрі; здано → запис журналу в сюжеті', () => {
    const regs = new Set((flagsJson as { id: string }[]).map((f) => f.id));
    for (const r of REQUESTS) {
      for (const t of r.targets) {
        expect(MAP_NAMES.has(t.spot), `${t.spot} на мапі`).toBe(true);
        expect(GAME_DEFS.interactions[t.spot]?.flags, t.spot).toEqual([t.flag]);
        expect(regs.has(t.flag), t.flag).toBe(true);
      }
      expect(regs.has(r.takenFlag) && regs.has(r.doneFlag), r.id).toBe(true);
      expect(STORY.journaled).toContain(r.doneFlag);
    }
    // GAME-195: у тому ж списку косметичних прапорців — чотири факти розвилки рибки; прохання рахуємо окремо.
    const fish: string[] = [FISH_FACTS.kept, FISH_FACTS.released, FISH_FACTS.charred, FISH_FACTS.trustNora];
    expect(STORY.requestFlags).toEqual(expect.arrayContaining(fish));
    expect(STORY.requestFlags?.filter((f) => !fish.includes(f)).length).toBe(REQUESTS.reduce((a, r) => a + r.targets.length + 2, 0));
  });

  it('тексти: усі ключі є в uk й en, кожен рядок ≤ 140 знаків (телефон)', () => {
    for (const r of REQUESTS) {
      const keys = [r.titleKey, r.goalKey, r.trackKey, ...r.targets.map((t) => t.labelKey), `journal.${r.doneFlag}`];
      const dlg = Object.keys(LOC).filter((k) => k.startsWith(`dlg.${r.giver.replace('npc.', '')}-`) || k.startsWith('dlg.elise-greeting.'));
      for (const k of [...keys, ...dlg.filter((x) => /\.(gate|offer|accepted|later|reminder|turnin|closing|offer2|accepted2|later2|reminder2|turnin2|closing2|sky\d)(\.c\d)?$|hello\.req0$|\.req$/.test(x))]) {
        for (const [lang, t] of [['uk', LOC], ['en', LOC_EN]] as const) {
          expect(typeof t[k] === 'string' && (t[k] as string).trim() !== '', `${lang}:${k}`).toBe(true);
          expect((t[k] as string).length, `${lang}:${k}`).toBeLessThanOrEqual(140);
        }
      }
    }
  });

  it('прапорці — сімейство f.req-*, косметичні для сюжету: перебір їх не розрізняє', () => {
    for (const r of REQUESTS) for (const f of [r.takenFlag, r.doneFlag, ...r.targets.map((t) => t.flag)]) expect(f.startsWith(REQUEST_FLAG_PREFIX), f).toBe(true);
    const a = atCamp();
    const b = { ...a, flags: [...a.flags, 'f.req-nora-shore-taken'].sort() };
    expect(JSON.stringify(exploreView(a, STORY))).toBe(JSON.stringify(exploreView(b, STORY)));
    // дотик до цілі видає разову нагороду (grantId rw.req-…) — теж не розрізняється; чужі нагороди розрізняються
    const touched = { ...b, grants: [...b.grants, 'rw.req-nora-shore-t1'].sort() };
    expect(JSON.stringify(exploreView(touched, STORY))).toBe(JSON.stringify(exploreView(b, STORY)));
    expect(JSON.stringify(exploreView({ ...b, grants: [...b.grants, 'rw.other'].sort() }, STORY)), 'чужа нагорода ключ розрізняє').not.toBe(JSON.stringify(exploreView(b, STORY)));
    // контроль: без списку прапорців прохань ключ розрізнявся б — сторож не сліпий
    const noList = { ...STORY, requestFlags: [] };
    expect(JSON.stringify(exploreView(a, noList))).not.toBe(JSON.stringify(exploreView(b, noList)));
  });
});

describe('GAME-180 · повний шлях кожного прохання на ядрі', () => {
  for (const r of FIRSTS) {
    it(`${r.id}: «!» → розмова → «Беруся» → ${r.targets.length} ціл. → здача → подяка → журнал`, () => {
      const p = PATH[r.id] as { offer: readonly string[]; turnin: readonly string[] };
      let s = atCamp();
      expect(requestStatus(s.flags, r)).toBe('available');
      expect(requestMarker(s, r.giver), '«!» є до розмови').toBe(true);
      expect(trackerRows(s)).toEqual([]);
      s = finish(say(s, r.giver, p.offer));
      expect(s.flags).toContain(r.takenFlag);
      expect(requestStatus(s.flags, r)).toBe('active');
      expect(requestMarker(s, r.giver), 'взяте — без «!»').toBe(false);
      expect(trackerRows(s)).toEqual([{ id: r.id, trackKey: r.trackKey, done: 0, total: r.targets.length, ready: false }]);
      for (const [i, t] of r.targets.entries()) {
        expect(requestTarget(s), 'стрілка веде до наступної цілі').toBe(t.spot);
        expect(liveRequestSpot(s, t.spot)).toBe(true);
        s = touch(s, t.spot);
        expect(liveRequestSpot(s, t.spot), 'зроблена ціль зникає').toBe(false);
        expect(trackerRows(s)[0]?.done).toBe(i + 1);
        expect(send(s, { type: 'Interact', targetId: t.spot }).ok, 'повторний дотик — відмова ядра, нагорода раз').toBe(false);
      }
      expect(requestStatus(s.flags, r)).toBe('ready');
      expect(requestTarget(s), 'усе зроблено — до просильника').toBe(r.giver);
      expect(requestMarker(s, r.giver), 'здати — «!»').toBe(true);
      s = finish(say(s, r.giver, p.turnin));
      expect(s.flags).toContain(r.doneFlag);
      expect(requestStatus(s.flags, r)).toBe('done');
      expect(trackerRows(s)).toEqual([]);
      expect(requestTarget(s)).toBeNull();
      expect(requestMarker(s, r.giver), 'після першого прохання «!» лишається, якщо в арці є продовження (GAME-184)').toBe(FOLLOWS.some((f) => f.after === r.id));
      expect(requestsDone(s)).toBe(1);
    });
  }

  for (const r of FOLLOWS) {
    it(`GAME-184 ${r.id}: заблоковане до здачі ${r.after}; після неї — «!», «Беруся», ${r.targets.length} ціл., здача, наклейка-умова, нагорода раз`, () => {
      const first = REQUESTS.find((x) => x.id === r.after) as RequestDef;
      const p = PATH[r.id] as { offer: readonly string[]; turnin: readonly string[] };
      const s0 = atCamp();
      expect(requestStatus(s0.flags, r), 'до першого прохання — заблоковане').toBe('locked');
      expect(requestOf(r.giver, REQUESTS, s0.flags)?.id, 'поточне прохання просильника — перше').toBe(first.id);
      for (const t of r.targets) expect(liveRequestSpot(s0, t.spot), 'цілі продовження неживі').toBe(false);
      let s = complete(s0, first);
      expect(requestStatus(s.flags, r)).toBe('available');
      expect(requestOf(r.giver, REQUESTS, s.flags)?.id).toBe(r.id);
      expect(requestMarker(s, r.giver), '«!» повертається — продовження відкрилось').toBe(true);
      expect(trackerRows(s)).toEqual([]);
      // «Пізніше» продовження — без наслідків
      const later = finish(say(s, r.giver, ['n', 'offer2.c2', 'n']));
      expect(later.flags).toEqual(s.flags);
      expect(requestMarker(later, r.giver)).toBe(true);
      s = finish(say(s, r.giver, p.offer));
      expect(s.flags).toContain(r.takenFlag);
      expect(trackerRows(s)).toEqual([{ id: r.id, trackKey: r.trackKey, done: 0, total: r.targets.length, ready: false }]);
      for (const [i, t] of r.targets.entries()) {
        expect(requestTarget(s)).toBe(t.spot);
        expect(liveRequestSpot(s, t.spot)).toBe(true);
        s = touch(s, t.spot);
        expect(trackerRows(s)[0]?.done).toBe(i + 1);
      }
      expect(requestTarget(s), 'усе зроблено — до просильника').toBe(r.giver);
      const xp = s.progress?.xp ?? 0;
      s = finish(say(s, r.giver, p.turnin));
      expect(s.flags).toContain(r.doneFlag);
      expect(s.progress?.xp, 'нагорода rw.<прохання> — раз').toBe(xp + r.reward.xp);
      expect(s.progress?.keys).toContain(`rw.${r.id}`);
      expect(requestMarker(s, r.giver), 'арка закрита — «!» зникає').toBe(false);
      expect(trackerRows(s)).toEqual([]);
      // наклейка Атласу за історію: умова — прапорець «здано»; ядро видає її при здачі
      const sticker = Object.entries(STICKER_DEFS).find(([, d]) => JSON.stringify(d.cond) === JSON.stringify({ flag: r.doneFlag }))?.[0];
      expect(sticker, `наклейка Атласу за ${r.id}`).toBeDefined();
      expect(s.stickers, 'наклейка в альбомі після здачі').toContain(sticker);
    });
  }

  it('цілі неживі, поки прохання не взято; здача без усіх цілей неможлива (розмова веде в нагадування, а не в подяку)', () => {
    const r = requestOf('npc.nora') as RequestDef;
    const s0 = atCamp();
    for (const t of r.targets) expect(liveRequestSpot(s0, t.spot)).toBe(false);
    const taken = finish(say(s0, r.giver, ['n', 'offer.c1', 'n']));
    const part = touch(taken, (r.targets[0] as { spot: string }).spot);
    const t = play([{ type: 'Talk', npcId: r.giver }], part);
    expect(t.dialogue?.node, 'гілка gate веде в нагадування').toBe('gate');
    const after = play([{ type: 'Continue' }], t);
    expect(after.dialogue?.node).toBe('reminder');
  });

  it('GAME-181: здача видає rw.<прохання> (15 XP, 10 ОМ, практика навичок) рівно раз; повторна здача чи перезавантаження — 0', () => {
    const r = requestOf('npc.luc') as RequestDef;
    const p = PATH[r.id] as { offer: readonly string[]; turnin: readonly string[] };
    let s = finish(say(atCamp(), r.giver, p.offer));
    s = touch(s, (r.targets[0] as { spot: string }).spot);
    const before = { xp: s.progress?.xp ?? 0, om: s.progress?.om ?? 0, mech: s.skills['skill.mechanics'] ?? 0 };
    const ready = s;
    s = finish(say(s, r.giver, p.turnin));
    expect(s.progress?.xp).toBe(before.xp + r.reward.xp);
    expect(s.progress?.om).toBe(before.om + r.reward.om);
    expect(s.progress?.keys).toContain('rw.req.luc-chain');
    expect(s.skills['skill.mechanics'], 'практика навички').toBeGreaterThan(before.mech);
    // «Перезабрати»: прапорець здачі знято, а ключ нагороди лишився (як після завантаження старого стану) — друга здача нічого не дає
    const again = finish(say({ ...ready, ...(s.progress ? { progress: s.progress } : {}), skills: s.skills, practice: s.practice }, r.giver, p.turnin));
    expect(again.progress?.xp).toBe(s.progress?.xp);
    expect(again.progress?.om).toBe(s.progress?.om);
    expect(again.practice['rw.req.luc-chain'], 'практика за прохання — раз').toBe(s.practice['rw.req.luc-chain']);
  });

  it('«Пізніше» — без наслідків і без штрафу: жодного прапорця, «!» лишається, пропозиція повертається', () => {
    for (const r of FIRSTS) {
      const p = PATH[r.id] as { offer: readonly string[] };
      const before = atCamp();
      const pre = p.offer.slice(0, p.offer.indexOf('offer.c1'));
      const later = finish(say(before, r.giver, [...pre, 'offer.c2', 'n']));
      expect(later.flags, r.id).toEqual(before.flags);
      expect(later.moneyCents).toBe(before.moneyCents);
      expect(requestMarker(later, r.giver)).toBe(true);
      expect(trackerRows(later)).toEqual([]);
      const again = say(later, r.giver, pre);
      expect(again.dialogue?.node, 'пропозиція знову').toBe('offer');
    }
  });

  it('після здачі всієї арки просильник просто розмовляє (гілка «звичайна балачка»), нову пропозицію не робить; а після першого прохання пропонує продовження', () => {
    const r = requestOf('npc.luc') as RequestDef;
    const afterFirst = complete(atCamp(), r);
    expect(play([{ type: 'Talk', npcId: r.giver }, { type: 'Continue' }], afterFirst).dialogue?.node, 'продовження арки').toBe('offer2');
    const s = complete(afterFirst, REQUESTS.find((x) => x.after === r.id) as RequestDef);
    const t = play([{ type: 'Talk', npcId: r.giver }, { type: 'Continue' }], s);
    expect(t.dialogue?.node).toBe('hello');
  });

  it('запис у журналі: здача пише «Memory» з прапорцем «здано» (і лише вона)', () => {
    const r = requestOf('npc.ingrid') as RequestDef;
    let sim: SimState = newSim(7, 5_000);
    const ctx = { defs: GAME_DEFS };
    const run = (m: Move): void => { sim = step(sim, { kind: 'command', command: { ...m, commandId: `jr${n++}` } as Command }, ctx); };
    for (const m of TO_CAMP) run(m);
    const dialogue = (steps: readonly string[]): void => {
      run({ type: 'Talk', npcId: r.giver });
      for (const st of steps) {
        const d = sim.game.dialogue;
        if (!d) break;
        if (st === 'n') { run({ type: 'Continue' }); continue; }
        run({ type: 'Choose', choice: choicesOf(d.id, d.node).findIndex((c) => c.textKey.endsWith(st)) });
      }
      while (sim.game.dialogue) run({ type: 'Continue' });
    };
    dialogue(['n', 'offer.c1', 'n']);
    expect(sim.journal.filter((e) => e.type === 'Memory')).toHaveLength(0);
    run({ type: 'Interact', targetId: (r.targets[0] as { spot: string }).spot });
    dialogue(['n', 'turnin.c1', 'n']);
    expect(sim.journal.filter((e) => e.type === 'Memory').map((e) => e.ref)).toEqual([r.doneFlag]);
  });
});

/** GAME-184 · Мія в історіях: кожна комбінація герой × транспорт × тварина бачить когерентний варіант тієї самої історії. */
describe('GAME-184 · варіанти історій за твариною (Мія лише з кішкою)', () => {
  const COMBOS = [
    { label: 'велосипед, без кішки', profileId: 'profile.solo-explorer', transportId: 'transport.bike', animalId: undefined, cat: false },
    { label: 'авто, без кішки', profileId: 'profile.solo-explorer', transportId: 'transport.car', animalId: undefined, cat: false },
    { label: 'авто з кішкою', profileId: 'profile.family-teen', transportId: 'transport.car', animalId: 'animal.cat', cat: true },
  ] as const;
  const campAs = (c: (typeof COMBOS)[number]): GameState => play([{ type: 'CreateCharacter', profileId: c.profileId, transportId: c.transportId, ...(c.animalId ? { animalId: c.animalId } : {}) } as Move, ...TO_CAMP.slice(1)], initialState(5_000));
  const nodesOf = (from: GameState, npcId: string, maxSteps: number): string[] => {
    let s = play([{ type: 'Talk', npcId }], from); const seen: string[] = [];
    for (let i = 0; i < maxSteps && s.dialogue; i++) { seen.push(s.dialogue.node); const r = send(s, { type: 'Continue' }); if (!r.ok) break; s = r.state; }
    return seen;
  };
  for (const c of COMBOS) {
    it(`${c.label}: камера Нори — Мія лише з кішкою (спрайт-ціль miaSpots, репліка found-mia), інакше «рюкзак Метью»; історія та сама`, () => {
      const first = REQUESTS.find((r) => r.id === 'req.nora-shore') as RequestDef;
      const cam = REQUESTS.find((r) => r.id === 'req.nora-camera') as RequestDef;
      let s = complete(campAs(c), first);
      expect(miaSpots(s), 'до «Беруся» Мії біля цілі нема').toEqual([]);
      s = finish(say(s, cam.giver, (PATH[cam.id] as { offer: readonly string[] }).offer));
      expect(miaSpots(s), 'кішка є — Мія на місці цілі; нема — ніхто').toEqual(c.cat ? ['req.nora-camera.t1'] : []);
      s = touch(s, 'req.nora-camera.t1');
      expect(miaSpots(s), 'ціль зроблена — Мія вже не на ній').toEqual([]);
      expect(nodesOf(s, cam.giver, 4)).toEqual(['gate', 'found', c.cat ? 'found-mia' : 'found-bag', 'turnin2']);
      s = finish(say(s, cam.giver, (PATH[cam.id] as { turnin: readonly string[] }).turnin));
      expect(s.flags, 'та сама історія доходить до кінця').toContain(cam.doneFlag);
    });
    it(`${c.label}: зоряна карта — четверта частина: Мія з кішкою, інакше Метью; сцена біля вогнища та сама`, () => {
      const first = REQUESTS.find((r) => r.id === 'req.ingrid-birds') as RequestDef;
      const map = REQUESTS.find((r) => r.id === 'req.ingrid-starmap') as RequestDef;
      let s = complete(campAs(c), first);
      s = finish(say(s, map.giver, (PATH[map.id] as { offer: readonly string[] }).offer));
      expect(miaSpots(s)).toEqual(c.cat ? ['req.ingrid-starmap.t4'] : []);
      for (const t of map.targets) s = touch(s, t.spot);
      expect(miaSpots(s)).toEqual([]);
      s = say(s, map.giver, ['n', 'turnin2.c1', 'n', 'n']);   // gate → turnin2 → «Ходімо» → sky1 → sky2 → sky3-…
      expect(s.dialogue?.node, 'репліка про четверту частину залежить від кішки').toBe(c.cat ? 'sky3-mia' : 'sky3-matthew');
      s = finish(play([{ type: 'Choose', choice: 0 }], s));
      expect(s.flags, 'обидві гілки ставлять «здано»').toContain(map.doneFlag);
    });
  }
});

describe('GAME-180 · правила на ядрі й режисері', () => {
  it('ціль у director.liveSpot живе лише в таборі й поки прохання взято й ціль не зроблена; не в таборі — мовчить', () => {
    const r = requestOf('npc.luc') as RequestDef;
    const spot = (r.targets[0] as { spot: string }).spot;
    const s0 = newSim(7, 5_000);
    const camp = { ...s0, game: finish(say(atCamp(), r.giver, ['n', 'offer.c1', 'n'])) };
    expect(liveSpot(camp, spot)).toBe(true);
    expect(liveSpot({ ...camp, game: { ...camp.game, player: camp.game.player && { ...camp.game.player, locationId: 'loc.home' } } }, spot)).toBe(false);
    expect(liveSpot({ ...s0, game: atCamp() }, spot), 'прохання не взято').toBe(false);
  });

  it('перебір і бот не множаться просильниками: Нора, Люк, Інгрід, Сара — «лише побалакати» (ставлять лише f.req-*); вибір-хаб Елізи не пропонується; решта її виборів — як було', async () => {
    const { moves, chatOnlyNpcs } = await import('./moves');
    const chat = chatOnlyNpcs(STORY);
    for (const r of REQUESTS) expect(chat.has(r.giver), r.giver).toBe(r.giver !== 'npc.elise');
    const at = atCamp();
    expect(moves(at, GAME_DEFS).filter((m) => m.type === 'Talk').map((m) => (m as { npcId: string }).npcId), 'Еліза рухає квести — серед ходів').toContain('npc.elise');
    const talking = play([{ type: 'Talk', npcId: 'npc.elise' }], at);
    const hello = choicesOf('dlg.elise-greeting', 'hello');
    const hub = hello.findIndex((c) => c.textKey.endsWith('hello.req0'));
    expect(hub, 'хаб прохання є у вузлі').toBeGreaterThan(0);
    const offered = moves(talking, GAME_DEFS).filter((m) => m.type === 'Choose').map((m) => (m as { choice: number }).choice);
    expect(offered, 'хаб прохання не серед ходів перебору').not.toContain(hub);
    expect(offered.length).toBe(hello.length - 1);
  });

  it('меню й рамка розмови показують хаб прохання Елізи (інакше його не взяти): відповідь «Є щось, із чим допомогти?» є в знімку UI, а в перебору її нема', () => {
    const sim = { ...newSim(7, 5_000), game: play([{ type: 'Talk', npcId: 'npc.elise' }], atCamp()) };
    const view = { mapFirst: true, trunk: false, near: null, backpack: [] as string[] };
    const offer = storyOffer(sim, GAME_DEFS, view).offer;
    expect(offer.dialogue?.answers.some((a) => a.kind === 'choose' && a.key === 'dlg.elise-greeting.hello.req0'), 'хаб є у відповідях UI').toBe(true);
  });

  it('жодних тупиків у розмовах просильників: для КОЖНОЇ комбінації прапорців прохання розмова з кожним доходить до кінця (повний перебір вузлів і виборів на ядрі)', () => {
    for (const r of REQUESTS) {
      const names = [r.takenFlag, ...r.targets.map((t) => t.flag), r.doneFlag];
      for (let mask = 0; mask < 1 << names.length; mask++) {
        const base = atCamp();
        const pre = r.after === undefined ? [] : [(REQUESTS.find((x) => x.id === r.after) as RequestDef).doneFlag];   // продовження живе, лише коли перше здано — інакше вузли offer2/turnin2 не відвідати
        const s0 = { ...base, flags: [...base.flags, ...pre, ...names.filter((_, i) => (mask >> i) & 1)].sort() };
        // обхід: кожен стан розмови — кожна доступна відповідь; кінець — розмови немає. З КОЖНОГО вузла має бути шлях до кінця (не лише з першого).
        const edges = new Map<string, Set<string>>();
        const queue: GameState[] = [play([{ type: 'Talk', npcId: r.giver }], s0)];
        const keyOf = (s: GameState): string => (s.dialogue === null ? 'END' : `${s.dialogue.id}#${s.dialogue.node}`);
        for (let s = queue.shift(); s; s = queue.shift()) {
          if (s.dialogue === null || edges.has(keyOf(s))) continue;
          const out = new Set<string>();
          edges.set(keyOf(s), out);
          const node = (CONTENT.dialogues.find((d) => d.id === s.dialogue?.id)?.nodes ?? []) as unknown as { id: string; choices?: unknown[] }[];
          const outs: Move[] = [{ type: 'Continue' }, ...(node.find((x) => x.id === s.dialogue?.node)?.choices ?? []).map((_, i) => ({ type: 'Choose', choice: i }) as Move)];
          for (const m of outs) { const res = send(s, m); if (res.ok) { out.add(keyOf(res.state)); queue.push(res.state); } }
        }
        const escapes = new Set<string>(['END']);
        for (let grew = true; grew;) { grew = false; for (const [k, to] of edges) if (!escapes.has(k) && [...to].some((x) => escapes.has(x))) { escapes.add(k); grew = true; } }
        const stuck = [...edges.keys()].filter((k) => !escapes.has(k));
        expect(stuck, `${r.id} · прапорці ${mask}: вузли без виходу`).toEqual([]);
        expect(edges.size, `${r.id} · прапорці ${mask}`).toBeGreaterThan(0);
      }
    }
  });

  it('негативні контролі: ціль без об’єкта мапи, прохання без здачі, неповна здача — червоніють (дзеркало валідатора)', () => {
    const miss = compileRequests([{ id: 'req.x', giver: 'npc.nora', titleKey: 'a', goalKey: 'b', trackKey: 'c', targets: [{ id: 't1', spot: 'req.x.ghost', icon: 'litter', labelKey: 'd' }], reward: { xp: 1, om: 1, skills: [] } }]);
    expect(MAP_NAMES.has((miss[0]?.targets[0] as { spot: string }).spot), 'сторож мапи не сліпий').toBe(false);
    const r = requestOf('npc.nora') as RequestDef;
    const flags = [r.takenFlag, ...r.targets.slice(0, 2).map((t) => t.flag)];
    expect(requestStatus(flags, r), 'дві з трьох цілей — ще не здача').toBe('active');
    expect(requestStatus([...flags, (r.targets[2] as { flag: string }).flag], r)).toBe('ready');
    expect(requestFlag('req.nora-shore', 't1')).toBe('f.req-nora-shore-t1');
  });
});
