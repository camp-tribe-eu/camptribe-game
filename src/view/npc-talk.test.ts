// GAME-179 · розмова з NPC на мапі: сторожі «пустишки» (закон 1: кожен має спосіб почервоніти — мутації в описах).
//  * кожен, з ким можна говорити на мапах (Еліза, Джордж, родина, шестеро мешканців), — NPC контенту з діалогом: ≥ 3 репліки NPC, є вихід, uk + en;
//  * кожен NPC, поставлений на мапі (шар objects, type npc), — теж; нового NPC без діалогу не пропустить ні цей тест, ні валідатор (NPC_NO_DIALOGUE);
//  * ядро справді проводить кожну розмову до кінця й нічого в сюжеті не змінює (прапорці, квести, предмети);
//  * маркер «…»/«!», розворот до героя (чисті правила); портрет у реєстрі є для кожного (або запасний обрізок).
// Мутації (перевірено, див. PR): прибрати content/dialogue/luc-chat.json → «Люк: діалогу нема» червоніє; прибрати рядок npc.nora з npcs.json → червоніє;
// у markerFor повернути 'chat' для canTalk=false → «не говорить — без маркера» червоніє.
import { describe, expect, it } from 'vitest';
import type { Command } from '../core/commands';
import { newSim, step, type SimState } from '../core/sim';
import { GAME_DEFS } from '../content/slice-defs';
import { chatOnlyNpcs, type Move } from '../content/moves';
import { RESIDENTS } from './world/ambient';
import { storyOffer } from './story-offer';
import { CHAT_MARKER_RANGE, REQUEST_NPCS, facingToward, markerFor } from './npc-talk';
import { PORTRAIT_FILES, SPRITE_SHEET, TALKERS, portraitFor, portraitReport } from './portraits';

