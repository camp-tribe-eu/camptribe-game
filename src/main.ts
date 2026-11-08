// Точка входу браузера: сцена світу (GAME-24) + дотикові елементи (GAME-69, джойстик GAME-91).
import Phaser from 'phaser';
import { render, h } from 'preact';
import { Shell } from './ui/Shell';
import { t } from './i18n';
import { currentSettings, loadSettings, onSettingsSaved } from './platform/settings';
import { INTRO_BEAT_QUESTS } from './content/intro-story';
import { HINT_FLASH_MS, HintIdle, type HintMode } from './content/hint-idle';
import { buildLabel } from './core/build-info';
import { newInput } from './view/world/actions';
import { GAME_DEFS } from './content/slice-defs';
import { dayOf } from './core/weather';
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
import { TENT_PROBE_IDLE } from './view/world/tent';
import { WOOD_PROBE_IDLE } from './view/world/wood';
import { CRATE_PROBE_IDLE } from './view/world/crate';
import { REPAIR_FLAG, REPAIR_SPOT } from './content/repair';
import { traceOfSpot } from './content/traces';
import { FIRE_PROBE_IDLE } from './view/world/fire';
import { GRILL_PROBE_IDLE } from './view/world/grill';
import { FISH_FACTS, fishChoiceMove, fishEvening } from './content/fish-fork';
import { FIREPLACE_SCENE } from './content/fireplace';
import { FISH_PROBE_IDLE } from './view/world/fishing';
import { LIVE_PROBE_IDLE } from './view/world/fx-live-layer';
import { SWIM_PROBE_IDLE } from './view/world/swim-rig';
import { CAMP_PROBE_IDLE } from './view/world/camp-alive-rig';
import { mountTouchControls, setActionTarget } from './view/world/touch';
import { frameSize, zoomSteps } from './view/world/frame';
import { CHOICE_CANCEL_ID, storyOffer, type StoryView } from './view/story-offer';
import { testSwitches } from './view/test-switches';
import { addFrameLag, bootDelay, onFirstFrame } from './view/frame-lag';
import { installRenderGate } from './view/render-gate';
import type { StoryOffer } from './ui/story-types';
import { uiSounds } from './audio/ui-sounds';
import { ambient, ambientMix, isIntroOpen, music } from './audio';
import { sfxPlayer } from './audio/sfx';
import { nightSounds } from './audio/night-sounds';
import { fireplaceDue, liveSpot, spotMove, storyMoves } from './content/director';
import { paintRoom } from './view/intro-room';
import { paintColdOpen } from './view/cold-open';
import { portraitFor } from './view/portraits';
import { headCrop, sheetOf } from './view/world/portrait-art';
import { miaSpots, requestMarker, requestTarget, requestsDone } from './content/requests';
import { errandMove, plannedErrands } from './content/errands';
import { FORAGE_ITEMS, canForage, heartDue, reactionFor } from './content/friendship';
import type { GiftReaction } from './core/friendship';
import { forageLeft, forageSpent } from './core/forage';
import { agendaOf, minimapTargets, onboarding, type MiniFrame } from './content/agenda';
import type { MapKey } from './content/map-first';
import { taskGate } from './core/wave';
import { MAP_SPOTS, departBlock, isBulky, isMapFirstSpot, mapKeyFor, moveKey, needsLeft, nextTarget, npcLive, resolveSpot, spotLook, unpackMoves } from './content/map-first';
import { carriedOf, takeFlag } from './core/packing';
import type { GameState } from './core/state';
import { progressOf, titleOf } from './core/progress';
import { grantCentsMap, isEmptySum, rewardDelta, type CoreSnap, type RawRewardRow } from './ui/reward-sticker';
import contentEvents from '../content/events.json';
import { rankUps, SKILL_IDS, type HandAction } from './core/skills';
import type { SkillUp } from './ui/overlay-order';
import { openGate } from './view/open-gate';
import type { RewardEvent } from './ui/port';

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('#app is missing');

