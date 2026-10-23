// Сесія сейвів (GAME-33): коли можна писати автозбереження і коли стартовий сейв має право
// замінити стан гри. Окремо від main.ts, щоб гонки перевірялись тестом без браузера.
//
// Рецензія PR #13:
// * сейв, записаний на паузі, несе paused:true — після завантаження гра без паузи;
// * якщо гравець устиг діяти чи імпортувати код до кінця читання — стартовий сейв не перезаписує;
// * до кінця стартового читання автозбереження вимкнене: інакше чистий стан витіснив би справжній
//   сейв у prev, а другий запис — зовсім.
// Рецензія сейвів проти контенту (23.10):
// * сейв під старий контент (зникле посилання або кінець недосяжний) не вантажиться — і не губиться:
//   окремий слот карантину, гравцеві — повідомлення й код відновлення;
// * карантин не чекається всередині циклу: інакше гравець устигав діяти, а prev усе одно вантажився;
// * якщо карантин не записався — автозбереження стоїть (явне «Зберегти» працює), щоб ротація
//   main/prev не витерла єдину копію.
// Рецензія 23.10 (друге коло):
// * карантин видно й у наступних сесіях (readStale), доки гравець сам не сховає повідомлення;
// * сейв від НОВІШОЇ версії гри (стара збірка з кешу) теж відкладається, а не губиться ротацією;
// * той самий контент (contentRev збігся) — пошук досяжності кінця не запускається: тупика від зміни
//   контенту бути не може, а пошук коштує сотні мс на старті.
import type { StoryDefs } from '../core/defs';
import type { LifeDefs } from '../core/life';
import { SAVE_VERSION, fromSave, serialize } from '../core/save';
import type { SimState } from '../core/sim';
import type { GameState } from '../core/state';

export interface SessionBridge {
  readonly state: SimState;
  readonly sent: number;
  load(sim: SimState): void;
  restart(): void;
  setPaused(paused: boolean): void;
}

export interface SessionStore {
  read(): Promise<string[]>;
  write(json: string): Promise<boolean>;
  /** Відкласти сейв, що не підходить до нинішнього контенту: ротація main/prev його не чіпає. */
  quarantine?(json: string): Promise<boolean>;
  /** Усі відкладені сейви (і з минулих сесій). */
  readStale?(): Promise<string[]>;
  /** Прибрати відкладений сейв — лише на прохання гравця, коли код уже показано. */
  dismissStale?(json: string): Promise<boolean>;
}

export interface SessionContent {
  readonly story?: StoryDefs;
  /** Календар життя гри (GAME-71): для міграції сейву v2 → v3 — дні виплати до старого сейву зараховує без грошей. */
  readonly life?: LifeDefs;
  readonly contentRev?: string | null;
  /** Чи можна дограти стан на нинішньому контенті (src/content/viability.ts). false — відкласти. */
  readonly viable?: (game: GameState) => boolean | undefined;
}

export type ImportResult = 'ok' | 'bad' | 'outdated' | 'newer' | 'unsaved';

/** keep — цілий сейв, який не можна вантажити зараз, але не можна й губити. */
type Verdict = { ok: true; sim: SimState } | { ok: false; keep: 'outdated' | 'newer' | null };

/** Сейв від новішої версії гри: формат наш, версія схеми більша за нашу. */
function isNewer(json: string): boolean {
  try { const v = (JSON.parse(json) as { schemaVersion?: unknown }).schemaVersion; return typeof v === 'number' && v > SAVE_VERSION; } catch { return false; }
}

