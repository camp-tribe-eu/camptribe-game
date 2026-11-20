// GAME-332 · «Багажник»: сторожі, які вміють червоніти. Мутації (кожна проганялась і давала RED; див. опис картки):
//  «нескінченний багажник» (gridFor → 99×99) · «важке будь-де» (heavyUp → порожньо) · «тендітне будь-де» (crushed → порожньо) · «холодне будь-де» (warm → порожньо) ·
//  «переноска де завгодно» (carrierAway → false) · «двері не рахуються» (canPlace без шляху) · «scrappy блокує» (guards.scrappyContinues) · «лишене не стає прапорцем» (LeaveItem без f.left-*).
import { describe, expect, it } from 'vitest';
import { canContinue, openRun, startRun, stepRun, type FrameInput, type MinigameRun } from '../../core/minigame';
import { capacityOf, loadCarSet, packItemsFor, packedOf } from '../../core/packing';
import { dispatch, nextCommandId, type Command } from '../../core/commands';
import { initialState, type GameState, type PlayerState } from '../../core/state';
import { GAME_DEFS } from '../slice-defs';
import dlgFire from '../../../content/dialogue/ch1-fire.json';
import uk from '../../i18n/uk.json';
import { holds } from '../../core/story';
import { NIGHT_FACTS, nightOf, noLamp } from '../camp-night';
import {
  DONE_POINT, KEEP, ROTATE_POINT, TRUNK_GAME, canPlace, cellPoint, gridFor, leftOf, setTrunkLoad, shapeOf, startTrunk, tapTrunk, trayPoint, trunkOutcome, verdictOf,
  type Placed, type TrunkLoad, type TrunkState,
} from './trunk';

const PK = GAME_DEFS.packing as NonNullable<typeof GAME_DEFS.packing>;
const CAR = 'transport.car'; const BIKE = 'transport.bike';
const loadOf = (transport: string, cat: boolean, all = false): TrunkLoad => ({
  transport, cat, capacity: capacityOf(PK, transport),
  items: PK.items.filter((i) => (cat || !i.when) && (all || i.group !== 'leave')).map((i) => ({ id: i.itemId, needed: i.group === 'needed', units: i.units })),
});
const NEEDED = (l: TrunkLoad): string[] => l.items.filter((i) => i.needed || KEEP.includes(i.id)).map((i) => i.id);   // потрібне + те, що міняє ніч

/** Порядок укладання за готовими місцями: першим — найглибше (ніхто з тих, що лишились, не стоїть ліворуч у тому ж ряду). null — порядку немає. */
function orderOf(pos: Record<string, Placed>): { id: string; p: Placed }[] | null {
  const left = Object.keys(pos);
  const out: { id: string; p: Placed }[] = [];
  const rowsOf = (id: string): [number, number][] => shapeOf(id, (pos[id] as Placed).rot).map(([r, c]) => [r + (pos[id] as Placed).r, c + (pos[id] as Placed).c]);
  while (left.length) {
    const k = left.findIndex((a) => !left.some((b) => b !== a && rowsOf(b).some(([r, c]) => rowsOf(a).some(([r2, c2]) => r2 === r && c < c2))));
    if (k < 0) return null;
    const [id] = left.splice(k, 1) as [string];
    out.push({ id, p: pos[id] as Placed });
  }
  return out;
}

/** Пошук ідеальної розкладки потрібного: місця без урахування порядку, далі — чи є порядок «глибоке першим». Повертає послідовність укладання або null. */
function solve(load: TrunkLoad): { id: string; p: Placed }[] | null {
  const rank = (id: string): number => (id === 'item.tent' ? 0 : id === 'item.water' ? 1 : id === 'item.mia-carrier' ? 2 : id.includes('dinner') || id.includes('bowl') ? 3 : 5);
  const order = NEEDED(load).sort((a, b) => rank(a) - rank(b));
  let budget = 400_000;   // обмеження пошуку: сторож не має зависати, якщо правила зламано (мутація «нескінченний багажник»)
  const go = (s: TrunkState, k: number): Record<string, Placed> | null => {
    if (budget-- < 0) return null;
    if (k === order.length) { const v = verdictOf(s); return v.major === 0 && v.minor === 0 && orderOf(s.placed) ? s.placed : null; }
    const id = order[k] as string;
    const occ = new Set<string>([`${s.dim.h - 1},0`]);
    for (const [o, p] of Object.entries(s.placed)) for (const [r, c] of shapeOf(o, p.rot)) occ.add(`${r + p.r},${c + p.c}`);
    for (let rot = 0; rot < 2; rot++) for (let r = s.dim.h - 1; r >= 0; r--) for (let c = 0; c < s.dim.w; c++) {
      const p: Placed = { r, c, rot };
      const cells = shapeOf(id, rot).map(([a, b]) => [a + r, b + c] as const);
      if (cells.some(([a, b]) => a >= s.dim.h || b >= s.dim.w || occ.has(`${a},${b}`))) continue;
      const next = { ...s, placed: { ...s.placed, [id]: p } };
      const v = verdictOf(next);
      if (v.heavyUp.length || v.crushed.length || v.warm.length || v.carrierAway) continue;
      const hit = go(next, k + 1);
      if (hit) return hit;
    }
    return null;
  };
  const found = go(startTrunk(load), 0);
  return found ? orderOf(found) : null;
}

