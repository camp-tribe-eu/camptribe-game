// GAME-229 · порядок екранів кінця дня і вимикач «Що відкрилось». Закон 1: мутації — у PR (summary раніше за ранги → червоне; вимикач проігноровано → червоне).
import { describe, expect, it } from 'vitest';
import { collapseUps, queueUps, topOverlay, type SkillUp } from './overlay-order';
import shell from './Shell.tsx?raw';

const UP: SkillUp = { skill: 'skill.camping', rank: 1, order: 1 };

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
    const q = queueUps(false, [UP, { skill: 'skill.mechanics', rank: 2, order: 2 }]);
    expect(q).toEqual([]);
    expect(topOverlay({ episode: false, ups: q.length, summary: true })).toBe('summary');
  });
});

describe('одна картка на навичку', () => {
  it('ті самі навички не повторюються: найвищий ранг, усі здобуті ранги, порядок SKILL_IDS', () => {
    const q: SkillUp[] = [
      { skill: 'skill.endurance', rank: 1, order: 6 }, { skill: 'skill.camping', rank: 1, order: 1 },
      { skill: 'skill.endurance', rank: 2, order: 6 }, { skill: 'skill.camping', rank: 2, order: 1 }, { skill: 'skill.planning', rank: 1, order: 0 },
    ];
    expect(collapseUps(q)).toEqual([
      { skill: 'skill.planning', rank: 1, ranks: [1] },
      { skill: 'skill.camping', rank: 2, ranks: [1, 2] },
      { skill: 'skill.endurance', rank: 2, ranks: [1, 2] },
    ]);
  });
});

describe('нова гра й імпорт коду чистять чергу рангів (рецензія PR #165)', () => {
  const body = (name: string): string => { const i = shell.indexOf(name); return shell.slice(i, i + 700); };
  it('startNew викликає setUps([])', () => { expect(body('const startNew = ')).toContain('setUps([])'); });
  it('успішний importCode викликає setUps([])', () => { expect(body('port.importCode(codeIn)')).toContain('setUps([])'); });
});
