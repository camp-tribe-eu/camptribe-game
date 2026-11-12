// Розмір кадру гри під форму поля (GAME-84 №13, GAME-96). Чиста функція — щоб її перевіряв юніт-тест, а не око.
/** Кадр у пікселях гри і цілий масштаб до екрана: полотно на екрані = width×zoom на height×zoom CSS px. */
export interface Frame { readonly width: number; readonly height: number; readonly zoom: number }

/** Опорна ширина для масштабу, px (GAME-93: 20 × 32). Мапа кемпінгу з GAME-172 — 40 × 32 = 1280, тож ширший за 640 кадр порожнечі не покаже; число лишено, бо від нього залежить цілий zoom (затверджений вигляд). */
export const MAP_WIDTH = 640;
/** Опорна висота для масштабу, px (GAME-93: 12 × 32); мапа GAME-172 — 24 × 32 = 768. Число лишено з тієї ж причини. */
export const MAP_HEIGHT = 384;
/** Справжній зріст героя, px гри (непрозорі рядки кадру 64×64; e2e звіряє з текстурою: probe.heroBody). Від нього залежить масштаб ПК/телефона вбік. */
export const HERO_BODY_PX = 49;
/** GAME-254: зріст героя на екрані ≈ 1/HERO_FRACTION висоти поля (смак власника 05.11: «здоровенні пікселі»). Цілий масштаб — найближчий до цього. */
export const HERO_FRACTION = 9;
/** OD-030: поле вбік не вище за це — телефон; на ньому масштаб як до GAME-254 (крупніше). */
export const PHONE_LANDSCAPE_MAX_H = 520;
/** GAME-278: пристрій з дотиком (pointer: coarse) до цієї висоти поля — теж «телефон» (планшет 1024×600 не мусить бути крихітним; рецензія #211, стрибок 520/521). */
export const TOUCH_PHONE_MAX_H = 820;
/** GAME-278: явний масштаб дозволено, лише коли зріст героя на екрані — від 6 % до 30 % висоти поля. */
export const HERO_MIN_FRACTION = 0.06;
export const HERO_MAX_FRACTION = 0.3;
/** GAME-278: доторкова ціль у світі — плитка 32 px; на дотику (coarse) вона мусить бути ≥ 44 px на екрані, тож ×1 там не пропонуємо. */
export const TILE_PX = 32;
export const TOUCH_TARGET_PX = 44;
/** GAME-278: найменший кадр у пікселях гри, за якого сцена ще читається (не «замочна щілина»). */
export const MIN_FRAME_W = 120;
export const MIN_FRAME_H = 90;

/** GAME-300: розмір поточної мапи в пікселях гри (мала мапа — крамниця 448×384 — не покриває кадр ПК). */
export interface MapPx { readonly w: number; readonly h: number }
/** GAME-300: мапа вважається такою, що покриває поле, коли її зображення на екрані ≥ цієї частки поля (2–3 % не варті стрибка масштабу). */
export const MAP_COVER_MIN = 0.97;

/**
 * GAME-300 (власник побачив у вікні 2000×1086 мапу крамниці 896 px зліва, решту — порожній фіолет): у режимі «Авто» мала мапа підіймає цілий масштаб до
 * найменшого k, за якого вона покриває поле (камера їде за героєм по решті). Стеля — зріст героя ≤ HERO_MAX_FRACTION висоти поля (як і в кроках повзунка),
 * тож на телефоні, де це зробило б героя завеликим, лишається масштаб за правилом OD-030 (смуги кольору землі, як і було). Без мапи чи з явним кроком — k0.
 */
function coverMap(k0: number, w: number, h: number, map: MapPx | null): number {
  if (!map || !(map.w > 0 && map.h > 0)) return k0;
  const need = Math.max(Math.ceil((w * MAP_COVER_MIN) / map.w), Math.ceil((h * MAP_COVER_MIN) / map.h));
  const cap = Math.max(k0, Math.floor((HERO_MAX_FRACTION * h) / HERO_BODY_PX));
  return Math.max(k0, Math.min(need, cap));
}