const probe: WorldProbe = { ready: false, map: null, reveal: false, gift: { count: 0, npc: null, reaction: null, emote: null, poseAge: -1, poseColumn: null, poseFrames: 0, sounds: [] }, playerX: 0, playerY: 0, heroBody: 0, view: { x: 0, y: 0, w: 0, h: 0, zoom: 1, mapW: 0, mapH: 0 }, nearObject: null, nearKind: null, commandsSent: 0, cameraScrollX: 0, cameraScrollY: 0, clockMinutes: 0, saveLoaded: false, cameraLerp: [0, 0], followers: [], markerIcons: {}, leisure: [], jobs: [],
  playerFrame: 0, playerDir: 'down', playerMoving: false, heroBreath: 0, heroRect: { x: 0, y: 0, w: 0, h: 0 }, playerDepth: 0, coveredTiles: 0, behindTiles: 0, canopy: { bands: 0, over: 0, minAlpha: 1, fadeBands: 0 }, light: { patches: 0, depth: 0, alpha: 0 }, lamps: { count: 0, on: false, alpha: 0, radius: 0 }, fps: 0, fpsWindows: 0, firstFrameMs: 0,
  residents: [], neighbours: [], visitors: [], bark: null, barkCount: 0, barkBy: null, npcMarks: {}, miaAt: [], tent: TENT_PROBE_IDLE, wood: WOOD_PROBE_IDLE, crate: CRATE_PROBE_IDLE, fire: FIRE_PROBE_IDLE, grill: GRILL_PROBE_IDLE, fish: FISH_PROBE_IDLE, live: LIVE_PROBE_IDLE, swim: SWIM_PROBE_IDLE, camp: CAMP_PROBE_IDLE,
  daylight: { on: false, visible: false, minuteOfDay: 0, darkness: 0, color: 0xffffff, glow: 0, heroLight: { radius: 0, alpha: 0 } },
  fx: { target: null, ring: 0, ringName: null, backpack: 0, guide: 'none', pops: 0, auto: 0, rewards: 0, rewardLast: '', headLabels: [], headIcons: [] } };
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
music.setEnabled(switches.music);   // GAME-207: у збірці e2e музика лише за ?music=1 — тести детерміновані, файли не вантажаться
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
// GAME-245: вміст сумки — НЕ окремий стан показу, а факти ядра (`f.take-*`): взята, ще не завантажена річ. Синхронізується з ядром при кожній зміні.
const syncBackpack = (): void => {
  const g = bridge.state.game;
  const pk = GAME_DEFS.packing;
  backpack.length = 0;
  if (pk && g.player) backpack.push(...carriedOf(g.flags, pk, g.player));
  if (backpack.length === 0) overflowShown = false;
};
// GAME-245: «Не влазить» уже показано (екран вибору відкрито; доки нічого не змінилось, авто не завантажує вдруге) і велика картка щойно взятої речі (мс, покадрово).
let overflowShown = false;
let cardItem: string | null = null;
let cardLeftMs = 0;
const CARD_MS = 1500;
// GAME-183: об'єкт, що питає «що саме?» (авто — куди їхати, сушарка, приймальня, крок з вибором) — його варіанти показує рамка вибору. Стан ПОКАЗУ.
let choiceSpot: string | null = null;
// GAME-178: спроба рушити, коли авто не готове (бракує речей / рюкзак повний): HUD пояснює причину, поки гравець не відійде від об'єкта. Стан ПОКАЗУ (без таймера).
let departNote = false;
const viewOf = (): StoryView => ({ mapFirst: !switches.panelActs, trunk: trunkOpen, near: nearSpot, backpack, choice: choiceSpot, departNote, overflow: overflowShown, card: cardItem });
/** Об'єкти табору (GAME-183) живуть лише в мапі-першій грі: збірка e2e без ?mapFirst=1 (старі e2e) бачить табір, як до них — кнопки ☰, а не об'єкти. */
const campOnly = (name: string): boolean => switches.panelActs === true && (MAP_SPOTS.camp as readonly string[]).includes(name);
// GAME-170 зріз 2 · режисер: перед кожним оновленням екрана — ходи СЮЖЕТУ (StartWave на етапі хвилі). Ядро — сторож законності;
// режисер шле лише те, що ядро прийме, і рівно раз (після прийняття pendingWave порожній; відмова видна в processed).
// Завантаження збереження на CH1-D2-CAMP-001 без хвилі стартує її тут же, строки — від годинника завантаження (прийнято, див. director.ts).
const direct = (): void => { for (const m of storyMoves(bridge.state, GAME_DEFS)) bridge.send(m); };
const openListeners = new Set<() => void>();
// GAME-179: розмова з NPC на мапі відкривається рамкою розмови, а не екраном подорожі: свої слухачі, і `mapTalk` глушить автовідкриття панелі.
const talkListeners = new Set<() => void>();
let mapTalk = false;
// GAME-175: розмова, яку почала не дія гравця на мапі, а гра (подія в дорозі після виїзду), мусить бути видна: об'єкти мапи під час розмови мовчать, тож без
// екрана подорожі гравець завис би. Розмова щойно з'явилась (раніше її не було) — екран відкривається сам.
let hadDialogue = false;
let unpackedOnce = false;
// GAME-181 · нагороди прогресії. Порівнюємо XP/ОМ ядра з тим, що вже бачили: зросло — подія для UI (банер звання) і підпис над героєм («+15 XP +10 ОМ», його забирає сцена).
// Базу ставить rebaseRewards: старт із сейву, нова гра й імпорт коду нагородою не вважаються (інакше завантаження святкувало б усе заробіте раніше). Це стан ПОКАЗУ, не гри.
let seenXp = 0;
let seenOm = 0;
let rewardsReady = false;
let pendingPop: { xp: number; om: number } | null = null;
const rewardListeners = new Set<(r: RewardEvent) => void>();
// GAME-247: до XP/ОМ додано XP навичок і нові grantId (гроші) — з них модель reward-sticker.ts виводить наклейку в кутку HUD.
const GRANT_CENTS = grantCentsMap(GAME_DEFS, contentEvents as readonly RawRewardRow[]);   // GAME-277: усі джерела грошей нагороди в одній чистій функції (сторож — reward-sticker.test.ts)
const snapOf = (): CoreSnap => { const g = bridge.state.game; const p = progressOf(g); return { xp: p.xp, om: p.om, skills: g.skills, grants: g.grants }; };
let seenSnap: CoreSnap = { xp: 0, om: 0, skills: {}, grants: [] };
const rebaseRewards = (): void => { const p = progressOf(bridge.state.game); seenXp = p.xp; seenOm = p.om; seenSnap = snapOf(); rewardsReady = true; pendingPop = null; };
const syncRewards = (): void => {
  if (!rewardsReady) return;
  const p = progressOf(bridge.state.game);
  if (p.xp < seenXp || p.om < seenOm) { rebaseRewards(); return; }   // стан замінено (нова гра, інший сейв) — тиха нова база
  const xp = p.xp - seenXp;
  const om = p.om - seenOm;
  const now = snapOf();
  const sum = rewardDelta(seenSnap, now, GRANT_CENTS);
  seenSnap = now;
  if (xp === 0 && om === 0 && isEmptySum(sum)) return;
  const up = titleOf(p.xp) > titleOf(seenXp) ? titleOf(p.xp) : null;
  seenXp = p.xp; seenOm = p.om;
  if (xp !== 0 || om !== 0) pendingPop = { xp: (pendingPop?.xp ?? 0) + xp, om: (pendingPop?.om ?? 0) + om };
  for (const l of rewardListeners) l({ xp, om, title: up, cents: sum.cents, skills: sum.skills });
};
// GAME-229 · нові ранги навичок для екрана «Що відкрилось». Той самий принцип, що в нагород: стан ПОКАЗУ. База — зараз у ядрі; завантаження, нова гра, імпорт коду
// і поява персонажа (старт професії одразу дає ранги) рангом не вважаються. Екран показує Shell наприкінці дня, а не посеред гри.
let seenSkills: Readonly<Record<string, number>> = {};
let ranksReady = false;
let hadPlayer = false;
const skillListeners = new Set<(ups: readonly SkillUp[]) => void>();
const rebaseRanks = (): void => { seenSkills = bridge.state.game.skills; hadPlayer = bridge.state.game.player !== null; ranksReady = true; };
const syncRanks = (): void => {
  if (!ranksReady) return;
  const g = bridge.state.game;
  if (!hadPlayer || g.player === null) { rebaseRanks(); return; }
  const ups = rankUps(seenSkills, g.skills);
  seenSkills = g.skills;
  if (ups.length > 0) for (const l of skillListeners) l(ups.map((u) => ({ ...u, order: SKILL_IDS.indexOf(u.skill) })));
};
/** GAME-229: дія руками закінчена — ядро записує практику (вона сама зменшує віддачу з повтором); відмову (немає персонажа) мовчки ігноруємо. */
const handPractise = (action: HandAction): void => { bridge.send({ type: 'Practise', action }); storyChanged(); };
const takeReward = (): string | null => {
  const r = pendingPop;
  pendingPop = null;
  if (!r) return null;
  const lang = langOverride ?? loadSettings().language;
  return [r.xp > 0 ? `+${r.xp} ${t(lang, 'ui.xp')}` : '', r.om > 0 ? `+${r.om} ${t(lang, 'ui.om')}` : ''].filter(Boolean).join(' ');
};
let pendingFrame = false;
const fireFrame = (): void => { for (const l of switches.panelActs ? openListeners : talkListeners) l(); };
const storyChanged = (): void => {
  syncBackpack();
  syncRewards();
  syncRanks();
  // GAME-175: мапа-перша гра — спакований «за порадою» набір розкладається, коли гравець удома; речі він переносить ногами (раз за гру).
  if (!switches.panelActs && !unpackedOnce) {
    const moves = unpackMoves(bridge.state, GAME_DEFS);
    if (moves.length > 0) { unpackedOnce = true; for (const m of moves) bridge.send(m); }
  }
  const talking = bridge.state.game.dialogue !== null;
  // Подія в дорозі (GAME-183): у мапі-першій грі — рамка розмови з портретом оповідача (як сцена біля вогнища), а не екран ☰.
  // GAME-260: рамка не раніше, ніж сцена показала мапу дороги — решту доведе mapEntered.
  // GAME-275: справжній шлях QA — виїзд із рамки вибору «Куди їдемо?»: сцена ВЖЕ на паузі, ядро кидає подію в тому ж кроці, що й Visit, і подія
  // заступала рамку вибору на старій мапі. Тому, поки pendingFrame, story() ховає розмову (рішення — ДО слухачів, інакше Shell уже взяв би її в offer):
  // Shell закриває рамку й знімає паузу, сцена перемикає мапу, mapEntered відкриває рамку події вже на дорозі.
  let openNow = false;
  if (talking && !hadDialogue && !mapTalk) {
    if (openGate({ sceneMap: probe.map, wantMap: worldHooks.mapKey() }) === 'wait') pendingFrame = true; else openNow = true;
  }
  if (!talking) pendingFrame = false;
  hadDialogue = talking;
  direct();
  for (const l of storyListeners) l();
  if (openNow) fireFrame();
};
/** GAME-261: з ким уже говорили сьогодні (день|npc); не в сейві — після перезапуску «…» повертається один раз, це лише підказка. */
const chatted = new Set<string>();
/** Розмова з NPC на мапі: команда в ядро (ядро саме відмовить, якщо гравець не тут), і екран подорожі —
 *  там видно розмову або те, чого бракує (немає персонажа, не та локація). */
