// GAME-229 · сторож «над героєм немає цифр». Закон 1: мутація — повернути `fx.pop(reward)` у scene.ts (червоне тут і в e2e game-229).
import { describe, expect, it } from 'vitest';
import { heroLabelOk } from './hero-label';
import scene from './scene.ts?raw';
import rig from './camp-alive-rig.ts?raw';

describe('heroLabelOk', () => {
  it('над героєм: «+», «OK», «!», слова — можна', () => {
    for (const ok of ['+', 'OK', '!', 'Ой!', 'Привіт']) expect(heroLabelOk(ok), ok).toBe(true);
  });
  it('цифри й слова нагороди — ні: «+1», «+15 XP +10 ОМ», «+XP», «+ОМ»', () => {
    for (const bad of ['+1', '+15 XP +10 ОМ', '+XP', '+ ОМ', '12', '+1 Шишка', 'xp']) expect(heroLabelOk(bad), bad).toBe(false);
  });
});

describe('джерело: сцена не малює нагороду й цифри над героєм', () => {
  const popCalls = (src: string): string[] => src.split('\n').filter((l) => /\bfx\??\.pop\(/.test(l) && !l.trim().startsWith('//'));
  it('жоден виклик fx.pop у scene.ts не несе змінну нагороди', () => {
    for (const l of popCalls(scene)) expect(l, l).not.toMatch(/reward/i);
  });
  it('усі рядкові літерали в fx.pop у scene.ts — дозволені підписи', () => {
    const lits = popCalls(scene).flatMap((l) => [...l.matchAll(/'([^']*)'/g)].map((m) => m[1] as string));
    expect(lits.length).toBeGreaterThan(0);
    for (const s of lits) expect(heroLabelOk(s), s).toBe(true);
  });
  it('камп-розваги більше не мають зворотного виклику «спливу над героєм» (шишки й ягоди — плашка в куті)', () => {
    expect(rig).not.toMatch(/this\.pop\(/);
  });
});
