// GAME-106 · підсумок дня: лише факти. Кожна секція з'являється тоді й лише тоді, коли під неї є факт у журналі чи стані;
// подія, якої не було, не показується (мутація «яблука без факту» → червоне). Сюжет і каталог — справжні (GAME_DEFS).
import { describe, expect, it } from 'vitest';
import type { Command } from '../core/commands';
import { daySummary, daysEnded, NIGHT_PREFIX, SUMMARY_KINDS, type DaySummary, type SummaryKind } from '../core/day-summary';
import { packedOf, packFlag } from '../core/packing';
import { newSim, step, type SimState } from '../core/sim';
import { nextInt, seedRng } from '../core/rng';
import { moves } from './moves';
import { GAME_DEFS } from './slice-defs';
import { PROLOGUE_BIKE, SEED, START_MONEY } from './replay.scenario';
import uk from '../i18n/uk.json';
import en from '../i18n/en.json';
import { CONTENT } from './story';

const CTX = { defs: GAME_DEFS };
const kinds = (s: DaySummary | null): SummaryKind[] => (s?.sections ?? []).map((x) => x.kind);
const ids = (s: DaySummary | null, k: SummaryKind): readonly string[] => s?.sections.find((x) => x.kind === k)?.ids ?? [];

let n = 0;
const cmd = (s: SimState, c: Record<string, unknown>): SimState => step(s, { kind: 'command', command: { ...c, commandId: `t${n++}` } as unknown as Command }, CTX);
/** Відкрита розмова (подія в дорозі, Еліза) — закрити, як гравець: «далі», а де треба — перша відповідь. */
function closeDialogue(s: SimState): SimState {
  for (let i = 0; s.game.dialogue !== null && i < 20; i++) {
    const before = s.game.dialogue;
    s = cmd(s, { type: 'Continue' });
    if (s.game.dialogue === before) s = cmd(s, { type: 'Choose', choice: 0 });   // відмова лишає той самий об'єкт стану
  }
  return s;
}

/**
 * Оракул «лише факти» — незалежний від daySummary: кожен id кожної секції має свій факт. Журнал дня він ріже сам (від
 * CreateCharacter / межі попереднього дня до межі цього), без dayRanges. Повертає порушення словами; порожньо — чесно.
 */
function unbacked(sum: DaySummary, sim: SimState): string[] {
  const out: string[] = [];
  const ends = sim.journal.map((e, i) => (e.type === 'CompleteQuest' && GAME_DEFS.story?.quests[e.ref ?? '']?.end ? i : -1)).filter((i) => i >= 0);
  const from = sum.day === 1 ? 0 : (ends[sum.day - 2] ?? Infinity) + 1;
  const to = ends[sum.day - 1] ?? sim.journal.length - 1;
  const day = sim.journal.slice(from, to + 1);
  const had = (type: string, ref: string): boolean => day.some((e) => e.type === type && e.ref === ref);
  for (const sec of sum.sections) for (const id of sec.ids) {
    const ok = {
      night: () => id.startsWith(NIGHT_PREFIX) && sim.game.flags.includes(id),
      packed: () => sim.game.flags.includes(packFlag(id)),
      events: () => had('RoadEvent', id),
      quests: () => had('CompleteQuest', id),
      bought: () => had('BuyItem', id),
      got: () => had('Pickup', id) || day.some((e) => e.type === 'CompleteQuest' && GAME_DEFS.story?.quests[e.ref ?? '']?.reward?.items.some((i) => i.itemId === id)),
      sold: () => had('SellItem', id),
    }[sec.kind]();
    if (!ok) out.push(`${sec.kind}: ${id} — факту немає`);
  }
  // І навпаки: подія в дорозі, що сталася цього дня, не губиться.
  for (const e of day) if (e.type === 'RoadEvent' && !ids(sum, 'events').includes(e.ref ?? '')) out.push(`events: ${e.ref} сталася, але не показана`);
  if (sum.sections.some((x) => x.ids.length === 0)) out.push('порожня секція');
  return out;
}

const prologue = (): SimState => {
  let s = newSim(SEED, START_MONEY);
  for (const i of PROLOGUE_BIKE) s = step(s, i, CTX);
  return s;
};

