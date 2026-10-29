import { describe, expect, it } from 'vitest';
import { RING_IDLE, RING_S, edgeArrow, inSafeZone, isAutoSpot, pickNearest, ringMayTake, stepRing, vehicleReady } from './proximity';

function run(near: string | null, armed: boolean, hold: boolean, seconds: number, dt = 1 / 60): string | null {
  let r = RING_IDLE;
  for (let t = 0; t < seconds; t += dt) {
    const s = stepRing(r, near, armed, hold, dt);
    if (s.fire) return s.fire;
    r = s.ring;
  }
  return null;
}

describe('кільце наближення (GAME-175)', () => {
  it('спрацьовує за ≤ 0,8 с і лише для автооб\'єктів', () => {
    expect(RING_S).toBeLessThanOrEqual(0.8);
    expect(run('take.item.tent', true, true, 0.8)).toBe('take.item.tent');
    expect(run('npc.george', true, true, 3)).toBeNull();
    expect(run('obj.trunk', true, true, 3)).toBeNull();
  });
  it('не спрацьовує без озброєння, без утримання і після зміни цілі', () => {
    expect(run('step.ST-001', false, true, 3)).toBeNull();
    expect(run('obj.vehicle', true, false, 3)).toBeNull();
    let r = RING_IDLE;
    for (let i = 0; i < 30; i++) r = stepRing(r, 'step.ST-001', true, true, 1 / 60).ring;
    const s = stepRing(r, 'step.ST-002', true, true, 1 / 60);
    expect(s.ring.t).toBeLessThan(0.05);
  });
  it('повз зайву річ на полиці іти можна: кільце бере лише поточну ціль (ringMayTake)', () => {
    expect(ringMayTake('pack.item.lantern-3', 'pack.item.water')).toBe(false);
    expect(ringMayTake('pack.item.water', 'pack.item.water')).toBe(true);
    expect(ringMayTake('step.ST-001', null)).toBe(true);
    expect(ringMayTake('obj.vehicle', 'pack.item.water')).toBe(true);
    expect(ringMayTake(null, null)).toBe(false);
  });
  it('isAutoSpot', () => { expect(isAutoSpot('pack.item.water')).toBe(true); expect(isAutoSpot('task.firewood')).toBe(false); });
});

describe('авто їде лише коли все потрібне вкладене (GAME-175, закон 1)', () => {
  it('готове: рюкзак порожній і нічого не бракує', () => { expect(vehicleReady(false, { small: 0, bulky: 0 })).toBe(true); });
  it('НЕГАТИВНІ: бракує дрібного, бракує громіздкого, рюкзак непорожній — не готове', () => {
    expect(vehicleReady(false, { small: 1, bulky: 0 })).toBe(false);
    expect(vehicleReady(false, { small: 0, bulky: 1 })).toBe(false);
    expect(vehicleReady(true, { small: 0, bulky: 0 })).toBe(false);
  });
});

describe('стрілка на краї не лізе під шапку й дотикову панель (GAME-175)', () => {
  const view = { x: 100, y: 200, width: 320, height: 640 };   // портретний кадр у світових одиницях
  const ins = { top: 30, bottom: 90, left: 0, right: 0 };
  const R = 16;
  const targets = [-2000, -300, 0, 260, 2000].flatMap((dx) => [-2000, -300, 0, 500, 2000].map((dy) => ({ x: view.x + 160 + dx, y: view.y + 320 + dy })));
  it('для будь-якої цілі точка в безпечній зоні з урахуванням радіуса', () => {
    for (const t of targets) {
      const a = edgeArrow(view, t, ins, R);
      expect(a.x, JSON.stringify(t)).toBeGreaterThanOrEqual(view.x + ins.left + R - 1e-6);
      expect(a.x).toBeLessThanOrEqual(view.x + view.width - ins.right - R + 1e-6);
      expect(a.y).toBeGreaterThanOrEqual(view.y + ins.top + R - 1e-6);
      expect(a.y).toBeLessThanOrEqual(view.y + view.height - ins.bottom - R + 1e-6);
    }
  });
  it('ціль під нижнім краєм дає стрілку над джойстиком, а не на самому краю', () => {
    const a = edgeArrow(view, { x: view.x + 40, y: view.y + 5000 }, ins, R);
    expect(a.y).toBeCloseTo(view.y + view.height - ins.bottom - R, 6);
  });
  it('inSafeZone: ціль у смузі джойстика — поза безпечною зоною', () => {
    expect(inSafeZone(view, { x: view.x + 160, y: view.y + 320 }, ins, 10)).toBe(true);
    expect(inSafeZone(view, { x: view.x + 160, y: view.y + view.height - 40 }, ins, 10)).toBe(false);
    expect(inSafeZone(view, { x: view.x + 160, y: view.y + 12 }, ins, 10)).toBe(false);
  });
});

describe('вибір співрозмовника серед слідувачів (GAME-186)', () => {
  const V = { name: 'npc.victoria', follower: true };
  const M = { name: 'npc.matthew', follower: true };
  it('герой дивиться на Метью, Вікторія на 1 px ближча → Метью (і навпаки)', () => {
    // герой (100,100) дивиться праворуч: Метью попереду на 40, Вікторія позаду на 39
    expect(pickNearest(100, 100, 'right', [{ ...V, x: 61, y: 100 }, { ...M, x: 140, y: 100 }], 48)).toBe('npc.matthew');
    expect(pickNearest(100, 100, 'left', [{ ...V, x: 61, y: 100 }, { ...M, x: 140, y: 100 }], 48)).toBe('npc.victoria');
  });
  it('зона все одно діє: за межами range ніхто, хоч би й попереду', () => {
    expect(pickNearest(100, 100, 'right', [{ ...M, x: 160, y: 100 }], 48)).toBeNull();
  });
  it('не-родина має пріоритет над родиною, перевага погляду на неї не діє', () => {
    expect(pickNearest(100, 100, 'right', [{ ...M, x: 120, y: 100 }, { name: 'obj.fire', follower: false, x: 100, y: 146 }], 48)).toBe('obj.fire');
  });
});
