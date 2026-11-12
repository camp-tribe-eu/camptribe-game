// GAME-312 · місії сусідів: договір п'яти частин, справжній прохід ядром, одна активна мета, тупики й бюджет тексту.
// Закон 1: кожну перевірку супроводжує мутація, на якій вона червоніє (у звіті PR — текст червоного рядка).
import { describe, expect, it } from 'vitest';
import { dispatch, type Command } from '../core/commands';
import type { CoreDefs, DialogueDef } from '../core/defs';
import { initialState, type GameState } from '../core/state';
import uk from '../../content/locales/uk.json';
import en from '../../content/locales/en.json';
import flagsJson from '../../content/flags.json';
import type { Move } from './moves';
import { GAME_DEFS } from './slice-defs';
import { CONTENT, STORY } from './story';
import { ACTIVE_MISSIONS_MAX, CHOICES_TO_PAYOFF_MIN, MISSIONS, WORK_NODES_MIN, activeMissions, checkMission, deadEnds, missionFlags, missionStatus, type MissionDef } from './missions';

const UK = uk as Record<string, string>;
const EN = en as Record<string, string>;
/** Бюджет рядка на телефоні: репліка — 110 знаків (DIALOGUE_LINE_MAX валідатора), кнопка вибору — 48. */
const LINE_MAX = 110;
const CHOICE_MAX = 48;

let n = 0;
const send = (s: GameState, m: Move) => dispatch(s, { ...m, commandId: `ms${n++}` } as Command, GAME_DEFS);
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
  { type: 'Visit', locationId: 'loc.shop' }, { type: 'Pickup', itemId: 'item.tent' }, { type: 'Pickup', itemId: 'item.sleeping-bag' }, { type: 'Checkout' },
  { type: 'CompleteQuest', questId: 'ST-003' }, { type: 'Visit', locationId: 'loc.home' }, { type: 'CompleteQuest', questId: 'CH1-HOME-001' },
  { type: 'Visit', locationId: 'loc.road' }, { type: 'CompleteQuest', questId: 'ST-004' }, { type: 'Visit', locationId: 'loc.camp.lake' },
];
/** Люк пропонує антену, коли його дрібні прохання вже позаду: пропозиція живе у вузлі `hello`, до якого ведуть ворота. */
const LUC_REQUESTS = ['f.req-luc-chain-taken', 'f.req-luc-chain-t1', 'f.req-luc-chain-done', 'f.req-luc-radio-taken', 'f.req-luc-radio-t1', 'f.req-luc-radio-done'];
const atCamp = (extra: readonly string[] = []): GameState => { const s = play(TO_CAMP, initialState(5_000)); return { ...s, flags: [...s.flags, ...extra] }; };

/** Сирі вибори вузла (у них є textKey — ядру він не потрібен). */
const rawChoices = (dialogueId: string, nodeId: string): { textKey: string }[] =>
  ((CONTENT.dialogues.find((d) => d.id === dialogueId)?.nodes ?? []) as unknown as { id: string; choices?: { textKey: string }[] }[]).find((x) => x.id === nodeId)?.choices ?? [];

/** Крок розмови: 'n' — «Далі»; інакше вибір, чий textKey закінчується на цей рядок. Рахує ВИБОРИ гравця. */
function walk(from: GameState, npcId: string, steps: readonly string[]): { state: GameState; choices: number } {
  let s = play([{ type: 'Talk', npcId }], { ...from, dialogue: null });
  let choices = 0;
  for (const st of steps) {
    if (!s.dialogue) throw new Error(`розмова скінчилась до кроку ${st}`);
    if (st === 'n') { s = play([{ type: 'Continue' }], s); continue; }
    // Вузли без вибору (ворота, репліка) проходимо «Далі» самі: кроки списку — лише вибори гравця.
    for (let i = 0; i < 6 && s.dialogue && rawChoices(s.dialogue.id, s.dialogue.node).length === 0; i++) s = play([{ type: 'Continue' }], s);
    const d = s.dialogue;
    if (!d) throw new Error(`розмова скінчилась до кроку ${st}`);
    const idx = rawChoices(d.id, d.node).findIndex((c) => c.textKey.endsWith(st));
    if (idx < 0) throw new Error(`у вузлі ${d.node} немає вибору ${st}`);
    s = play([{ type: 'Choose', choice: idx }], s);
    choices++;
  }
  return { state: s, choices };
}
/** Спроба вибору, що може бути схована умовою: повертає код відмови ядра або null. */
function tryChoice(from: GameState, npcId: string, nodeSteps: readonly string[], suffix: string): string | null {
  let state = walk(from, npcId, nodeSteps).state;
  for (let i = 0; i < 6 && state.dialogue && rawChoices(state.dialogue.id, state.dialogue.node).length === 0; i++) state = play([{ type: 'Continue' }], state);
  const d = state.dialogue;
  if (!d) throw new Error('розмови немає');
  const idx = rawChoices(d.id, d.node).findIndex((c) => c.textKey.endsWith(suffix));
  if (idx < 0) throw new Error(`немає вибору ${suffix}`);
  const r = send(state, { type: 'Choose', choice: idx } as Move);
  return r.ok ? null : r.code;
}