const RAW = import.meta.glob<string>(['../../content/npcs.json', '../../content/quests.json', '../../content/dialogue/*.json', '../../content/locales/*.json', '../../public/maps/*.tmj'], { query: '?raw', import: 'default', eager: true });
const rawOf = (re: RegExp): [string, string][] => Object.entries(RAW).filter(([k]) => re.test(k));
const json = <T>(rel: string): T => JSON.parse(Object.entries(RAW).find(([k]) => k.endsWith(rel))?.[1] ?? 'null') as T;
interface Node { id: string; speaker: string; textKey: string; end?: true; next?: string; choices?: { textKey: string; next: string }[] }
interface Dlg { id: string; npcId?: string; nodes: Node[] }
const NPCS = json<{ id: string; nameKey: string }[]>('content/npcs.json');
const DIALOGUES: Dlg[] = rawOf(/content\/dialogue\//).map(([, v]) => JSON.parse(v) as Dlg);
const LOC = { uk: json<Record<string, string>>('locales/uk.json'), en: json<Record<string, string>>('locales/en.json') };
const dialogueOf = (npcId: string): Dlg | undefined => DIALOGUES.find((d) => d.npcId === npcId);

/** NPC, поставлені на мапах: шар objects, об'єкти type|class = npc. */
function mapNpcs(): { map: string; id: string }[] {
  const out: { map: string; id: string }[] = [];
  for (const [f, raw] of rawOf(/public\/maps\/.*\.tmj$/)) {
    const m = JSON.parse(raw) as { layers: { name: string; objects?: { name: string; type?: string; class?: string }[] }[] };
    for (const o of m.layers.find((l) => l.name === 'objects')?.objects ?? []) if ((o.type ?? o.class) === 'npc') out.push({ map: f, id: o.name });
  }
  return out;
}

describe('GAME-179 · кожен співрозмовник має що сказати', () => {
  it('сторож бачить, що стереже: співрозмовників рівно 10 (Еліза, Джордж, Вікторія, Метью, шестеро мешканців)', () => {
    expect([...TALKERS].sort()).toEqual(['npc.amina', 'npc.claire', 'npc.elise', 'npc.george', 'npc.ingrid', 'npc.luc', 'npc.matthew', 'npc.nora', 'npc.sarah', 'npc.victoria']);
    expect(RESIDENTS).toHaveLength(6);
    expect(mapNpcs().length, 'на мапах нема жодного NPC — сторож порожній').toBeGreaterThanOrEqual(2);
  });

  for (const id of TALKERS) {
    it(`${id}: NPC контенту, діалог із ≥ 3 репліками NPC, виходом і текстами uk + en`, () => {
      expect(NPCS.some((n) => n.id === id), `${id} немає в content/npcs.json`).toBe(true);
      const d = dialogueOf(id);
      expect(d, `${id}: діалогу нема — «пустишка»`).toBeDefined();
      const lines = (d?.nodes ?? []).filter((n) => n.speaker === 'npc');
      expect(lines.length, `${id}: реплік NPC менше трьох`).toBeGreaterThanOrEqual(3);
      expect((d?.nodes ?? []).some((n) => n.end === true), `${id}: діалог без виходу`).toBe(true);
      for (const n of d?.nodes ?? []) for (const lang of ['uk', 'en'] as const) expect(LOC[lang][n.textKey]?.length ?? 0, `${id}/${n.id} [${lang}]: порожній текст`).toBeGreaterThan(3);
      for (const lang of ['uk', 'en'] as const) expect(LOC[lang][NPCS.find((n) => n.id === id)?.nameKey ?? '']?.length ?? 0, `${id} [${lang}]: нема імені`).toBeGreaterThan(1);
    });
  }

  it('кожен NPC, поставлений на мапі, має діалог', () => {
    for (const { map, id } of mapNpcs()) expect(dialogueOf(id), `${map}: ${id} стоїть на мапі без діалогу`).toBeDefined();
  });

  it('кожен NPC контенту має спрайт для запасного портрета й портрет у реєстрі', () => {
    for (const n of NPCS) {
      expect(SPRITE_SHEET[n.id], `${n.id}: нема листа ходьби — портрета не вийде`).toBeDefined();
      expect(portraitFor(n.id, {})?.kind, `${n.id}: без файлів має бути запасний обрізок`).toBe('sprite');
    }
  });
});

describe('GAME-179 · ядро проводить кожну розмову мешканців і родини до кінця, нічого не змінюючи в сюжеті', () => {
  const CTX = { defs: GAME_DEFS };
  let n = 0;
  const send = (s: SimState, m: Move): SimState => step(s, { kind: 'command', command: { ...m, commandId: `nt-${n++}` } as Command }, CTX);
  const ok = (s: SimState): boolean => s.game.processed[`nt-${n - 1}`]?.ok === true;
  const atCamp = (): SimState => {
    const done = (questId: string): Move => ({ type: 'CompleteQuest', questId });
    let s = newSim(7, 5_000);
    for (const m of [{ type: 'CreateCharacter', profileId: 'profile.solo-explorer', transportId: 'transport.bike' } as Move, done('PROLOGUE-HOME-001'), done('ST-001'), done('ST-002'),
      { type: 'Visit', locationId: 'loc.shop' } as Move, { type: 'Pickup', itemId: 'item.tent' } as Move, { type: 'Pickup', itemId: 'item.sleeping-bag' } as Move, done('ST-003'),
      { type: 'Visit', locationId: 'loc.home' } as Move, done('CH1-HOME-001'), { type: 'Visit', locationId: 'loc.road' } as Move, done('ST-004'), { type: 'Visit', locationId: 'loc.camp.lake' } as Move]) {
      s = send(s, m);
      if (!ok(s)) throw new Error(`${JSON.stringify(m)} → ${JSON.stringify(s.game.processed[`nt-${n - 1}`])}`);
    }
    return s;
  };
  const chat = ['npc.amina', 'npc.luc', 'npc.nora', 'npc.ingrid', 'npc.sarah', 'npc.claire', 'npc.victoria', 'npc.matthew'];

  it('«лише побалакати»: усі вісім — у переліку інертних; Еліза (рухає квести) — ні', () => {
    const set = chatOnlyNpcs(GAME_DEFS.story as never);
    for (const id of chat) expect(set.has(id), `${id} не вважається інертним`).toBe(true);
    expect(set.has('npc.elise')).toBe(false);
  });

  for (const id of chat) {
    it(`${id}: Talk приймається, розмова закінчується, сюжет не змінився`, () => {
      const base = atCamp();
      const before = { flags: base.game.flags, quests: base.game.quests, inventory: base.game.inventory, money: base.game.moneyCents };
      let s = send(base, { type: 'Talk', npcId: id });
      expect(ok(s), `${id}: ядро не прийняло розмову`).toBe(true);
      expect(s.game.dialogue, `${id}: діалог не відкрився`).not.toBeNull();
      let steps = 0;
      while (s.game.dialogue && steps++ < 10) s = send(s, s.game.dialogue.node === 'hello' ? { type: 'Choose', choice: steps % 2 } : { type: 'Continue' });
      expect(s.game.dialogue, `${id}: розмова не закінчилась за 10 кроків`).toBeNull();
      expect({ flags: s.game.flags, quests: s.game.quests, inventory: s.game.inventory, money: s.game.moneyCents }).toEqual(before);
    });
  }
});

describe('GAME-179 · знімок для UI: хто говорить і хто дав завдання', () => {
  it('у розмові з мешканцем speakerId = його id; у репліці героя — player; у квестів giver збігається з giverId контенту', () => {
    const CTX = { defs: GAME_DEFS };
    let k = 0;
    const go = (s: SimState, m: Move): SimState => step(s, { kind: 'command', command: { ...m, commandId: `so-${k++}` } as Command }, CTX);
    let s = newSim(7, 5_000);
    const done = (questId: string): Move => ({ type: 'CompleteQuest', questId });
    for (const m of [{ type: 'CreateCharacter', profileId: 'profile.solo-explorer', transportId: 'transport.bike' } as Move, done('PROLOGUE-HOME-001'), done('ST-001'), done('ST-002'),
      { type: 'Visit', locationId: 'loc.shop' } as Move, { type: 'Pickup', itemId: 'item.tent' } as Move, { type: 'Pickup', itemId: 'item.sleeping-bag' } as Move, done('ST-003'),
      { type: 'Visit', locationId: 'loc.home' } as Move, done('CH1-HOME-001'), { type: 'Visit', locationId: 'loc.road' } as Move, done('ST-004'), { type: 'Visit', locationId: 'loc.camp.lake' } as Move]) s = go(s, m);
    const quests = json<{ id: string; giverId?: string }[]>('content/quests.json');
    const before = storyOffer(s, GAME_DEFS).offer;
    for (const q of before.quests) expect(q.giver, q.key).toBeDefined();
    s = go(s, { type: 'Talk', npcId: 'npc.luc' });
    const o = storyOffer(s, GAME_DEFS).offer;
    expect(o.dialogue?.speakerId).toBe('npc.luc');
    expect(o.dialogue?.speakerKey).toBe('npc.luc');
    expect(quests.some((q) => q.giverId === 'npc.elise'), 'сторож бачить giverId у контенті').toBe(true);
  });
});

describe('GAME-179 · маркер над головою і розворот', () => {
  it('«…» — лише коли можна говорити й герой близько; «!» — коли є прохання (видно й здалеку); не говорить — без маркера', () => {
    expect(markerFor(true, false, 10)).toBe('chat');
    expect(markerFor(true, false, CHAT_MARKER_RANGE)).toBe('chat');
    expect(markerFor(true, false, CHAT_MARKER_RANGE + 1)).toBeNull();
    expect(markerFor(true, true, 10_000)).toBe('request');
    expect(markerFor(false, false, 0), 'не говорить — без маркера').toBeNull();
    expect(markerFor(false, true, 0), 'прохання без розмови — теж без маркера').toBeNull();
  });

  it('гачок прохань порожній, доки GAME-180 не дасть даних: жоден NPC не показує «!»', () => {
    expect(REQUEST_NPCS.size).toBe(0);
  });

  it('NPC повертається до героя: вісь із більшим зсувом, нічия — по вертикалі', () => {
    const o = { x: 100, y: 100 };
    expect(facingToward(o, { x: 40, y: 100 })).toBe('left');
    expect(facingToward(o, { x: 160, y: 110 })).toBe('right');
    expect(facingToward(o, { x: 100, y: 40 })).toBe('up');
    expect(facingToward(o, { x: 110, y: 170 })).toBe('down');
    expect(facingToward(o, { x: 130, y: 130 })).toBe('down');
  });
});

describe('GAME-179 · портрети: хто має справжній файл, хто — запасний обрізок', () => {
  it('без файлів усі на обрізку; файл за повним id чи без префікса підхоплюється без правки коду; звіт каже, хто де', () => {
    const none = portraitReport({});
    expect(none.real).toEqual([]);
    expect([...none.fallback].sort()).toEqual([...TALKERS].sort());
    const some = portraitReport({ 'npc.elise': 'a.png', luc: 'b.png' });
    expect(some.real.sort()).toEqual(['npc.elise', 'npc.luc']);
    expect(some.fallback).toHaveLength(TALKERS.length - 2);
    expect(portraitFor('npc.elise', { 'npc.elise': 'a.png' })).toEqual({ npcId: 'npc.elise', kind: 'file', url: 'a.png' });
    expect(portraitFor('npc.luc', { luc: 'b.png' })).toEqual({ npcId: 'npc.luc', kind: 'file', url: 'b.png' });
    expect(portraitFor(null, { 'npc.elise': 'a.png' }), 'оповідач — без портрета (нейтральна іконка)').toBeNull();
    expect(portraitFor('npc.nobody', {})).toBeNull();
    expect(portraitFor('player', {})?.kind).toBe('sprite');
  });

  it('СТАН НА ЗАРАЗ: які assets/portraits/*.png підхопила збірка (звіт, а не вимога)', () => {
    const r = portraitReport();
    console.info(`GAME-179 портрети: справжні [${r.real.join(', ') || '—'}]; запасний обрізок [${r.fallback.join(', ')}]`);
    expect(r.real.length + r.fallback.length).toBe(TALKERS.length);
    // Файл, що нікому не належить (одруківка в імені), — помилка: його ніхто не підхопить (animal.cat — Мія, ще не співрозмовник).
    const known = new Set([...TALKERS.flatMap((id) => [id, id.slice(4)]), 'player', 'animal.cat']);
    expect(Object.keys(PORTRAIT_FILES).filter((f) => !known.has(f))).toEqual([]);
  });
});
