// GAME-93 · графіка світу з assets/ (LPC). Файли титрів лежать лише в assets/ (public/ — тільки CC0/OFL), тож сцена бере їх
// імпортом Vite, а не завантажувачем Phaser за шляхом: шлях-літерал до assets/ завантажувач не роздав би. Сторож
// scripts/assets/check-scene-refs.mjs перевіряє кожен такий імпорт (файл існує, лежить в assets/), а check-assets.mjs — рядок
// титрів і реєстру кожного файлу.
import terrain from '../../../assets/tiles/terrain_atlas.png';
import tent from '../../../assets/tiles/camp_tent.png';
import car from '../../../assets/tiles/camp_car.png';
import homeWalls from '../../../assets/tiles/home_walls.png';
import homeFloor from '../../../assets/tiles/home_floor.png';
import homeWindowsDoors from '../../../assets/tiles/home_windows_doors.png';
import homeFurniture from '../../../assets/tiles/home_furniture.png';
import homeOffice from '../../../assets/tiles/home_office.png';
import homeShelf from '../../../assets/tiles/home_shelf.png';
import shopWoodshop from '../../../assets/tiles/shop_woodshop.png';
import shopTailor from '../../../assets/tiles/shop_tailor.png';
import shopDecor from '../../../assets/tiles/shop_decor.png';
import shopGear from '../../../assets/tiles/shop_gear.png';
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
import bodyTeen from '../../../assets/characters/body/bodies/teen/walk.png';
import headTeen from '../../../assets/characters/head/heads/human/male_small/walk.png';
import tshirtTeen from '../../../assets/characters/torso/clothes/shortsleeve/shortsleeve/teen/walk.png';
import hairMessy from '../../../assets/characters/hair/messy1/adult/walk.png';
import hairPixie from '../../../assets/characters/hair/pixie/adult/walk.png';
import bodyMaleSlash from '../../../assets/characters/body/bodies/male/slash.png';
import bodyMaleThrust from '../../../assets/characters/body/bodies/male/thrust.png';
import bodyMaleCast from '../../../assets/characters/body/bodies/male/spellcast.png';
import headMaleSlash from '../../../assets/characters/head/heads/human/male/slash.png';
import headMaleThrust from '../../../assets/characters/head/heads/human/male/thrust.png';
import headMaleCast from '../../../assets/characters/head/heads/human/male/spellcast.png';
import shoesMaleSlash from '../../../assets/characters/feet/shoes/basic/male/slash.png';
import shoesMaleThrust from '../../../assets/characters/feet/shoes/basic/male/thrust.png';
import shoesMaleCast from '../../../assets/characters/feet/shoes/basic/male/spellcast.png';
import pantsMaleSlash from '../../../assets/characters/legs/pants/male/slash.png';
import pantsMaleThrust from '../../../assets/characters/legs/pants/male/thrust.png';
import pantsMaleCast from '../../../assets/characters/legs/pants/male/spellcast.png';
import shirtMaleSlash from '../../../assets/characters/torso/clothes/longsleeve/longsleeve/male/slash.png';
import shirtMaleThrust from '../../../assets/characters/torso/clothes/longsleeve/longsleeve/male/thrust.png';
import shirtMaleCast from '../../../assets/characters/torso/clothes/longsleeve/longsleeve/male/spellcast.png';
import hairPlainSlash from '../../../assets/characters/hair/plain/adult/slash.png';
import hairPlainThrust from '../../../assets/characters/hair/plain/adult/thrust.png';
import hairPlainCast from '../../../assets/characters/hair/plain/adult/spellcast.png';
import catMia from '../../../assets/sprites/cat_mia.png';
import { ACTIONS, ACTION_COLS, composeSheet, loadImage, type Action, type LayerSpec } from './character';

/**
 * Тайлсети мап: ім'я в .tmj → картинка. Сцена реєструє їх усі; кожна мапа використовує свій набір (MAP_TILESETS) — рівно ці імена
 * звіряє map-content.test. GAME-175: дім і крамниця — тайлсети home-* (проба GAME-146) і двір з terrain/camp-car.
 */
