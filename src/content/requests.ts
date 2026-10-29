// GAME-180 · прохання сусідів («!» над мешканцем табору). Дані — content/requests.json; стан — лише прапорці ядра:
//   f.req-<прохання>-taken   «Беруся» у розмові з просильником (відмова «Пізніше» не ставить нічого і нічого не коштує)
//   f.req-<прохання>-<ціль>  дотик до позначки на мапі (Interact, див. requestInteractions → slice-defs)
//   f.req-<прохання>-done    подяка в розмові з просильником (запис журналу — StoryDefs.journaled)
// Усе робиться ногами й дією на мапі: підійти до позначки (кільце наближення) → повернутись до просильника. Чисті функції без Phaser;
// сцена, HUD і картка лише читають те, що тут вирішено.
//
// Нагорода (GAME-181): при з'явленні прапорця `done` ядро видає `rw.<прохання>` — XP, ОМ і практику навичок раз за ключ (src/core/commands.ts, StoryDefs.requestRewards).
import requestsRaw from '../../content/requests.json';
import type { InteractionDef } from '../core/defs';
import type { GameState } from '../core/state';

export interface RequestTarget { readonly id: string; readonly spot: string; readonly icon: RequestIcon; readonly labelKey: string; readonly flag: string }
export interface RequestReward { readonly xp: number; readonly om: number; readonly skills: readonly string[] }
export interface RequestDef {
  readonly id: string; readonly giver: string; readonly after?: string; readonly titleKey: string; readonly goalKey: string; readonly trackKey: string;
  readonly targets: readonly RequestTarget[]; readonly reward: RequestReward; readonly takenFlag: string; readonly doneFlag: string;
}
export const REQUEST_ICONS = ['litter', 'bird', 'chain', 'lantern', 'cookie', 'apple', 'camera', 'star', 'paw', 'wire'] as const;
export type RequestIcon = (typeof REQUEST_ICONS)[number];

interface RawRequest {
  id: string; giver: string; after?: string; titleKey: string; goalKey: string; trackKey: string;
  targets: { id: string; spot: string; icon: RequestIcon; labelKey: string }[]; reward: RequestReward;
}

/** Прапорець прохання: `req.nora-shore` + `taken` → `f.req-nora-shore-taken` (той самий формат у розмовах і в реєстрі). */
export const requestFlag = (id: string, part: string): string => `f.${id.replace(/\./g, '-')}-${part}`;
/** Усі прапорці прохань починаються так: вони косметичні для сюжету (повний перебір їх не розрізняє, moves.ts exploreView). */
export const REQUEST_FLAG_PREFIX = 'f.req-';
/** Локація табору: прохання живуть на єдиній мапі табору біля озера. */
export const REQUEST_LOCATION = 'loc.camp.lake';

export function compileRequests(raw: readonly RawRequest[]): RequestDef[] {
  return raw.map((r) => ({
    ...r,
    targets: r.targets.map((t) => ({ ...t, flag: requestFlag(r.id, t.id) })),
    takenFlag: requestFlag(r.id, 'taken'),
    doneFlag: requestFlag(r.id, 'done'),
  }));
}
export const REQUESTS: readonly RequestDef[] = compileRequests(requestsRaw as RawRequest[]);

/** Усі прапорці прохань (для ключа перебору) і прапорці «здано» (запис журналу). */
export const requestFlags = (rs: readonly RequestDef[] = REQUESTS): string[] => rs.flatMap((r) => [r.takenFlag, ...r.targets.map((t) => t.flag), r.doneFlag]);
export const requestDoneFlags = (rs: readonly RequestDef[] = REQUESTS): string[] => rs.map((r) => r.doneFlag);

/** Ціль-взаємодія ядра: дотик ставить прапорець цілі; нагорода «0 центів», разова за grantId (повторний дотик — відмова ядра). */
export function requestInteractions(rs: readonly RequestDef[] = REQUESTS): Record<string, InteractionDef> {
  return Object.fromEntries(rs.flatMap((r) => r.targets.map((t) => [t.spot, { grantId: `rw.${t.spot.replace(/\./g, '-')}`, moneyCents: 0, flags: [t.flag] }] as const)));
}

