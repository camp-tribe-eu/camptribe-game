// Точка входу браузера. Поки що — лише рядок збірки; сцена з'явиться після спайку Phaser 4 (GAME-14).
import { buildLabel } from './core/build-info';

const app = document.querySelector<HTMLElement>('#app');
if (app) {
  const label = document.createElement('p');
  label.className = 'build';
  label.textContent = buildLabel(__GAME_VERSION__, __GAME_COMMIT__);
  app.append(label);
}