export const TILESET_IMAGES: Readonly<Record<string, string>> = {
  'lpc-terrain': terrain, 'camp-tent': tent, 'camp-car': car,
  'home-walls': homeWalls, 'home-floor': homeFloor, 'home-windows-doors': homeWindowsDoors, 'home-furniture': homeFurniture, 'home-office': homeOffice, 'home-shelf': homeShelf,
  'shop-woodshop': shopWoodshop, 'shop-tailor': shopTailor, 'shop-decor': shopDecor, 'shop-gear': shopGear,
};
const HOME_SETS = ['home-walls', 'home-floor', 'home-windows-doors', 'home-furniture', 'home-office', 'home-shelf', 'lpc-terrain', 'camp-car'] as const;
/** GAME-204: крамниця спорядження — власний аркуш shop-gear (каса, намет, гондоли, двері), без домашніх меблів і книжкової полиці. */
const SHOP_SETS = ['home-walls', 'home-floor', 'shop-gear', 'lpc-terrain', 'camp-car'] as const;
/** Які тайлсети має кожна мапа гри (ключ — як у scene.ts і map-first.ts). */
export const MAP_TILESETS: Readonly<Record<'camp' | 'home' | 'shop' | 'road', readonly string[]>> = {
  camp: ['lpc-terrain', 'camp-tent', 'camp-car'],
  home: HOME_SETS,
  shop: SHOP_SETS,
  road: HOME_SETS,   // GAME-183: смуга дороги — трава/стежка terrain і авто, як двір дому
};
export const CAMPFIRE_SHEET = campfire;

const rgb = (r: number, g: number, b: number): readonly [number, number, number] => [r, g, b];

/**
 * Канонічні шаблони родини (OD-011; compose_chars.py проби). Шари знизу вгору; tint — колір одягу/волосся. Victoria з'явиться в грі
 * в розділі 1, тож жоден NPC не може мати її вигляд (looks.test). Matthew, 15 (GAME-147): підліткове тіло й менша голова
 * генератора, бордова футболка shortsleeve/teen (longsleeve/teen не має дозволеної ліцензії — реєстр ART-006), темне скуйовджене
 * волосся — нижчий за George на екрані, без його зеленої сорочки і далеко від гірчичної сорочки Елізи (теж темноволосої; looks.test).
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
  matthew: [
    { url: bodyTeen }, { url: headTeen }, { url: shoesThin, tint: rgb(220, 220, 220) }, { url: pantsThin, tint: rgb(50, 60, 90) },
    { url: tshirtTeen, tint: rgb(150, 50, 60) }, { url: hairMessy, tint: rgb(60, 40, 25) },
  ],
} as const satisfies Readonly<Record<string, readonly LayerSpec[]>>;

/** Вигляд гравця: чоловічий шаблон родини George. */
export const PLAYER_LOOK: readonly LayerSpec[] = FAMILY_LOOKS.george;
/**
 * GAME-191 (OD-022): ті самі шари й забарвлення, що PLAYER_LOOK, але з листами дії slash / thrust / spellcast того ж шару LPC
 * (ті самі автори, ліцензія й варіанти — assets/characters/<шар>/{slash,thrust,spellcast}.png). Порядок шарів збігається з george.
 */
