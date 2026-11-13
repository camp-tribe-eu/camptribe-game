// GAME-314 · ланцюг наслідків зразкового дня: КОЖНА ланка — справжній зв'язок у стані, і кожну доводить мутація (закон 1):
//   M1 команда ядра не ставить f.arrival-* ........ «дорога → прихід» червоніє
//   M2 pitchChoices не читає прапорця приїзду ...... «приїзд → вільні ділянки» червоніє
//   M3 nightOf не читає ділянки (camp-night) ....... «ділянка → ніч» червоніє
//   M4 nightOf не читає місій (camp-night) ......... «місія зроблена/ні → ніч» червоніє
//   M5 FinishMinigame не знімає штраф з гаманця .... «штраф → гаманець» червоніє
//   M6 devicesFromFlags повертає {} ................ «пристрій місії → рутина → ніч» червоніє
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fromSave, serialize } from '../core/save';
import { newSim } from '../core/sim';
import { DEVICE_IDS } from './camp-devices';
import { dispatch, type Command } from '../core/commands';
import { initialState, type GameState } from '../core/state';
import { DRIVER, SKILL_DEFS, play } from '../core/story.fixture';
import type { CoreDefs } from '../core/defs';
import { MINIGAME_DEFS } from './minigames';
import { ARRIVAL_BY_DRIVE, PITCH_IDS, arrivalFlag, freePitches, nightAt, pitchFlag, type ArrivalTime, type PitchId } from './arrival-pitch';
import { NIGHT_FACTS, nightKeys, nightOf, roughCount, type NightFacts } from './camp-night';
import { deviceFacts, withDevices } from './camp-devices';
import { MISSIONS } from './missions';
import { devicesFromFlags, laneIdFor, missionsDone, pitchChoices, sampleExtra } from './sample-day';
import { laneOf, solve } from './drive-in';
import { DRIVE_OUTCOMES } from './drive-in';

const DEFS: CoreDefs = { ...SKILL_DEFS, minigames: MINIGAME_DEFS };
let n = 0;
const start = (money = 50_000): GameState => play([DRIVER], initialState(money), DEFS);
const finish = (s: GameState, outcome: string, fineCents?: number) =>
  dispatch(s, { type: 'FinishMinigame', commandId: `c${n++}`, minigameId: 'mg.drive', outcome, ...(fineCents === undefined ? {} : { fineCents }) } as Command, DEFS);
const mustFinish = (s: GameState, outcome: string, fineCents?: number): GameState => {
  const r = finish(s, outcome, fineCents);
  if (!r.ok) throw new Error(`FinishMinigame ${outcome} → ${r.code}`);
  return r.state;
};
const withFlags = (s: GameState, ...f: string[]): GameState => ({ ...s, flags: [...s.flags, ...f] });
/** Ніч за станом гри: ТА САМА модель, що в живій дошці табору (рутини тут порожні — міняємо лише те, що зшивка передає). */
const nightFor = (g: GameState, base: Partial<NightFacts> = {}): NightFacts => {
  const devs = devicesFromFlags(g.flags);
  const results = withDevices({ picks: [], results: base.results ?? {} }, devs).results;   // як дошка табору: пристрій робить рутину сам
  return deviceFacts(devs, { ...NIGHT_FACTS, ...base, results, ...sampleExtra(g.flags) });
};
const DRIVE_TO_ARRIVAL: readonly (readonly ['good' | 'fine' | 'scrappy', ArrivalTime])[] = [['good', 'early'], ['fine', 'ontime'], ['scrappy', 'late']];

describe('штраф дороги справді лягає на гаманець', () => {
  it('fineCents зменшує moneyCents рівно на штраф', () => {
    const s = mustFinish(start(50_000), 'fine', 9000);
    expect(s.moneyCents).toBe(41_000);
  });
  it('без штрафу гаманець не змінюється; штраф більший за гаманець не веде в борг', () => {
    expect(mustFinish(start(50_000), 'good').moneyCents).toBe(50_000);
    expect(mustFinish(start(5_000), 'fine', 9000).moneyCents).toBe(0);
  });
  it('безглуздий штраф (від’ємний, дробовий, понад межу) відхиляється, гаманець цілий', () => {
    for (const bad of [-1, 1.5, 50_001]) {
      const r = finish(start(), 'fine', bad);
      expect(r.ok, `штраф ${bad}`).toBe(false);
    }
  });
});