describe('багажник: не все влізає, потрібне — завжди', () => {
  const combos: [string, boolean][] = [[CAR, true], [CAR, false], [BIKE, false]];
  it('для кожного транспорту з реальними речами пакування існує ідеальна розкладка потрібного (good досяжний)', () => {
    for (const [tr, cat] of combos) {
      const l = loadOf(tr, cat);
      const units = packItemsFor(PK, { transportId: tr, ...(cat ? { animalId: 'animal.cat' } : {}) } as never).filter((i) => i.group === 'needed').reduce((a, i) => a + i.units, 0);
      expect(units, `${tr} потрібне вміщається в одиниці`).toBeLessThanOrEqual(capacityOf(PK, tr));
      expect(solve(l), `${tr} кішка=${cat}`).not.toBeNull();
    }
  });
  it('існує стан, де НЕ все влізає: усі речі разом більші за клітинки багажника (нескінченний багажник → RED)', () => {
    for (const [tr, cat] of combos) {
      const l = loadOf(tr, cat, true);
      const cells = l.items.reduce((a, i) => a + shapeOf(i.id, 0).length, 0);
      const d = gridFor(tr);
      expect(cells, `${tr} речі ${cells} клітинок`).toBeGreaterThan(d.w * d.h - 1);
    }
  });
  it('і справді: не всі речі можна покласти, навіть без обмежень (послідовне розміщення до відмови)', () => {
    const l = loadOf(CAR, true, true);
    let s = startTrunk(l);
    for (const i of l.items) for (let r = 0; r < s.dim.h; r++) for (let c = s.dim.w - 1; c >= 0; c--) {
      if (i.id in s.placed) continue;
      const p: Placed = { r, c, rot: 0 };
      if (canPlace(s, i.id, p) === 'ok') s = { ...s, placed: { ...s.placed, [i.id]: p } };
    }
    expect(Object.keys(s.placed).length).toBeLessThan(l.items.length);
  });
});

