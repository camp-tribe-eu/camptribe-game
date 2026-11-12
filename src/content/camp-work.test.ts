// GAME-311 · робота семи рутин: жодну не закрити одним дотиком, у кожної всі три результати, «сяк-так» не блокує.
// Мутації, що роблять цей файл червоним: «відро наливається саме» (tick без down наповнює) · «ліхтар заряджається в тіні»
// (stepLanterns не дивиться на at === sun) · «динамо без смуги» (будь-який тап = CRANK_GAIN) · «жар не падає» (COOL_PER_S = 0)
// · «двійник невідрізненний» (looksBitter → false) · «кошик безмежний» (BASKET = 999) · «їжа надворі не рахується»
// (foodOutside → false) · «під тент влазить усе» (COVER = 99) · «риба однакова завжди» (speciesAt без part/weather).
import { describe, expect, it } from 'vitest';
import { NORMAL, RELAXED, grade, type Outcome } from './minigame';
import { BRIM, FILL_MS, STEPS, drift, needSide, startWater, stepWater, tiltLimit, waterOutcome, waterScore, type Side, type WaterState } from './water-carry';
import { CRANK_BAND, CRANK_GAIN, CRANK_MS, LANTERNS, SPOTS, SUN_SHIFT_MS, lanternOutcome, lanternScore, litCount, startLanterns, stepLanterns, sunRate, type LanternState } from './lantern-charge';
import { COOL_PER_S, DISHES, emberOutcome, emberScore, inBand, startEmbers, stepEmbers, type EmberState } from './embers';
import { BASKET, BUSHES, berryOutcome, berryScore, bitterCount, enoughBerries, hinted, looksBitter, patchOf, pickBerry, ripeCount, startBerries } from './berries-patch';
import { CAR_ROOM, THINGS, foodOutside, putThing, rightPlace, sleepNow, startTidy, tidyOutcome, tidyScore } from './night-camp';
import { COVER, ENOUGH_DRY, LOGS, dryLogs, enoughDry, finishStack, placeLog, stackOutcome, startStack } from './firewood-stack';
import { DAY_PARTS, SUPPER_FISH, speciesAt, speciesIndexes, supperFish, waitFactor } from './fish-table';
import { WEATHERS } from '../core/weather';

// ─── вода ────────────────────────────────────────────────────────────────────────────────────────
const fill = (ms: number): WaterState => stepWater(startWater(7), { kind: 'tick', dtMs: ms, down: true }).state;
const carry = (ms: number): WaterState => stepWater(fill(ms), { kind: 'tick', dtMs: 16, down: false }).state;
const walk = (s0: WaterState, right: (s: WaterState) => Side): WaterState => {
  let s = s0;
  for (let k = 0; k < STEPS; k++) s = stepWater(s, { kind: 'step', side: right(s) }).state;
  return s;
};

describe('вода: набрати й донести', () => {
  it('одним дотиком не закрити: без утримання крана води немає, а до табору — десять кроків', () => {
    const idle = startWater(7);
    expect(stepWater(idle, { kind: 'tick', dtMs: 1000, down: false }).state).toEqual(idle);
    expect(stepWater(idle, { kind: 'step', side: 'left' }).state).toEqual(idle);
    const s = walk(carry(FILL_MS), (x) => needSide(x));
    expect(s.phase).toBe('done');
    expect(s.step).toBe(STEPS);
  });
  it('правильна нога тримає відро рівно, хибна — хлюпає', () => {
    const good = walk(carry(FILL_MS * 0.6), (s) => needSide(s));
    expect(good.spills).toBe(0);
    const other = (s: Side): Side => (s === 'left' ? 'right' : 'left');
    const bad = walk(carry(FILL_MS * 0.6), (s) => other(needSide(s)));
    expect(bad.spills).toBeGreaterThan(0);
    expect(waterScore(bad)).toBeLessThan(waterScore(good));
  });
  it('повне відро нести важче: межа нахилу менша', () => {
    expect(tiltLimit(1)).toBeLessThan(tiltLimit(BRIM - 0.1));
  });
  it('стежка детермінована: те саме зерно — ті самі нахили', () => {
    expect([0, 1, 2, 3].map((k) => drift(7, k))).toEqual([0, 1, 2, 3].map((k) => drift(7, k)));
    expect([0, 1, 2, 3, 4, 5].map((k) => drift(7, k)).join()).not.toBe([0, 1, 2, 3, 4, 5].map((k) => drift(8, k)).join());
  });
  it('усі три результати досяжні, і «сяк-так» усе одно доходить до табору', () => {
    const other = (s: Side): Side => (s === 'left' ? 'right' : 'left');
    const good = walk(carry(FILL_MS), (s) => needSide(s));
    const bad = walk(carry(FILL_MS), (s) => other(needSide(s)));
    expect(waterOutcome(good)).toBe('good');
    expect(waterOutcome(bad)).toBe('scrappy');
    expect(bad.phase).toBe('done');
    const half = walk(carry(FILL_MS * 0.62), (s) => needSide(s));
    expect(waterOutcome(half)).toBe('fine');
  });
});

