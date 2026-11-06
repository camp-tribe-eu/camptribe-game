// GAME-261 · правило нагадування про код відновлення: раз за все життя, не поверх зайнятого екрана.
import { describe, expect, it } from 'vitest';
import { REMIND_AFTER_GAME_MIN, remindArmed, remindDue } from './remind';

const base = { shownEver: false, trip: 't1', remindedTrip: null, busy: false } as const;

describe('GAME-261 · remindArmed', () => {
  it('нове прибуття, вільний екран, ще не показували — відлік іде', () => expect(remindArmed(base)).toBe(true));
  it('уже показували колись — ніколи знову (навіть нова подорож)', () => expect(remindArmed({ ...base, shownEver: true, trip: 't2' })).toBe(false));
  it('екран зайнятий (пауза, розмова, підсумок) — відліку нема', () => expect(remindArmed({ ...base, busy: true })).toBe(false));
  it('без подорожі або про цю вже нагадали — нема', () => {
    expect(remindArmed({ ...base, trip: null })).toBe(false);
    expect(remindArmed({ ...base, remindedTrip: 't1' })).toBe(false);
  });
  const due = { ...base, armedAt: 100, now: 100 + REMIND_AFTER_GAME_MIN };
  it('на кадрі прибуття (0 ігрових хвилин) — ще ні; через REMIND_AFTER_GAME_MIN — так', () => {
    expect(remindDue({ ...due, now: 100 }), 'кадр прибуття').toBe(false);
    expect(remindDue({ ...due, now: 100 + REMIND_AFTER_GAME_MIN - 1 })).toBe(false);
    expect(remindDue(due)).toBe(true);
  });
  it('без відліку (armedAt null), показане раніше чи зайнятий екран — ніколи', () => {
    expect(remindDue({ ...due, armedAt: null })).toBe(false);
    expect(remindDue({ ...due, shownEver: true })).toBe(false);
    expect(remindDue({ ...due, busy: true })).toBe(false);
  });
});
