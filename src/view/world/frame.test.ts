// GAME-84 №13 · кадр гри під форму поля: на телефоні сторч — не смужка 3:2 посеред чорного екрана.
import { describe, expect, it } from 'vitest';
import { frameSize, MAP_HEIGHT } from './frame';

describe('frameSize (GAME-84 №13)', () => {
  it('широке поле (десктоп, телефон на боці) — як і було, 240×160', () => {
    for (const [w, h] of [[1280, 724], [844, 314], [800, 600], [720, 600]] as [number, number][]) expect(frameSize(w, h), `${w}×${h}`).toEqual({ width: 240, height: 160 });
  });

  it('вузьке поле (телефон сторч, планшет сторч): кадр заповнює його за формою, але не вище за мапу', () => {
    expect(frameSize(390, 768)).toEqual({ width: 160, height: MAP_HEIGHT });
    expect(frameSize(820, 1100)).toEqual({ width: 160, height: MAP_HEIGHT });
    // Майже квадратне поле: висота між 160 і мапою, пропорція кадру ≈ пропорції поля (FIT не лишає смуг по краях).
    const f = frameSize(600, 700);
    expect(f.height).toBeGreaterThanOrEqual(160);
    expect(f.height).toBeLessThanOrEqual(MAP_HEIGHT);
    expect(Math.abs(f.width / f.height - 600 / 700)).toBeLessThan(0.05);
  });

  it('поле без розміру (ще не розкладене) і нульові виміри — безпечний широкий кадр, не NaN', () => {
    for (const [w, h] of [[0, 0], [390, 0], [0, 700]] as [number, number][]) expect(frameSize(w, h)).toEqual({ width: 240, height: 160 });
  });

  it('межа 1,2: поле 1,2 — ще широке, трохи вужче — уже вузьке', () => {
    expect(frameSize(1200, 1000).width).toBe(240);
    expect(frameSize(1190, 1000).width).toBe(160);
  });
});
