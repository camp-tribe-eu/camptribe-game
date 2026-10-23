// Гонки старту сейвів (рецензія PR #13). Сховище — підроблене обіцянками, які тест відпускає сам.
import { describe, expect, it } from 'vitest';
import type { StoryDefs } from '../core/defs';
import { stateHash } from '../core/hash';
import { serialize } from '../core/save';
import { LIFE_DEFS, STORY_DEFS } from '../core/story.fixture';
import type { LifeDefs } from '../core/life';
import v2 from '../../tests/saves/v2.json';
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
    restart() { state = newSim(SEED, 1000); this.sent = 0; },
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

  // ---- рецензія 23.10, друге коло ----
  const NEWER = (() => { const o = JSON.parse(serialize(savedSim(false))); o.schemaVersion = 99; return JSON.stringify(o); })();

  it('сейв від НОВІШОЇ версії гри: не вантажиться, відкладається, імпорт — «newer»', async () => {
    const st = fakeStore([NEWER]);
    const quarantined: string[] = [];
    const b = fakeBridge();
    const s = createSaveSession(b, { ...st, quarantine: async (j: string) => { quarantined.push(j); return true; } });
    const p = s.start(); st.release(); await p;
    expect(b.state.finds).toBe(0);
    expect(quarantined).toEqual([NEWER]);
    expect(s.stale).toBe(NEWER);
    expect(await s.adopt(NEWER)).toBe('newer');
    // позитивний контроль: справді зламаний — «bad», не «newer»
    expect(await s.adopt(NEWER.replace('"schemaVersion":99', '"schemaVersion":"x"'))).toBe('bad');
  });

  it('той самий контент (contentRev збігся) — пошук досяжності не запускається; інший — запускається', async () => {
    let calls = 0;
    const viable = (): boolean => { calls++; return true; };
    const same = serialize(savedSim(false), 'rev-1');
    const s = createSaveSession(fakeBridge(), { read: async () => [], write: async () => true }, { contentRev: 'rev-1', viable });
    expect(await s.adopt(same)).toBe('ok');
    expect(calls).toBe(0);
    expect(await s.adopt(serialize(savedSim(false), 'rev-0'))).toBe('ok');
    expect(calls).toBe(1);
    expect(await s.adopt(serialize(savedSim(false), null))).toBe('ok');     // старий сейв без відбитка — теж перевіряємо
    expect(calls).toBe(2);
  });

  it('відкладені в минулих сесіях — видно й зараз; «сховати» прибирає зі сховища, і лише після запису карантину', async () => {
    const OLD = staleOf({ quests: { 'q.older': { status: 'active', done: [] } } });
    const st = fakeStore([STALE]);
    let releaseQ!: (v: boolean) => void;
    const order: string[] = [];
    const s = createSaveSession(fakeBridge(), {
      ...st,
      quarantine: (j: string) => new Promise<boolean>((r) => { releaseQ = (v) => { order.push(`q:${j === STALE}`); r(v); }; }),
      readStale: async () => [OLD, STALE],
      dismissStale: async (j: string) => { order.push(`d:${j === STALE}`); return true; },
    }, { story: STORY_DEFS.story as StoryDefs });
    const p = s.start(); st.release(); await p;
    expect(s.stale).toBe(STALE);                    // цієї сесії — першим, без дубля
    const d = s.dismissStale();
    await new Promise((r) => setTimeout(r, 0));
    expect(order).toEqual([]);                      // чекає запису карантину
    releaseQ(true); expect(await d).toBe(true);
    expect(order).toEqual(['q:true', 'd:true']);
    expect(s.stale).toBe(OLD);                      // далі — з минулої сесії
    await s.dismissStale();
    expect(s.stale).toBeNull();
  });

  it('без сховища карантину автозбереження стоїть (ротація не витре єдину копію)', async () => {
    const st = fakeStore([STALE]);
    const s = createSaveSession(fakeBridge(), st, { story: STORY_DEFS.story as StoryDefs });
    const p = s.start(); st.release(); await p;
    s.autosave();
    expect(st.writes).toHaveLength(0);
    await s.save();                                 // явне «Зберегти» — рішення гравця
    expect(st.writes).toHaveLength(1);
  });
});

