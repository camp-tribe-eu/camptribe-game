// GAME-180 · прохання сусідів: дані ↔ мапа ↔ діалоги ↔ ядро. Повний шлях кожного з п'яти прохань на справжньому ядрі (розмова → «Беруся» → цілі → здача → журнал),
// відмова без наслідків, дані мапи й текстів, правила трекера/стрілки/«!». Негативні контролі в кінці (мутації, що мусять червоніти).
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
import { REQUESTS, REQUEST_FLAG_PREFIX, compileRequests, liveRequestSpot, requestFlag, requestMarker, requestOf, requestReward, requestStatus, requestTarget, requestsDone, trackerRows, type RequestDef } from './requests';
import { liveSpot } from './director';
import { storyOffer } from '../view/story-offer';

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
};

describe('GAME-180 · дані прохань', () => {
  it('п’ять прохань сценарію: Нора, Інгрід, Люк, Еліза, Сара; кожне — просильник, ≥ 1 ціль, нагорода-гачок для GAME-181', () => {
    expect(REQUESTS.map((r) => r.giver).sort()).toEqual(['npc.elise', 'npc.ingrid', 'npc.luc', 'npc.nora', 'npc.sarah']);
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
    expect(STORY.requestFlags?.length).toBe(REQUESTS.reduce((a, r) => a + r.targets.length + 2, 0));
  });

  it('тексти: усі ключі є в uk й en, кожен рядок ≤ 140 знаків (телефон)', () => {
    for (const r of REQUESTS) {
      const keys = [r.titleKey, r.goalKey, r.trackKey, ...r.targets.map((t) => t.labelKey), `journal.${r.doneFlag}`];
      const dlg = Object.keys(LOC).filter((k) => k.startsWith(`dlg.${r.giver.replace('npc.', '')}-`) || k.startsWith('dlg.elise-greeting.'));
      for (const k of [...keys, ...dlg.filter((x) => /\.(gate|offer|accepted|later|reminder|turnin|closing)(\.c\d)?$|hello\.req0$|\.req$/.test(x))]) {
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
  for (const r of REQUESTS) {
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
      expect(requestMarker(s, r.giver)).toBe(false);
      expect(requestsDone(s)).toBe(1);
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
    for (const r of REQUESTS) {
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

  it('після здачі просильник просто розмовляє (гілка «звичайна балачка»), нову пропозицію не робить', () => {
    const r = requestOf('npc.luc') as RequestDef;
    let s = finish(say(atCamp(), r.giver, ['n', 'offer.c1', 'n']));
    s = touch(s, (r.targets[0] as { spot: string }).spot);
    s = finish(say(s, r.giver, ['n', 'turnin.c1', 'n']));
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
        const s0 = { ...base, flags: [...base.flags, ...names.filter((_, i) => (mask >> i) & 1)].sort() };
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
