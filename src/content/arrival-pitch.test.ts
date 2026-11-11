/// <reference types="node" />
// GAME-310 · сторожі ланцюга приїзду (docs/ARRIVAL-CONTRACT.md). Закон 1: кожен сторож показано червоним
// мутацією ДАНИХ — набори ділянок, що не залежать від приїзду; ніч, однакова на всіх ділянках; `bite` без
// ліків; ділянка, про яку нема звідки дізнатись. Тексти червоних — в описі PR.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ARRIVAL_DEFAULT, ARRIVAL_FLAG, ARRIVAL_TIMES, LEARN_SOURCES, NIGHT_EFFECTS, NIGHT_WEATHERS, PITCHES, PITCH_FLAG, PITCH_IDS, PREP_FLAGS,
  arrivalFlag, arrivalOf, checkArrivalChain, checkLearnable, checkNightSoft, checkNoDominantPitch, checkPitchesDiffer,
  choiceInformed, familyLineKey, freePitches, freePitchesOf, learnedPitches, nightAt, nightCost, nightPassable,
  ARRIVAL_BY_DRIVE, pitchAvailable, pitchDef, pitchFlag, pitchFromFullId, pitchFullId, pitchTaken, type NightEffect, type PitchDef,
} from './arrival-pitch';
import { DRIVE_FLAG, DRIVE_OUTCOMES } from './drive-in';

const locale = (lang: string): Record<string, string> => JSON.parse(readFileSync(new URL(`../../content/locales/${lang}.json`, import.meta.url), 'utf8')) as Record<string, string>;
const flagsJson = (): { id: string; values?: string[] }[] => JSON.parse(readFileSync(new URL('../../content/flags.json', import.meta.url), 'utf8')) as { id: string; values?: string[] }[];
const mapJson = (): { layers: { name: string; objects?: { name: string }[] }[] } => JSON.parse(readFileSync(new URL('../../public/maps/camp-lake.tmj', import.meta.url), 'utf8')) as { layers: { name: string; objects?: { name: string }[] }[] };

describe('GAME-310 · договір дороги: час приїзду', () => {
  it('без дороги — «вчасно»; прапорець дороги читається; найпізніший перемагає', () => {
    expect(arrivalOf([])).toBe(ARRIVAL_DEFAULT);
    for (const t of ARRIVAL_TIMES) expect(arrivalOf([arrivalFlag(t)])).toBe(t);
    expect(arrivalOf([arrivalFlag('early'), arrivalFlag('late')]), 'суперечка прапорців — беремо гірше для гравця').toBe('late');
    expect(new Set(ARRIVAL_TIMES.map(arrivalFlag)).size).toBe(ARRIVAL_TIMES.length);
  });

  it('приїзд, вибір ділянки, заїзд і підготовка є в реєстрі content/flags.json з тими самими значеннями', () => {
    const reg = flagsJson();
    const ids = reg.map((f) => f.id);
    const values = (id: string): readonly string[] => reg.find((f) => f.id === id)?.values ?? [];
    expect(ids, `немає ${ARRIVAL_FLAG}`).toContain(ARRIVAL_FLAG);
    expect(values(ARRIVAL_FLAG), 'реєстр і код розійшлись у значеннях приїзду').toEqual([...ARRIVAL_TIMES]);
    expect(ids).toContain(PITCH_FLAG);
    expect(values(PITCH_FLAG)).toEqual([...PITCH_IDS]);
    expect(ids).toContain(DRIVE_FLAG);
    expect(values(DRIVE_FLAG)).toEqual([...DRIVE_OUTCOMES]);
    for (const f of Object.values(PREP_FLAGS)) expect(ids, `немає ${f}`).toContain(f);
  });
});

describe('GAME-310 · міст до дороги (GAME-309)', () => {
  it('три результати дороги лягають на три різні часи приїзду, і набори мають 4 / 3 / 2 ділянки', () => {
    expect(Object.keys(ARRIVAL_BY_DRIVE)).toEqual(['good', 'fine', 'scrappy']);
    expect(freePitches(ARRIVAL_BY_DRIVE.good).length).toBe(4);
    expect(freePitches(ARRIVAL_BY_DRIVE.fine).length).toBe(3);
    expect(freePitches(ARRIVAL_BY_DRIVE.scrappy).length).toBe(2);
    expect(new Set(Object.values(ARRIVAL_BY_DRIVE)).size, 'два результати дороги на один приїзд — ланка втратила крок').toBe(3);
  });

  it('повні id ділянок дороги читаються туди й назад', () => {
    for (const p of PITCH_IDS) expect(pitchFromFullId(pitchFullId(p))).toBe(p);
    expect(pitchFullId('water')).toBe('pitch.water');
    expect(pitchFromFullId('pitch.nowhere')).toBeNull();
  });
});

