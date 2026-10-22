// Точка входу браузера: сцена світу (GAME-24) + дотикові кнопки (GAME-69) + рядок збірки.
import Phaser from 'phaser';
import { render, h } from 'preact';
import { Shell } from './ui/Shell';
import { buildLabel } from './core/build-info';
import { newInput, type Action } from './view/world/actions';
import { createBridge } from './view/world/bridge';
import { WorldScene, type WorldProbe } from './view/world/scene';
import { mountTouchControls } from './view/world/touch';

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('#app відсутній');

const probe: WorldProbe = { ready: false, playerX: 0, playerY: 0, nearObject: null, commandsSent: 0, cameraScrollX: 0, cameraScrollY: 0, clockMinutes: 0 };
const bridge = createBridge(20261022);
const input = newInput();
// Тестовий хук Playwright: стан для перевірок, без доступу на запис до ядра.
(window as unknown as { __game: { probe: WorldProbe; bridge: typeof bridge } }).__game = { probe, bridge };

const stage = document.createElement('div');
stage.id = 'stage';
app.append(stage);

// ?hideTouch=interact — лише для негативного контролю e2e: прихована кнопка мусить ламати прохід.
const hidden = (new URLSearchParams(location.search).get('hideTouch') ?? '').split(',').filter(Boolean) as Action[];
mountTouchControls(app, input, hidden);

const label = document.createElement('p');
label.className = 'build';
label.textContent = buildLabel(__GAME_VERSION__, __GAME_COMMIT__);
app.append(label);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: stage,
  width: 240,
  height: 160,
  pixelArt: true,
  backgroundColor: '#000000',
  render: { preserveDrawingBuffer: true },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: { default: 'arcade', arcade: { debug: false } },
  scene: [new WorldScene(bridge, input, probe)],
});

// Оболонка UI (GAME-25): пауза зупиняє і сцену, і ігровий годинник ядра.
const ui = document.createElement('div');
ui.id = 'ui';
app.append(ui);
render(h(Shell, {
  port: {
    setPaused(paused: boolean) {
      bridge.setPaused(paused);
      if (paused) game.scene.pause('world'); else game.scene.resume('world');
    },
  },
}), ui);
