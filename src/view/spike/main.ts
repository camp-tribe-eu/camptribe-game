// GAME-14 · спайк Phaser 4: мапа Tiled (.tmj, тайли Kenney), піксельний масштаб без згладжування,
// колізії. Не гра — доказ для TD-002. Тест: tests/e2e/spike.spec.ts.
import Phaser from 'phaser';

export const ZOOM = 3;
const TILE = 16;

/** Стан для e2e-тесту: Playwright читає його й штовхає персонажа в стіну. */
interface SpikeProbe {
  ready: boolean;
  pushFrames: number;
  framesPushed: number;
  playerX: number;
  wallLeftX: number;
}
const probe: SpikeProbe = { ready: false, pushFrames: 0, framesPushed: 0, playerX: 0, wallLeftX: 10 * TILE };
(window as unknown as { __spike: SpikeProbe }).__spike = probe;

class CampScene extends Phaser.Scene {
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;

  preload(): void {
    this.load.tilemapTiledJSON('camp', 'spike/camp.tmj');
    this.load.image('kenney-rpg', 'spike/kenney-rpg.png');
  }

  create(): void {
    const map = this.make.tilemap({ key: 'camp' });
    const tiles = map.addTilesetImage('kenney-rpg', 'kenney-rpg', TILE, TILE, 0, 1);
    if (!tiles) throw new Error('tileset kenney-rpg failed to load');
    map.createLayer('ground', tiles);
    const walls = map.createLayer('walls', tiles);
    if (!walls) throw new Error('layer walls is missing in camp.tmj');
    walls.setCollisionByExclusion([-1]);

    const g = this.add.graphics();
    g.fillStyle(0xd94f30).fillRect(0, 0, 12, 12);
    g.generateTexture('player', 12, 12);
    g.destroy();

    this.player = this.physics.add.sprite(6 * TILE + 8, 5 * TILE + 8, 'player');
    this.physics.add.collider(this.player, walls);
    probe.ready = true;
  }

  override update(): void {
    if (probe.pushFrames > 0) {
      this.player.setVelocityX(240);
      probe.pushFrames--;
      probe.framesPushed++;
    } else {
      this.player.setVelocityX(0);
    }
    probe.playerX = this.player.body.right;
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 20 * TILE,
  height: 12 * TILE,
  zoom: ZOOM,
  pixelArt: true,
  backgroundColor: '#000000',
  render: { preserveDrawingBuffer: true },
  physics: { default: 'arcade', arcade: { debug: false } },
  scene: [CampScene],
});
