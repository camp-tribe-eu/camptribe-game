// GAME-260 · подія в дорозі відкривається ПІСЛЯ перемикання мапи. Ядро ставить гравця на дорогу й кидає подію в тому ж кроці (sim.ts: roadEvent у Visit),
// а сцена міняє мапу лише у своєму update — тож «Яблука біля дороги» читались на тлі мапи дому. Чиста функція: чекати чи відкривати зараз.
// GAME-275 · стан сцени (на паузі чи ні) рішення НЕ змінює: справжній шлях QA — виїзд із рамки вибору, коли сцена вже на паузі. Поки «чекати»,
// main.ts ховає розмову з offer: Shell закриває рамку й знімає паузу, сцена перемикає мапу, mapEntered відкриває рамку події вже на дорозі.
export type OpenDecision = 'now' | 'wait';

export interface OpenGateState {
  /** Мапа, яку сцена зараз показує (null — ще не створена: старт гри, завантаження — відкривати одразу). */
  readonly sceneMap: string | null;
  /** Мапа за локацією гравця в ядрі. */
  readonly wantMap: string;
}

export function openGate(s: OpenGateState): OpenDecision {
  return s.sceneMap !== null && s.sceneMap !== s.wantMap ? 'wait' : 'now';
}
