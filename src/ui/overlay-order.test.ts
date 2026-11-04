// GAME-229 · порядок екранів кінця дня і вимикач «Що відкрилось». Закон 1: мутації — у PR (summary раніше за ранги → червоне; вимикач проігноровано → червоне).
import { describe, expect, it } from 'vitest';
import { queueUps, topOverlay, type SkillUp } from './overlay-order';

const UP: SkillUp = { skill: 'skill.camping', rank: 1 };

describe('порядок: картка розділу → «Що відкрилось» → підсумок', () => {
  it('є і ранги, і підсумок — спершу ранги', () => {
    expect(topOverlay({ episode: false, ups: 2, summary: true })).toBe('levelup');
  });
  it('ранги прочитано (черга порожня) — підсумок', () => {
    expect(topOverlay({ episode: false, ups: 0, summary: true })).toBe('summary');
  });
  it('картка розділу — над усім; після неї — ранги, потім підсумок', () => {
    expect(topOverlay({ episode: true, ups: 1, summary: true })).toBe('episode');
    expect(topOverlay({ episode: false, ups: 1, summary: true })).toBe('levelup');
  });
  it('день не скінчився (підсумку немає) — ранги чекають, гру не перебивають', () => {
    expect(topOverlay({ episode: false, ups: 3, summary: false })).toBeNull();
  });
  it('повний ланцюжок: на кожному кроці рівно один екран і підсумок — останній', () => {
    const seq: (string | null)[] = [];
    let f = { episode: true, ups: 2, summary: true };
    seq.push(topOverlay(f));
    f = { ...f, episode: false }; seq.push(topOverlay(f));
    f = { ...f, ups: 0 }; seq.push(topOverlay(f));
    f = { ...f, summary: false }; seq.push(topOverlay(f));
    expect(seq).toEqual(['episode', 'levelup', 'summary', null]);
  });
});

describe('вимикач екрана рангів', () => {
  it('увімкнено — ранги йдуть у чергу як є', () => {
    expect(queueUps(true, [UP])).toEqual([UP]);
  });
  it('вимкнено — черга порожня, тож зверху одразу підсумок: екрана рангів немає', () => {
    const q = queueUps(false, [UP, { skill: 'skill.mechanics', rank: 2 }]);
    expect(q).toEqual([]);
    expect(topOverlay({ episode: false, ups: q.length, summary: true })).toBe('summary');
  });
});
