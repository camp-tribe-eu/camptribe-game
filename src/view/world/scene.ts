// Сцена світу (GAME-24): рух, камера, колізії, взаємодія з об'єктом. Лише відображення:
// взаємодія надсилає команду в ядро через місток.
// GAME-32: мапа — maps/camp-lake.tmj під валідатором мап (npm run validate, --dir public/maps).
// Точку появи, тригери й NPC сцена бере з шару `objects` цієї мапи — тобто саме ті координати, для
// яких валідатор довів досяжність пішки (а не числа, вписані в код окремо від мапи).
// GAME-93: графіка LPC (OD-013) — тайли 32 px, персонаж із шарів (ходьба 9 кадрів × 4 напрямки), анімоване вогнище,
// 3/4-глибина: верхівки дерев і дах намету малюються над персонажем, коли той стоїть ПОЗАД об'єктом (див. `bands`).
import Phaser from 'phaser';
import { ambient, bindPhaser, isIntroOpen, ambientMix, music, musicFor } from '../../audio';
import { STEP_MS } from '../../core/clock';
import type { HandAction } from '../../core/skills';
import { KEY_BINDINGS, KEY_CODES, TAP_MAX_MOVE, TAP_MAX_MS, actionTarget, consumeFrame, createActionGate, moveVector, press, release, tapHitsSpot, type Action, type ActionTarget, type InputState } from './actions';
import type { Bridge } from './bridge';
import { PET_SHEETS, type WorldArt } from './art';
import { ACTIONS, ACTION_COLS, COLS, DIR_ROW, FRAME, frameIndex, type Action as HeroAction, type Dir } from './character';
import { FIRE_CORE, FIRE_GLOW, MAX_DARKNESS, ambientAt, glowAlpha, timeOfDay } from './daylight';
import { FOLLOW_SPEED_FACTOR, SPEED, centerOf, findPath, gridFromWalls, isSolid, restPoints, stepFollowers, stepTo, tileOf, type Grid, type Pt, type Tile } from './follow';
import { MAX_HELPERS } from '../../content/tent-pitch';
import type { MapKey } from '../../content/map-first';
import { ICON_SIZE, iconIndex, objectiveIcon } from '../../content/objective-icons';
import { playUi } from '../../audio/ui-sounds';
import { nightSounds } from '../../audio/night-sounds';
import { sfx } from '../../audio/sfx';
import { campSounds, playCamp } from '../../audio/camp-sounds';
import type { GiftReaction } from '../../core/friendship';
import { giftEmote, giftSound, nextPoseAge, poseColumn } from './gift-fx';
import { MapFx, type Needs } from './map-fx';
import { bandOverHero, nextCanopyAlpha } from './canopy';
import { findWindows, patchAlpha, patchQuads } from './light-patches';
import { LAMP_RADIUS, findLamps, lampAlpha, lampsOn } from './lamps';
import { FEEDBACK_S, RING_IDLE, isAutoSpot, pickNearest, ringMayTake, stepRing, vehicleReady, type Insets, type Ring } from './proximity';
import { IDLE_AFTER_S, LEISURE_BY_MAP, assignLeisure, leisureFromObjects, type LeisureSpot } from './leisure';
import { Neighbours, type NeighbourProbe } from './neighbours-rig';
import { BARK_RANGE, CAST, CAST_BY_MAP, RESIDENTS, buildTimeline, placeAt, residentGrid, type Timeline } from './ambient';
import type { Key } from '../../i18n';
import { GLYPHS, LOOK_S, idleBob, isEvening, lookAt, type Glyph } from './idle';
import { facingToward, markerFor, talkBeatsFishing, type NpcMarker } from '../npc-talk';
import { TentRig, type TentProbe } from './tent';
import { WoodRig, type WoodProbe } from './wood';
import { CampProps, OLD_CRATE_SPOT, type CrateProbe } from './crate';
import { crateWorld } from '../../content/crate-push';
import { REPAIR_SPOT } from '../../content/repair';
import { isPhotoSpot } from '../../content/photos';
import { FireRig, type FireProbe } from './fire';
import { GrillRig, type GrillProbe } from './grill';
import { FISH_SPOT, FishRig, type FishProbe } from './fishing';
import { LiveFx, type LiveProbe } from './fx-live-layer';
import { groundKind, type Ground } from './fx-live';
import { SwimRig, type SwimProbe } from './swim-rig';
import { CampAlive, type CampProbe } from './camp-alive-rig';
import { dayOf, weatherOf } from '../../core/weather';
import { swimGridOf, swimRegionOf, withWater } from './swim';
import { REVEAL_BEATS, revealCenter, type RevealAnchors } from '../camp-reveal';
import { calmMotion } from '../../platform/motion';

export const TILE = 32;
const INTERACT_RANGE = TILE * 1.5;
/** Зона кільця наближення тісніша за зону E/тапа: пройти повз (≈ 0,5 с у зоні) не спрацьовує, треба стати. */
const AUTO_RANGE = TILE * 1.1;
/** Ноги персонажа — на 0,9 висоти кадру 64 px; тіло колізії (16×10) стоїть на ногах. y ноги = y спрайта = глибина сортування. */
const ORIGIN_Y = 0.9;
const BODY = { w: 16, h: 10 };
const WALK_FPS = 12;
const ACTION_FPS = 12;
/** Глибини: земля, декор і стіни (стовбури, намети) — завжди під персонажем; спрайти сортуються за y ніг; верхівки — смугами. */
const DEPTH = { ground: -300, decor: -200, walls: -100, always: 100_000 } as const;
const DIRS: readonly Dir[] = ['up', 'left', 'down', 'right'];
/** GAME-112: родина, що йде за героєм (герой — George). Порядок — порядок у ланцюжку. */
const FOLLOWERS = ['victoria', 'matthew'] as const;
/** GAME-179: слідувачі як співрозмовники — id NPC у порядку FOLLOWERS. */
const FOLLOWER_NPC = ['npc.victoria', 'npc.matthew'] as const;
/** Довгий кадр (згорнута вкладка) не телепортує слідувачів: крок обмежений 0,1 с. */
const MAX_FOLLOW_DT = 0.1;
/** GAME-202: скільки секунд виконавець доручення видимо працює біля цілі (анімація thrust по колу), перш ніж сцена віддасть ядру команду помічника. */
export const ERRAND_WORK_S = 2.4;
/** GAME-203: помічник тягне відтяжку, лише якщо він не далі стількох тайлів шляху від намету й не зайнятий дорученням; інакше тато ставить сам (довше). */
const HELPER_REACH_STEPS = 10;
const ACT_LOOP_FPS = 9;
/**
 * GAME-202/203: що зараз робить член родини замість іти у строю. `errand` — несе речі до об'єкта мапи (цілі справи), `tent` — тягне відтяжку намету.
 * Стан показу: ядро знає лише прапорець доручення і команду, яку сцена шле після роботи.
 */
type Job =
  | { readonly kind: 'errand'; readonly task: string; readonly spot: Pt; goal: Tile | null; workS: number; sent: boolean }
  | { readonly kind: 'tent'; readonly spot: Pt; goal: Tile | null };
/** GAME-172: репліка мешканця висить стільки мс, і той самий мешканець озветься знову не раніше ніж за стільки. */
const BARK_SHOW_MS = 4000;
const BARK_COOLDOWN_MS = 25_000;

/** Об'єкт мапи, з яким можна взаємодіяти: тригер (Interact у ядро) чи NPC (розмова). */
interface Spot { readonly name: string; readonly kind: 'trigger' | 'npc'; readonly x: number; readonly y: number }

/**
 * Що сцена просить у гри (main.ts), а не знає сама (GAME-175): куди ведуть дотики, що зараз «живе», яка мапа за локацією гравця.
 * Сцена лише показує те, що тут відповіли, — ядра й сюжету вона не бачить.
 */
export interface WorldHooks {
  /** Гравець заговорив із NPC на мапі (розмову веде рамка розмови, GAME-179). */
  onNpc(npcId: string): void;
  /** GAME-179: чи NPC зараз можна заговорити (ядро прийме розмову) і чи є в нього прохання («!»); null — мовчить, маркера нема. */
  talk(npcId: string): { readonly request: boolean } | null;
  /** Дотик до тригера: режисер вирішує, що це зараз. */
  onObject(name: string): void;
  /** Чи об'єкт зараз діє й видимий. */
  isLive(name: string): boolean;
  /** Вигляд об'єкта-речі: лежить удома чи вже в багажнику (маркер міняє колір). */
  look(name: string): 'room' | 'trunk';
  /** Об'єкт, на який вказує підказка «Далі: …» (маркер пульсує); null — жоден. */
  target(): string | null;
  /** Яку мапу показувати зараз (за локацією гравця; ?map= — лише в збірці e2e). */
  mapKey(): MapKey;
  /** Рюкзак героя: скільки дрібних речей несе (0 — рюкзака на спині немає). */
  backpack(): number;
  /** Одна річ з рюкзака — в багажник (та сама команда ядра); 'full' — не вмістилась, відкрито сітку. */
  unload(): 'ok' | 'full' | 'none';
  /** Чого ще бракує в дорогу — для бульбашки над авто. */
  needs(): Needs;
  /** GAME-180: скільки прохань сусідів уже здано (по зростанню сцена показує «+» над героєм). Немає — прохань у грі нема. */
  requestsDone?(): number;
  /** GAME-184: цілі прохань, біля яких зараз стоїть Мія (лише коли гравець їде з кішкою). Немає — кішки на мапі нема. */
  pets?(): readonly string[];
  /** GAME-190: вечір дня 2 готовий відкритись (вогнище треба розпалити руками); немає — вогнище одразу живе як раніше. */
  fireDue?(): boolean;
  /** GAME-195: рибка взята на вечерю — після розпалу вогнища її треба засмажити руками (перед вечірньою сценою). */
  grillDue?(): boolean;
  /** GAME-195: рибку засмажено (true — трішки підгоріла). */
  onGrilled?(charred: boolean): void;
  /** GAME-195: вибір на озері: true — узяти на вечерю, false — відпустити. */
  onFish?(keep: boolean): void;
  /** GAME-192: крок таймера підказки (мс кадру, ціль) → чи показувати стрілку «Далі»; немає — завжди. */
  hintTick?(dtMs: number): boolean;
  /** GAME-192: гравець діє (кнопка дії затиснута) — бездіяльність скидається. */
  hintPoke?(): void;
  /** Транспорт гравця (авто малюється спрайтом на подвір'ї, велосипед — маркером). */
  transport(): string | null;
  /** GAME-181: підпис нагороди («+15 XP +10 ОМ»), що ще не показана; забирає її (наступний виклик — null). GAME-229: над героєм цифр немає — підпис лише в пробі (`fx.rewardLast`), число видно в підсумку дня й у ☰. */
  takeReward(): string | null;
  /** GAME-229: дія руками закінчена (сокира, кілок, вудка, ремонт, розбивання, шишки/ягоди, смаження) — вона вчить навичку; немає — навичок нема. */
  onHand?(action: HandAction): void;
  /** GAME-209: об'єкт-знахідка чи справа вже зроблені (старий ящик відкрито, лавку полагоджено) — сцена малює їх відкритими/готовими. */
  spotDone?(name: string): boolean;
  /** GAME-202: кому що доручено (факти ядра f.errand-*, лише живі справи): член родини (ключ FOLLOWERS) → об'єкт мапи справи. Немає — доручень у грі нема. */
  errands?(): readonly { readonly member: string; readonly task: string; readonly spot: string }[];
  /** GAME-202: виконавець дійшов і попрацював — ядру команда помічника закрити справу (CompleteTask, actor helper). */
  /** true — ядро прийняло (справу закрито); false — відхилило: сцена почне роботу наново. */
  onErrand?(task: string): boolean;
  /** GAME-203 (лише збірка e2e, ?tentAlone=1): тато ставить намет сам, навіть коли родина поруч — шлях «без помічників». */
  tentAlone?(): boolean;
  /** GAME-216: чи зіграти заставку першого приїзду в табір (камера: герой → озеро → табір → герой, ≤ 10 с, будь-який дотик виходить). Немає — ніколи. */
  campReveal?(): boolean;
  /** GAME-230: подарунок щойно вручено — хто (id мешканця) і як відреагував; забирає його (наступний виклик — null). Реакція — лише вигляд і звук, очки веде ядро. */
  takeGift?(): { readonly npc: string; readonly reaction: GiftReaction } | null;
  /** GAME-230: щокадру в таборі — чи час для сцени серця; main її відкриває (HeartEvent), сцена нічого не вирішує. */
  heart?(): void;
  /** GAME-230: герой підняв шишку чи ягоду в таборі — main кладе її в інвентар (Forage), щоб її можна було подарувати. */
  onForage?(kind: 'cone' | 'berry'): void;
}

/** Хто з NPC якого листа ходьби має (лист — в art.ts); решта — як Еліза. */
const NPC_SHEET: Readonly<Record<string, string>> = { 'npc.george': 'player', 'npc.cashier': 'res-lotte' };
/** Де стоїть авто відносно точки посадки `obj.vehicle` (ноги авто = нижній центр спрайта): праворуч-вниз; його колізія — нижня смуга. */
const CAR_OFFSET = { x: 16, y: 80 };
const CAR_BLOCK = { w: 104, h: 30 };
/** Маркери: колір за родом об'єкта. */
const ICON_Y = -4;   // GAME-201: низ піктограми цілі над точкою об'єкта (ноги), світові px

/** Маркер цілі: графіка і вигляд, у якому вона намальована зараз (перемальовується, коли вигляд міняється). */
interface Marker { readonly g: Phaser.GameObjects.Container; readonly shape: Phaser.GameObjects.Graphics; img: Phaser.GameObjects.Image | null; look: string }

/** Смуга шару `above`: тайли верхівок, що мають одну «базову» лінію (низ стовбура під ними). */
interface Band { readonly layer: Phaser.Tilemaps.TilemapLayer; readonly depth: number; alpha: number }

