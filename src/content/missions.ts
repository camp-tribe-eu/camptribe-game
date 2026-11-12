// GAME-312 · місії сусідів: не доручення, а квести. Доручення (прохання GAME-180) закривається одним дотиком до позначки;
// місія має п'ять частин (docs/DAY-DESIGN.md §4) і без жодної з них це знову доручення:
//   1. МЕТА — людина сама каже, чого хоче, і чому саме сьогодні.
//   2. ПЕРЕШКОДА — чому не виходить просто так (двічі пройшла той шлях; приймач ловить музику, а прогноз ні; дитина качає, а світла нема).
//   3. ВИБІР — дві дороги з РІЗНОЮ ціною, а не з косметикою: певність проти світла дня, три хвилини фольги проти пів години як слід,
//      накачати за дитину проти навчити дитину.
//   4. РОБОТА — гравець щось РОЗУМІЄ й РОБИТЬ: звужує коло спогадами, читає докази й називає несправність, качає й учить ритму.
//   5. ВІДДАЧА — не монети: знання озера, прогноз раніше за всіх, сухі дрова сусіда.
// Де це живе: сам текст і граф — у розмові просильника (його файл у теці діалогів), бо думати гравець може лише в розмові;
// тут — ДОГОВІР картки: які вузли втілюють яку частину, якою ціною платить вибір і що кожна місія змінює в ночі з бурею.
// Сторож `checkMission` звіряє договір із реальним графом; прибери роботу чи вибір — і тест червоніє (missions.test.ts).
import type { DialogueDef, DialogueNodeDef } from '../core/defs';
import { STORY } from './story';

/** Місій одночасно в роботі — одна (DAY-DESIGN §9: «не можна взяти всі справи одразу»). */
export const ACTIVE_MISSIONS_MAX = 1;
/** Скільки вузлів-дій мусить мати частина «робота»: менше — це вже доручення. */
export const WORK_NODES_MIN = 3;
/** Скільки виборів гравця мусить бути на найкоротшому шляху від пропозиції до віддачі: одним дотиком місія не закривається. */
export const CHOICES_TO_PAYOFF_MIN = 4;

/** Чим платить вибір. Не «краще / гірше», а різна валюта: час дня, надійність уночі, самостійність іншої людини. */
export type MissionCost = 'daylight' | 'reliability' | 'independence';

export interface MissionOption {
  /** Вузол, у який веде ця дорога. */
  readonly node: string;
  /** Прапорець, яким вибір лишає слід (null — дорога «за замовчуванням», її видно за відсутністю прапорця пари). */
  readonly flag: string | null;
  readonly cost: MissionCost;
}

export interface MissionBeats {
  /** 1. Мета — вузол, де людина називає, чого хоче. */
  readonly goal: string;
  /** 2. Перешкода — вузол, де видно, чому не виходить просто так. */
  readonly obstacle: string;
  /** 3. Вибір із справжньою ціною. */
  readonly choice: { readonly node: string; readonly options: readonly MissionOption[] };
  /** 4. Робота — вузли, де гравець думає й робить (≥ WORK_NODES_MIN). */
  readonly work: readonly string[];
  /** 5. Віддача — вузол подяки й прапорець, за яким її видно решті гри. */
  readonly payoff: { readonly node: string; readonly flag: string };
}

/** Зв'язок із головною пружиною дня: прапорець місії → факт ночі з бурею (src/content/storm-night.ts). */
export interface NightLink { readonly flag: string; readonly fact: string }

/** Один вихід на місце: вузол «іду» ставить прапорець, у зоні табору відкривається міні-гра. Перший — для людини, другий — пристрій для табору (§9а). */
export interface Trip { readonly node: string; readonly flag: string; readonly zone: string; readonly minigame: string }

export interface MissionDef {
  readonly id: string;
  readonly giver: string;
  readonly dialogue: string;
  /** Вузол пропозиції (він же «мета») і прапорець «беруся». */
  readonly offer: string;
  readonly takenFlag: string;
  readonly doneFlag: string;
  /** Вузол-осередок місії: сюди веде розмова, поки місія в роботі. */
  readonly hub: string;
  readonly beats: MissionBeats;
  readonly night: readonly NightLink[];
  /**
   * Похід (EPISODE-DESIGN §9б): розмова відправляє гравця НА МІСЦЕ (вузол `node`, вибір ставить `flag`), там — міні-гра каркаса GAME-308 у зоні табору `zone`,
   * і лише зігравши її, гравець повертається до просильника по віддачу (гілка воріт читає `{ minigame }`). Поки він ходить, рутини табору цокають до ночі.
   */
  readonly trips: readonly [Trip, Trip];
  /** Віддача для табору, що працює сам (§9а): матеріал чи вміння для пристрою. */
  readonly device: { readonly flag: string; readonly kind: 'fish-trap' | 'solar-charger' | 'woodshed-tarp' };
}

