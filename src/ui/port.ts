// Порт UI → гра. UI отримує лише цей інтерфейс: просить дії, але не має доступу на запис
// до стану ядра (TD-003, сторож — eslint.config.js, блок GAME-25).
export interface UiPort {
  setPaused(paused: boolean): void;
  /** Записати сейв у сховище браузера (GAME-33). */
  save(): Promise<boolean>;
  /** Код відновлення поточної гри (OD-008). */
  exportCode(): Promise<string>;
  /** Відновити гру з коду; false — код не підходить. */
  importCode(code: string): Promise<boolean>;
}
