// GAME-84 №13 · кадр гри під форму поля: на телефоні сторч — не смужка 3:2 посеред чорного екрана.
import { describe, expect, it } from 'vitest';
import { frameSize, MAP_HEIGHT } from './frame';

describe('frameSize (GAME-84 №13)', () => {
  it('широке поле (десктоп, телефон на боці) — як і було, 240×160', () => {
    for (const [w, h] of [[1280, 724], [844, 314], [800, 600], [720, 600]] as [number, number][]) expect(frameSize(w, h), `${w}×${h}`).toEqual({ width: 240, height: 160 });
  });

  it('вузьке поле (телефон сторч, GAME-91): цілий масштаб, кадр = поле / k, висота не вища за мапу', () => {
    // 390×788 → k=4: кадр 97×192 (мапа на всю висоту, по ширині камера їде за персонажем).
    expect(frameSize(390, 788)).toEqual({ width: 97, height: MAP_HEIGHT });
    expect(frameSize(375, 611)).toEqual({ width: 125, height: MAP_HEIGHT });   // k=3
    expect(frameSize(360, 744)).toEqual({ width: 90, height: 186 });           // k=4, 744/4 < мапи
    for (const [w, h] of [[390, 788], [375, 611], [360, 744], [820, 1100], [600, 700]] as [number, number][]) {
      const f = frameSize(w, h);
      const k = Math.max(1, Math.round(h / MAP_HEIGHT));
      expect(f.height, `${w}×${h}`).toBeLessThanOrEqual(MAP_HEIGHT);
      expect(f.width * k, `${w}×${h}`).toBeLessThanOrEqual(w);
      expect(f.width * k, `${w}×${h}: кадр заповнює поле по ширині`).toBeGreaterThan(w - k);
    }
  });

  it('поле без розміру (ще не розкладене) і нульові виміри — безпечний широкий кадр, не NaN', () => {
    for (const [w, h] of [[0, 0], [390, 0], [0, 700]] as [number, number][]) expect(frameSize(w, h)).toEqual({ width: 240, height: 160 });
  });

  it('межа 1,2: поле 1,2 — ще широке, трохи вужче — уже вузьке', () => {
    expect(frameSize(1200, 1000).width).toBe(240);
    expect(frameSize(1190, 1000)).toEqual({ width: 238, height: MAP_HEIGHT });   // k=5: уже вузька гілка (GAME-91), а не 240×160
  });
});