/** `locked` (GAME-184): продовження арки, чия попередниця ще не здана — його не видно ні в «!», ні в розмові. */
export type RequestStatus = 'locked' | 'available' | 'active' | 'ready' | 'done';
export function requestStatus(flags: readonly string[], r: RequestDef, rs: readonly RequestDef[] = REQUESTS): RequestStatus {
  if (flags.includes(r.doneFlag)) return 'done';
  const before = r.after === undefined ? undefined : rs.find((x) => x.id === r.after);
  if (before && !flags.includes(before.doneFlag)) return 'locked';
  if (!flags.includes(r.takenFlag)) return 'available';
  return r.targets.every((t) => flags.includes(t.flag)) ? 'ready' : 'active';
}

/** Вузол розмови з пропозицією: перше прохання просильника — `offer`, його продовження (`after`) — `offer2` (GAME-184; дзеркало перевірки requests). */
export const offerNodeOf = (r: RequestDef): string => (r.after === undefined ? 'offer' : 'offer2');
/** Поточне прохання просильника: перше, що ще не здане й не заблоковане; усі здано — останнє. Без `flags` (старі виклики) — перше. */
export function requestOf(npcId: string, rs: readonly RequestDef[] = REQUESTS, flags?: readonly string[]): RequestDef | undefined {
  const mine = rs.filter((r) => r.giver === npcId);
  if (flags === undefined) return mine[0];
  return mine.find((r) => { const st = requestStatus(flags, r, rs); return st !== 'done' && st !== 'locked'; }) ?? mine[mine.length - 1];
}

/** Над просильником «!»: прохання можна взяти або вже можна здати. */
export function requestMarker(g: GameState, npcId: string, rs: readonly RequestDef[] = REQUESTS): boolean {
  const r = requestOf(npcId, rs, g.flags);
  if (!r || g.player?.locationId !== REQUEST_LOCATION) return false;
  const s = requestStatus(g.flags, r, rs);
  return s === 'available' || s === 'ready';
}

/** Позначка цілі на мапі живе, лише коли прохання взято, ціль ще не зроблена і розмови немає (під час розмови світ мовчить, як усі об'єкти). */
export function liveRequestSpot(g: GameState, name: string, rs: readonly RequestDef[] = REQUESTS): boolean {
  if (g.player?.locationId !== REQUEST_LOCATION || g.dialogue !== null) return false;
  for (const r of rs) {
    const t = r.targets.find((x) => x.spot === name);
    if (t) return g.flags.includes(r.takenFlag) && !g.flags.includes(r.doneFlag) && !g.flags.includes(t.flag);
  }
  return false;
}
export const isRequestSpot = (name: string, rs: readonly RequestDef[] = REQUESTS): boolean => rs.some((r) => r.targets.some((t) => t.spot === name));

/** Рядок трекера в HUD: прийняті й ще не здані прохання. «Хмиз 2/5» = назва · зроблено/усього. */
export interface TrackerRow { readonly id: string; readonly trackKey: string; readonly done: number; readonly total: number; readonly ready: boolean }
export function trackerRows(g: GameState, rs: readonly RequestDef[] = REQUESTS): TrackerRow[] {
  if (g.player?.locationId !== REQUEST_LOCATION) return [];
  return rs.flatMap((r) => {
    const s = requestStatus(g.flags, r, rs);
    if (s !== 'active' && s !== 'ready') return [];
    return [{ id: r.id, trackKey: r.trackKey, done: r.targets.filter((t) => g.flags.includes(t.flag)).length, total: r.targets.length, ready: s === 'ready' }];
  });
}

/** Куди вказує стрілка-підказка: перша ціль першого активного прохання; усе зроблено — сам просильник (id NPC). null — прохань у роботі немає. */
export function requestTarget(g: GameState, rs: readonly RequestDef[] = REQUESTS): string | null {
  if (g.player?.locationId !== REQUEST_LOCATION || g.dialogue !== null) return null;
  for (const r of rs) {
    const s = requestStatus(g.flags, r, rs);
    if (s === 'ready') return r.giver;
    if (s === 'active') return r.targets.find((t) => !g.flags.includes(t.flag))?.spot ?? null;
  }
  return null;
}

/** Скільки прохань уже здано — сцена по зростанню показує «+» над героєм. */
export const requestsDone = (g: GameState, rs: readonly RequestDef[] = REQUESTS): number => rs.filter((r) => g.flags.includes(r.doneFlag)).length;

/** Нагорода прохання (дані; видає ядро при здачі). */
export const requestReward = (id: string, rs: readonly RequestDef[] = REQUESTS): RequestReward | null => rs.find((r) => r.id === id)?.reward ?? null;
