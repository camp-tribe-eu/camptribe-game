import { describe, expect, it } from 'vitest';
import { testSwitches } from './test-switches';

describe('перемикачі e2e (рецензія GAME-36)', () => {
  it('у збірці e2e — працюють', () => {
    expect(testSwitches('?hideAct=complete&hideTouch=interact,stick', 'e2e')).toEqual({ hideAct: ['complete'], hideTouch: ['interact', 'stick'], hideUi: [], breakSpot: [], intro: false, panelActs: true });
    expect(testSwitches('?intro=1', 'e2e').intro).toBe(true);   // GAME-182: вступ у збірці e2e — лише за проханням
    expect(testSwitches('?mapFirst=1', 'e2e').panelActs).toBeUndefined();   // GAME-175: справжня поведінка — мапа першою
  });
  it('у звичайній збірці (production, development) — вимкнені', () => {
    for (const mode of ['production', 'development']) expect(testSwitches('?hideAct=complete&hideTouch=interact&seed=7', mode)).toEqual({ hideAct: [], hideTouch: [], hideUi: [], breakSpot: [], intro: true });
  });
  it('зерно: лише ціле невід’ємне; інакше — без зерна', () => {
    expect(testSwitches('?seed=7', 'e2e').seed).toBe(7);
    for (const bad of ['?seed=x', '?seed=-1', '?seed=1.5', '']) expect(testSwitches(bad, 'e2e').seed).toBeUndefined();
  });

  it('noAutosave: лише в e2e і лише =1 (GAME-86)', () => {
    expect(testSwitches('?noAutosave=1', 'e2e').noAutosave).toBe(true);
    expect(testSwitches('?noAutosave=0', 'e2e').noAutosave).toBeUndefined();
    expect(testSwitches('?noAutosave=1', 'production').noAutosave).toBeUndefined();
  });

  it('freshSeed: лише в e2e і лише =1 (GAME-89 №2)', () => {
    expect(testSwitches('?freshSeed=1', 'e2e').freshSeed).toBe(true);
    expect(testSwitches('?freshSeed=0', 'e2e').freshSeed).toBeUndefined();
    expect(testSwitches('?freshSeed=1', 'production').freshSeed).toBeUndefined();
  });

  it('frameLagMs: лише в e2e і лише ціле 1…190 (GAME-97)', () => {
    expect(testSwitches('?frameLagMs=120', 'e2e').frameLagMs).toBe(120);
    for (const bad of ['?frameLagMs=0', '?frameLagMs=191', '?frameLagMs=1.5', '?frameLagMs=x', '']) expect(testSwitches(bad, 'e2e').frameLagMs).toBeUndefined();
    expect(testSwitches('?frameLagMs=120', 'production').frameLagMs).toBeUndefined();
  });

  it('holdToast: лише в e2e і лише =1 (GAME-98)', () => {
    expect(testSwitches('?holdToast=1', 'e2e').holdToast).toBe(true);
    expect(testSwitches('?holdToast=0', 'e2e').holdToast).toBeUndefined();
    expect(testSwitches('?holdToast=1', 'production').holdToast).toBeUndefined();
  });

  it('daylight=off: лише в e2e і лише =off (GAME-99)', () => {
    expect(testSwitches('?daylight=off', 'e2e').noDaylight).toBe(true);
    expect(testSwitches('?daylight=on', 'e2e').noDaylight).toBeUndefined();
    expect(testSwitches('?daylight=off', 'production').noDaylight).toBeUndefined();
  });

  it('atMinute: лише в e2e і лише ціле 0…1439 (GAME-99)', () => {
    expect(testSwitches('?atMinute=720', 'e2e').atMinute).toBe(720);
    expect(testSwitches('?atMinute=0', 'e2e').atMinute).toBe(0);
    for (const bad of ['?atMinute=1440', '?atMinute=-1', '?atMinute=1.5', '?atMinute=x', '?atMinute=']) expect(testSwitches(bad, 'e2e').atMinute).toBeUndefined();
    expect(testSwitches('?atMinute=720', 'production').atMinute).toBeUndefined();
  });
});