const talkOnMap = (npcId: string): void => {
  mapTalk = true;
  try {
    bridge.send({ type: 'Talk', npcId });
    if (bridge.state.game.dialogue !== null) chatted.add(`${dayOf(bridge.state.clock)}|${npcId}`);   // GAME-261: сьогодні з ним уже говорили — «…» гасне
    storyChanged();
  } finally { mapTalk = false; }
  for (const l of talkListeners) l();   // рамка розмови, якщо ядро прийняло розмову; інакше UI сам відкриє екран подорожі
};
/** Дотик до об'єкта мапи: режисер каже, що це зараз (справа хвилі → CompleteTask; вогнище на етапі вечора → StartScene, і екран подорожі
 *  відкривається з репліками; інакше Interact). ?breakSpot=<назва> (лише збірка e2e) робить об'єкт німим — негативний контроль. */
let grilledCharred = false;
/** GAME-195: вибір на озері пишеться фактом ядра (сцена-однорядник у рамці розмови), а не лише лічильником вигляду. */
const onFish = (keep: boolean): void => {
  const m = fishChoiceMove(keep, bridge.state.game.flags);
  if (!m) return;
  mapTalk = true;
  try { bridge.send(m); storyChanged(); } finally { mapTalk = false; }
  for (const l of switches.panelActs ? openListeners : talkListeners) l();
};
let giftFx: { npc: string; reaction: GiftReaction } | null = null;
let heartFor: object | null = null;
let heartMin = -1;
const actOnMap = (name: string): void => {
  if (switches.breakSpot.includes(name)) return;
  // GAME-175: об'єкти дня 1 удома (крок, річ, полиця, авто, багажник) — ті самі команди ядра, що були кнопками панелі (src/content/map-first.ts).
  if (isMapFirstSpot(name)) {
    // GAME-178: E/тап на авто не їде, поки рюкзак не порожній і потрібне не в багажнику (те саме, що кільце); локація лишається, HUD каже чому.
    if (name === 'obj.vehicle' && !switches.panelActs && departBlock(bridge.state, GAME_DEFS, backpack)) {
      departNote = true;
      storyChanged();
      return;
    }
    const r = resolveSpot(bridge.state, GAME_DEFS, name);
    if (!r) return;
    // GAME-183: вибір із кількох дій (куди їхати, що сушити, як завершити крок) — рамка вибору, команда піде з її кнопки.
    if (r.options || r.confirm) { choiceSpot = name; storyChanged(); for (const l of talkListeners) l(); return; }
    const first = r.moves[0];
    // GAME-245: узяти річ удома — одна команда TakeItem; річ зникає з місця, герой показує велику картку (назва + репліка) ~1,5 с.
    if (first?.type === 'TakeItem') {
      bridge.send(first);
      if (bridge.state.game.flags.includes(takeFlag(first.itemId))) { cardItem = first.itemId; cardLeftMs = CARD_MS; overflowShown = false; }
      storyChanged();
      return;
    }
    for (const move of r.moves) bridge.send(move);
    if (r.ui === 'trunk') trunkOpen = true;
    storyChanged();
    if (r.ui === 'trunk') for (const l of openListeners) l();
    return;
  }
  let m = spotMove(bridge.state, name);
  if (!m) return;
  // GAME-195: рибка на вогнищі трішки підгоріла — факт сцени вечора (репліка інша, покарання нема).
  if (m.type === 'StartScene' && m.sceneId === FIREPLACE_SCENE && grilledCharred) m = { ...m, facts: [...(m.facts ?? []), FISH_FACTS.charred] };
  if (m.type === 'StartScene') grilledCharred = false;
  // Сцена біля вогнища: у мапі-першій грі — рамка розмови (як розмова з NPC; mapTalk глушить автовідкриття ☰), а не екран ☰.
  const asTalk = m.type === 'StartScene' && !switches.panelActs;
  if (asTalk) mapTalk = true;
  try { bridge.send(m); storyChanged(); } finally { mapTalk = false; }
  if (m.type === 'StartScene') for (const l of asTalk ? talkListeners : openListeners) l();
};
/**
 * Завантаження авто (GAME-245): ОДНА дія — усе взяте лягає в багажник за пріоритетом. Не влізло — один екран «Не влазить: що лишимо вдома?» (панель, кнопки LeaveItem);
 * доки вибору не зроблено, авто не завантажує вдруге (auto), а E/тап (manual) відкриває екран знову.
 */