/** Робота на місці: міні-гру зіграно (те саме, що шле хост після результату). */
const played = (s: GameState, id: string, outcome = 'fine'): GameState => play([{ type: 'FinishMinigame', minigameId: id, outcome } as Move], { ...s, dialogue: null });
const RING_TO_SLAB = ['hello.c4', 'r-offer.c1', 'r-hub.c1', 'r-hub.c2', 'r-hub.c3', 'r-hub.c4', 'r-where.c4', 'r-slab.c1', 'r-sieve2.c2', 'r-go.c1'];
/** Уся «Обручка»: розпитати → піти до плити → просіяти пісок (міні-гра) → повернутись по віддачу. */
const ringDone = (s0: GameState): { state: GameState; choices: number } => {
  const there = walk(s0, 'npc.amina', RING_TO_SLAB);
  const back = walk(played(there.state, 'mg.ring-sift'), 'npc.amina', ['r-story2.c2', 'r-thanks.c1', 'r-payoff2.c1']);
  const fin = walk(played(back.state, 'mg.trap-weave'), 'npc.amina', ['r-trap2.c2', 'r-set.c1']);
  return { state: fin.state, choices: there.choices + back.choices + fin.choices };
};

const clone = (): { dialogues: Record<string, DialogueDef> } => structuredClone(STORY) as unknown as { dialogues: Record<string, DialogueDef> };

describe('GAME-312 · місії сусідів: п’ять частин квесту', () => {
  it('у кожної місії всі п’ять частин, і кожна втілена вузлами справжньої розмови', () => {
    for (const m of MISSIONS) expect(checkMission(m), m.id).toEqual([]);
    expect(MISSIONS.map((m) => m.id)).toEqual(['mis.ring', 'mis.aerial', 'mis.lantern']);
  });

  it('негативний контроль: прибрати РОБОТУ — сторож червоніє', () => {
    const m = { ...MISSIONS[0] as MissionDef };
    const broken: MissionDef = { ...m, beats: { ...m.beats, work: ['r-slab'] } };
    expect(checkMission(broken).join(' | ')).toContain(`work has fewer than ${WORK_NODES_MIN}`);
  });

  it('негативний контроль: лишити вибору одну дорогу (або ту саму ціну) — сторож червоніє', () => {
    const m = MISSIONS[1] as MissionDef;
    const one: MissionDef = { ...m, beats: { ...m.beats, choice: { ...m.beats.choice, options: [m.beats.choice.options[0] as never] } } };
    expect(checkMission(one).join(' | ')).toContain('fewer than two roads');
    const same: MissionDef = { ...m, beats: { ...m.beats, choice: { ...m.beats.choice, options: m.beats.choice.options.map((o) => ({ ...o, cost: 'daylight' as const })) } } };
    expect(checkMission(same).join(' | ')).toContain('same cost');
  });

  it('негативний контроль: місія в один дотик (пропозиція веде просто у віддачу) — сторож червоніє', () => {
    const story = clone();
    const d = story.dialogues['dlg.claire-chat'] as DialogueDef;
    (d.nodes['l-offer'] as unknown as { choices: { next: string; effects: unknown[] }[] }).choices[0] = { next: 'l-payoff', effects: [{ setFlag: 'f.mis-lantern-taken' }] };
    const out = checkMission(MISSIONS[2] as MissionDef, story).join(' | ');
    expect(out).toContain(`fewer than ${CHOICES_TO_PAYOFF_MIN} choices`);
  });

  it('негативний контроль: повернення по віддачу в обхід міні-гри на місці — сторож червоніє', () => {
    const story = clone();
    const gate = (story.dialogues['dlg.amina-chat'] as DialogueDef).nodes['gate'] as unknown as { branches: { when: { all: unknown[] } }[] };
    const first = gate.branches[0] as { when: { all: unknown[] } };
    first.when = { all: first.when.all.filter((l) => !(l as { minigame?: string }).minigame) };
    expect(checkMission(MISSIONS[0] as MissionDef, story).join(' | ')).toContain('without minigame mg.trap-weave');
  });

  it('негативний контроль: віддача без матеріалу для пристрою табору — сторож червоніє', () => {
    const m = MISSIONS[2] as MissionDef;
    expect(checkMission({ ...m, device: { ...m.device, flag: 'f.camp-nothing' } }).join(' | ')).toContain('camp device');
  });

  it('негативний контроль: розірвати зв’язок із ніччю — сторож червоніє', () => {
    for (const m of MISSIONS) expect(checkMission({ ...m, night: [] }).join(' | '), m.id).toContain('changes nothing in the storm night');
  });
});

