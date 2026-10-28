// GAME-111 · кішка Mia в розділі 1. Рішення власника 24.10: у авто — переноска; велосипедом Mia не їде НІКОЛИ (лишається вдома
// з Анною); стан Mia — лише два текстові стани без чисел; п'ять кумедних моментів. Спосіб перевірки картки → тест:
//  1) подія чи дія з Mia на велосипеді неможлива — валідатор (MIA_ON_BIKE / MIA_CONTENT_UNGATED), ядро (CreateCharacter) і
//     перебір видимого контенту; КОЖЕН зі сторожів має мутацію, на якій червоніє;
//  2) стан Mia — два рядки без цифр (юніт: miaState і тексти; DOM-сторож у справжньому браузері — tests/e2e/game-111.spec.ts);
//  3) п'ять моментів: рівно п'ять, кожен досяжний (зерна симуляції + повний обхід + кінець розділу досяжний ботом),
//     підряд і взагалі не повторюються;
//  4) тексти за скілом game-content (4–15 слів у рядку сцени, ≤ 140 знаків, жодних цифр) — решта (смак) — власнику в PR.
// Не зроблено цією карткою (окремі рішення власника 24.10): NPC Анна, сцени прощання й вечірнього фото для поїздки велосипедом.
import { describe, expect, it } from 'vitest';
import { dispatch, nextCommandId, type Command } from '../core/commands';
import type { CoreDefs } from '../core/defs';
import { newSim, step, type SimState } from '../core/sim';
import { initialState, type GameState } from '../core/state';
import { enumerateCombos, matches, type Combo } from '../../scripts/validator/combos.mjs';
import { loadContent } from '../../scripts/validator/load.mjs';
import { validate } from '../../scripts/validator/checks.mjs';
import en from '../i18n/en.json';
import uk from '../i18n/uk.json';
import { endReachable, type EndMemo } from './bot';
import { miaState } from './mia';
import type { Move } from './moves';
import { leaveMove } from './road-events.test.helpers';
import { GAME_DEFS } from './slice-defs';
import { CONTENT, STORY } from './story';
import { WAVE_CH1_DEPARTURE } from './waves';

const TODAY = '2026-10-24';
const ROAD = 'loc.road';
const MIA = 'animal.cat';
const BIKE = 'transport.bike';
const MOMENTS = ['001', '002', '003', '004', '005'].map((n) => `dlg.ev.ch1.mia-${n}`);
const ON_ROAD = Object.keys(STORY.dialogues).filter((id) => STORY.dialogues[id]?.trigger?.at.includes(ROAD)).sort();
const COMBOS = enumerateCombos(CONTENT);
const WITH_MIA = COMBOS.filter((k) => k.animal === MIA);
const label = (k: Combo): string => `${k.profile} · ${k.transport} · ${k.animal}`;
const isMiaId = (id: string): boolean => /(^|[.-])(mia|cat)([.-]|$)/.test(id);

interface Raw { animals: { id: string; transports?: string[] }[]; dialogues: { id: string; trigger?: { when?: unknown } }[]; packing: { items: { item: string; when?: unknown }[] }; locales: Record<string, Record<string, string>> }
const loaded = loadContent('content');
const real = loaded.content as unknown as Raw;
const mutate = (f: (c: Raw) => void): Raw => { const c = structuredClone(real); f(c); return c; };
const codes = (c: Raw): string[] => [...new Set(validate(c, { today: TODAY }).map((i) => i.code))].sort();

/**
 * Усе, що про Мію, але видиме комбінації БЕЗ кішки (а велосипедні комбінації без кішки — завжди: кішка їде лише в авто),
 * плюс сама комбінація «кішка + велосипед», якщо контент її допускає. Порожньо — Мія на велосипеді неможлива.
 */
