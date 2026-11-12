// GAME-302 · «музика = шум білий якийсь противний» (власник, перегляд збірки). Причина: у вступі грав фон дощу — чистий білий шум 0,7–9 кГц (amb-rain, рівень 0,5),
// а музика (CC0-треки OpenGameArt) тонула під ним або ще не довантажилась. Тепер: (1) у вступі фонового шару немає зовсім — лише музика; (2) дощ у дворі — м'який рожевий+коричневий
// шум без білого джерела; (3) жоден амбієнт-шар не будується з НЕгейтованого білого шуму; (4) у src/audio немає власних «шумових» генераторів (Math.random у буфері).
// Закон 1: кожна перевірка має самотест-мутацію (білий дощ → червоніє). Спектр самого файлу міряється поза vitest (ffmpeg): плоскість спектра дощу 0,453 → 0,047 (у PR).
import { describe, expect, it } from 'vitest';
import gen from '../../scripts/audio/gen-audio.sh?raw';
import { ambientMix, type AmbientState } from './ambient';
import { createMusic, MUSIC_FILES } from './music';

const base: AmbientState = { map: 'camp', intro: true, nearLake: false, fireLit: true, nearFire: true, transport: null };
const MAPS: readonly AmbientState['map'][] = [null, 'home', 'camp', 'shop', 'road', 'mullerthal', 'schengen'];

/** Шари `amb`, джерело яких — білий шум без гейта (agate) — тобто суцільне шипіння. */
export function whiteBeds(src: string): string[] {
  return src.split('\n').filter((l) => l.startsWith('amb ')).filter((l) => /\$\(n white/.test(l) && !/agate/.test(l)).map((l) => l.split(' ')[1] as string);
}

describe('GAME-302 · без білого шуму за замовчуванням', () => {
  it('вступ: жодного фонового шару на жодній мапі (звучить лише музика); мутація «повернути дощ у вступ» (ambient.ts) → червона', () => {
    for (const map of MAPS) expect(ambientMix({ ...base, map }), `map ${String(map)}`).toEqual({});
  });
  it('скрипт синтезу: жодного шару із негейтованого білого шуму; самотест — білий дощ червоніє', () => {
    expect(whiteBeds(gen)).toEqual([]);
    const white = gen.replace(/^amb rain .*$/m, 'amb rain 12 "$(n white 12 0.5 11),highpass=f=700,lowpass=f=9000,volume=0.8[a];$(n brown 12 0.5 2),lowpass=f=400,volume=0.5[b];[a][b]amix=inputs=2:normalize=0"');
    expect(white).not.toBe(gen);
    expect(whiteBeds(white)).toEqual(['rain']);
  });
  it('музика ввімкнена за замовчуванням, а її треки — справжні файли, не синтез шуму', () => {
    const m = createMusic({ volume: () => 1, startLoop: () => ({ setVolume() { /* тихо */ }, stop() { /* тихо */ } }) } as never);
    expect(m.enabled).toBe(true);
    for (const f of Object.values(MUSIC_FILES)) expect(f.url).toMatch(/^audio\/mus-[a-z]+\.ogg$/);
    expect(gen).not.toMatch(/mus-/);   // скрипт синтезу не робить музики (SND-019…024 знято)
  });
  it('у коді src/audio немає власних генераторів шуму (Math.random, заповнення буфера)', () => {
    const src = import.meta.glob('./*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    const bad = Object.entries(src).filter(([f]) => !f.endsWith('.test.ts')).filter(([, t]) => /Math\.random|createBuffer\(|createScriptProcessor|AudioBufferSourceNode/.test(t)).map(([f]) => f);
    expect(bad).toEqual([]);
  });
});
