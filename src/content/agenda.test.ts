// GAME-243 · нотатник Вікторії: пункти тікають від стану ядра, стрілка живе лише в навчанні, крапки мінімапи — лише для відкритих пунктів.
// Закон 1: кожен сторож показано червоним мутацією (див. коментарі «Мутація»).
import { describe, expect, it } from 'vitest';
import { nextCommandId, type Command } from '../core/commands';
import { packFlag, takeFlag } from '../core/packing';
import { newSim, step, type SimState } from '../core/sim';
import { characterChoices } from '../view/story-offer';
import { AGENDA_MAX, ONBOARDING_ITEMS, agendaOf, minimapTargets, onboarding, windowOf } from './agenda';
import type { Move } from './moves';
import { GAME_DEFS as DEFS } from './slice-defs';

const send = (sim: SimState, m: Move): SimState => step(sim, { kind: 'command', command: { ...m, commandId: nextCommandId(sim.game) } as Command }, { defs: DEFS });
const base = (): SimState => send(newSim(7, 3_000), (characterChoices(DEFS)[0] as { intent: Move }).intent);
type Q = Record<string, { status: 'active' | 'completed'; done: string[] }>;
const withG = (s: SimState, p: { quests?: Q; flags?: string[]; inventory?: Record<string, number>; loc?: string; minutes?: number }): SimState => {
  const g = s.game;
  return { ...s, clock: p.minutes === undefined ? s.clock : { ...s.clock, minutes: p.minutes }, game: { ...g, player: { ...(g.player as NonNullable<typeof g.player>), locationId: p.loc ?? (g.player as NonNullable<typeof g.player>).locationId }, quests: { ...g.quests, ...(p.quests ?? {}) } as typeof g.quests, flags: p.flags ?? g.flags, inventory: p.inventory ?? g.inventory } };
};
const NEEDED = (DEFS.packing?.items ?? []).filter((i) => i.group === 'needed').map((i) => i.itemId);
const packing = (flags: string[] = []): SimState => withG(base(), { loc: 'loc.home', quests: { 'ST-003': { status: 'completed', done: [] }, 'CH1-HOME-001': { status: 'active', done: [] } }, flags });

describe('нотатник: пункти тікають самі зі стану ядра', () => {
  it('удома пакування: кожна потрібна річ — за назвою й місцем; взята (f.take-*) закреслюється, інші — ні', () => {
    const s0 = packing();
    const a0 = agendaOf(s0, DEFS);
    expect(a0?.phase).toBe('pack');
    const items0 = (a0?.items ?? []).filter((i) => i.id !== 'load');
    expect(items0.length).toBeGreaterThanOrEqual(3);
    expect(items0.every((i) => !i.done && 'item' in i.label && i.placeKey !== null)).toBe(true);   // назва речі + місце «де лежить»
    const id = NEEDED.find((n) => n === 'item.documents') ?? (NEEDED[0] as string);
    const a1 = agendaOf(packing([takeFlag(id)]), DEFS);
    expect(a1?.items.find((i) => 'item' in i.label && i.label.item === id)?.done, 'узяту річ видно закресленою').toBe(true);
    expect(a1?.items.filter((i) => i.done).length, 'лише вона одна').toBe(1);
    expect(a1?.doneCount).toBe(1);
    // Мутація: `done` у packItems не читає f.take-* (завжди false) — тест вище червоніє на `toBe(true)`.
  });
  it('пункт у фазі крамниці: намет у спорядженні закреслює «Купити намет», решта — ні; каса — коли квест завершено', () => {
    const s = withG(base(), { loc: 'loc.shop', quests: { 'ST-003': { status: 'active', done: [] } } });
    const done = (x: SimState): string[] => (agendaOf(x, DEFS)?.items ?? []).filter((i) => i.done).map((i) => i.id);
    expect(agendaOf(s, DEFS)?.phase).toBe('shop');
    expect(done(s)).toEqual(['go-shop']);   // ти вже в крамниці
    expect(done(withG(s, { inventory: { ...s.game.inventory, 'item.tent': 1 } }))).toEqual(['go-shop', 'tent']);
    expect(done(withG(s, { quests: { 'ST-003': { status: 'active', done: [] } }, inventory: {} }))).not.toContain('pay');
  });
  it('табір: ланцюг прибуття Елізa → намет → дрова → у намет читається з цілей квесту й запасів', () => {
    const camp = withG(base(), { loc: 'loc.camp.lake', quests: { 'ST-005': { status: 'active', done: ['meet-elise', 'pitch-tent'] } } });
    const a = agendaOf(camp, DEFS);
    expect(a?.phase).toBe('camp');
    expect(a?.items.map((i) => `${i.id}:${i.done ? 1 : 0}`)).toEqual(['elise:1', 'pitch:1', 'wood:0', 'bed:0']);
    expect(a?.items.filter((i) => i.current).map((i) => i.id)).toEqual(['wood']);
    const wood = withG(camp, { inventory: { ...camp.game.inventory, 'item.firewood': 2 } });
    expect(agendaOf(wood, DEFS)?.items.find((i) => i.id === 'wood')?.done).toBe(true);
  });
  it(`довгий список — вікно ≤ ${AGENDA_MAX}, що тримає перший відкритий пункт і щойно зроблені перед ним`, () => {
    const list = Array.from({ length: 9 }, (_, i) => i);
    for (let firstOpen = 0; firstOpen <= 9; firstOpen++) {
      const w = windowOf(list, firstOpen);
      expect(w.length).toBeLessThanOrEqual(AGENDA_MAX);
      if (firstOpen < 9) expect(w, `відкритий №${firstOpen} у вікні`).toContain(firstOpen);
      if (firstOpen >= 1 && firstOpen < 9) expect(w, 'видно хоч один зроблений перед ним').toContain(firstOpen - 1);
    }
    expect(agendaOf(packing(), DEFS)?.items.length).toBeLessThanOrEqual(AGENDA_MAX);
  });
});

