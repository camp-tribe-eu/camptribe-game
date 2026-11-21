// GAME-348 · дрова з приймання №8. Чотири розбіжності, що їх ловив гравець:
//  1) вогонь після місії Клер горів як на вогких дровах (бачив лише ручну рутину, ніч бачила ще й пристрій);
//  3) дрова не вміщались на екран (перевіряє tests/e2e/game-348.spec.ts);
//  2) «В авто» мовчки відмовляло третій їжі, а дошка казала «Добре», хоч ніч — «лисиця»;
//  4) ніч казала «дрова розкидало» поруч із «сухі дрова від Тата Тімо».
// Мутації (перевірено, див. звіт): effectiveDryLogs → лише `manual`; прибрати `foodOutside(s) ? 'scrappy' :` у tidyOutcome; прибрати `sh(…)` у camp-night.
import src from '../ui/CampRoutines.tsx?raw';
import { describe, expect, it } from 'vitest';
import uk from '../i18n/uk.json';
import en from '../i18n/en.json';
import { deviceFacts, effectiveDryLogs } from './camp-devices';
import { startEmbers } from './embers';
import { ENOUGH_DRY } from './firewood-stack';
import { NIGHT_FACTS, nightKeys, type NightFacts } from './camp-night';
import { CAR_ROOM, THINGS, foodOutside, putThing, sleepNow, startTidy, tidyOutcome } from './night-camp';
import type { Outcome } from './minigame';

describe('GAME-348 · вогонь бачить ті самі сухі дрова, що й ніч', () => {
  it('пристрій місії без ручної рутини «Дрова» — вогонь стартує сухим', () => {
    const devs = { woodpile: { care: 1 } } as never;
    expect(effectiveDryLogs(devs, 0)).toBeGreaterThanOrEqual(ENOUGH_DRY);
    expect(startEmbers(effectiveDryLogs(devs, 0) >= ENOUGH_DRY).dry).toBe(true);
    expect(startEmbers(effectiveDryLogs({}, 0) >= ENOUGH_DRY).dry).toBe(false);   // без обох — вогкий
  });
  it('одне джерело: ніч (deviceFacts) бере число з тієї самої функції; ручні дрова не губляться', () => {
    for (const care of [0.2, 0.5, 1]) for (const manual of [0, 3, 6]) {
      const devs = { woodpile: { care } } as never;
      expect(deviceFacts(devs, { ...NIGHT_FACTS, dryLogs: manual }).dryLogs).toBe(effectiveDryLogs(devs, manual));
    }
    expect(effectiveDryLogs({}, 5)).toBe(5);
  });
  it('панель стартує вогонь від effectiveDryLogs і каже про вогкі дрова', () => {
    expect(src).toMatch(/const logsDry = effectiveDryLogs\(devices, facts\.dryLogs\) >= ENOUGH_DRY/);
    expect(src).toContain('startEmbers(logsDry)');
    expect(src).toMatch(/!embers\.dry && <p[^>]*data-ui="fire-wet"/);
    for (const k of ['camp.fire.wet', 'camp.wood.rule', 'camp.tidy.carFull', 'night.wood.scattered.shared', 'night.wood.soaked.shared', 'night.wood.damp.shared']) {
      expect((uk as Record<string, string>)[k], k).toBeTruthy();
      expect((en as Record<string, string>)[k], k).toBeTruthy();
    }
  });
});

describe('GAME-348 · порядок у таборі: результат згоден із тим, що лишилось надворі', () => {
  const food = THINGS.filter((t) => t.kind === 'food');
  it('третя їжа в авто не лягає (місць ' + CAR_ROOM + ') — подія carFull, річ надворі', () => {
    let s = startTidy();
    for (const t of food.slice(0, 2)) s = putThing(s, t.id, 'car').state;
    const r = putThing(s, (food[2] as { id: string }).id, 'car');
    expect(r.event).toBe('carFull');
    expect(r.state.put[(food[2] as { id: string }).id]).toBeUndefined();
  });
  it('все прибрано, крім їжі, що не влізла: не «Добре» (ніч скаже «лисиця»)', () => {
    let s = startTidy();
    for (const t of THINGS) {
      if (t.id === 'berries') continue;
      s = putThing(s, t.id, t.kind === 'food' ? 'car' : t.kind === 'rubbish' ? 'bin' : 'tarp').state;
    }
    s = sleepNow(s);
    expect(foodOutside(s)).toBe(true);
    expect(tidyOutcome(s)).toBe('scrappy');
    const night = nightKeys({ ...NIGHT_FACTS, results: { tidy: tidyOutcome(s) as Outcome }, foodOutside: foodOutside(s) });
    expect(night).toContain('night.tidy.fox');
  });
  it('їжа вся сховала — «Добре» лишається можливим', () => {
    let s = startTidy();
    for (const t of THINGS) s = putThing(s, t.id, t.kind === 'food' ? (Object.values(s.put).filter((p) => p === 'car').length < CAR_ROOM ? 'car' : 'hung') : t.kind === 'rubbish' ? 'bin' : 'tarp').state;
    expect(tidyOutcome(sleepNow(s))).toBe('good');
  });
  it('панель показує, чому «В авто» відмовило', () => {
    expect(src).toContain("foodOutside(s) ? 'camp.reason.tidy.food' : null");
    for (const k of ['camp.reason.tidy.food']) { expect((uk as Record<string, string>)[k], k).toBeTruthy(); expect((en as Record<string, string>)[k], k).toBeTruthy(); }
    expect(src).toMatch(/setTidyFull\(o\.event === 'carFull'\)/);
    expect(src).toMatch(/tidyFull && <p[^>]*data-ui="tidy-car-full"/);
  });
});

describe('GAME-348 · ніч не суперечить собі про дрова', () => {
  const base: NightFacts = {
    ...NIGHT_FACTS, results: { firewood: 'good', fire: 'good', knots: 'scrappy' }, dryLogs: 6, foodOutside: false, missions: ['f.mis-lantern-done'],
  };
  for (const weather of ['rain', 'sunny'] as const) {
    it(`${weather}: сусідові сухі дрова й «наші змокли/розкидало» — не в одному голому вигляді`, () => {
      const k = nightKeys({ ...base, weather });
      expect(k).toContain('night.mission.f.storm-dry-wood');
      expect(k).not.toContain('night.wood.soaked');
      expect(k).not.toContain('night.wood.scattered');
      expect(k.some((x) => x === 'night.wood.soaked.shared' || x === 'night.wood.scattered.shared')).toBe(true);
    });
  }
  it('без сусідових дров слід лишається звичайним', () => {
    expect(nightKeys({ ...base, weather: 'rain', missions: [] })).toContain('night.wood.soaked');
  });
  it('вогкі свої дрова (damp) + сусідові сухі — теж погоджено', () => {
    const k = nightKeys({ ...base, results: { firewood: 'scrappy', fire: 'good', knots: 'good' }, dryLogs: 1 });
    expect(k).not.toContain('night.wood.damp');
    expect(k).toContain('night.wood.damp.shared');
  });
});
