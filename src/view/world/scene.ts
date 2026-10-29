// Сцена світу (GAME-24): рух, камера, колізії, взаємодія з об'єктом. Лише відображення:
// взаємодія надсилає команду в ядро через місток.
// GAME-32: мапа — maps/camp-lake.tmj під валідатором мап (npm run validate, --dir public/maps).
// Точку появи, тригери й NPC сцена бере з шару `objects` цієї мапи — тобто саме ті координати, для
// яких валідатор довів досяжність пішки (а не числа, вписані в код окремо від мапи).
// GAME-93: графіка LPC (OD-013) — тайли 32 px, персонаж із шарів (ходьба 9 кадрів × 4 напрямки), анімоване вогнище,
// 3/4-глибина: верхівки дерев і дах намету малюються над персонажем, коли той стоїть ПОЗАД об'єктом (див. `bands`).
import Phaser from 'phaser';
import { bindPhaser } from '../../audio';
import { STEP_MS } from '../../core/clock';
import { KEY_BINDINGS, KEY_CODES, TAP_MAX_MOVE, TAP_MAX_MS, actionTarget, consumeFrame, createActionGate, moveVector, press, release, tapHitsSpot, type Action, type ActionTarget, type InputState } from './actions';
import type { Bridge } from './bridge';
import { PET_SHEETS, type WorldArt } from './art';
import { COLS, FRAME, frameIndex, type Dir } from './character';
import { FIRE_CORE, FIRE_GLOW, ambientAt, glowAlpha, timeOfDay } from './daylight';
import { FOLLOW_SPEED_FACTOR, SPEED, centerOf, gridFromWalls, restPoints, stepFollowers, stepTo, tileOf, type Grid, type Pt } from './follow';
import type { MapKey } from '../../content/map-first';
import { playUi } from '../../audio/ui-sounds';
import { MapFx, type Needs } from './map-fx';
import { FEEDBACK_S, RING_IDLE, ringMayTake, stepRing, vehicleReady, type Insets, type Ring } from './proximity';
import { IDLE_AFTER_S, LEISURE_BY_MAP, assignLeisure, leisureFromObjects, type LeisureSpot } from './leisure';
import { BARK_RANGE, RESIDENTS, buildTimeline, placeAt, residentGrid, type Timeline } from './ambient';
import type { Key } from '../../i18n';
import { facingToward, markerFor, type NpcMarker } from '../npc-talk';

export const TILE = 32;
const INTERACT_RANGE = TILE * 1.5;
/** GAME-186: наскільки (px) слідувач, на якого дивиться герой, «ближчий» за того, що збоку чи позаду. */
const FACING_BONUS = 12;
const facingDot = (f: Dir, dx: number, dy: number): number => {
  const d = Math.hypot(dx, dy) || 1;
  return ((f === 'left' ? -dx : f === 'right' ? dx : 0) + (f === 'up' ? -dy : f === 'down' ? dy : 0)) / d;
};
/** Зона кільця наближення тісніша за зону E/тапа: пройти повз (≈ 0,5 с у зоні) не спрацьовує, треба стати. */
const AUTO_RANGE = TILE * 1.1;
/** Ноги персонажа — на 0,9 висоти кадру 64 px; тіло колізії (16×10) стоїть на ногах. y ноги = y спрайта = глибина сортування. */
const ORIGIN_Y = 0.9;
const BODY = { w: 16, h: 10 };
const WALK_FPS = 12;
/** Глибини: земля, декор і стіни (стовбури, намети) — завжди під персонажем; спрайти сортуються за y ніг; верхівки — смугами. */
const DEPTH = { ground: -300, decor: -200, walls: -100, always: 100_000 } as const;
const DIRS: readonly Dir[] = ['up', 'left', 'down', 'right'];
/** GAME-112: родина, що йде за героєм (герой — George). Порядок — порядок у ланцюжку. */
const FOLLOWERS = ['victoria', 'matthew'] as const;
/** GAME-179: слідувачі як співрозмовники — id NPC у порядку FOLLOWERS. */
const FOLLOWER_NPC = ['npc.victoria', 'npc.matthew'] as const;
/** Довгий кадр (згорнута вкладка) не телепортує слідувачів: крок обмежений 0,1 с. */
const MAX_FOLLOW_DT = 0.1;
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
  /** Транспорт гравця (авто малюється спрайтом на подвір'ї, велосипед — маркером). */
  transport(): string | null;
  /** GAME-181: підпис нагороди («+15 XP +10 ОМ»), що ще не показана над героєм; забирає її (наступний виклик — null). */
  takeReward(): string | null;
}

