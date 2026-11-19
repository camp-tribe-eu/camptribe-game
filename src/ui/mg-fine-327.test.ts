// GAME-327 · дорога: гроші з 15,02 € до 0,00 € без пояснення. Корінь — не помилка: камера бере FINE_CENTS (90 €) і гаманець не йде в борг (#247).
// Тож результат дороги називає штраф. Мутації (перевірено): finesOf завжди 0 → «штраф названо» червоніє; прибрати рядок mg-fine з MinigameHost → тест джерела червоніє;
// у commands прибрати `Math.max(0, …)` → «не йде в борг» червоніє (sample-day.test).
import host from './MinigameHost.tsx?raw';
import { describe, expect, it } from 'vitest';
import { finesOf } from './MinigameHost';
import { DRIVE } from '../content/minigames/drive';
import { FINE_CENTS, buildCourse } from '../content/drive';
import { BRISK, STEADY, play } from '../content/drive.fixture';
import { NORMAL } from '../core/minigame';
import uk from '../i18n/uk.json';

const view = (policy: typeof BRISK) => {
  const c = buildCourse(2);
  return DRIVE.view({ course: c, drive: play(c, policy).state, said: [], line: null, events: [] }, NORMAL);
};

describe('результат дороги називає штраф', () => {
  it('жвава їзда повз камеру: у даних поверхні рівно штрафи, а спокійна — нуль', () => {
    const c = buildCourse(2);
    expect(finesOf(view(BRISK))).toBe(FINE_CENTS * c.cameras.length);
    expect(finesOf(view(STEADY))).toBe(0);
  });
  it('інші поверхні штрафу не мають, сміття не ламає', () => {
    for (const x of [null, undefined, {}, 'x', { finesCents: 'a' }]) expect(finesOf(x)).toBe(0);
  });
  it('екран результату друкує рядок штрафу з текстом у каталозі', () => {
    expect(host).toContain("data-ui=\"mg-fine\"");
    expect(host).toContain('finesOf(view.surface) > 0');
    expect((uk as Record<string, string>)['mg.drive.fine']).toBeTruthy();
  });
});
