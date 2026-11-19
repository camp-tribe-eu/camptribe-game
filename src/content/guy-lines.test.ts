// GAME-333 · «Вузли»: рівні розв'язні, правила (перетини, натяг, вітер) і результат у ночі. Кожен сторож має мутацію, що його червонить (перевірено вручну):
//  · crosses → завжди false → «перетин» і «розв'язок не перетинає» червоніють;
//  · tensionOf → завжди 'ok' → «натяг» червоніє;
//  · windOk → завжди true → «вітер» червоніє;
//  · camp-night: гілка knots ігнорує результат (завжди 'held') → «результат доходить до ночі» червоніє;
//  · knotsOutcome без перевірки перетинів у 'fine' → «сяк-так при перетині» червоніє.
import src from '../ui/CampRoutines.tsx?raw';
import { describe, expect, it } from 'vitest';
import { BAND, LEVELS, crossingPairs, crosses, faults, knotsOutcome, levelOf, lineLen, solve, startKnots, tapPeg, tapRing, tensionOf, windOk, windward, type KnotState } from './guy-lines';
import { MIN_WORK, canFinish } from './camp-day';
import { NIGHT_FACTS, nightKeys, nightOf, type NightFacts } from './camp-night';
import { RELAXED } from './minigame';

const linked = (seed: number, links: readonly number[]): KnotState => ({ ...startKnots(seed), links });
const solved = (seed: number): KnotState => linked(seed, solve(levelOf(seed)) as readonly number[]);

describe('рівні', () => {
  it('кілець 4–6, кілків 6–8, кілків більше за кільця', () => {
    for (const l of LEVELS) { expect(l.rings.length).toBeGreaterThanOrEqual(4); expect(l.rings.length).toBeLessThanOrEqual(6); expect(l.pegs.length).toBeGreaterThanOrEqual(6); expect(l.pegs.length).toBeLessThanOrEqual(8); expect(l.pegs.length).toBeGreaterThan(l.rings.length); }
  });
  it('кожен рівень розв\'язний, і для всіх насінин дня (з дзеркалом)', () => {
    for (let seed = 0; seed < 24; seed++) {
      const l = levelOf(seed);
      const sol = solve(l);
      expect(sol, `насіння ${seed}`).not.toBeNull();
      expect(knotsOutcome(solved(seed)), `насіння ${seed}`).toBe('good');
    }
    expect(new Set(LEVELS.map((l) => l.rings.length)).size).toBe(3);
  });
  it('навітряний бік однозначний: друге й третє кільця за проєкцією різні', () => {
    for (const l of LEVELS) {
      const k = l.rings.map((r) => (r.x - 50) * l.wind.x + (r.y - 50) * l.wind.y).sort((a, b) => b - a);
      expect((k[1] as number) - (k[2] as number)).toBeGreaterThan(2);
    }
  });
  it('правила важливі: без кожного з них розв\'язків було б більше (рівень не вгадується)', () => {
    const l = levelOf(1);
    const all = (ok: (links: readonly number[]) => boolean): number => {
      let n = 0; const links = l.rings.map(() => -1);
      const go = (i: number): void => { if (i === l.rings.length) { if (ok(links)) n++; return; } for (let j = 0; j < l.pegs.length; j++) { if (links.includes(j)) continue; links[i] = j; go(i + 1); links[i] = -1; } };
      go(0); return n;
    };
    const rules = (lk: readonly number[]): boolean => crossingPairs(l, lk).length === 0 && lk.every((_, i) => tensionOf(lineLen(l, lk, i) as number) === 'ok');
    const full = all((lk) => rules(lk) && windOk(l, lk));
    expect(full).toBeGreaterThan(0);
    expect(all(rules)).toBeGreaterThan(full);
    expect(all((lk) => windOk(l, lk) && lk.every((_, i) => tensionOf(lineLen(l, lk, i) as number) === 'ok'))).toBeGreaterThan(full);
  });
});

