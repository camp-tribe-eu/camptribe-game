import { describe, expect, it } from 'vitest';
import { ACTIONS, KEY_BINDINGS, KEY_CODES, TOUCH_CONTROLS, actionTarget, tapHitsSpot, consumeFrame, createActionGate, moveVector, newInput, press, release, stickActions } from './actions';

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

  it('утримання 2 с (довше за відкат) — усе одно одна команда: спрацьовує лише фронт натискання', () => {
    // Утримання 32 мс у тесті вище коротше за відкат 400 мс і не відрізняло «фронт» від «рівня»:
    // без перевірки фронту затиснута кнопка стріляла б командою кожні 0,4 с (звірка GAME-24 #3).
    const gate = createActionGate(400);
    let fired = 0;
    for (let t = 0; t <= 2000; t += 16) if (gate(true, t)) fired++;
    expect(fired).toBe(1);
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

describe('джойстик → напрямки (GAME-91)', () => {
  const R = 60;
  it('вісім напрямків: кожен кут із центру сектора дає свій набір дій', () => {
    const want: [number, number, string][] = [
      [50, 0, 'right'], [35, 35, 'down+right'], [0, 50, 'down'], [-35, 35, 'down+left'],
      [-50, 0, 'left'], [-35, -35, 'left+up'], [0, -50, 'up'], [35, -35, 'right+up'],
    ];
    for (const [dx, dy, label] of want) expect([...stickActions(dx, dy, R)].sort().join('+'), label).toBe(label);
  });
  it('мертва зона й нульовий радіус — нічого не утримується', () => {
    expect(stickActions(5, 5, R).size).toBe(0);
    expect(stickActions(50, 0, 0).size).toBe(0);
  });
  it('майже вісь (до 22,5°) — одна дія, а не діагональ', () => {
    expect([...stickActions(50, 10, R)]).toEqual(['right']);
  });
});

describe('ціль дії й тап (GAME-95)', () => {
  it('рід цілі: NPC — розмова, вогнище — вогонь, інший тригер — об\'єкт', () => {
    expect(actionTarget('npc', 'npc.elise')).toBe('talk');
    expect(actionTarget('trigger', 'obj.campfire')).toBe('fire');
    expect(actionTarget('trigger', 'obj.sign')).toBe('object');
  });
  it('тап влучає в спрайт над точкою ніг і не влучає поза ним', () => {
    const s = { x: 80, y: 272 };
    expect(tapHitsSpot(s, { x: 80, y: 248 })).toBe(true);
    expect(tapHitsSpot(s, { x: 105, y: 248 })).toBe(false);
    expect(tapHitsSpot(s, { x: 80, y: 215 })).toBe(false);
    expect(tapHitsSpot(s, { x: 80, y: 281 })).toBe(false);
  });
});
