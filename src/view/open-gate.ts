// GAME-260 · подія в дорозі відкривається ПІСЛЯ перемикання мапи. Ядро ставить гравця на дорогу й кидає подію в тому ж кроці, а сцена міняє мапу
// у наступному update; рамка розмови ставить сцену на паузу — тож «Яблука біля дороги» читались на тлі мапи дому. Чиста функція: чекати чи відкривати зараз.
export type OpenDecision = 'now' | 'wait';

export interface OpenGateState {
  /** Мапа, яку сцена зараз показує (null — ще не створена). */
  readonly sceneMap: string | null;
  /** Мапа за локацією гравця в ядрі. */
  readonly wantMap: string;
  /** Сцена йде (на паузі мапа не перемкнеться — чекати марно). */
  readonly sceneRunning: boolean;
}

export function openGate(s: OpenGateState): OpenDecision {
  return s.sceneRunning && s.sceneMap !== null && s.sceneMap !== s.wantMap ? 'wait' : 'now';
}
