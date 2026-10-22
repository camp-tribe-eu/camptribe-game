// Сесія сейвів (GAME-33): коли можна писати автозбереження і коли стартовий сейв має право
// замінити стан гри. Окремо від main.ts, щоб гонки перевірялись тестом без браузера.
//
// Рецензія PR #13:
// * сейв, записаний на паузі, несе paused:true — після завантаження гра без паузи;
// * якщо гравець устиг діяти чи імпортувати код до кінця читання — стартовий сейв не перезаписує;
// * до кінця стартового читання автозбереження вимкнене: інакше чистий стан витіснив би справжній
//   сейв у prev, а другий запис — зовсім.
import type { StoryDefs } from '../core/defs';
import { fromSave, serialize } from '../core/save';
import type { SimState } from '../core/sim';

export interface SessionBridge {
  readonly state: SimState;
  readonly sent: number;
  load(sim: SimState): void;
  setPaused(paused: boolean): void;
}

export interface SessionStore {
  read(): Promise<string[]>;
  write(json: string): Promise<boolean>;
  /** Відкласти сейв, що не підходить до нинішнього контенту: автозбереження його не витре, а майбутня міграція — врятує. */
  quarantine?(json: string): Promise<boolean>;
}

export interface SessionContent {
  readonly story?: StoryDefs;
  readonly contentRev?: string | null;
}

export type ImportResult = 'ok' | 'bad' | 'unsaved';

export function createSaveSession(bridge: SessionBridge, store: SessionStore, content: SessionContent = {}) {
  let ready = false;
  const opts = content.story ? { story: content.story } : {};
  const write = (): Promise<boolean> => store.write(serialize(bridge.state, content.contentRev ?? null));
  return {
    get ready() { return ready; },
    /** Автозбереження (пауза, згорнута вкладка). До кінця старту — нічого. */
    autosave(): void {
      if (ready) void write();
    },
    /**
     * Явне «Зберегти»: пише завжди — гравець бачить і хоче саме цей стан. Тож стартове читання
     * після цього вже не замінює гру старим сейвом (рецензія: інакше свіжий запис витіснив би справжній).
     */
    save(): Promise<boolean> {
      ready = true;
      return write();
    },
    /** Старт: підхопити перший цілий сейв (main, інакше prev), якщо гра ще не почалась. */
    async start(): Promise<void> {
      const candidates = await store.read();
      if (!ready && bridge.sent === 0) {
        let quarantined = false;
        for (const json of candidates) {
          const r = fromSave(json, opts);
          // Сейв під старий контент: не вантажимо (застряг би), але й не губимо — у карантин, один раз.
          if (!r.ok && r.code === 'SAVE_CONTENT_MISMATCH' && !quarantined && store.quarantine) { quarantined = true; await store.quarantine(json); }
          // Пауза — як зараз в інтерфейсі (меню могли відкрити, поки читали), а не як у сейві.
          if (r.ok) { const paused = bridge.state.clock.paused; bridge.load(r.sim); bridge.setPaused(paused); break; }
        }
      }
      ready = true;
    },
    /** Імпорт: стан із сейву, годинник на паузі (діалог відкритий), одразу в сховище. */
    async adopt(json: string | null): Promise<ImportResult> {
      const r = json ? fromSave(json, opts) : null;
      if (!json || !r?.ok) return 'bad';
      bridge.load(r.sim);
      bridge.setPaused(true);
      ready = true;
      return (await write()) ? 'ok' : 'unsaved';
    },
  };
}
