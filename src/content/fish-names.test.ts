// GAME-319 · назви риб гравець бачить лише українською з i18n, а сигнал поклівки видно й рахується кадрами.
// Мутації (перевірено, повідомлення — у PR): прибрати `.map((id) => t(...))` у CampRoutines → тест «дошка» червоніє;
// стерти ключ fish.sp.pike з uk.json → «кожен вид має ключ» червоніє; floatDip завжди 0 / biteCue завжди false → тест сигналу червоніє.
import board from '../ui/CampRoutines.tsx?raw';
import uk from '../i18n/uk.json';
import en from '../i18n/en.json';
import { describe, expect, it } from 'vitest';
import { FISH_IDLE, SPECIES } from './fishing';
import { biteCue, floatDip, speciesAt } from './fish-table';

const U = uk as Record<string, string>;
const E = en as Record<string, string>;

describe('назви риб', () => {
  it('кожен вид має ключ в uk і en, а українська назва — кирилицею й не дорівнює id', () => {
    for (const sp of SPECIES) {
      const k = `fish.sp.${sp.id}`;
      expect(U[k], k).toBeTruthy();
      expect(E[k], k).toBeTruthy();
      expect(U[k]).toMatch(/^[А-ЯІЇЄҐа-яіїєґ' ]+$/);
      expect(U[k]).not.toBe(sp.id);
    }
  });
  it('усе, що таблиця видів віддає дошці, є видом із ключем', () => {
    for (const w of ['sunny', 'cloudy', 'rain'] as const) for (const id of speciesAt('afternoon', w)) expect(U[`fish.sp.${id}`]).toBeTruthy();
  });
  it('дошка табору показує назву через i18n, а не сирий id виду', () => {
    expect(board).toContain("speciesAt('afternoon', weather).map((id) => t(`fish.sp.${id}` as Key))");
    expect(board).not.toMatch(/speciesAt\([^)]*\)\.join/);
  });
});

describe('сигнал поклівки', () => {
  it('у фазі bite є мітка і поплавок пірнає між кадрами, поза нею — тиша', () => {
    const bite = { ...FISH_IDLE, phase: 'bite' as const };
    expect(biteCue(bite)).toBe(true);
    expect(floatDip({ ...bite, t: 0 })).toBe(0);
    expect(floatDip({ ...bite, t: 160 })).toBe(5);
    expect(floatDip({ ...bite, t: 310 })).toBe(0);
    for (const phase of ['idle', 'charge', 'wait', 'reel', 'choice'] as const) {
      expect(biteCue({ ...FISH_IDLE, phase })).toBe(false);
      expect(floatDip({ ...FISH_IDLE, phase, t: 160 })).toBe(0);
    }
  });
  it('мітка «Клює!» є в обох мовах', () => {
    expect(U['camp.fish.bite']).toBe('Клює!');
    expect(E['camp.fish.bite']).toBeTruthy();
  });
});