describe('GAME-312 · прохід місії ядром: робота, вибір, віддача', () => {
  it('«Обручка»: спогади звужують коло, хибне місце коштує часу (не прогресу), віддача — знання озера', () => {
    const s0 = atCamp();
    // Пішли шукати з одним спогадом: пісок іще видно, і він порожній — пів години пішло, місія ціла.
    const miss = walk(s0, 'npc.amina', ['hello.c4', 'r-offer.c1', 'r-hub.c1', 'r-hub.c4', 'r-where.c2']);
    expect(miss.state.flags).toContain('f.mis-ring-slow');
    expect(miss.state.flags).not.toContain('f.mis-ring-done');
    // Коло звужене трьома спогадами: лишається сама плита.
    const full = walk(s0, 'npc.amina', ['hello.c4', 'r-offer.c1', 'r-hub.c1', 'r-hub.c2', 'r-hub.c3', 'r-hub.c4']);
    const where = rawChoices('dlg.amina-chat', 'r-where');
    expect(full.state.dialogue?.node).toBe('r-where');
    const visible = where.filter((c) => {
      const raw = (CONTENT.dialogues.find((d) => d.id === 'dlg.amina-chat')?.nodes ?? []) as unknown as { id: string; choices?: { textKey: string; when?: { notFlag?: string } }[] }[];
      const ch = raw.find((x) => x.id === 'r-where')?.choices?.find((x) => x.textKey === c.textKey);
      return ch?.when?.notFlag === undefined || !full.state.flags.includes(ch.when.notFlag);
    });
    expect(visible.map((c) => c.textKey)).toEqual(['dlg.amina-chat.r-where.c4']);
    // Пішов до плити, але пісок ще не просіяв: повернувся — віддачі немає, Аміна чекає (одним дотиком не закрити).
    const away = walk(s0, 'npc.amina', RING_TO_SLAB).state;
    expect(play([{ type: 'Continue' }], walk(away, 'npc.amina', []).state).dialogue?.node).toBe('r-wait');
    const done = ringDone(s0);
    expect(done.state.flags).toContain('f.mis-ring-done');
    expect(done.state.flags, 'віддача для табору: верша').toContain('f.camp-fishtrap');
    expect(done.choices).toBeGreaterThanOrEqual(CHOICES_TO_PAYOFF_MIN);
  });

  it('«Антена»: без доказів правильної відповіді немає, здогад повертає до роботи, ремонт — вибір із ціною', () => {
    const s0 = atCamp(LUC_REQUESTS);
    // Здогад «сіли батарейки» нічого не ламає — Люк просить перевірити ще раз.
    const guess = walk(s0, 'npc.luc', ['hello.c4', 'a-offer.c1', 'a-hub.c4']);
    expect(guess.state.dialogue?.node).toBe('a-wrong');
    expect(play([{ type: 'Continue' }], guess.state).dialogue?.node).toBe('a-hub');
    expect(guess.state.flags).not.toContain('f.mis-aerial-done');
    // Відповідь «антена не має контакту» схована, поки немає обох доказів.
    expect(tryChoice(s0, 'npc.luc', ['hello.c4', 'a-offer.c1'], 'a-hub.c6')).toBe('CONDITION_FAILED');
    const there = walk(s0, 'npc.luc', ['hello.c4', 'a-offer.c1', 'a-hub.c2', 'a-hub.c3', 'a-hub.c6', 'a-fix.c2', 'a-tip2.c1', 'a-go.c1']);
    expect(play([{ type: 'Continue' }], walk(there.state, 'npc.luc', []).state).dialogue?.node).toBe('a-wait');
    const back = walk(played(there.state, 'mg.aerial-tune'), 'npc.luc', ['a-listen.c1', 'a-note2.c2', 'a-story2.c2', 'a-payoff.c1']);
    expect(play([{ type: 'Continue' }], walk(back.state, 'npc.luc', []).state).dialogue?.node, 'панель ще не стоїть — віддачі немає').toBe('a-wait2');
    const fin = walk(played(back.state, 'mg.panel-aim'), 'npc.luc', ['a-sun2.c1', 'a-set.c1']);
    const fixed = { state: fin.state, choices: there.choices + back.choices + fin.choices };
    expect(fixed.state.flags, 'віддача для табору: панель').toContain('f.camp-solar-panel');
    expect(fixed.state.flags).toContain('f.mis-aerial-solid');
    expect(fixed.state.flags).toContain('f.mis-aerial-done');
    expect(fixed.state.flags).not.toContain('f.mis-aerial-quick');
    expect(fixed.choices).toBeGreaterThanOrEqual(CHOICES_TO_PAYOFF_MIN);
  });

  it('«Ліхтар Тімо»: вибір «як бути» відкривають дві дії, навчити — дорожче за накачати', () => {
    const s0 = atCamp();
    expect(tryChoice(s0, 'npc.claire', ['hello.c4', 'l-offer.c1'], 'l-hub.c5')).toBe('CONDITION_FAILED');
    const t1 = walk(s0, 'npc.claire', ['hello.c4', 'l-offer.c1', 'l-hub.c1', 'l-hub.c2', 'l-hub.c5', 'l-choice.c2', 'l-go.c1']);
    expect(play([{ type: 'Continue' }], walk(t1.state, 'npc.claire', []).state).dialogue?.node).toBe('l-wait');
    const t2 = walk(played(t1.state, 'mg.lantern-crank'), 'npc.claire', ['l-story2.c2', 'l-mode.c2', 'l-done.c1', 'l-payoff-end.c1']);
    const t3 = walk(played(t2.state, 'mg.tarp-tie'), 'npc.claire', ['l-wood2.c2', 'l-setup.c1']);
    const taught = { state: t3.state, choices: t1.choices + t2.choices + t3.choices };
    expect(taught.state.flags, 'віддача для табору: мотузка').toContain('f.camp-rope');
    expect(taught.state.flags).toContain('f.mis-lantern-taught');
    expect(taught.state.flags).toContain('f.mis-lantern-done');
    expect(taught.choices).toBeGreaterThanOrEqual(CHOICES_TO_PAYOFF_MIN);
    const f1 = walk(s0, 'npc.claire', ['hello.c4', 'l-offer.c1', 'l-hub.c1', 'l-hub.c2', 'l-hub.c5', 'l-choice.c1', 'l-go.c1']);
    const f2 = walk(played(f1.state, 'mg.lantern-crank', 'scrappy'), 'npc.claire', ['l-story2.c1', 'l-mode.c1', 'l-done.c1', 'l-payoff-end.c1']);
    const fast = walk(played(f2.state, 'mg.tarp-tie', 'scrappy'), 'npc.claire', ['l-wood2.c1', 'l-setup.c1']);
    expect(fast.state.flags).toContain('f.mis-lantern-done');
    expect(fast.state.flags).not.toContain('f.mis-lantern-taught');
  });

  it('відмова безкоштовна: «пізніше» нічого не ставить і нічого не коштує', () => {
    const s0 = atCamp();
    const later = walk(s0, 'npc.amina', ['hello.c4', 'r-offer.c2']);
    expect(later.state.flags.filter((f) => f.startsWith('f.mis-'))).toEqual([]);
  });
});

