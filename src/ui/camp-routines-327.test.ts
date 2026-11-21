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
    // GAME-349: правило лишається першим рядком роботи в обох гілках (є сонце / сонця немає — дощ)
    expect(src).toMatch(/<section class="ui-camp-work">\s*\{sunRate\(weather\) > 0 \? \(\s*<>\s*<p class="ui-camp-note" data-ui="lantern-rule">\{t\('camp\.lantern\.rule'\)\}<\/p>\s*<p data-ui="lantern-sun"/);
    expect(src).toMatch(/\) : \(\s*<>\s*<p class="ui-camp-note" data-ui="lantern-rule">\{t\('camp\.lantern\.ruleDynamo'\)\}<\/p>\s*<p data-ui="lantern-nosun"/);
  });
  it('ключі є в обох мовах', () => {
    for (const k of ['camp.fire.smoke', 'camp.lantern.rule', 'mg.drive.fine', 'sd.goal.wait']) {
      expect((uk as Record<string, string>)[k], k).toBeTruthy();
      expect((en as Record<string, string>)[k], k).toBeTruthy();
    }
  });
  // GAME-338 (замінив GAME-327): ціль дня не вшиває імена в текст, а бере їх з `port.sample.neighbours()` — тих, над ким «!». Мутація (перевірено): повернути імена в sd.goal.day або прибрати `neighbours()` з Shell → червоніє.
  it('GAME-338: ціль дня називає лише сусідів із «!», імена не вшито в текст', async () => {
    const shell = (await import('./Shell.tsx?raw')).default;
    const sd = (await import('./SampleDay.tsx?raw')).default;
    expect(shell).toContain('sampleGoalLine(port.sample, t, lang)');   // GAME-346: текст чипа збирає одна функція (поведінка — sample-goal-346.test.ts)
    expect(sd).toContain('goalNames(goal, sample.neighbours(), back)');   // GAME-340: імена дає чиста goalNames (тест — у sample-day.test.ts)
    expect(sd).toContain('who.map((id) => ct(lang, id))');
    for (const [goal, loc] of [[uk, ukLoc], [en, enLoc]] as const) {
      for (const m of MISSIONS) expect((goal as Record<string, string>)['sd.goal.day'], m.giver).not.toContain((loc as Record<string, string>)[m.giver] as string);
    }
  });
  // GAME-328. Мутації (перевірено): `helpFor(day)` → `helpFor(startCampDay())`; прибрати `bite: help.timeScale`; прибрати `active !== 'firewood'` → червоніють.
  it('GAME-328: допомога береться з дня, йде в рибу й не обіцяє легшого там, де його нема', () => {
    expect(src).toMatch(/const help: Difficulty = helpFor\(day\);/);
    expect(src).toMatch(/stepFish\(s, \{ kind: 'tick', dtMs, down: rod, bite: help\.timeScale \}/);
    expect(src).toMatch(/const eased = help\.hint && active !== 'firewood' && active !== 'tidy'/);
    expect(src).toMatch(/data-help=\{eased \? 'yes' : 'no'\}/);
    expect(src).toMatch(/\{eased && <p[^>]*data-ui="camp-help"/);
  });
});
