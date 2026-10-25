// Точка входу браузера: сцена світу (GAME-24) + дотикові елементи (GAME-69, джойстик GAME-91).
import Phaser from 'phaser';
import { render, h } from 'preact';
import { Shell } from './ui/Shell';
import { buildLabel } from './core/build-info';
import { newInput } from './view/world/actions';
import { GAME_DEFS } from './content/slice-defs';
import { STORY, STORY_REV } from './content/story';
import { saveViable } from './content/viability';
import { decodeRestoreCode, encodeRestoreCode } from './platform/save-code';
import { saveBackend } from './platform/save-backend';
import { createSaveSession } from './platform/save-session';
import credits from '../assets/credits.json';
import { createBridge } from './view/world/bridge';
import { WorldScene, type WorldProbe } from './view/world/scene';
import { loadWorldArt } from './view/world/art';
import { mountTouchControls, setActionTarget } from './view/world/touch';
import { frameSize } from './view/world/frame';
import { storyOffer } from './view/story-offer';
import { testSwitches } from './view/test-switches';
import { addFrameLag, bootDelay, onFirstFrame } from './view/frame-lag';
import type { StoryOffer } from './ui/story-types';

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('#app is missing');

const probe: WorldProbe = { ready: false, playerX: 0, playerY: 0, nearObject: null, nearKind: null, commandsSent: 0, cameraScrollX: 0, cameraScrollY: 0, clockMinutes: 0, saveLoaded: false, cameraLerp: [0, 0],
  playerFrame: 0, playerDir: 'down', playerMoving: false, playerDepth: 0, coveredTiles: 0, behindTiles: 0, fps: 0, fpsWindows: 0, firstFrameMs: 0 };
// GAME-86: кожна команда ядру (дія екрана, розмова, взаємодія на мапі) → автозбереження одразу, а не лише на паузі.
// GAME-89 №2: сід світу (а з ним погода дня 1) — свіжий для кожної гри, з crypto на межі; ядро лишається детермінованим,
// бо сід записується в worldSeed сейву. ?seed=N (лише збірка e2e) закріплює сід — для відтворюваних тестів.
// Збірка e2e без ?seed тримає сталий 20261022 (відтворюваність існуючих тестів); ?freshSeed=1 вмикає свіжий, як у продакшені.
const seedSwitches = testSwitches(location.search, import.meta.env.MODE);
const DEFAULT_SEED = 20261022;
const randomSeed = (): number => crypto.getRandomValues(new Uint32Array(1))[0] ?? DEFAULT_SEED;
const pinnedSeed = seedSwitches.seed ?? (import.meta.env.MODE === 'e2e' && !seedSwitches.freshSeed ? DEFAULT_SEED : undefined);
const newSeed = (): number => pinnedSeed ?? randomSeed();
const bridge = createBridge(newSeed(), GAME_DEFS, () => { if (!switches.noAutosave) saves.autosave(); }, newSeed);
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
const saves = createSaveSession(bridge, saveBackend, { story: STORY, ...(GAME_DEFS.life ? { life: GAME_DEFS.life } : {}), contentRev: STORY_REV, viable: (g) => saveViable(g, GAME_DEFS) });
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
// role потрібна, щоб aria-label читався: загальному <div> ARIA ім'я не дозволяє (рецензія).
stage.setAttribute('role', 'application');
app.append(stage);

// ?hideTouch=stick|interact — лише для негативного контролю e2e (лише в збірці --mode e2e): прихована кнопка мусить ламати прохід.
const hidden = switches.hideTouch;
const pad = mountTouchControls(app, input, hidden);

// ?bootDelayMs — лише збірка e2e (GAME-38): штучно повільний старт, негативний контроль проби першого кадру.
if (seedSwitches.bootDelayMs) bootDelay(seedSwitches.bootDelayMs);