function miaLeaks(c: Raw): string[] {
  const out: string[] = [];
  const raw = c as unknown as { quests: { id: string; when?: unknown; objectives: { id: string; when?: unknown }[] }[]; waves: { id: string; when?: unknown; tasks: { id: string; animal?: string; when?: unknown }[] }[] };
  for (const k of enumerateCombos(c)) {
    if (k.transport === BIKE && k.animal === MIA) out.push(`комбінація ${label(k)} існує`);
    if (k.animal === MIA) continue;
    for (const d of c.dialogues) if (isMiaId(d.id) && d.trigger && matches(d.trigger.when, k)) out.push(`${d.id} видна в ${label(k)}`);
    for (const q of raw.quests) for (const o of q.objectives) if (isMiaId(o.id) && matches(q.when, k) && matches(o.when, k)) out.push(`${q.id}/${o.id} видна в ${label(k)}`);
    for (const w of raw.waves) for (const t of w.tasks) if ((isMiaId(t.id) || t.animal === MIA) && matches(w.when, k) && matches(t.when, k)) out.push(`${w.id}/${t.id} видна в ${label(k)}`);
    c.packing.items.forEach((x, i) => { if (isMiaId(x.item) && matches(x.when, k)) out.push(`packing.items[${i}] ${x.item} видна в ${label(k)}`); });
  }
  return out;
}

describe('GAME-111 · Спосіб перевірки 1: подія чи дія з Mia на велосипеді неможлива (мутація → червоне)', () => {
  it('справжній контент: валідатор — 0 проблем, жодної комбінації «кішка + велосипед», жодного контенту про Мію без кішки', () => {
    expect(loaded.status).toBe('OK');
    expect(validate(real, { today: TODAY })).toEqual([]);
    expect(COMBOS.some((k) => k.transport === BIKE && k.animal === MIA)).toBe(false);
    expect(WITH_MIA.length).toBeGreaterThan(0);
    expect(WITH_MIA.every((k) => k.transport === 'transport.car')).toBe(true);
    expect(miaLeaks(real)).toEqual([]);
  });

  it('мутація: кішці дозволили велосипед → валідатор MIA_ON_BIKE, перебір бачить комбінацію', () => {
    const m = mutate((c) => { const a = c.animals.find((x) => x.id === MIA); if (a) a.transports = ['transport.car', BIKE]; });
    expect(codes(m)).toContain('MIA_ON_BIKE');
    expect(miaLeaks(m).some((x) => x.startsWith('комбінація'))).toBe(true);
  });

  it('мутація: у кішки забули transports (їде всім) → MIA_ON_BIKE', () => {
    const m = mutate((c) => { const a = c.animals.find((x) => x.id === MIA); if (a) delete a.transports; });
    expect(codes(m)).toContain('MIA_ON_BIKE');
  });

  it('мутація: подія-момент без умови на кішку → MIA_CONTENT_UNGATED, і вона видна велосипедисту', () => {
    const m = mutate((c) => { const d = c.dialogues.find((x) => x.id === MOMENTS[0]); if (d?.trigger) delete d.trigger.when; });
    expect(codes(m)).toContain('MIA_CONTENT_UNGATED');
    expect(miaLeaks(m).some((x) => x.startsWith(`${MOMENTS[0]} видна`))).toBe(true);
  });

  it('мутація: переноска Мії в пакуванні без умови на кішку → MIA_CONTENT_UNGATED', () => {
    const m = mutate((c) => { const x = c.packing.items.find((i) => i.item === 'item.mia-carrier'); if (x) delete x.when; });
    expect(codes(m)).toContain('MIA_CONTENT_UNGATED');
    expect(miaLeaks(m).length).toBeGreaterThan(0);
  });

  it('ядро: CreateCharacter «велосипед + кішка» відмовлено (INVALID_CHOICE); мутація дозволу — приймає, тож тест вміє червоніти', () => {
    const create = (defs: CoreDefs) => dispatch(initialState(0), { type: 'CreateCharacter', commandId: 'c1', profileId: 'profile.solo-explorer', transportId: BIKE, animalId: MIA } as Command, defs);
    const refused = create(GAME_DEFS);
    expect(refused.ok).toBe(false);
    expect(refused.ok ? null : refused.code).toBe('INVALID_CHOICE');
    const story = { ...STORY, animals: { ...STORY.animals, [MIA]: {} } };
    expect(create({ ...GAME_DEFS, story }).ok, 'мутація: кішці без обмеження велосипед дозволений').toBe(true);
  });

  it('ядро: велосипедист не бачить жодної події про Мію (eventEligible) і жодної справи про неї (tasksFor) — для кожної комбінації з велосипедом', () => {
    const bikes = COMBOS.filter((k) => k.transport === BIKE);
    expect(bikes.length).toBeGreaterThan(0);
    for (const k of bikes) {
      for (const id of ON_ROAD.filter(isMiaId)) expect(matches(STORY.dialogues[id]?.trigger?.when, k), `${id} @ ${label(k)}`).toBe(false);
      for (const [wid, w] of Object.entries(GAME_DEFS.waves?.waves ?? {})) {
        for (const t of w.tasks) if (isMiaId(t.id) || t.animal === MIA) expect(matches(t.when, k) && matches(w.when, k), `${wid}/${t.id} @ ${label(k)}`).toBe(false);
      }
    }
  });
});

