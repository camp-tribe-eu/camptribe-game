import { describe, expect, it } from 'vitest';
import { HABITS, cycleMs, idlePose, restMs } from './idle-poses';
import { RESIDENT_LOOKS } from './art';

const FAMILY = ['george', 'victoria', 'matthew'] as const;
const names = (who: string): string => JSON.stringify(HABITS[who]);

describe('GAME-248 · звички простою', () => {
  it('кожна людина має ≥ 1 звичку, і вона справді показує позу (не 0 і не дихання)', () => {
    for (const who of [...FAMILY, 'elise', 'anna', ...Object.keys(RESIDENT_LOOKS).filter((k) => k !== 'georgeNpc')]) {
      expect(HABITS[who]?.length, who).toBeGreaterThanOrEqual(1);
      let seen = 0;
      for (let ms = 0; ms < cycleMs(who, 0); ms += 50) if (idlePose(who, ms, 0)) seen++;
      expect(seen, `${who}: поза хоч раз`).toBeGreaterThan(10);
    }
  });
  it('детермінована: той самий вхід — та сама поза; у русі (ms<0) — немає пози', () => {
    for (const who of Object.keys(HABITS)) for (let ms = 0; ms < 6000; ms += 130) expect(idlePose(who, ms, 3)).toEqual(idlePose(who, ms, 3));
    expect(idlePose('victoria', -1, 0)).toBeNull();
  });
  it('члени родини не ділять жодної звички й цикл не збігається', () => {
    for (const a of FAMILY) for (const b of FAMILY) if (a < b) {
      expect(names(a)).not.toEqual(names(b));
      const an = new Set((HABITS[a] ?? []).map((h) => h.name));
      for (const h of HABITS[b] ?? []) expect(an.has(h.name), `${a}/${b}: ${h.name}`).toBe(false);
    }
  });
  it('у вікні 8 с після зупинки кожен показує звичку, а різні seed не синхронні', () => {
    for (const who of Object.keys(HABITS)) for (let seed = 0; seed < 8; seed++) {
      let hit = false;
      for (let ms = 0; ms <= 8000; ms += 50) if (idlePose(who, ms, seed)) hit = true;
      expect(hit, `${who}/${seed}`).toBe(true);
    }
    const at = (seed: number): string => JSON.stringify([0, 500, 1000, 2000, 3000].map((ms) => idlePose('nora', ms, seed)?.name ?? '-'));
    expect(new Set([0, 1, 2, 3].map(at)).size).toBeGreaterThan(1);
  });
  it('Вікторія робить жест руками (thrust), Метью — тупцює ногою', () => {
    const v = HABITS.victoria?.[0]?.steps.some((s) => s.sheet === 'thrust');
    expect(v).toBe(true);
    expect(HABITS.matthew?.[0]?.name).toBe('foot-tap');
    expect(restMs(0)).toBeLessThan(2000);
  });
});
