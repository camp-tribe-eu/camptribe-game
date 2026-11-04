// GAME-230 · вигляд подарунка: реакція → значок і звук, поза героя рівно 30 кадрів (покадрово, без годинника).
// Мутації (перевірено, див. PR): GIFT_POSE_FRAMES 30→31 → «поза триває рівно 30 кадрів» червоніє; giftEmote небажаного → 'bang' (докір) → «жодної реакції-докору»;
// у gift-fx.ts з’являється Date.now/setTimeout → no-realtime червоніє.
import { describe, expect, it } from 'vitest';
import { CAMP_SPECS } from '../../audio/camp-sounds';
import { GIFT_POSE_FRAMES, giftEmote, giftSound, nextPoseAge, poseColumn, POSE_COLUMNS } from './gift-fx';
import { EMOTES } from './neighbours';

const RAW = import.meta.glob<string>('./gift-fx.ts', { query: '?raw', import: 'default', eager: true });

describe('реакція на подарунок', () => {
  it('подобається — ♥ і дзвіночок; решта — «…» і глухий звук; докорів і «!» немає', () => {
    expect([giftEmote('liked'), giftEmote('neutral'), giftEmote('disliked')]).toEqual(['heart', 'dots', 'dots']);
    expect([giftSound('liked'), giftSound('neutral'), giftSound('disliked')]).toEqual(['bell', 'dull', 'dull']);
    for (const r of ['liked', 'neutral', 'disliked'] as const) { expect(giftEmote(r)).not.toBe('bang'); expect(EMOTES[giftEmote(r)]).toBeDefined(); expect(CAMP_SPECS[giftSound(r)]).toBeDefined(); }
  });
  it('дзвіночок високий і дзвінкий, «глухий» — низький (чути різницю)', () => {
    expect(CAMP_SPECS.bell.from).toBeGreaterThan(CAMP_SPECS.dull.from * 4);
    expect(CAMP_SPECS.bell.ms).toBeGreaterThan(CAMP_SPECS.dull.ms);
  });
});

describe('поза героя', () => {
  it('поза триває рівно 30 кадрів: кадри 0…29 мають стовпець, 30 — ні; лічильник доходить до -1 саме після 29-го', () => {
    expect(GIFT_POSE_FRAMES).toBe(30);
    for (let a = 0; a < GIFT_POSE_FRAMES; a++) expect(poseColumn(a), `кадр ${a}`).not.toBeNull();
    expect(poseColumn(GIFT_POSE_FRAMES)).toBeNull();
    expect(poseColumn(-1)).toBeNull();
    let age = 0; let frames = 1;
    while ((age = nextPoseAge(age)) >= 0) frames++;
    expect(frames).toBe(GIFT_POSE_FRAMES);
  });
  it('стовпці листа thrust: 0…7, рука тягнеться → тримає → повертається; кожен кадр тримається 10', () => {
    expect(POSE_COLUMNS.every((c) => c >= 0 && c <= 7)).toBe(true);
    const cols = Array.from({ length: GIFT_POSE_FRAMES }, (_, a) => poseColumn(a));
    expect(cols.slice(0, 10).every((c) => c === POSE_COLUMNS[0])).toBe(true);
    expect(cols.slice(10, 20).every((c) => c === POSE_COLUMNS[1])).toBe(true);
    expect(cols.slice(20).every((c) => c === POSE_COLUMNS[2])).toBe(true);
  });
});

describe('no-realtime', () => {
  it('gift-fx.ts: ні tween, ні таймерів, Date, performance, Math.random; без Phaser; без текстів у коді', () => {
    const src = (Object.values(RAW)[0] ?? '').replace(/\/\/.*$/gm, '');
    expect(src.length).toBeGreaterThan(100);   // файл справді прочитано (порожній вивід — збій, а не «чисто»)
    expect(src).not.toMatch(/tweens|setTimeout|setInterval|Date\.now|new Date|performance\.now|time\.addEvent|delayedCall|Math\.random|requestAnimationFrame/);
    expect(src).not.toMatch(/from 'phaser'/);
    expect(src).not.toMatch(/['"`][А-Яа-яІіЇїЄє]/);
  });
});
