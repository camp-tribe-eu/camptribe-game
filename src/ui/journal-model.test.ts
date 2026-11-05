import { describe, expect, it } from 'vitest';
import { JOURNAL_LABELS } from './StoryPanel';
import { dayNumber, groupByDay, JOURNAL_ICONS, JOURNAL_VISIBLE, SKILL_ICONS } from './journal-model';

const e = (type: string, at: number) => ({ type, key: null, at });

describe('journal-model (GAME-253)', () => {
  it('день 1 — перша доба; межа на 1440', () => {
    expect([0, 1439, 1440, 2880].map(dayNumber)).toEqual([1, 1, 2, 3]);
  });
  it('групує за днями, найновіше зверху, і в дні теж', () => {
    const days = groupByDay([e('Visit', 10), e('Pickup', 20), e('Sleep', 1500), e('Visit', 1600), e('Memory', 3000)]);
    expect(days.map((d) => d.day)).toEqual([3, 2, 1]);
    expect(days[1]?.entries.map((x) => x.type)).toEqual(['Visit', 'Sleep']);
    expect(days[2]?.entries.map((x) => x.at)).toEqual([20, 10]);
  });
  it('рівні за часом записи: пізніший у журналі — вище', () => {
    expect(groupByDay([e('Visit', 5), e('Pickup', 5)])[0]?.entries.map((x) => x.type)).toEqual(['Pickup', 'Visit']);
  });
  it('limit лишає найновіші й не ріже день навпіл неправильно', () => {
    const many = Array.from({ length: JOURNAL_VISIBLE + 5 }, (_, i) => e('Visit', i * 200));
    const shown = groupByDay(many, JOURNAL_VISIBLE).flatMap((d) => d.entries);
    expect(shown).toHaveLength(JOURNAL_VISIBLE);
    expect(shown[0]?.at).toBe((JOURNAL_VISIBLE + 4) * 200);
  });
  it('порожній журнал — жодної групи', () => { expect(groupByDay([])).toEqual([]); });
  it('кожен тип запису має підпис і значок; вісім навичок — значки', () => {
    expect(Object.keys(JOURNAL_ICONS).sort()).toEqual(Object.keys(JOURNAL_LABELS).sort());
    expect(Object.keys(SKILL_ICONS)).toHaveLength(8);
  });
});
