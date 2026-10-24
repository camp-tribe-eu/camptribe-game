// GAME-84 · дрібні дефекти Прологу, що доводяться на справжньому контенті повним переглядом меню гравця (№1–№6).
// Перебір іде ЛИШЕ через дії меню (menuMoves) — те, що гравець справді бачить, — для кожної комбінації старту
// (профіль × транспорт × тварина), з журналом (sim.step), щоб дубль запису журналу теж був видний.
// Закон 1: кожен пункт має мутацію, яку мусить зловити (список — у звіті картки).
import { describe, expect, it } from 'vitest';
import { nextCommandId, type Command } from '../core/commands';
import type { CoreDefs } from '../core/defs';
import { newSim, step, type SimState } from '../core/sim';
import { characterChoices, menuMoves, outcomeKey, storyOffer } from '../view/story-offer';
import uk from '../../content/locales/uk.json';
import en from '../../content/locales/en.json';
import ukUi from '../i18n/uk.json';
import enUi from '../i18n/en.json';
import { GAME_DEFS } from './slice-defs';
import quests from '../../content/quests.json';
import type { Move } from './moves';

const DEFS: CoreDefs = GAME_DEFS;
const CTX = { defs: DEFS };
const MONEY = 10_000;

interface Visited {
  readonly label: string;
  states: number;
  readonly locations: Set<string>;
  /** Усі показані дії «Піти» (звідки → куди) — для перевірки, що перебір справді бачив подорожі. */
  readonly visits: { from: string | null; to: string }[];
  /** Ключі ЦІЛЕЙ квестів, які гравець бачив у списку завдань на будь-якому кроці. */
  readonly objectives: Set<string>;
  /** Журнал: два записи Visit поспіль (серед Visit) в одну й ту саму локацію — дубль «Прибуття». */
  readonly dupVisits: string[];
  /** Досяжні стани, де розділ закінчено. */
  readonly ended: SimState[];
}

/** Повний перебір меню від створеного персонажа. */
function walk(intent: Move, label: string): Visited {
  const start = step(newSim(1, MONEY), { kind: 'command', command: { ...intent, commandId: 'c0' } as Command }, CTX);
  const seen = new Set<string>([key(start)]);
  const queue = [start];
  const out: Visited = { label, states: 0, locations: new Set(), visits: [], objectives: new Set(), dupVisits: [], ended: [] };
  for (let s = queue.shift(); s; s = queue.shift()) {
    out.states++;
    const at = s.game.player?.locationId ?? null;
    if (at) out.locations.add(at);
    for (const q of storyOffer(s, DEFS).offer.quests) for (const o of q.objectives) out.objectives.add(o.key);
    if (s.game.campaignEnded) out.ended.push(s);
    for (const { move } of menuMoves(s.game, DEFS)) {
      if (move.type === 'Visit') out.visits.push({ from: at, to: move.locationId });
      const next = step(s, { kind: 'command', command: { ...move, commandId: nextCommandId(s.game) } as Command }, CTX);
      // Два «Прибуття» в одне місце без дороги між ними: журнал дивимось лише по записах Visit (інші дії між ними не в рахунок).
      const [prev, last] = next.journal.filter((e) => e.type === 'Visit').slice(-2);
      if (prev && last && last !== s.journal.filter((e) => e.type === 'Visit').at(-1) && last.ref === prev.ref) out.dupVisits.push(`${label}: ${last.ref} ×2`);
      const k = key(next);
      if (!seen.has(k)) { seen.add(k); queue.push(next); }
    }
    if (seen.size > 20_000) throw new Error('простір станів вибухнув — тест не доводить нічого');
  }
  return out;
}
/** Стан і ТІЛЬКИ місце останнього Visit у журналі: інакше довжина журналу множила б простір безкінечно. */
const key = (s: SimState): string => `${outcomeKey(s.game)}|${s.journal.filter((e) => e.type === 'Visit').at(-1)?.ref}`;

const COMBOS = characterChoices(DEFS);
const RUNS = COMBOS.map((c) => walk(c.intent, `${(c.intent as { transportId: string }).transportId}+${(c.intent as { animalId?: string }).animalId ?? 'none'}+${(c.intent as { profileId: string }).profileId}`));
const hasCat = (r: Visited): boolean => r.label.includes('animal.cat');

