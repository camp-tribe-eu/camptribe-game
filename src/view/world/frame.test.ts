// GAME-84 №13 · кадр гри під форму поля: на телефоні сторч — не смужка 3:2 посеред чорного екрана.
// GAME-96 (смак власника 25.10) · широке поле: мапа на всю ширину, без смуг з боків, цілий масштаб.
import { describe, expect, it } from 'vitest';
import { frameSize, HERO_BODY_PX, MAP_HEIGHT, MAP_WIDTH, PHONE_LANDSCAPE_MAX_H, TOUCH_PHONE_MAX_H, zoomSteps } from './frame';

describe('frameSize (GAME-84 №13, GAME-96)', () => {
  it('широке поле (GAME-254): цілий zoom, полотно покриває поле, зріст героя ≈ 1/9 висоти (0,07–0,16), більше світу, ніж за старим правилом', () => {
    const cases: [number, number][] = [[844, 390], [932, 430], [667, 375], [568, 320], [1280, 800], [1920, 1080], [1280, 720], [640, 360], [1200, 1000], [2560, 1440]];
    for (const [w, h] of cases) {
      const f = frameSize(w, h);
      expect(Number.isInteger(f.zoom) && f.zoom >= 1, `${w}×${h}: zoom ${f.zoom} цілий`).toBe(true);
      expect(f.width * f.zoom, `${w}×${h}: покриває ширину`).toBeGreaterThanOrEqual(w);
      expect(f.height * f.zoom, `${w}×${h}: покриває висоту`).toBeGreaterThanOrEqual(h);
      expect(f.width * f.zoom - w, `${w}×${h}: зайве по ширині < zoom`).toBeLessThan(f.zoom);
      expect(f.height * f.zoom - h, `${w}×${h}: зайве по висоті < zoom`).toBeLessThan(f.zoom);
      const old = Math.max(1, Math.ceil(w / MAP_WIDTH), Math.ceil(h / MAP_HEIGHT));
      if (h <= PHONE_LANDSCAPE_MAX_H) { expect(f.zoom, `${w}×${h}: телефон вбік — масштаб як був (OD-030)`).toBe(old); continue; }
      const frac = (HERO_BODY_PX * f.zoom) / h;
      expect(frac, `${w}×${h}: зріст героя ${(frac * 100).toFixed(1)} % висоти`).toBeGreaterThanOrEqual(0.07);
      expect(frac, `${w}×${h}: зріст героя ${(frac * 100).toFixed(1)} % висоти`).toBeLessThanOrEqual(0.16);
      expect(f.zoom, `${w}×${h}: не більший масштаб, ніж було (${old})`).toBeLessThanOrEqual(old);
    }
    expect(frameSize(844, 390)).toEqual({ width: 422, height: 195, zoom: 2 });    // OD-030: телефон вбік — як було
    expect(frameSize(932, 430)).toEqual({ width: 466, height: 215, zoom: 2 });    // OD-030: телефон вбік — як було
    expect(frameSize(1920, 1080)).toEqual({ width: 960, height: 540, zoom: 2 });  // було zoom 3
    expect(frameSize(1280, 720)).toEqual({ width: 640, height: 360, zoom: 2 });
    expect(frameSize(1280, 800)).toEqual({ width: 640, height: 400, zoom: 2 });   // було zoom 3: 427×267
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
    expect(frameSize(1200, 1000)).toEqual({ width: 600, height: 500, zoom: 2 });
    expect(frameSize(1190, 1000)).toEqual({ width: 396, height: 333, zoom: 3 });   // k=3: уже вузька гілка (GAME-91, без змін)
  });
});

describe('GAME-278 · «Масштаб» у налаштуваннях (OD-030)', () => {
  it('Авто: планшет з дотиком до 820 px — як телефон (1024×600 → ×2, не ×1), а без дотику правило ПК; стрибка 520/521 на дотику немає', () => {
    expect(frameSize(1024, 600)).toEqual({ width: 1024, height: 600, zoom: 1 });                    // ПК/миша: без змін
    expect(frameSize(1024, 600, true)).toEqual({ width: 512, height: 300, zoom: 2 });               // планшет: крупніше
    expect(frameSize(1024, 520, true).zoom).toBe(frameSize(1024, 521, true).zoom);                  // на дотику 520/521 однакові
    expect(frameSize(1024, 520).zoom).not.toBe(frameSize(1024, 521).zoom);                          // миша: межа OD-030 лишилась
    expect(frameSize(1366, TOUCH_PHONE_MAX_H, true).zoom).toBe(Math.max(1, Math.ceil(1366 / MAP_WIDTH), Math.ceil(TOUCH_PHONE_MAX_H / MAP_HEIGHT)));
    expect(frameSize(1366, TOUCH_PHONE_MAX_H + 1, true).zoom).toBe(frameSize(1366, TOUCH_PHONE_MAX_H + 1).zoom);   // вище 820 — правило ПК
  });
  it('кроки: лише цілі, зріст героя 6–30 % висоти, на дотику плитка ≥ 44 px (без ×1)', () => {
    expect(zoomSteps(1280, 800)).toEqual([1, 2, 3, 4]);
    expect(zoomSteps(1280, 800, true)).toEqual([2, 3, 4]);
    expect(zoomSteps(932, 430)).toEqual([1, 2]);                  // ×3: герой 34 % > 30
    expect(zoomSteps(932, 430, true)).toEqual([2]);
    expect(zoomSteps(390, 844, true)).toEqual([2, 3]);       // ×1: герой 5,8 % < 6; ×4: кадр 97 px завширшки < 120
    expect(zoomSteps(0, 0)).toEqual([]);
    for (const [w, h, c] of [[1280, 800, false], [932, 430, true], [390, 844, true], [600, 600, false], [1920, 1080, false]] as [number, number, boolean][]) {
      for (const k of zoomSteps(w, h, c)) {
        const f = (HERO_BODY_PX * k) / h;
        expect(Number.isInteger(k) && f >= 0.06 && f <= 0.3, `${w}×${h} ×${k}: ${(f * 100).toFixed(1)} %`).toBe(true);
        if (c) expect(32 * k).toBeGreaterThanOrEqual(44);
      }
    }
  });
  it('явний крок змінює zoom у широкій і вузькій гілці; непридатний — Авто без помилки', () => {
    for (const k of zoomSteps(1280, 800)) expect(frameSize(1280, 800, false, k).zoom).toBe(k);
    expect(frameSize(1280, 800, false, 3)).toEqual({ width: 427, height: 267, zoom: 3 });
    expect(frameSize(390, 844, true, 3).zoom).toBe(3);
    expect(frameSize(1280, 800, false, 7)).toEqual(frameSize(1280, 800));     // ×7 — героя 43 % висоти, не крок
    expect(frameSize(390, 844, true, 1)).toEqual(frameSize(390, 844, true));  // ×1 на дотику — не крок
    expect(frameSize(1280, 800, false, 0)).toEqual(frameSize(1280, 800));
  });
});
