// GAME-327 · дошка табору: дим на нулі жару видно, у ліхтарів є правило. Мутації (перевірено): прибрати `smoking(embers)` з рядка жару → «дим» червоніє;
// прибрати рядок lantern-rule → «правило ліхтарів» червоніє; видалити ключ із каталогу → «ключі є в обох мовах» червоніє.
import src from './CampRoutines.tsx?raw';
import { describe, expect, it } from 'vitest';
import uk from '../i18n/uk.json';
import en from '../i18n/en.json';
import ukLoc from '../../content/locales/uk.json';
import enLoc from '../../content/locales/en.json';
import { MISSIONS } from '../content/missions';

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
  // Мутація (перевірено): прибрати одне ім'я з sd.goal.day (або додати місію без імені) → червоніє.
  it('GAME-327: ціль дня називає всіх сусідів-видавців місій', () => {
    for (const [goal, loc] of [[uk, ukLoc], [en, enLoc]] as const) {
      for (const m of MISSIONS) expect((goal as Record<string, string>)['sd.goal.day'], m.giver).toContain((loc as Record<string, string>)[m.giver] as string);
    }
  });
});
