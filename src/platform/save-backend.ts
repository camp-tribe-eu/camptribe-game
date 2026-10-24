// GAME-103 (OD-015 п.4): ЄДИНА межа збереження ігор. Уся гра пише й читає сейви лише через SaveBackend.
// Модуль збереження — файли src/platform/save-*.ts (без тестів): save-backend (цей інтерфейс і вибір реалізації),
// save-store (IndexedDB — сайт), save-memory (пам'яттєва заглушка «сховища YouTube Playables SDK»), save-session
// (логіка сесії), save-code (код відновлення). Ніхто поза модулем не торкається indexedDB / localStorage /
// sessionStorage для сейвів — це стереже src/guards/save-boundary.test.ts. Налаштування (settings.ts) — окремий,
// названий виняток у сторожі: вони не частина сейву.
// Коли з'явиться справжній SDK, додається ще одна реалізація SaveBackend тут же — main.ts і гра не змінюються.
// Ліміти YouTube (перше джерело): сейв МУСИТЬ бути < 3 МіБ, БАЖАНО < 500 КіБ — перевіряє save-size.test.ts.
import { dismissStale, readSaves, readStale, writeSave, writeStale } from './save-store';
import type { SessionStore } from './save-session';

/**
 * Контракт: `write` атомарний — після невдачі (false) `read()` повертає ті самі main і prev, що були до виклику;
 * успішний запис переносить попередній main у prev; карантин (stale:*) ротація не чіпає.
 */
export interface SaveBackend extends Required<SessionStore> {
  /** Кандидати в порядку довіри: спершу main, потім prev. Перевіряє їх ядро. */
  read(): Promise<string[]>;
}

/** Сайт: IndexedDB. */
export const idbBackend: SaveBackend = { read: readSaves, write: writeSave, quarantine: writeStale, readStale, dismissStale };

/** Нині єдина реалізація для гри — IndexedDB. Підміна на SDK YouTube — тут, і лише тут. */
export const saveBackend: SaveBackend = idbBackend;
