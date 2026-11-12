// GAME-309 · сторожі сценарію дороги. Мутації, перевірені руками:
//   1. прибрати `!said.has(b.id)` у `nextBeats` → «репліка прозвучала двічі».
//   2. стерти один ключ з en.json → «ключі uk і en розійшлися».
//   3. повісити біт на подію, якої не буває (`on: 'lane-busy'`) → «ніколи не звучить у жодній поїздці».
import { describe, expect, it } from 'vitest';
import en from '../i18n/en.json';
import uk from '../i18n/uk.json';
import { buildCourse, startDrive, stepDrive, type Course, type DriveEvent, type DriveState } from './drive';
import { DRIVE_BEATS, DRIVE_BEAT_KEYS, nextBeats } from './drive-script';
import { BRISK, CALM_FAST, FRAME_MS, SCRAPPY, SHAKY, START_MONEY, STEADY, dodgeTo, type Policy } from './drive.fixture';

const LOCALES: Readonly<Record<string, Readonly<Record<string, string>>>> = { uk, en };
/** Межа репліки на телефоні (скіл game-content, §2). */
const MAX_LINE = 110;

/** Проїхати поїздку й зібрати, які репліки прозвучали і скільки разів. */
function voices(c: Course, p: Policy): string[] {
  let s = startDrive(c, START_MONEY);
  const said = new Set<string>();
  const heard: string[] = [];
  let guard = 0;
  while (s.phase !== 'arrived') {
    if (++guard > 120_000) throw new Error('поїздка не скінчилась');
    const batch: DriveEvent[] = [];
    const go = (r: { state: DriveState; events: readonly DriveEvent[] }): void => { s = r.state; batch.push(...r.events); };
    const want = p.pace(s, c);
    if (want !== s.pace) go(stepDrive(s, c, { kind: 'pace', pace: want }));
    const hold = p.lane?.(s, c) ?? null;
    const to = hold !== null ? hold : p.dodge === false ? null : dodgeTo(s, c);
    if (to !== null && to !== s.lane && s.changing === 0) go(stepDrive(s, c, { kind: 'lane', to }));
    if (s.offer !== null && p.stop?.(s, c) === true) go(stepDrive(s, c, { kind: 'stop' }));
    go(stepDrive(s, c, { kind: 'tick', dtMs: FRAME_MS }));
    for (const b of nextBeats(s, c, batch, said)) { said.add(b.id); heard.push(b.id); }
  }
  return heard;
}

describe('репліки дороги', () => {
  it('кожна репліка має пару uk/en і вкладається в екран телефона', () => {
    expect(DRIVE_BEAT_KEYS.length).toBe(DRIVE_BEATS.length);
    for (const key of DRIVE_BEAT_KEYS) for (const [lang, dict] of Object.entries(LOCALES)) {
      const line = dict[key];
      expect(line, `${key} ${lang}: ключа немає`).toBeDefined();
      expect((line ?? '').length, `${key} ${lang}: ${(line ?? '').length} знаків`).toBeLessThanOrEqual(MAX_LINE);
      expect((line ?? '').trim().length, `${key} ${lang}: порожньо`).toBeGreaterThan(0);
    }
  });
  it('ключі uk і en не розійшлися (мутація: стерти ключ в en — червоніє)', () => {
    expect(Object.keys(uk).filter((k) => k.startsWith('ui.drive.')).sort()).toEqual(Object.keys(en).filter((k) => k.startsWith('ui.drive.')).sort());
  });
  it('у жодної репліки немає дубля тексту — дорога не повторюється', () => {
    for (const dict of Object.values(LOCALES)) {
      const lines = DRIVE_BEAT_KEYS.map((k) => dict[k]);
      expect(new Set(lines).size).toBe(lines.length);
    }
  });
  it('кожен біт має або місце, або подію — і рівно одне з двох', () => {
    for (const b of DRIVE_BEATS) expect(`${b.id}: ${b.at !== undefined} ${b.on !== undefined}`).toMatch(/: (true false|false true)$/);
  });

  it('жодна репліка не звучить двічі за поїздку (мутація: прибрати фільтр said — червоніє)', () => {
    for (const seed of [1, 7, 11]) {
      const heard = voices(buildCourse(seed), CALM_FAST);
      expect(new Set(heard).size, `зерно ${seed}: ${heard.join(',')}`).toBe(heard.length);
    }
  });

  it('дорога жива: у спокійній поїздці звучить щонайменше вісім реплік', () => {
    for (const seed of [1, 7, 11]) expect(voices(buildCourse(seed), CALM_FAST).length, `зерно ${seed}`).toBeGreaterThanOrEqual(8);
  });

  it('КОЖНА репліка десь звучить (мутація: повісити біт на подію, якої не буває — червоніє)', () => {
    const heard = new Set<string>();
    for (const seed of [1, 2, 3, 7, 11, 19, 23, 42]) {
      const c = buildCourse(seed);
      for (const p of [CALM_FAST, STEADY, BRISK, SCRAPPY, SHAKY]) for (const id of voices(c, p)) heard.add(id);
      for (const id of voices({ ...c, startFuelL: 0.9 }, BRISK)) heard.add(id);
    }
    const mute = DRIVE_BEATS.filter((b) => !heard.has(b.id)).map((b) => b.id);
    expect(mute, `ніколи не звучать у жодній поїздці: ${mute.join(', ')}`).toEqual([]);
  });

  it('дорога готує вечір: прогноз про грозу й вказівник на рецепцію звучать у звичайній поїздці', () => {
    const heard = voices(buildCourse(1), CALM_FAST);
    expect(heard).toContain('radio');
    expect(heard).toContain('sign-camp');
    expect(heard).toContain('arrived');
  });
});
