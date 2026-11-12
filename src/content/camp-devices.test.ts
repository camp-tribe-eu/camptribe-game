// GAME-311 · табір, що працює сам (§9а). Мутації, кожна з яких робить цей файл червоним:
//   «пристрій нічого не знімає» (withDevices повертає day без змін) · «догляд не потрібен» (wear — тотожність)
//   · «пристрій ламається назавжди» (MIN_CARE = 0 і autoOutcome(0) → undefined) · «вогнище автоматизовано»
//   (HANDS_ONLY без 'fire' + пристрій для fire) · «будується з нічого» (canBuild → true).
import { describe, expect, it } from 'vitest';
import { DEVICES, DEVICE_IDS, HANDS_ONLY, LOW_AT, MIN_CARE, automatable, autoOutcome, build, canBuild, deviceFacts, deviceFor, statusOf, tend, wear, withDevices, type DeviceId, type Devices, type Pack } from './camp-devices';
import { ROUTINE_IDS, ROUTINES, minutesLeft, startCampDay, whyNot } from './camp-day';
import { NIGHT_FACTS, nightOf } from './camp-night';

const ALL: Pack = { materials: DEVICE_IDS.flatMap((d) => DEVICES[d].materials), knowhow: DEVICE_IDS.map((d) => DEVICES[d].knowhow) };
const built = (id: DeviceId): Devices => build({}, ALL, id);
const nightKey = (devs: Devices, routine: string): string | undefined =>
  nightOf(deviceFacts(devs, { ...NIGHT_FACTS, results: withDevices(startCampDay(), devs).results })).beats.find((b) => b.routine === routine)?.id;

describe('налагодив раз — працює саме', () => {
  for (const id of DEVICE_IDS) {
    const r = DEVICES[id].routine;
    it(`${id}: рутина «${r}» більше не потребує рук і не їсть часу дня`, () => {
      const without = startCampDay();
      expect(whyNot(without, r, r === 'tidy' ? 'evening' : 'morning')).toBeNull();
      const day = withDevices(startCampDay(), built(id));
      expect(day.results[r]).toBe('good');
      expect(minutesLeft(day)).toBe(minutesLeft(startCampDay()));
      expect(whyNot(day, r, r === 'tidy' ? 'evening' : 'morning')).toBe('done');
      expect(ROUTINES[r].minutes[0]).toBeGreaterThan(0);   // руками це коштувало б часу
    });
    it(`${id}: без догляду гірше, але не ламається; догляд повертає до ладу`, () => {
      const fresh = built(id);
      const neglected = wear(fresh, 10);
      const care = neglected[id]?.care ?? -1;
      expect(care).toBeLessThan(fresh[id]?.care ?? 0);
      expect(care).toBeGreaterThanOrEqual(MIN_CARE);
      expect(MIN_CARE).toBeGreaterThan(0);
      expect(autoOutcome(care)).toBe('scrappy');
      expect(withDevices(startCampDay(), neglected).results[DEVICES[id].routine]).toBe('scrappy');
      expect(statusOf(neglected, DEVICES[id].routine)).toBe('low');
      expect(tend(neglected, id)[id]?.care).toBe(1);
    });
    it(`${id}: доглянутий і занедбаний — різні ночі`, () => {
      expect(nightKey(built(id), r)).not.toBe(nightKey(wear(built(id), 10), r));
    });
  }
  it('знос іде поступово: частина дня — ще «працює саме», багато — «ось-ось закінчиться»', () => {
    const one = wear(built('rain-barrel'), 1);
    expect(statusOf(one, 'water')).toBe('auto');
    expect((one['rain-barrel']?.care ?? 0)).toBeGreaterThanOrEqual(LOW_AT);
    expect(statusOf(wear(one, 3), 'water')).toBe('low');
  });
  it('пристрій не з нічого: без матеріалів чи знання з пригод — не збудувати', () => {
    expect(canBuild({ materials: [], knowhow: [] }, 'rain-barrel')).toBe(false);
    expect(canBuild({ materials: ['barrel', 'filter'], knowhow: [] }, 'rain-barrel')).toBe(false);
    expect(build({}, { materials: ['barrel'], knowhow: ['know.rain-water'] }, 'rain-barrel')).toEqual({});
    expect(canBuild(ALL, 'rain-barrel')).toBe(true);
  });
});

describe('лише руками — назавжди', () => {
  it('вогнище і ягоди не мають пристрою і автоматизувати їх не можна', () => {
    expect(HANDS_ONLY).toEqual(['fire', 'berries']);
    for (const r of HANDS_ONLY) {
      expect(automatable(r)).toBe(false);
      expect(deviceFor(r)).toBeNull();
      expect(DEVICE_IDS.some((d) => DEVICES[d].routine === r)).toBe(false);
    }
  });
  it('навіть усі пристрої разом лишають ручні рутини рукам', () => {
    const everything = DEVICE_IDS.reduce<Devices>((acc, id) => build(acc, ALL, id), {});
    const day = withDevices(startCampDay(), everything);
    for (const r of HANDS_ONLY) {
      expect(day.results[r]).toBeUndefined();
      expect(statusOf(everything, r)).toBe('hands');
    }
    expect(ROUTINE_IDS.filter((r) => day.results[r] === undefined)).toEqual(['fire', 'berries']);
  });
  it('кожна інша рутина має свій пристрій', () => {
    for (const r of ROUTINE_IDS.filter((x) => !HANDS_ONLY.includes(x))) expect(automatable(r)).toBe(true);
  });
});

describe('дошка табору', () => {
  it('одним поглядом: працює саме / ось-ось закінчиться / чекає рук', () => {
    const devs = { ...built('solar-station'), ...wear(built('fish-trap'), 10) };
    expect(statusOf(devs, 'lanterns')).toBe('auto');
    expect(statusOf(devs, 'fish')).toBe('low');
    expect(statusOf(devs, 'water')).toBe('hands');
    expect(statusOf(devs, 'fire')).toBe('hands');
  });
});