describe('ланка 1: дорога → час приїзду в стані (рівно один f.arrival-*)', () => {
  for (const [drive, arrival] of DRIVE_TO_ARRIVAL) {
    it(`${drive} → ${arrivalFlag(arrival)}`, () => {
      expect(ARRIVAL_BY_DRIVE[drive]).toBe(arrival);
      const s = mustFinish(start(), drive);
      expect(s.flags.filter((f) => f.startsWith('f.arrival-'))).toEqual([arrivalFlag(arrival)]);
    });
  }
  it('другий проїзд замінює прапорець, а не додає', () => {
    const s = mustFinish(mustFinish(start(), 'good'), 'scrappy');
    expect(s.flags.filter((f) => f.startsWith('f.arrival-'))).toEqual(['f.arrival-late']);
  });
});

describe('ланка 2: час приїзду → вільні ділянки (4 / 3 / 2) → ніч', () => {
  it('кількість вільних ділянок падає з пізнім приїздом і береться з того, що записала дорога', () => {
    const sizes = DRIVE_TO_ARRIVAL.map(([d]) => pitchChoices(mustFinish(start(), d).flags).length);
    expect(sizes).toEqual([4, 3, 2]);
    for (const [d, a] of DRIVE_TO_ARRIVAL) expect([...pitchChoices(mustFinish(start(), d).flags)]).toEqual([...freePitches(a)]);
  });
  it('у кожної вільної ділянки є смуга заїзду, що розв’язується', () => {
    for (const [d] of DRIVE_TO_ARRIVAL) {
      for (const p of pitchChoices(mustFinish(start(), d).flags)) {
        const g = withFlags(mustFinish(start(), d), pitchFlag(p));
        const lane = laneIdFor(g.flags);
        expect(lane, p).toBe(`lane.${p}`);
        expect(solve(laneOf(lane as string)), `заїзд на ${p}`).not.toBeNull();
      }
    }
  });
  it('обрана ділянка ПИШЕ в ніч: сліди nightAt входять у nightOf і ділянки дають різну ніч', () => {
    const keysOf = (p: PitchId): string => nightKeys(nightFor(withFlags(mustFinish(start(), 'good'), pitchFlag(p)))).join('|');
    for (const p of PITCH_IDS) {
      const g = withFlags(mustFinish(start(), 'good'), pitchFlag(p));
      const keys = nightKeys(nightFor(g));
      for (const e of nightAt(p, 'storm', [])) expect(keys, `${p}: ${e.textKey}`).toContain(e.textKey);
    }
    expect(new Set(PITCH_IDS.map(keysOf)).size, 'ділянки дають різну ніч').toBeGreaterThan(1);
    // без ділянки — інша ніч, ніж із нею
    expect(nightKeys(nightFor(mustFinish(start(), 'good'))).join('|')).not.toBe(keysOf('water'));
  });
  it('пізній приїзд справді кладе в ніч ДРУГУ ділянку: те, що лишила дорога, і є вибір', () => {
    const late = pitchChoices(mustFinish(start(), 'scrappy').flags);
    const early = pitchChoices(mustFinish(start(), 'good').flags);
    expect(early.filter((p) => !late.includes(p)).length).toBeGreaterThan(0);
    const lost = early.find((p) => !late.includes(p)) as PitchId;
    expect(nightKeys(nightFor(withFlags(mustFinish(start(), 'good'), pitchFlag(lost)))).length).toBeGreaterThan(0);
  });
});

describe('ланка 3: місія зроблена / не зроблена → ТА САМА ніч', () => {
  for (const m of MISSIONS) {
    it(`${m.id}: зроблена міняє ніч і додає свої факти, незроблена лишає свій слід`, () => {
      const base = mustFinish(start(), 'fine');
      const without = nightKeys(nightFor(base));
      const done = nightKeys(nightFor(withFlags(base, m.doneFlag)));
      expect(without).toContain(`night.mission.${m.id}.none`);
      expect(done).not.toContain(`night.mission.${m.id}.none`);
      expect(done).not.toEqual(without);
      for (const l of m.night.filter((x) => x.flag === m.doneFlag)) expect(done).toContain(`night.mission.${l.fact}`);
    });
  }
  it('усі три разом — і сім рутин, і ділянка, і місії в одній ночі; лічильник «зроблено» чесний', () => {
    const g = withFlags(mustFinish(start(), 'good'), pitchFlag('water'), ...MISSIONS.map((m) => m.doneFlag));
    expect(missionsDone(g.flags)).toBe(3);
    const f = nightFor(g, { results: { water: 'good', tidy: 'good' }, water: 1, foodOutside: false });
    const keys = nightKeys(f);
    expect(keys).toContain('night.water.full');
    expect(keys).toContain('night.tidy.quiet');
    expect(keys.filter((k) => k.startsWith('night.mission.f.storm-')).length).toBeGreaterThanOrEqual(3);
    expect(roughCount(f)).toBeGreaterThanOrEqual(0);
  });
});