export const PLAYER_ACTION_LOOK: Readonly<Record<Action, readonly LayerSpec[]>> = {
  slash: [{ url: bodyMaleSlash }, { url: headMaleSlash }, { url: shoesMaleSlash, tint: rgb(70, 50, 40) }, { url: pantsMaleSlash, tint: rgb(60, 80, 120) }, { url: shirtMaleSlash, tint: rgb(70, 120, 80) }, { url: hairPlainSlash, tint: rgb(90, 60, 35) }],
  thrust: [{ url: bodyMaleThrust }, { url: headMaleThrust }, { url: shoesMaleThrust, tint: rgb(70, 50, 40) }, { url: pantsMaleThrust, tint: rgb(60, 80, 120) }, { url: shirtMaleThrust, tint: rgb(70, 120, 80) }, { url: hairPlainThrust, tint: rgb(90, 60, 35) }],
  cast: [{ url: bodyMaleCast }, { url: headMaleCast }, { url: shoesMaleCast, tint: rgb(70, 50, 40) }, { url: pantsMaleCast, tint: rgb(60, 80, 120) }, { url: shirtMaleCast, tint: rgb(70, 120, 80) }, { url: hairPlainCast, tint: rgb(90, 60, 35) }],
};
/** Вигляд Елізи: власний шаблон NPC, не родини (GAME-114) — ті самі шари LPC, що й у Victoria, але чорне волосся й гірчична сорочка, щоб не плутати ні з Victoria, ні з гравцем. */
export const ELISE_LOOK: readonly LayerSpec[] = [
  { url: ponytailBack, tint: rgb(35, 28, 28) }, { url: bodyFemale }, { url: headFemale }, { url: shoesThin, tint: rgb(80, 60, 50) },
  { url: pantsThin, tint: rgb(90, 70, 60) }, { url: shirtFemale, tint: rgb(195, 150, 50) }, { url: ponytailFront, tint: rgb(35, 28, 28) },
];
/**
 * Anna, сусідка (GAME-147): практична, любить тварин. Жіноче тіло, як у Victoria й Eliza, але коротка стрижка pixie (у них —
 * хвіст), русяве волосся, бірюзова сорочка й оливкові штани — не плутається ні з рудо-помаранчевою Victoria, ні з гірчичною Eliza.
 */
export const ANNA_LOOK: readonly LayerSpec[] = [
  { url: bodyFemale }, { url: headFemale }, { url: shoesThin, tint: rgb(60, 70, 50) }, { url: pantsThin, tint: rgb(95, 85, 60) },
  { url: shirtFemale, tint: rgb(60, 130, 120) }, { url: hairPixie, tint: rgb(200, 170, 100) },
];
/**
 * GAME-172 · фонові мешканці табору (ambient.ts) — ті самі шари LPC, що вже в грі (нової графіки немає), інші забарвлення й зачіски.
 * Кожен відрізняється від родини й NPC або волоссям, або сорочкою на ≥ 60 (looks.test).
 */
export const RESIDENT_LOOKS = {
  nora: [
    { url: ponytailBack, tint: rgb(100, 55, 35) }, { url: bodyFemale }, { url: headFemale }, { url: shoesThin, tint: rgb(50, 50, 55) },
    { url: pantsThin, tint: rgb(80, 60, 50) }, { url: shirtFemale, tint: rgb(95, 185, 230) }, { url: ponytailFront, tint: rgb(100, 55, 35) },
  ],
  luc: [
    { url: bodyMale }, { url: headMale }, { url: shoesMale, tint: rgb(60, 45, 35) }, { url: pantsMale, tint: rgb(70, 70, 75) },
    { url: shirtMale, tint: rgb(205, 90, 40) }, { url: hairPlain, tint: rgb(150, 150, 150) },
  ],
  ingrid: [
    { url: bodyFemale }, { url: headFemale }, { url: shoesThin, tint: rgb(90, 70, 60) }, { url: pantsThin, tint: rgb(90, 80, 70) },
    { url: shirtFemale, tint: rgb(130, 90, 160) }, { url: hairPixie, tint: rgb(225, 225, 225) },
  ],
  sarah: [
    { url: ponytailBack, tint: rgb(225, 190, 90) }, { url: bodyFemale }, { url: headFemale }, { url: shoesThin, tint: rgb(70, 50, 40) },
    { url: pantsThin, tint: rgb(60, 60, 70) }, { url: shirtFemale, tint: rgb(70, 100, 190) }, { url: ponytailFront, tint: rgb(225, 190, 90) },
  ],
  claire: [
    { url: bodyFemale }, { url: headFemale }, { url: shoesThin, tint: rgb(60, 60, 60) }, { url: pantsThin, tint: rgb(110, 100, 90) },
    { url: shirtFemale, tint: rgb(45, 55, 110) }, { url: hairMessy, tint: rgb(170, 80, 50) },
  ],
  amina: [
    { url: ponytailBack, tint: rgb(50, 30, 28) }, { url: bodyFemale }, { url: headFemale }, { url: shoesThin, tint: rgb(40, 40, 50) },
    { url: pantsThin, tint: rgb(60, 60, 80) }, { url: shirtFemale, tint: rgb(225, 225, 215) }, { url: ponytailFront, tint: rgb(50, 30, 28) },
  ],
} as const satisfies Readonly<Record<string, readonly LayerSpec[]>>;