const unloadOne = (manual = false): 'ok' | 'full' | 'none' => {
  syncBackpack();
  if (backpack.length === 0) return 'none';
  if (overflowShown) {
    if (!manual || trunkOpen) return 'none';
    trunkOpen = true; storyChanged(); for (const l of openListeners) l();
    return 'full';
  }
  bridge.send({ type: 'LoadCar' });
  syncBackpack();
  // Усе влізло: завантажили — і одразу питання «Куди їдемо?» (тим самим дотиком), без другого заходу до авто.
  if (backpack.length === 0) { storyChanged(); if (!switches.panelActs) actOnMap('obj.vehicle'); return 'ok'; }
  overflowShown = true; trunkOpen = true;
  storyChanged();
  for (const l of openListeners) l();
  return 'full';
};
const saves = createSaveSession(bridge, saveBackend, { story: STORY, stickers: GAME_DEFS.stickers ?? {}, ...(GAME_DEFS.life ? { life: GAME_DEFS.life } : {}), contentRev: STORY_REV, viable: (g) => saveViable(g, GAME_DEFS) });
// Тестовий хук Playwright: лише ЧИТАННЯ — знімок стану копією, місток назовні не віддається
// (рецензія PR #13: раніше скрипт сторінки міг надіслати команду в ядро).
(window as unknown as { __game: { probe: WorldProbe; read: () => unknown; sounds: () => readonly string[]; ambient: () => Readonly<Record<string, number>>; music: () => Readonly<Record<string, number>>; night: () => { level: number; cricket: number; owl: number }; frames: () => number; rewardTitle?: (title: number) => void; storyPing?: () => void; rewardSum?: (r: { cents: number; xp: number; om: number; skills: Record<string, number> }) => void } }).__game = {
  probe,
  sounds: () => [...uiSounds.played, ...sfxPlayer.played], ambient: () => ambient.levels(), music: () => music.levels(), night: () => ({ level: nightSounds.level, ...nightSounds.counts }),   // GAME-40: що мікшер прийняв до відтворення (лише читання)
  read: () => JSON.parse(JSON.stringify(bridge.state)) as unknown,
  // GAME-260 (лише збірка e2e): показати банер звання без заробітку XP — подія нагороди для UI; стан ядра не змінюється.
  ...(import.meta.env.MODE === 'e2e' ? { storyPing: () => { storyChanged(); }, rewardTitle: (title: number) => { for (const l of rewardListeners) l({ xp: 0, om: 0, title, cents: 0, skills: {} }); }, rewardSum: (r: { cents: number; xp: number; om: number; skills: Record<string, number> }) => { for (const l of rewardListeners) l({ xp: r.xp, om: r.om, title: null, cents: r.cents, skills: r.skills }); } } : {}),
  frames: () => renderGate.rendered(),   // GAME-268: скільки кадрів Phaser справді намалював (лише читання)
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
let targetMin = -1;   // справа хвилі спізнюється за годинником, а не за станом ядра: ціль перераховуємо й на новій хвилині
let targetSpot: string | null = null;
let needsFor: GameState | null = null;
let needsPack = -1;
let needsMemo = { small: 0, bulky: 0 };
// GAME-192: підказка «Далі» — лише коли застряг. Збірка e2e без ?hintIdleMs= тримає «завжди» (старі e2e читають стрілку).
const hintIdle = switches.hintIdleMs !== undefined ? new HintIdle(switches.hintIdleMs, Math.min(HINT_FLASH_MS, Math.round(switches.hintIdleMs / 4))) : new HintIdle();
const hintLegacy = import.meta.env.MODE === 'e2e' && switches.hintIdleMs === undefined;
let hintMode: HintMode = loadSettings().hintMode;
let hintLast = false;
const applyHintMode = (): void => { hintIdle.mode = hintLegacy ? 'always' : hintMode; };
applyHintMode();
let errandsFor: GameState | null = null;
let errandsMin = -1;
let errandsMemo: ReturnType<typeof plannedErrands> = [];
let guideFor: unknown = null;
let guideOn = true;
let spotsFor: GameState | null = null;
let spotsMap: MapKey | '' = '';
let spotsMemo: readonly string[] = [];
let miniFrame: MiniFrame | null = null;
const miniListeners = new Set<(f: MiniFrame) => void>();
const worldHooks: WorldHooks = {
  hintTick: (dt) => {
    if (bridge.state.game.dialogue !== null) hintIdle.poke();
    const v = hintIdle.tick(dt, worldHooks.target(), bridge.state.game);
    if (v !== hintLast) { hintLast = v; for (const l of storyListeners) l(); }
    return v;
  },
  hintPoke: () => hintIdle.poke(),
  // GAME-243: стрілка — лише навчання (день 1, перші пункти нотатника); у збірці e2e без ?mapFirst=1 — як раніше. Раз на стан ядра, а не на кадр.
  guide: () => {
    if (switches.panelActs) return true;
    if (guideFor !== bridge.state) { guideFor = bridge.state; guideOn = onboarding(bridge.state); }
    return guideOn;
  },
  agendaSpots: () => {
    if (switches.panelActs) return [];
    if (spotsFor !== bridge.state.game || spotsMap !== worldHooks.mapKey()) { spotsFor = bridge.state.game; spotsMap = worldHooks.mapKey(); spotsMemo = minimapTargets(agendaOf(bridge.state, GAME_DEFS), spotsMap); }
    return spotsMemo;
  },
  minimap: (f) => { miniFrame = f; for (const l of miniListeners) l(f); },
  onNpc: talkOnMap,
  // GAME-230: реакція на щойно вручений подарунок (одноразово) і гачок сцени серця (раз на стан ядра й хвилину, а не на кадр).
  takeGift: () => { const g = giftFx; giftFx = null; return g; },
  heart: () => {
    const g = bridge.state.game;
    const min = bridge.state.clock.minutes;
    if (heartFor === g && heartMin === min) return;
    heartFor = g; heartMin = min;
    const npc = heartDue(g, min);
    if (npc === null || switches.hideUi.length > 0) return;
    mapTalk = true;
    try { bridge.send({ type: 'HeartEvent', npcId: npc }); storyChanged(); } finally { mapTalk = false; }
    for (const l of talkListeners) l();
  },
  canForage: (kind, sourceId) => canForage(bridge.state.game.inventory, kind === 'cone' ? FORAGE_ITEMS.cone : FORAGE_ITEMS.berry) && forageLeft(bridge.state.game.friend, sourceId, dayOf(bridge.state.clock)) > 0,
  onForage: (kind, sourceId) => { bridge.send({ type: 'Forage', itemId: kind === 'cone' ? FORAGE_ITEMS.cone : FORAGE_ITEMS.berry, sourceId }); },
  sourceUsed: (sourceId, day) => forageSpent(bridge.state.game.friend, sourceId, day),
  // GAME-179: з ким можна говорити саме зараз — те саме, що прийме ядро (NPC тут, відкритий, розмови нема); «!» — гачок прохань GAME-180.
  talk: (id) => (npcLive(bridge.state.game, GAME_DEFS, id) ? { request: requestMarker(bridge.state.game, id), line: !chatted.has(`${dayOf(bridge.state.clock)}|${id}`) } : null),
  onObject: actOnMap,
  onHand: handPractise,
  fireDue: () => fireplaceDue(bridge.state),
  grillDue: () => fireplaceDue(bridge.state) && fishEvening(bridge.state.game.flags) === 'kept',
  onGrilled: (charred) => { grilledCharred = charred; },
  onFish,
  isLive: (name) => !campOnly(name) && liveSpot(bridge.state, name, GAME_DEFS),
  frame: (dtMs) => { if (cardItem !== null && (cardLeftMs -= dtMs) <= 0) { cardItem = null; storyChanged(); } },
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
  requestsDone: () => requestsDone(bridge.state.game),
  pets: () => miaSpots(bridge.state.game),
  target: () => {
    if (targetFor !== bridge.state.game || targetPack !== backpack.length || targetMin !== bridge.state.clock.minutes) { targetFor = bridge.state.game; targetPack = backpack.length; targetMin = bridge.state.clock.minutes; // GAME-183: прохання в роботі (вибір гравця) — перше; далі крок сюжету. Збірка e2e без ?mapFirst=1 табір веде як раніше (лише прохання): ☰ там ще дає кроки.
      const at = bridge.state.game.player?.locationId;
      targetSpot = requestTarget(bridge.state.game) ?? (switches.panelActs && (at === 'loc.camp.lake' || at === 'loc.road') ? null : nextTarget(bridge.state, GAME_DEFS, backpack)?.spot ?? null);
    }
    return targetSpot;
  },
  // Збірка e2e без ?mapFirst=1 — як до GAME-175: завжди табір (старі e2e ходять по ньому й перевіряють не прохід дня 1).
  mapEntered: () => { if (pendingFrame) { pendingFrame = false; fireFrame(); } },
  mapKey: () => switches.map ?? (switches.panelActs ? 'camp' : mapKeyFor(bridge.state.game.player?.locationId)),
  transport: () => bridge.state.game.player?.transportId ?? null,
  takeReward,
  spotDone: (name) => { const f = bridge.state.game.flags; const t = traceOfSpot(name); return t ? f.includes(t.flag) : name === REPAIR_SPOT && f.includes(REPAIR_FLAG); },
  // GAME-202: доручення — факти ядра (f.errand-*), лише для живих справ; виконавець попрацював — та сама команда CompleteTask, але від помічника.
  errands: () => {
    // Раз на стан ядра й хвилину годинника (строк справи), а не на кадр.
    if (errandsFor !== bridge.state.game || errandsMin !== bridge.state.clock.minutes) { errandsFor = bridge.state.game; errandsMin = bridge.state.clock.minutes; errandsMemo = plannedErrands(bridge.state.game.flags, (spot) => liveSpot(bridge.state, spot, GAME_DEFS)); }
    return errandsMemo;
  },
  onErrand: (task) => {
    const e = plannedErrands(bridge.state.game.flags, (spot) => liveSpot(bridge.state, spot, GAME_DEFS)).find((x) => x.task === task);
    if (!e) return true;
    bridge.send(errandMove(e));
    storyChanged();
    // Рецензія PR #141: ядро могло відхилити (гонка на хвилині) — тоді справа ще жива, і сцена спробує знову, а не «працює» вічно.
    return !plannedErrands(bridge.state.game.flags, (spot) => liveSpot(bridge.state, spot, GAME_DEFS)).some((x) => x.task === task);
  },
  tentAlone: () => switches.tentAlone === true,
  taskGate: (name) => { const g = name.startsWith('task.') ? taskGate(bridge.state.game, GAME_DEFS.waves, name.slice(5)) : null; return g === 'objective' ? 'tent.needElise' : g === 'task' ? 'tent.needSpot' : null; },
  perfectHits: () => switches.perfectHits === true,
  // GAME-216: заставка — лише на першому приїзді в табір (ST-005 живий, з Елізою ще не говорили); ?noReveal=1 — негативний контроль e2e.
  campReveal: () => switches.noReveal !== true && bridge.state.game.quests['ST-005']?.status === 'active' && !(bridge.state.game.quests['ST-005']?.done ?? []).includes('meet-elise'),
};
/** GAME-179: запасні портрети — обрізки спрайтів, зроблені раз на лист. */
const spriteCrops = new Map<string, string>();
/** GAME-278: дотиковий пристрій (pointer: coarse) — планшет до 820 px заввишки теж «телефон». */
const coarse = (): boolean => { try { return matchMedia('(pointer: coarse)').matches; } catch { return false; } };
const fieldFrame = (): ReturnType<typeof frameSize> => frameSize(stage.clientWidth, stage.clientHeight, coarse(), currentSettings().zoom);
const frame0 = fieldFrame();

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
  // GAME-238: без згладження дельти кадру. Phaser 120 кадрів після старту (і поза фокусом) ріже дельту до 16,7 мс, а понад 200 мс
  // підміняє останньою «нормальною»; фізика Arcade (ходьба героя) рухалась саме за нею — при 8 fps герой ішов ≈ 17 px/с замість 128,
  // поки годинник (GAME-97, сира дельта) ішов у реальному часі. Тепер уся сцена — тверда сира дельта, як годинник; довгий кадр фізика
  // проходить кількома кроками по 1/60 с (fixedStep), тож крізь стіну не проскочить. Сторож: tests/e2e/game-97.spec.ts «при ≈ 8 fps герой іде…».
  fps: { smoothStep: false },
  backgroundColor: '#000000',
  // GAME-96 (смак власника 25.10): масштаб рахуємо самі (frameSize: цілий zoom, кадр = ⌈поле / zoom⌉), Phaser лише множить —
  // режим NONE + zoom. Полотно стоїть у лівому верхньому куті поля (GAME-89 №4: по вертикалі не центруємо — мапа під HUD) і покриває
  // поле по ширині: вбік і на десктопі смуг з боків немає; зайве (< zoom px) ховає overflow поля. FIT із кадром 640×352 давав смуги.
  scale: { mode: Phaser.Scale.NONE, autoCenter: Phaser.Scale.NO_CENTER, zoom: frame0.zoom },
  physics: { default: 'arcade', arcade: { debug: false } },
  scene: [new WorldScene(bridge, input, probe, worldArt, worldHooks, !switches.noDaylight, (key) => t(langOverride ?? loadSettings().language, key))],
});
// GAME-268: шлюз малювання — світ під повним екраном не малюється.
const renderGate = installRenderGate(game);
// ?frameLagMs — лише збірка e2e (GAME-97): штучно довгий кадр.
if (switches.frameLagMs) addFrameLag(game, switches.frameLagMs);
// GAME-38: перший кадр від початку навігації → probe.firstFrameMs (бюджет 1,5 с, tests/e2e/game-38.spec.ts).
onFirstFrame(game, (ms) => { probe.firstFrameMs = ms; });

