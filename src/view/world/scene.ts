// Сцена світу (GAME-24): рух, камера, колізії, взаємодія з об'єктом. Лише відображення:
// взаємодія надсилає команду в ядро через місток.
// GAME-32: мапа — maps/camp-lake.tmj під валідатором мап (npm run validate, --dir public/maps).
// Точку появи, тригери й NPC сцена бере з шару `objects` цієї мапи — тобто саме ті координати, для
// яких валідатор довів досяжність пішки (а не числа, вписані в код окремо від мапи).
// GAME-93: графіка LPC (OD-013) — тайли 32 px, персонаж із шарів (ходьба 9 кадрів × 4 напрямки), анімоване вогнище,
// 3/4-глибина: верхівки дерев і дах намету малюються над персонажем, коли той стоїть ПОЗАД об'єктом (див. `bands`).
import Phaser from 'phaser';
import { KEY_BINDINGS, KEY_CODES, TAP_MAX_MOVE, TAP_MAX_MS, actionTarget, consumeFrame, createActionGate, moveVector, press, release, tapHitsSpot, type Action, type ActionTarget, type InputState } from './actions';
import type { Bridge } from './bridge';
import type { WorldArt } from './art';
import { COLS, FRAME, frameIndex, type Dir } from './character';

export const TILE = 32;
export const SPEED = 128; // px/с — 4 тайли за секунду (як було при 16 px: 64 px/с)
const INTERACT_RANGE = TILE * 1.5;
/** Ноги персонажа — на 0,9 висоти кадру 64 px; тіло колізії (16×10) стоїть на ногах. y ноги = y спрайта = глибина сортування. */
const ORIGIN_Y = 0.9;
const BODY = { w: 16, h: 10 };
const WALK_FPS = 12;
/** Глибини: земля, декор і стіни (стовбури, намети) — завжди під персонажем; спрайти сортуються за y ніг; верхівки — смугами. */
const DEPTH = { ground: -300, decor: -200, walls: -100, always: 100_000 } as const;
const DIRS: readonly Dir[] = ['up', 'left', 'down', 'right'];

/** Об'єкт мапи, з яким можна взаємодіяти: тригер (Interact у ядро) чи NPC (розмова). */
interface Spot { readonly name: string; readonly kind: 'trigger' | 'npc'; readonly x: number; readonly y: number }

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
}

/** Вікно вимірювання fps, мс. */
const FPS_WINDOW_MS = 3000;

export class WorldScene extends Phaser.Scene {
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private readonly gate = createActionGate();
  private spots: Spot[] = [];
  private bands: Band[] = [];
  private facing: Dir = 'down';
  private last = { x: 0, y: 0 };
  private fpsFrames = 0;
  private fpsStart = -1;
  /** Тап по канві (GAME-95): світова точка, чекає на кадр update, де її звіряють із цілями в зоні дії. */
  private tap: { x: number; y: number } | null = null;

  /** art — графіка, декодована до старту гри (loadWorldArt); onNpc — гравець заговорив із NPC на мапі (розмову веде екран подорожі). */
  constructor(private readonly bridge: Bridge, private readonly controls: InputState, private readonly probe: WorldProbe, private readonly art: WorldArt, private readonly onNpc: (npcId: string) => void = () => {}) {
    super('world');
  }

  preload(): void {
    this.load.tilemapTiledJSON('camp', 'maps/camp-lake.tmj');
  }

  /** Складений лист ходьби як текстура з 36 кадрами (ключ кадру — номер). */
  private addSheet(key: string, canvas: HTMLCanvasElement): void {
    const tex = this.textures.addCanvas(key, canvas);
    if (!tex) throw new Error(`texture ${key} failed`);
    for (let i = 0; i < COLS * 4; i++) tex.add(i, 0, (i % COLS) * FRAME, Math.floor(i / COLS) * FRAME, FRAME, FRAME);
  }

