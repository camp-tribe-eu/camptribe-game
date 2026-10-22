// Порт UI → гра. UI отримує лише цей інтерфейс: читає знімок і просить дії, але не має доступу
// на запис до стану ядра (TD-003, сторож — eslint.config.js, блок GAME-25).
export interface UiPort {
  setPaused(paused: boolean): void;
}