export interface WorldProbe {
  ready: boolean;
  playerX: number;
  playerY: number;
  nearObject: string | null;
  /** GAME-95: рід найближчої цілі в зоні дії — для кнопки дії (talk / fire / object) і e2e. */
  nearKind: ActionTarget | null;
  commandsSent: number;
  cameraScrollX: number;
  cameraScrollY: number;
  clockMinutes: number;
  /** Стартове завантаження сейву завершено (є він чи ні). */
  saveLoaded: boolean;
  /** lerp камери [x, y], прочитаний з живої камери: 1 — миттєвий слід, без плавного «доїзду» (GAME-39 #3). */
  cameraLerp: [number, number];
  /** GAME-93 (лише для e2e): номер кадру листа персонажа — рядок напрямку × 9 + стовпець (0 — стоїть). */
  playerFrame: number;
  playerDir: Dir;
  playerMoving: boolean;
  /** Глибина персонажа (= y ніг) і кількість тайлів верхівок, що зараз перекривають його кадр / лежать позаду нього. */
  playerDepth: number;
  coveredTiles: number;
  behindTiles: number;
  /** GAME-210 (лише для e2e): крони/дахи над героєм (глибина смуги > глибини героя) і найменша їхня прозорість зараз (1 — ніхто не під кроною; нижче — герой під кроною). */
  canopy: { bands: number; over: number; minAlpha: number };
  /** GAME-210 (лише для e2e): плями світла з вікон на підлозі — скільки намальовано, глибина шару й прозорість (гасне до ночі). */
  light: { patches: number; depth: number; alpha: number };
  /** GAME-231 (лише для e2e): ліхтарі табору — скільки стоїть, чи горять (з 18:00), прозорість кола світла й його радіус, px. */
  lamps: { count: number; on: boolean; alpha: number; radius: number };
  /** GAME-97 (лише для e2e): кадрів за секунду — середнє за останнє повне вікно ~3 с; 0, доки перше вікно не закрилось. */
  fps: number;
  /** Скільки вікон fps уже закрито (тест чекає на нове вікно, а не читає застаріле число). */
  fpsWindows: number;
  /** GAME-173 (лише для e2e): на якій точці дозвілля стоїть кожен слідувач (вид і тайл), null — у строю чи ще в дорозі. */
  leisure: ({ kind: string; c: number; r: number } | null)[];
  /** GAME-112 (лише для e2e): де стоять слідувачі (ноги, піксельні координати мапи) — у порядку ланцюжка. */
  followers: Pt[];
  /** GAME-172 (лише для e2e): де стоять фонові мешканці табору (ноги, піксельні координати мапи) і чи йдуть. */
  residents: { id: string; x: number; y: number; moving: boolean }[];
  /** GAME-226 (лише для e2e): що зараз робить кожен сусід табору — стан, фаза дороги, де видно спрайт, значок над головою. */
  neighbours: NeighbourProbe[];
  /** GAME-204 (лише для e2e): фоновий покупець у крамниці (ноги, піксельні координати мапи); порожньо поза крамницею. */
  visitors: { id: string; x: number; y: number; moving: boolean }[];
  /** GAME-172: ключ репліки, що зараз над головою мешканця (null — тиша), і скільки реплік уже прозвучало. */
  bark: string | null;
  barkCount: number;
  /** GAME-38: мс від початку навігації до першого намальованого кадру Phaser; 0, доки кадру не було (ставить main.ts). */
  firstFrameMs: number;
  /** GAME-99 (лише для e2e): ефект «день і ніч» — що зараз намальовано. `on` — ефект увімкнено; `visible` — прямокутник/пляма видимі (вдень — ні). */
  daylight: { on: boolean; visible: boolean; minuteOfDay: number; darkness: number; color: number; glow: number };
  /** GAME-175 (лише для e2e): кільце наближення (0..1, об'єкт), рюкзак, стрілка до мети (none/line/edge), лічильник спливів, дії-від-наближення. */
  fx: { target: string | null; ring: number; ringName: string | null; backpack: number; guide: 'none' | 'line' | 'edge'; pops: number; auto: number; rewards: number; rewardLast: string; headLabels: string[] };
  /** GAME-179 (лише для e2e): які маркери зараз над головами NPC — id → chat («…») / request («!»). */
  npcMarks: Record<string, NpcMarker>;
  /** GAME-184: цілі прохань, біля яких намальована Мія (видимі спрайти). */
  miaAt: string[];
  /** GAME-189 (лише для e2e): намет руками — фаза, кілки, шкала (позиція маркера й чи він у зеленому), чи місце придатне. */
  tent: TentProbe;
  /** GAME-202/203 (лише для e2e): що зараз робить кожен слідувач (у порядку FOLLOWERS): у строю (null), іде за дорученням / працює, чи тягне відтяжку намету. */
  jobs: ({ kind: 'errand'; task: string; phase: 'walk' | 'work' } | { kind: 'tent'; phase: 'walk' | 'pull' } | null)[];
  /** GAME-190 (лише для e2e): дрова руками — гілки, колода, шкала ударів. */
  wood: WoodProbe;
  /** GAME-209: ящик, старий ящик і ремонт лавки (лише читання, для e2e). */
  crate: CrateProbe;
  /** GAME-190 (лише для e2e): вогнище руками — поліна, шкала сірника, чи тримає гравець дію. */
  fire: FireProbe;
  grill: GrillProbe;
  /** GAME-193: риболовля (лише читання, для e2e). */
  fish: FishProbe;
  /** GAME-216 (лише для e2e): заставка приїзду в табір триває (камера не на героєві). */
  reveal: boolean;
  /** GAME-230 (лише для e2e): подарунки — скільки реакцій показано, остання (мешканець, реакція, значок), кадр пози героя (-1 — не вручає) і звуки (останні). */
  gift: { count: number; npc: string | null; reaction: string | null; emote: string | null; poseAge: number; poseColumn: number | null; sounds: string[] };
  /** GAME-206 (лише для e2e): живі дрібниці — скільки іскор, пилу, диму, стебел намальовано в кадрі; чи гойдається авто; чи режим спокою. */
  live: LiveProbe;
  /** GAME-227 (лише для e2e): купання — стан під ногами (суша/мілина/глибина), гойдання, кола, краплі, мокрі сліди, звуки; Мія на воді (мусить бути 0). */
  swim: SwimProbe;
  /** GAME-225 (лише для e2e): живий табір — лавка, сосни, кущі, калюжі, колонка, смітник, дошка, кроки по пірсу. */
  camp: CampProbe;
}

/** Точка вогнища (об'єкт мапи obj.campfire) — центр світлої плями; нема — плями нема. */
/** Відстані (px), з яких чути хвилі й тріск вогнища. */
const LAKE_EAR = 260;
const FIRE_EAR = 220;
const spawnFire = (spots: readonly Spot[]): Pt | null => { const f = spots.find((s) => s.name === 'obj.campfire'); return f ? { x: f.x, y: f.y } : null; };

/** Вікно вимірювання fps, мс. */
const FPS_WINDOW_MS = 3000;

/** Бульба над головою NPC (GAME-179): біла з трьома крапками — «є про що побалакати»; жовта зі знаком оклику — «є прохання». Малюється пікселями, без шрифту. */
function drawMarker(g: Phaser.GameObjects.Graphics, kind: NpcMarker): void {
  const ink = 0x1b1f23;
  const fill = kind === 'request' ? 0xffd54a : 0xf4f1e8;
  g.clear();
  g.fillStyle(ink, 1).fillRoundedRect(-10, -9, 20, 15, 3).fillTriangle(-4, 5, 4, 5, 0, 10);
  g.fillStyle(fill, 1).fillRoundedRect(-9, -8, 18, 13, 2).fillTriangle(-3, 4, 3, 4, 0, 8);
  g.fillStyle(ink, 1);
  if (kind === 'chat') g.fillRect(-6, -3, 3, 3).fillRect(-1, -3, 3, 3).fillRect(4, -3, 3, 3);
  else g.fillRect(-1, -6, 3, 6).fillRect(-1, 2, 3, 2);
}

/** GAME-212: піксельний гліф (♪, ?) у палітрі бульби NPC. */
function drawGlyph(g: Phaser.GameObjects.Graphics, kind: Glyph): void {
  g.clear().fillStyle(0x1b1f23, 1);
  GLYPHS[kind].forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === '#') g.fillRect(x * 2 - 5, y * 2 - 7, 2, 2); });
}

export class WorldScene extends Phaser.Scene {
  /** GAME-181 (для e2e): скільки спливів нагороди показано й який був останній. */
  private rewardPops = 0;
  private rewardLast = '';
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private readonly gate = createActionGate();
  private anchors: Pt[] = [];
  private spots: Spot[] = [];
  private bands: Band[] = [];
  private facing: Dir = 'down';
  private last = { x: 0, y: 0 };
  private grid!: Grid;
  private chain: Pt[] = [];
  private followSprites: Phaser.GameObjects.Sprite[] = [];
  private followFacing: Dir[] = [];
  /** GAME-212: скільки мс стоїть герой / слідувач / мешканець (дихання), куди й скільки ще дивиться слідувач на сплеск, видимий зсув героя. */
  private heroStandMs = 0;
  private heroBob = 0;
  private sitCropped = false;
  private followStand: number[] = [];
  private followLook: { dir: Dir; s: number }[] = [];
  private resStand: number[] = [];
  private emoteG: Phaser.GameObjects.Graphics[] = [];
  /** GAME-202/203: чим зайнятий кожен слідувач (null — у строю чи на дозвіллі). */
  private jobs: (Job | null)[] = [];
  /** GAME-203: хто з FOLLOWERS тягне відтяжки намету, що зараз ставиться (індекси). */
  private tentHelpers: number[] = [];
  /** GAME-172: фонові мешканці — розклад (чиста функція ігрового часу), спрайти, останній напрямок, репліка. */
  private residentLines: (Timeline | null)[] = [];   // у порядку CAST; null — не на цій мапі
  private residentSprites: Phaser.GameObjects.Sprite[] = [];
  private residentFacing: Dir[] = [];
  private residentBark: { text: Phaser.GameObjects.Text; until: number; npc: number } | null = null;
  private barkNext: number[] = [];
  private barkReadyAt: number[] = [];
  /** GAME-179: маркери «…»/«!» над NPC (малюнок і вид, за який він намальований) і NPC, що зараз дивиться на героя (повертається вниз, коли той відійде). */
  private doneSeen = -1;
  /** GAME-192: стрілка «Далі» зараз видима (гравець застряг / ціль нова / режим «завжди»). */
  private hintOn = true;
  /** GAME-184: Мія біля цілі прохання (за назвою об'єкта); створюється, коли потрібна. */
  private miaSprites = new Map<string, Phaser.GameObjects.Sprite>();
  private npcMarks = new Map<string, { g: Phaser.GameObjects.Graphics; kind: NpcMarker | null }>();
  private faced: string | null = null;
  /** GAME-173: скільки секунд герой стоїть; точки дозвілля родини (null — у строю) і всі точки мапи; напрямок руху героя для строю. */
  private idleS = 0;
  /** GAME-191: дія героя, що зараз програється (slash / thrust / cast); null — ходьба й стояння як завжди. */
  private acting: HeroAction | null = null;
  /** GAME-230: кадр пози «вручаю подарунок» (-1 — поза не триває). Рахується кадрами гри. */
  private giftAge = -1;
  /** GAME-230: скільки шишок і ягід уже передано в інвентар (лічильник риґу показує зібране, тут — що з нього вже в ядрі). */
  private foraged = { cones: 0, berries: 0 };
  private leisure: (LeisureSpot | null)[] | null = null;
  private leisureSpots: LeisureSpot[] = [];
  private heading: Pt = { x: 0, y: 0 };
  private fpsFrames = 0;
  private fpsStart = -1;
  /** Тап по канві (GAME-95): світова точка, чекає на кадр update, де її звіряють із цілями в зоні дії. */
  private tap: { x: number; y: number } | null = null;
  /** GAME-216: заставка першого приїзду в табір — мс від початку й опорні точки; null — камера стежить за героєм. Раз на сесію сцени. */
  private reveal: { elapsed: number; anchors: RevealAnchors } | null = null;
  private revealDone = false;
  private revealSkip = false;
  /** GAME-99: нічна маска (на весь екран, MULTIPLY) і світла пляма вогнища (ADD); null, якщо ефект вимкнено. */
  private night: Phaser.GameObjects.Rectangle | null = null;
  private glow: Phaser.GameObjects.Image | null = null;
  private patches: Phaser.GameObjects.Image | null = null;
  private patchCount = 0;
  /** GAME-231: кола світла під ліхтарями табору (ADD, покадрова прозорість). */
  private lampGlows: Phaser.GameObjects.Image[] = [];
  /** GAME-231: мешканець, з яким відкрито розмову (діалог ядра `game.dialogue`); скидається, щойно діалог закрито. */
  private talkingTo: string | null = null;

  /** Позначки цілей (GAME-170 зріз 2; GAME-175: речі, кроки, авто) — за назвою об'єкта; видимі лише поки об'єкт «живий» (isLive). */
  private markers = new Map<string, Marker>();
  /** NPC на мапі: видимі лише поки живі (Джордж — лише в профілі, де він є). */
  private npcSprites = new Map<string, Phaser.GameObjects.Sprite>();
  /** GAME-175: мапа, що зараз побудована, і все, що до неї належить (знищується при переході): шари, картинки, маркери, колізії. */
  private current: MapKey | null = null;
  private tilemap: Phaser.Tilemaps.Tilemap | null = null;
  private owned: { destroy(): void }[] = [];
  private wallCollider: Phaser.Physics.Arcade.Collider | null = null;
  private crateCollider: Phaser.Physics.Arcade.Collider | null = null;
  private props!: CampProps;
  /** Авто на подвір'ї: спрайт і невидима колізія — окремо від мапи (залежать від транспорту гравця, а не від мапи). */
  private carParts: { destroy(): void }[] = [];
  private carFor = '';
  /** GAME-206: спрайт авто з двигуном (дорога) і його справжнє місце — погойдування прикладається від нього, не накопичується. */
  private carImg: { img: Phaser.GameObjects.Image; x: number; y: number } | null = null;
  private live!: LiveFx;
  private swim!: SwimRig;
  private life!: CampAlive;
  private neigh!: Neighbours;
  private walkGrid!: Grid;
  private lastRes: Pt[] = [];   // GAME-226: живі сусіди
  private lifeDay = -1;
  private lifeRain = false;
  /** Набір terrain поточної мапи (перший gid і кількість тайлів) — для роду землі під ногами. */
  private terrain = { first: 0, count: 0 };
  private fx: MapFx | null = null;
  private insets: Insets = { top: 24, bottom: 0, left: 0, right: 0 };
  private insetsAt = -1e9;
  private ring: Ring = RING_IDLE;
  /** Об'єкти, що вже спрацювали в цьому заході в зону: поки гравець не вийде з неї, самі не повторюються. */
  private fired = new Set<string>();
  private unloadT = FEEDBACK_S * 0.4;
  private autoCount = 0;
  private tent!: TentRig;
  private wood!: WoodRig;
  private fire!: FireRig;
  private fish!: FishRig;
  private grill!: GrillRig;
  private fireSprite: Phaser.GameObjects.Sprite | null = null;

  /** art — графіка, декодована до старту гри (loadWorldArt); hooks — усе, що сцена просить у гри (див. WorldHooks). */
  constructor(private readonly bridge: Bridge, private readonly controls: InputState, private readonly probe: WorldProbe, private readonly art: WorldArt,
    private readonly hooks: WorldHooks, private readonly daylightOn = true, private readonly barkText: (key: Key) => string = () => '') {
    super('world');
  }

  preload(): void {
    this.load.tilemapTiledJSON('camp', 'maps/camp-lake.tmj');
    this.load.tilemapTiledJSON('home', 'maps/home.tmj');
    this.load.tilemapTiledJSON('shop', 'maps/shop.tmj');
    this.load.tilemapTiledJSON('road', 'maps/road.tmj');
    // GAME-40: три UI-звуки (SND-001…003). Літерали тут, бо сторож check-scene-refs перевіряє існування файлів лише за літералами в
    // this.load.*; відповідність ключів/шляхів таблиці UI_SOUND_FILES доводить src/audio/ui-sounds.test.ts.
    this.load.audio('ui-click', 'audio/ui-click_001.ogg');
    this.load.audio('ui-confirmation', 'audio/ui-confirmation_001.ogg');
    this.load.audio('ui-back', 'audio/ui-back_001.ogg');
    // GAME-194: фон (6 петель) і 7 ефектів — літерали для check-scene-refs; відповідність таблицям AMBIENT_FILES/SFX_FILES доводить src/audio/ambient.test.ts.
    this.load.audio('amb-camp', 'audio/amb-camp.ogg');
    this.load.audio('amb-lake', 'audio/amb-lake.ogg');
    this.load.audio('amb-fire', 'audio/amb-fire.ogg');
    this.load.audio('amb-rain', 'audio/amb-rain.ogg');
    this.load.audio('amb-road-car', 'audio/amb-road-car.ogg');
    this.load.audio('amb-road-bike', 'audio/amb-road-bike.ogg');
    this.load.audio('amb-shop', 'audio/amb-shop.ogg');
    this.load.audio('sfx-chime', 'audio/sfx-chime.ogg');
    this.load.audio('sfx-fanfare', 'audio/sfx-fanfare.ogg');   // GAME-229
    this.load.audio('sfx-peg', 'audio/sfx-peg.ogg');
    this.load.audio('sfx-chop', 'audio/sfx-chop.ogg');
    this.load.audio('sfx-match', 'audio/sfx-match.ogg');
    this.load.audio('sfx-cast', 'audio/sfx-cast.ogg');
    this.load.audio('sfx-splash', 'audio/sfx-splash.ogg');
    this.load.audio('sfx-catch', 'audio/sfx-catch.ogg');
    this.load.audio('sfx-branch', 'audio/sfx-branch.ogg');
  }