// ─── ліхтарі ─────────────────────────────────────────────────────────────────────────────────────
const tickL = (s: LanternState, dtMs: number, weather: 'sunny' | 'cloudy' | 'rain'): LanternState => stepLanterns(s, { kind: 'tick', dtMs, weather }).state;

describe('ліхтарі: сонце або динамо', () => {
  it('ліхтар у тіні не заряджається, на сонячній плямі — заряджається', () => {
    const s0 = startLanterns();
    const shade = tickL(stepLanterns(s0, { kind: 'put', lantern: 0, spot: (s0.sun + 1) % SPOTS }).state, 1000, 'sunny');
    expect(shade.charge[0]).toBe(0);
    const sunny = tickL(stepLanterns(s0, { kind: 'put', lantern: 0, spot: s0.sun }).state, 1000, 'sunny');
    expect(sunny.charge[0]).toBeGreaterThan(0);
  });
  it('сонце повзе: забутий ліхтар лишається в тіні, і його треба перекласти', () => {
    let s = stepLanterns(startLanterns(), { kind: 'put', lantern: 0, spot: 0 }).state;
    const sun0 = s.sun;
    s = tickL(s, SUN_SHIFT_MS + 16, 'sunny');
    expect(s.sun).not.toBe(sun0);
    const before = s.charge[0] ?? 0;
    s = tickL(s, 2000, 'sunny');
    expect(s.charge[0]).toBe(before);
  });
  it('у дощ сонця немає зовсім — лишається динамо', () => {
    expect(sunRate('rain')).toBe(0);
    expect(sunRate('cloudy')).toBeGreaterThan(0);
    expect(sunRate('sunny')).toBeGreaterThan(sunRate('cloudy'));
  });
  it('динамо: тап у смузі дає заряд, поза смугою — майже нічого; одним тапом три ліхтарі не зарядити', () => {
    const base = startLanterns();
    const atBand = { ...base, crankT: CRANK_MS * ((CRANK_BAND.from + CRANK_BAND.to) / 2) };
    const hit = stepLanterns(atBand, { kind: 'crank', lantern: 0 });
    expect(hit.event).toBe('crank');
    expect(hit.state.charge[0]).toBeCloseTo(CRANK_GAIN, 5);
    const off = stepLanterns({ ...base, crankT: 0 }, { kind: 'crank', lantern: 0 });
    expect(off.event).toBe('weak');
    expect(off.state.charge[0]).toBeLessThan(CRANK_GAIN);
    expect(lanternScore(hit.state)).toBeLessThan(0.4);
  });
  it('усі три результати: нічого / половина / повні три ліхтарі', () => {
    expect(lanternOutcome(startLanterns())).toBe('scrappy');
    const half: LanternState = { ...startLanterns(), charge: [1, 0.5, 0.2] };
    expect(lanternOutcome(half)).toBe('fine');
    expect(litCount(half)).toBe(2);
    const full: LanternState = { ...startLanterns(), charge: Array.from({ length: LANTERNS }, () => 1) };
    expect(lanternOutcome(full)).toBe('good');
    expect(litCount(full)).toBe(LANTERNS);
  });
});

// ─── вогонь ──────────────────────────────────────────────────────────────────────────────────────
const cook = (dry: boolean, keep: boolean): EmberState => {
  let s = startEmbers(dry);
  for (let k = 0; k < 2000 && !s.done; k++) {
    if (keep && !inBand(s, NORMAL)) {
      const d = DISHES[s.dish];
      const act = d && s.heat < d.band.from ? 'blow' : 'rake';
      s = stepEmbers(s, { kind: 'act', act }).state;
    }
    s = stepEmbers(s, { kind: 'tick', dtMs: 50 }).state;
  }
  return s;
};

