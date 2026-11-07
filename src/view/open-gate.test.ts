// GAME-260 · рішення «відкрити рамку події зараз чи дочекатись мапи». Закон 1: мутація openGate → завжди 'now' червонить «чекати».
import { describe, expect, it } from 'vitest';
import { openGate } from './open-gate';

describe('openGate (GAME-260)', () => {
  it('сцена ще на мапі дому, гравець уже на дорозі — чекати перемикання', () => {
    expect(openGate({ sceneMap: 'home', wantMap: 'road', sceneRunning: true })).toBe('wait');
  });
  it('мапа вже та сама — відкривати зараз', () => {
    expect(openGate({ sceneMap: 'road', wantMap: 'road', sceneRunning: true })).toBe('now');
  });
  it('сцена на паузі чи ще не створена — чекати марно, відкривати зараз', () => {
    expect(openGate({ sceneMap: 'home', wantMap: 'road', sceneRunning: false })).toBe('now');
    expect(openGate({ sceneMap: null, wantMap: 'road', sceneRunning: true })).toBe('now');
  });
});
