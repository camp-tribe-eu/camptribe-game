// Сцена світу (GAME-24): рух, камера, колізії, взаємодія з об'єктом. Лише відображення:
// взаємодія надсилає команду в ядро через місток.
import Phaser from 'phaser';
import { KEY_BINDINGS, consumeFrame, createActionGate, moveVector, press, release, type Action, type InputState } from './actions';
import type { Bridge } from './bridge';

export const TILE = 16;
export const SPEED = 64; // px/с — 4 тайли за секунду
const INTERACT_RANGE = TILE * 1.5;

export interface WorldProbe {
  ready: boolean;
  playerX: number;
  playerY: number;
  nearObject: string | null;
  commandsSent: number;
  cameraScrollX: number;
  cameraScrollY: number;
  clockMinutes: number;
}

export class WorldScene extends Phaser.Scene {
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private readonly gate = createActionGate();
  private interactions = 0;
  private campfire!: Phaser.GameObjects.Image;

  constructor(private readonly bridge: Bridge, private readonly controls: InputState, private readonly probe: WorldProbe) {
    super('world');
  }

  preload(): void {
    this.load.tilemapTiledJSON('camp', 'spike/camp.tmj');
    this.load.spritesheet('kenney-rpg', 'spike/kenney-rpg.png', { frameWidth: TILE, frameHeight: TILE, spacing: 1 });
  }

  create(): void {
    const map = this.make.tilemap({ key: 'camp' });
    const tiles = map.addTilesetImage('kenney-rpg', 'kenney-rpg', TILE, TILE, 0, 1);
    if (!tiles) throw new Error('tileset kenney-rpg не завантажився');
    map.createLayer('ground', tiles);
    const walls = map.createLayer('walls', tiles);
    if (!walls) throw new Error('шар walls відсутній');
    walls.setCollisionByExclusion([-1]);

    // Вогнище з аркуша Kenney (кадр 15,8): об'єкт взаємодії.
    this.campfire = this.add.image(3 * TILE + 8, 4 * TILE + 8, 'kenney-rpg', 8 * 57 + 15);

    const g = this.add.graphics();
    g.fillStyle(0xd94f30).fillRect(0, 0, 12, 12);
    g.generateTexture('player', 12, 12);
    g.destroy();
    this.player = this.physics.add.sprite(6 * TILE + 8, 5 * TILE + 8, 'player');
    this.player.setCollideWorldBounds(true);
    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.physics.add.collider(this.player, walls);

    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.cameras.main.startFollow(this.player, true);
    this.cameras.main.roundPixels = true;

    const keyboard = this.input.keyboard;
    if (keyboard) {
      for (const [action, codes] of Object.entries(KEY_BINDINGS) as [Action, readonly string[]][]) {
        if (action === 'pause') continue; // пауза — справа оболонки UI
        for (const code of codes) {
          const key = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes[code.replace(/^Key/, '').replace(/^Arrow/, '').toUpperCase() as keyof typeof Phaser.Input.Keyboard.KeyCodes]);
          key.on('down', () => press(this.controls, action));
          key.on('up', () => release(this.controls, action));
        }
      }
    }
    this.probe.ready = true;
  }

  override update(time: number, delta: number): void {
    this.bridge.frame(delta);
    const held = consumeFrame(this.controls);
    const v = moveVector(held);
    this.player.setVelocity(v.x * SPEED, v.y * SPEED);

    const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.campfire.x, this.campfire.y);
    const near = dist <= INTERACT_RANGE ? 'obj.campfire' : null;
    if (this.gate(held.has('interact'), time) && near) {
      this.interactions++;
      this.bridge.send({ type: 'GrantReward', commandId: `interact.${near}.${this.interactions}`, grantId: 'rw.campfire_warmth', moneyCents: 0 });
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
