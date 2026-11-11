// GAME-303 · модель проби подачі вступу: кожна репліка сімейних кроків має свій вигляд, сторінка накопичує панелі, нічого не вигадано поза розкадровкою.
import { describe, expect, it } from 'vitest';
import { LOCALES } from '../i18n';
import { INTRO_STEPS } from './intro-story';
import { ROOM_WHO, sceneKey, sceneKeys, sceneView } from './intro-scene';

describe('intro-scene (GAME-303)', () => {
  it('усі кроки родинної розмови, ночі й ранку мають вигляд; решта (пошук, лист, вибір, Атлас, мета) — ні', () => {
    for (const s of INTRO_STEPS) {
      const own = ['night', 'morning'].includes(s.kind) || (s.kind === 'line');
      expect(sceneView(s) !== null, `${sceneKey(s)}`).toBe(own);
    }
  });

  it('кожен ключ моделі — справжній крок розкадровки (без осиротілих рядків)', () => {
    const real = new Set(INTRO_STEPS.map(sceneKey));
    for (const k of sceneKeys()) expect(real.has(k), k).toBe(true);
  });

  it('вигляд узгоджений: показано 1…N панелей, говорить показана панель, репліки лише в показаних, текст кроку — репліка того, хто говорить', () => {
    for (const s of INTRO_STEPS) {
      const v = sceneView(s);
      if (!v) continue;
      {
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
      const v = sceneView(s);
      if (!v || v.speaker === null) continue;
      const slot = v.slots[v.speaker];
      expect(slot?.kind === 'room' ? ROOM_WHO[slot.room] : null, sceneKey(s)).toBe(s.who);
    }
  });

  it('гібрид: розмова — комікс, ніч і ранок — повний кадр; ніч має сон, ранок — ні', () => {
    for (const s of INTRO_STEPS) {
      const v = sceneView(s);
      if (!v) continue;
      expect(v.mode, sceneKey(s)).toBe(s.kind === 'line' ? 'comic' : 'cinema');
      expect(v.dream, sceneKey(s)).toBe(s.kind === 'night');
    }
    const night = sceneView({ kind: 'night', text: null });
    expect(night?.slots.length).toBe(3);   // родина спить: три шоти
    expect(night?.slots.every((x) => x.kind === 'room' && x.pose === 'sleep')).toBe(true);
  });

  it('сторінка накопичує: у межах однієї сторінки показані панелі не зникають, а репліки не міняються', () => {
    let prev: ReturnType<typeof sceneView> = null;
    for (const s of INTRO_STEPS) {
      const v = sceneView(s);
      if (v && prev && prev.slots === v.slots && v.mode === 'comic') {
        expect(v.shown).toBeGreaterThanOrEqual(prev.shown);
        prev.lines.forEach((l, k) => { if (l !== null) expect(v.lines[k]).toBe(l); });
      }
      prev = v;
    }
  });

  it('усі ключі підписів і реплік є в uk і en', () => {
    for (const s of INTRO_STEPS) {
      const v = sceneView(s);
      if (!v) continue;
      for (const k of [v.caption, v.sfx, ...v.lines, ...(v.dream ? (['intro.dream'] as const) : [])]) if (k !== null) { expect(LOCALES.uk[k], `uk ${k}`).toBeTruthy(); expect(LOCALES.en[k], `en ${k}`).toBeTruthy(); }
    }
  });
});