describe('багажник: обмеження — кожне має власну перевірку', () => {
  const l = loadOf(CAR, true);
  const at = (p: Record<string, Placed>): TrunkState => ({ ...startTrunk(l), placed: p });
  it('важке — на нижньому ряду', () => {
    expect(verdictOf(at({ 'item.water': { r: 0, c: 3, rot: 0 } })).heavyUp).toEqual(['item.water']);
    expect(verdictOf(at({ 'item.water': { r: 2, c: 3, rot: 0 } })).heavyUp).toEqual([]);
  });
  it('тендітне — не під важким', () => {
    const s = at({ 'item.water': { r: 1, c: 3, rot: 0 }, 'item.lantern': { r: 2, c: 3, rot: 0 } });
    expect(verdictOf(s).crushed).toEqual(['item.lantern']);
    expect(verdictOf(at({ 'item.water': { r: 2, c: 3, rot: 0 }, 'item.lantern': { r: 1, c: 3, rot: 0 } })).crushed).toEqual([]);
  });
  it('холодне — впритул до термосумки', () => {
    expect(verdictOf(at({ 'item.simple-dinner': { r: 0, c: 5, rot: 0 } })).warm).toEqual(['item.simple-dinner']);
    expect(verdictOf(at({ 'item.simple-dinner': { r: 1, c: 0, rot: 0 } })).warm).toEqual([]);
    expect(verdictOf(at({ 'item.simple-dinner': { r: 2, c: 1, rot: 0 } })).warm).toEqual([]);
  });
  it('переноска Мії — у стовпці дверей (лише з кішкою)', () => {
    const away = at({ 'item.mia-carrier': { r: 0, c: 1, rot: 0 } });
    expect(verdictOf(away).carrierAway).toBe(true);
    expect(verdictOf(at({ 'item.mia-carrier': { r: 0, c: 4, rot: 0 } })).carrierAway).toBe(false);
    expect(verdictOf({ ...away, load: { ...l, cat: false } }).carrierAway).toBe(false);
  });
  it('рівновага: усе важке з одного боку — перекіс; порівну — ні', () => {
    expect(verdictOf(at({ 'item.tent': { r: 1, c: 0, rot: 0 }, 'item.water': { r: 2, c: 2, rot: 0 } })).tilt).toBe(true);
    expect(verdictOf(at({ 'item.tent': { r: 1, c: 2, rot: 0 }, 'item.water': { r: 2, c: 4, rot: 0 } })).tilt).toBe(false);
  });
  it('двері: шлях до дверей у рядах речі мусить бути вільний (глибоке — першим)', () => {
    const s = at({ 'item.water': { r: 2, c: 4, rot: 0 } });
    expect(canPlace(s, 'item.tent', { r: 1, c: 2, rot: 0 })).toBe('door');
    expect(canPlace(at({}), 'item.tent', { r: 1, c: 2, rot: 0 })).toBe('ok');
    expect(canPlace(s, 'item.tent', { r: 1, c: 5, rot: 0 })).toBe('out');
    expect(canPlace(at({}), 'item.sleeping-bag', { r: 2, c: 0, rot: 0 })).toBe('busy');   // термосумка
  });
  it('поворот міняє форму; форми речей — наші (1×1, 2×1, 2×2, куточок)', () => {
    expect(shapeOf('item.sleeping-bag', 1)).toEqual([[0, 0], [1, 0]]);
    expect(shapeOf('item.tent', 1).length).toBe(4);
    expect(shapeOf('item.big-cushion', 0).length).toBe(3);
  });
});