describe('GAME-312 · одна активна мета', () => {
  it('поки місія в роботі, інші пропозиції заховані — і ядро їх не приймає', () => {
    const s0 = atCamp(LUC_REQUESTS);
    const taken = walk(s0, 'npc.amina', ['hello.c4', 'r-offer.c1']).state;
    expect(activeMissions(taken.flags).map((m) => m.id)).toEqual(['mis.ring']);
    expect(activeMissions(taken.flags).length).toBeLessThanOrEqual(ACTIVE_MISSIONS_MAX);
    expect(tryChoice(taken, 'npc.luc', [], 'hello.c4')).toBe('CONDITION_FAILED');
    expect(tryChoice(taken, 'npc.claire', [], 'hello.c4')).toBe('CONDITION_FAILED');
    expect(missionStatus(taken.flags, MISSIONS[1] as MissionDef)).toBe('waiting');
    // Здав — решта знову відкрита (та сама розмова, та сама кнопка).
    const done = ringDone(s0).state;
    expect(missionStatus(done.flags, MISSIONS[1] as MissionDef)).toBe('available');
    expect(tryChoice(done, 'npc.luc', [], 'hello.c4')).toBeNull();
  });

  it('негативний контроль: дозволити дві місії одразу — перевірка «одна мета» червоніє', () => {
    const both = ['f.mis-ring-taken', 'f.mis-aerial-taken'];
    expect(activeMissions(both).length).toBeGreaterThan(ACTIVE_MISSIONS_MAX);
  });
});