  /**
   * Позначка цілі (GAME-170 зріз 2): тимчасова графіка замість спрайтів LPC (купа дров, лавка, велонавіс, пакети, речі для пакування,
   * полиці — прогалини набору, OD-013: спершу доведення наявних спрайтів; скіл game-art-sources). Малюється на точці об'єкта (ноги),
   * глибина — її y. Колір — за родом: крок/справа — золотий, річ — бурштиновий (зелений, коли вже в багажнику), авто — блакитний.
   */
  private marker(s: Spot): Marker {
    const shape = this.add.graphics();
    const g = this.add.container(s.x, s.y, [shape]);
    g.setDepth(s.y);
    const m: Marker = { g, shape, img: null, look: '' };
    this.draw(m, s.name, this.hooks.look(s.name), s.name === 'obj.vehicle' || s.name === 'obj.trunk' ? `${this.hooks.look(s.name)}|${this.hooks.transport() ?? ''}` : this.hooks.look(s.name));
    g.setVisible(this.hooks.isLive(s.name));
    return m;
  }

  private draw(m: Marker, name: string, look: 'room' | 'trunk', sig: string): void {
    m.look = sig;
    const g = m.shape.clear();
    m.img?.destroy();
    m.img = null;
    g.fillStyle(0x000000, 0.35).fillEllipse(0, 0, 22, 10);
    if (name === 'obj.vehicle' && this.hooks.transport() === 'transport.bike') { this.drawBike(g); return; }
    if (name === 'obj.trunk' && this.hooks.transport() === 'transport.bike') {   // велосипед: «багажник» — місце, де речі пристібають до рами: скатка зі стяжкою
      g.fillStyle(0x3f7f5a, 1).fillRoundedRect(-10, -14, 20, 9, 4);
      g.lineStyle(1, 0x1b1f23, 1).strokeRoundedRect(-10, -14, 20, 9, 4);
      g.fillStyle(0xd9a441, 1).fillRect(-5, -14, 2, 9).fillRect(3, -14, 2, 9);
      return;
    }
    if (name.startsWith('trace.')) { this.drawTrace(g); return; }   // GAME-215: позначка олівцем, без піктограми атласу
    // GAME-201: замість кубика — піктограма речі завдання (objective-icons), над точкою; гойдається покадрово в update (без твінів).
    m.img = this.add.image(0, ICON_Y, 'objective-icons', iconIndex(objectiveIcon(name).key)).setOrigin(0.5, 1);
    m.g.add(m.img);
    if (look === 'trunk' && (name.startsWith('pack.') || name.startsWith('take.') || name.startsWith('req.'))) g.fillStyle(0x9be28f, 1).fillCircle(8, ICON_Y - 15, 4).lineStyle(1, 0x1b1f23, 1).strokeCircle(8, ICON_Y - 15, 4)
      .lineStyle(2, 0x1b1f23, 1).beginPath().moveTo(6, ICON_Y - 15).lineTo(7.5, ICON_Y - 13).lineTo(10.5, ICON_Y - 17).strokePath();   // галочка: уже в багажнику
  }

