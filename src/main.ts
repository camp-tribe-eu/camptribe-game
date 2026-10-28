// Точка входу браузера: сцена світу (GAME-24) + дотикові елементи (GAME-69, джойстик GAME-91).
import Phaser from 'phaser';
import { render, h } from 'preact';
import { Shell } from './ui/Shell';
import { t } from './i18n';
import { loadSettings } from './platform/settings';
import { buildLabel } from './core/build-info';
import { newInput } from './view/world/actions';
import { GAME_DEFS } from './content/slice-defs';
import { STORY, STORY_REV } from './content/story';
import { saveViable } from './content/viability';
import { decodeRestoreCode, encodeRestoreCode } from './platform/save-code';
import { saveBackend } from './platform/save-backend';
import { createSaveSession } from './platform/save-session';
import credits from '../assets/credits.json';
import { step } from './core/sim';
import { createBridge } from './view/world/bridge';
import { WorldScene, type WorldProbe } from './view/world/scene';
import { loadWorldArt } from './view/world/art';
import { mountTouchControls, setActionTarget } from './view/world/touch';
import { frameSize } from './view/world/frame';
import { storyOffer } from './view/story-offer';
import { testSwitches } from './view/test-switches';
import { addFrameLag, bootDelay, onFirstFrame } from './view/frame-lag';
import type { StoryOffer } from './ui/story-types';
import { uiSounds } from './audio/ui-sounds';
import { liveSpot, spotMove, storyMoves } from './content/director';

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('#app is missing');

const probe: WorldProbe = { ready: false, playerX: 0, playerY: 0, nearObject: null, nearKind: null, commandsSent: 0, cameraScrollX: 0, cameraScrollY: 0, clockMinutes: 0, saveLoaded: false, cameraLerp: [0, 0], followers: [],
  playerFrame: 0, playerDir: 'down', playerMoving: false, playerDepth: 0, coveredTiles: 0, behindTiles: 0, fps: 0, fpsWindows: 0, firstFrameMs: 0,
  residents: [], bark: null, barkCount: 0,
  daylight: { on: false, visible: false, minuteOfDay: 0, darkness: 0, color: 0xffffff, glow: 0 } };
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
// GAME-99: ?atMinute=N (лише збірка e2e) — старт о N-й хвилині доби, щоб e2e бачив і день, і ніч без очікування.
if (seedSwitches.atMinute) bridge.load(step(bridge.state, { kind: 'advance', minutes: seedSwitches.atMinute }));
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
// GAME-170 зріз 2 · режисер: перед кожним оновленням екрана — ходи СЮЖЕТУ (StartWave на етапі хвилі). Ядро — сторож законності;
// режисер шле лише те, що ядро прийме, і рівно раз (після прийняття pendingWave порожній; відмова видна в processed).
// Завантаження збереження на CH1-D2-CAMP-001 без хвилі стартує її тут же, строки — від годинника завантаження (прийнято, див. director.ts).
const direct = (): void => { for (const m of storyMoves(bridge.state, GAME_DEFS)) bridge.send(m); };
const storyChanged = (): void => { direct(); for (const l of storyListeners) l(); };
const openListeners = new Set<() => void>();
/** Розмова з NPC на мапі: команда в ядро (ядро саме відмовить, якщо гравець не тут), і екран подорожі —
 *  там видно розмову або те, чого бракує (немає персонажа, не та локація). */
const talkOnMap = (npcId: string): void => {
  bridge.send({ type: 'Talk', npcId });
  storyChanged();
  for (const l of openListeners) l();
};
/** Дотик до об'єкта мапи: режисер каже, що це зараз (справа хвилі → CompleteTask; вогнище на етапі вечора → StartScene, і екран подорожі
 *  відкривається з репліками; інакше Interact). ?breakSpot=<назва> (лише збірка e2e) робить об'єкт німим — негативний контроль. */
const actOnMap = (name: string): void => {
  if (switches.breakSpot.includes(name)) return;
  const m = spotMove(bridge.state, name);
  if (!m) return;
  bridge.send(m);
  storyChanged();
  if (m.type === 'StartScene') for (const l of openListeners) l();
};
const saves = createSaveSession(bridge, saveBackend, { story: STORY, ...(GAME_DEFS.life ? { life: GAME_DEFS.life } : {}), contentRev: STORY_REV, viable: (g) => saveViable(g, GAME_DEFS) });
// Тестовий хук Playwright: лише ЧИТАННЯ — знімок стану копією, місток назовні не віддається
// (рецензія PR #13: раніше скрипт сторінки міг надіслати команду в ядро).
(window as unknown as { __game: { probe: WorldProbe; read: () => unknown; sounds: () => readonly string[] } }).__game = {
  probe,
  sounds: () => [...uiSounds.played],   // GAME-40: що мікшер прийняв до відтворення (лише читання)
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
  // GAME-96 (смак власника 25.10): масштаб рахуємо самі (frameSize: цілий zoom, кадр = ⌈поле / zoom⌉), Phaser лише множить —
  // режим NONE + zoom. Полотно стоїть у лівому верхньому куті поля (GAME-89 №4: по вертикалі не центруємо — мапа під HUD) і покриває
  // поле по ширині: вбік і на десктопі смуг з боків немає; зайве (< zoom px) ховає overflow поля. FIT із кадром 640×352 давав смуги.
  scale: { mode: Phaser.Scale.NONE, autoCenter: Phaser.Scale.NO_CENTER, zoom: frame0.zoom },
  physics: { default: 'arcade', arcade: { debug: false } },
  scene: [new WorldScene(bridge, input, probe, worldArt, talkOnMap, actOnMap, (name) => liveSpot(bridge.state, name), !switches.noDaylight, (key) => t(langOverride ?? loadSettings().language, key))],
});
// ?frameLagMs — лише збірка e2e (GAME-97): штучно довгий кадр.
if (switches.frameLagMs) addFrameLag(game, switches.frameLagMs);
// GAME-38: перший кадр від початку навігації → probe.firstFrameMs (бюджет 1,5 с, tests/e2e/game-38.spec.ts).
onFirstFrame(game, (ms) => { probe.firstFrameMs = ms; });

// Поле змінило розмір (поворот телефону, смуга HUD, текст 200 %) — кадр підлаштовується під його форму.
const applyFrame = (): void => {
  const f = frameSize(stage.clientWidth, stage.clientHeight);
  if (f.zoom !== game.scale.zoom) game.scale.setZoom(f.zoom);
  if (f.width !== game.scale.gameSize.width || f.height !== game.scale.gameSize.height) game.scale.resize(f.width, f.height);
  // Phaser (NONE) пише style лише коли zoom ≠ 1 або zoom щойно змінився: при поверненні до zoom 1 лишався б старий розмір. Ставимо самі, завжди.
  const canvas = game.canvas;
  canvas.style.width = `${f.width * f.zoom}px`;
  canvas.style.height = `${f.height * f.zoom}px`;
  game.scale.refresh();   // межі полотна й displayScale для вводу — з нового style
};
new ResizeObserver(applyFrame).observe(stage);

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
  hideUi: switches.hideUi,
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