describe('перебір меню на справжньому контенті (GAME-84)', () => {
  it('перебір не порожній: усі комбінації старту, усі локації, подорожі справді бувають, кінець Прологу досяжний (інакше нижче все зелене нічого не доводить)', () => {
    expect(COMBOS.length).toBeGreaterThanOrEqual(5);
    expect(RUNS.some(hasCat)).toBe(true);
    expect(RUNS.some((r) => !hasCat(r))).toBe(true);
    for (const r of RUNS) {
      expect(r.locations, r.label).toEqual(new Set(Object.keys(DEFS.story?.locations ?? {})));
      expect(r.visits.length, r.label).toBeGreaterThan(10);
      expect(r.ended.length, r.label).toBeGreaterThan(0);
      expect(r.states, r.label).toBeGreaterThan(30);
    }
  });

  it('№1 ніде в меню немає «Піти» туди, де гравець стоїть (усі комбінації, усі досяжні стани)', () => {
    for (const r of RUNS) expect(r.visits.filter((v) => v.from === v.to), r.label).toEqual([]);
  });

  it('№1 журнал: жоден перебір не дав двох «Прибуттів» підряд в одне місце', () => {
    for (const r of RUNS) expect(r.dupVisits, r.label).toEqual([]);
  });

  it('№4 кішка: цілі про неї бачить лише гравець із кішкою — і бачить обидві (дорога й табір); без кішки — жодної', () => {
    const CAT = ['q.st-004.o2', 'q.st-005.o4'];
    for (const r of RUNS) {
      for (const k of CAT) expect(r.objectives.has(k), `${r.label} ${k}`).toBe(hasCat(r));
    }
    // Тексти є в обох мовах і справді про кішку/cat.
    for (const k of CAT) {
      expect((uk as Record<string, string>)[k]).toMatch(/кішк/i);
      expect((en as Record<string, string>)[k]).toMatch(/cat/i);
    }
  });
});

describe('тексти цілей (GAME-84 №2, №3)', () => {
  const L = { uk: uk as Record<string, string>, en: en as Record<string, string> };

  it('№3 необов\'язкова ціль не каже «за бажанням» сама: цей підпис додає інтерфейс (раніше — двічі)', () => {
    const optional = quests.flatMap((q) => q.objectives.filter((o) => !o.required).map((o) => ({ q: q.id, ...o })));
    expect(optional.length).toBeGreaterThan(0);                                 // є що перевіряти (ліхтар у крамниці, кішка)
    for (const o of optional) {
      expect(L.uk[o.textKey], `${o.q}.${o.id} uk`).not.toMatch(/за бажанням/i);
      expect(L.en[o.textKey], `${o.q}.${o.id} en`).not.toMatch(/optional|up to you/i);
    }
    // Підпис інтерфейсу існує (інакше «без дубля» означало б «без підпису взагалі»).
    expect((ukUi as Record<string, string>)['ui.optional']).toBe('за бажанням');
    expect((enUi as Record<string, string>)['ui.optional']).toBe('optional');
  });

  it('№2 ціль ST-004 тікається на «Дорозі», тож її текст про дорогу, а не про озеро («Рушай до озера» ставило ✓ на півдорозі)', () => {
    const st004 = quests.find((q) => q.id === 'ST-004');
    const o = st004?.objectives.find((x) => x.id === 'road-to-lake');
    expect(o).toMatchObject({ kind: 'visit', target: 'loc.road', required: true });
    expect(L.uk[o?.textKey ?? '']).toMatch(/доро/i);
    expect(L.uk[o?.textKey ?? '']).not.toMatch(/^Рушай до озера/);
    expect(L.en[o?.textKey ?? '']).toMatch(/road/i);
    expect(L.en[o?.textKey ?? '']).not.toMatch(/^Head for the lake/);
    // GAME-109: «облаштуватись на ніч» — репліка Елізи (намет, авто чи альтанка), а не просте відвідування табору.
    const st005 = quests.find((q) => q.id === 'ST-005');
    expect(st005?.objectives.find((x) => x.id === 'pitch-tent')).toMatchObject({ kind: 'talk', target: 'npc.elise', byDialogue: true });
  });
});

describe('кінець Прологу (GAME-84 №6)', () => {
  it('на екрані кінця є підказка, що далі: Розділ I і збереження в паузі, — в обох мовах; і вона справді показується в стані «ended»', () => {
    for (const r of RUNS) {
      const end = r.ended[0] as SimState;
      expect(storyOffer(end, DEFS).offer.stage, r.label).toBe('ended');
    }
    expect((ukUi as Record<string, string>)['ui.ended']).toMatch(/Розділ I/);
    expect((ukUi as Record<string, string>)['ui.ended']).toMatch(/збережи/i);
    expect((enUi as Record<string, string>)['ui.ended']).toMatch(/Chapter I/);
    expect((enUi as Record<string, string>)['ui.ended']).toMatch(/save/i);
  });
});
