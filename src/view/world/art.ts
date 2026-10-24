// GAME-93 · графіка світу з assets/ (LPC). Файли титрів лежать лише в assets/ (public/ — тільки CC0/OFL), тож сцена бере їх
// імпортом Vite, а не завантажувачем Phaser за шляхом: шлях-літерал до assets/ завантажувач не роздав би. Сторож
// scripts/assets/check-scene-refs.mjs перевіряє кожен такий імпорт (файл існує, лежить в assets/), а check-assets.mjs — рядок
// титрів і реєстру кожного файлу.
import terrain from '../../../assets/tiles/terrain_atlas.png';
import tent from '../../../assets/tiles/camp_tent.png';
import car from '../../../assets/tiles/camp_car.png';
import campfire from '../../../assets/sprites/campfire.png';
import bodyMale from '../../../assets/characters/body/bodies/male/walk.png';
import bodyFemale from '../../../assets/characters/body/bodies/female/walk.png';
import headMale from '../../../assets/characters/head/heads/human/male/walk.png';
import headFemale from '../../../assets/characters/head/heads/human/female/walk.png';
import shoesMale from '../../../assets/characters/feet/shoes/basic/male/walk.png';
import shoesThin from '../../../assets/characters/feet/shoes/basic/thin/walk.png';
import pantsMale from '../../../assets/characters/legs/pants/male/walk.png';
import pantsThin from '../../../assets/characters/legs/pants/thin/walk.png';
import shirtMale from '../../../assets/characters/torso/clothes/longsleeve/longsleeve/male/walk.png';
import shirtFemale from '../../../assets/characters/torso/clothes/longsleeve/longsleeve/female/walk.png';
import hairPlain from '../../../assets/characters/hair/plain/adult/walk.png';
import ponytailBack from '../../../assets/characters/hair/ponytail/adult/bg/walk.png';
import ponytailFront from '../../../assets/characters/hair/ponytail/adult/fg/walk.png';
import { composeSheet, loadImage, type LayerSpec } from './character';

/** Тайлсети мапи: ім'я в camp-lake.tmj → картинка. Мапа й сцена мусять мати рівно ці імена (перевіряє map-content.test). */
export const TILESET_IMAGES: Readonly<Record<string, string>> = { 'lpc-terrain': terrain, 'camp-tent': tent, 'camp-car': car };
export const CAMPFIRE_SHEET = campfire;

const rgb = (r: number, g: number, b: number): readonly [number, number, number] => [r, g, b];

/**
 * Канонічні шаблони родини (OD-011; compose_chars.py проби). Шари знизу вгору; tint — колір одягу/волосся. Victoria з'явиться в грі
 * в розділі 1, тож жоден NPC не може мати її вигляд (looks.test). Matthew (підліток) не додано: шару torso/longsleeve/teen
 * немає в assets/, а новий PNG потребує рядка реєстру ліцензій.
 */
export const FAMILY_LOOKS = {
  george: [
    { url: bodyMale }, { url: headMale }, { url: shoesMale, tint: rgb(70, 50, 40) }, { url: pantsMale, tint: rgb(60, 80, 120) },
    { url: shirtMale, tint: rgb(70, 120, 80) }, { url: hairPlain, tint: rgb(90, 60, 35) },
  ],
  victoria: [
    { url: ponytailBack, tint: rgb(150, 90, 40) }, { url: bodyFemale }, { url: headFemale }, { url: shoesThin, tint: rgb(120, 60, 60) },
    { url: pantsThin, tint: rgb(70, 70, 90) }, { url: shirtFemale, tint: rgb(200, 110, 90) }, { url: ponytailFront, tint: rgb(150, 90, 40) },
  ],
} as const satisfies Readonly<Record<string, readonly LayerSpec[]>>;

/** Вигляд гравця: чоловічий шаблон родини George. */
export const PLAYER_LOOK: readonly LayerSpec[] = FAMILY_LOOKS.george;
/** Вигляд Елізи: власний шаблон NPC, не родини (GAME-114) — ті самі шари LPC, що й у Victoria, але чорне волосся й гірчична сорочка, щоб не плутати ні з Victoria, ні з гравцем. */
export const ELISE_LOOK: readonly LayerSpec[] = [
  { url: ponytailBack, tint: rgb(35, 28, 28) }, { url: bodyFemale }, { url: headFemale }, { url: shoesThin, tint: rgb(80, 60, 50) },
  { url: pantsThin, tint: rgb(90, 70, 60) }, { url: shirtFemale, tint: rgb(195, 150, 50) }, { url: ponytailFront, tint: rgb(35, 28, 28) },
];
/** Усі NPC зі своїм виглядом: сторож looks.test порівнює їх із родиною. */
export const NPC_LOOKS: Readonly<Record<string, readonly LayerSpec[]>> = { elise: ELISE_LOOK };

export interface WorldArt {
  readonly tilesets: Readonly<Record<string, HTMLImageElement>>;
  readonly campfire: HTMLImageElement;
  readonly sheets: { readonly player: HTMLCanvasElement; readonly elise: HTMLCanvasElement };
}

/**
 * Вся графіка сцени, декодована ДО створення гри: сцена будується синхронно в create(), як і раніше, тож `probe.ready` і позиція
 * персонажа з'являються одразу разом зі сценою (e2e, що чекає інших ознак готовності, не бачить недобудованої сцени).
 */
export async function loadWorldArt(): Promise<WorldArt> {
  const names = Object.keys(TILESET_IMAGES);
  const [images, campfireImg, player, elise] = await Promise.all([
    Promise.all(names.map((n) => loadImage(TILESET_IMAGES[n] ?? ''))),
    loadImage(CAMPFIRE_SHEET), composeSheet(PLAYER_LOOK), composeSheet(ELISE_LOOK),
  ]);
  return { tilesets: Object.fromEntries(names.map((n, i) => [n, images[i] as HTMLImageElement])), campfire: campfireImg, sheets: { player, elise } };
}