describe('автозбереження після дії (GAME-86)', () => {
  it('N дій → N записів, у кожному стан цієї дії; простій (без дій) → 0 записів', async () => {
    const b = fakeBridge(); const st = fakeStore([]);
    const s = createSaveSession(b, st); const p = s.start(); st.release(); await p;
    expect(st.writes).toHaveLength(0);               // старт і «тики» без дій не пишуть
    for (let i = 1; i <= 3; i++) { b.sent = i; b.load({ ...b.state, finds: i }); s.autosave(); }
    expect(st.writes).toHaveLength(3);
    expect(st.writes[2]).toBe(serialize(b.state, null));   // записаний стан дорівнює ігровому
  });

  it('той самий стан удруге не пишеться (F5: visibilitychange + pagehide), тож prev лишається запасною копією; явне «Зберегти» — пише', async () => {
    const b = fakeBridge(); const st = fakeStore([]);
    const s = createSaveSession(b, st); const p = s.start(); st.release(); await p;
    b.sent = 1; b.load({ ...b.state, finds: 1 }); s.autosave();
    s.autosave(); s.autosave();                       // без змін — жодного дубля
    expect(st.writes).toHaveLength(1);
    b.sent = 2; b.load({ ...b.state, finds: 2 }); s.autosave();
    expect(st.writes).toHaveLength(2);                // нова дія — новий запис
    await s.save();
    expect(st.writes).toHaveLength(3);                // рішення гравця — завжди
  });

  it('невдалий запис не вважається записаним: наступне автозбереження того самого стану пробує знову', async () => {
    const b = fakeBridge(); const base = fakeStore([]);
    let fail = true;
    const st = { ...base, write: async (j: string) => (fail ? false : base.write(j)) };
    const s = createSaveSession(b, st); const p = s.start(); base.release(); await p;
    b.sent = 1; b.load({ ...b.state, finds: 1 }); s.autosave();
    await Promise.resolve(); await Promise.resolve();
    fail = false; s.autosave();
    await Promise.resolve();
    expect(base.writes).toHaveLength(1);
  });

  it('дія до кінця читання: нічого не пишеться до ready, стартовий сейв не затирає дію, і дія потім доходить до сховища', async () => {
    const b = fakeBridge(); const st = fakeStore([serialize(savedSim(false))]);
    const s = createSaveSession(b, st); const p = s.start();
    b.sent = 1; b.load({ ...b.state, finds: 9 }); s.autosave();      // гравець устиг подіяти
    expect(st.writes).toEqual([]);                                    // до ready — жодного запису (GAME-33)
    st.release(); await p;
    expect(b.state.finds).toBe(9);                                    // стартовий сейв (finds 5) не затер дію
    expect(st.writes).toEqual([serialize(b.state, null)]);            // а дія не загубилась
  });

  it('контроль: лише пауза до кінця читання (без дій) — після старту запису немає', async () => {
    const b = fakeBridge(); const st = fakeStore([serialize(savedSim(false))]);
    const s = createSaveSession(b, st); const p = s.start();
    s.autosave(); st.release(); await p;
    expect(st.writes).toEqual([]);
    expect(b.state.finds).toBe(5);
  });

  it('дія під час карантину: не пишеться, поки стоїть; після запису карантину — дописується', async () => {
    const b = fakeBridge();
    let q!: (ok: boolean) => void;
    const base = fakeStore([serialize(savedSim(false), null)]);
    const st = { ...base, quarantine: () => new Promise<boolean>((r) => { q = r; }) };
    const bad = JSON.stringify({ format: 'camplife-save', schemaVersion: 999 });
    const s = createSaveSession(b, { ...st, read: async () => [bad] });
    await s.start();
    b.sent = 1; s.autosave();
    expect(base.writes).toEqual([]);
    q(true); await Promise.resolve(); await Promise.resolve();
    expect(base.writes).toHaveLength(1);
  });
});

describe('нова гра (GAME-82)', () => {
  it('стирає стару гру, пише чисту в сховище на паузі; наступний старт підхоплює нову, а не стару', async () => {
    const b = fakeBridge(); const st = fakeStore([serialize(savedSim(false))]);
    const s = createSaveSession(b, st); const p = s.start(); st.release(); await p;
    expect(b.state.finds).toBe(5);                  // позитивний контроль: стара гра була завантажена
    expect(await s.newGame()).toBe(true);
    expect(b.state.finds).toBe(0);
    expect(b.state.game.moneyCents).toBe(1000);
    expect(b.state.game.player).toBeNull();
    expect(b.state.journal).toEqual([]);
    expect(b.state.clock.paused).toBe(true);
    expect(st.writes).toHaveLength(1);
    // «Перезавантаження»: сховище тепер віддає main = нова гра, prev = стара.
    const b2 = fakeBridge(); const st2 = fakeStore([st.writes[0] as string, serialize(savedSim(false))]);
    const s2 = createSaveSession(b2, st2); const p2 = s2.start(); st2.release(); await p2;
    expect(b2.state.finds).toBe(0);
    expect(b2.state.game.moneyCents).toBe(1000);
    expect(s2.stale).toBeNull();                    // нова гра не потрапляє в карантин
  });

  it('автозбереження після нової гри живе, навіть якщо старт іще не закінчився (гра не губиться)', async () => {
    const b = fakeBridge(); const st = fakeStore([serialize(savedSim(false))]);
    const s = createSaveSession(b, st); const p = s.start();
    expect(await s.newGame()).toBe(true);
    st.release(); await p;
    expect(b.state.finds).toBe(0);                  // стартове читання не воскрешає стару гру
  });

  it('збій запису: false (UI скаже), але стан у пам\'яті вже новий', async () => {
    const b = fakeBridge();
    const s = createSaveSession(b, { read: async () => [], write: async () => false });
    b.load(savedSim(false));
    expect(await s.newGame()).toBe(false);
    expect(b.state.finds).toBe(0);
  });
});

describe('міграція v2 → v3 у сесії (рецензія GAME-71): календар доходить до fromSave', () => {
  // Сейв v2 з опублікованої гри (main): поля life немає, годинник на дні 100 — три дні виплати вже минули.
  const late = (() => {
    const o = structuredClone(v2) as { checksum: string; sim: { clock: { minutes: number } } };
    o.sim.clock.minutes = 100 * 1440;
    o.checksum = stateHash(o.sim);
    return JSON.stringify(o);
  })();
  it('з календарем: минулі дні виплати зараховано без грошей (paydays 3); без календаря — 0 (контроль)', async () => {
    const b = fakeBridge();
    const s = createSaveSession(b, { read: async () => [], write: async () => true }, { life: LIFE_DEFS.life as LifeDefs });
    expect(await s.adopt(late)).toBe('ok');
    expect(b.state.game.life).toEqual({ paydays: 3, leave: [] });
    const b2 = fakeBridge();
    expect(await createSaveSession(b2, { read: async () => [], write: async () => true }).adopt(late)).toBe('ok');
    expect(b2.state.game.life.paydays).toBe(0);
  });
});
