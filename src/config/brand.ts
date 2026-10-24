// GAME-119 · назва гри — рішення власника 24.10.2026: CampTribe (замість CampLife).
// Єдине місце, де назва записана в коді. Усе видиме гравцю бере її звідси: <title> (підстановка %GAME_NAME% у vite.config.ts),
// підпис збірки (src/core/build-info.ts). Сторож: src/guards/brand.test.ts.
// Ідентифікатори формату (ключ налаштувань, назва БД IndexedDB, SAVE_FORMAT) НЕ перейменовуються:
// зміна зламала б наявні сейви й налаштування гравців.
export const GAME_NAME = 'CampTribe';