  create(): void {
    for (const [name, img] of Object.entries(this.art.tilesets)) this.textures.addImage(name, img);
    this.textures.addSpriteSheet('campfire', this.art.campfire, { frameWidth: FRAME, frameHeight: FRAME });
    this.addSheet('player', this.art.sheets.player);
    this.addSheet('elise', this.art.sheets.elise);

    const map = this.make.tilemap({ key: 'camp' });
    const tilesets = Object.keys(this.art.tilesets).map((name) => {
      const ts = map.addTilesetImage(name, name, TILE, TILE, 0, 0);
      if (!ts) throw new Error(`tileset ${name} is missing in the map`);
      return ts;
    });
    const need = (name: string): Phaser.Tilemaps.TilemapLayer => {
      const layer = map.createLayer(name, tilesets);
      if (!layer || !(layer instanceof Phaser.Tilemaps.TilemapLayer)) throw new Error(`layer ${name} is missing`);
      return layer;
    };
    const ground = need('ground').setDepth(DEPTH.ground);
    const decor = need('decor').setDepth(DEPTH.decor);
    const walls = need('walls').setDepth(DEPTH.walls);
    walls.setCollisionByExclusion([-1]);
    this.bands = this.makeBands(map, tilesets);
    // GAME-97: шари мапи статичні, а кожен тайловий шар у Phaser 4 коштує дорого (під SwiftShader JS кадру — 0,4 мс, а тайлові шари — ≈ 7 з 10 мс
    // GPU-часу; під навантаженням паралельного e2e гра падала до 8 fps). Тому земля, декор і стіни один раз запікаються в одну текстуру. Шар `walls`
    // лишається лише як дані колізій (невидимий). Смуги `above` НЕ запікаємо: вони розріджені (34 тайли), а повнокадрова картинка коштувала б дорожче за тайли.
    this.bake('bake-base', map, [ground, decor, walls]).setDepth(DEPTH.ground);
    for (const layer of [ground, decor, walls]) layer.setVisible(false);

    const objects = map.getObjectLayer('objects')?.objects ?? [];
    const typeOf = (o: Phaser.Types.Tilemaps.TiledObject): string => String(o.type || (o as { class?: string }).class || '');
    const spawn = objects.find((o) => typeOf(o) === 'spawn');
    if (!spawn) throw new Error('maps/camp-lake.tmj: no spawn in layer objects');
    this.spots = objects.filter((o) => typeOf(o) === 'trigger' || typeOf(o) === 'npc')
      .map((o) => ({ name: o.name, kind: typeOf(o) as Spot['kind'], x: o.x ?? 0, y: o.y ?? 0 }));

    this.anims.create({ key: 'fire', frames: this.anims.generateFrameNumbers('campfire', { start: 0, end: 4 }), frameRate: 8, repeat: -1 });
    for (const dir of DIRS) {
      this.anims.create({ key: `walk-${dir}`, frames: Array.from({ length: COLS - 1 }, (_, i) => ({ key: 'player', frame: frameIndex(dir, i + 1) })), frameRate: WALK_FPS, repeat: -1 });
    }
    for (const s of this.spots) {
      // Точка об'єкта — ноги/основа: спрайт стоїть на ній, а глибина сортування — її y.
      if (s.kind === 'npc') this.add.sprite(s.x, s.y, 'elise', frameIndex('down', 0)).setOrigin(0.5, ORIGIN_Y).setDepth(s.y);
      else if (s.name === 'obj.campfire') this.add.sprite(s.x, s.y, 'campfire').setOrigin(0.5, 0.85).setDepth(s.y).play('fire');
    }

    this.player = this.physics.add.sprite(spawn.x ?? 0, spawn.y ?? 0, 'player', frameIndex('down', 0));
    this.player.setOrigin(0.5, ORIGIN_Y);
    this.player.body.setSize(BODY.w, BODY.h);
    this.player.body.setOffset(FRAME / 2 - BODY.w / 2, FRAME * ORIGIN_Y - BODY.h / 2);
    this.player.setCollideWorldBounds(true);
    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.physics.add.collider(this.player, walls);

    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
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
    this.last = { x: this.player.x, y: this.player.y };
    // Зонд має правдиві значення вже в момент ready, а не після першого update.
    Object.assign(this.probe, { playerX: this.player.x, playerY: this.player.y, playerFrame: frameIndex(this.facing, 0), playerDir: this.facing, playerMoving: false, playerDepth: this.player.y });
    this.probe.ready = true;
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
  private bake(key: string, map: Phaser.Tilemaps.Tilemap, layers: Phaser.Tilemaps.TilemapLayer[]): Phaser.GameObjects.Image {
    const tex = this.textures.addDynamicTexture(key, map.widthInPixels, map.heightInPixels);
    if (!tex) throw new Error(`bake texture ${key} failed`);
    tex.draw(layers);
    tex.render();
    return this.add.image(0, 0, key).setOrigin(0, 0);
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

  override update(time: number): void {
    // GAME-97: годинник ядра — від сирої дельти кадру, а не від згладженої. Phaser 120 кадрів після старту (і поза фокусом)
    // ріже дельту до 16,7 мс, а понад 200 мс підміняє останньою «нормальною»: при 8 fps годинник ішов у 8 разів повільніше
    // за реальний час. Межу кадру (згорнута вкладка) тримає сам міст — MAX_FRAME_MS.
    this.bridge.frame(this.game.loop.rawDelta);
    this.countFps(time);
    if (!this.player) return;   // update може випередити create лише в першому кадрі завантаження
    const held = consumeFrame(this.controls);
    const v = moveVector(held);
    // Рухається той, хто справді зсунувся з минулого кадру (по зсуву, а не по швидкості — вона лишається, коли тіло вперлося в стіну): упертий у стіну персонаж стоїть, а не «іде на місці».
    const moving = Math.hypot(this.player.x - this.last.x, this.player.y - this.last.y) > 0.25;
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
    for (const s of this.spots) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, s.x, s.y);
      if (d <= best) { best = d; spot = s; }
    }
    const near = spot?.name ?? null;
    // Тап: лише по цілі, що в зоні дії. Поза зоною нічого (без прокладання шляху, GAME-95).
    const tapped = this.tap;
    this.tap = null;
    const tapSpot = tapped ? this.spots.find((s) => Phaser.Math.Distance.Between(this.player.x, this.player.y, s.x, s.y) <= INTERACT_RANGE && tapHitsSpot(s, tapped)) ?? null : null;
    const target = tapSpot ?? spot;
    if (this.gate(held.has('interact') || tapSpot !== null, time) && target) {
      if (target.kind === 'npc') this.onNpc(target.name);
      else this.bridge.send({ type: 'Interact', targetId: target.name });
    }

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
    });
  }
}