describe('daySummary: кожна секція — лише при факті (GAME-106)', () => {
  it('лише створений персонаж: тільки багаж за замовчуванням (GAME-109 складає його на старті); гроші на початку = в кінці', () => {
    const s = cmd(newSim(1, 5_000), { type: 'CreateCharacter', profileId: 'profile.solo-explorer', transportId: 'transport.car' });
    const sum = daySummary(s, 1, GAME_DEFS);
    const p = s.game.player;
    if (!p || !GAME_DEFS.packing) throw new Error('немає персонажа чи пакування');
    expect(sum).toEqual({ day: 1, ended: false, sections: [{ kind: 'packed', ids: packedOf(s.game.flags, GAME_DEFS.packing, p) }], money: { start: 5_000, end: 5_000 } });
    // Без пакувальних прапорців — і секції немає (сторона «лише при факті»).
    expect(kinds(daySummary({ ...s, game: { ...s.game, flags: s.game.flags.filter((f) => !f.startsWith('f.pack-')) } }, 1, GAME_DEFS))).toEqual([]);
    expect(daySummary(s, 2, GAME_DEFS)).toBeNull();          // дня 2 ще немає
    expect(daySummary(newSim(1, 0), 1, GAME_DEFS)).toBeNull(); // гри ще немає — і підсумку немає
  });

  it('Пролог велосипедом (реплей-сценарій): день 1 завершено; секції — саме ті, під які є факти, і кожен id підкріплено', () => {
    const s = prologue();
    const sum = daySummary(s, 1, GAME_DEFS);
    expect(sum?.ended).toBe(true);
    expect(daysEnded(s, GAME_DEFS)).toBe(1);
    expect(unbacked(sum as DaySummary, s)).toEqual([]);
    expect(ids(sum, 'night')).toEqual(['f.night-tent']);
    expect(ids(sum, 'packed')).toEqual(expect.arrayContaining(['item.tent', 'item.sleeping-bag']));
    expect(ids(sum, 'quests')).toEqual(['ST-001', 'ST-002', 'ST-003', 'ST-004', 'q.elise-bike-area', 'ST-005']);
    expect(ids(sum, 'bought')).toEqual(['item.sleeping-bag-synthetic']);
    expect(ids(sum, 'got')).toEqual(['item.tent', 'item.sleeping-bag', 'item.firewood']);
    expect(kinds(sum)).not.toContain('sold');                // нічого не продано — секції немає
    // Гроші: 100 € на старті − 89 € спальник + 5 € Еліза + 10 € кінець розділу.
    expect(sum?.money).toEqual({ start: START_MONEY, end: s.game.moneyCents });
    expect(s.game.moneyCents).toBe(START_MONEY - 8_900 + 500 + 1_000);
  });

  it('після межі дня 1 далі ходиш — це відкритий день 2 без ночівлі й пакування; день 1 свої зберігає', () => {
    let s = prologue();
    s = closeDialogue(cmd(s, { type: 'Visit', locationId: 'loc.road' }));
    const d2 = daySummary(s, 2, GAME_DEFS);
    expect(d2?.ended).toBe(false);
    expect(kinds(d2)).not.toContain('night');
    expect(kinds(d2)).not.toContain('packed');
    expect(ids(daySummary(s, 1, GAME_DEFS), 'night')).toEqual(['f.night-tent']);
    expect(d2?.money?.start).toBe(daySummary(s, 1, GAME_DEFS)?.money?.end);   // кінець дня 1 = початок дня 2
  });

  it('кінець завершеного дня — баланс на межі, а не нинішній: витрати дня 2 не переписують день 1 (рецензія PR #60)', () => {
    let s = prologue();
    const atBoundary = s.game.moneyCents;
    // Після кінця розділу команди, що міняють гроші, ядро не приймає — тож зміну після межі ставимо в стан напряму.
    s = closeDialogue(cmd(s, { type: 'Visit', locationId: 'loc.road' }));
    s = { ...s, game: { ...s.game, moneyCents: atBoundary + 999 } };
    expect(daySummary(s, 1, GAME_DEFS)?.money?.end).toBe(atBoundary);
    expect(daySummary(s, 2, GAME_DEFS)?.money).toEqual({ start: atBoundary, end: s.game.moneyCents });
  });

  it('старий сейв v2/v3 з першим записом «Visit loc.home» (не CreateCharacter) — підсумку немає: рішення, а не випадок', () => {
    const s = prologue();
    const legacy = { ...s, journal: [{ at: 0, commandId: 'legacy', type: 'Visit' as const, ref: 'loc.home' }, ...s.journal] };
    expect(daySummary(legacy, 1, GAME_DEFS)).toBeNull();
  });

  it('гроші без факту не вигадуються: записи без балансу (сейв до GAME-106) — money null, а секції лишаються', () => {
    const s = prologue();
    const old = { ...s, journal: s.journal.map((e) => ({ at: e.at, commandId: e.commandId, type: e.type, ref: e.ref })) };
    const sum = daySummary(old, 1, GAME_DEFS);
    expect(sum?.money).toBeNull();
    expect(kinds(sum)).toContain('quests');
  });

  it('обрізаний з голови журнал (JOURNAL_LIMIT): номер дня не відлічити — підсумку немає, а не чужий день', () => {
    const s = prologue();
    expect(daySummary({ ...s, journal: s.journal.slice(3) }, 1, GAME_DEFS)).toBeNull();
  });

  it('продаж — секція «продано» з’являється лише після продажу', () => {
    let s = newSim(3, 20_000);
    s = cmd(s, { type: 'CreateCharacter', profileId: 'profile.solo-explorer', transportId: 'transport.car' });
    s = cmd(s, { type: 'CompleteQuest', questId: 'ST-001' });
    s = cmd(s, { type: 'CompleteQuest', questId: 'ST-002' });
    s = closeDialogue(cmd(s, { type: 'Visit', locationId: 'loc.shop' }));
    s = cmd(s, { type: 'BuyItem', itemId: 'item.sleeping-bag-synthetic' });
    expect(kinds(daySummary(s, 1, GAME_DEFS))).not.toContain('sold');
    s = cmd(s, { type: 'SellItem', itemId: 'item.sleeping-bag-synthetic' });
    const sum = daySummary(s, 1, GAME_DEFS);
    expect(ids(sum, 'sold')).toEqual(['item.sleeping-bag-synthetic']);
    expect(sum?.money).toEqual({ start: 20_000, end: s.game.moneyCents });
    expect(unbacked(sum as DaySummary, s)).toEqual([]);
  });
});

