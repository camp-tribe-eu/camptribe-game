// GAME-327 · дошка табору: дим на нулі жару видно, у ліхтарів є правило. Мутації (перевірено): прибрати `smoking(embers)` з рядка жару → «дим» червоніє;
// прибрати рядок lantern-rule → «правило ліхтарів» червоніє; видалити ключ із каталогу → «ключі є в обох мовах» червоніє.
import src from './CampRoutines.tsx?raw';
import { describe, expect, it } from 'vitest';
import uk from '../i18n/uk.json';
import en from '../i18n/en.json';

describe('GAME-327 дошка табору', () => {
  it('рядок жару показує дим, коли дрова щойно підкинуто', () => {
    expect(src).toMatch(/data-ui="fire-heat"[^\n]*smoking\(embers\)/);
  });
  it('ліхтарі мають правило першим рядком роботи (як ягоди й вогонь)', () => {
    expect(src).toMatch(/<section class="ui-camp-work">\s*<p class="ui-camp-note" data-ui="lantern-rule">\{t\('camp\.lantern\.rule'\)\}<\/p>\s*<p data-ui="lantern-sun"/);
  });
  it('ключі є в обох мовах', () => {
    for (const k of ['camp.fire.smoke', 'camp.lantern.rule', 'mg.drive.fine']) {
      expect((uk as Record<string, string>)[k], k).toBeTruthy();
      expect((en as Record<string, string>)[k], k).toBeTruthy();
    }
  });
});