// Поле змінило розмір (поворот телефону, смуга HUD, текст 200 %) — кадр підлаштовується під його форму.
const fieldListeners = new Set<() => void>();
const applyFrame = (): void => {
  const f = fieldFrame();
  if (f.zoom !== game.scale.zoom) game.scale.setZoom(f.zoom);
  if (f.width !== game.scale.gameSize.width || f.height !== game.scale.gameSize.height) game.scale.resize(f.width, f.height);
  // Phaser (NONE) пише style лише коли zoom ≠ 1 або zoom щойно змінився: при поверненні до zoom 1 лишався б старий розмір. Ставимо самі, завжди.
  const canvas = game.canvas;
  canvas.style.width = `${f.width * f.zoom}px`;
  canvas.style.height = `${f.height * f.zoom}px`;
  renderGate.refresh();   // GAME-268: полотно стерто зміною розміру — один кадр, навіть коли світ закрито
  game.scale.refresh();   // межі полотна й displayScale для вводу — з нового style
  for (const fn of fieldListeners) fn();   // GAME-279: меню з кроками масштабу перемальовується під нове поле
};
new ResizeObserver(applyFrame).observe(stage);
onSettingsSaved(() => applyFrame());   // GAME-278: «Масштаб» у налаштуваннях — застосовується одразу

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
  intro: switches.intro,
  levelUps: switches.levelUps,
  credits,
  port: {
    save: () => saves.save(),
    newGame: async () => {
      backpack.length = 0;
      pendingFrame = false;   // GAME-275: розмова, схована до mapEntered, не переживає нову гру (рецензія #204)
      chatted.clear();   // GAME-261: «…» нової гри не гасне від розмов попередньої (рецензія #197)
      unpackedOnce = false;
      const ok = await saves.newGame();
      rebaseRewards();
      rebaseRanks();
      storyChanged();
      return ok;
    },
    hintShown: () => hintIdle.visible(),
    minimap: { frame: () => miniFrame, subscribe: (l) => { miniListeners.add(l); return () => { miniListeners.delete(l); }; } },
    setHintMode: (m) => { hintMode = m; applyHintMode(); },
    zoomSteps: () => zoomSteps(stage.clientWidth, stage.clientHeight, coarse()),
    zoomActive: () => game.scale.zoom,
    onFieldResize: (fn) => { fieldListeners.add(fn); return () => { fieldListeners.delete(fn); }; },
    exportCode: () => encodeRestoreCode(saves.exportJson()),
    staleCode: () => (saves.stale ? encodeRestoreCode(saves.stale) : Promise.resolve(null)),
    dismissStale: () => saves.dismissStale(),
    importCode: async (code: string) => {
      pendingFrame = false;   // GAME-275: після завантаження сцена може вже стояти на потрібній мапі — mapEntered не прийде (рецензія #204)
      backpack.length = 0;
      unpackedOnce = false;
      const r = await saves.adopt(await decodeRestoreCode(code));
      rebaseRewards();
      rebaseRanks();
      storyChanged();
      return r;
    },
    loaded: () => probe.saveLoaded,
    story: () => { const o = shown(storyOffer(bridge.state, GAME_DEFS, viewOf()).offer); return pendingFrame ? { ...o, dialogue: null } : o; },   // GAME-275: розмова схована до mapEntered
    act(id: string) {
      if (id === CHOICE_CANCEL_ID) { choiceSpot = null; storyChanged(); return; }
      const intent = storyOffer(bridge.state, GAME_DEFS, viewOf()).intents.get(id);
      if (!intent) return;
      // Підтверджена поїздка авто — увесь ланцюг ходів (напр. завершити крок + виїхати), а не лише останній.
      const trip = choiceSpot !== null ? resolveSpot(bridge.state, GAME_DEFS, choiceSpot) : null;
      const last = trip?.moves.at(-1);
      const seq = trip?.confirm && last !== undefined && moveKey(last) === moveKey(intent) ? trip.moves : [intent];
      choiceSpot = null;
      const before = bridge.state.game.friend?.gift;
      for (const m of seq) bridge.send(m);
      // GAME-230: подарунок прийнято ядром (день подарунка змінився) — показати реакцію; відмова нічого не показує.
      if (intent.type === 'GiveGift' && bridge.state.game.friend?.gift !== before && bridge.state.game.friend?.gift[intent.npcId] !== undefined) giftFx = { npc: intent.npcId, reaction: reactionFor(intent.npcId, intent.itemId) };
      storyChanged();
    },
    onStory(listener: () => void) {
      storyListeners.add(listener);
      return () => { storyListeners.delete(listener); };
    },
    onSkillUp(listener: (ups: readonly SkillUp[]) => void) {
      skillListeners.add(listener);
      return () => { skillListeners.delete(listener); };
    },
    onReward(listener: (r: RewardEvent) => void) {
      rewardListeners.add(listener);
      return () => { rewardListeners.delete(listener); };
    },
    onTalk(listener: () => void) {
      talkListeners.add(listener);
      return () => { talkListeners.delete(listener); };
    },
    // GAME-257: вступ уже показав лист, Атлас і план — відповідні кроки Прологу закриваються тут тими самими командами CompleteQuest (нагороди й прапорці — з ядра).
    introBeat(beat) {
      let any = false;
      for (const q of INTRO_BEAT_QUESTS[beat]) {
        if (bridge.state.game.quests[q]?.status !== 'active') continue;
        bridge.send({ type: 'CompleteQuest', questId: q });
        any = true;
      }
      if (any) storyChanged();
    },
    introRoom: paintRoom,
    introSolo: () => switches.soloHero === true,
    coldOpenScene: paintColdOpen,
    // GAME-216: кіно перед вступом — раз на нову гру; при завантаженні лише коли жодного сейву не прочитано (існуючий сейв кіно не показує).
    coldOpen: (reason) => switches.coldOpen && (reason === 'new' || !saves.loadedSave),
    episodeFlags: () => bridge.state.game.flags,
    episodeNow: () => switches.episode === true,
    portrait(npcId: string | null, sprite = false) {
      if (switches.hideUi.includes('portrait')) return null;   // ?hideUi=portrait — лише збірка e2e: негативний контроль (game-179.spec)
      const p = portraitFor(npcId, sprite ? {} : undefined);
      if (!p) return null;
      if (p.kind === 'file') return { src: p.url, kind: 'file' as const };
      const hit = spriteCrops.get(p.sheet);
      if (hit) return { src: hit, kind: 'sprite' as const };
      const sheet = sheetOf(worldArt, p.sheet);
      if (!sheet) return null;
      const src = headCrop(sheet);
      spriteCrops.set(p.sheet, src);
      return { src, kind: 'sprite' as const };
    },
    onOpenStory(listener: () => void) {
      openListeners.add(listener);
      return () => { openListeners.delete(listener); };
    },
    setWorldCovered: (covered) => renderGate.setCovered(covered),
    setPaused(paused: boolean) {
      // Відпускання клавіші під час паузи сцена не бачить — скидаємо введення на межі паузи,
      // інакше клавіша «залипає» і персонаж іде сам (рецензія PR #13).
      input.held.clear();
      input.tapped.clear();
      if (!paused) { trunkOpen = false; choiceSpot = null; }   // екран подорожі (і багажник) закрито — наступного разу ☰ без багажника; рамка вибору (GAME-183) закрита
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
// GAME-194 (рецензія #124): поки сцена світу на паузі (меню, розмова, підсумок, вступ «Нової гри»), її update не йде — фон тікає звідси:
// «Вимкнути звук» у паузі доходить до петель одразу, а вступ після «Нової гри» вмикає дощ. Коли сцена йде — тікає вона сама (без подвійного кроку).
game.events.on(Phaser.Core.Events.STEP, (_t: number, delta: number) => {
  if (!game.scene.isPaused('world')) return;
  if (isIntroOpen()) ambient.setAmbient(ambientMix({ map: null, intro: true, nearLake: false, fireLit: false, nearFire: false, transport: null }));
  ambient.tick(delta);
  if (isIntroOpen()) music.setTrack('story');   // GAME-207: музика вступу під дощ; інакше лишається тема, яку задала сцена
  music.tick(delta);
});
game.events.on(Phaser.Core.Events.POST_STEP, () => {
  setActionTarget(pad, probe.nearKind);   // GAME-95: кнопка дії знає, що поруч (talk/fire/object) чи нічого (idle)
  if (probe.nearObject !== nearSpot) { nearSpot = probe.nearObject; departNote = false; storyChanged(); }   // GAME-175: підпис дії біля об'єкта в HUD
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
void saves.start().then(() => { if (seedSwitches.skipMinutes) bridge.load(step(bridge.state, { kind: 'advance', minutes: seedSwitches.skipMinutes })); probe.saveLoaded = true; rebaseRewards(); rebaseRanks(); storyChanged(); });