/** Хто з NPC якого листа ходьби має (лист — в art.ts); решта — як Еліза. */
const NPC_SHEET: Readonly<Record<string, string>> = { 'npc.george': 'player' };
/** Де стоїть авто відносно точки посадки `obj.vehicle` (ноги авто = нижній центр спрайта): праворуч-вниз; його колізія — нижня смуга. */
const CAR_OFFSET = { x: 16, y: 80 };
const CAR_BLOCK = { w: 104, h: 30 };
/** Маркери: колір за родом об'єкта. */
const MARKER_COLOR = { step: 0xffd54a, task: 0xffd54a, item: 0xe0a458, itemTrunk: 0x9be28f, vehicle: 0x6ec1ff, other: 0x9be28f } as const;

/** Маркер цілі: графіка і вигляд, у якому вона намальована зараз (перемальовується, коли вигляд міняється). */
interface Marker { readonly g: Phaser.GameObjects.Graphics; look: string }

/** Смуга шару `above`: тайли верхівок, що мають одну «базову» лінію (низ стовбура під ними). */
interface Band { readonly layer: Phaser.Tilemaps.TilemapLayer; readonly depth: number }

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
  /** GAME-172: ключ репліки, що зараз над головою мешканця (null — тиша), і скільки реплік уже прозвучало. */
  bark: string | null;
  barkCount: number;
  /** GAME-38: мс від початку навігації до першого намальованого кадру Phaser; 0, доки кадру не було (ставить main.ts). */
  firstFrameMs: number;
  /** GAME-99 (лише для e2e): ефект «день і ніч» — що зараз намальовано. `on` — ефект увімкнено; `visible` — прямокутник/пляма видимі (вдень — ні). */
  daylight: { on: boolean; visible: boolean; minuteOfDay: number; darkness: number; color: number; glow: number };
  /** GAME-175 (лише для e2e): кільце наближення (0..1, об'єкт), рюкзак, стрілка до мети (none/line/edge), лічильник спливів, дії-від-наближення. */
  fx: { target: string | null; ring: number; ringName: string | null; backpack: number; guide: 'none' | 'line' | 'edge'; pops: number; auto: number; rewards: number; rewardLast: string };
  /** GAME-179 (лише для e2e): які маркери зараз над головами NPC — id → chat («…») / request («!»). */
  npcMarks: Record<string, NpcMarker>;
  /** GAME-184: цілі прохань, біля яких намальована Мія (видимі спрайти). */
  miaAt: string[];
}