describe('вогонь: жар у смузі', () => {
  it('жар сам падає: без дій вечеря сира, і це «сяк-так», а не блок', () => {
    expect(COOL_PER_S).toBeGreaterThan(0);
    const left = cook(true, false);
    expect(left.done).toBe(true);
    expect(emberOutcome(left)).toBe('scrappy');
  });
  it('тримав жар у смузі — добра вечеря; страв три, і смуги в них різні', () => {
    const good = cook(true, true);
    expect(good.quality).toHaveLength(DISHES.length);
    expect(emberScore(good)).toBeGreaterThan(emberScore(cook(true, false)));
    expect(new Set(DISHES.map((d) => `${d.band.from}-${d.band.to}`)).size).toBe(DISHES.length);
  });
  it('вогкі дрова дають менше жару: та сама гра — гірший результат', () => {
    expect(emberScore(cook(false, true))).toBeLessThan(emberScore(cook(true, true)));
  });
  it('дрова спершу дають дим і лише потім жар — одним дотиком вечерю не зварити', () => {
    const s = stepEmbers(startEmbers(true), { kind: 'act', act: 'wood' });
    expect(s.state.heat).toBeLessThan(startEmbers(true).heat);
    expect(s.state.smokeMs).toBeGreaterThan(0);
  });
});

// ─── ягоди ───────────────────────────────────────────────────────────────────────────────────────
describe('ягоди: стиглі проти гіркого двійника', () => {
  const patch = patchOf(5);
  it('ознаки чесні: матова + гладенький листок — рівно гіркий двійник', () => {
    for (const b of patch) expect(looksBitter(b)).toBe(b.kind === 'bitter');
    expect(patch.filter((b) => b.kind === 'bitter').length).toBeGreaterThan(0);
    expect(patch.filter((b) => b.kind === 'ripe').length).toBeGreaterThan(0);
  });
  it('кошик скінченний: усіх кущів у нього не вкласти', () => {
    expect(BASKET).toBeLessThan(BUSHES);
    let s = startBerries(5);
    for (let i = 0; i < BUSHES; i++) s = pickBerry(s, i).state;
    expect(s.basket).toHaveLength(BASKET);
    expect(s.done).toBe(true);
  });
  it('двійник у кошику коштує місця й оцінки; одна ягода — ще не рутина', () => {
    const first = pickBerry(startBerries(5), patch.findIndex((b) => b.kind === 'ripe')).state;
    expect(berryOutcome(first)).toBe('scrappy');
    const ripeIdx = patch.map((b, i) => (b.kind === 'ripe' ? i : -1)).filter((i) => i >= 0);
    const bitterIdx = patch.map((b, i) => (b.kind === 'bitter' ? i : -1)).filter((i) => i >= 0);
    let clean = startBerries(5);
    for (const i of ripeIdx) clean = pickBerry(clean, i).state;
    let mixed = startBerries(5);
    for (const i of [...bitterIdx, ...ripeIdx]) mixed = pickBerry(mixed, i).state;
    expect(bitterCount(mixed)).toBeGreaterThan(0);
    expect(berryScore(mixed)).toBeLessThan(berryScore(enoughBerries(clean)));
    expect(ripeCount(clean)).toBeGreaterThan(0);
  });
  it('допомога підсвічує сумнівні кущі, але не збирає за гравця', () => {
    const s = startBerries(5);
    expect(hinted(s, NORMAL)).toEqual([]);
    const marks = hinted(s, RELAXED);
    expect(marks.length).toBe(patch.filter((b) => b.kind === 'bitter').length);
    expect(s.basket).toHaveLength(0);
  });
});

// ─── порядок у таборі ────────────────────────────────────────────────────────────────────────────
describe('порядок: нічний табір', () => {
  it('кожна річ — свідомо на своє місце; в авто влазить не все', () => {
    let s = startTidy();
    for (const t of THINGS.filter((x) => x.kind === 'food')) s = putThing(s, t.id, 'car').state;
    expect(s.put['berries']).toBeUndefined();
    const full = putThing(s, 'berries', 'car');
    expect(full.event).toBe('carFull');
    expect(Object.values(s.put).filter((p) => p === 'car')).toHaveLength(CAR_ROOM);
  });
  it('їжа надворі видно як їжу надворі — і це те, що читає ніч', () => {
    expect(foodOutside(startTidy())).toBe(true);
    let s = startTidy();
    s = putThing(s, 'pot', 'car').state;
    s = putThing(s, 'bread', 'hung').state;
    expect(foodOutside(s)).toBe(true);
    s = putThing(s, 'berries', 'hung').state;
    expect(foodOutside(s)).toBe(false);
    expect(rightPlace({ id: 'pot', kind: 'food' }, 'bin')).toBe(false);
  });
  it('усі три результати; «спати» з півпорядком пускає далі', () => {
    expect(tidyOutcome(startTidy())).toBe('scrappy');
    let s = startTidy();
    for (const t of THINGS) s = putThing(s, t.id, t.kind === 'food' ? (Object.values(s.put).filter((p) => p === 'car').length < CAR_ROOM ? 'car' : 'hung') : t.kind === 'rubbish' ? 'bin' : 'tarp').state;
    expect(tidyScore(s)).toBe(1);
    expect(tidyOutcome(s)).toBe('good');
    const half = sleepNow(putThing(putThing(startTidy(), 'pot', 'car').state, 'tins', 'bin').state);
    expect(half.done).toBe(true);
    expect(grade(tidyScore(half))).toBe('scrappy');
  });
});

