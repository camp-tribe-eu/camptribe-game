// Точка входу браузера: сцена світу (GAME-24) + дотикові кнопки (GAME-69) + рядок збірки.
import Phaser from 'phaser';
import { render, h } from 'preact';
import { Shell } from './ui/Shell';
import { buildLabel } from './core/build-info';
import { newInput, type Action } from './view/world/actions';
import { SLICE_DEFS } from './content/slice-defs';
import { serialize } from './core/save';
import { decodeRestoreCode, encodeRestoreCode } from './platform/save-code';
import { readSaves, writeSave } from './platform/save-store';
import { createSaveSession } from './platform/save-session';
import { createBridge } from './view/world/bridge';
import { WorldScene, type WorldProbe } from './view/world/scene';
import { mountTouchControls } from './view/world/touch';

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('#app is missing');

const probe: WorldProbe = { ready: false, playerX: 0, playerY: 0, nearObject: null, commandsSent: 0, cameraScrollX: 0, cameraScrollY: 0, clockMinutes: 0, saveLoaded: false };
const bridge = createBridge(20261022, SLICE_DEFS);
const input = newInput();
const saves = createSaveSession(bridge, { read: readSaves, write: writeSave });
// Тестовий хук Playwright: лише ЧИТАННЯ — знімок стану копією, місток назовні не віддається
// (рецензія PR #13: раніше скрипт сторінки міг надіслати команду в ядро).
(window as unknown as { __game: { probe: WorldProbe; read: () => unknown } }).__game = {
  probe,
  read: () => JSON.parse(JSON.stringify(bridge.state)) as unknown,
};

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
// ?lang=pseudo — псевдолокаль для e2e-тесту переповнення (GAME-26).
const langOverride = new URLSearchParams(location.search).get('lang') === 'pseudo' ? ('pseudo' as const) : undefined;
render(h(Shell, {
  ...(langOverride ? { langOverride } : {}),
  port: {
    save: () => saves.save(),
    exportCode: () => encodeRestoreCode(serialize(bridge.state)),
    importCode: async (code: string) => saves.adopt(await decodeRestoreCode(code)),
    setPaused(paused: boolean) {
      // Відпускання клавіші під час паузи сцена не бачить — скидаємо введення на межі паузи,
      // інакше клавіша «залипає» і персонаж іде сам (рецензія PR #13).
      input.held.clear();
      input.tapped.clear();
      (game.scene.getScene('world') as WorldScene | null)?.haltPlayer();
      bridge.setPaused(paused);
      if (paused) saves.autosave(); // автозбереження на паузі
      if (paused) game.scene.pause('world'); else game.scene.resume('world');
    },
  },
}), ui);

// Автозбереження, коли вкладку згортають чи закривають (телефон може вбити її будь-коли).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saves.autosave();
});

// Старт: підхопити останній цілий сейв. Позиція в пікселях не зберігається (DC-042):
// після завантаження персонаж з'являється в точці появи. Правила гонок — у save-session.ts.
void saves.start().then(() => { probe.saveLoaded = true; });