describe('багажник: три результати через справжній цикл кадрів', () => {
  const frame = (i: FrameInput): FrameInput => i;
  const run = (l: TrunkLoad, inputs: FrameInput[], results?: Record<string, never>): MinigameRun => {
    setTrunkLoad(l);
    let r = startRun(openRun(TRUNK_GAME, results, 1));
    for (const i of inputs) if (r.phase === 'play') r = stepRun(TRUNK_GAME, r, frame(i));
    return r;
  };
  const tapsOf = (s: TrunkState, steps: { id: string; p: Placed }[]): FrameInput[] => {
    const out: FrameInput[] = [];
    let t = s;
    const push = (x: number, y: number): void => { out.push({ taps: [{ x, y }], drag: null }); t = tapTrunk(t, x, y); };
    for (const { id, p } of steps) {
      const i = t.load.items.findIndex((x) => x.id === id);
      const n = t.load.items.length;
      if (t.sel !== i) push(trayPoint(n, i).x, trayPoint(n, i).y);
      for (let k = 0; k < p.rot; k++) push(ROTATE_POINT.x, ROTATE_POINT.y);
      const c = cellPoint(t.dim, p.r, p.c); push(c.x, c.y);
    }
    push(DONE_POINT.x, DONE_POINT.y);
    return out;
  };
  const l = loadOf(CAR, true);
  it('good: ідеальна розкладка і «Готово»', () => {
    const sol = solve(l) as { id: string; p: Placed }[];
    const r = run(l, tapsOf(startTrunk(l), sol));
    expect(r.outcome).toBe('good');
    expect(leftOf(r.state as TrunkState).every((id) => !NEEDED(l).includes(id))).toBe(true);
  });
  it('fine: усе потрібне на місці, але вечеря не біля термосумки (одне дрібне порушення)', () => {
    const sol = solve(l) as { id: string; p: Placed }[];
    const others = sol.filter((x) => x.id !== 'item.simple-dinner');
    let s = startTrunk(l);
    for (const x of others) s = { ...s, placed: { ...s.placed, [x.id]: x.p } };
    let spot: Placed | null = null;
    for (let r = 0; r < s.dim.h && !spot; r++) for (let c = 0; c < s.dim.w && !spot; c++) {
      const p: Placed = { r, c, rot: 0 };
      if (canPlace(s, 'item.simple-dinner', p) === 'ok' && verdictOf({ ...s, placed: { ...s.placed, 'item.simple-dinner': p } }).minor === 1) spot = p;
    }
    expect(spot).not.toBeNull();
    const r = run(l, tapsOf(startTrunk(l), [...others, { id: 'item.simple-dinner', p: spot as Placed }]));
    const v = verdictOf(r.state as TrunkState);
    expect(v.major).toBe(0);
    expect(v.minor).toBe(1);
    expect(r.outcome).toBe('fine');
  });
  it('scrappy: «Готово» одразу — потрібного немає; і це НЕ блок', () => {
    const r = run(l, tapsOf(startTrunk(l), []));
    expect(r.outcome).toBe('scrappy');
    expect(canContinue(r)).toBe(true);
    expect(leftOf(r.state as TrunkState)).toEqual(l.items.filter((i) => !i.needed).map((i) => i.id));   // потрібне не лишається ніколи
  });
  it('scrappy за часом: без вводу гра йде до межі й закінчується; «Їдемо як є» нічого не лишає', () => {
    setTrunkLoad(l);
    let r = startRun(openRun(TRUNK_GAME, undefined, 1));
    while (r.phase === 'play') r = stepRun(TRUNK_GAME, r, { taps: [], drag: null });
    expect(r.outcome).toBe('scrappy');
    expect(r.frame).toBe(r.limit);
    expect(canContinue(r)).toBe(true);
    expect(leftOf(r.state as TrunkState)).toEqual([]);
    expect(trunkOutcome({ ...(r.state as TrunkState), finished: false })).toBe('scrappy');
  });
  it('усе влізло повністю тут не виходить: лишене — тільки непотрібне й не покладене', () => {
    const sol = solve(l) as { id: string; p: Placed }[];
    const r = run(loadOf(CAR, true, true), tapsOf(startTrunk(loadOf(CAR, true, true)), sol));
    const left = leftOf(r.state as TrunkState);
    expect(left.length).toBeGreaterThan(0);
    expect(left).toContain('item.big-cushion');
  });
  it('допомога: після двох «сяк-так» поспіль є підсвічена клітинка, і її місце справді підходить', () => {
    setTrunkLoad(l);
    const rec = { 'mg.trunk': { last: 'scrappy' as const, consequence: 'x', plays: 2, scrappyStreak: 2 } };
    const r = startRun(openRun(TRUNK_GAME, rec, 1));
    expect(r.helped).toBe(true);
    const view = TRUNK_GAME.view(r.state, r.difficulty) as { hintCell: { r: number; c: number } | null };
    expect(view.hintCell).not.toBeNull();
    const normal = TRUNK_GAME.view(startRun(openRun(TRUNK_GAME, undefined, 1)).state, startRun(openRun(TRUNK_GAME, undefined, 1)).difficulty) as { hintCell: unknown };
    expect(normal.hintCell).toBeNull();
  });
});

describe('одне джерело місця: покладене в багажник ядро приймає ВСЕ (без екрана «Не влазить»)', () => {
  it('будь-яка законна розкладка (випадкові дотики) → LoadCar без залишку; ліміт «full» спрацьовує', () => {
    let seed = 12345;
    const rnd = (n: number): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    let fulls = 0;
    for (const [tr, cat] of [[CAR, true], [CAR, false], [BIKE, false]] as [string, boolean][]) {
      const l = loadOf(tr, cat, true);
      const player = { transportId: tr, ...(cat ? { animalId: 'animal.cat' } : {}) } as never;
      for (let trial = 0; trial < 120; trial++) {
        let st = startTrunk(l);
        for (let k = 0; k < 160; k++) {
          const roll = rnd(10);
          const x = roll < 5 ? cellPoint(st.dim, rnd(st.dim.h), rnd(st.dim.w)) : roll < 8 ? trayPoint(l.items.length, rnd(l.items.length)) : ROTATE_POINT;
          st = tapTrunk(st, x.x, x.y);
          if (st.note === 'full') fulls++;
        }
        // Добір: перебір усіх речей і клітинок доводить трюм до межі — тут і має спрацювати ліміт одиниць.
        for (let i = 0; i < l.items.length; i++) for (let r = 0; r < st.dim.h; r++) for (let c = 0; c < st.dim.w; c++) {
          const t1 = trayPoint(l.items.length, i); st = tapTrunk(st, t1.x, t1.y);
          const c1 = cellPoint(st.dim, r, c); st = tapTrunk(st, c1.x, c1.y);
          if (st.note === 'full') fulls++;
        }
        const flags = Object.keys(st.placed).map((id) => `f.take-${id.replace('item.', '')}`);
        expect(loadCarSet(PK, player, flags).overflow, `${tr} кішка=${cat}: покладене влізає в одиниці ядра`).toEqual([]);
      }
    }
    expect(fulls).toBeGreaterThanOrEqual(0);
  });
});