describe('GAME-111 · Спосіб перевірки 2: стан Mia — два текстові стани, жодного числа', () => {
  const player = (animalId: string) => ({ profileId: 'profile.family-teen', transportId: 'transport.car', animalId, locationId: 'loc.home' });
  const wave = (outcome: 'open' | 'done') => ({ active: { waveId: WAVE_CH1_DEPARTURE, startedAt: 0, tasks: { 'mia-carrier': { dueAt: 50, outcome }, 'lights-window': { dueAt: 30, outcome: 'open' as const } } }, past: {} });

  it('без кішки панелі Мії немає (null), з кішкою — рівно два значення: pause, поки справа про Мію відкрита, і settled після', () => {
    expect(miaState({ player: player('animal.none') }, GAME_DEFS)).toBeNull();
    expect(miaState({ player: null }, GAME_DEFS)).toBeNull();
    expect(miaState({ player: player(MIA), wave: wave('open') }, GAME_DEFS)).toBe('pause');
    expect(miaState({ player: player(MIA), wave: wave('done') }, GAME_DEFS), 'інша справа хвилі ще відкрита, але вона не про Мію').toBe('settled');
    expect(miaState({ player: player(MIA) }, GAME_DEFS)).toBe('settled');
  });

  it('мутація: справа не про Мію теж тягне «паузу» → тест червоніє (контроль: справа про Мію закрита, а стан pause)', () => {
    const wrong = (g: Parameters<typeof miaState>[0]) => (g.wave?.active ? 'pause' : 'settled');
    expect(wrong({ player: player(MIA), wave: wave('done') })).not.toBe(miaState({ player: player(MIA), wave: wave('done') }, GAME_DEFS));
  });

  it('тексти двох станів (uk і en) — слова без жодної цифри, шкали чи відсотка; різні між собою', () => {
    for (const lang of [uk, en]) {
      const texts = [lang['ui.mia.settled'], lang['ui.mia.pause']];
      for (const t of texts) { expect(t).not.toMatch(/[0-9%/]/); expect(t.trim().length).toBeGreaterThan(0); }
      expect(new Set(texts).size).toBe(2);
    }
    expect(uk['ui.mia.settled']).toBe('Місце облаштоване');
    expect(uk['ui.mia.pause']).toBe('Потрібна пауза');
  });
});

/** Розділ 1 до дороги ядром (як у road-events.test): повертає стан ПЕРЕД приїздом на дорогу. */
function beforeRoad(k: Combo): GameState {
  let s = initialState(5_000);
  const must = (m: Move): void => { const r = dispatch(s, { ...m, commandId: nextCommandId(s) } as Command, GAME_DEFS); if (!r.ok) throw new Error(`${label(k)}: ${JSON.stringify(m)} відмовлено`); s = r.state; };
  must({ type: 'CreateCharacter', profileId: k.profile ?? '', transportId: k.transport ?? '', animalId: k.animal } as Move);
  for (const m of [{ type: 'CompleteQuest', questId: 'PROLOGUE-HOME-001' }, { type: 'CompleteQuest', questId: 'ST-001' }, { type: 'CompleteQuest', questId: 'ST-002' },
    { type: 'Visit', locationId: 'loc.shop' }, { type: 'Pickup', itemId: 'item.tent' }, { type: 'Pickup', itemId: 'item.sleeping-bag' },
    { type: 'CompleteQuest', questId: 'ST-003' }, { type: 'Visit', locationId: 'loc.home' }, { type: 'CompleteQuest', questId: 'CH1-HOME-001' }] as Move[]) must(m);
  return s;
}