export const MISSIONS: readonly MissionDef[] = [
  {
    id: 'mis.ring', giver: 'npc.amina', dialogue: 'dlg.amina-chat',
    offer: 'r-offer', takenFlag: 'f.mis-ring-taken', doneFlag: 'f.mis-ring-done', hub: 'r-hub',
    beats: {
      goal: 'r-offer',
      obstacle: 'r-taken',
      // Певність коштує світла дня: кожен спогад звужує коло, але вечір ближчає. Пішов шукати з двома спогадами — можеш утрапити не туди.
      choice: { node: 'r-hub', options: [{ node: 'r-where', flag: null, cost: 'reliability' }, { node: 'r-water', flag: 'f.mis-ring-water', cost: 'daylight' }] },
      work: ['r-where', 'r-slab', 'r-grass', 'r-miss'],
      payoff: { node: 'r-set', flag: 'f.mis-ring-done' },
    },
    night: [{ flag: 'f.mis-ring-done', fact: 'f.storm-fish-supper' }, { flag: 'f.mis-ring-slow', fact: 'f.storm-late-start' }],
    trips: [{ node: 'r-go', flag: 'f.mis-ring-go', zone: 'sanitary', minigame: 'mg.ring-sift' }, { node: 'r-payoff2', flag: 'f.mis-ring-go2', zone: 'pier', minigame: 'mg.trap-weave' }],
    device: { flag: 'f.camp-fishtrap', kind: 'fish-trap' },
  },
  {
    id: 'mis.aerial', giver: 'npc.luc', dialogue: 'dlg.luc-chat',
    offer: 'a-offer', takenFlag: 'f.mis-aerial-taken', doneFlag: 'f.mis-aerial-done', hub: 'a-hub',
    beats: {
      goal: 'a-offer',
      obstacle: 'a-taken',
      // Три хвилини фольги проти пів години як слід: одне тримає, поки сухо, друге — до наступного літа.
      choice: { node: 'a-fix', options: [{ node: 'a-quick', flag: 'f.mis-aerial-quick', cost: 'reliability' }, { node: 'a-solid', flag: 'f.mis-aerial-solid', cost: 'daylight' }] },
      work: ['a-hub', 'a-hiss', 'a-rod', 'a-base', 'a-wrong', 'a-right'],
      payoff: { node: 'a-set', flag: 'f.mis-aerial-done' },
    },
    night: [{ flag: 'f.mis-aerial-done', fact: 'f.storm-warned' }, { flag: 'f.mis-aerial-quick', fact: 'f.storm-radio-weak' }],
    trips: [{ node: 'a-go', flag: 'f.mis-aerial-go', zone: 'clearing', minigame: 'mg.aerial-tune' }, { node: 'a-payoff', flag: 'f.mis-aerial-go2', zone: 'campfire', minigame: 'mg.panel-aim' }],
    device: { flag: 'f.camp-solar-panel', kind: 'solar-charger' },
  },
  {
    id: 'mis.lantern', giver: 'npc.claire', dialogue: 'dlg.claire-chat',
    offer: 'l-offer', takenFlag: 'f.mis-lantern-taken', doneFlag: 'f.mis-lantern-done', hub: 'l-hub',
    beats: {
      goal: 'l-offer',
      obstacle: 'l-taken',
      // Накачати за дитину — світло вже зараз; навчити — година дня, зате завтра воно їй не потрібне.
      choice: { node: 'l-choice', options: [{ node: 'l-fast', flag: null, cost: 'independence' }, { node: 'l-teach', flag: 'f.mis-lantern-taught', cost: 'daylight' }] },
      work: ['l-hub', 'l-crank', 'l-watch', 'l-sun', 'l-check', 'l-teach'],
      payoff: { node: 'l-setup', flag: 'f.mis-lantern-done' },
    },
    night: [{ flag: 'f.mis-lantern-done', fact: 'f.storm-dry-wood' }, { flag: 'f.mis-lantern-taught', fact: 'f.storm-boy-light' }],
    trips: [{ node: 'l-go', flag: 'f.mis-lantern-go', zone: 'tents-old', minigame: 'mg.lantern-crank' }, { node: 'l-payoff-end', flag: 'f.mis-lantern-go2', zone: 'tents-south', minigame: 'mg.tarp-tie' }],
    device: { flag: 'f.camp-rope', kind: 'woodshed-tarp' },
  },
];

export type MissionStatus = 'available' | 'waiting' | 'active' | 'done';