describe('ланка 4: пристрій з місії → рутина → ніч', () => {
  it('віддача «Обручки» ставить верешу, і риба в ночі краща, ніж без неї', () => {
    const a = mustFinish(start(), 'fine');
    const noTrap = nightKeys(nightFor(withFlags(a)));
    const trap = nightKeys(nightFor(withFlags(a, 'f.camp-fishtrap')));
    expect(Object.keys(devicesFromFlags(['f.camp-fishtrap']))).toEqual(['fish-trap']);
    expect(noTrap).not.toContain('night.fish.supper');
    expect(trap).toContain('night.fish.supper');
  });
});

describe('жодного глухого кута: ніч не блокує за жодної комбінації дня', () => {
  it('арі × ділянка × підмножини місій × заїзд: blocked=false, morning=true, є сліди', () => {
    let combos = 0;
    for (const [d] of DRIVE_TO_ARRIVAL) {
      for (const p of pitchChoices(mustFinish(start(), d).flags)) {
        for (let mask = 0; mask < 8; mask++) {
          const flags = [...mustFinish(start(), d).flags, pitchFlag(p), ...MISSIONS.filter((_, i) => (mask >> i) & 1).map((m) => m.doneFlag), ...DRIVE_OUTCOMES.slice(0, 1).map((o) => `f.drive-in-${o}`)];
          const r = nightOf(nightFor({ ...start(), flags }));
          expect(r.blocked).toBe(false);
          expect(r.morning).toBe(true);
          expect(r.beats.length).toBeGreaterThan(0);
          combos++;
        }
      }
    }
    expect(combos).toBe((4 + 3 + 2) * 8);
  });
});

describe('рецензія tech-lead: зшивка без розбіжностей', () => {
  const read = (p: string): string => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
  it('один прапорець сухих дров: хвиля й місія Клер ставлять/читають той самий', () => {
    expect(read('content/waves.json')).toContain('f.storm-dry-wood');
    expect(read('content/waves.json')).not.toContain('f.storm-wood-dry');
    expect(read('content/dialogue/ch1-fire.json')).not.toContain('f.storm-wood-dry');
    expect(read('content/flags.json')).not.toContain('f.storm-wood-dry');
    expect(MISSIONS.flatMap((m) => m.night.map((l) => l.fact))).toContain('f.storm-dry-wood');
  });
  it('вечір біля вогню читає ділянку з f.spot-*', () => {
    const fire = read('content/dialogue/ch1-fire.json');
    expect(fire).toContain('f.spot-water');
    expect(fire).toContain('f.spot-beeches');
  });
  it('кожен пристрій місії відповідає справжньому пристрою табору', () => {
    for (const m of MISSIONS) {
      const devs = devicesFromFlags([m.device.flag]);
      expect(Object.keys(devs), m.id).toHaveLength(1);
      expect(DEVICE_IDS as readonly string[]).toContain(Object.keys(devs)[0]);
    }
  });
  it('штраф не веде гаманець у мінус, і збереження лишається чинним', () => {
    const s = mustFinish(start(5_000), 'fine', 9000);
    expect(s.moneyCents).toBe(0);
    expect(fromSave(serialize({ ...newSim(7, 0), game: s })).ok).toBe(true);
  });
  it('розмова про птахів Інгрід — перша: буря не затуляє здачу прохання', () => {
    const d = JSON.parse(read('content/dialogue/ingrid-chat.json')) as { nodes: { id: string; branches?: { next: string }[] }[] };
    const gate = d.nodes.find((n) => n.id === 'gate');
    expect(gate?.branches?.[0]?.next).toBe('turnin');
  });
});
