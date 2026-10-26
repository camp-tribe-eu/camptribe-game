// GAME-84 №13 · кадр гри під форму поля: на телефоні сторч — не смужка 3:2 посеред чорного екрана.
// GAME-96 (смак власника 25.10) · широке поле: мапа на всю ширину, без смуг з боків, цілий масштаб.
import { describe, expect, it } from 'vitest';
import { frameSize, MAP_HEIGHT, MAP_WIDTH } from './frame';

describe('frameSize (GAME-84 №13, GAME-96)', () => {
  it('широке поле (десктоп, телефон вбік): полотно zoom·кадр покриває поле по ширині й висоті, кадр не більший за мапу', () => {
    const cases: [number, number][] = [[844, 390], [932, 430], [667, 375], [568, 320], [1280, 800], [1920, 1080], [1280, 720], [640, 360], [1200, 1000], [2560, 1440]];
    for (const [w, h] of cases) {
      const f = frameSize(w, h);
      expect(Number.isInteger(f.zoom) && f.zoom >= 1, `${w}×${h}: zoom ${f.zoom} цілий`).toBe(true);
      expect(f.width * f.zoom, `${w}×${h}: покриває ширину`).toBeGreaterThanOrEqual(w);
      expect(f.height * f.zoom, `${w}×${h}: покриває висоту`).toBeGreaterThanOrEqual(h);
      expect(f.width * f.zoom - w, `${w}×${h}: зайве по ширині < zoom`).toBeLessThan(f.zoom);
      expect(f.height * f.zoom - h, `${w}×${h}: зайве по висоті < zoom`).toBeLessThan(f.zoom);
      expect(f.width, `${w}×${h}: кадр не ширший за мапу (порожнеча з боків)`).toBeLessThanOrEqual(MAP_WIDTH);
      expect(f.height, `${w}×${h}: кадр не вищий за мапу`).toBeLessThanOrEqual(MAP_HEIGHT);
      // Найменший такий zoom: на одиницю менший уже не вліз би в мапу.
      if (f.zoom > 1) expect(Math.ceil(w / (f.zoom - 1)) > MAP_WIDTH || Math.ceil(h / (f.zoom - 1)) > MAP_HEIGHT, `${w}×${h}: zoom ${f.zoom} найменший`).toBe(true);
    }
    expect(frameSize(844, 390)).toEqual({ width: 422, height: 195, zoom: 2 });
    expect(frameSize(1920, 1080)).toEqual({ width: 640, height: 360, zoom: 3 });
    expect(frameSize(1280, 720)).toEqual({ width: 640, height: 360, zoom: 2 });
    expect(frameSize(1280, 800)).toEqual({ width: 427, height: 267, zoom: 3 });   // zoom 2 дав би 400 > 384: порожнеча знизу
    expect(frameSize(568, 320)).toEqual({ width: 568, height: 320, zoom: 1 });
  });

  it('негативний контроль: старе правило 640×352 (FIT) лишало смуги — на 844×390 покриття по ширині не було б', () => {
    const old = { width: 640, height: 352 };
    const fit = Math.min(844 / old.width, 390 / old.height);
    expect(old.width * fit).toBeLessThan(844 * 0.99);
  });

  it('вузьке поле (телефон сторч, GAME-91, без змін): цілий масштаб, кадр = поле / k, висота не вища за мапу', () => {
    // 390×788 → k=2: кадр 195×384 (мапа на всю висоту, по ширині камера їде за персонажем).
    expect(frameSize(390, 788)).toEqual({ width: 195, height: MAP_HEIGHT, zoom: 2 });
    expect(frameSize(375, 611)).toEqual({ width: 187, height: 305, zoom: 2 });         // k=2, 611/2 < мапи
    expect(frameSize(360, 744)).toEqual({ width: 180, height: 372, zoom: 2 });         // k=2, 744/2 < мапи
    for (const [w, h] of [[390, 788], [375, 611], [360, 744], [820, 1100], [600, 700]] as [number, number][]) {
      const f = frameSize(w, h);
      const k = Math.max(1, Math.round(h / MAP_HEIGHT));
      expect(f.zoom, `${w}×${h}`).toBe(k);
      expect(f.height, `${w}×${h}`).toBeLessThanOrEqual(MAP_HEIGHT);
      expect(f.width * k, `${w}×${h}`).toBeLessThanOrEqual(w);
      expect(f.width * k, `${w}×${h}: кадр заповнює поле по ширині`).toBeGreaterThan(w - k);
    }
  });

  it('поле без розміру (ще не розкладене) і нульові виміри — безпечний кадр 640×352 ×1, не NaN', () => {
    for (const [w, h] of [[0, 0], [390, 0], [0, 700]] as [number, number][]) expect(frameSize(w, h)).toEqual({ width: 640, height: 352, zoom: 1 });
  });

  it('межа 1,2: поле 1,2 — ще широке (покриття), трохи вужче — уже вузьке (на всю висоту)', () => {
    expect(frameSize(1200, 1000)).toEqual({ width: 400, height: 334, zoom: 3 });
    expect(frameSize(1190, 1000)).toEqual({ width: 396, height: 333, zoom: 3 });   // k=3: уже вузька гілка (GAME-91)
  });
});
