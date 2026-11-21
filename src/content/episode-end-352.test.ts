// GAME-352 · кінець епізоду вдома: порядок етапів (… → дорога додому → вдома → кінець), збірка рядків підсумку з КОЖНОЇ ланки ланцюга і «вдома» в сейві.
// Мутації (закон 1), кожну прогнано руками — результат у звіті картки:
//   M1 з AFTER_NIGHT прибрано рядок етапу 'home'                          → «порядок етапів» червоніє
//   M2 recapLines не додає рядок дороги додому ('road')                    → «кожна ланка ланцюга» і «ланка залежить від свого входу» червоніють
//   M3 команда SeeHome не пише поле / save не несе його                    → «сейв несе "вдома"» червоніє
//   M4 recapLines бере чистоту табору з порожнього ранку (clean завжди null) → «ланка залежить від свого входу» червоніє
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dispatch, type Command } from '../core/commands';
import { initialState } from '../core/state';
import { fromSave, serialize } from '../core/save';
import { newSim } from '../core/sim';
import { DRIVER, SKILL_DEFS, play } from '../core/story.fixture';
import { t } from '../i18n';
import { homeBeats, recapLines, type RecapInput } from './episode-end';
import { dayStage } from './sample-day';
import { NIGHT_FACTS, roughCount, type NightFacts } from './camp-night';
import { ROUTINE_IDS } from './camp-day';
import type { Outcome } from './minigame';
import { MISSIONS } from './missions';
import type { StrikeSave } from '../core/camp-strike';

const uk = JSON.parse(readFileSync(new URL('../i18n/uk.json', import.meta.url), 'utf8')) as Record<string, string>;
const en = JSON.parse(readFileSync(new URL('../i18n/en.json', import.meta.url), 'utf8')) as Record<string, string>;
const CLOSED = (o: string): StrikeSave => ({ closed: true, results: { tent: o, litter: o, fire: o, car: o } as StrikeSave['results'] });
const tu = (k: string): string => t('uk', k as never);
const CALM: NightFacts = { results: Object.fromEntries(ROUTINE_IDS.map((id) => [id, 'good' as Outcome])), litLanterns: 3, dryLogs: 6, water: 1, fish: 3, bitterBerries: 0, foodOutside: false, emptyRounds: 0, weather: 'rain' };
const FULL: RecapInput = { flags: ['f.arrival-early'], pitchName: 'Сосни', night: CALM, strike: CLOSED('good'), road: 'fine', walletText: 'Гаманець: 50' };

describe('порядок етапів після ночі', () => {
  it('ранок → дорога додому → вдома → кінець; «вдома» не стрибає вперед і не відкривається без дороги', () => {
    expect(dayStage('done', CLOSED('good'), undefined, false)).toBe('road-home');
    expect(dayStage('done', CLOSED('good'), 'fine', false)).toBe('home');
    expect(dayStage('done', CLOSED('good'), 'fine')).toBe('home');
    expect(dayStage('done', CLOSED('good'), 'scrappy', true)).toBe('summary');
    // «вдома» без дороги чи без закритого ранку нічого не перестрибує: попередній етап ще попереду
    expect(dayStage('done', CLOSED('good'), null, true)).toBe('road-home');
    expect(dayStage('done', undefined, 'fine', true)).toBe('strike');
    expect(dayStage('evening', CLOSED('good'), 'fine', true)).toBe('day');
  });
});