  /**
   * GAME-215: слід дідуся Генрі — позначка олівцем, як у дорожньому атласі: нерівне графітове коло з розривом, маленька зірочка й короткий підпис-риска.
   * Малюється кодом у палітрі гри (графіт 0x3b3a44, папір 0xf4ecd2): нової графіки немає (OD-013/OD-026), масштаб — одна клітинка.
   */
  private drawTrace(g: Phaser.GameObjects.Graphics): void {
    const GRAPHITE = 0x3b3a44;
    g.fillStyle(0xf4ecd2, 0.55).fillCircle(0, -14, 11);   // клаптик паперу під олівцем
    g.lineStyle(2, GRAPHITE, 0.95).beginPath();
    for (let i = 0; i <= 26; i++) {   // нерівне коло з розривом (олівець не замикає лінію)
      const a = -Math.PI * 0.35 + (i / 26) * Math.PI * 1.85;
      const r = 10 + (i % 3 === 0 ? 0.9 : i % 3 === 1 ? -0.6 : 0.2);
      const x = Math.cos(a) * r; const y = -14 + Math.sin(a) * r * 0.82;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.strokePath();
    g.lineStyle(1.5, GRAPHITE, 1).beginPath();   // зірочка-хрестик у колі
    g.moveTo(-3, -17).lineTo(3, -11).moveTo(3, -17).lineTo(-3, -11).moveTo(0, -18.5).lineTo(0, -9.5).strokePath();
    g.lineStyle(1.5, GRAPHITE, 0.9).beginPath().moveTo(11, -5).lineTo(19, -7).strokePath();   // короткий підпис-риска
  }

  /** Велосипед пікселями палітри гри (LPC-набір його не має): два колеса, рама, кермо, сідло, багажник-«рюкзак» ззаду; ноги — на (0,0). */
  private drawBike(g: Phaser.GameObjects.Graphics): void {
    const OUT = 0x1b1f23;
    g.lineStyle(3, OUT, 1).strokeCircle(-10, -7, 7).strokeCircle(10, -7, 7);   // обідок-обводка
    g.lineStyle(1.5, 0xe8e6e3, 1).strokeCircle(-10, -7, 6).strokeCircle(10, -7, 6);
    g.lineStyle(3, OUT, 1).beginPath().moveTo(-10, -7).lineTo(-3, -16).lineTo(6, -16).lineTo(10, -7).moveTo(-3, -16).lineTo(2, -7).lineTo(-10, -7).moveTo(6, -16).lineTo(8, -21).strokePath();
    g.lineStyle(1.5, 0x2f6fb0, 1).beginPath().moveTo(-10, -7).lineTo(-3, -16).lineTo(6, -16).lineTo(10, -7).moveTo(-3, -16).lineTo(2, -7).lineTo(-10, -7).moveTo(6, -16).lineTo(8, -21).strokePath();
    g.fillStyle(OUT, 1).fillRect(-7, -20, 9, 3).fillRect(5, -23, 7, 2);   // сідло й кермо
    g.fillStyle(0xe8e6e3, 1).fillRect(-6, -19, 7, 1).fillRect(6, -22, 5, 1);
    g.fillStyle(0xd9a441, 1).fillCircle(-10, -7, 1.5).fillCircle(10, -7, 1.5);   // втулки
  }

  /** Безпечна зона для стрілки (світові одиниці): без шапки HUD, рядка «Далі» і нижньої дотикової смуги (джойстик + кнопка дії). Міряємо DOM раз на ~0,3 с. */
  private landscape = false;
  private safeInsets(time: number): Insets {
    if (time - this.insetsAt < 300) return this.insets;
    this.insetsAt = time;
    this.landscape = window.matchMedia('(orientation: landscape)').matches;
    const cv = this.game.canvas.getBoundingClientRect();
    const z = this.cameras.main.zoom || 1;
    let topPx = 0;
    let botPx = 0;
    for (const sel of ['.ui-header', '.ui-next']) {
      const e = document.querySelector(sel);
      if (!e) continue;
      const r = e.getBoundingClientRect();
      // GAME-185: вбік «Далі: …» лежить смугою внизу (не під шапкою) — це нижня, а не верхня межа безпечної зони.
      if (r.top - cv.top > (cv.bottom - cv.top) / 2) botPx = Math.max(botPx, cv.bottom - r.top); else topPx = Math.max(topPx, r.bottom - cv.top);
    }
    for (const sel of ['.touch-stick', '.touch-interact']) {
      const e = document.querySelector<HTMLElement>(sel);
      if (!e || e.hidden || e.offsetParent === null) continue;
      botPx = Math.max(botPx, cv.bottom - e.getBoundingClientRect().top);
    }
    this.insets = { top: Math.max(0, topPx + 4) / z, bottom: Math.max(0, botPx + 4) / z, left: 0, right: 0 };
    return this.insets;
  }

  /**
   * GAME-191 (OD-022): герой один раз програє анімацію дії LPC (slash / thrust / cast) у бік `facing` (за замовчуванням — куди дивиться)
   * і повертається до стояння. Геймплей не змінює: нічого не рухає й нікого не зачіпає; виклик під час дії ігнорується (false).
   */
  playAction(action: HeroAction, facing: Dir = this.facing): boolean {
    if (this.acting) return false;
    this.acting = action;
    this.facing = facing;
    this.player.anims.play(`act-${action}-${facing}`);
    this.player.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.acting = null;
      this.player.setTexture('player', frameIndex(this.facing, 0));
    });
    return true;
  }

  /** GAME-230: реакція на подарунок і поза героя — покадрово (30 кадрів), без таймерів. Поки поза триває, ходьба її скасовує. */
  private stepGift(): void {
    const c = this.life.collected;
    if (c.cones < this.foraged.cones) this.foraged.cones = c.cones;   // лічильник риґу почався знову (нова мапа) — не дублюємо
    if (c.berries < this.foraged.berries) this.foraged.berries = c.berries;
    while (this.foraged.cones < c.cones) { this.foraged.cones++; this.hooks.onForage?.('cone'); }
    while (this.foraged.berries < c.berries) { this.foraged.berries++; this.hooks.onForage?.('berry'); }
    const g = this.hooks.takeGift?.();
    if (g) {
      const i = RESIDENTS.findIndex((r) => r.id === g.npc);
      const s = i >= 0 ? this.residentSprites[i] : undefined;
      const emote = giftEmote(g.reaction);
      if (this.neigh.react(g.npc, emote)) {
        playCamp(giftSound(g.reaction));
        this.probe.gift.count++; this.probe.gift.npc = g.npc; this.probe.gift.reaction = g.reaction; this.probe.gift.emote = emote; this.probe.gift.sounds = campSounds.played.slice(-4);
      }
      if (s && !this.acting) { this.facing = facingToward(this.player, { x: s.x, y: s.y }); this.giftAge = 0; }
    }
    if (this.giftAge >= 0) {
      const col = poseColumn(this.giftAge);
      if (this.acting || col === null) this.giftAge = -1;
      else this.player.setTexture('player-thrust', DIR_ROW[this.facing] * ACTION_COLS.thrust + col);
      if (this.giftAge >= 0) this.giftAge = nextPoseAge(this.giftAge);
      if (this.giftAge < 0) this.player.setTexture('player', frameIndex(this.facing, 0));
    }
    this.probe.gift.poseAge = this.giftAge;
    this.probe.gift.poseColumn = this.giftAge >= 0 ? poseColumn(this.giftAge) : null;
  }

  /** GAME-228: де зараз тварини (кішка Мія): дія їх ніколи не б'є — вони лише передаються вибору цілі, який їх відкидає. */
  private petPoints(): Pt[] { return [...this.miaSprites.values()].filter((m) => m.visible).map((m) => ({ x: m.x, y: m.y })); }

  /** Повернути героя лицем до точки (без анімації): перед дією біля колоди чи вогнища. */
  private faceTo(p: Pt): void {
    if (this.acting) return;
    this.facing = facingToward(this.player, p);
    this.player.setFrame(frameIndex(this.facing, 0));
  }

  /** Складений лист ходьби як текстура з 36 кадрами (ключ кадру — номер). */
  private addSheet(key: string, canvas: HTMLCanvasElement): void {
    const tex = this.textures.addCanvas(key, canvas);
    if (!tex) throw new Error(`texture ${key} failed`);
    for (let i = 0; i < COLS * 4; i++) tex.add(i, 0, (i % COLS) * FRAME, Math.floor(i / COLS) * FRAME, FRAME, FRAME);
  }

  create(): void {
    bindPhaser(this.sound);   // GAME-40: мікшер отримує вихід Phaser (звуки вже в кеші після preload)
    // GAME-207: музика довантажується ПІСЛЯ preload (перший кадр < 1,5 с, GAME-38) і лише коли ввімкнена (збірка e2e — за ?music=1).
    // Літерали — для check-scene-refs; відповідність таблиці MUSIC_FILES доводить src/audio/music.test.ts. До 'complete' петля не стартує (music.ready).
    if (music.enabled) {
      this.load.audio('mus-intro', 'audio/mus-intro.ogg');
      this.load.audio('mus-home', 'audio/mus-home.ogg');
      this.load.audio('mus-road', 'audio/mus-road.ogg');
      this.load.audio('mus-shop', 'audio/mus-shop.ogg');
      this.load.audio('mus-camp-day', 'audio/mus-camp-day.ogg');
      this.load.audio('mus-camp-evening', 'audio/mus-camp-evening.ogg');
      this.load.once('complete', () => music.setReady(true));
      this.load.start();
    }
    for (const [name, img] of Object.entries(this.art.tilesets)) this.textures.addImage(name, img);
    this.textures.addSpriteSheet('objective-icons', this.art.icons, { frameWidth: ICON_SIZE, frameHeight: ICON_SIZE });   // GAME-201: кадр = номер клітинки
    this.textures.addSpriteSheet('campfire', this.art.campfire, { frameWidth: FRAME, frameHeight: FRAME });
    this.textures.addSpriteSheet('mia', this.art.mia, { frameWidth: PET_SHEETS.mia.frame, frameHeight: PET_SHEETS.mia.frame });   // GAME-147/184: кішка Мія (ART-020)
    this.addSheet('player', this.art.sheets.player);
    for (const a of ACTIONS) {   // GAME-191: листи дій героя — ключ `player-<дія>`, кадри за тим самим номером (рядок напрямку × стовпців дії + стовпець)
      const tex = this.textures.addCanvas(`player-${a}`, this.art.playerActions[a]);
      if (!tex) throw new Error(`texture player-${a} failed`);
      for (let i = 0; i < ACTION_COLS[a] * 4; i++) tex.add(i, 0, (i % ACTION_COLS[a]) * FRAME, Math.floor(i / ACTION_COLS[a]) * FRAME, FRAME, FRAME);
    }
    this.addSheet('elise', this.art.sheets.elise);
    for (const name of FOLLOWERS) {
      this.addSheet(name, this.art.sheets[name]);
      // GAME-202/203: лист thrust родини — ключ `<ім'я>-thrust`, кадри за тим самим номером, що в героя.
      const tex = this.textures.addCanvas(`${name}-thrust`, this.art.familyThrust[name]);
      if (!tex) throw new Error(`texture ${name}-thrust failed`);
      for (let i = 0; i < ACTION_COLS.thrust * 4; i++) tex.add(i, 0, (i % ACTION_COLS.thrust) * FRAME, Math.floor(i / ACTION_COLS.thrust) * FRAME, FRAME, FRAME);
    }
    for (const [name, canvas] of Object.entries(this.art.residents)) this.addSheet(`res-${name}`, canvas);

    this.anims.create({ key: 'fire', frames: this.anims.generateFrameNumbers('campfire', { start: 0, end: 4 }), frameRate: 8, repeat: -1 });
    for (const dir of DIRS) {
      this.anims.create({ key: `walk-${dir}`, frames: Array.from({ length: COLS - 1 }, (_, i) => ({ key: 'player', frame: frameIndex(dir, i + 1) })), frameRate: WALK_FPS, repeat: -1 });
    }
    for (const a of ACTIONS) {
      for (const dir of DIRS) this.anims.create({ key: `act-${a}-${dir}`, frames: Array.from({ length: ACTION_COLS[a] }, (_, i) => ({ key: `player-${a}`, frame: DIR_ROW[dir] * ACTION_COLS[a] + i })), frameRate: ACTION_FPS, repeat: 0 });
    }
    for (const name of FOLLOWERS) {
      for (const dir of DIRS) this.anims.create({ key: `walk-${name}-${dir}`, frames: Array.from({ length: COLS - 1 }, (_, i) => ({ key: name, frame: frameIndex(dir, i + 1) })), frameRate: WALK_FPS, repeat: -1 });
      // GAME-202/203: робота руками по колу (несе речі, тягне відтяжку) — лист thrust без першого кадру «стоїть», повільніше за удар героя.
      for (const dir of DIRS) this.anims.create({ key: `work-${name}-${dir}`, frames: Array.from({ length: ACTION_COLS.thrust - 1 }, (_, i) => ({ key: `${name}-thrust`, frame: DIR_ROW[dir] * ACTION_COLS.thrust + i + 1 })), frameRate: ACT_LOOP_FPS, repeat: -1 });
    }
    this.jobs = FOLLOWERS.map(() => null);
    // Слідувачі — лише картинки: без тіла фізики й без інтерактивності, тож тап і кнопка дії їх «не бачать» (GAME-112, цілі взаємодії).
    this.followFacing = FOLLOWERS.map(() => 'down' as Dir);
    this.followStand = FOLLOWERS.map(() => 0);
    this.followLook = FOLLOWERS.map(() => ({ dir: 'down' as Dir, s: 0 }));
    this.followSprites = FOLLOWERS.map((name) => this.add.sprite(0, 0, name, frameIndex('down', 0)).setOrigin(0.5, ORIGIN_Y));
    for (const res of CAST) {
      for (const dir of DIRS) this.anims.create({ key: `walk-res-${res.look}-${dir}`, frames: Array.from({ length: COLS - 1 }, (_, i) => ({ key: `res-${res.look}`, frame: frameIndex(dir, i + 1) })), frameRate: WALK_FPS, repeat: -1 });
    }
    this.residentFacing = CAST.map(() => 'down' as Dir);
    this.resStand = CAST.map(() => 0);
    this.barkNext = CAST.map(() => 0);
    this.barkReadyAt = CAST.map(() => 0);
    this.residentSprites = CAST.map((res) => this.add.sprite(0, 0, `res-${res.look}`, frameIndex('down', 0)).setOrigin(0.5, ORIGIN_Y).setVisible(false));
    this.events.on(Phaser.Scenes.Events.PAUSE, () => { this.hideBark(); });
    this.player = this.physics.add.sprite(0, 0, 'player', frameIndex('down', 0));
    this.player.setOrigin(0.5, ORIGIN_Y);
    this.player.body.setSize(BODY.w, BODY.h);
    this.player.body.setOffset(FRAME / 2 - BODY.w / 2, FRAME * ORIGIN_Y - BODY.h / 2);
    this.player.setCollideWorldBounds(true);
    if (this.daylightOn) this.makeNight();
    this.fx = new MapFx(this);
    this.live = new LiveFx(this, DEPTH.decor - 50, DEPTH.always - 10);
    this.swim = new SwimRig(this, this.player, DEPTH.decor - 40);
    this.neigh = new Neighbours(this, DEPTH.always);
    this.life = new CampAlive(this, this.barkText);
    this.tent = new TentRig(this, this.player, this.barkText);
    this.wood = new WoodRig(this, this.player, this.barkText);
    this.props = new CampProps(this, this.barkText);
    this.fire = new FireRig(this, this.player, this.barkText);
    this.fish = new FishRig(this, this.player, this.barkText);
    this.fish.onSplash = (at) => this.chain.forEach((p, i) => { const d = lookAt(p, at); if (d) this.followLook[i] = { dir: d, s: LOOK_S }; });
    // GAME-212: зсув дихання героя — лише на спрайті; перед кроком фізики знімаємо, щоб тіло й проба лишались справжніми.
    this.events.on(Phaser.Scenes.Events.PRE_UPDATE, () => { if (this.heroBob) { this.player.y -= this.heroBob; this.heroBob = 0; } });
    this.grill = new GrillRig(this, this.player, this.barkText);

    // lerp 1, 1 — камера стоїть на персонажі в тому ж кадрі, без згладженого «доїзду». Тож руху, який
    // треба гасити за prefers-reduced-motion, тут немає (GAME-39 #3); e2e читає lerp з живої камери.
    this.cameras.main.startFollow(this.player, true, 1, 1);
    this.cameras.main.roundPixels = true;
    this.probe.cameraLerp = [this.cameras.main.lerp.x, this.cameras.main.lerp.y];

    const keyboard = this.input.keyboard;
    if (keyboard) {
      for (const [action, codes] of Object.entries(KEY_BINDINGS) as [Action, readonly string[]][]) {
        if (action === 'pause') continue; // пауза — справа оболонки UI
        for (const code of codes) {
          const keyCode = KEY_CODES[code];
          if (keyCode === undefined) throw new Error(`no key code for ${code}`);
          // enableCapture=false: Phaser не гасить Enter/Space для кнопок DOM (діалог паузи; рецензія PR #13).
          const key = keyboard.addKey(keyCode, false);
          key.on('down', () => press(this.controls, action));
          key.on('up', () => release(this.controls, action));
        }
      }
    }
    // Тап по об'єкту на канві = та сама взаємодія, що й кнопка дії (GAME-95). Не тап (рух пальця, довга пауза) — ігноруємо.
    this.input.on('pointerdown', () => { if (this.reveal) this.revealSkip = true; });   // GAME-216: дотик виходить із заставки одразу
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.getDistance() > TAP_MAX_MOVE || p.getDuration() > TAP_MAX_MS) return;
      const w = this.cameras.main.getWorldPoint(p.x, p.y);
      this.tap = { x: w.x, y: w.y };
    });
    // Тап, що не дочекався кадру до паузи, після «Продовжити» не мусить спрацювати сам (рецензія GAME-95).
    this.events.on(Phaser.Scenes.Events.PAUSE, () => { this.tap = null; });
    this.events.on(Phaser.Scenes.Events.RESUME, () => { this.tap = null; });

    this.enterMap(this.hooks.mapKey(), false);
    this.last = { x: this.player.x, y: this.player.y };
    // Зонд має правдиві значення вже в момент ready, а не після першого update.
    Object.assign(this.probe, { playerX: this.player.x, playerY: this.player.y, playerFrame: frameIndex(this.facing, 0), playerDir: this.facing, playerMoving: false, playerDepth: this.player.y });
    this.probe.ready = true;
  }

  /** Знищити все, що належить поточній мапі (шари, картинки, маркери, колізії) — перед побудовою наступної. */
  private teardown(): void {
    this.tent?.reset();
    this.wood?.reset();
    this.props?.reset();
    this.crateCollider?.destroy();
    this.crateCollider = null;
    this.fire?.reset();
    this.fish?.reset();
    this.grill?.reset();
    this.live?.reset();
    this.life?.reset();
    this.fireSprite = null;
    for (const o of this.owned) o.destroy();
    this.owned = [];
    this.wallCollider?.destroy();
    this.wallCollider = null;
    this.tilemap?.destroy();
    this.tilemap = null;
    for (const m of this.markers.values()) m.g.destroy(true);
    this.markers.clear();
    this.npcSprites.clear();   // самі спрайти — у `owned`
    for (const p of this.carParts) p.destroy();
    this.carParts = [];
    this.carFor = '';
    this.carImg = null;
    this.glow = null;
    this.patches = null;
    this.patchCount = 0;
    this.lampGlows = [];
    this.bands = [];
  }

  /**
   * Побудувати мапу `key` і поставити героя на точку появи: `s.car` — коли він приїхав сюди (перехід із іншої мапи), інакше `s.start`
   * (старт гри, завантаження) чи перша точка появи (табір). Слідувачі стають поруч. Зонд і камера — на нову мапу.
   */
  private enterMap(key: MapKey, arrived: boolean): void {
    this.teardown();
    this.current = key;
    if (key === 'shop' && arrived) sfx('chime');   // GAME-204: дзвіночок — лише коли герой справді зайшов у двері (завантаження сейву всередині — без нього)
    const map = this.make.tilemap({ key });
    this.tilemap = map;
    const terrain = map.tilesets.find((t) => t.name === 'lpc-terrain');
    this.terrain = terrain ? { first: terrain.firstgid, count: terrain.total } : { first: 0, count: 0 };
    const tilesets = map.tilesets.map((t) => {
      const ts = map.addTilesetImage(t.name, t.name, TILE, TILE, 0, 0);
      if (!ts) throw new Error(`tileset ${t.name} is missing in the scene art`);
      return ts;
    });
    const need = (name: string): Phaser.Tilemaps.TilemapLayer => {
      const layer = map.createLayer(name, tilesets);
      if (!layer || !(layer instanceof Phaser.Tilemaps.TilemapLayer)) throw new Error(`layer ${name} is missing`);
      return layer;
    };
    const bakeKey = `bake-${key}`;
    const baked = this.textures.exists(bakeKey);   // повернення на мапу, що вже запікалась, не коштує нового запікання
    const ground = baked ? null : need('ground').setDepth(DEPTH.ground);
    const decor = baked ? null : need('decor').setDepth(DEPTH.decor);
    const walls = need('walls').setDepth(DEPTH.walls);
    walls.setCollisionByExclusion([-1]);
    this.bands = this.makeBands(map, tilesets);
    // GAME-97: шари мапи статичні, а кожен тайловий шар у Phaser 4 коштує дорого (під SwiftShader JS кадру — 0,4 мс, а тайлові шари — ≈ 7 з 10 мс
    // GPU-часу; під навантаженням паралельного e2e гра падала до 8 fps). Тому земля, декор і стіни один раз запікаються в одну текстуру. Шар `walls`
    // лишається лише як дані колізій (невидимий). Смуги `above` НЕ запікаємо: вони розріджені (34 тайли), а повнокадрова картинка коштувала б дорожче за тайли.
    if (ground && decor) this.bake(bakeKey, map, [ground, decor, walls]);
    this.owned.push(this.add.image(0, 0, bakeKey).setOrigin(0, 0).setDepth(DEPTH.ground));
    for (const layer of [ground, decor, walls]) layer?.setVisible(false);
    this.makePatches(key, map);
    this.makeLamps(map);

    const objects = map.getObjectLayer('objects')?.objects ?? [];
    const typeOf = (o: Phaser.Types.Tilemaps.TiledObject): string => String(o.type || (o as { class?: string }).class || '');
    const spawns = objects.filter((o) => typeOf(o) === 'spawn');
    const spawn = (arrived ? spawns.find((o) => o.name === 's.car') : spawns.find((o) => o.name === 's.start')) ?? spawns[0];
    if (!spawn) throw new Error(`map ${key}: no spawn in layer objects`);
    // GAME-213: кадри камери — наявні «якорі» мапи (obj.pier-end, obj.water, obj.pitch-1); інтерактивні лише як кадр (живі, поки фото не зроблено).
    this.spots = objects.filter((o) => typeOf(o) === 'trigger' || typeOf(o) === 'npc' || (typeOf(o) === 'anchor' && isPhotoSpot(o.name)))
      .map((o) => ({ name: o.name, kind: (typeOf(o) === 'anchor' ? 'trigger' : typeOf(o)) as Spot['kind'], x: o.x ?? 0, y: o.y ?? 0 }));

    for (const s of this.spots) {
      // Точка об'єкта — ноги/основа: спрайт стоїть на ній, а глибина сортування — її y.
      if (s.kind === 'npc') {
        const sp = this.add.sprite(s.x, s.y, NPC_SHEET[s.name] ?? 'elise', frameIndex('down', 0)).setOrigin(0.5, ORIGIN_Y).setDepth(s.y).setVisible(this.hooks.isLive(s.name));
        this.npcSprites.set(s.name, sp);
        this.owned.push(sp);
      } else if (s.name === 'obj.campfire') { this.fireSprite = this.add.sprite(s.x, s.y, 'campfire').setOrigin(0.5, 0.85).setDepth(s.y).play('fire'); this.owned.push(this.fireSprite); }
      else this.markers.set(s.name, this.marker(s));
    }

    // Слідувачі: нова сітка проходимості мапи й місця стоянки біля точки появи.
    const wallsData = map.getLayer('walls')?.data.flatMap((row) => row.map((t) => t.index)) ?? [];
    // GAME-227: пляж — вода без стін (герой пливе сам); слідувачі, мешканці й ящик бачать воду пляжу як стіну: родина чекає на березі.
    const groundData = map.getLayer('ground')?.data.flatMap((row) => row.map((t) => t.index)) ?? [];
    const swimGrid = key === 'camp' ? swimGridOf(map.width, map.height, groundData, swimRegionOf(objects as never, TILE)) : null;
    this.swim.begin(swimGrid, TILE);
    this.grid = gridFromWalls(map.width, map.height, TILE, swimGrid ? withWater(wallsData, swimGrid) : wallsData);
    this.chain = restPoints(this.grid, { x: spawn.x ?? 0, y: spawn.y ?? 0 }, FOLLOWERS.length, this.spots);
    this.followSprites.forEach((sp, i) => sp.setPosition(this.chain[i]?.x ?? 0, this.chain[i]?.y ?? 0).setDepth(this.chain[i]?.y ?? 0));
    this.probe.followers = this.chain.map((p) => ({ x: p.x, y: p.y }));
    this.probe.leisure = this.chain.map(() => null);
    this.jobs = FOLLOWERS.map(() => null);
    this.tentHelpers = [];
    this.probe.jobs = FOLLOWERS.map(() => null);
    // GAME-172: мешканці живуть лише в таборі; на мапах дня 1 (двір, крамниця) їх нема. Шляхи — по сітці стін без клітинок цілей; розклад мусить будуватись (інакше мапа зламана — голосно).
    this.anchors = objects.filter((o) => typeOf(o) === 'anchor').map((o) => ({ x: o.x ?? 0, y: o.y ?? 0 }));
    const shore = objects.find((o) => typeOf(o) === 'anchor' && o.name === FISH_SPOT);   // GAME-193: береговий пункт риболовлі (необов'язкова справа, не на сюжетному шляху)
    if (shore) this.fish.begin({ x: shore.x ?? 0, y: shore.y ?? 0 });
    this.hideBark();
    // GAME-204: фонові живуть у таборі (мешканці) і в крамниці (покупець); на дворі й дорозі їх нема. Шляхи — по сітці стін без клітинок цілей; розклад мусить будуватись (інакше мапа зламана — голосно).
    const onMap = CAST_BY_MAP[key] ?? [];
    const walkGrid = residentGrid(this.grid, [...this.spots, ...this.anchors]);
    this.walkGrid = walkGrid;
    this.residentLines = CAST.map((res) => {
      if (!onMap.includes(res)) return null;
      const tl = buildTimeline(walkGrid, res);
      if (!tl) throw new Error(`ambient: ${res.id} has no path between its stops`);
      return tl;
    });
    this.probe.residents = key === 'camp' ? RESIDENTS.map((res) => ({ id: res.id, x: 0, y: 0, moving: false })) : [];
    this.probe.visitors = key === 'shop' ? onMap.map((res) => ({ id: res.id, x: 0, y: 0, moving: false })) : [];
    this.residentSprites.forEach((sp, i) => sp.setVisible(this.residentLines[i] != null));
    this.neigh.begin(key === 'camp' ? RESIDENTS.map((r) => r.id) : []);
    this.neigh.setFire(key === 'camp' ? spawnFire(this.spots) : null);
    this.lastRes = CAST.map(() => ({ x: 0, y: 0 }));
    this.probe.neighbours = this.neigh.probe;
    this.moveResidents(0);
    const fromMap = leisureFromObjects(objects as never, TILE);
    this.leisureSpots = fromMap.length > 0 ? fromMap : [...(LEISURE_BY_MAP[key === 'camp' ? 'camp-lake' : key] ?? [])];
    this.idleS = 0;
    this.leisure = null;
    if (this.daylightOn) this.makeGlow(spawnFire(this.spots));

    this.player.setPosition(spawn.x ?? 0, spawn.y ?? 0);
    this.player.body.reset(spawn.x ?? 0, spawn.y ?? 0);
    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.wallCollider = this.physics.add.collider(this.player, walls);
    // GAME-209: ящик, що штовхається, старий ящик і лавка — лише в таборі. Світ сторожа: стіни й клітинки всіх об'єктів мапи (крім самого старту ящика).
    if (key === 'camp') {
      const named = (n: string): Pt | null => { const o = objects.find((x) => x.name === n); return o ? { x: o.x ?? 0, y: o.y ?? 0 } : null; };
      const spotPx = objects.filter((o) => typeOf(o) !== 'spawn' && o.name !== 'crate.start').map((o) => ({ x: o.x ?? 0, y: o.y ?? 0 }));
      const cw = crateWorld(map.width, map.height, TILE, swimGrid ? withWater(wallsData, swimGrid) : wallsData, { x: spawn.x ?? 0, y: spawn.y ?? 0 }, spotPx);
      this.props.begin(cw, TILE, named('crate.start'), named(OLD_CRATE_SPOT), named(REPAIR_SPOT), this.hooks.spotDone?.(OLD_CRATE_SPOT) ?? false, this.hooks.spotDone?.(REPAIR_SPOT) ?? false);
      if (this.props.body) this.crateCollider = this.physics.add.collider(this.player, this.props.body);
    }
    if (key === 'camp') this.life.begin(this.bands.map((b) => b.layer));
    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.cameras.main.centerOn(this.player.x, this.player.y);
    this.last = { x: this.player.x, y: this.player.y };
    // GAME-216: перший приїзд у табір — заставка: камера відпливає до озера й табору і вертається (таблиця бітів camp-reveal.ts, кадр за кадром).
    // Лише з опорними точками на мапі (берег FISH_SPOT і вогнище), без «менше руху», раз на сцену; гра не стоїть — герой може йти, і будь-який дотик виходить.
    const fire = spawnFire(this.spots);
    if (key === 'camp' && !this.revealDone && shore && fire && this.hooks.campReveal?.() === true && !calmMotion()) {
      this.revealDone = true;
      this.reveal = { elapsed: 0, anchors: { player: { x: this.player.x, y: this.player.y }, lake: { x: shore.x ?? 0, y: shore.y ?? 0 }, camp: fire } };
      this.cameras.main.stopFollow();
    } else this.endReveal();
    this.placeCar();
    // Щойно з'явився поруч з об'єктом (приїхав, завантажив гру) — не діє, поки не відійде: інакше авто везло б назад саме.
    this.fired = new Set(this.spots.filter((sp) => Phaser.Math.Distance.Between(spawn.x ?? 0, spawn.y ?? 0, sp.x, sp.y) <= INTERACT_RANGE).map((sp) => sp.name));
    this.ring = RING_IDLE;
  }

  /**
   * Авто (GAME-175): якщо гравець на авто й на мапі є точка посадки `obj.vehicle` — спрайт авто з тайлсету camp-car (LPC, як у таборі) стоїть
   * поруч, а його нижня смуга — непрохідна. Велосипед — лише маркер точки посадки. Спрайт залежить від транспорту, тож ставиться окремо від мапи
   * (створили персонажа — авто з'являється без перезавантаження мапи).
   */
  private placeCar(): void {
    const t = this.hooks.transport();
    const want = `${this.current}|${t ?? ''}`;
    if (want === this.carFor) return;
    for (const p of this.carParts) p.destroy();
    this.carParts = [];
    this.carImg = null;
    this.carFor = want;
    const v = this.spots.find((s) => s.name === 'obj.vehicle');
    // Табір (GAME-183): авто вже намальоване тайлами стоянки (camp-car) — другого не ставимо; об'єкт мапи лише точка дії біля нього.
    if (!v || t !== 'transport.car' || this.current === 'camp') return;
    const x = v.x + CAR_OFFSET.x;
    const y = v.y + CAR_OFFSET.y;
    const img = this.add.image(x, y, 'camp-car').setOrigin(0.5, 1).setDepth(y);
    this.carParts.push(img);
    this.carImg = { img, x, y };
    const block = this.add.zone(x, y - CAR_BLOCK.h / 2, CAR_BLOCK.w, CAR_BLOCK.h);
    this.physics.add.existing(block, true);
    const col = this.physics.add.collider(this.player, block);
    this.carParts.push(block, col);
  }

  /**
   * 3/4-глибина. Тайли шару `above` (крони, дах) ділимо на смуги за «базовою лінією» — низом найближчого стінного тайла
   * під ними в тому ж стовпці (стовбур, низ намету). Смуга має глибину цієї лінії, а персонаж — свою y ніг: ноги вище
   * лінії (персонаж ПОЗАД деревом) → смуга над ним і закриває; нижче (ПЕРЕД деревом) → персонаж над смугою.
   * Тайл без стінного тайла під собою — завжди над персонажем.
   */
  private makeBands(map: Phaser.Tilemaps.Tilemap, tilesets: Phaser.Tilemaps.Tileset[]): Band[] {
    const above = map.getLayer('above');
    const walls = map.getLayer('walls');
    if (!above || !walls) throw new Error('layers above/walls are missing');
    const groups = new Map<number, { x: number; y: number; index: number }[]>();
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const index = above.data[y]?.[x]?.index ?? -1;
        if (index < 0) continue;
        let base = y;
        while (base < map.height && (walls.data[base]?.[x]?.index ?? -1) < 0) base++;
        const depth = base < map.height ? (base + 1) * TILE : DEPTH.always;
        const g = groups.get(depth) ?? [];
        g.push({ x, y, index });
        groups.set(depth, g);
      }
    }
    return [...groups].map(([depth, tiles]) => {
      const layer = map.createBlankLayer(`above@${depth}`, tilesets, 0, 0, map.width, map.height, TILE, TILE);
      if (!layer || !(layer instanceof Phaser.Tilemaps.TilemapLayer)) throw new Error('band layer failed');
      for (const t of tiles) layer.putTileAt(t.index, t.x, t.y);
      return { layer: layer.setDepth(depth), depth, alpha: 1 };
    });
  }

  /**
   * GAME-210: плями світла з вікон на підлозі (дім, крамниця) — ОДНА статична текстура, намальована при вході на мапу (не щокадру); над запеченою землею,
   * під героєм і меблями-спрайтами. Тепле світло — FIRE_CORE з палітри. Прозорість міняє updateDaylight лише коли доба її змінила; вночі гасне.
   */
  private makePatches(key: MapKey, map: Phaser.Tilemaps.Tilemap): void {
    const ts = map.tilesets.find((t) => t.name === 'home-windows-doors');
    const above = map.getLayer('above');
    if (!ts || !above) return;
    const flat = above.data.flatMap((row) => row.map((t) => t.index));
    const quads = findWindows(flat, map.width, map.height, ts.firstgid).flatMap((w) => patchQuads(w, map.height, TILE));
    if (quads.length === 0) return;
    const xs = quads.flatMap((q) => q.pts.map((p) => p[0]));
    const ys = quads.flatMap((q) => q.pts.map((p) => p[1]));
    const ox = Math.max(0, Math.floor(Math.min(...xs)));
    const oy = Math.max(0, Math.floor(Math.min(...ys)));
    const w = Math.min(map.widthInPixels, Math.ceil(Math.max(...xs))) - ox;
    const h = Math.min(map.heightInPixels, Math.ceil(Math.max(...ys))) - oy;
    const texKey = `light-${key}`;
    if (!this.textures.exists(texKey)) {
      const tex = this.textures.addDynamicTexture(texKey, w, h);
      if (!tex) throw new Error(`light texture ${texKey} failed`);
      const g = this.add.graphics();
      for (const q of quads) {
        g.fillStyle(FIRE_CORE, q.alpha).fillPoints(q.pts.map(([x, y]) => new Phaser.Math.Vector2(x - ox, y - oy)), true);
      }
      tex.draw(g);
      tex.render();
      g.destroy();
    }
    this.patches = this.add.image(ox, oy, texKey).setOrigin(0, 0).setDepth(DEPTH.ground + 1);
    this.owned.push(this.patches);
    this.patchCount = quads.length;
  }

  /** GAME-231: коло світла під кожним ліхтарем мапи (верх ліхтаря й стовп у шарі `above`); текстура одна — радіальний градієнт із палітри, як у вогнища. */
  private makeLamps(map: Phaser.Tilemaps.Tilemap): void {
    const ts = map.tilesets.find((t) => t.name === 'camp-props');
    const above = map.getLayer('above');
    if (!this.daylightOn || !ts || !above) return;
    const lamps = findLamps(above.data.flatMap((row) => row.map((t) => t.index)), map.width, map.height, ts.firstgid);
    if (lamps.length === 0) return;
    if (!this.textures.exists('lamp-glow')) {
      const R = LAMP_RADIUS;
      const tex = this.textures.createCanvas('lamp-glow', R * 2, R * 2);
      if (!tex) throw new Error('texture lamp-glow failed');
      const ctx = tex.getContext();
      const css = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;
      const g = ctx.createRadialGradient(R, R, 0, R, R, R);
      g.addColorStop(0, `${css(FIRE_CORE)}88`);
      g.addColorStop(0.4, `${css(FIRE_GLOW)}30`);
      g.addColorStop(1, `${css(FIRE_GLOW)}00`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, R * 2, R * 2);
      tex.refresh();
    }
    for (const l of lamps) {
      const img = this.add.image(l.x, l.y, 'lamp-glow').setDepth(DEPTH.always + 2).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
      this.owned.push(img);
      this.lampGlows.push(img);
    }
  }

  /** Запекти шари мапи (у заданому порядку) в одну статичну картинку на всю мапу: піксель у піксель те, що малювали б самі шари. */
  private bake(key: string, map: Phaser.Tilemaps.Tilemap, layers: Phaser.Tilemaps.TilemapLayer[]): void {
    const tex = this.textures.addDynamicTexture(key, map.widthInPixels, map.heightInPixels);
    if (!tex) throw new Error(`bake texture ${key} failed`);
    tex.draw(layers);
    tex.render();
  }

  /**
   * GAME-99: день і ніч. Нічна маска — прямокутник на весь екран (scrollFactor 0), що множить кадр на синій; світла пляма вогнища — радіальний
   * градієнт з канви (без файлів), ADD над маскою. Обидва вище за все в світі. Вдень приховані (`visible` у update).
   */
  private makeNight(): void {
    const cam = this.cameras.main;   // розмір маски — з вікна камери (оновлюється в updateDaylight при зміні кадру), а не стала: 4K при zoom 1 теж покрито
    this.night = this.add.rectangle(0, 0, cam.width, cam.height, 0xffffff).setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH.always + 1).setBlendMode(Phaser.BlendModes.MULTIPLY).setVisible(false);
  }

  /** Світла пляма вогнища — лише на мапі, де є вогнище (табір); текстура одна на всі входи в табір. */
  private makeGlow(fire: Pt | null): void {
    if (!fire) return;
    if (!this.textures.exists('fire-glow')) {
      const R = 80;
      const tex = this.textures.createCanvas('fire-glow', R * 2, R * 2);
      if (!tex) throw new Error('texture fire-glow failed');
      const ctx = tex.getContext();
      const css = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;
      const g = ctx.createRadialGradient(R, R, 0, R, R, R);
      g.addColorStop(0, `${css(FIRE_CORE)}ff`);
      g.addColorStop(0.35, `${css(FIRE_GLOW)}99`);
      g.addColorStop(1, `${css(FIRE_GLOW)}00`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, R * 2, R * 2);
      tex.refresh();
    }
    this.glow = this.add.image(fire.x, fire.y - 12, 'fire-glow').setDepth(DEPTH.always + 2).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    this.owned.push(this.glow);
  }

  private updateDaylight(time: number): void {
    const d = this.probe.daylight;
    d.on = this.daylightOn;
    if (!this.night) return;
    const cam = this.cameras.main;
    if (this.night.width !== cam.width || this.night.height !== cam.height) this.night.setSize(cam.width, cam.height);
    const minuteOfDay = timeOfDay(this.bridge.state.clock.minutes);
    const a = ambientAt(minuteOfDay);
    const visible = a.darkness > 0;
    const glow = glowAlpha(a.darkness, time);
    this.night.setVisible(visible);
    if (visible) this.night.setFillStyle(a.color, 1);
    this.glow?.setVisible(visible).setAlpha(glow);
    this.patches?.setAlpha(patchAlpha(a.darkness, MAX_DARKNESS));
    const lamp = lampAlpha(minuteOfDay, a.darkness, time);
    for (const g of this.lampGlows) g.setVisible(lamp > 0).setAlpha(lamp);
    Object.assign(this.probe.lamps, { count: this.lampGlows.length, on: lampsOn(minuteOfDay), alpha: this.lampGlows.length ? lamp : 0, radius: LAMP_RADIUS });
    Object.assign(d, { visible, minuteOfDay, darkness: a.darkness, color: a.color, glow: this.glow ? glow : 0 });
  }

  /** Сплив і звук на дію: підібрав/поклав — «+1» і клацання, крок/авто — «OK» і підтвердження. */
  private feedback(name: string): void {
    const pick = name.startsWith('take.') || name.startsWith('pack.');
    this.fx?.pop(this.player.x, this.player.y, pick ? '+' : 'OK');   // GAME-229: без цифр над героєм («+», не «+1»)
    playUi(pick ? 'press' : 'confirm');
  }

  private unloadOne(): void {
    const res = this.hooks.unload();
    if (res === 'none') return;
    this.fx?.pop(this.player.x, this.player.y, res === 'ok' ? '+' : '!');
    playUi(res === 'ok' ? 'press' : 'back');
  }

  /**
   * GAME-202/203: роботи родини на цей кадр. Доручення — з фактів ядра (hooks.errands: лише живі справи, тож зроблена чи спізнена справа знімає роботу сама);
   * відтяжки намету — поки тато б'є кілки (tent.phase peg) і помічник у tentHelpers. Робота, що триває, зберігає свій стан (ціль-тайл, секунди праці).
   */
  /** GAME-216: заставка скінчилась (або її не було) — камера стежить за героєм, як завжди. */
  private endReveal(): void {
    this.reveal = null;
    this.revealSkip = false;
    if (this.player) this.cameras.main.startFollow(this.player, true, 1, 1);
  }

  private planJobs(): void {
    const errands = this.hooks.errands?.() ?? [];
    const helperSpots = this.tent.helperSpots();
    if (!this.tent.active) this.tentHelpers = [];   // намет поставлено чи справу закрито інакше — відтяжки відпущено (у фазі розміщення помічники ще чекають у строю)
    FOLLOWERS.forEach((name, i) => {
      const was = this.jobs[i] ?? null;
      const e = errands.find((x) => x.member === name);
      const at = e ? this.spots.find((x) => x.name === e.spot) : undefined;
      if (e && at) { this.jobs[i] = was?.kind === 'errand' && was.task === e.task ? was : { kind: 'errand', task: e.task, spot: { x: at.x, y: at.y }, goal: null, workS: 0, sent: false }; return; }
      const k = this.tentHelpers.indexOf(i);
      const hs = k >= 0 ? helperSpots[k] : undefined;
      if (hs) { this.jobs[i] = was?.kind === 'tent' ? was : { kind: 'tent', spot: hs, goal: null }; return; }
      this.jobs[i] = null;
    });
  }

  /**
   * Тайл, на якому стоять біля `spot`: сусід тайла цілі з найкоротшим шляхом від `from` (сам тайл цілі — ні: закрив би позначку); нема — тайл цілі, якщо вільний.
   * `exact` — стати на сам тайл точки (місце помічника біля намету), якщо він прохідний.
   */
  private standTile(from: Pt, spot: Pt, exact = false): Tile | null {
    const t = tileOf(this.grid, spot);
    const own = tileOf(this.grid, from);
    if (exact && !isSolid(this.grid, t) && findPath(this.grid, own, t)) return t;
    let best: Tile | null = null;
    let bestLen = Infinity;
    for (const d of [{ c: 0, r: 1 }, { c: -1, r: 0 }, { c: 1, r: 0 }, { c: 0, r: -1 }]) {
      const n = { c: t.c + d.c, r: t.r + d.r };
      if (isSolid(this.grid, n)) continue;
      const len = findPath(this.grid, own, n)?.length ?? Infinity;
      if (len < bestLen) { best = n; bestLen = len; }
    }
    if (best) return best;
    return !isSolid(this.grid, t) && findPath(this.grid, own, t) ? t : null;
  }

  /** GAME-112: родина йде за героєм у обхід стін (GAME-173: вільним строєм); поки він стоїть — кожен на своїй точці дозвілля. Анімація й напрямок — з зсуву за кадр.
   *  GAME-202/203: хто має роботу (доручення, відтяжка намету) — іде до неї сам і працює руками; у строю лишаються вільні. */
  private moveFollowers(deltaMs: number, time: number, moving: boolean): void {
    const dt = Math.min(deltaMs / 1000, MAX_FOLLOW_DT);
    const before = this.chain.map((p) => ({ x: p.x, y: p.y }));
    const hero = this.swim.inWater ? { ...this.swim.lastLand } : { x: this.player.x, y: this.player.y };   // GAME-227: герой у воді — родина чекає на березі, де він зайшов
    this.planJobs();
    // Дозвілля: герой простояв IDLE_AFTER_S — точки роздаються один раз (до наступного руху), без випадковості.
    if (moving) { this.idleS = 0; this.leisure = null; } else this.idleS += dt;
    if (!this.leisure && this.idleS >= IDLE_AFTER_S) {
      const avoid = new Set(this.spots.map((s) => { const t = tileOf(this.grid, s); return t.r * this.grid.cols + t.c; }));
      this.leisure = assignLeisure(this.grid, hero, this.chain.length, this.leisureSpots, avoid);
    }
    const plan = this.leisure;
    const rest = this.chain.filter((_, i) => !plan?.[i] && !this.jobs[i]);
    const parked = (plan ?? []).flatMap((l) => (l ? [centerOf(this.grid, l)] : []));
    const busy = this.chain.filter((_, i) => this.jobs[i]);
    if (rest.length > 0) stepFollowers(this.grid, hero, rest, dt, SPEED * FOLLOW_SPEED_FACTOR, [...this.spots, ...parked, ...busy], this.heading);
    this.chain.forEach((p, i) => {
      const s = this.followSprites[i];
      const b = before[i];
      const out = this.probe.followers[i];
      const name = FOLLOWERS[i];
      if (!s || !b || !out || !name) return;
      const job = this.jobs[i] ?? null;
      const spot = job ? null : plan?.[i] ?? null;
      let arrived = false;
      let working = false;
      if (job) {
        // До місця роботи — своїм шляхом у обхід стін; дійшов — лицем до цілі й руки в роботу (thrust по колу).
        job.goal ??= this.standTile(p, job.spot, job.kind === 'tent');
        arrived = job.goal ? stepTo(this.grid, p, job.goal, dt, SPEED * FOLLOW_SPEED_FACTOR) : true;
        if (arrived) {
          working = true;
          this.followFacing[i] = facingToward(p, job.spot);
          if (job.kind === 'errand') {
            job.workS += dt;
            if (!job.sent && job.workS >= ERRAND_WORK_S) { if (this.hooks.onErrand?.(job.task) === false) { job.workS = 0; } else { job.sent = true; this.fx?.pop(p.x, p.y, 'OK'); playUi('confirm'); } }
          }
        }
      } else if (spot) arrived = stepTo(this.grid, p, spot, dt, SPEED * FOLLOW_SPEED_FACTOR);
      const dx = p.x - b.x;
      const dy = p.y - b.y;
      if (dx !== 0 || dy !== 0) this.followFacing[i] = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
      if (arrived && spot) this.followFacing[i] = spot.face;
      // GAME-212: сплеск поруч — стоячий слідувач на мить дивиться на воду (лише напрямок).
      const still = dx === 0 && dy === 0 && !working;
      this.followStand[i] = still ? (this.followStand[i] ?? 0) + deltaMs : 0;
      const look = this.followLook[i];
      if (look && look.s > 0) { look.s -= dt; if (still) this.followFacing[i] = look.dir; }
      const dir = this.followFacing[i] ?? 'down';
      if (working) s.anims.play(`work-${name}-${dir}`, true);
      else {
        if (s.texture.key !== name) s.setTexture(name, frameIndex(dir, 0));   // повернувся з роботи — знову лист ходьби
        if (dx !== 0 || dy !== 0) s.anims.play(`walk-${name}-${dir}`, true);
        else { s.anims.stop(); s.setFrame(frameIndex(dir, 0)); }
      }
      // Лише картинка гойдається на 1 px (проба й глибина — по справжній точці).
      const bob = arrived && spot ? Math.round(Math.sin(time / 380 + i * 2.1)) : idleBob(this.followStand[i] ?? 0, i);
      s.setPosition(p.x, p.y + bob).setDepth(p.y);
      out.x = p.x;
      out.y = p.y;
      this.probe.leisure[i] = arrived && spot ? { kind: spot.kind, c: spot.c, r: spot.r } : null;
      this.probe.jobs[i] = job ? (job.kind === 'errand' ? { kind: 'errand', task: job.task, phase: working ? 'work' : 'walk' } : { kind: 'tent', phase: working ? 'pull' : 'walk' }) : null;
    });
  }

  /** GAME-172: мешканці стають туди, де їх ставить розклад о цей ігровий час; тиша, поки годинник стоїть (пауза). */
  private stepMs = 0;   // GAME-212: мс кадру для moveResidents
  private moveResidents(time: number): void {
    const clock = this.bridge.state.clock;
    const minutes = clock.minutes + clock.accMs / STEP_MS;
    if (this.talkingTo !== null && this.bridge.state.game.dialogue === null) this.talkingTo = null;
    this.neigh.setTalking(this.talkingTo);
    this.residentLines.forEach((tl, i) => {
      const s = this.residentSprites[i];
      if (!s || !tl) return;
      const out = i < RESIDENTS.length ? this.probe.residents[i] : this.probe.visitors.find((v) => v.id === tl.resident.id);
      if (!out) return;
      if (this.current === 'camp' && i < RESIDENTS.length) {
        // GAME-226: сусід табору — стани, дорога додому, привітання (neighbours.ts); probe.residents лишається логічною точкою розкладу (game-211).
        const q = this.neigh.drive(i, s, this.walkGrid, tl, minutes, this.player ? { x: this.player.x, y: this.player.y } : null, this.lifeRain, this.residentBark?.npc === i, this.residentFacing[i] ?? 'down');
        const pq = this.lastRes[i] ?? q;
        const movedQ = Math.hypot(q.x - pq.x, q.y - pq.y) > 0.05;
        this.lastRes[i] = { x: q.x, y: q.y };
        this.resStand[i] = movedQ || q.moving ? 0 : (this.resStand[i] ?? 0) + this.stepMs;
        const sched = placeAt(this.grid, tl, minutes);   // probe.residents — ТОЧКА РОЗКЛАДУ (її звіряють картки, game-211); де сусід насправді (дім, ніч) — probe.neighbours
        out.x = sched.x; out.y = sched.y; out.moving = sched.moving;
        return;
      }
      const p = placeAt(this.grid, tl, minutes);
      const moved = Math.hypot(p.x - out.x, p.y - out.y) > 0.05;   // з логічною точкою: зсув дихання на спрайті рухом не вважається
      const dir = p.moving ? p.dir : this.residentFacing[i] ?? 'down';
      this.residentFacing[i] = dir;
      if (moved && p.moving) s.anims.play(`walk-res-${tl.resident.look}-${dir}`, true);
      else { s.anims.stop(); s.setFrame(frameIndex(dir, 0)); }
      this.resStand[i] = moved || p.moving ? 0 : (this.resStand[i] ?? 0) + this.stepMs;
      s.setPosition(p.x, p.y + idleBob(this.resStand[i] ?? 0, i)).setDepth(p.y);
      out.x = p.x;
      out.y = p.y;
      out.moving = moved && p.moving;
    });
    if (this.player) this.updateBark(time);   // в create героя ще нема — лише розставляємо мешканців
  }

  private hideBark(): void {
    this.residentBark?.text.destroy();
    this.residentBark = null;
    this.probe.bark = null;
  }

  /** Репліка над головою мешканця, коли герой підійшов ближче за BARK_RANGE: одна за раз, по колу, раз на BARK_COOLDOWN_MS на мешканця. */
  private updateBark(time: number): void {
    const bark = this.residentBark;
    if (bark) {
      const s = this.residentSprites[bark.npc];
      // Герой пішов геть — репліка зникає (не висить над порожнім місцем); край кадру не обрізає її.
      if (!s || time >= bark.until || Math.hypot(this.player.x - s.x, this.player.y - s.y) > BARK_RANGE * 1.6) { this.hideBark(); return; }
      const view = this.cameras.main.worldView;
      const half = bark.text.width / 2 + 2;
      bark.text.setPosition(Math.round(Phaser.Math.Clamp(s.x, view.x + half, view.right - half)), Math.round(Math.max(s.y - 52, view.y + bark.text.height + 2)));
      return;
    }
    for (let i = 0; i < CAST.length; i++) {
      const s = this.residentSprites[i];
      const res = CAST[i];
      if (!s || !res || res.barks.length === 0 || !this.residentLines[i] || time < (this.barkReadyAt[i] ?? 0)) continue;
      if (Math.hypot(this.player.x - s.x, this.player.y - s.y) > BARK_RANGE) continue;
      if (this.current === 'camp' && this.neigh.state(i) === 'sleep') continue;   // GAME-226: сплячий не кидає репліку
      const n = this.barkNext[i] ?? 0;
      const key = res.barks[n % res.barks.length] as Key;
      this.barkNext[i] = n + 1;
      this.barkReadyAt[i] = time + BARK_COOLDOWN_MS;
      const text = this.add.text(s.x, s.y - 52, this.barkText(key), { fontFamily: 'CampPixel, monospace', fontSize: '8px', color: '#f4f1e8', backgroundColor: '#1b1f23dd', padding: { x: 4, y: 3 }, wordWrap: { width: 140 }, align: 'center' })
        .setOrigin(0.5, 1).setDepth(DEPTH.always + 1);
      this.residentBark = { text, until: time + BARK_SHOW_MS, npc: i };
      this.probe.bark = key;
      this.probe.barkCount++;
      return;
    }
  }

  /** GAME-179: співрозмовники, що рухаються (мешканці табору за розкладом і родина-слідувачі): точка розмови — де вони стоять зараз. Лише ті, з ким ядро говорить. */
  private talkers(): Spot[] {
    const out: Spot[] = [];
    if (this.current === 'camp') {
      RESIDENTS.forEach((r, i) => {
        const s = this.residentSprites[i];
        if (s?.visible && this.hooks.talk(r.id)) out.push({ name: r.id, kind: 'npc', x: s.x, y: s.y });
      });
    }
    FOLLOWER_NPC.forEach((id, i) => {
      const s = this.followSprites[i];
      if (s && this.hooks.talk(id)) out.push({ name: id, kind: 'npc', x: s.x, y: s.y });
    });
    return out;
  }

  /** Спрайт співрозмовника за id (нерухомий NPC мапи, мешканець чи слідувач) і куди записати його напрямок. */
  private sprite(id: string): { s: Phaser.GameObjects.Sprite; face: (d: Dir) => void } | null {
    const ri = RESIDENTS.findIndex((r) => r.id === id);
    const rs = this.residentSprites[ri];
    if (ri >= 0 && rs) return { s: rs, face: (d) => { this.residentFacing[ri] = d; this.neigh.hold(ri); } };
    const fi = FOLLOWER_NPC.findIndex((n) => n === id);
    const fs = this.followSprites[fi];
    if (fi >= 0 && fs) return { s: fs, face: (d) => { this.followFacing[fi] = d; } };
    const ns = this.npcSprites.get(id);
    return ns ? { s: ns, face: () => { this.faced = id; } } : null;
  }

  /** GAME-179: заговорили — NPC повертається обличчям до героя (і зупиняє ходу: розклад мешканців стоїть разом із годинником на паузі), герой — до NPC. */
  private faceEachOther(npc: Spot): void {
    const sp = this.sprite(npc.name);
    if (!sp) return;
    const toHero = facingToward(sp.s, this.player);
    sp.face(toHero);
    sp.s.anims.stop();
    sp.s.setFrame(frameIndex(toHero, 0));
    this.facing = facingToward(this.player, sp.s);
    if (this.acting) { this.player.off(Phaser.Animations.Events.ANIMATION_COMPLETE); this.acting = null; this.player.setTexture('player'); }   // GAME-191: розмова обриває дію
    this.player.anims.stop();
    this.player.setFrame(frameIndex(this.facing, 0));
    this.hideBark();
  }

  /** GAME-212: дихання героя (зсув спрайта, що знімається в PRE_UPDATE) і гліфи-емоції: ♪ — мешканець, що стоїть увечері; ? — над героєм, коли клює. */
  private updateEmotes(time: number, delta: number, moving: boolean): void {
    this.heroStandMs = moving || this.acting || this.fish.busy ? 0 : this.heroStandMs + delta;
    const look = this.life.sitLook;
    const bend = this.life.bend;
    if (look && !this.sitCropped) { this.player.setCrop(0, 0, FRAME, look.rows); this.sitCropped = true; }
    else if (!look && this.sitCropped) { this.player.setCrop(); this.sitCropped = false; }
    this.player.setScale(1, 1 - 0.1 * bend);   // GAME-225: колонка — герой нахиляється
    const hb = look ? look.dy : idleBob(this.heroStandMs) + Math.round(bend * 2);
    if (hb && !this.heroBob) { this.player.y += hb; this.heroBob = hb; }
    const evening = isEvening(timeOfDay(this.bridge.state.clock.minutes));
    const marks: { at: Pt; kind: Glyph }[] = [];
    if (this.current === 'camp' && evening) RESIDENTS.forEach((r, i) => { const s = this.residentSprites[i]; if (s?.visible && (this.resStand[i] ?? 0) > 2000 && this.residentBark?.npc !== i && !this.neigh.quiet(i) && this.hooks.talk(r.id) === null) marks.push({ at: { x: s.x, y: s.y - 50 }, kind: 'note' }); });
    if (this.fish.phase === 'bite') marks.push({ at: { x: this.player.x, y: this.player.y - 56 }, kind: 'ask' });
    marks.forEach((m, k) => {
      let g = this.emoteG[k];
      if (!g) { g = this.add.graphics().setDepth(DEPTH.always); this.emoteG[k] = g; }
      drawGlyph(g, m.kind);
      g.setPosition(Math.round(m.at.x), Math.round(m.at.y + Math.sin(time / 300 + k) * 1.5)).setVisible(true);
    });
    for (let k = marks.length; k < this.emoteG.length; k++) this.emoteG[k]?.setVisible(false);
  }

  /** GAME-179: маркер над кожним, з ким можна говорити: «…» поруч, «!» коли є прохання. Бульба стоїть над головою, трохи гойдається; репліка-«бурчання» її заступає. */
  private updateNpcMarks(time: number): void {
    const hero = this.player;
    const seen = new Set<string>();
    const consider = (id: string, s: Phaser.GameObjects.Sprite | undefined, barking: boolean): void => {
      if (!s || !s.visible || barking) return;
      const t = this.hooks.talk(id);
      const kind = markerFor(t !== null, t?.request === true, Math.hypot(hero.x - s.x, hero.y - s.y));
      if (!kind) return;
      seen.add(id);
      let m = this.npcMarks.get(id);
      if (!m) { m = { g: this.add.graphics().setDepth(DEPTH.always), kind: null }; this.npcMarks.set(id, m); }
      if (m.kind !== kind) { drawMarker(m.g, kind); m.kind = kind; }
      m.g.setPosition(Math.round(s.x), Math.round(s.y - 50 + Math.sin(time / 260 + s.x) * 1.5)).setVisible(true);
    };
    for (const [id, s] of this.npcSprites) consider(id, s, false);
    RESIDENTS.forEach((r, i) => consider(r.id, this.current === 'camp' ? this.residentSprites[i] : undefined, this.residentBark?.npc === i));
    FOLLOWER_NPC.forEach((id, i) => consider(id, this.followSprites[i], false));
    for (const [id, m] of this.npcMarks) if (!seen.has(id)) m.g.setVisible(false);
    // Нерухомий NPC, що дивився на героя, повертається «вниз», коли той відійшов.
    if (this.faced) {
      const f = this.npcSprites.get(this.faced);
      if (!f || Math.hypot(hero.x - f.x, hero.y - f.y) > INTERACT_RANGE * 1.5) { f?.setFrame(frameIndex('down', 0)); this.faced = null; }
    }
  }

  /** Рід землі під точкою світу — за шаром `ground` живої мапи (дані тайлів лишаються й після запікання в картинку). */
  private groundAt(x: number, y: number): Ground {
    const layer = this.tilemap?.getLayer('ground');
    if (!layer || this.terrain.count === 0) return 'none';
    const gid = layer.data[Math.floor(y / TILE)]?.[Math.floor(x / TILE)]?.index ?? -1;
    return groundKind(gid, this.terrain.first, this.terrain.count);
  }

  /** Межа паузи: зупинити тіло, інакше фізика дотягує стару швидкість після продовження (рецензія PR #13). */
  haltPlayer(): void {
    if (!this.player) return;
    this.player.setVelocity(0, 0);
    this.player.body.reset(this.player.x, this.player.y);
  }

  /** Лічильник кадрів для probe.fps: дешево (два числа), без виділення пам'яті на кадр. */
  private countFps(time: number): void {
    if (this.fpsStart < 0) this.fpsStart = time;
    this.fpsFrames++;
    const span = time - this.fpsStart;
    if (span < FPS_WINDOW_MS) return;
    this.probe.fps = (this.fpsFrames * 1000) / span;
    this.probe.fpsWindows++;
    this.fpsFrames = 0;
    this.fpsStart = time;
  }

  override update(time: number, delta: number): void {
    // GAME-97: годинник ядра — від сирої дельти кадру, а не від згладженої. Phaser 120 кадрів після старту (і поза фокусом)
    // ріже дельту до 16,7 мс, а понад 200 мс підміняє останньою «нормальною»: при 8 fps годинник ішов у 8 разів повільніше
    // за реальний час. Межу кадру (згорнута вкладка) тримає сам міст — MAX_FRAME_MS.
    this.bridge.frame(this.game.loop.rawDelta);
    this.countFps(time);
    if (!this.player) return;   // update може випередити create лише в першому кадрі завантаження
    // GAME-175: локація гравця змінилась (приїхав у крамницю, повернувся додому) — інша мапа; той самий кадр уже на ній.
    const want = this.hooks.mapKey();
    if (want !== this.current) this.enterMap(want, true);
    else this.placeCar();
    // GAME-194: фон за станом — чиста функція ambientMix; перехід і гучність — у модулі звуку.
    const pp = { x: this.player.x, y: this.player.y };
    ambient.setAmbient(ambientMix({ map: this.current, intro: isIntroOpen(), nearLake: this.current === 'camp' && this.fish.near(pp, LAKE_EAR), fireLit: this.fire.lit || this.fire.phase === 'done',
      nearFire: this.fire.near(pp, FIRE_EAR), transport: this.hooks.transport(), swimming: this.swim.inWater }));
    ambient.tick(delta);
    // GAME-207: тема за мапою, вступом і годиною доби — чиста функція musicFor; перехід — у модулі звуку.
    music.setTrack(musicFor({ map: this.current, intro: isIntroOpen(), minuteOfDay: timeOfDay(this.bridge.state.clock.minutes) }));
    music.tick(delta);
    // GAME-231: цвіркуни й сова вночі в таборі — звук лише через src/audio; час — ігрова хвилина (дробова), без таймерів.
    const nightClock = this.bridge.state.clock;
    nightSounds.tick(delta, { map: this.current, intro: isIntroOpen(), raining: this.lifeRain, minuteOfDay: timeOfDay(nightClock.minutes + nightClock.accMs / STEP_MS) });
    const lifeDay = dayOf(this.bridge.state.clock);   // GAME-225: день й дощ для табору (калюжі, раз на день)
    if (lifeDay !== this.lifeDay) { this.lifeDay = lifeDay; this.lifeRain = weatherOf(this.bridge.state.worldSeed, lifeDay) === 'rain'; }
    const held = consumeFrame(this.controls);
    // GAME-216: заставка приїзду — камера по таблиці бітів; будь-яка клавіша, дотик чи кінець таблиці — камера знову на героєві.
    if (this.reveal) {
      this.reveal.elapsed += delta;
      const c = held.size > 0 || this.revealSkip || this.tap !== null ? null : revealCenter(this.reveal.elapsed, this.reveal.anchors, REVEAL_BEATS);
      if (c) this.cameras.main.centerOn(c.x, c.y); else this.endReveal();
    }
    // GAME-189: поки герой б'є кілки — стоїть; розміщення намету — ходить вільно (привид іде за ним).
    const handsBusy = this.tent.holdsHero || this.wood.holdsHero || this.fire.holdsHero || this.grill.holdsHero || this.fish.busy || this.life.holdsHero;   // GAME-228: стоп героя після розбивання
    const vIn = handsBusy ? { x: 0, y: 0 } : moveVector(held);
    // GAME-225: лавка. Зайшов на точку — сів (стоїть на ній, ноги сховані); будь-який рух — встав.
    const seatEv = this.life.stepSeat(delta, { x: this.player.x, y: this.player.y }, vIn.x !== 0 || vIn.y !== 0, handsBusy || this.acting !== null || this.swim.inWater || this.current !== 'camp');
    const seat = this.life.seatPoint;
    if (seatEv === 'sit' && seat) { this.player.body.reset(seat.x, seat.y); this.player.setPosition(seat.x, seat.y); this.last = { x: seat.x, y: seat.y }; this.facing = seat.face; }
    const v = this.life.sitting ? { x: 0, y: 0 } : vIn;
    // Рухається той, хто справді зсунувся з минулого кадру (по зсуву, а не по швидкості — вона лишається, коли тіло вперлося в стіну): упертий у стіну персонаж стоїть, а не «іде на місці».
    const movedPx = Math.hypot(this.player.x - this.last.x, this.player.y - this.last.y);
    const moving = movedPx > 0.25;
    if (moving) this.heading = { x: this.player.x - this.last.x, y: this.player.y - this.last.y };
    this.last = { x: this.player.x, y: this.player.y };
    // GAME-191: під час дії (замах, удар, руки) герой стоїть і дивиться туди, куди почав, — без «замаху на бігу» (рецензія #118).
    const swimK = this.swim.update(time, delta, { moving, movedPx, facing: this.facing, pets: [...this.miaSprites.values()].filter((m) => m.visible) });   // GAME-227: у глибині −40 %
    this.player.setVelocity(this.acting ? 0 : v.x * SPEED * swimK, this.acting ? 0 : v.y * SPEED * swimK);
    if (!this.acting && (v.x !== 0 || v.y !== 0)) {
      const horizontal = v.x !== 0 && (v.y === 0 || this.facing === 'left' || this.facing === 'right');
      this.facing = horizontal ? (v.x < 0 ? 'left' : 'right') : (v.y < 0 ? 'up' : 'down');
    }
    if (this.acting) { /* GAME-191: триває анімація дії — ходьба її не перебиває */ }
    else if (moving) this.player.anims.play(`walk-${this.facing}`, true);
    else { this.player.anims.stop(); this.player.setFrame(frameIndex(this.facing, 0)); }
    this.player.setDepth(this.player.y);

    const target = this.hooks.target();
    for (const [name, m] of this.markers) {
      const on = this.hooks.isLive(name);
      m.g.setVisible(on);
      if (!on) continue;
      const look = this.hooks.look(name);
      const sig = name === 'obj.vehicle' || name === 'obj.trunk' ? `${look}|${this.hooks.transport() ?? ''}` : look;
      if (sig !== m.look) this.draw(m, name, look, sig);
      m.img?.setY(ICON_Y - Math.round(Math.abs(Math.sin(time / 420)) * 2));   // GAME-201: ніжне гойдання, покадрово від часу сцени
      m.g.setScale(name === target && this.hintOn ? 1 + 0.2 * Math.abs(Math.sin(time / 280)) : 1);   // ціль підказки «Далі:» — пульсує
    }
    for (const [name, sp] of this.npcSprites) sp.setVisible(this.hooks.isLive(name));
    const talkers = this.talkers();
    const live = [...this.spots.filter((s) => this.hooks.isLive(s.name)), ...talkers];
    // GAME-179/186: родина тупцює коло героя — говорить із нею лише тоді, коли в зоні дії нікого іншого нема; між слідувачами перевага тому, на кого дивиться герой.
    const isFollower = (n: string): boolean => (FOLLOWER_NPC as readonly string[]).includes(n);
    const nearName = pickNearest(this.player.x, this.player.y, this.facing, live.map((s) => ({ name: s.name, x: s.x, y: s.y, follower: isFollower(s.name) })), INTERACT_RANGE);
    const spot: Spot | null = nearName === null ? null : live.find((s) => s.name === nearName) ?? null;
    const near = spot?.name ?? null;
    // Тап: лише по цілі, що в зоні дії. Поза зоною нічого (без прокладання шляху, GAME-95).
    const tapped = this.tap;
    this.tap = null;
    const tapSpot = tapped ? live.find((s) => Phaser.Math.Distance.Between(this.player.x, this.player.y, s.x, s.y) <= INTERACT_RANGE && tapHitsSpot(s, tapped)) ?? null : null;
    const act = tapSpot ?? spot;
    const dt = Math.min(delta / 1000, MAX_FOLLOW_DT);
    this.tent.update(delta, this.facing, time);
    // GAME-190: дрова й вогнище руками. Рига живе, поки відповідна справа жива на мапі табору; поза табором чи коли справу закрито — зникає.
    const inCamp = this.current === 'camp';
    const woodLive = inCamp && this.hooks.isLive('take.item.firewood');
    const woodSpot = this.spots.find((x) => x.name === 'take.item.firewood');
    if (woodLive && woodSpot && this.wood.phase === 'idle') this.wood.begin({ x: woodSpot.x, y: woodSpot.y });
    else if (!woodLive && this.wood.phase !== 'idle') this.wood.reset();
    this.wood.muted = this.fish.busy;
    this.wood.update(delta);
    this.props.update(delta, { x: this.player.x, y: this.player.y }, INTERACT_RANGE, this.hooks.isLive(REPAIR_SPOT));
    const fireDue = inCamp && (this.hooks.fireDue?.() ?? false);
    const fireSpot = this.spots.find((x) => x.name === 'obj.campfire');
    if (fireDue && fireSpot && this.fire.phase === 'idle') this.fire.begin({ x: fireSpot.x, y: fireSpot.y }, this.fireSprite);
    else if (!fireDue && this.fire.phase !== 'idle' && this.fire.phase !== 'lit') this.fire.reset();
    const nearFire = this.fire.near({ x: this.player.x, y: this.player.y }, INTERACT_RANGE);
    const fireEvents = this.fire.update(delta, held.has('interact') && nearFire, time);
    for (const e of fireEvents) {
      if (e === 'lit' || e === 'fizzle') this.playAction('cast', facingToward(this.player, this.fire.point()));
      if (e === 'done') {
        this.fire.finish();
        // GAME-195: взяту рибку смажимо руками (патичок → «не спали»), і лише потім вечірня сцена.
        if (this.hooks.grillDue?.() && this.grill.phase === 'idle') this.grill.begin(this.fire.point());
        else this.hooks.onObject('obj.campfire');
      }
    }
    // GAME-193: риболовля на озері. Початок — утримання дії біля берега, коли поруч немає сюжетної цілі-тригера (поруч лише люди: коли герой дивиться на сусіда, дія — розмова, GAME-196; інакше — вудка); далі автомат сам веде фази, а дія тут не робить нічого іншого.
    const fishFrame = { down: held.has('interact'), near: (spot === null || (spot.kind === 'npc' && !talkBeatsFishing(this.player, this.facing, spot))) && !this.tent.active && !this.swim.inWater && this.fish.near({ x: this.player.x, y: this.player.y }, INTERACT_RANGE), left: held.has('left'), right: held.has('right'), tap: tapped, time };
    const grillEvents = this.grill.update(delta, held.has('interact') && nearFire, time);
    for (const e of grillEvents) {
      if (e === 'char') this.playAction('cast', facingToward(this.player, this.grill.point()));
      if (e === 'done') { const ch = this.grill.charred; this.grill.finish(); this.hooks.onGrilled?.(ch); this.hooks.onHand?.('grill'); this.hooks.onObject('obj.campfire'); this.grill.reset(); }
    }
    const water = this.fish.water();
    const fishWas = this.fish.busy;   // кадр, у якому рибалка щойно скінчилась (вибір поклав кнопкою дії), дію теж забирає: інакше та сама дія заводила б розмову з сусідом
    for (const e of this.fish.update(delta, fishFrame)) {
      if (e === 'charge' && water) this.faceTo(water);
      if (e === 'cast' && water) this.playAction('thrust', facingToward(this.player, water));
      if (e === 'kept' || e === 'released') { this.hooks.onFish?.(e === 'kept'); this.hooks.onHand?.('fish'); }
    }
    // GAME-206: живі дрібниці — трава й пил під ногами (за тайлом землі), іскри над запаленим вогнищем, дим і погойдування авто на дорозі (двигун чекає).
    const sway = this.live.update(time, delta, {
      hero: { x: this.player.x, y: this.player.y }, heading: this.heading, moving, movedPx, ground: this.groundAt(this.player.x, this.player.y),
      fire: this.fireSprite?.visible ? { x: this.fireSprite.x, y: this.fireSprite.y } : null,
      car: this.carImg && this.current === 'road' ? { x: this.carImg.x, y: this.carImg.y, back: -1 } : null,
    });
    this.life.update(delta, { hero: { x: this.player.x, y: this.player.y }, moving, movedPx, day: lifeDay, rain: this.lifeRain, toastAt: { x: this.cameras.main.worldView.x + 6, y: this.cameras.main.worldView.bottom - this.insets.bottom }, animals: this.petPoints(), hintOn: !handsBusy && this.acting === null && !this.wood.active && !this.tent.active && (act === null || isFollower(act.name)) });
    if (this.carImg) this.carImg.img.setY(this.carImg.y + (sway?.dy ?? 0)).setRotation(sway?.angle ?? 0);
    const carrying = this.hooks.backpack() > 0;
    this.fx?.tick(dt);
    const reward = this.hooks.takeReward();
    // GAME-181 → GAME-229: «+15 XP +10 ОМ» над героєм більше не малюється (game-feel: під час дії цифр нема, прогрес — відгук і екран рангів). Подію лічимо для проби.
    if (reward) { this.rewardPops++; this.rewardLast = reward; }
    const atCar = near === 'obj.vehicle' || near === 'obj.trunk';
    const needs = this.hooks.needs();
    // Скорочення E/тап — миттєво. Біля авто з рюкзаком воно розвантажує (а не їде).
    // GAME-189: намет руками. E/кнопка/тап по спойлеру-цілі task.pitch-tent починає розміщення; далі кожна дія — розміщення чи удар по кілку. Справа в ядрі закривається лише після 4-го влучання.
    const pressed = this.gate(held.has('interact') || (this.tent.active || this.wood.chopping ? tapped !== null : tapSpot !== null), time);
    const woodBranch = this.wood.active ? this.wood.nearBranch({ x: this.player.x, y: this.player.y }, INTERACT_RANGE) : null;
    // GAME-225: жива річ табору (сосна, кущ, колонка, смітник, дошка) — лише коли поруч нема сюжетної цілі (як ящик).
    const lifeHit = pressed && inCamp && (act === null || isAutoSpot(act.name) || isFollower(act.name)) ? this.life.pick({ x: this.player.x, y: this.player.y }, this.petPoints()) : null;
    const woodBlock = this.wood.active && this.wood.atBlock({ x: this.player.x, y: this.player.y }, INTERACT_RANGE);
    if (this.grill.active) {
      // GAME-195: рибка на вогнищі забирає дію (нанизати, підняти): інша справа чи розмова чекає.
      if (pressed && this.grill.skewering) { this.faceTo(this.grill.point()); this.grill.act(); this.playAction('cast', facingToward(this.player, this.grill.point())); }
    } else if (fishWas || this.fish.busy) {
      // GAME-193: риболовля забирає дію (закид, підсікання, вибір) — розмови й інші справи чекають, поки гравець закінчить.
    } else if (this.tent.active) {
      if (pressed) {
        const e = this.tent.act(this.facing);
        if (e === 'hit' || e === 'done') this.playAction('thrust', this.tent.strikeDir);   // GAME-190: справжній рух героя на кожен кілок
        if (e === 'done') { this.tent.finish(); this.hooks.onObject('task.pitch-tent'); this.hooks.onHand?.('tent'); }
      } else if (!this.hooks.isLive('task.pitch-tent')) this.tent.reset();
    } else if (pressed && this.fire.stacking && nearFire) {
      this.faceTo(this.fire.point());
      this.fire.act();
    } else if (pressed && this.wood.active && (this.wood.chopping || woodBranch !== null || woodBlock)) {
      const bp = this.wood.blockPoint();
      if (woodBranch === null || this.wood.chopping) this.faceTo(bp);
      const e = this.wood.act(this.wood.chopping ? null : woodBranch, woodBlock);
      if (e === 'hit' || e === 'done' || e === 'miss') this.playAction('slash', facingToward(this.player, bp));   // GAME-190: удар сокирою — справжній рух героя
      if (e === 'done') { this.wood.finish(); this.hooks.onObject('take.item.firewood'); this.hooks.onHand?.('wood'); }
    } else if (pressed && this.fire.matching && nearFire) {
      // Сірник — це утримання (fire.update вище): поки руки біля вогнища, дія не заводить розмову з сусідом поруч (Сара біля вогнища ставила гру на паузу посеред сірника, CI #120).
    } else if (pressed && act?.name === 'take.item.firewood') {
      // Дрова беруться лише руками (гілки → колода → удари): E біля купи без гілок нічого не бере; рига ще не стартувала (кадр до begin) — теж.
    } else if (pressed && act?.name === 'obj.campfire' && this.fire.phase !== 'idle' && this.fire.phase !== 'done') {
      // Вогнище, що чекає на вогонь, — лише руками (поліна → сірник); поліна й сірник вище, тут — коли герой ще не готовий (сірник, а не полінця).
    } else if (pressed && act?.name === 'task.pitch-tent') {
      const at = this.spots.find((x) => x.name === 'task.pitch-tent');
      if (at) {
        // GAME-203: хто з родини поруч і вільний — тягне відтяжки (кілків на руки тата менше: tent-pitch pegsFor); зайняті дорученням чи далекі — ні.
        this.tentHelpers = this.hooks.tentAlone?.() ? [] : this.chain.flatMap((p, i) => {
          if (this.jobs[i]?.kind === 'errand') return [];
          const way = findPath(this.grid, tileOf(this.grid, p), tileOf(this.grid, at));
          return way !== null && way.length - 1 <= HELPER_REACH_STEPS ? [i] : [];
        }).slice(0, MAX_HELPERS);
        this.tent.begin({ x: at.x, y: at.y }, (x, y) => { const t = tileOf(this.grid, { x, y }); return isSolid(this.grid, t); }, this.spots.filter((x) => x.name !== 'task.pitch-tent' && this.hooks.isLive(x.name)).map((x) => ({ x: x.x, y: x.y })), this.tentHelpers.length);
      }
    } else if (pressed && this.props.crateNear({ x: this.player.x, y: this.player.y }, TILE * 1.3) && (act === null || isAutoSpot(act.name) || isFollower(act.name))) {
      // GAME-209: ящик поруч — штовхаємо на клітинку від героя (сторож не пускає в прохід); дія з сусідньою ціллю-автоспрацьовувачем не заважає.
      const r = this.props.push({ x: this.player.x, y: this.player.y });
      if (r.dir) { this.faceTo(this.props.crateAt()); this.playAction('thrust', r.dir); }
    } else if (pressed && act?.name === REPAIR_SPOT) {
      // GAME-209: лавка — три удари молотка (пил і тріски на кожен); після третього ядро видає малу нагороду раз.
      const at = this.spots.find((x) => x.name === REPAIR_SPOT);
      if (at) this.faceTo(at);
      const e = this.props.hit(this.props.repairNear({ x: this.player.x, y: this.player.y }, INTERACT_RANGE));
      if (e !== 'none') this.playAction('thrust', facingToward(this.player, at ?? this.player));
      if (e === 'done') { this.hooks.onObject(REPAIR_SPOT); this.hooks.onHand?.('repair'); this.feedback(REPAIR_SPOT); }
    } else if (pressed && act?.name === OLD_CRATE_SPOT) {
      // GAME-209: старий ящик відкривають явно (E/●), не проходом повз: кришка, пил, і знахідка йде в Атлас.
      this.props.open();
      this.playAction('thrust', facingToward(this.player, this.props.oldPoint() ?? this.player));
      this.hooks.onObject(OLD_CRATE_SPOT);
      this.feedback(OLD_CRATE_SPOT);
    } else if (lifeHit) {
      this.faceTo(lifeHit.at);
      const e = this.life.act(lifeHit, { x: this.player.x, y: this.player.y }, lifeDay);
      if (e === 'smash') this.hooks.onHand?.('smash'); else if (e === 'shake' || e === 'sway') this.hooks.onHand?.('forage');   // GAME-229: «tremble» (той самий день) нічого не вчить
      if (e !== 'board' && e !== 'tap') this.playAction('thrust', facingToward(this.player, lifeHit.at));
      this.life.refresh();
    } else if (pressed && act) {
      if (act.kind === 'npc') { this.faceEachOther(act); this.hooks.onNpc(act.name); this.talkingTo = this.bridge.state.game.dialogue !== null ? act.name : null; }
      else if (carrying && (act.name === 'obj.vehicle' || act.name === 'obj.trunk')) this.unloadOne();
      else { this.hooks.onObject(act.name); this.feedback(act.name); }
    }
    // Кільце наближення: вийшов із зони — об'єкт знову «озброєний». Авто їде лише коли все потрібне вже в багажнику (а не повз нього) і герой стоїть.
    for (const n of [...this.fired]) { const f = this.spots.find((x) => x.name === n); if (!f || Phaser.Math.Distance.Between(this.player.x, this.player.y, f.x, f.y) > INTERACT_RANGE) this.fired.delete(n); }
    // Спакована річ удома сама не «розпаковується» від проходу повз: її дістають лише E/тап (чи сітка).
    // Проходячи повз зайву річ (ліхтар, подушка), гравець її не підбирає сам: кільце рахує лише поточну ціль підказки; решту беруть E/тап — інакше «лишити» зайняло б місце потрібному.
    const autoNear = spot && Phaser.Math.Distance.Between(this.player.x, this.player.y, spot.x, spot.y) <= AUTO_RANGE && ringMayTake(near, this.hooks.target()) ? near : null;
    const ready = (autoNear !== 'obj.vehicle' || vehicleReady(carrying, needs)) && !(autoNear?.startsWith('pack.') && this.hooks.look(autoNear) === 'trunk');
    const r = stepRing(this.ring, atCar && carrying ? null : autoNear, !this.fired.has(autoNear ?? '') && ready, autoNear !== 'obj.vehicle' || !moving, dt);
    this.ring = r.ring;
    if (r.fire && !(this.grill.active && r.fire === 'obj.campfire')) {
      this.fired.add(r.fire);
      this.autoCount++;
      this.hooks.onObject(r.fire);
      this.feedback(r.fire);
    }
    // Розвантаження: у зоні авто з рюкзаком — одна річ кожні ~0,5 с з сплеском і звуком.
    if (atCar && carrying) {
      this.unloadT += dt;
      if (this.unloadT >= FEEDBACK_S) { this.unloadT = 0; this.unloadOne(); }
    } else this.unloadT = FEEDBACK_S * 0.4;
    const ringAt = this.ring.name ? this.spots.find((x) => x.name === this.ring.name) : undefined;
    this.fx?.drawRing(ringAt?.x ?? 0, ringAt?.y ?? 0, ringAt ? this.ring.t : 0);
    this.fx?.drawBackpack(this.hooks.backpack() > 0, this.player.x, this.player.y, this.facing);
    const veh = this.spots.find((x) => x.name === 'obj.vehicle');
    this.fx?.drawNeeds(veh?.x ?? 0, (veh?.y ?? 0) - 40, veh && this.hooks.isLive('obj.vehicle') ? needs : null);
    const miaAt = new Set(this.hooks.pets?.() ?? []);
    for (const name of new Set([...miaAt, ...this.miaSprites.keys()])) {
      let sp = this.miaSprites.get(name);
      const at = this.spots.find((x) => x.name === name);
      if (!sp && miaAt.has(name) && at) { sp = this.add.sprite(at.x + 10, at.y, 'mia', name.includes('camera') ? 3 : 16).setOrigin(0.5, ORIGIN_Y).setDepth(at.y); this.miaSprites.set(name, sp); }   // лежить на камері / сидить із частиною карти
      sp?.setVisible(miaAt.has(name));
    }
    const doneNow = this.hooks.requestsDone?.() ?? 0;
    if (this.doneSeen >= 0 && doneNow > this.doneSeen) { this.fx?.pop(this.player.x, this.player.y, '+'); playUi('confirm'); }   // GAME-180: прохання здано — «+» над героєм
    this.doneSeen = doneNow;
    // GAME-190: поки дрова збираються руками, стрілка веде до кожної гілки по черзі, потім до колоди.
    const tn0 = this.hooks.target();
    const tn = tn0 === 'take.item.firewood' && this.wood.active ? this.wood.targetName(tn0) : tn0;
    const branchPt = tn ? this.wood.pointOf(tn) : null;
    const ts = tn ? this.spots.find((x) => x.name === tn) ?? (branchPt ? { name: tn, x: branchPt.x, y: branchPt.y } : undefined) : undefined;
    // GAME-180: ціль підказки — просильник (id NPC): стрілка вказує на нього, де б він зараз стояв (мешканці ходять за розкладом).
    const tnpc = tn?.startsWith('npc.') && this.hooks.talk(tn) !== null ? this.sprite(tn)?.s : undefined;
    const tpos = ts && (branchPt !== null || this.hooks.isLive(ts.name)) ? { x: ts.x, y: ts.y } : tnpc?.visible ? { x: tnpc.x, y: tnpc.y } : null;
    const insets = this.safeInsets(time);
    this.hintOn = this.hooks.hintTick?.(delta) ?? true;
    if (held.has('interact')) this.hooks.hintPoke?.();
    this.fx?.drawGuide({ x: this.player.x, y: this.player.y }, this.hintOn ? tpos : null, this.cameras.main.worldView, insets, INTERACT_RANGE * 1.2, time);
    // GAME-185: вбік верхній ряд HUD лежить поверх мапи — герой (а з ним слідувачі) стоїть посередині ВІЛЬНОЇ висоти, а не під ним. Сторч шапка в потоці, камера без зсуву.
    this.cameras.main.setFollowOffset(0, this.landscape ? Math.round(insets.top / 2) : 0);

    this.moveFollowers(delta, time, moving || v.x !== 0 || v.y !== 0);
    this.updateDaylight(time);
    this.stepMs = delta;
    this.moveResidents(time);
    this.stepGift();
    this.hooks.heart?.();
    this.updateNpcMarks(time);
    this.updateEmotes(time, delta, moving || v.x !== 0 || v.y !== 0);

    const box = this.player.getBounds();
    let covered = 0;
    let behind = 0;
    let over = 0;
    let minAlpha = 1;
    for (const b of this.bands) {
      const n = b.layer.getTilesWithinWorldXY(box.x, box.y, box.width, box.height).filter((t) => t.index > 0).length;
      const above = bandOverHero(b.layer.depth, this.player.depth);   // глибина — з живого шару, не з нашого запису: тест бачить, що справді малюється
      if (above) { covered += n; over++; } else behind += n;
      // GAME-210: під кроною герой не зникає — крона напівпрозора, поки його кадр її перекриває (покадрово від dt, без tween).
      const next = nextCanopyAlpha(b.alpha, above, n > 0, delta / 1000);
      if (next !== b.alpha) { b.alpha = next; b.layer.setAlpha(next); }
      minAlpha = Math.min(minAlpha, b.alpha);
    }
    const frame = Number(this.player.frame.name);
    Object.assign(this.probe, {
      reveal: this.reveal !== null,
      playerX: this.player.x,
      playerY: this.player.y,
      nearObject: near,
      nearKind: spot ? actionTarget(spot.kind, spot.name) : null,
      commandsSent: this.bridge.sent,
      cameraScrollX: this.cameras.main.scrollX,
      cameraScrollY: this.cameras.main.scrollY,
      clockMinutes: this.bridge.state.clock.minutes,
      playerFrame: frame,
      playerDir: this.facing,
      playerMoving: this.player.anims.isPlaying,
      playerDepth: this.player.depth,
      coveredTiles: covered,
      behindTiles: behind,
      canopy: { bands: this.bands.length, over, minAlpha },
      light: { patches: this.patchCount, depth: this.patches?.depth ?? 0, alpha: this.patches?.alpha ?? 0 },
      tent: this.tent.probe(),
      wood: this.wood.probe(),
      crate: { ...this.props.probeData },
      fire: this.fire.probe(),
      grill: this.grill.probe(),
      fish: this.fish.probe(),
      live: { ...this.live.probe },
      swim: { ...this.swim.probe },
      camp: { ...this.life.probe },
      miaAt: [...this.miaSprites].flatMap(([n, sp]) => (sp.visible ? [n] : [])),
      npcMarks: Object.fromEntries([...this.npcMarks].flatMap(([id, m]) => (m.g.visible && m.kind ? [[id, m.kind] as const] : []))),
      fx: { target: tn, ring: this.ring.name ? this.ring.t : 0, ringName: this.ring.name, backpack: this.hooks.backpack(), guide: this.fx?.guideMode ?? 'none', pops: this.fx?.pops ?? 0, auto: this.autoCount, rewards: this.rewardPops, rewardLast: this.rewardLast, headLabels: [...(this.fx?.labels ?? [])] },
    });
  }
}