describe('GAME-310 · ланка «час приїзду → вільні ділянки»', () => {
  it('рано — усі чотири; вчасно — три; пізно — дві, і серед них завжди є вибір', () => {
    expect(freePitches('early')).toEqual([...PITCH_IDS]);
    expect(freePitches('ontime')).toEqual(['beeches', 'meadow', 'reception']);
    expect(freePitches('late')).toEqual(['meadow', 'reception']);
    expect(checkArrivalChain()).toEqual([]);
    expect(pitchAvailable('late', 'water'), 'приїхав пізно — найкраща вже зайнята').toBe(false);
    expect(pitchAvailable('early', 'water')).toBe(true);
  });

  it('ланка справді в стані: набір ділянок міняється від прапорця дороги', () => {
    expect(freePitchesOf({ flags: [arrivalFlag('early')] })).toEqual([...PITCH_IDS]);
    expect(freePitchesOf({ flags: [arrivalFlag('late')] })).toEqual(['meadow', 'reception']);
    expect(freePitchesOf({ flags: [] })).toEqual(freePitches(ARRIVAL_DEFAULT));
  });

  it('МУТАЦІЯ: ділянки, що не залежать від приїзду, — сторож червоніє', () => {
    const flat: PitchDef[] = PITCHES.map((d) => ({ ...d, demand: 4 }));   // усе вільне завжди
    const red = checkArrivalChain(flat);
    expect(red.length, 'розірвана ланка мусить дати червоне').toBeGreaterThan(0);
    expect(red.join(' ')).toContain('arriving later did not cost a pitch');
    expect(freePitches('late', flat).length).toBe(PITCHES.length);
  });

  it('МУТАЦІЯ: пізній приїзд без вибору (одна ділянка) — сторож червоніє', () => {
    const only: PitchDef[] = PITCHES.map((d) => ({ ...d, demand: d.id === 'reception' ? 4 : 1 }));
    expect(checkArrivalChain(only).join(' ')).toContain('no choice left');
  });
});

describe('GAME-310 · ланка «ділянка → що робить ніч»', () => {
  it('у кожної ділянки свій характер, і в бурю він чути', () => {
    expect(checkPitchesDiffer()).toEqual([]);
    expect(nightAt('water', 'storm').map((e) => e.id)).toContain('water.flood');
    expect(nightAt('beeches', 'storm').map((e) => e.id)).toContain('beeches.branch');
    expect(nightAt('meadow', 'storm').map((e) => e.id)).toContain('meadow.wind');
    expect(nightAt('reception', 'storm').every((e) => e.bite === 'nudge'), 'біля рецепції ніколи не страшно — лише не спиться').toBe(true);
  });

  it('підготовка вдень справді міняє ніч', () => {
    const wet = nightAt('water', 'storm');
    const dry = nightAt('water', 'storm', [PREP_FLAGS.highGround, PREP_FLAGS.tarp]);
    expect(wet.length).toBeGreaterThan(dry.length);
    expect(dry.some((e) => e.bite === 'bite'), 'підняли речі — не підтопить').toBe(false);
    expect(nightCost('water', 'storm')).toBeGreaterThan(nightCost('water', 'storm', [PREP_FLAGS.highGround, PREP_FLAGS.tarp]));
    expect(nightAt('beeches', 'storm', [PREP_FLAGS.knots]).some((e) => e.id === 'beeches.branch')).toBe(false);
    expect(nightAt('meadow', 'storm', [PREP_FLAGS.windbreak]).some((e) => e.id === 'meadow.wind')).toBe(false);
  });

  it('жодна ділянка не робить ніч непрохідною', () => {
    expect(checkNightSoft()).toEqual([]);
    for (const p of PITCH_IDS) for (const w of NIGHT_WEATHERS) expect(nightPassable(p, w), `${p}/${w}`).toBe(true);
  });

  it('жодна ділянка не є «правильною відповіддю»', () => {
    expect(checkNoDominantPitch()).toEqual([]);
    const full = Object.values(PREP_FLAGS);
    expect(nightCost('reception', 'storm', full), 'готовий табір на галявині спить краще, ніж біля рецепції').toBeGreaterThan(nightCost('meadow', 'storm', full));
    expect(nightCost('reception', 'storm'), 'непідготовленому біля рецепції безпечніше').toBeLessThan(nightCost('meadow', 'storm'));
  });

  it('МУТАЦІЯ: однакова ніч на всіх ділянках — сторож червоніє', () => {
    const same: NightEffect[] = PITCHES.map((d) => ({ id: `${d.id}.same`, pitch: d.id, when: [...NIGHT_WEATHERS], bite: 'nudge', cure: null, textKey: `night.${d.id}.same` }));
    expect(checkPitchesDiffer(same).join(' ')).toContain('same night — choosing between them is cosmetic');
  });

  it('МУТАЦІЯ: «bite» без ліків і ніч, якої не пережити, — сторож червоніє', () => {
    const cruel: NightEffect[] = [...NIGHT_EFFECTS, { id: 'water.doom', pitch: 'water', when: ['storm'], bite: 'bite', cure: null, textKey: 'night.water.doom' }];
    const red = checkNightSoft(cruel);
    expect(red.join(' ')).toContain('a bite with no cure');
    expect(red.join(' ')).toContain('a bite survives full preparation');
  });
});