describe('перетин', () => {
  it('відрізки, що перехрещуються, — перетин; розведені й дотик кінцем — ні', () => {
    expect(crosses({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 })).toBe(true);
    expect(crosses({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 5 }, { x: 10, y: 5 })).toBe(false);
    expect(crosses({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 9 })).toBe(false);
  });
  it('розв\'язок не перетинає, а скрещена пара кілків — так', () => {
    const l = levelOf(1); const sol = solve(l) as readonly number[];
    expect(crossingPairs(l, sol)).toEqual([]);
    let found = false;
    for (let a = 0; a < sol.length && !found; a++) for (let b = a + 1; b < sol.length && !found; b++) {
      const sw = sol.map((p, i) => (i === a ? (sol[b] as number) : i === b ? (sol[a] as number) : p));
      if (crossingPairs(l, sw).length > 0) { found = true; expect(faults(linked(1, sw)).crossings).toBeGreaterThan(0); expect(knotsOutcome(linked(1, sw))).not.toBe('good'); }
    }
    expect(found).toBe(true);
  });
  it('перетин — сяк-так, навіть коли решта в порядку', () => {
    const l = levelOf(1); const sol = solve(l) as readonly number[];
    for (let a = 0; a < sol.length; a++) for (let b = a + 1; b < sol.length; b++) {
      const sw = sol.map((p, i) => (i === a ? (sol[b] as number) : i === b ? (sol[a] as number) : p));
      if (crossingPairs(l, sw).length > 0) expect(knotsOutcome(linked(1, sw))).toBe('scrappy');
    }
  });
});

describe('перетин не купити дрібним огріхом', () => {
  it('є розкладка лише з одним перетином і без інших огріхів — і вона «сяк-так», а не «нормально»', () => {
    for (const seed of [0, 1, 2]) {
      const l = levelOf(seed); const links = l.rings.map(() => -1); let hit: readonly number[] | null = null;
      const go = (i: number): void => {
        if (hit) return;
        if (i === l.rings.length) { const f = faults(linked(seed, links)); if (f.crossings === 1 && f.tension === 0) hit = [...links]; return; }
        for (let j = 0; j < l.pegs.length; j++) { if (links.includes(j)) continue; links[i] = j; go(i + 1); links[i] = -1; }
      };
      go(0);
      expect(hit, `насіння ${seed}`).not.toBeNull();
      expect(knotsOutcome(linked(seed, hit as unknown as readonly number[])), `насіння ${seed}`).toBe('scrappy');
    }
  });
});

describe('натяг', () => {
  it('смуга: коротше — тягне кілок, довше — провисає, поміж — рівно', () => {
    expect(tensionOf(BAND.min - 0.1)).toBe('short');
    expect(tensionOf(BAND.max + 0.1)).toBe('long');
    expect(tensionOf((BAND.min + BAND.max) / 2)).toBe('ok');
    expect(tensionOf(BAND.max + 1)).toBe('long');
    expect(tensionOf(BAND.max + 1, RELAXED)).toBe('ok');   // послаблення розширює смугу
  });
  it('мотузка поза смугою — огріх натягу; розв\'язок усі в смузі', () => {
    const s = solved(1); const l = levelOf(1);
    expect(faults(s).tension).toBe(0);
    for (let i = 0; i < l.rings.length; i++) expect(tensionOf(lineLen(l, s.links, i) as number)).toBe('ok');
    const bad = l.pegs.map((_, j) => j).find((j) => !s.links.includes(j) && tensionOf(lineLen(l, s.links.map((p, k) => (k === 0 ? j : p)), 0) as number) !== 'ok');
    expect(bad).toBeDefined();
    const f = faults(linked(1, s.links.map((p, k) => (k === 0 ? (bad as number) : p))));
    expect(f.tension).toBeGreaterThan(0);
  });
});

