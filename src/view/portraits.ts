// GAME-179 · реєстр портретів NPC: хто в рамці розмови. Справжні портрети — assets/portraits/<npcId>.png (GAME-49, 96×96, з титрами в assets/CREDITS.csv);
// поки файла немає, портрет — обрізок голови й плечей зі спрайта ходьби NPC (дивиться вниз). Файли підхоплює import.meta.glob на збірці: з'явились
// після злиття GAME-49 — підхоплено без правки коду; їх немає — порожній перелік, гра не просить файл, якого нема.
import { RESIDENTS } from './world/ambient';

/** Лист ходьби, з якого різати голову: герой, Еліза, родина — або мешканець табору за ключем вигляду. */
export type SheetId = 'player' | 'elise' | 'victoria' | 'matthew' | `res:${string}`;

export type Portrait =
  | { readonly npcId: string; readonly kind: 'file'; readonly url: string }
  | { readonly npcId: string; readonly kind: 'sprite'; readonly sheet: SheetId };

/** Хто на мапі має спрайт: id NPC → лист ходьби. George стоїть на мапі удома з аркушем героя (scene.ts NPC_SHEET). */
export const SPRITE_SHEET: Readonly<Record<string, SheetId>> = {
  'npc.elise': 'elise', 'npc.george': 'player', 'npc.victoria': 'victoria', 'npc.matthew': 'matthew',
  ...Object.fromEntries(RESIDENTS.map((r) => [r.id, `res:${r.look}` as SheetId])),
};

/** Усі, з ким можна говорити на мапах: сторож npc-talk.test порівнює цей список із content/npcs.json. */
export const TALKERS: readonly string[] = Object.keys(SPRITE_SHEET);

/** Хто не стоїть на місці мапи, а ходить (мешканці табору за розкладом, родина за героєм): їм не потрібна точка в шарі objects — говорять там, де стоять зараз. */
export const MOBILE_TALKERS: ReadonlySet<string> = new Set([...RESIDENTS.map((r) => r.id), 'npc.victoria', 'npc.matthew']);

/** 'player' — репліка самого героя (його голова); решта — id NPC. */
export const PLAYER_ID = 'player';

/** Готові портрети: ім'я файла без .png (`npc.elise`) → адреса, яку дає збірка. */
export type PortraitFiles = Readonly<Record<string, string>>;
const GLOB = import.meta.glob('../../assets/portraits/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
export const PORTRAIT_FILES: PortraitFiles = Object.fromEntries(Object.entries(GLOB).map(([k, v]) => [(k.split('/').pop() ?? k).replace(/\.png$/, ''), v]));

/** Файл портрета: ім'я за повним id NPC або без префікса `npc.`. */
const fileFor = (npcId: string, files: PortraitFiles): string | null => {
  const short = npcId.startsWith('npc.') ? npcId.slice(4) : npcId;
  return files[npcId] ?? files[short] ?? null;
};

/** Портрет NPC; null — оповідач чи невідомий id (UI покаже нейтральну іконку). `files` — лише для тестів. */
export function portraitFor(npcId: string | null, files: PortraitFiles = PORTRAIT_FILES): Portrait | null {
  if (npcId === null) return null;
  const url = fileFor(npcId, files);
  if (url !== null) return { npcId, kind: 'file', url };
  const sheet = npcId === PLAYER_ID ? 'player' : SPRITE_SHEET[npcId];
  return sheet ? { npcId, kind: 'sprite', sheet } : null;
}

/** Звіт для тесту й для людини: хто вже має справжній портрет, а хто на запасному обрізку. */
export function portraitReport(files: PortraitFiles = PORTRAIT_FILES): { readonly real: string[]; readonly fallback: string[] } {
  const real: string[] = [];
  const fallback: string[] = [];
  for (const id of TALKERS) (portraitFor(id, files)?.kind === 'file' ? real : fallback).push(id);
  return { real, fallback };
}