/** Місія в роботі: взята й не здана. Таких одночасно не більше ACTIVE_MISSIONS_MAX. */
export const missionActive = (flags: readonly string[], m: MissionDef): boolean => flags.includes(m.takenFlag) && !flags.includes(m.doneFlag);
export const activeMissions = (flags: readonly string[], ms: readonly MissionDef[] = MISSIONS): MissionDef[] => ms.filter((m) => missionActive(flags, m));

/** Стан місії для гравця. `waiting` — пропозиції зараз не видно, бо в роботі інша місія (вона нікуди не дінеться). */
export function missionStatus(flags: readonly string[], m: MissionDef, ms: readonly MissionDef[] = MISSIONS): MissionStatus {
  if (flags.includes(m.doneFlag)) return 'done';
  if (missionActive(flags, m)) return 'active';
  return activeMissions(flags, ms).length >= ACTIVE_MISSIONS_MAX ? 'waiting' : 'available';
}

const node = (d: DialogueDef | undefined, id: string): DialogueNodeDef | undefined => d?.nodes[id];
/** Чи ставить якийсь вибір вузла цей прапорець. */
const setsFlag = (n: DialogueNodeDef | undefined, flag: string): boolean =>
  (n?.choices ?? []).some((c) => c.effects.some((e) => 'setFlag' in e && e.setFlag === flag));

/** Найменше число виборів гравця на шляху від вузла `from` до вузла `to` (−1 — шляху немає). Вузли без вибору («Далі») не рахуються. */
export function minChoices(d: DialogueDef, from: string, to: string): number {
  const seen = new Map<string, number>([[from, 0]]);
  const queue: string[] = [from];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i] as string;
    const cost = seen.get(id) as number;
    if (id === to) return cost;
    const n = d.nodes[id];
    if (!n) continue;
    const next: { id: string; step: number }[] = [
      ...(n.next !== undefined ? [{ id: n.next, step: 0 }] : []),
      ...(n.branches ?? []).map((b) => ({ id: b.next, step: 0 })),
      ...(n.choices ?? []).map((c) => ({ id: c.next, step: 1 })),
    ];
    for (const x of next) {
      const was = seen.get(x.id);
      if (was === undefined || was > cost + x.step) { seen.set(x.id, cost + x.step); queue.push(x.id); }
    }
  }
  return -1;
}

/** Кожен вузол має БЕЗУМОВНИЙ шлях до кінця розмови (дзеркало DIALOGUE_DEAD_END валідатора — тут, щоб місії червоніли власним тестом). */
export function deadEnds(d: DialogueDef): string[] {
  const ok = new Set<string>();
  for (let changed = true; changed;) {
    changed = false;
    for (const [id, n] of Object.entries(d.nodes)) {
      if (ok.has(id)) continue;
      const exits = n.end === true ? ['end'] : [
        ...(n.next !== undefined && (n.branches ?? []).length === 0 ? [n.next] : []),
        ...(n.next !== undefined && (n.branches ?? []).length > 0 ? [n.next] : []),
        ...(n.choices ?? []).filter((c) => c.when === undefined).map((c) => c.next),
      ];
      if (n.end === true || exits.some((x) => ok.has(x))) { ok.add(id); changed = true; }
    }
  }
  return Object.keys(d.nodes).filter((id) => !ok.has(id));
}

/**
 * Сторож договору картки: чи справді в графі є всі п'ять частин місії. Порожній список — усе на місці.
 * Закон 1: мутація («прибрати роботу», «лишити вибору одну дорогу», «вести пропозицію просто у віддачу») мусить дати рядок.
 */