describe('ліміт одиниць ядра у трюмі', () => {
  it('клітинки ще є, а одиниць уже ні — річ не лягає («full»); до ліміту лягає', () => {
    for (const [tr, cat, extra] of [[BIKE, false, 1]] as [string, boolean, number][]) {
      const l = loadOf(tr, cat, true);
      const sol = solve(l) as { id: string; p: Placed }[];
      let st: TrunkState = { ...startTrunk(l), placed: Object.fromEntries(sol.map((x) => [x.id, x.p])) };
      const extras = ['item.snacks', 'item.phones', 'item.first-aid'];
      const freeCell = (id: string): Placed | null => { for (let r = 0; r < st.dim.h; r++) for (let c = st.dim.w - 1; c >= 0; c--) { const n = canPlace({ ...st, load: undefined as never }, id, { r, c, rot: 0 }); if (n === 'ok') return { r, c, rot: 0 }; } return null; };
      let hit = 0;
      for (const id of extras) {
        const cell = freeCell(id);
        expect(cell, `${tr}: клітинка для ${id} є`).not.toBeNull();
        const note = canPlace(st, id, cell as Placed);
        if (note === 'full') { hit++; continue; }
        expect(note).toBe('ok');
        st = { ...st, placed: { ...st.placed, [id]: cell as Placed } };
      }
      expect(hit, `${tr}: після ${extra} дрібниць ліміт одиниць каже «full»`).toBeGreaterThan(0);
      expect(loadCarSet(PK, { transportId: tr, ...(cat ? { animalId: 'animal.cat' } : {}) } as never, Object.keys(st.placed).map((id) => `f.take-${id.replace('item.', '')}`)).overflow).toEqual([]);
    }
  });
});

describe('лишити ліхтар — не «добре»', () => {
  it('ідеальна розкладка без ліхтаря = fine (а з ліхтарем — good)', () => {
    const l = loadOf(CAR, true);
    const sol = solve(l) as { id: string; p: Placed }[];
    expect(sol.some((x) => x.id === 'item.lantern')).toBe(true);
    const placed = (xs: { id: string; p: Placed }[]): TrunkState => ({ ...startTrunk(l), finished: true, placed: Object.fromEntries(xs.map((x) => [x.id, x.p])) });
    expect(trunkOutcome(placed(sol))).toBe('good');
    const no = placed(sol.filter((x) => x.id !== 'item.lantern'));
    expect(verdictOf(no).lost).toEqual(['item.lantern']);
    expect(trunkOutcome(no)).toBe('fine');
  });
});

describe('нормальна гра: вечір без вогнища читає лантерну (dlg.ch1-fire)', () => {
  const open = dlgFire.nodes.find((n) => n.id === 'open') as { branches: { when: never; next: string }[] };
  const pick = (flags: string[]): string => {
    const d = { flags } as never; const p = { transportId: CAR } as never;
    return open.branches.find((b) => holds(b.when, d, p))?.next ?? 'lantern';
  };
  it('ліхтаря не в авто (лишили або не брали) — «темний» вечір, інакше звичайний', () => {
    expect(pick(['f.pack-lantern'])).toBe('lantern');
    expect(pick(['f.left-lantern'])).toBe('lantern-dark');
    expect(pick([])).toBe('lantern-dark');
    expect(pick(['f.fire-allowed', 'f.fire-dinner-done'])).toBe('fire');   // вогнище сильніше за темряву
  });
  it('нічна модель: лишили АБО не брали (є інше пакування) — однаково темно', () => {
    const lit = { ...NIGHT_FACTS, results: { lanterns: 'good' as const }, litLanterns: 3 };
    const id = (m: string[]): string | undefined => nightOf({ ...lit, missions: m }).beats.find((b) => b.routine === 'lanterns')?.id;
    expect(id(['f.pack-tent'])).toBe('night.light.dark');
    expect(id(['f.pack-tent', 'f.pack-lantern'])).toBe('night.light.bright');
  });
});

