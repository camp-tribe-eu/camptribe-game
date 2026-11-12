// GAME-309 · сценарій усередині поїздки. Дорога має бути живою: хлопець помічає, кішка нервує, батьки
// домовляються про план, радіо натякає на вечірню грозу, вказівник нагадує про рецепцію. Репліки короткі
// (телефон), усі тексти — ключі `ui.drive.*` у src/i18n (uk і en однакові за набором ключів).
//
// Біт спрацьовує або на частці шляху (`at`), або на події поїздки (`on`) — і рівно один раз.
// Жоден біт не зупиняє гру й не вимагає відповіді: це життя у вікні, а не розмова.

import type { DriveEvent, DriveEventKind, DriveState, Course } from './drive';
import { progressOf } from './drive';

export type Speaker = 'george' | 'victoria' | 'matthew' | 'radio' | 'sign';

export interface DriveBeat {
  readonly id: string;
  readonly speaker: Speaker;
  /** Ключ у src/i18n: `ui.drive.beat.<id>`. */
  readonly key: string;
  /** Частка шляху 0..1, на якій репліка звучить. */
  readonly at?: number;
  /** Подія поїздки, на яку репліка звучить. */
  readonly on?: DriveEventKind;
}

const beat = (id: string, speaker: Speaker, where: { at?: number; on?: DriveEventKind }): DriveBeat => ({ id, speaker, key: `ui.drive.beat.${id}`, ...where });

/** Репліки поїздки в порядку появи. Події йдуть разом із місцями: обидва види — один список. */
export const DRIVE_BEATS: readonly DriveBeat[] = [
  beat('start', 'victoria', { at: 0.0 }),
  beat('fields', 'matthew', { at: 0.06 }),
  beat('plan', 'george', { at: 0.12 }),
  beat('castle', 'matthew', { at: 0.19 }),
  beat('snacks', 'victoria', { at: 0.25 }),
  beat('radio', 'radio', { at: 0.31 }),
  beat('storm-talk', 'george', { at: 0.37 }),
  beat('cat-calm', 'matthew', { at: 0.43 }),
  beat('halfway', 'george', { at: 0.50 }),
  beat('sheep', 'matthew', { at: 0.57 }),
  beat('evening-plan', 'victoria', { at: 0.63 }),
  beat('clouds', 'radio', { at: 0.70 }),
  beat('lake', 'matthew', { at: 0.77 }),
  beat('pines', 'victoria', { at: 0.84 }),
  beat('sign-camp', 'sign', { at: 0.90 }),
  beat('almost', 'george', { at: 0.95 }),
  beat('camera-sign', 'george', { on: 'camera-sign' }),
  beat('fined', 'victoria', { on: 'fined' }),
  beat('close-pass', 'victoria', { on: 'close-pass' }),
  beat('jam', 'matthew', { on: 'jam' }),
  beat('puncture', 'george', { on: 'puncture' }),
  beat('diversion', 'george', { on: 'diversion' }),
  beat('dry-tank', 'george', { on: 'dry-tank' }),
  beat('refuel', 'george', { on: 'refuel' }),
  beat('rest', 'victoria', { on: 'rest' }),
  beat('queasy', 'matthew', { on: 'queasy' }),
  beat('cat-frets', 'matthew', { on: 'cat' }),
  beat('arrived', 'victoria', { on: 'arrived' }),
];

/** Усі ключі сценарію — щоб сторож локалізації і тест мали один список. */
export const DRIVE_BEAT_KEYS: readonly string[] = DRIVE_BEATS.map((b) => b.key);

/**
 * Які репліки звучать цього кадру. `said` — що вже сказано (тримає той, хто малює). Бітів за кадр може
 * бути кілька (подія + місце), і жоден не повторюється.
 */
export function nextBeats(s: DriveState, c: Course, events: readonly DriveEvent[], said: ReadonlySet<string>): readonly DriveBeat[] {
  const p = progressOf(s, c);
  const kinds = new Set(events.map((e) => e.kind));
  return DRIVE_BEATS.filter((b) => !said.has(b.id) && (b.on !== undefined ? kinds.has(b.on) : b.at !== undefined && p >= b.at));
}