export function checkMission(m: MissionDef, story: { readonly dialogues: Readonly<Record<string, DialogueDef>> } = STORY): string[] {
  const out: string[] = [];
  const d = story.dialogues[m.dialogue];
  if (!d) return [`${m.id}: dialogue ${m.dialogue} is missing`];
  for (const [part, id] of [['goal', m.beats.goal], ['obstacle', m.beats.obstacle], ['choice', m.beats.choice.node], ['payoff', m.beats.payoff.node]] as const) {
    if (!node(d, id)) out.push(`${m.id}: beat ${part} points at node ${id}, missing in ${m.dialogue}`);
  }
  if (!setsFlag(node(d, m.offer), m.takenFlag)) out.push(`${m.id}: node ${m.offer} has no accept choice setting ${m.takenFlag}`);
  // Відмова безкоштовна: у пропозиції є безумовний вибір без жодного ефекту.
  if (!(node(d, m.offer)?.choices ?? []).some((c) => c.when === undefined && c.effects.length === 0)) out.push(`${m.id}: node ${m.offer} has no free later choice`);
  // 3. Вибір: дві дороги, різні вузли, різна ціна.
  const opts = m.beats.choice.options;
  const choiceNode = node(d, m.beats.choice.node);
  if (opts.length < 2) out.push(`${m.id}: choice has fewer than two roads`);
  if (new Set(opts.map((o) => o.cost)).size < 2) out.push(`${m.id}: both roads have the same cost`);
  for (const o of opts) {
    if (!(choiceNode?.choices ?? []).some((c) => c.next === o.node)) out.push(`${m.id}: node ${m.beats.choice.node} does not lead to ${o.node}`);
    if (o.flag !== null && !setsFlag(choiceNode, o.flag)) out.push(`${m.id}: road ${o.node} leaves no trace ${o.flag}`);
  }
  // 4. Робота: досить вузлів, і кожен справді в графі.
  if (m.beats.work.length < WORK_NODES_MIN) out.push(`${m.id}: work has fewer than ${WORK_NODES_MIN} nodes`);
  for (const w of m.beats.work) if (!node(d, w)) out.push(`${m.id}: work node ${w} missing in ${m.dialogue}`);
  // 5. Віддача: подяка ставить прапорець «здано».
  if (m.beats.payoff.flag !== m.doneFlag) out.push(`${m.id}: payoff sets the wrong flag`);
  if (![...Object.values(d.nodes)].some((n) => setsFlag(n, m.doneFlag))) out.push(`${m.id}: ${m.doneFlag} is never set`);
  // Жодної місії, яку закриваєш одним дотиком: від пропозиції до віддачі — щонайменше CHOICES_TO_PAYOFF_MIN виборів гравця.
  // Похід: пропозиція веде до вузла «іду» (його вибір ставить прапорець), а віддачу видно лише після міні-гри на місці.
  const [first, second] = m.trips;
  if (m.trips.length < 2) out.push(`${m.id}: fewer than two trips`);
  for (const t of m.trips) if (!setsFlag(node(d, t.node), t.flag)) out.push(`${m.id}: node ${t.node} does not send on a trip (${t.flag})`);
  const there = minChoices(d, m.offer, first.node);
  if (there < 0) out.push(`${m.id}: trip ${first.node} unreachable from ${m.offer}`);
  const mid = minChoices(d, d.start, second.node);
  const back = minChoices(d, d.start, m.beats.payoff.node);
  const steps = there < 0 || mid < 0 || back < 0 ? -1 : there + mid + back;
  if (steps < CHOICES_TO_PAYOFF_MIN) out.push(`${m.id}: only ${steps} choices from ${m.offer} to payoff, fewer than ${CHOICES_TO_PAYOFF_MIN} choices`);
  // Жодної гілки воріт, що веде до віддачі в обхід міні-гри на місці (інакше «дійти й натиснути» повертається).
  const leaves = (c: unknown): unknown[] => (c && typeof c === 'object' && 'all' in c ? (c as { all: unknown[] }).all.flatMap(leaves) : [c]);
  for (const b of node(d, d.start)?.branches ?? []) {
    if (minChoices(d, b.next, m.beats.payoff.node) < 0) continue;
    if (!leaves(b.when).some((l) => (l as { minigame?: string }).minigame === second.minigame)) out.push(`${m.id}: gate branch to ${b.next} reaches payoff without minigame ${second.minigame}`);
  }
  // До другого виходу — лише через першу міні-гру.
  for (const b of node(d, d.start)?.branches ?? []) {
    if (minChoices(d, b.next, second.node) < 0) continue;
    if (!leaves(b.when).some((l) => (l as { minigame?: string }).minigame === first.minigame)) out.push(`${m.id}: gate branch to ${b.next} reaches second trip without minigame ${first.minigame}`);
  }
  // Пристрій табору: віддача ставить і його прапорець.
  if (![...Object.values(d.nodes)].some((n) => setsFlag(n, m.device.flag))) out.push(`${m.id}: payoff gives no material for a camp device (${m.device.flag})`);
  // Робота мусить лежати НА шляху: інакше вона збоку й її можна обійти.
  for (const w of m.beats.work) if (minChoices(d, m.offer, w) < 0) out.push(`${m.id}: work node ${w} unreachable from ${m.offer}`);
  // Зв'язок із ніччю: кожна місія щось у ній змінює.
  if (m.night.length === 0) out.push(`${m.id}: mission changes nothing in the storm night`);
  if (!m.night.some((l) => l.flag === m.doneFlag)) out.push(`${m.id}: finished mission changes nothing in the storm night`);
  return out;
}

/** Усі прапорці місій (для реєстру й перевірок). */
export const missionFlags = (ms: readonly MissionDef[] = MISSIONS): string[] =>
  ms.flatMap((m) => [m.takenFlag, m.doneFlag, ...m.trips.map((t) => t.flag), m.device.flag, ...m.beats.choice.options.flatMap((o) => (o.flag === null ? [] : [o.flag])), ...m.night.map((l) => l.flag)]);
