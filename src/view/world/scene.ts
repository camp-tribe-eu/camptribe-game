// Сцена світу (GAME-24): рух, камера, колізії, взаємодія з об'єктом. Лише відображення:
// взаємодія надсилає команду в ядро через місток.
// GAME-32: мапа — maps/camp-lake.tmj під валідатором мап (npm run validate, --dir public/maps).
// Точку появи, тригери й NPC сцена бере з шару `objects` цієї мапи — тобто саме ті координати, для
// яких валідатор довів досяжність пішки (а не числа, вписані в код окремо від мапи).
import Phaser from 'phaser';
import { KEY_BINDINGS, KEY_CODES, consumeFrame, createActionGate, moveVector, press, release, type Action, type InputState } from './actions';
import type { Bridge } from './bridge';

export const TILE = 16;
export const SPEED = 64; // px/с — 4 тайли за секунду
const INTERACT_RANGE = TILE * 1.5;

/** Об'єкт мапи, з яким можна взаємодіяти: тригер (Interact у ядро) чи NPC (розмова). */
interface Spot { readonly name: string; readonly kind: 'trigger' | 'npc'; readonly x: number; readonly y: number }

export interface WorldProbe {
  ready: boolean;
  playerX: number;
  playerY: number;
  nearObject: string | null;
  commandsSent: number;
  cameraScrollX: number;
  cameraScrollY: number;
  clockMinutes: number;
  /** Стартове завантаження сейву завершено (є він чи ні). */
  saveLoaded: boolean;
  /** lerp камери [x, y], прочитаний з живої камери: 1 — миттєвий слід, без плавного «доїзду» (GAME-39 #3). */
  cameraLerp: [number, number];
}

export class WorldScene extends Phaser.Scene {
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private readonly gate = createActionGate();
  private spots: Spot[] = [];

  /** onNpc — гравець заговорив із NPC на мапі (розмову веде екран подорожі). */
  constructor(private readonly bridge: Bridge, private readonly controls: InputState, private readonly probe: WorldProbe, private readonly onNpc: (npcId: string) => void = () => {}) {
    super('world');
  }

  preload(): void {
    this.load.tilemapTiledJSON('camp', 'maps/camp-lake.tmj');
    this.load.spritesheet('kenney-rpg', 'spike/kenney-rpg.png', { frameWidth: TILE, frameHeight: TILE, spacing: 1 });
  }

  create(): void {
    const map = this.make.tilemap({ key: 'camp' });
    const tiles = map.addTilesetImage('kenney-rpg', 'kenney-rpg', TILE, TILE, 0, 1);
    if (!tiles) throw new Error('tileset kenney-rpg failed to load');
    map.createLayer('ground', tiles);
    const walls = map.createLayer('walls', tiles);
    if (!walls) throw new Error('layer walls is missing');
    walls.setCollisionByExclusion([-1]);

    const objects = map.getObjectLayer('objects')?.objects ?? [];
    const typeOf = (o: Phaser.Types.Tilemaps.TiledObject): string => String(o.type || (o as { class?: string }).class || '');
    const spawn = objects.find((o) => typeOf(o) === 'spawn');
    if (!spawn) throw new Error('maps/camp-lake.tmj: no spawn in layer objects');
    this.spots = objects.filter((o) => typeOf(o) === 'trigger' || typeOf(o) === 'npc')
      .map((o) => ({ name: o.name, kind: typeOf(o) as Spot['kind'], x: o.x ?? 0, y: o.y ?? 0 }));

    const square = (key: string, color: number): void => {
      const g = this.add.graphics();
      g.fillStyle(color).fillRect(0, 0, 12, 12);
      g.generateTexture(key, 12, 12);
      g.destroy();
    };
    square('player', 0xd94f30);
    square('npc', 0x4f7a3a); // сірий прототип (S01–S02): NPC — квадрат, доки немає спрайта LPC
    for (const s of this.spots) {
      // Вогнище з аркуша Kenney (кадр 15,8); інші тригери поки без картинки.
      if (s.kind === 'npc') this.add.image(s.x, s.y, 'npc');
      else if (s.name === 'obj.campfire') this.add.image(s.x, s.y, 'kenney-rpg', 8 * 57 + 15);
    }

    this.player = this.physics.add.sprite(spawn.x ?? 0, spawn.y ?? 0, 'player');
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
    this.probe.ready = true;
  }

  /** Межа паузи: зупинити тіло, інакше фізика дотягує стару швидкість після продовження (рецензія PR #13). */
  haltPlayer(): void {
    this.player.setVelocity(0, 0);
    this.player.body.reset(this.player.x, this.player.y);
  }

  override update(time: number, delta: number): void {
    this.bridge.frame(delta);
    const held = consumeFrame(this.controls);
    const v = moveVector(held);
    this.player.setVelocity(v.x * SPEED, v.y * SPEED);

    let spot: Spot | null = null;
    let best = INTERACT_RANGE;
    for (const s of this.spots) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, s.x, s.y);
      if (d <= best) { best = d; spot = s; }
    }
    const near = spot?.name ?? null;
    if (this.gate(held.has('interact'), time) && spot) {
      if (spot.kind === 'npc') this.onNpc(spot.name);
      else this.bridge.send({ type: 'Interact', targetId: spot.name });
    }

    Object.assign(this.probe, {
      playerX: this.player.x,
      playerY: this.player.y,
      nearObject: near,
      commandsSent: this.bridge.sent,
      cameraScrollX: this.cameras.main.scrollX,
      cameraScrollY: this.cameras.main.scrollY,
      clockMinutes: this.bridge.state.clock.minutes,
    });
  }
}
