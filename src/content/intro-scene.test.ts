// GAME-303 · модель проби подачі вступу: кожна репліка сімейних кроків має свій вигляд, сторінка накопичує панелі, нічого не вигадано поза розкадровкою.
import { describe, expect, it } from 'vitest';
import { LOCALES } from '../i18n';
import { INTRO_STEPS } from './intro-story';
import { INTRO_STYLES, parseIntroStyle, ROOM_WHO, sceneKey, sceneKeys, sceneViews } from './intro-scene';

describe('intro-scene (GAME-303)', () => {
  it('перемикач: невідоме значення — нинішній вступ', () => {
    expect(INTRO_STYLES).toEqual(['classic', 'comic', 'cinema']);
    for (const bad of [null, '', 'x', 'COMIC', 'classic']) expect(parseIntroStyle(bad)).toBe('classic');
    expect(parseIntroStyle('comic')).toBe('comic');
    expect(parseIntroStyle('cinema')).toBe('cinema');
  });

  it('усі кроки родинної розмови, ночі й ранку мають вигляд; решта (пошук, лист, вибір, Атлас, мета) — ні', () => {
    for (const s of INTRO_STEPS) {
      const own = ['night', 'morning'].includes(s.kind) || (s.kind === 'line');
      expect(sceneViews(s) !== null, `${sceneKey(s)}`).toBe(own);
    }
  });

  it('кожен ключ моделі — справжній крок розкадровки (без осиротілих рядків)', () => {
    const real = new Set(INTRO_STEPS.map(sceneKey));
    for (const k of sceneKeys()) expect(real.has(k), k).toBe(true);
  });

  it('вигляд узгоджений: показано 1…N панелей, говорить показана панель, репліки лише в показаних, текст кроку — репліка того, хто говорить', () => {
    for (const s of INTRO_STEPS) {
      const views = sceneViews(s);
      if (!views) continue;
      for (const v of views) {
        expect(v.shown).toBeGreaterThanOrEqual(1);
        expect(v.shown).toBeLessThanOrEqual(v.slots.length);
        expect(v.lines).toHaveLength(v.slots.length);
        if (v.speaker !== null) {
          expect(v.speaker).toBeLessThan(v.shown);
          expect(v.lines[v.speaker], `${sceneKey(s)}: у говорячої панелі є репліка`).toBe(s.text);
        }
        v.lines.forEach((l, k) => { if (l !== null) expect(k, `${sceneKey(s)}: репліка в непоказаній панелі`).toBeLessThan(v.shown); });
        expect(v.slots.length).toBeLessThanOrEqual(3);   // 2–3 панелі (одна — лише сон)
      }
    }
  });

  it('хто говорить, того й кімната: ім’я з розкадровки збігається з людиною в панелі (репліка належить своїй панелі)', () => {
    for (const s of INTRO_STEPS) {
      if (s.kind !== 'line' || !s.who) continue;
      const v = sceneViews(s)?.[0];
      if (!v || v.speaker === null) continue;
      const slot = v.slots[v.speaker];
      expect(slot?.kind === 'room' ? ROOM_WHO[slot.room] : null, sceneKey(s)).toBe(s.who);
    }
  });

  it('сторінка накопичує: у межах однієї сторінки показані панелі не зникають, а репліки не міняються', () => {
    let prev: ReturnType<typeof sceneViews> extends infer T ? T : never = null;
    for (const s of INTRO_STEPS) {
      const v = sceneViews(s)?.[0];
      if (!v) { prev = null; continue; }
      const p = prev?.[0];
      if (p && p.slots === v.slots) {
        expect(v.shown).toBeGreaterThanOrEqual(p.shown);
        p.lines.forEach((l, k) => { if (l !== null) expect(v.lines[k]).toBe(l); });
      }
      prev = sceneViews(s);
    }
  });

  it('ніч — два вигляди (сплять → сниться), решта — один; усі ключі підписів є в uk і en', () => {
    const night = sceneViews({ kind: 'night', text: null });
    expect(night?.map((v) => v.slots[0]?.kind)).toEqual(['room', 'dream']);
    expect(night?.[0]?.slots.every((s) => s.kind === 'room' && s.pose === 'sleep')).toBe(true);
    for (const s of INTRO_STEPS) for (const v of sceneViews(s) ?? []) {
      for (const k of [v.caption, v.sfx, ...v.lines]) if (k !== null) { expect(LOCALES.uk[k], `uk ${k}`).toBeTruthy(); expect(LOCALES.en[k], `en ${k}`).toBeTruthy(); }
    }
  });
});