// Властивість на випадкових прогулянках через СИМУЛЯЦІЮ (там подія в дорозі — кидок RNG, як у грі): за будь-якого шляху
// жоден рядок підсумку не без факту, і жодна подія, що сталась, не губиться. Плюс покриття: усі секції бували, і подія
// в дорозі — і була, і не була (інакше «яблук без факту» тут не було б звідки зловити).
describe('властивість: 400 випадкових днів — у підсумку лише факти (зерно 20261024)', () => {
  const runs: { sim: SimState; sum: DaySummary }[] = [];
  let rng = seedRng(20261024);
  for (let r = 0; r < 400; r++) {
    let s = newSim(1000 + r, r % 2 === 0 ? 20_000 : 0);
    const transport = r % 3 === 0 ? 'transport.bike' : 'transport.car';
    s = cmd(s, { type: 'CreateCharacter', profileId: 'profile.solo-explorer', transportId: transport });
    // 400 кроків: з пам'ятними виборами GAME-110 прогулянка довша, а 120 кроків уже не доводили жодного дня до ночівлі.
    // Пакування не серед moves() (story-offer.ts) — частина прогулянок спершу укладає автоматично, як гравець.
    for (let k = 0; k < 400 && !s.game.campaignEnded; k++) {
      const opts = moves(s.game, GAME_DEFS).filter((m) => m.type !== 'RoadEvent');
      if (r % 4 !== 1) opts.push({ type: 'AutoPack' } as never);
      const p = nextInt(rng, opts.length);
      rng = p.state;
      s = cmd(s, opts[p.value] as unknown as Record<string, unknown>);
    }
    const sum = daySummary(s, 1, GAME_DEFS);
    if (sum) runs.push({ sim: s, sum });
  }

  it('жодного рядка без факту в жодному прогоні', () => {
    expect(runs.length).toBeGreaterThan(300);
    expect(runs.flatMap(({ sim, sum }) => unbacked(sum, sim).map((x) => `${sim.worldSeed}: ${x}`)).slice(0, 5)).toEqual([]);
  });

  it('покриття: кожна секція хоч раз була; подія в дорозі — і сталась, і ні; хоч якийсь день завершено', () => {
    const seen = new Set(runs.flatMap((x) => kinds(x.sum)));
    expect([...SUMMARY_KINDS].filter((k) => !seen.has(k))).toEqual([]);
    const apples = runs.filter((x) => ids(x.sum, 'events').includes('dlg.road-apples')).length;
    const roadNoApples = runs.filter((x) => x.sim.journal.some((e) => e.type === 'Visit' && e.ref === 'loc.road') && !ids(x.sum, 'events').includes('dlg.road-apples')).length;
    expect(apples).toBeGreaterThan(0);
    expect(roadNoApples).toBeGreaterThan(0);
    expect(runs.some((x) => x.sum.ended)).toBe(true);
  });

  // Мутація (закон 1): підсумок, що показує подію яблук без факту, — оракул червоніє на кожному дні без цієї події.
  it('МУТАЦІЯ «яблука без факту»: оракул ловить кожен такий підсумок', () => {
    const lying = runs.filter((x) => !x.sim.journal.some((e) => e.type === 'RoadEvent'));
    expect(lying.length).toBeGreaterThan(0);
    for (const { sim, sum } of lying) {
      const mutated: DaySummary = { ...sum, sections: [...sum.sections.filter((x) => x.kind !== 'events'), { kind: 'events', ids: ['dlg.road-apples'] }] };
      expect(unbacked(mutated, sim)).toContain('events: dlg.road-apples — факту немає');
    }
  });
});

describe('тексти секцій ночівлі: кожен прапорець f.night-*, який ставить контент, має підпис uk і en', () => {
  const nightFlags = [...new Set(JSON.stringify(CONTENT.dialogues).match(/f\.night-[a-z0-9-]+/g) ?? [])].sort();
  it('прапорців ночівлі в контенті більше нуля, і в обох словниках є sum.night.<вид>', () => {
    expect(nightFlags.length).toBeGreaterThan(0);
    const missing = nightFlags.flatMap((f) => {
      const key = `sum.night.${f.slice(NIGHT_PREFIX.length)}`;
      return [...(key in uk ? [] : [`uk ${key}`]), ...(key in en ? [] : [`en ${key}`])];
    });
    expect(missing).toEqual([]);
  });
});