/**
 * Широке поле (телефон вбік, десктоп; GAME-96, смак власника 25.10): мапа на ВСЮ ширину екрана, без чорних смуг з боків. Масштаб k —
 * ЦІЛИЙ (чіткі пікселі) і найменший, за якого кадр не ширший за мапу і не вищий за неї: k = max(⌈w / 640⌉, ⌈h / 384⌉); кадр = ⌈поле / k⌉,
 * тож полотно k·кадр ≥ поле — покриває його, зайве (< k px) ховає overflow поля. Що не влізло — везе камера за персонажем по обох осях.
 * Було 640×352 під FIT: на 844×390 — смуги по 56 px з боків, на 1280×800 — полотно 1280×704 із чорним низом.
 * Вузьке (телефон сторч, GAME-91, затверджено як є): мапу вмикаємо на всю висоту поля, k = висота поля / висота мапи, округлено;
 * кадр = ⌊поле / k⌋, але не вище за мапу; що не влізло по ширині — везе камера.
 * Поле без розміру (ще не розкладене) — кадр 640×352 ×1 за замовчуванням (як було).
 */
export function frameSize(w: number, h: number, coarse = false, zoom = 0, map: MapPx | null = null): Frame {
  if (!(w > 0 && h > 0)) return { width: 640, height: 352, zoom: 1 };
  const aspect = w / h;
  const explicit = zoom > 0 && zoomSteps(w, h, coarse).includes(zoom) ? zoom : 0;   // непридатний для цього поля крок → Авто (налаштування не чіпаємо)
  if (aspect >= 1.2) {
    // GAME-254: цілий k, за якого зріст героя найближчий до 1/9 висоти поля (було ⌈w/640⌉, ⌈h/384⌉: 1280×800 → 3, 932×430 → 2). Кадр не обмежений
    // мапою табору: камера клампить, а мала мапа (крамниця) отримує смуги кольору землі (scene: setBackgroundColor).
    // OD-030 (власник 07.11, «як у Долині»): телефон вбік (поле ≤ PHONE_LANDSCAPE_MAX_H заввишки) лишає попередній крупніший масштаб — на малому екрані
    // герой і цілі мусять бути великі; дрібніше — лише ПК (і далі — повзунок «Масштаб» у налаштуваннях, окрема картка).
    const phone = h <= PHONE_LANDSCAPE_MAX_H || (coarse && h <= TOUCH_PHONE_MAX_H);
    const k = explicit || coverMap(phone ? Math.max(1, Math.ceil(w / MAP_WIDTH), Math.ceil(h / MAP_HEIGHT)) : Math.max(1, Math.round(h / (HERO_FRACTION * HERO_BODY_PX))), w, h, map);
    return { width: Math.ceil(w / k), height: Math.ceil(h / k), zoom: k };
  }
  const k = explicit || coverMap(Math.max(1, Math.round(h / MAP_HEIGHT)), w, h, map);
  // GAME-300: висота = ⌈поле / k⌉ (було ⌊⌋ і не вище за MAP_HEIGHT): полотно покриває поле, під ним не лишається порожньої смуги (зайве < k px ховає overflow поля).
  return { width: Math.max(1, Math.floor(w / k)), height: Math.max(1, Math.ceil(h / k)), zoom: k };
}

/**
 * GAME-278 (OD-030): явні цілі масштаби, дозволені для поля w×h: зріст героя на екрані (HERO_BODY_PX·k) — від 6 до 30 % висоти поля, кадр не менший за
 * MIN_FRAME_W×MIN_FRAME_H, а на дотику плитка (32·k) ≥ 44 px. «Авто» (0) — окремо і завжди доступне. Порожнє поле — порожній список.
 */
export function zoomSteps(w: number, h: number, coarse = false): readonly number[] {
  if (!(w > 0 && h > 0)) return [];
  const out: number[] = [];
  for (let k = 1; k <= 8; k++) {
    const hero = (HERO_BODY_PX * k) / h;
    if (hero < HERO_MIN_FRACTION || hero > HERO_MAX_FRACTION) continue;
    if (w / k < MIN_FRAME_W || h / k < MIN_FRAME_H) continue;
    if (coarse && TILE_PX * k < TOUCH_TARGET_PX) continue;
    out.push(k);
  }
  return out;
}