describe('вітер: навітряні кільця мають найкоротші мотузки', () => {
  it('у розв\'язку навітряні не довші за решту; зі зворотним вибором — порушення', () => {
    for (const seed of [0, 1, 2, 3, 4, 5]) {
      const l = levelOf(seed); const s = solved(seed);
      expect(windward(l)).toHaveLength(2);
      expect(windOk(l, s.links)).toBe(true);
      expect(faults(s).wind).toBe(true);
    }
    // знайти правильні за натягом і перетинами призначення, де вітер порушено: вони мають бути не «добре»
    const l = levelOf(1); const links = l.rings.map(() => -1); let hit: readonly number[] | null = null;
    const go = (i: number): void => {
      if (hit) return;
      if (i === l.rings.length) { if (!windOk(l, links)) hit = [...links]; return; }
      for (let j = 0; j < l.pegs.length; j++) { if (links.includes(j)) continue; links[i] = j; if (tensionOf(lineLen(l, links, i) as number) === 'ok' && crossingPairs(l, links).length === 0) go(i + 1); links[i] = -1; }
    };
    go(0);
    expect(hit, 'є розкладка без перетинів і в смузі, що порушує вітер').not.toBeNull();
    const f = faults(linked(1, hit as unknown as readonly number[]));
    expect(f.wind).toBe(false);
    expect(f.crossings + f.tension + f.open).toBe(0);
    expect(knotsOutcome(linked(1, hit as unknown as readonly number[]))).toBe('fine');
  });
});

describe('дотики', () => {
  it('кільце → кілок з\'єднує; повторний дотик по з\'єднаному кільцю знімає; зайнятий кілок і кілок без вибору — нічого', () => {
    let s = startKnots(1);
    expect(tapPeg(s, 0).event).toBe('none');
    s = tapRing(s, 0).state;
    expect(s.sel).toBe(0);
    expect(tapRing(s, 0).state.sel).toBeNull();
    const r = tapPeg(s, 2);
    expect(r.event).toBe('link'); s = r.state;
    expect(s.links[0]).toBe(2);
    s = tapRing(s, 1).state;
    expect(tapPeg(s, 2).event).toBe('none');
    const u = tapRing(linked(1, [2, -1, -1, -1, -1]), 0);
    expect(u.event).toBe('undo'); expect(u.state.links[0]).toBe(-1);
  });
  it('нічого не з\'єднано — «сяк-так», але результат є (м\'який провал)', () => {
    expect(knotsOutcome(startKnots(1))).toBe('scrappy');
    expect(faults(startKnots(1)).open).toBe(levelOf(1).rings.length);
  });
  it('розв\'язок із однією вільною мотузкою — «нормально»', () => {
    const s = solved(1);
    expect(knotsOutcome({ ...s, links: s.links.map((p, k) => (k === 0 ? -1 : p)) })).toBe('fine');
  });
});

describe('вихід і ніч', () => {
  it('«Закріпити» стоїть за canFinish і здаватись можна (не пастка)', () => {
    expect(src).toMatch(/data-ui="knots-done" disabled=\{!ok\('knots'\)\}/);
    const [a, ms, give] = MIN_WORK.knots;
    expect(canFinish('knots', 0, 0)).toBe(false);
    expect(canFinish('knots', a, ms)).toBe(true);
    expect(canFinish('knots', 0, give as number)).toBe(true);
  });
  const base: NightFacts = { ...NIGHT_FACTS, results: { knots: 'good' } };
  const knotBeat = (o?: 'good' | 'fine' | 'scrappy'): string | undefined => nightOf(o ? { ...base, results: { knots: o } } : { ...base, results: {} }).beats.find((b) => b.routine === 'knots')?.id;
  it('результат доходить до ночі: добре — тримає, нормально — провис, сяк-так — лусне, не ходили — не натягнуто', () => {
    expect(knotBeat('good')).toBe('night.knots.held');
    expect(knotBeat('fine')).toBe('night.knots.sag');
    expect(knotBeat('scrappy')).toBe('night.knots.snap');
    expect(knotBeat()).toBe('night.knots.none');
    expect(new Set(['good', 'fine', 'scrappy', undefined].map((o) => knotBeat(o as 'good')))).toHaveProperty('size', 4);
    expect(nightKeys({ ...base, results: { knots: 'scrappy' } })).not.toEqual(nightKeys(base));
  });
  it('сяк-так не блокує ніч і не завершує гру', () => {
    const n = nightOf({ ...base, results: { knots: 'scrappy' } });
    expect(n.blocked).toBe(false);
    expect(n.morning).toBe(true);
    expect(n.beats.find((b) => b.routine === 'knots')?.severity).toBe('rough');
  });
});
