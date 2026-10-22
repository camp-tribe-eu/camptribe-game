// Гонки старту сейвів (рецензія PR #13). Сховище — підроблене обіцянками, які тест відпускає сам.
import { describe, expect, it } from 'vitest';
import type { StoryDefs } from '../core/defs';
import { stateHash } from '../core/hash';
import { serialize } from '../core/save';
import { STORY_DEFS } from '../core/story.fixture';
import { newSim, type SimState } from '../core/sim';
import { createSaveSession, type SessionBridge } from './save-session';
import { staleKey } from './save-store';

const SEED = 20261022;
/** Сейв, який відрізняється від нової гри (інакше «завантажено» нічого не доводить). */
function savedSim(paused: boolean): SimState {
  const s = newSim(SEED, 777);
  return { ...s, finds: 5, clock: { ...s.clock, minutes: 42, paused } };
}

function fakeBridge(): SessionBridge & { sent: number; paused: boolean | null } {
  let state = newSim(SEED, 1000);
  return {
    sent: 0, paused: null,
    get state() { return state; },
    load(sim) { state = sim; },
    setPaused(p) { this.paused = p; state = { ...state, clock: { ...state.clock, paused: p } }; },
  };
}

function fakeStore(slots: string[]) {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const writes: string[] = [];
  return {
    writes, release,
    read: async () => { await gate; return slots; },
    write: async (json: string) => { writes.push(json); return true; },
  };
}

