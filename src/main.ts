// Точка входу браузера: сцена світу (GAME-24) + дотикові кнопки (GAME-69) + рядок збірки.
import Phaser from 'phaser';
import { render, h } from 'preact';
import { Shell } from './ui/Shell';
import { buildLabel } from './core/build-info';
import { newInput, type Action } from './view/world/actions';
import { GAME_DEFS } from './content/slice-defs';
import { STORY, STORY_REV } from './content/story';
import { saveViable } from './content/viability';
import { decodeRestoreCode, encodeRestoreCode } from './platform/save-code';
import { dismissStale, readSaves, readStale, writeSave, writeStale } from './platform/save-store';
import { createSaveSession } from './platform/save-session';
import credits from '../assets/credits.json';
import { createBridge } from './view/world/bridge';
import { WorldScene, type WorldProbe } from './view/world/scene';
import { mountTouchControls } from './view/world/touch';
import { storyOffer } from './view/story-offer';
import { testSwitches } from './view/test-switches';
import type { StoryOffer } from './ui/story-types';

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('#app is missing');

const probe: WorldProbe = { ready: false, playerX: 0, playerY: 0, nearObject: null, commandsSent: 0, cameraScrollX: 0, cameraScrollY: 0, clockMinutes: 0, saveLoaded: false };
const bridge = createBridge(20261022, GAME_DEFS);
const input = newInput();
// Екран подорожі (GAME-32): знімок сюжету з поточного стану; дію шукаємо в СВІЖОМУ знімку за id —
// якщо стан тим часом змінився і дії вже немає, нічого не надсилаємо.
// ?hideAct=complete — лише для негативного контролю e2e (GAME-36; лише в збірці --mode e2e).
const switches = testSwitches(location.search, import.meta.env.MODE);
const hiddenActs = switches.hideAct;
const shown = (o: StoryOffer): StoryOffer => (hiddenActs.length === 0 ? o : {
  ...o,
  actions: o.actions.filter((a) => !hiddenActs.includes(a.kind)),
  dialogue: o.dialogue && { ...o.dialogue, answers: o.dialogue.answers.filter((a) => !hiddenActs.includes(a.kind)) },
});
const storyListeners = new Set<() => void>();
const storyChanged = (): void => { for (const l of storyListeners) l(); };
const openListeners = new Set<() => void>();
/** Розмова з NPC на мапі: команда в ядро (ядро саме відмовить, якщо гравець не тут), і екран подорожі —
 *  там видно розмову або те, чого бракує (немає персонажа, не та локація). */
const talkOnMap = (npcId: string): void => {
  bridge.send({ type: 'Talk', npcId });
  storyChanged();
  for (const l of openListeners) l();
};
const saves = createSaveSession(bridge, { read: readSaves, write: writeSave, quarantine: writeStale, readStale, dismissStale }, { story: STORY, contentRev: STORY_REV, viable: (g) => saveViable(g, GAME_DEFS) });
// Тестовий хук Playwright: лише ЧИТАННЯ — знімок стану копією, місток назовні не віддається
// (рецензія PR #13: раніше скрипт сторінки міг надіслати команду в ядро).
(window as unknown as { __game: { probe: WorldProbe; read: () => unknown } }).__game = {
  probe,
  read: () => JSON.parse(JSON.stringify(bridge.state)) as unknown,
};

const stage = document.createElement('div');
stage.id = 'stage';
// Ціль фокуса після закриття екрана подорожі (рецензія: <body> губив місце читача). Не в порядку Tab.
stage.tabIndex = -1;
app.append(stage);

// ?hideTouch=interact — лише для негативного контролю e2e (лише в збірці --mode e2e): прихована кнопка мусить ламати прохід.
const hidden = switches.hideTouch as Action[];
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
  scene: [new WorldScene(bridge, input, probe, talkOnMap)],
});

// Оболонка UI (GAME-25): пауза зупиняє і сцену, і ігровий годинник ядра.
const ui = document.createElement('div');
ui.id = 'ui';
app.append(ui);
// ?lang=pseudo — псевдолокаль для e2e-тесту переповнення (GAME-26).
const langOverride = new URLSearchParams(location.search).get('lang') === 'pseudo' ? ('pseudo' as const) : undefined;
render(h(Shell, {
  ...(langOverride ? { langOverride } : {}),
  credits,
  port: {
    save: () => saves.save(),
    exportCode: () => encodeRestoreCode(saves.exportJson()),
    staleCode: () => (saves.stale ? encodeRestoreCode(saves.stale) : Promise.resolve(null)),
    dismissStale: () => saves.dismissStale(),
    importCode: async (code: string) => {
      const r = await saves.adopt(await decodeRestoreCode(code));
      storyChanged();
      return r;
    },
    story: () => shown(storyOffer(bridge.state, GAME_DEFS).offer),
    act(id: string) {
      const intent = storyOffer(bridge.state, GAME_DEFS).intents.get(id);
      if (!intent) return;
      bridge.send(intent);
      storyChanged();
    },
    onStory(listener: () => void) {
      storyListeners.add(listener);
      return () => { storyListeners.delete(listener); };
    },
    onOpenStory(listener: () => void) {
      openListeners.add(listener);
      return () => { openListeners.delete(listener); };
    },
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
void saves.start().then(() => { probe.saveLoaded = true; storyChanged(); });
