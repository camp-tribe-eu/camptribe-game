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
import { WorldScene, type WorldHooks, type WorldProbe } from './view/world/scene';
import { loadWorldArt } from './view/world/art';
import { mountTouchControls, setActionTarget } from './view/world/touch';
import { frameSize } from './view/world/frame';
import { storyOffer, type StoryView } from './view/story-offer';
import { testSwitches } from './view/test-switches';
import { addFrameLag, bootDelay, onFirstFrame } from './view/frame-lag';
import type { StoryOffer } from './ui/story-types';
import { uiSounds } from './audio/ui-sounds';
import { liveSpot, spotMove, storyMoves } from './content/director';
import { isBulky, isMapFirstSpot, mapKeyFor, needsLeft, nextTarget, resolveSpot, spotLook, unpackMoves } from './content/map-first';
import { packFlag } from './core/packing';
import type { GameState } from './core/state';

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('#app is missing');

const probe: WorldProbe = { ready: false, playerX: 0, playerY: 0, nearObject: null, nearKind: null, commandsSent: 0, cameraScrollX: 0, cameraScrollY: 0, clockMinutes: 0, saveLoaded: false, cameraLerp: [0, 0], followers: [], leisure: [],
  playerFrame: 0, playerDir: 'down', playerMoving: false, playerDepth: 0, coveredTiles: 0, behindTiles: 0, fps: 0, fpsWindows: 0, firstFrameMs: 0,
  residents: [], bark: null, barkCount: 0,
  daylight: { on: false, visible: false, minuteOfDay: 0, darkness: 0, color: 0xffffff, glow: 0 },
  fx: { target: null, ring: 0, ringName: null, backpack: 0, guide: 'none', pops: 0, auto: 0 } };
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
// GAME-175: вигляд екрана подорожі при мапі-першій грі. Багажник (сітка пакування) відкривається лише біля авто й закривається, коли екран закрито;
// `near` — об'єкт мапи, до якого гравець підійшов (підпис дії в HUD). Це стан ПОКАЗУ, не гри: ядро й сейв його не знають.
let trunkOpen = false;
let nearSpot: string | null = null;
// GAME-175: рюкзак героя — дрібні речі, які він підібрав удома, але ще не розвантажив в авто. Стан ПОКАЗУ (ядро й сейв його не знають; перезавантаження
// повертає речі на місця). Громіздке (намет, спальник) іде одразу в багажник.
const backpack: string[] = [];
const viewOf = (): StoryView => ({ mapFirst: !switches.panelActs, trunk: trunkOpen, near: nearSpot, backpack });
// GAME-170 зріз 2 · режисер: перед кожним оновленням екрана — ходи СЮЖЕТУ (StartWave на етапі хвилі). Ядро — сторож законності;
// режисер шле лише те, що ядро прийме, і рівно раз (після прийняття pendingWave порожній; відмова видна в processed).
// Завантаження збереження на CH1-D2-CAMP-001 без хвилі стартує її тут же, строки — від годинника завантаження (прийнято, див. director.ts).
const direct = (): void => { for (const m of storyMoves(bridge.state, GAME_DEFS)) bridge.send(m); };
const openListeners = new Set<() => void>();
// GAME-175: розмова, яку почала не дія гравця на мапі, а гра (подія в дорозі після виїзду), мусить бути видна: об'єкти мапи під час розмови мовчать, тож без
// екрана подорожі гравець завис би. Розмова щойно з'явилась (раніше її не було) — екран відкривається сам.
let hadDialogue = false;
let unpackedOnce = false;
const storyChanged = (): void => {
  // GAME-175: мапа-перша гра — спакований «за порадою» набір розкладається, коли гравець удома; речі він переносить ногами (раз за гру).
  if (!switches.panelActs && !unpackedOnce) {
    const moves = unpackMoves(bridge.state, GAME_DEFS);
    if (moves.length > 0) { unpackedOnce = true; for (const m of moves) bridge.send(m); }
  }
  direct();
  for (const l of storyListeners) l();
  const talking = bridge.state.game.dialogue !== null;
  if (talking && !hadDialogue) for (const l of openListeners) l();
  hadDialogue = talking;
};
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
  // GAME-175: об'єкти дня 1 удома (крок, річ, полиця, авто, багажник) — ті самі команди ядра, що були кнопками панелі (src/content/map-first.ts).
  if (isMapFirstSpot(name)) {
    const r = resolveSpot(bridge.state, GAME_DEFS, name);
    if (!r) return;
    const first = r.moves[0];
    // Дрібна річ удома: у рюкзак (команда пакування піде при розвантаженні біля авто), без розмови ядра.
    if (first?.type === 'PackItem' && !isBulky(GAME_DEFS, first.itemId)) { backpack.push(first.itemId); storyChanged(); return; }
    for (const move of r.moves) bridge.send(move);
    if (r.ui === 'trunk') trunkOpen = true;
    storyChanged();
    if (r.ui === 'trunk') for (const l of openListeners) l();
    return;
  }
  const m = spotMove(bridge.state, name);
  if (!m) return;
  bridge.send(m);
  storyChanged();
  if (m.type === 'StartScene') for (const l of openListeners) l();
};
/** Розвантаження: одна річ з рюкзака в багажник (та сама команда PackItem). Не вмістилась — лишається не взятою (відкривається сітка), рюкзак порожніє на цю річ. */
const unloadOne = (): 'ok' | 'full' | 'none' => {
  const id = backpack.shift();
  if (id === undefined) return 'none';
  if (bridge.state.game.flags.includes(packFlag(id))) { storyChanged(); return 'ok'; }   // уже вкладена через сітку
  const before = bridge.state.game.flags.length;
  bridge.send({ type: 'PackItem', itemId: id });
  const done = bridge.state.game.flags.length > before;
  if (!done) { trunkOpen = true; for (const l of openListeners) l(); }
  storyChanged();
  return done ? 'ok' : 'full';
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
// Що сцена просить у гри (GAME-175). Ціль підказки рахуємо раз на стан ядра (не на кадр): годинник стану не міняє.
let targetFor: GameState | null = null;
let targetPack = -1;
let targetSpot: string | null = null;
let needsFor: GameState | null = null;
let needsPack = -1;
let needsMemo = { small: 0, bulky: 0 };
const worldHooks: WorldHooks = {
  onNpc: talkOnMap,
  onObject: actOnMap,
  isLive: (name) => liveSpot(bridge.state, name, GAME_DEFS) && !(name.startsWith('pack.') && backpack.includes(name.slice(5))),
  backpack: () => backpack.length,
  unload: unloadOne,
  needs: () => {
    // Раз на стан ядра й вміст рюкзака, а не на кадр: годинник стан не міняє, тож скрізь між діями це той самий об'єкт.
    if (needsFor !== bridge.state.game || needsPack !== backpack.length) {
      needsFor = bridge.state.game; needsPack = backpack.length;
      const left = needsLeft(bridge.state, GAME_DEFS, backpack);
      const bulky = left.filter((i) => isBulky(GAME_DEFS, i)).length;
      needsMemo = { small: left.length - bulky, bulky };
    }
    return needsMemo;
  },
  look: (name) => spotLook(bridge.state, name),
  target: () => {
    if (targetFor !== bridge.state.game || targetPack !== backpack.length) { targetFor = bridge.state.game; targetPack = backpack.length; targetSpot = nextTarget(bridge.state, GAME_DEFS, backpack)?.spot ?? null; }
    return targetSpot;
  },
  // Збірка e2e без ?mapFirst=1 — як до GAME-175: завжди табір (старі e2e ходять по ньому й перевіряють не прохід дня 1).
  mapKey: () => switches.map ?? (switches.panelActs ? 'camp' : mapKeyFor(bridge.state.game.player?.locationId)),
  transport: () => bridge.state.game.player?.transportId ?? null,
};
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
  scene: [new WorldScene(bridge, input, probe, worldArt, worldHooks, !switches.noDaylight, (key) => t(langOverride ?? loadSettings().language, key))],
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
      backpack.length = 0;
      unpackedOnce = false;
      const ok = await saves.newGame();
      storyChanged();
      return ok;
    },
    exportCode: () => encodeRestoreCode(saves.exportJson()),
    staleCode: () => (saves.stale ? encodeRestoreCode(saves.stale) : Promise.resolve(null)),
    dismissStale: () => saves.dismissStale(),
    importCode: async (code: string) => {
      backpack.length = 0;
      unpackedOnce = false;
      const r = await saves.adopt(await decodeRestoreCode(code));
      storyChanged();
      return r;
    },
    story: () => shown(storyOffer(bridge.state, GAME_DEFS, viewOf()).offer),
    act(id: string) {
      const intent = storyOffer(bridge.state, GAME_DEFS, viewOf()).intents.get(id);
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
      if (!paused) trunkOpen = false;   // екран подорожі (і багажник) закрито — наступного разу ☰ без багажника
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
  if (probe.nearObject !== nearSpot) { nearSpot = probe.nearObject; storyChanged(); }   // GAME-175: підпис дії біля об'єкта в HUD
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
