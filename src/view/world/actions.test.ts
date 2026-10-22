import { describe, expect, it } from 'vitest';
import { ACTIONS, KEY_BINDINGS, KEY_CODES, TOUCH_CONTROLS, consumeFrame, createActionGate, moveVector, newInput, press, release } from './actions';

describe('карта дій (GAME-69)', () => {
  it('кожна дія з клавіатури має дотиковий елемент, і навпаки', () => {
    expect(Object.keys(KEY_BINDINGS).sort()).toEqual([...ACTIONS].sort());
    expect(Object.keys(TOUCH_CONTROLS).sort()).toEqual([...ACTIONS].sort());
  });

  it('кожна прив’язана клавіша має код у KEY_CODES (інакше Phaser мовчки створить мертву клавішу)', () => {
    for (const code of Object.values(KEY_BINDINGS).flat()) expect(KEY_CODES[code], code).toBeTypeOf('number');
  });

  it('жодна клавіша не прив’язана до двох дій', () => {
    const keys = Object.values(KEY_BINDINGS).flat();
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('вектор руху', () => {
  it('діагональ не швидша за пряму', () => {
    const d = moveVector(new Set(['up', 'right']));
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1);
  });
  it('протилежні кнопки гасять одна одну', () => {
    expect(moveVector(new Set(['left', 'right']))).toEqual({ x: 0, y: 0 });
  });
});

describe('ворота взаємодії (GAME-24: подвійне натискання — одна команда)', () => {
  it('утримання — одна команда; два швидкі натискання — одна; після паузи — друга', () => {
    const gate = createActionGate(400);
    const fired = [
      gate(true, 0), gate(true, 16), gate(true, 32),   // утримання
      gate(false, 48), gate(true, 100),                // повторне натискання за 100 мс
      gate(false, 600), gate(true, 700),               // після паузи
    ].filter(Boolean).length;
    expect(fired).toBe(2);
  });
});

describe('засувка натискань (дефект, знайдений e2e GAME-24)', () => {
  it('натиснули й відпустили між двома кадрами — кадр однаково бачить натискання, наступний — ні', () => {
    const input = newInput();
    press(input, 'interact');
    release(input, 'interact');
    expect(consumeFrame(input).has('interact')).toBe(true);
    expect(consumeFrame(input).has('interact')).toBe(false);
  });
});
