// GAME-261 · правило нагадування про код відновлення: раз за все життя, не поверх зайнятого екрана.
import { describe, expect, it } from 'vitest';
import { REMIND_CALM_S, remindArmed } from './remind';

const base = { shownEver: false, trip: 't1', remindedTrip: null, busy: false } as const;

describe('GAME-261 · remindArmed', () => {
  it('нове прибуття, вільний екран, ще не показували — відлік іде', () => expect(remindArmed(base)).toBe(true));
  it('уже показували колись — ніколи знову (навіть нова подорож)', () => expect(remindArmed({ ...base, shownEver: true, trip: 't2' })).toBe(false));
  it('екран зайнятий (пауза, розмова, підсумок) — відліку нема', () => expect(remindArmed({ ...base, busy: true })).toBe(false));
  it('без подорожі або про цю вже нагадали — нема', () => {
    expect(remindArmed({ ...base, trip: null })).toBe(false);
    expect(remindArmed({ ...base, remindedTrip: 't1' })).toBe(false);
  });
  it('пауза після прибуття — не на першому кадрі', () => expect(REMIND_CALM_S).toBeGreaterThan(0));
});