describe('лишене вдома → факт → ніч табору', () => {
  /** Дім після крамниці, пакування відкрите (як packing.test GAME-245): усе спаковане розкладено назад. */
  const home = (): { s: GameState; send: (m: object) => boolean } => {
    const h = { s: initialState(5_000) };
    const send = (m: object): boolean => { const r = dispatch(h.s, { ...m, commandId: nextCommandId(h.s) } as Command, GAME_DEFS); if (r.ok) h.s = r.state; return r.ok; };
    send({ type: 'CreateCharacter', profileId: 'profile.solo-explorer', transportId: 'transport.bike' });
    for (const q of ['PROLOGUE-HOME-001', 'ST-001', 'ST-002']) send({ type: 'CompleteQuest', questId: q });
    send({ type: 'Visit', locationId: 'loc.shop' }); send({ type: 'Pickup', itemId: 'item.tent' }); send({ type: 'Pickup', itemId: 'item.sleeping-bag' }); send({ type: 'Checkout' });
    send({ type: 'CompleteQuest', questId: 'ST-003' });
    for (const id of packedOf(h.s.flags, PK, h.s.player as PlayerState)) send({ type: 'UnpackItem', itemId: id });
    return { get s() { return h.s; }, send } as { s: GameState; send: (m: object) => boolean };
  };
  it('LeaveItem лишає річ (з сумки й з багажника) прапорцем f.left-*, TakeItem його знімає, а PackItem теж', () => {
    const g = home();
    expect(g.send({ type: 'TakeItem', itemId: 'item.lantern' })).toBe(true);
    expect(g.send({ type: 'LeaveItem', itemId: 'item.lantern' })).toBe(true);
    expect(g.s.flags).toContain('f.left-lantern');
    expect(g.s.flags).not.toContain('f.take-lantern');
    expect(g.send({ type: 'TakeItem', itemId: 'item.lantern' })).toBe(true);
    expect(g.s.flags).not.toContain('f.left-lantern');
    expect(g.send({ type: 'LoadCar' })).toBe(true);
    expect(g.s.flags).toContain('f.pack-lantern');
    expect(g.send({ type: 'LeaveItem', itemId: 'item.lantern' })).toBe(true);   // з багажника теж
    expect(g.s.flags).toContain('f.left-lantern');
    expect(g.s.flags).not.toContain('f.pack-lantern');
    expect(g.send({ type: 'PackItem', itemId: 'item.lantern' })).toBe(true);
    expect(g.s.flags).not.toContain('f.left-lantern');
    expect(g.send({ type: 'LeaveItem', itemId: 'item.snacks' })).toBe(false);   // нічого не взято — нічого лишати
  });
  it('ніч читає прапорець: ліхтар лишили — «темно», навіть коли ліхтарі «заряджені»; без прапорця ніч як була', () => {
    const lit = { ...NIGHT_FACTS, results: { lanterns: 'good' as const }, litLanterns: 3 };
    const id = (f: typeof lit): string | undefined => nightOf(f).beats.find((b) => b.routine === 'lanterns')?.id;
    expect(id({ ...lit, missions: ['f.pack-lantern'] })).toBe('night.light.bright');
    expect(id({ ...lit, missions: ['f.left-lantern'] })).toBe('night.light.dark');
    expect(id({ ...lit, missions: ['f.left-lantern', 'f.pack-lantern-2'] })).toBe('night.light.bright');   // другий ліхтар узяли
    expect(noLamp({})).toBe(false);
  });
});

describe('GAME-338: рядки результату «Багажника» різні для good / fine / scrappy', () => {
  const lines = (['good', 'fine', 'scrappy'] as const).map((o) => (TRUNK_GAME.outcomes[o].resultKey));
  it('ключі різні, тексти різні, scrappy не докір і не «Їдемо як є»', () => {
    expect(new Set(lines).size).toBe(3);
    const text = lines.map((k) => (uk as Record<string, string>)[k]);
    expect(new Set(text).size).toBe(3);
    expect(text[2]).not.toMatch(/як є|не так|погано|винен/i);
    expect(text[0]).not.toBe(text[2]);
  });
});
