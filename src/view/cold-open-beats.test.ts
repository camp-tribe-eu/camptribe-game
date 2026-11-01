// GAME-216 · таблиця бітів холодного початку: чиста послідовність із виходом; разом ≤ 45 с; рядки ≤ 110 знаків у uk і en.
// Закон 1: кожна перевірка має мутацію, на якій вона червоніє.
import { describe, expect, it } from 'vitest';
import en from '../i18n/en.json';
import uk from '../i18n/uk.json';
import { BEATS, type Beat, COLD_OPEN_MAX_MS, COLD_OPEN_MS, LINE_MAX_CHARS, beatAt, beatsProblems, cameraFor, totalMs } from './cold-open-beats';

const LINES: Record<string, string[]> = {};
for (const b of BEATS) if (b.text) LINES[b.text] = [(uk as Record<string, string>)[b.text] ?? '', (en as Record<string, string>)[b.text] ?? ''];

describe('холодний початок — таблиця бітів (GAME-216)', () => {
  it('сцена ≤ 45 с, кожен біт ≥ 1 с, кінець — fade (вихід у вступ), рядки в обох мовах є і ≤ 110 знаків', () => {
    expect(COLD_OPEN_MS).toBe(totalMs(BEATS));
    expect(COLD_OPEN_MS).toBeLessThanOrEqual(COLD_OPEN_MAX_MS);
    for (const b of BEATS) if (b.text) for (const s of LINES[b.text] ?? []) { expect(s.length).toBeGreaterThan(0); expect(Array.from(s).length).toBeLessThanOrEqual(LINE_MAX_CHARS); }
    expect(beatsProblems(BEATS, LINES)).toEqual([]);
  });

  it('beatAt: кожна мить до кінця належить рівно одному біту, після кінця — null (сцена завершується сама)', () => {
    let start = 0;
    BEATS.forEach((b, i) => {
      expect(beatAt(start)?.index).toBe(i);
      expect(beatAt(start + b.ms - 1)?.index).toBe(i);
      start += b.ms;
    });
    expect(beatAt(COLD_OPEN_MS)).toBeNull();
    expect(beatAt(COLD_OPEN_MS + 10_000)).toBeNull();
    expect(beatAt(0)?.u).toBe(0);
  });

  it('камера: наїзд на вікно починається ближче, ніж закінчується; «менше руху» — одразу кінцевий кадр', () => {
    const win = BEATS[0] as Beat;
    expect(cameraFor(win, 0, 1, false).z).toBeGreaterThan(cameraFor(win, 1, 1, false).z);
    expect(cameraFor(win, 0, 1, true)).toEqual(cameraFor(win, 1, 1, false));
  });

  it('мутації → червоне: довша сцена, біт без тривалості, без fade наприкінці, задовгий рядок', () => {
    expect(beatsProblems([...BEATS.slice(0, -1), { ...(BEATS.at(-1) as Beat), ms: 20_000 }]).some((p) => p.startsWith('TOO_LONG'))).toBe(true);
    expect(beatsProblems(BEATS.map((b, i) => (i === 1 ? { ...b, ms: 0 } : b))).some((p) => p.startsWith('TOO_SHORT'))).toBe(true);
    expect(beatsProblems(BEATS.slice(0, -1)).some((p) => p.startsWith('NO_EXIT'))).toBe(true);
    expect(beatsProblems([]).some((p) => p.startsWith('EMPTY'))).toBe(true);
    expect(beatsProblems(BEATS, { ...LINES, 'cold.window': ['x'.repeat(LINE_MAX_CHARS + 1)] }).some((p) => p.startsWith('LINE_TOO_LONG'))).toBe(true);
  });
});