describe('GAME-312 · розмови без тупиків і бюджет тексту', () => {
  const ids = ['dlg.amina-chat', 'dlg.luc-chat', 'dlg.claire-chat', 'dlg.storm-night'];

  it('з кожного вузла є БЕЗУМОВНИЙ шлях до кінця розмови', () => {
    for (const id of ids) expect(deadEnds(STORY.dialogues[id] as DialogueDef), id).toEqual([]);
  });

  it('негативний контроль: вибір із кінця розмови стає умовним — тупик знайдено', () => {
    const story = clone();
    const d = story.dialogues['dlg.amina-chat'] as DialogueDef;
    for (const c of (d.nodes['r-slab'] as unknown as { choices: { when?: unknown }[] }).choices) c.when = { flag: 'f.mis-ring-water' };
    expect(deadEnds(d)).toContain('r-slab');
  });

  it('кожен новий ключ є в uk і en та вкладається в бюджет рядка', () => {
    const mine = ['dlg.storm-night.', 'dlg.amina-chat.r-', 'dlg.luc-chat.a-', 'dlg.claire-chat.l-', 'dlg.amina-chat.gate', 'dlg.claire-chat.gate'];
    const keys = Object.keys(UK).filter((k) => mine.some((p) => k.startsWith(p)) || ['dlg.amina-chat.hello.c4', 'dlg.luc-chat.hello.c4', 'dlg.claire-chat.hello.c4'].includes(k));
    expect(keys.length).toBeGreaterThan(60);
    for (const k of keys) {
      expect(EN[k], k).toBeTruthy();
      const max = /\.c\d$/.test(k) ? CHOICE_MAX : LINE_MAX;
      expect([...(UK[k] as string)].length, `${k} [uk]`).toBeLessThanOrEqual(max);
      expect([...(EN[k] as string)].length, `${k} [en]`).toBeLessThanOrEqual(max);
    }
  });

  it('негативний контроль: задовга кнопка вибору — бюджет червоніє', () => {
    const tooLong = 'Підняти плиту, обмацати траву, перевірити кишені ще раз і повернутись';
    expect([...tooLong].length).toBeGreaterThan(CHOICE_MAX);
  });

  it('усі прапорці місій є в реєстрі content/flags.json', () => {
    const reg = new Set((flagsJson as { id: string }[]).map((f) => f.id));
    for (const f of missionFlags()) expect(reg.has(f), f).toBe(true);
  });

});

/** Межа типів: тести вище працюють із тим самим каталогом, що й гра. */
const _defs: CoreDefs = GAME_DEFS;
void _defs;