export function createSaveSession(bridge: SessionBridge, store: SessionStore, content: SessionContent = {}) {
  let ready = false;
  let holdAutosave = false;
  /** Автозбереження просили, поки воно стояло (до кінця читання чи поки карантин не записано) — не губимо дію гравця (GAME-86). */
  let pending = false;
  let staleJson: string | null = null;
  /** Відкладені сейви для повідомлення: цієї сесії першим, далі з минулих. */
  let stales: string[] = [];
  let quarantined: Promise<unknown> = Promise.resolve();
  const opts = { ...(content.story ? { story: content.story } : {}), ...(content.life ? { life: content.life } : {}) };
  /** Останній відданий у сховище текст. Ротація main → prev на кожен запис: дубль (F5 шле visibilitychange і pagehide
   *  підряд) зробив би prev точною копією main саме тоді, коли запасна копія потрібна (рецензія PR #24). */
  let lastJson: string | null = null;
  const write = (): Promise<boolean> => {
    const json = serialize(bridge.state, content.contentRev ?? null);
    lastJson = json;
    return store.write(json).then((ok) => { if (!ok && lastJson === json) lastJson = null; return ok; });
  };
  /** Автозбереження: той самий стан, що вже записаний, — не пишемо вдруге. Явне «Зберегти» пише завжди. */
  const autoWrite = (): void => { if (serialize(bridge.state, content.contentRev ?? null) !== lastJson) void write(); };

  /** Сейв придатний для нинішнього контенту? outdated — цілий, але під старий контент. */
  const judge = (json: string): Verdict => {
    const r = fromSave(json, opts);
    if (!r.ok) {
      if (r.code === 'SAVE_CONTENT_MISMATCH') return { ok: false, keep: 'outdated' };
      if (r.code === 'SAVE_VERSION_UNSUPPORTED' && isNewer(json)) return { ok: false, keep: 'newer' };
      return { ok: false, keep: null };
    }
    const sameContent = content.contentRev != null && r.contentRev === content.contentRev;
    if (!sameContent && content.viable?.(r.sim.game) === false) return { ok: false, keep: 'outdated' };
    return { ok: true, sim: r.sim };
  };

  return {
    get ready() { return ready; },
    /** Сейв, відкладений на старті як застарілий (для повідомлення й коду відновлення). */
    get stale(): string | null { return stales[0] ?? null; },
    /** Сховати повідомлення про відкладений сейв: гравець код уже бачив. Копію в сховищі прибираємо. */
    async dismissStale(): Promise<boolean> {
      const json = stales[0];
      if (json === undefined) return true;
      await quarantined; // інакше запис карантину, що ще йде, повернув би щойно прибране
      const ok = store.dismissStale ? await store.dismissStale(json) : true;
      if (ok) stales = stales.filter((x) => x !== json);
      return ok;
    },
    /** Автозбереження (пауза, згорнута вкладка). До кінця старту — нічого; і поки карантин не вдався. */
    autosave(): void {
      if (ready && !holdAutosave) { pending = false; autoWrite(); } else pending = true;
    },
    /**
     * Явне «Зберегти»: пише завжди — гравець бачить і хоче саме цей стан. Тож стартове читання
     * після цього вже не замінює гру старим сейвом (рецензія: інакше свіжий запис витіснив би справжній).
     */
    save(): Promise<boolean> {
      ready = true;
      holdAutosave = false;
      return write();
    },
    /** Поточний стан текстом сейву — з відбитком контенту (для коду відновлення). */
    exportJson: (): string => serialize(bridge.state, content.contentRev ?? null),
    /** Старт: підхопити перший придатний сейв (main, інакше prev), якщо гра ще не почалась. */
    async start(): Promise<void> {
      const candidates = await store.read();
      let pick: SimState | null = null;
      for (const json of candidates) {
        const v = judge(json);
        if (v.ok) { pick = v.sim; break; }
        // Лише перший застарілий: main завжди новіший за prev.
        if (v.keep && staleJson === null) staleJson = json;
      }
      // Повторна перевірка прямо перед завантаженням: гравець міг устигнути діяти (рецензія).
      if (pick && !ready && bridge.sent === 0) {
        const paused = bridge.state.clock.paused; // пауза — як зараз в інтерфейсі, а не як у сейві
        bridge.load(pick);
        bridge.setPaused(paused);
      }
      ready = true;
      // Гравець діяв, поки читали: його дію автозбереження відкинуло, а стартовий сейв її не замінив —
      // дописуємо тепер, коли можна (GAME-86). Без дій (sent 0) нічого не пишемо: це лишень пауза.
      const flush = (): void => { if (pending && bridge.sent > 0 && ready && !holdAutosave) { pending = false; autoWrite(); } };
      if (staleJson !== null) {
        const json = staleJson;
        stales = [json];
        holdAutosave = true; // до підтвердження запису карантину ротація не сміє витерти копію
        // Без сховища карантину автозбереження так і стоїть: явне «Зберегти» — рішення гравця.
        if (store.quarantine) quarantined = store.quarantine(json).then((ok) => { if (ok) { holdAutosave = false; flush(); } });
      } else flush();
      // Відкладені в минулих сесіях — після завантаження, щоб читання не відкривало гонку.
      if (store.readStale) {
        const old = await store.readStale();
        stales = [...stales, ...old.filter((x) => !stales.includes(x))];
      }
    },
    /**
     * Нова гра (GAME-82): чистий стан, годинник на паузі (діалог відкритий), одразу в сховище. Той самий шлях
     * запису, що в adopt: main стає новою грою. Старої гри після цього НЕ відновити: перше ж автозбереження
     * (пауза при відкритті екрана подорожі) знову ротує main → prev і витісняє її (рецензія PR #17). Тому
     * захист — лише підтвердження з текстом «буде стерто»; prev не є кошиком. Карантин не чіпаємо.
     */
    async newGame(): Promise<boolean> {
      bridge.restart();
      bridge.setPaused(true);
      ready = true;
      holdAutosave = false;
      return write();
    },
    /** Імпорт: стан із сейву, годинник на паузі (діалог відкритий), одразу в сховище. */
    async adopt(json: string | null): Promise<ImportResult> {
      if (!json) return 'bad';
      const v = judge(json);
      if (!v.ok) return v.keep ?? 'bad';
      bridge.load(v.sim);
      bridge.setPaused(true);
      ready = true;
      holdAutosave = false;
      return (await write()) ? 'ok' : 'unsaved';
    },
  };
}
