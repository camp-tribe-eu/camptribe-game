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
import type { StoryDefs } from '../core/defs';
import { fromSave, serialize } from '../core/save';
import type { SimState } from '../core/sim';
import type { GameState } from '../core/state';

export interface SessionBridge {
  readonly state: SimState;
  readonly sent: number;
  load(sim: SimState): void;
  setPaused(paused: boolean): void;
}

export interface SessionStore {
  read(): Promise<string[]>;
  write(json: string): Promise<boolean>;
  /** Відкласти сейв, що не підходить до нинішнього контенту: ротація main/prev його не чіпає. */
  quarantine?(json: string): Promise<boolean>;
}

export interface SessionContent {
  readonly story?: StoryDefs;
  readonly contentRev?: string | null;
  /** Чи можна дограти стан на нинішньому контенті (src/content/viability.ts). false — відкласти. */
  readonly viable?: (game: GameState) => boolean | undefined;
}

export type ImportResult = 'ok' | 'bad' | 'outdated' | 'unsaved';

type Verdict = { ok: true; sim: SimState } | { ok: false; outdated: boolean };

export function createSaveSession(bridge: SessionBridge, store: SessionStore, content: SessionContent = {}) {
  let ready = false;
  let holdAutosave = false;
  let staleJson: string | null = null;
  const opts = content.story ? { story: content.story } : {};
  const write = (): Promise<boolean> => store.write(serialize(bridge.state, content.contentRev ?? null));

  /** Сейв придатний для нинішнього контенту? outdated — цілий, але під старий контент. */
  const judge = (json: string): Verdict => {
    const r = fromSave(json, opts);
    if (!r.ok) return { ok: false, outdated: r.code === 'SAVE_CONTENT_MISMATCH' };
    if (content.viable?.(r.sim.game) === false) return { ok: false, outdated: true };
    return { ok: true, sim: r.sim };
  };

  return {
    get ready() { return ready; },
    /** Сейв, відкладений на старті як застарілий (для повідомлення й коду відновлення). */
    get stale(): string | null { return staleJson; },
    /** Автозбереження (пауза, згорнута вкладка). До кінця старту — нічого; і поки карантин не вдався. */
    autosave(): void {
      if (ready && !holdAutosave) void write();
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
        if (v.outdated && staleJson === null) staleJson = json;
      }
      // Повторна перевірка прямо перед завантаженням: гравець міг устигнути діяти (рецензія).
      if (pick && !ready && bridge.sent === 0) {
        const paused = bridge.state.clock.paused; // пауза — як зараз в інтерфейсі, а не як у сейві
        bridge.load(pick);
        bridge.setPaused(paused);
      }
      ready = true;
      if (staleJson !== null && store.quarantine) {
        const json = staleJson;
        holdAutosave = true; // до підтвердження запису карантину ротація не сміє витерти копію
        void store.quarantine(json).then((ok) => { if (ok) holdAutosave = false; });
      }
    },
    /** Імпорт: стан із сейву, годинник на паузі (діалог відкритий), одразу в сховище. */
    async adopt(json: string | null): Promise<ImportResult> {
      if (!json) return 'bad';
      const v = judge(json);
      if (!v.ok) return v.outdated ? 'outdated' : 'bad';
      bridge.load(v.sim);
      bridge.setPaused(true);
      ready = true;
      holdAutosave = false;
      return (await write()) ? 'ok' : 'unsaved';
    },
  };
}
