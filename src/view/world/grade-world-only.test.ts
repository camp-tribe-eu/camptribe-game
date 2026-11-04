// GAME-232 · колір доби — лише для СВІТУ (полотно Phaser). HUD, діалоги й тости — DOM у src/ui; жоден файл там не бере колір чи темряву доби.
// (Годинник у HUD бере timeOfDay — це лише число, не колір.) Мутація: додати `ambientAt`/`MORNING_TINT` у будь-який файл src/ui — тест червоніє.
import { describe, expect, it } from 'vitest';

const UI = import.meta.glob<string>('../../ui/**/*.{ts,tsx,css}', { query: '?raw', import: 'default', eager: true });
const SCENE = import.meta.glob<string>('./scene.ts', { query: '?raw', import: 'default', eager: true });
const GRADE_NAMES = /\b(ambientAt|ambientAtClock|NIGHT_TINT|MORNING_TINT|VIOLET_TINT|glowAlpha)\b/;

describe('колір доби не торкається UI (GAME-232)', () => {
  it('файли UI прочитані (інакше перевірка порожня)', () => {
    expect(Object.keys(UI).length).toBeGreaterThan(10);
  });

  it('жоден файл у src/ui не використовує колір/темряву доби', () => {
    const bad = Object.entries(UI).filter(([, src]) => GRADE_NAMES.test(src)).map(([p]) => p);
    expect(bad).toEqual([]);
  });

  it('у UI немає CSS-накладки доби на DOM (filter / mix-blend-mode від часу доби)', () => {
    const bad = Object.entries(UI).filter(([, src]) => /daylight|time-?of-?day.*(filter|blend)|(filter|blend).*time-?of-?day/i.test(src) && /mix-blend-mode|filter:/.test(src)).map(([p]) => p);
    expect(bad).toEqual([]);
  });

  it('сцена тримає шар у світі: прямокутник на полотні Phaser (add.rectangle), а не DOM', () => {
    const src = Object.values(SCENE)[0] ?? '';
    expect(src).toMatch(/this\.night = this\.add\.rectangle\(/);
    expect(src).not.toMatch(/document\.(body|getElementById|createElement)[^;]*night/);
    expect(src).toMatch(/ambientAt\(minuteOfDay\)/);
  });
});