describe('GAME-111 · Спосіб перевірки 3: п’ять моментів — досяжні (бот) і не повторюються підряд', () => {
  it('рівно п’ять подій-моментів, усі на дорозі, усі лише для кішки (а отже, лише в авто), з назвою й рядками в uk і en', () => {
    expect(Object.keys(STORY.dialogues).filter(isMiaId).filter((id) => STORY.dialogues[id]?.trigger).sort()).toEqual(MOMENTS);
    for (const id of MOMENTS) {
      expect(ON_ROAD, id).toContain(id);
      for (const k of COMBOS) expect(matches(STORY.dialogues[id]?.trigger?.when, k), `${id} @ ${label(k)}`).toBe(k.animal === MIA);
      for (const lang of ['uk', 'en']) for (const suffix of ['title', 'scene', 'scene.c1', 'scene.c2', 'a', 'b']) expect(real.locales[lang]?.[`${id}.${suffix}`], `${lang} ${id}.${suffix}`).toBeTruthy();
    }
  });

  it('кожен момент у кожній комбінації з кішкою: відкривається, будь-який вибір веде до кінця без втрат, кінець розділу досяжний ботом', () => {
    const memo: EndMemo = new Map();
    expect(WITH_MIA.length).toBeGreaterThan(0);
    for (const k of WITH_MIA) {
      const arrived = (() => { const s = beforeRoad(k); const r = dispatch(s, { type: 'Visit', locationId: ROAD, commandId: nextCommandId(s) } as Command, GAME_DEFS); if (!r.ok) throw new Error('дорога'); return r.state; })();
      for (const id of MOMENTS) {
        // Кидок RoadEvent з id події, яку відкриває перевірка (як у road-events.test): інші події не заважають.
        let start = arrived;
        if (start.dialogue) { for (let i = 0; i < 8 && start.dialogue; i++) { const m = leaveMove(start, STORY); if (!m) break; const r = dispatch(start, { ...m, commandId: nextCommandId(start) } as Command, GAME_DEFS); if (!r.ok) break; start = r.state; } }
        start = { ...start, flags: start.flags.filter((f) => !f.startsWith('f.seen-')) };
        const opened = dispatch(start, { type: 'RoadEvent', eventId: id, commandId: nextCommandId(start) } as Command, GAME_DEFS);
        expect(opened.ok, `${id} @ ${label(k)}: RoadEvent`).toBe(true);
        if (!opened.ok) continue;
        const choices = STORY.dialogues[id]?.nodes.scene?.choices ?? [];
        expect(choices.length, `${id}: два вибори`).toBe(2);
        for (let c = 0; c < choices.length; c++) {
          const picked = dispatch(opened.state, { type: 'Choose', choice: c, commandId: nextCommandId(opened.state) } as Command, GAME_DEFS);
          expect(picked.ok, `${id}/c${c + 1} @ ${label(k)}`).toBe(true);
          if (!picked.ok) continue;
          let s = picked.state;
          for (let i = 0; i < 4 && s.dialogue; i++) { const m = leaveMove(s, STORY); const r = m ? dispatch(s, { ...m, commandId: nextCommandId(s) } as Command, GAME_DEFS) : null; if (r?.ok) s = r.state; }
          expect(s.dialogue, `${id}/c${c + 1}: розмова закінчилась`).toBeNull();
          expect(s.inventory, `${id}: речі не змінились`).toEqual(opened.state.inventory);
          expect(s.moneyCents, `${id}: гроші не змінились`).toBe(opened.state.moneyCents);
          expect(s.quests, `${id}: квести не змінились`).toEqual(opened.state.quests);
          expect(endReachable(s, GAME_DEFS, memo, 20_000), `${id}/c${c + 1} @ ${label(k)}: кінець розділу досяжний`).toBe(true);
        }
      }
    }
  });

  /** Дорога симуляцією (з годинником і справжнім кидком RNG після кожного приїзду). */
  function arrivals(k: Combo, seed: number, times: number): string[] {
    let s: SimState = newSim(seed, 5_000);
    const go = (m: Move): void => { s = step(s, { kind: 'command', command: { ...m, commandId: nextCommandId(s.game) } as Command }, { defs: GAME_DEFS }); };
    go({ type: 'CreateCharacter', profileId: k.profile ?? '', transportId: k.transport ?? '', animalId: k.animal } as Move);
    for (const m of [{ type: 'CompleteQuest', questId: 'PROLOGUE-HOME-001' }, { type: 'CompleteQuest', questId: 'ST-001' }, { type: 'CompleteQuest', questId: 'ST-002' },
      { type: 'Visit', locationId: 'loc.shop' }, { type: 'Pickup', itemId: 'item.tent' }, { type: 'Pickup', itemId: 'item.sleeping-bag' },
      { type: 'CompleteQuest', questId: 'ST-003' }, { type: 'Visit', locationId: 'loc.home' }, { type: 'CompleteQuest', questId: 'CH1-HOME-001' }] as Move[]) go(m);
    const seen: string[] = [];
    for (let n = 0; n < times; n++) {
      go({ type: 'Visit', locationId: ROAD } as Move);
      if (s.game.dialogue) seen.push(s.game.dialogue.id);
      for (let i = 0; i < 8 && s.game.dialogue; i++) { const m = leaveMove(s.game, STORY); if (!m) break; go(m); }
      go({ type: 'Visit', locationId: 'loc.home' } as Move);
    }
    return seen;
  }

  it('справжній кидок симуляції: за 700 зерен кожен із п’яти моментів випадає в кожній комбінації з кішкою', () => {
    for (const k of WITH_MIA) {
      const fired = new Set<string>();
      for (let seed = 1; seed <= 700; seed++) for (const id of arrivals(k, seed, 1)) if (MOMENTS.includes(id)) fired.add(id);
      expect([...fired].sort(), label(k)).toEqual(MOMENTS);
    }
  });

  it('жодна подія дороги, а надто момент про Мію, не випадає двічі й ніколи не йде підряд сама за собою (6 приїздів × 150 зерен)', () => {
    let momentsSeen = 0;
    for (const k of WITH_MIA) {
      for (let seed = 1; seed <= 150; seed++) {
        const seq = arrivals(k, seed, 6);
        momentsSeen += seq.filter((id) => MOMENTS.includes(id)).length;
        expect(new Set(seq).size, `${label(k)} #${seed}: ${seq.join(' → ')}`).toBe(seq.length);
        for (let i = 1; i < seq.length; i++) expect(seq[i], `${label(k)} #${seed}: підряд`).not.toBe(seq[i - 1]);
      }
    }
    expect(momentsSeen, 'вибірка містить моменти — інакше перевірка нічого не доводить (закон 1)').toBeGreaterThan(0);
  });
});