describe('кінцева картка: рядок від кожної ланки', () => {
  it('кожна ланка ланцюга має свій рядок, порядок: дорога туди, ділянка, місії, ніч, чистота, дорога додому, гаманець', () => {
    expect(recapLines(FULL, tu).map((l) => l.id)).toEqual(['arrival', 'pitch', 'missions', 'night', 'clean', 'road', 'wallet']);
  });
  it('ланка залежить від свого входу: змінили вхід — змінився саме її рядок', () => {
    expect(roughCount(CALM), 'вхід ночі справді різний').toBeLessThan(roughCount(NIGHT_FACTS));
    const base = new Map(recapLines(FULL, tu).map((l) => [l.id, l.text]));
    const changed: Record<string, Partial<RecapInput>> = {
      arrival: { flags: ['f.arrival-late'] }, pitch: { pitchName: 'Берег' }, missions: { flags: ['f.arrival-early', ...MISSIONS.map((m) => m.doneFlag)] },
      night: { night: NIGHT_FACTS }, clean: { strike: CLOSED('scrappy') }, road: { road: 'scrappy' }, wallet: { walletText: 'Гаманець: 7' },
    };
    for (const [id, over] of Object.entries(changed)) {
      const now = new Map(recapLines({ ...FULL, ...over }, tu).map((l) => [l.id, l.text]));
      expect(now.get(id), `${id} реагує на свій вхід`).not.toBe(base.get(id));
    }
  });
  it('нема ночі в цій сесії або ранок не закрито — рядка нема, а решта лишається; невідомий результат дороги не друкується', () => {
    expect(recapLines({ ...FULL, night: null }, tu).map((l) => l.id)).not.toContain('night');
    expect(recapLines({ ...FULL, strike: undefined }, tu).map((l) => l.id)).not.toContain('clean');
    expect(recapLines({ ...FULL, road: null }, tu).map((l) => l.id)).not.toContain('road');
    expect(recapLines({ ...FULL, road: 'bogus' }, tu).map((l) => l.id)).not.toContain('road');
    expect(recapLines({ ...FULL, road: null }, tu).map((l) => l.id)).toContain('wallet');
  });
  it('тексти: заголовок картки, «Ранок настає завжди» зникло, обидві мови', () => {
    expect(uk['sd.summary.title']).toBe('Вихідні біля озера · кінець епізоду');
    expect(en['sd.summary.title']).toContain('end of the episode');
    for (const L of [uk, en]) expect(L['sd.summary.end']).not.toMatch(/Ранок настає завжди|Morning always comes/);
  });
});

describe('прихід додому', () => {
  it('рівно два дотики, перекладені двома мовами; пізній приїзд має свою репліку', () => {
    expect(homeBeats('good')).toHaveLength(2);
    expect(homeBeats('scrappy')[1]).not.toBe(homeBeats('good')[1]);
    expect(homeBeats(null)[1]).toBe(homeBeats('fine')[1]);
    for (const road of ['good', 'fine', 'scrappy', null]) for (const k of homeBeats(road)) for (const L of [uk, en]) expect(L[k]?.trim(), k).toBeTruthy();
  });
  it('тварини вдома нема: герой зразка їде без тварини, тож жодної згадки кота', () => {
    for (const k of ['sd.home.beat1', 'sd.home.beat2', 'sd.home.beat2.late']) {
      expect(uk[k], k).not.toMatch(/кіт|кішк|Mia|Мія/i);
      expect(en[k], k).not.toMatch(/\bcat\b|kitten|Mia/i);
    }
  });
});

describe('сейв несе «вдома»', () => {
  const DEFS = { ...SKILL_DEFS };
  const start = () => play([DRIVER], initialState(50_000), DEFS);
  it('команда пише поле, збереження й завантаження повертають його', () => {
    const r = dispatch(start(), { type: 'SeeHome', commandId: 'h1' } as Command, DEFS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.homeSeen).toBe(true);
    const back = fromSave(serialize({ ...newSim(7, 0), game: r.state }));
    expect(back.ok && back.sim.game.homeSeen).toBe(true);
    // після завантаження етап — одразу кінець, а не дорога
    expect(dayStage('done', CLOSED('good'), 'fine', back.ok && back.sim.game.homeSeen === true)).toBe('summary');
  });
  it('старий сейв без поля вантажиться, «вдома» не вгадується', () => {
    const back = fromSave(serialize({ ...newSim(7, 0), game: start() }));
    expect(back.ok).toBe(true);
    expect(back.ok && back.sim.game.homeSeen).toBeUndefined();
  });
  it('чуже в сейві не пускається', () => {
    for (const bad of [false, 'yes', 1, null]) {
      const g = { ...start(), homeSeen: bad } as unknown as ReturnType<typeof start>;
      expect(fromSave(serialize({ ...newSim(7, 0), game: g })).ok, String(bad)).toBe(false);
    }
  });
});
