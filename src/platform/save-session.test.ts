// Гонки старту сейвів (рецензія PR #13). Сховище — підроблене обіцянками, які тест відпускає сам.
import { describe, expect, it } from 'vitest';
import type { StoryDefs } from '../core/defs';
import { stateHash } from '../core/hash';
import { serialize } from '../core/save';
import { STORY_DEFS } from '../core/story.fixture';
import { newSim, type SimState } from '../core/sim';
import { createSaveSession, type SessionBridge } from './save-session';

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
});