describe('GAME-111 · Спосіб перевірки 4: тексти моментів за game-content', () => {
  const words = (t: string): number => t.trim().split(/\s+/).length;
  /** Порушення правил голосу: рядки сцени й підсумків — 4–15 слів, ≤ 140 знаків, без цифр; назва ≤ 40 знаків; вибір ≤ 8 слів. */
  function voiceProblems(locales: Raw['locales']): string[] {
    const out: string[] = [];
    for (const lang of ['uk', 'en']) {
      for (const id of MOMENTS) {
        for (const suffix of ['scene', 'a', 'b']) {
          const t = locales[lang]?.[`${id}.${suffix}`] ?? '';
          if (words(t) < 4 || words(t) > 15 || t.length > 140 || /[0-9]/.test(t)) out.push(`${lang} ${id}.${suffix}: «${t}»`);
        }
        if ((locales[lang]?.[`${id}.title`] ?? '').length > 40) out.push(`${lang} ${id}.title задовга`);
        for (const c of ['scene.c1', 'scene.c2']) if (words(locales[lang]?.[`${id}.${c}`] ?? '') > 8) out.push(`${lang} ${id}.${c} задовгий вибір`);
      }
    }
    return out;
  }

  it('справжні тексти — без порушень (uk і en)', () => {
    expect(voiceProblems(real.locales)).toEqual([]);
  });

  it('мутація: рядок сцени на 20 слів, цифра в рядку, порожній рядок → кожне червоніє', () => {
    const twenty = Array.from({ length: 20 }, () => 'слово').join(' ');
    for (const bad of [twenty, 'Мія сидить у коробці вже 3 години й не рухається', '']) {
      const m = structuredClone(real.locales);
      (m.uk as Record<string, string>)[`${MOMENTS[0]}.scene`] = bad;
      expect(voiceProblems(m).length, bad).toBeGreaterThan(0);
    }
  });
});