describe('стрілка-навчання: лише день 1 і поки закрито менше двох пунктів', () => {
  it(`ONBOARDING_ITEMS=${ONBOARDING_ITEMS}: 0 і 1 зроблених пункти — стрілка є, 2 і більше — немає`, () => {
    const s = withG(base(), { loc: 'loc.shop', quests: { 'ST-003': { status: 'active', done: [] } } });
    expect(agendaOf(s, DEFS)?.doneCount).toBe(1);
    expect(onboarding(s), 'у крамниці 1 пункт — ще навчання').toBe(true);
    const two = withG(s, { inventory: { ...s.game.inventory, 'item.tent': 1 } });
    expect(onboarding(two), 'є намет → 2 пункти → стрілки немає').toBe(false);
    expect(onboarding(withG(base(), { loc: 'loc.home' })), 'початок дня — навчання').toBe(true);
    // Мутація: `< ONBOARDING_ITEMS` → `< 99` — «двох пунктів» стрілка не вимикається, другий вираз червоніє.
  });
  it('другого дня навчання немає, навіть якщо пунктів зроблено 0', () => {
    expect(onboarding(withG(base(), { loc: 'loc.home', minutes: 1440 + 600 }))).toBe(false);
    // Мутація: прибрати `dayOf(...) === 0` — червоніє.
  });
});

describe('мінімапа: крапки лише для відкритих пунктів цієї мапи', () => {
  it('зроблений пункт крапки не має, відкриті — мають; чужа мапа — порожньо', () => {
    const id = 'item.documents';
    const s = packing([takeFlag(id)]);
    const a = agendaOf(s, DEFS);
    const dots = minimapTargets(a, 'home');
    expect(dots).not.toContain(`pack.${id}`);
    expect(dots.length).toBeGreaterThanOrEqual(1);
    expect(dots.length).toBe((a?.items ?? []).filter((i) => !i.done && i.spot !== null).length);
    expect(minimapTargets(a, 'camp')).toEqual([]);
    expect(minimapTargets(null, 'home')).toEqual([]);
    // Мутація: прибрати фільтр `!i.done` — у dots з'явиться `pack.item.documents`, перший expect червоніє.
  });
  it('усе завантажено — «Завантажити» закреслене, пакування-крапки зникли', () => {
    const all = NEEDED.flatMap((n) => [packFlag(n)]);
    const a = agendaOf(packing(all), DEFS);
    expect(a?.items.every((i) => i.done)).toBe(true);
    expect(minimapTargets(a, 'home')).toEqual([]);
  });
});