describe('сесія сейвів: старт і гонки (GAME-33)', () => {
  it('сейв, записаний на паузі, вантажиться без паузи годинника', async () => {
    const b = fakeBridge(); const st = fakeStore([serialize(savedSim(true))]);
    const s = createSaveSession(b, st); const p = s.start(); st.release(); await p;
    expect(b.state.finds).toBe(5);
    expect(b.state.clock.paused).toBe(false);
  });

  it('автозбереження до кінця стартового читання нічого не пише', async () => {
    const b = fakeBridge(); const st = fakeStore([serialize(savedSim(false))]);
    const s = createSaveSession(b, st); const p = s.start();
    s.autosave();                                   // пауза/згорнута вкладка до завершення читання
    expect(st.writes).toEqual([]);
    st.release(); await p;
    s.autosave();
    expect(st.writes).toHaveLength(1);              // позитивний контроль: після старту пише
  });

  it('гравець устиг надіслати команду — стартовий сейв не перезаписує його гру', async () => {
    const b = fakeBridge(); const st = fakeStore([serialize(savedSim(false))]);
    const s = createSaveSession(b, st); const p = s.start();
    b.sent = 1;
    st.release(); await p;
    expect(b.state.finds).toBe(0);
  });

  it('імпорт до кінця читання — стартовий сейв не перезаписує імпорт', async () => {
    const b = fakeBridge(); const st = fakeStore([serialize(savedSim(false))]);
    const s = createSaveSession(b, st); const p = s.start();
    const imported = { ...savedSim(false), finds: 9 };
    expect(await s.adopt(serialize(imported))).toBe('ok');
    st.release(); await p;
    expect(b.state.finds).toBe(9);
  });

  it('імпорт: зіпсований — bad і стан не змінено; запис не вдався — unsaved', async () => {
    const b = fakeBridge(); const before = b.state;
    const s = createSaveSession(b, { read: async () => [], write: async () => false });
    expect(await s.adopt('{"зламано')).toBe('bad');
    expect(await s.adopt(null)).toBe('bad');
    expect(b.state).toBe(before);
    expect(await s.adopt(serialize(savedSim(false)))).toBe('unsaved');
    expect(b.state.clock.paused).toBe(true);        // діалог паузи відкритий
  });

  it('меню паузи відкрили, поки читали сейв — після завантаження годинник лишається на паузі', async () => {
    const b = fakeBridge(); const st = fakeStore([serialize(savedSim(false))]);
    const s = createSaveSession(b, st); const p = s.start();
    b.setPaused(true);
    st.release(); await p;
    expect(b.state.finds).toBe(5);
    expect(b.state.clock.paused).toBe(true);
  });

  it('явне «Зберегти» до кінця читання — стартовий сейв уже не замінює гру', async () => {
    const b = fakeBridge(); const st = fakeStore([serialize(savedSim(false))]);
    const s = createSaveSession(b, st); const p = s.start();
    await s.save();
    st.release(); await p;
    expect(b.state.finds).toBe(0);
    expect(st.writes).toHaveLength(1);
  });

  it('сейв під старий контент: не вантажиться, іде в карантин; придатний prev — вантажиться', async () => {
    const stale = JSON.stringify({ ...JSON.parse(serialize(savedSim(false))), sim: { ...savedSim(false), game: { ...savedSim(false).game, quests: { 'q.gone': { status: 'active', done: [] } } } } });
    const staleFixed = (() => { const o = JSON.parse(stale); o.checksum = stateHash(o.sim); return JSON.stringify(o); })();
    const prev = serialize({ ...savedSim(false), finds: 7 });
    const st = fakeStore([staleFixed, prev]);
    const quarantined: string[] = [];
    const b = fakeBridge();
    const s = createSaveSession(b, { ...st, quarantine: async (j: string) => { quarantined.push(j); return true; } }, { story: STORY_DEFS.story as StoryDefs });
    const p = s.start(); st.release(); await p;
    expect(quarantined).toEqual([staleFixed]);
    expect(b.state.finds).toBe(7);
  });

  it('пише відбиток контенту в сейв', async () => {
    const b = fakeBridge(); const st = fakeStore([]);
    const s = createSaveSession(b, st, { contentRev: 'rev-42' });
    await s.save();
    expect(JSON.parse(st.writes[0] ?? '{}').contentRev).toBe('rev-42');
  });

  // ---- рецензія сейвів проти контенту (23.10) ----
  const staleOf = (game: Record<string, unknown>): string => {
    const o = JSON.parse(serialize(savedSim(false)));
    o.sim.game = { ...o.sim.game, ...game };
    o.checksum = stateHash(o.sim);
    return JSON.stringify(o);
  };
  const STALE = staleOf({ quests: { 'q.gone': { status: 'active', done: [] } } });

  it('гонка: гравець діяв, поки читали, — prev НЕ вантажиться, навіть коли main застарілий', async () => {
    const st = fakeStore([STALE, serialize({ ...savedSim(false), finds: 7 })]);
    let releaseQ!: (ok: boolean) => void;
    const b = fakeBridge();
    const s = createSaveSession(b, { ...st, quarantine: () => new Promise<boolean>((r) => { releaseQ = r; }) }, { story: STORY_DEFS.story as StoryDefs });
    const p = s.start();
    b.sent = 1;                                   // гравець устиг надіслати команду
    st.release(); await p;
    expect(b.state.finds).toBe(0);
    releaseQ(true);
  });

  it('поки карантин не записано, автозбереження стоїть; записано — пише; не вдався — стоїть до явного «Зберегти»', async () => {
    for (const ok of [true, false]) {
      const st = fakeStore([STALE]);
      let releaseQ!: (v: boolean) => void;
      const s = createSaveSession(fakeBridge(), { ...st, quarantine: () => new Promise<boolean>((r) => { releaseQ = r; }) }, { story: STORY_DEFS.story as StoryDefs });
      const p = s.start(); st.release(); await p;
      s.autosave();
      expect(st.writes, `ok=${ok}`).toHaveLength(0);
      releaseQ(ok); await new Promise((r) => setTimeout(r, 0));
      s.autosave();
      expect(st.writes, `ok=${ok}`).toHaveLength(ok ? 1 : 0);
      if (!ok) { await s.save(); expect(st.writes).toHaveLength(1); }
    }
  });

  it('незграбний сейв видно інтерфейсу (stale) — гравець отримає його код', async () => {
    const st = fakeStore([STALE]);
    const s = createSaveSession(fakeBridge(), { ...st, quarantine: async () => true }, { story: STORY_DEFS.story as StoryDefs });
    expect(s.stale).toBeNull();
    const p = s.start(); st.release(); await p;
    expect(s.stale).toBe(STALE);
  });

  it('кінець недосяжний на нинішньому контенті (viable=false) — сейв відкладено, як і зникле посилання', async () => {
    const good = serialize({ ...savedSim(false), finds: 9 });
    const st = fakeStore([good]);
    const b = fakeBridge();
    const s = createSaveSession(b, { ...st, quarantine: async () => true }, { viable: () => false });
    const p = s.start(); st.release(); await p;
    expect(b.state.finds).toBe(0);
    expect(s.stale).toBe(good);
    // undefined («ліміт пошуку») — вантажимо: краще ризик, ніж відкинути придатний сейв
    const b2 = fakeBridge(); const st2 = fakeStore([good]);
    const s2 = createSaveSession(b2, st2, { viable: () => undefined });
    const p2 = s2.start(); st2.release(); await p2;
    expect(b2.state.finds).toBe(9);
  });

  it('імпорт коду від старішої версії — «outdated», а не «пошкоджений»; гра без змін', async () => {
    const b = fakeBridge(); const before = b.state;
    const s = createSaveSession(b, { read: async () => [], write: async () => true }, { story: STORY_DEFS.story as StoryDefs });
    expect(await s.adopt(STALE)).toBe('outdated');
    expect(await s.adopt('{"зламано')).toBe('bad');
    expect(b.state).toBe(before);
  });

  it('код відновлення несе відбиток контенту', () => {
    const s = createSaveSession(fakeBridge(), { read: async () => [], write: async () => true }, { contentRev: 'rev-7' });
    expect(JSON.parse(s.exportJson()).contentRev).toBe('rev-7');
  });

  it('карантин: окремий ключ на кожен сейв — новий не витирає старого', () => {
    expect(staleKey(STALE)).not.toBe(staleKey(serialize(savedSim(false))));
    expect(staleKey(STALE)).toMatch(/^stale:[0-9a-f]{8}$/);
  });
});