// ─── дрова ───────────────────────────────────────────────────────────────────────────────────────
describe('дрова: сухі чи близькі, і як укласти', () => {
  const stackAll = (place: 'near' | 'far') => {
    let s = startStack(place);
    for (let i = 0; i < LOGS.length; i++) {
      const r = placeLog(s, i, true);
      s = r.event === 'noRoom' ? placeLog(s, i, false).state : r.state;   // під тентом немає місця — лишаємо назовні
    }
    return finishStack(s);
  };
  it('під тент влазить не все: решта лишається мокнути', () => {
    const s = stackAll('far');
    expect(s.under).toHaveLength(COVER);
    expect(s.outside.length).toBeGreaterThan(0);
  });
  it('далекий сухий ліс дає сухі дрова, близький сушняк — наполовину вогкі', () => {
    expect(dryLogs(stackAll('far'))).toBeGreaterThan(dryLogs(stackAll('near')));
    expect(enoughDry(stackAll('far'))).toBe(true);
    expect(enoughDry(stackAll('near'))).toBe(false);
    expect(ENOUGH_DRY).toBeGreaterThan(0);
  });
  it('порядок «товсті вниз» справжній: тонке під товстим не лягає', () => {
    const thin = LOGS.indexOf('kindling');
    const thick = LOGS.indexOf('thick');
    let s = placeLog(startStack('far'), thin, true).state;
    const r = placeLog(s, thick, true);
    expect(r.event).toBe('outside');
    s = r.state;
    expect(s.under).toHaveLength(1);
  });
  it('усі три результати, і «сяк-так» (нічого під тентом) не блокує вечір', () => {
    expect(stackOutcome(finishStack(startStack('far')))).toBe('scrappy');
    expect(stackOutcome(stackAll('near'))).toBe('fine');
    expect(stackOutcome(stackAll('far'))).toBe('good');
  });
});

// ─── риба ────────────────────────────────────────────────────────────────────────────────────────
describe('риба: за часом доби й погодою', () => {
  it('набір видів міняється і від частини дня, і від погоди, і ніколи не порожній', () => {
    const all = DAY_PARTS.flatMap((p) => WEATHERS.map((w) => [p, w, speciesAt(p, w).join()] as const));
    for (const [, , list] of all) expect(list.length).toBeGreaterThan(0);
    expect(new Set(WEATHERS.map((w) => speciesAt('evening', w).join())).size).toBeGreaterThan(1);
    expect(new Set(DAY_PARTS.map((p) => speciesAt(p, 'sunny').join())).size).toBeGreaterThan(1);
  });
  it('опівдні на сонці чекати довше, ніж увечері', () => {
    expect(waitFactor('noon', 'sunny')).toBeGreaterThan(waitFactor('evening', 'sunny'));
  });
  it('види беруться з наявної таблиці fishing.ts', () => {
    for (const p of DAY_PARTS) for (const w of WEATHERS) expect(speciesIndexes(p, w).every((i) => i >= 0)).toBe(true);
  });
  it('на вечерю родині треба не одна рибина', () => {
    expect(SUPPER_FISH).toBeGreaterThan(1);
    expect(supperFish(SUPPER_FISH)).toBe(true);
    expect(supperFish(SUPPER_FISH - 1)).toBe(false);
  });
});

// ─── спільне: жодної справи на один дотик ────────────────────────────────────────────────────────
describe('жодна рутина не закривається одним дотиком', () => {
  const one: readonly [name: string, outcome: Outcome][] = [
    ['вода', waterOutcome(stepWater(startWater(3), { kind: 'step', side: 'left' }).state)],
    ['ліхтарі', lanternOutcome(stepLanterns(startLanterns(), { kind: 'crank', lantern: 0 }).state)],
    ['вогонь', emberOutcome(stepEmbers(startEmbers(true), { kind: 'act', act: 'blow' }).state)],
    ['ягоди', berryOutcome(pickBerry(startBerries(5), 0).state)],
    ['порядок', tidyOutcome(putThing(startTidy(), 'pot', 'car').state)],
    ['дрова', stackOutcome(placeLog(startStack('far'), 0, true).state)],
  ];
  for (const [name, outcome] of one) {
    it(`${name}: один дотик не дає ні «добре», ні «нормально»`, () => {
      expect(outcome).toBe('scrappy');
    });
  }
});
