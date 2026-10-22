import { describe, expect, it } from 'vitest';
import { buildLabel } from './build-info';

describe('buildLabel', () => {
  const sha = 'fa1dc237e7df60ef33f6425f665411e5587fff66';

  it('містить версію і повний SHA', () => {
    expect(buildLabel('0.1.0', sha)).toBe(`CampLife v0.1.0 · ${sha}`);
  });

  it('скорочений SHA не видається за повний', () => {
    expect(buildLabel('0.1.0', 'fa1dc23')).toBe('CampLife v0.1.0 · unknown');
  });

  it('порожній SHA — unknown, а не порожній рядок', () => {
    expect(buildLabel('0.1.0', '')).toBe('CampLife v0.1.0 · unknown');
  });
});