/** Точка вогнища (об'єкт мапи obj.campfire) — центр світлої плями; нема — плями нема. */
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
  /** GAME-172: фонові мешканці — розклад (чиста функція ігрового часу), спрайти, останній напрямок, репліка. */
  private residentLines: Timeline[] = [];
  private residentSprites: Phaser.GameObjects.Sprite[] = [];
  private residentFacing: Dir[] = [];
  private residentBark: { text: Phaser.GameObjects.Text; until: number; npc: number } | null = null;
  private barkNext: number[] = [];
  private barkReadyAt: number[] = [];
  /** GAME-179: маркери «…»/«!» над NPC (малюнок і вид, за який він намальований) і NPC, що зараз дивиться на героя (повертається вниз, коли той відійде). */
  private doneSeen = -1;
  /** GAME-184: Мія біля цілі прохання (за назвою об'єкта); створюється, коли потрібна. */
  private miaSprites = new Map<string, Phaser.GameObjects.Sprite>();
  private npcMarks = new Map<string, { g: Phaser.GameObjects.Graphics; kind: NpcMarker | null }>();
  private faced: string | null = null;
  /** GAME-173: скільки секунд герой стоїть; точки дозвілля родини (null — у строю) і всі точки мапи; напрямок руху героя для строю. */
  private idleS = 0;
  private leisure: (LeisureSpot | null)[] | null = null;
  private leisureSpots: LeisureSpot[] = [];
  private heading: Pt = { x: 0, y: 0 };
  private fpsFrames = 0;
  private fpsStart = -1;
  /** Тап по канві (GAME-95): світова точка, чекає на кадр update, де її звіряють із цілями в зоні дії. */
  private tap: { x: number; y: number } | null = null;
  /** GAME-99: нічна маска (на весь екран, MULTIPLY) і світла пляма вогнища (ADD); null, якщо ефект вимкнено. */
  private night: Phaser.GameObjects.Rectangle | null = null;
  private glow: Phaser.GameObjects.Image | null = null;

  /** Позначки цілей (GAME-170 зріз 2; GAME-175: речі, кроки, авто) — за назвою об'єкта; видимі лише поки об'єкт «живий» (isLive). */
  private markers = new Map<string, Marker>();
  /** NPC на мапі: видимі лише поки живі (Джордж — лише в профілі, де він є). */
  private npcSprites = new Map<string, Phaser.GameObjects.Sprite>();
  /** GAME-175: мапа, що зараз побудована, і все, що до неї належить (знищується при переході): шари, картинки, маркери, колізії. */
  private current: MapKey | null = null;
  private tilemap: Phaser.Tilemaps.Tilemap | null = null;
  private owned: { destroy(): void }[] = [];
  private wallCollider: Phaser.Physics.Arcade.Collider | null = null;
  /** Авто на подвір'ї: спрайт і невидима колізія — окремо від мапи (залежать від транспорту гравця, а не від мапи). */
  private carParts: { destroy(): void }[] = [];
  private carFor = '';
  private fx: MapFx | null = null;
  private insets: Insets = { top: 24, bottom: 0, left: 0, right: 0 };
  private insetsAt = -1e9;
  private ring: Ring = RING_IDLE;
  /** Об'єкти, що вже спрацювали в цьому заході в зону: поки гравець не вийде з неї, самі не повторюються. */
  private fired = new Set<string>();
  private unloadT = FEEDBACK_S * 0.4;
  private autoCount = 0;

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
  }

  /**
   * Позначка цілі (GAME-170 зріз 2): тимчасова графіка замість спрайтів LPC (купа дров, лавка, велонавіс, пакети, речі для пакування,
   * полиці — прогалини набору, OD-013: спершу доведення наявних спрайтів; скіл game-art-sources). Малюється на точці об'єкта (ноги),
   * глибина — її y. Колір — за родом: крок/справа — золотий, річ — бурштиновий (зелений, коли вже в багажнику), авто — блакитний.
   */
  private marker(s: Spot): Marker {
    const g = this.add.graphics({ x: s.x, y: s.y });
    g.setDepth(s.y);
    const m: Marker = { g, look: '' };
    this.draw(m, s.name, this.hooks.look(s.name), s.name === 'obj.vehicle' || s.name === 'obj.trunk' ? `${this.hooks.look(s.name)}|${this.hooks.transport() ?? ''}` : this.hooks.look(s.name));
    g.setVisible(this.hooks.isLive(s.name));
    return m;
  }

  private draw(m: Marker, name: string, look: 'room' | 'trunk', sig: string): void {
    const family = name.startsWith('task.') ? 'task' : name.startsWith('step.') ? 'step' : name.startsWith('pack.') || name.startsWith('take.') || name.startsWith('req.') ? (look === 'trunk' ? 'itemTrunk' : 'item')
      : name === 'obj.vehicle' || name === 'obj.trunk' ? 'vehicle' : 'other';
    m.look = sig;
    const g = m.g.clear();
    g.fillStyle(0x000000, 0.35).fillEllipse(0, 0, 22, 10);
    if (name === 'obj.vehicle' && this.hooks.transport() === 'transport.bike') { this.drawBike(g); return; }
    if (name === 'obj.trunk' && this.hooks.transport() === 'transport.bike') {   // велосипед: «багажник» — місце, де речі пристібають до рами: скатка зі стяжкою
      g.fillStyle(0x3f7f5a, 1).fillRoundedRect(-10, -14, 20, 9, 4);
      g.lineStyle(1, 0x1b1f23, 1).strokeRoundedRect(-10, -14, 20, 9, 4);
      g.fillStyle(0xd9a441, 1).fillRect(-5, -14, 2, 9).fillRect(3, -14, 2, 9);
      return;
    }
    g.fillStyle(MARKER_COLOR[family], 1).fillRoundedRect(-7, -16, 14, 14, 3);
    g.lineStyle(1, 0x1b1f23, 1).strokeRoundedRect(-7, -16, 14, 14, 3);
    if (family === 'itemTrunk') g.lineStyle(2, 0x1b1f23, 1).beginPath().moveTo(-3, -9).lineTo(-1, -6).lineTo(3, -12).strokePath();   // галочка: уже в багажнику
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
  private safeInsets(time: number): Insets {
    if (time - this.insetsAt < 300) return this.insets;
    this.insetsAt = time;
    const cv = this.game.canvas.getBoundingClientRect();
    const z = this.cameras.main.zoom || 1;
    let topPx = 0;
    for (const sel of ['.ui-header', '.ui-next']) { const e = document.querySelector(sel); if (e) topPx = Math.max(topPx, e.getBoundingClientRect().bottom - cv.top); }
    let botPx = 0;
    for (const sel of ['.touch-stick', '.touch-interact']) {
      const e = document.querySelector<HTMLElement>(sel);
      if (!e || e.hidden || e.offsetParent === null) continue;
      botPx = Math.max(botPx, cv.bottom - e.getBoundingClientRect().top);
    }
    this.insets = { top: Math.max(0, topPx + 4) / z, bottom: Math.max(0, botPx + 4) / z, left: 0, right: 0 };
    return this.insets;
  }

  /** Складений лист ходьби як текстура з 36 кадрами (ключ кадру — номер). */
  private addSheet(key: string, canvas: HTMLCanvasElement): void {
    const tex = this.textures.addCanvas(key, canvas);
    if (!tex) throw new Error(`texture ${key} failed`);
    for (let i = 0; i < COLS * 4; i++) tex.add(i, 0, (i % COLS) * FRAME, Math.floor(i / COLS) * FRAME, FRAME, FRAME);
  }

  create(): void {
    bindPhaser(this.sound);   // GAME-40: мікшер отримує вихід Phaser (звуки вже в кеші після preload)
    for (const [name, img] of Object.entries(this.art.tilesets)) this.textures.addImage(name, img);
    this.textures.addSpriteSheet('campfire', this.art.campfire, { frameWidth: FRAME, frameHeight: FRAME });
    this.textures.addSpriteSheet('mia', this.art.mia, { frameWidth: PET_SHEETS.mia.frame, frameHeight: PET_SHEETS.mia.frame });   // GAME-147/184: кішка Мія (ART-020)
    this.addSheet('player', this.art.sheets.player);
    this.addSheet('elise', this.art.sheets.elise);
    for (const name of FOLLOWERS) this.addSheet(name, this.art.sheets[name]);
    for (const [name, canvas] of Object.entries(this.art.residents)) this.addSheet(`res-${name}`, canvas);

    this.anims.create({ key: 'fire', frames: this.anims.generateFrameNumbers('campfire', { start: 0, end: 4 }), frameRate: 8, repeat: -1 });
    for (const dir of DIRS) {
      this.anims.create({ key: `walk-${dir}`, frames: Array.from({ length: COLS - 1 }, (_, i) => ({ key: 'player', frame: frameIndex(dir, i + 1) })), frameRate: WALK_FPS, repeat: -1 });
    }
    for (const name of FOLLOWERS) {
      for (const dir of DIRS) this.anims.create({ key: `walk-${name}-${dir}`, frames: Array.from({ length: COLS - 1 }, (_, i) => ({ key: name, frame: frameIndex(dir, i + 1) })), frameRate: WALK_FPS, repeat: -1 });
    }
    // Слідувачі — лише картинки: без тіла фізики й без інтерактивності, тож тап і кнопка дії їх «не бачать» (GAME-112, цілі взаємодії).
    this.followFacing = FOLLOWERS.map(() => 'down' as Dir);
    this.followSprites = FOLLOWERS.map((name) => this.add.sprite(0, 0, name, frameIndex('down', 0)).setOrigin(0.5, ORIGIN_Y));
    for (const res of RESIDENTS) {
      for (const dir of DIRS) this.anims.create({ key: `walk-res-${res.look}-${dir}`, frames: Array.from({ length: COLS - 1 }, (_, i) => ({ key: `res-${res.look}`, frame: frameIndex(dir, i + 1) })), frameRate: WALK_FPS, repeat: -1 });
    }
    this.residentFacing = RESIDENTS.map(() => 'down' as Dir);
    this.barkNext = RESIDENTS.map(() => 0);
    this.barkReadyAt = RESIDENTS.map(() => 0);
    this.residentSprites = RESIDENTS.map((res) => this.add.sprite(0, 0, `res-${res.look}`, frameIndex('down', 0)).setOrigin(0.5, ORIGIN_Y).setVisible(false));
    this.events.on(Phaser.Scenes.Events.PAUSE, () => { this.hideBark(); });
    this.player = this.physics.add.sprite(0, 0, 'player', frameIndex('down', 0));
    this.player.setOrigin(0.5, ORIGIN_Y);
    this.player.body.setSize(BODY.w, BODY.h);
    this.player.body.setOffset(FRAME / 2 - BODY.w / 2, FRAME * ORIGIN_Y - BODY.h / 2);
    this.player.setCollideWorldBounds(true);
    if (this.daylightOn) this.makeNight();
    this.fx = new MapFx(this);

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
    for (const o of this.owned) o.destroy();
    this.owned = [];
    this.wallCollider?.destroy();
    this.wallCollider = null;
    this.tilemap?.destroy();
    this.tilemap = null;
    for (const m of this.markers.values()) m.g.destroy();
    this.markers.clear();
    this.npcSprites.clear();   // самі спрайти — у `owned`
    for (const p of this.carParts) p.destroy();
    this.carParts = [];
    this.carFor = '';
    this.glow = null;
    this.bands = [];
  }

  /**
   * Побудувати мапу `key` і поставити героя на точку появи: `s.car` — коли він приїхав сюди (перехід із іншої мапи), інакше `s.start`
   * (старт гри, завантаження) чи перша точка появи (табір). Слідувачі стають поруч. Зонд і камера — на нову мапу.
   */
  private enterMap(key: MapKey, arrived: boolean): void {
    this.teardown();
    this.current = key;
    const map = this.make.tilemap({ key });
    this.tilemap = map;
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

    const objects = map.getObjectLayer('objects')?.objects ?? [];
    const typeOf = (o: Phaser.Types.Tilemaps.TiledObject): string => String(o.type || (o as { class?: string }).class || '');
    const spawns = objects.filter((o) => typeOf(o) === 'spawn');
    const spawn = (arrived ? spawns.find((o) => o.name === 's.car') : spawns.find((o) => o.name === 's.start')) ?? spawns[0];
    if (!spawn) throw new Error(`map ${key}: no spawn in layer objects`);
    this.spots = objects.filter((o) => typeOf(o) === 'trigger' || typeOf(o) === 'npc')
      .map((o) => ({ name: o.name, kind: typeOf(o) as Spot['kind'], x: o.x ?? 0, y: o.y ?? 0 }));

    for (const s of this.spots) {
      // Точка об'єкта — ноги/основа: спрайт стоїть на ній, а глибина сортування — її y.
      if (s.kind === 'npc') {
        const sp = this.add.sprite(s.x, s.y, NPC_SHEET[s.name] ?? 'elise', frameIndex('down', 0)).setOrigin(0.5, ORIGIN_Y).setDepth(s.y).setVisible(this.hooks.isLive(s.name));
        this.npcSprites.set(s.name, sp);
        this.owned.push(sp);
      } else if (s.name === 'obj.campfire') this.owned.push(this.add.sprite(s.x, s.y, 'campfire').setOrigin(0.5, 0.85).setDepth(s.y).play('fire'));
      else this.markers.set(s.name, this.marker(s));
    }

    // Слідувачі: нова сітка проходимості мапи й місця стоянки біля точки появи.
    const wallsData = map.getLayer('walls')?.data.flatMap((row) => row.map((t) => t.index)) ?? [];
    this.grid = gridFromWalls(map.width, map.height, TILE, wallsData);
    this.chain = restPoints(this.grid, { x: spawn.x ?? 0, y: spawn.y ?? 0 }, FOLLOWERS.length, this.spots);
    this.followSprites.forEach((sp, i) => sp.setPosition(this.chain[i]?.x ?? 0, this.chain[i]?.y ?? 0).setDepth(this.chain[i]?.y ?? 0));
    this.probe.followers = this.chain.map((p) => ({ x: p.x, y: p.y }));
    this.probe.leisure = this.chain.map(() => null);
    // GAME-172: мешканці живуть лише в таборі; на мапах дня 1 (двір, крамниця) їх нема. Шляхи — по сітці стін без клітинок цілей; розклад мусить будуватись (інакше мапа зламана — голосно).
    this.anchors = objects.filter((o) => typeOf(o) === 'anchor').map((o) => ({ x: o.x ?? 0, y: o.y ?? 0 }));
    this.hideBark();
    if (key === 'camp') {
      const walkGrid = residentGrid(this.grid, [...this.spots, ...this.anchors]);
      this.residentLines = RESIDENTS.map((res) => {
        const tl = buildTimeline(walkGrid, res);
        if (!tl) throw new Error(`ambient: ${res.id} has no path between its stops`);
        return tl;
      });
      this.probe.residents = RESIDENTS.map((res) => ({ id: res.id, x: 0, y: 0, moving: false }));
    } else {
      this.residentLines = [];
      this.probe.residents = [];
    }
    this.residentSprites.forEach((sp) => sp.setVisible(key === 'camp'));
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
    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.cameras.main.centerOn(this.player.x, this.player.y);
    this.last = { x: this.player.x, y: this.player.y };
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
    this.carFor = want;
    const v = this.spots.find((s) => s.name === 'obj.vehicle');
    // Табір (GAME-183): авто вже намальоване тайлами стоянки (camp-car) — другого не ставимо; об'єкт мапи лише точка дії біля нього.
    if (!v || t !== 'transport.car' || this.current === 'camp') return;
    const x = v.x + CAR_OFFSET.x;
    const y = v.y + CAR_OFFSET.y;
    this.carParts.push(this.add.image(x, y, 'camp-car').setOrigin(0.5, 1).setDepth(y));
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
      return { layer: layer.setDepth(depth), depth };
    });
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
    Object.assign(d, { visible, minuteOfDay, darkness: a.darkness, color: a.color, glow: this.glow ? glow : 0 });
  }

  /** Сплив і звук на дію: підібрав/поклав — «+1» і клацання, крок/авто — «OK» і підтвердження. */
  private feedback(name: string): void {
    const pick = name.startsWith('take.') || name.startsWith('pack.');
    this.fx?.pop(this.player.x, this.player.y, pick ? '+1' : 'OK');
    playUi(pick ? 'press' : 'confirm');
  }

  private unloadOne(): void {
    const res = this.hooks.unload();
    if (res === 'none') return;
    this.fx?.pop(this.player.x, this.player.y, res === 'ok' ? '+1' : '!');
    playUi(res === 'ok' ? 'press' : 'back');
  }

  /** GAME-112: родина йде за героєм у обхід стін (GAME-173: вільним строєм); поки він стоїть — кожен на своїй точці дозвілля. Анімація й напрямок — з зсуву за кадр. */
  private moveFollowers(deltaMs: number, time: number, moving: boolean): void {
    const dt = Math.min(deltaMs / 1000, MAX_FOLLOW_DT);
    const before = this.chain.map((p) => ({ x: p.x, y: p.y }));
    const hero = { x: this.player.x, y: this.player.y };
    // Дозвілля: герой простояв IDLE_AFTER_S — точки роздаються один раз (до наступного руху), без випадковості.
    if (moving) { this.idleS = 0; this.leisure = null; } else this.idleS += dt;
    if (!this.leisure && this.idleS >= IDLE_AFTER_S) {
      const avoid = new Set(this.spots.map((s) => { const t = tileOf(this.grid, s); return t.r * this.grid.cols + t.c; }));
      this.leisure = assignLeisure(this.grid, hero, this.chain.length, this.leisureSpots, avoid);
    }
    const plan = this.leisure;
    const rest = this.chain.filter((_, i) => !plan?.[i]);
    const parked = (plan ?? []).flatMap((l) => (l ? [centerOf(this.grid, l)] : []));
    if (rest.length > 0) stepFollowers(this.grid, hero, rest, dt, SPEED * FOLLOW_SPEED_FACTOR, [...this.spots, ...parked], this.heading);
    this.chain.forEach((p, i) => {
      const s = this.followSprites[i];
      const b = before[i];
      const out = this.probe.followers[i];
      const name = FOLLOWERS[i];
      if (!s || !b || !out || !name) return;
      const spot = plan?.[i] ?? null;
      let arrived = false;
      if (spot) arrived = stepTo(this.grid, p, spot, dt, SPEED * FOLLOW_SPEED_FACTOR);
      const dx = p.x - b.x;
      const dy = p.y - b.y;
      if (dx !== 0 || dy !== 0) this.followFacing[i] = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
      if (arrived && spot) this.followFacing[i] = spot.face;
      const dir = this.followFacing[i] ?? 'down';
      if (dx !== 0 || dy !== 0) s.anims.play(`walk-${name}-${dir}`, true);
      else { s.anims.stop(); s.setFrame(frameIndex(dir, 0)); }
      // Лише картинка гойдається на 1 px (проба й глибина — по справжній точці).
      const bob = arrived ? Math.round(Math.sin(time / 380 + i * 2.1)) : 0;
      s.setPosition(p.x, p.y + bob).setDepth(p.y);
      out.x = p.x;
      out.y = p.y;
      this.probe.leisure[i] = arrived && spot ? { kind: spot.kind, c: spot.c, r: spot.r } : null;
    });
  }

  /** GAME-172: мешканці стають туди, де їх ставить розклад о цей ігровий час; тиша, поки годинник стоїть (пауза). */
  private moveResidents(time: number): void {
    const clock = this.bridge.state.clock;
    const minutes = clock.minutes + clock.accMs / STEP_MS;
    this.residentLines.forEach((tl, i) => {
      const s = this.residentSprites[i];
      const out = this.probe.residents[i];
      if (!s || !out) return;
      const p = placeAt(this.grid, tl, minutes);
      const moved = Math.hypot(p.x - s.x, p.y - s.y) > 0.05;
      const dir = p.moving ? p.dir : this.residentFacing[i] ?? 'down';
      this.residentFacing[i] = dir;
      if (moved && p.moving) s.anims.play(`walk-res-${tl.resident.look}-${dir}`, true);
      else { s.anims.stop(); s.setFrame(frameIndex(dir, 0)); }
      s.setPosition(p.x, p.y).setDepth(p.y);
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
    if (this.residentLines.length === 0) return;
    for (let i = 0; i < RESIDENTS.length; i++) {
      const s = this.residentSprites[i];
      const res = RESIDENTS[i];
      if (!s || !res || time < (this.barkReadyAt[i] ?? 0)) continue;
      if (Math.hypot(this.player.x - s.x, this.player.y - s.y) > BARK_RANGE) continue;
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
    if (ri >= 0 && rs) return { s: rs, face: (d) => { this.residentFacing[ri] = d; } };
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
    this.player.anims.stop();
    this.player.setFrame(frameIndex(this.facing, 0));
    this.hideBark();
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
    const held = consumeFrame(this.controls);
    const v = moveVector(held);
    // Рухається той, хто справді зсунувся з минулого кадру (по зсуву, а не по швидкості — вона лишається, коли тіло вперлося в стіну): упертий у стіну персонаж стоїть, а не «іде на місці».
    const moving = Math.hypot(this.player.x - this.last.x, this.player.y - this.last.y) > 0.25;
    if (moving) this.heading = { x: this.player.x - this.last.x, y: this.player.y - this.last.y };
    this.last = { x: this.player.x, y: this.player.y };
    this.player.setVelocity(v.x * SPEED, v.y * SPEED);
    if (v.x !== 0 || v.y !== 0) {
      const horizontal = v.x !== 0 && (v.y === 0 || this.facing === 'left' || this.facing === 'right');
      this.facing = horizontal ? (v.x < 0 ? 'left' : 'right') : (v.y < 0 ? 'up' : 'down');
    }
    if (moving) this.player.anims.play(`walk-${this.facing}`, true);
    else { this.player.anims.stop(); this.player.setFrame(frameIndex(this.facing, 0)); }
    this.player.setDepth(this.player.y);

    let spot: Spot | null = null;
    let best = INTERACT_RANGE;
    const target = this.hooks.target();
    for (const [name, m] of this.markers) {
      const on = this.hooks.isLive(name);
      m.g.setVisible(on);
      if (!on) continue;
      const look = this.hooks.look(name);
      const sig = name === 'obj.vehicle' || name === 'obj.trunk' ? `${look}|${this.hooks.transport() ?? ''}` : look;
      if (sig !== m.look) this.draw(m, name, look, sig);
      m.g.setScale(name === target ? 1 + 0.2 * Math.abs(Math.sin(time / 280)) : 1);   // ціль підказки «Далі:» — пульсує
    }
    for (const [name, sp] of this.npcSprites) sp.setVisible(this.hooks.isLive(name));
    const talkers = this.talkers();
    const live = [...this.spots.filter((s) => this.hooks.isLive(s.name)), ...talkers];
    // GAME-179: родина тупцює коло героя й завжди найближча — тож говорить із нею лише тоді, коли в зоні дії нікого іншого (предмета, Елізи, мешканця) нема.
    const isFollower = (n: string): boolean => (FOLLOWER_NPC as readonly string[]).includes(n);
    for (const pass of [false, true]) {
      for (const s of live) {
        if (isFollower(s.name) !== pass || (pass && spot)) continue;
        const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, s.x, s.y);
        if (d > INTERACT_RANGE) continue;
        // GAME-186: родина тулиться до героя на відстані в 1–2 тайли й міняється слотами від кожного кроку, тож «найближчий» із двох — майже випадковість.
        // Між слідувачами перевага тому, на кого дивиться герой (до 12 px «знижки»): повернувся до Метью — говориш із Метью.
        const score = pass ? d - FACING_BONUS * facingDot(this.facing, s.x - this.player.x, s.y - this.player.y) : d;
        if (score <= best) { best = score; spot = s; }
      }
    }
    const near = spot?.name ?? null;
    // Тап: лише по цілі, що в зоні дії. Поза зоною нічого (без прокладання шляху, GAME-95).
    const tapped = this.tap;
    this.tap = null;
    const tapSpot = tapped ? live.find((s) => Phaser.Math.Distance.Between(this.player.x, this.player.y, s.x, s.y) <= INTERACT_RANGE && tapHitsSpot(s, tapped)) ?? null : null;
    const act = tapSpot ?? spot;
    const dt = Math.min(delta / 1000, MAX_FOLLOW_DT);
    const carrying = this.hooks.backpack() > 0;
    this.fx?.tick(dt);
    const reward = this.hooks.takeReward();
    if (reward) { this.fx?.pop(this.player.x, this.player.y, reward, 14); this.rewardPops++; this.rewardLast = reward; }   // GAME-181: «+N» за нагороду — над сплавом «+1/OK» дії
    const atCar = near === 'obj.vehicle' || near === 'obj.trunk';
    const needs = this.hooks.needs();
    // Скорочення E/тап — миттєво. Біля авто з рюкзаком воно розвантажує (а не їде).
    if (this.gate(held.has('interact') || tapSpot !== null, time) && act) {
      if (act.kind === 'npc') { this.faceEachOther(act); this.hooks.onNpc(act.name); }
      else if (carrying && (act.name === 'obj.vehicle' || act.name === 'obj.trunk')) this.unloadOne();
      else { this.hooks.onObject(act.name); this.feedback(act.name); }
    }
    // Кільце наближення: вийшов із зони — об'єкт знову «озброєний». Авто їде лише коли все потрібне вже в багажнику (а не повз нього) і герой стоїть.
    for (const n of [...this.fired]) { const f = this.spots.find((x) => x.name === n); if (!f || Phaser.Math.Distance.Between(this.player.x, this.player.y, f.x, f.y) > INTERACT_RANGE) this.fired.delete(n); }
    // Спакована річ удома сама не «розпаковується» від проходу повз: її дістають лише E/тап (чи сітка).
    // Проходячи повз зайву річ (ліхтар, подушка), гравець її не підбирає сам: кільце рахує лише поточну ціль підказки; решту беруть E/тап — інакше «лишити» зайняло б місце потрібному.
    const autoNear = spot && best <= AUTO_RANGE && ringMayTake(near, this.hooks.target()) ? near : null;
    const ready = (autoNear !== 'obj.vehicle' || vehicleReady(carrying, needs)) && !(autoNear?.startsWith('pack.') && this.hooks.look(autoNear) === 'trunk');
    const r = stepRing(this.ring, atCar && carrying ? null : autoNear, !this.fired.has(autoNear ?? '') && ready, autoNear !== 'obj.vehicle' || !moving, dt);
    this.ring = r.ring;
    if (r.fire) {
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
    const tn = this.hooks.target();
    const ts = tn ? this.spots.find((x) => x.name === tn) : undefined;
    // GAME-180: ціль підказки — просильник (id NPC): стрілка вказує на нього, де б він зараз стояв (мешканці ходять за розкладом).
    const tnpc = tn?.startsWith('npc.') && this.hooks.talk(tn) !== null ? this.sprite(tn)?.s : undefined;
    const tpos = ts && this.hooks.isLive(ts.name) ? { x: ts.x, y: ts.y } : tnpc?.visible ? { x: tnpc.x, y: tnpc.y } : null;
    this.fx?.drawGuide({ x: this.player.x, y: this.player.y }, tpos, this.cameras.main.worldView, this.safeInsets(time), INTERACT_RANGE * 1.2, time);

    this.moveFollowers(delta, time, moving || v.x !== 0 || v.y !== 0);
    this.updateDaylight(time);
    this.moveResidents(time);
    this.updateNpcMarks(time);

    const box = this.player.getBounds();
    let covered = 0;
    let behind = 0;
    for (const b of this.bands) {
      const n = b.layer.getTilesWithinWorldXY(box.x, box.y, box.width, box.height).filter((t) => t.index > 0).length;
      if (b.layer.depth > this.player.depth) covered += n; else behind += n;   // глибина — з живого шару, не з нашого запису: тест бачить, що справді малюється
    }
    const frame = Number(this.player.frame.name);
    Object.assign(this.probe, {
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
      miaAt: [...this.miaSprites].flatMap(([n, sp]) => (sp.visible ? [n] : [])),
      npcMarks: Object.fromEntries([...this.npcMarks].flatMap(([id, m]) => (m.g.visible && m.kind ? [[id, m.kind] as const] : []))),
      fx: { target: tn, ring: this.ring.name ? this.ring.t : 0, ringName: this.ring.name, backpack: this.hooks.backpack(), guide: this.fx?.guideMode ?? 'none', pops: this.fx?.pops ?? 0, auto: this.autoCount, rewards: this.rewardPops, rewardLast: this.rewardLast },
    });
  }
}
