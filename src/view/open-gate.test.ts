// GAME-260 · рішення «відкрити рамку події зараз чи дочекатись мапи». Закон 1: мутація openGate → завжди 'now' червонить «чекати».
import { describe, expect, it } from 'vitest';
import { openGate } from './open-gate';

describe('openGate (GAME-260, GAME-275)', () => {
  it('сцена ще на мапі дому, гравець уже на дорозі — чекати мапи', () => {
    expect(openGate({ sceneMap: 'home', wantMap: 'road' })).toBe('wait');
  });
  it('сцена вже на мапі дороги — відкривати зараз', () => {
    expect(openGate({ sceneMap: 'road', wantMap: 'road' })).toBe('now');
  });
  it('сцени ще немає (старт, завантаження сейву посеред події) — відкривати зараз', () => {
    expect(openGate({ sceneMap: null, wantMap: 'road' })).toBe('now');
  });
});