// GAME-93: картинки LPC (assets/, титри) і шари персонажів декодуємо до гри — сцена будується синхронно в create().
const worldArt = await loadWorldArt();
const frame0 = frameSize(stage.clientWidth, stage.clientHeight);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: stage,
  width: frame0.width,
  height: frame0.height,
  pixelArt: true,
  // GAME-97: preserveDrawingBuffer прибрано — жоден e2e не читає піксель полотна гри (скріншоти беруться з сторінки), а буфер змушував
  // копіювати кадр. maxTextures: 1 — шейдер партії Phaser 4 без 16-гілкового вибору текстури: у SwiftShader це швидший піксель
  // (кадр без обмеження 60 Гц: 70 → 102 fps на тій самій сцені). Усі зміни GAME-97 разом: ≈100 → ≈142 fps без обмеження.
  render: { maxTextures: 1 },
  backgroundColor: '#000000',
  // GAME-89 №4: по вертикалі кадр НЕ центруємо. На телефоні сторч мапа нижча за поле (кадр ≤ 192 px), і центрування клало
  // 150 px порожнечі між HUD і мапою; тепер мапа стоїть під HUD, а вільне місце внизу — де й так лежать дотикові кнопки.
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY },
  physics: { default: 'arcade', arcade: { debug: false } },
  scene: [new WorldScene(bridge, input, probe, worldArt, talkOnMap)],
});
// ?frameLagMs — лише збірка e2e (GAME-97): штучно довгий кадр.
if (switches.frameLagMs) addFrameLag(game, switches.frameLagMs);
// GAME-38: перший кадр від початку навігації → probe.firstFrameMs (бюджет 1,5 с, tests/e2e/game-38.spec.ts).
onFirstFrame(game, (ms) => { probe.firstFrameMs = ms; });

// Поле змінило розмір (поворот телефону, смуга HUD, текст 200 %) — кадр підлаштовується під його форму.
new ResizeObserver(() => {
  const f = frameSize(stage.clientWidth, stage.clientHeight);
  if (f.width !== game.scale.gameSize.width || f.height !== game.scale.gameSize.height) game.scale.setGameSize(f.width, f.height);
  // GAME-96: розмір кадру міг не змінитись (широкий 640×352 на будь-якій висоті), а поле — змінилось (шапка з'явилась, поворот): FIT міряє
  // батьківський блок лише по події, тож без refresh() полотно лишалось завбільшки з поле ДО появи шапки і вилазило за екран (1280×720: 704 у полі 648).
  game.scale.refresh();
}).observe(stage);

// Оболонка UI (GAME-25): пауза зупиняє і сцену, і ігровий годинник ядра.
const ui = document.createElement('div');
ui.id = 'ui';
app.append(ui);
// ?lang=pseudo — псевдолокаль для e2e-тесту переповнення (GAME-26).
const langOverride = new URLSearchParams(location.search).get('lang') === 'pseudo' ? ('pseudo' as const) : undefined;
render(h(Shell, {
  build: buildLabel(__GAME_VERSION__, __GAME_COMMIT__),   // GAME-91: підпис збірки — у меню паузи, не на екрані гри
  ...(langOverride ? { langOverride } : {}),
  ...(switches.holdToast ? { holdToast: true } : {}),
  credits,
  port: {
    save: () => saves.save(),
    newGame: async () => {
      const ok = await saves.newGame();
      storyChanged();
      return ok;
    },
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
      // GAME-89 №3: пауза вже поставленої на паузу сцени (Нова гра: меню → екран подорожі) давала в консолі
      // «Cannot pause non-running Scene world». Тож переводимо сцену лише коли її стан справді змінюється.
      if (paused && game.scene.isActive('world')) game.scene.pause('world');
      else if (!paused && game.scene.isPaused('world')) game.scene.resume('world');
    },
  },
}), ui);

// HUD живий (GAME-83): ігрова хвилина змінилась — повідомляємо UI, він перечитає знімок. Без таймера реального часу
// (сторож no-realtime): це крок самої гри, а не відлік; поки меню чи екран відкриті, годинник стоїть — подій немає.
let lastMinute = bridge.state.clock.minutes;
game.events.on(Phaser.Core.Events.POST_STEP, () => {
  setActionTarget(pad, probe.nearKind);   // GAME-95: кнопка дії знає, що поруч (talk/fire/object) чи нічого (idle)
  const m = bridge.state.clock.minutes;
  if (m === lastMinute) return;
  lastMinute = m;
  storyChanged();
});

// Автозбереження, коли вкладку згортають чи закривають (телефон може вбити її будь-коли).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saves.autosave();
});
// Закриття/перезавантаження: Chromium не завжди дає visibilitychange, тож pagehide — остання нагода (GAME-86).
window.addEventListener('pagehide', () => saves.autosave());

// Старт: підхопити останній цілий сейв. Позиція в пікселях не зберігається (DC-042):
// після завантаження персонаж з'являється в точці появи. Правила гонок — у save-session.ts.
void saves.start().then(() => { probe.saveLoaded = true; storyChanged(); });
