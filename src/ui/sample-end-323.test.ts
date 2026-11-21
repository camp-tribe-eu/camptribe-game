// GAME-323 · кінець зразкового дня: умови, яких не бачить DOM-стенд (шапка Shell живе лише в грі). Мутації (перевірено): прибрати з Shell `sampleGoalKey !== 'done' &&` біля ☰ → червоніє;
// у SampleDay повернути кнопку закриття підсумку замість «Почати знову» → червоніє; у порті прибрати `saves.newGame()` → червоніє.
import shell from './Shell.tsx?raw';
import sample from './SampleDay.tsx?raw';
import main from '../main.ts?raw';
import { describe, expect, it } from 'vitest';

describe('після зразкового дня', () => {
  it('☰ старої гри не показується, коли день скінчено', () => {
    expect(shell).toContain("{sampleGoalKey !== 'done' && <button type=\"button\" class=\"ui-story-btn\"");
  });
  it('кінець = goal «done»: дошка зникає, підсумок лишається, єдина дія — «Почати знову»', () => {
    // GAME-350: «день скінчено» тепер = ніч зіграно (goal «done», його дає dayStage), а далі ранок «згортаємо табір» і лише потім підсумок.
    expect(sample).toContain('const stageNow = dayStage(port.goal(), port.strike());');
    expect(sample).toContain("const ended = stageNow !== 'day';");
    expect(sample).toContain('{!boardOpen && !ended && (');
    expect(sample).toContain('{mounted && !ended && (');
    expect(sample).toContain('data-ui="sd-restart" onClick={again}');
    expect(sample).not.toContain('sd-finish');
  });
  it('«Почати знову» — нова гра й перезавантаження', () => {
    expect(main).toContain('restart: async () => { await saves.newGame(); location.reload(); }');
  });
});