/** Усі NPC зі своїм виглядом: сторож looks.test порівнює їх із родиною. */
export const NPC_LOOKS: Readonly<Record<string, readonly LayerSpec[]>> = { elise: ELISE_LOOK, anna: ANNA_LOOK, ...RESIDENT_LOOKS };

/**
 * Mia, сіра смугаста кішка родини (GAME-147): готовий аркуш assets/sprites/cat_mia.png із «[LPC] Cats and Dogs» (ART-020; ART-010…015 зайняті GAME-146), не
 * шари. Клітинка 32 px; рядки 0–3 — ходьба праворуч / вгору / вниз / ліворуч по 3 кадри (стовпці 0–2), у рядках 0 і 3 стовпець 3 —
 * лежить; рядок 4 — сидить. У сцену ще не підключена: тут лише опис аркуша, щоб сцена і майбутній сторож брали ті самі числа.
 */
export const PET_SHEETS = {
  mia: { url: catMia, frame: 32, cols: 4, rows: 5, walkCols: 3, walkRow: { right: 0, up: 1, down: 2, left: 3 } as const, lyingCells: [[0, 3], [3, 3]] as const, sitRow: 4 },
} as const;

export interface WorldArt {
  readonly tilesets: Readonly<Record<string, HTMLImageElement>>;
  readonly campfire: HTMLImageElement;
  /** GAME-184: лист кішки Mia (PET_SHEETS.mia), декодований заздалегідь — сцена додає його як спрайтшит. */
  readonly mia: HTMLImageElement;
  readonly sheets: { readonly player: HTMLCanvasElement; readonly elise: HTMLCanvasElement; readonly victoria: HTMLCanvasElement; readonly matthew: HTMLCanvasElement };
  /** GAME-191: листи дій героя (slash / thrust / cast). */
  readonly playerActions: Readonly<Record<Action, HTMLCanvasElement>>;
  /** GAME-172: листи ходьби фонових мешканців за ключем RESIDENT_LOOKS. */
  readonly residents: Readonly<Record<string, HTMLCanvasElement>>;
}

/**
 * Вся графіка сцени, декодована ДО створення гри: сцена будується синхронно в create(), як і раніше, тож `probe.ready` і позиція
 * персонажа з'являються одразу разом зі сценою (e2e, що чекає інших ознак готовності, не бачить недобудованої сцени).
 */
export async function loadWorldArt(): Promise<WorldArt> {
  const names = Object.keys(TILESET_IMAGES);
  const residentNames = Object.keys(RESIDENT_LOOKS) as (keyof typeof RESIDENT_LOOKS)[];
  const [images, campfireImg, miaImg, player, elise, victoria, matthew, residentSheets, actionSheets] = await Promise.all([
    Promise.all(names.map((n) => loadImage(TILESET_IMAGES[n] ?? ''))),
    loadImage(CAMPFIRE_SHEET), loadImage(PET_SHEETS.mia.url), composeSheet(PLAYER_LOOK), composeSheet(ELISE_LOOK), composeSheet(FAMILY_LOOKS.victoria), composeSheet(FAMILY_LOOKS.matthew),
    Promise.all(residentNames.map((n) => composeSheet(RESIDENT_LOOKS[n]))),
    Promise.all(ACTIONS.map((a) => composeSheet(PLAYER_ACTION_LOOK[a], ACTION_COLS[a]))),
  ]);
  return { tilesets: Object.fromEntries(names.map((n, i) => [n, images[i] as HTMLImageElement])), campfire: campfireImg, mia: miaImg, sheets: { player, elise, victoria, matthew }, playerActions: Object.fromEntries(ACTIONS.map((a, i) => [a, actionSheets[i] as HTMLCanvasElement])) as Record<Action, HTMLCanvasElement>, residents: Object.fromEntries(residentNames.map((n, i) => [n, residentSheets[i] as HTMLCanvasElement])) };
}