describe('GAME-310 · вибір не сліпий і не підказаний', () => {
  it('про кожну ділянку є звідки дізнатись, але жодне джерело не розкриває всіх', () => {
    expect(checkLearnable()).toEqual([]);
    expect(choiceInformed('early', [])).toBe(false);
    for (const s of LEARN_SOURCES) expect(choiceInformed('early', [s]), `${s} саме по собі не має розкривати все`).toBe(false);
    expect(choiceInformed('early', [...LEARN_SOURCES])).toBe(true);
    expect(choiceInformed('late', ['look', 'neighbour']), 'пізній приїзд: лишилось двоє, і обидві видно з доріжки').toBe(true);
    expect(learnedPitches(['host'])).toEqual(['water', 'beeches']);
  });

  it('МУТАЦІЯ: ділянка, про яку ніхто не скаже, — сторож червоніє', () => {
    const blind: PitchDef[] = PITCHES.map((d) => (d.id === 'meadow' ? { ...d, learn: [] } : d));
    expect(checkLearnable(blind).join(' ')).toContain('a blind pick');
  });

  it('МУТАЦІЯ: господиня, що розповідає все, — сторож червоніє', () => {
    const spoiler: PitchDef[] = PITCHES.map((d) => ({ ...d, learn: ['host'] }));
    expect(checkLearnable(spoiler).join(' ')).toContain('one source tells everything');
  });
});

describe('GAME-310 · дані ділянок, мапа й тексти', () => {
  it('ділянка пишеться в стан і читається з нього', () => {
    expect(pitchTaken([])).toBeNull();
    for (const p of PITCH_IDS) expect(pitchTaken([pitchFlag(p)])).toBe(p);
    expect(new Set(PITCH_IDS.map(pitchFlag)).size).toBe(PITCH_IDS.length);
  });

  it('кожна ділянка стоїть на наявному якорі мапи табору, і якорі не повторюються', () => {
    const objects = mapJson().layers.find((l) => l.name === 'objects')?.objects ?? [];
    const names = new Set(objects.map((o) => o.name));
    for (const d of PITCHES) expect(names, `немає об'єкта ${d.spot} на camp-lake.tmj`).toContain(d.spot);
    expect(new Set(PITCHES.map((d) => d.spot)).size).toBe(PITCHES.length);
    expect(new Set(PITCHES.map((d) => d.demand)).size, 'черга попиту має бути однозначною').toBe(PITCHES.length);
  });

  it('усі ключі текстів є в обох мовах і вкладаються в рамку телефона', () => {
    const uk = locale('uk');
    const en = locale('en');
    const keys = [
      ...PITCHES.flatMap((d) => [d.nameKey, d.upsideKey, d.catchKey]),
      ...NIGHT_EFFECTS.map((e) => e.textKey),
      ...PITCH_IDS.map(familyLineKey),
    ];
    for (const k of keys) {
      expect(uk[k], `немає uk: ${k}`).toBeTruthy();
      expect(en[k], `немає en: ${k}`).toBeTruthy();
      expect([...(uk[k] as string)].length, `задовгий uk: ${k}`).toBeLessThanOrEqual(110);
      expect([...(en[k] as string)].length, `задовгий en: ${k}`).toBeLessThanOrEqual(110);
    }
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('у кожної ділянки є і перевага, і ціна — інакше це не вибір', () => {
    for (const p of PITCH_IDS) {
      const d = pitchDef(p);
      expect(d.upsideKey).not.toBe(d.catchKey);
      expect(NIGHT_EFFECTS.filter((e) => e.pitch === p).length, `${p}: ніч нічого не каже`).toBeGreaterThan(0);
    }
  });
});
