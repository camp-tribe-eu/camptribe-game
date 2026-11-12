// GAME-303 · подача вступу «гібрид» (рішення власника): уся розмова родини «з різних кімнат» — КОМІКС-панелі (кожна кімната своя, репліка в панелі свого героя);
// ніч, сон про дорогу й ранок — ПОВНОКАДРОВІ шоти (кіно). Чиста модель без DOM: для кроку розкадровки (intro-story.ts) повертає «вигляд» — що показати на екрані.
// Зв'язок із кроком — за ВМІСТОМ кроку (вид + ключ тексту), а не за індексом: інший агент може вставити крок у вступ, і модель його просто не знає
// (null → крок малюється як раніше). Таймерів немає: вигляд міняється лише від дотику; рух кіно — CSS-анімація.
import type { Key } from '../i18n';
import type { Step } from './intro-story';

export type RoomId = 'matthew' | 'george' | 'victoria';
export type Phase = 'night' | 'morning';
/** Що малює художник кадру: кімната з людиною (стоїть чи спить) або сон про дорогу. */
export type ShotSpec =
  | { readonly kind: 'room'; readonly room: RoomId; readonly pose: 'stand' | 'sleep'; readonly phase: Phase }
  | { readonly kind: 'dream' };

/** Один вигляд екрана. Комікс: сторінка з панелями `slots`, показано перші `shown`, бульбашка в `speaker`. Кіно: один кадр — `slots[speaker ?? 0]`. */
export interface SceneView {
  /** comic — сторінка панелей; cinema — один повнокадровий шот (слоти показуються один за одним, далі за потреби сон). */
  readonly mode: 'comic' | 'cinema';
  readonly phase: Phase;
  readonly slots: readonly ShotSpec[];
  readonly shown: number;
  readonly speaker: number | null;
  /** Репліки панелей (за індексом слота): що вже сказано на цій сторінці; `lines[speaker]` — репліка поточного кроку. null — панель мовчить. */
  readonly lines: readonly (Key | null)[];
  /** Ключ підпису-рамки комікса / титру кіно («Ніч», «Субота, 08:00», «Їм сниться дорога…»). */
  readonly caption: Key | null;
  /** Звуковий напис («Дзззінь!», «z z Z»). */
  readonly sfx: Key | null;
  /** Кіно: який слот показати, коли репліки немає (німий вигляд: сплять, будильник). */
  readonly focus: number;
  /** Кіно: після шотів слотів м'яко розчиняється сон про дорогу (підпис `intro.dream`). */
  readonly dream: boolean;
}

const room = (r: RoomId, phase: Phase, pose: 'stand' | 'sleep' = 'stand'): ShotSpec => ({ kind: 'room', room: r, pose, phase });
/** Порядок панелей на сторінці — порядок реплік: хто заговорив першим, той першим і в сторінці. */
const NIGHT_TALK = [room('matthew', 'night'), room('george', 'night'), room('victoria', 'night')] as const;
const NIGHT_BED = [room('victoria', 'night')] as const;
const NIGHT_SLEEP = [room('matthew', 'night', 'sleep'), room('george', 'night', 'sleep'), room('victoria', 'night', 'sleep')] as const;
const MORNING = [room('victoria', 'morning'), room('matthew', 'morning'), room('george', 'morning')] as const;

const v = (phase: Phase, slots: readonly ShotSpec[], shown: number, speaker: number | null, lines: readonly (Key | null)[]): SceneView => ({ mode: 'comic', phase, slots, shown, speaker, lines, caption: null, sfx: null, focus: 0, dream: false });
const cine = (phase: Phase, slots: readonly ShotSpec[], caption: Key, sfx: Key, o: { focus?: number; dream?: boolean } = {}): SceneView => ({ mode: 'cinema', phase, slots, shown: slots.length, speaker: null, lines: slots.map(() => null), caption, sfx, focus: o.focus ?? 0, dream: o.dream === true });

/** Вигляд по кроках: ключ — `вид:ключ тексту`. Кроки, яких тут немає, гібрид не чіпає. */
const VIEWS: Readonly<Record<string, SceneView>> = {
  'line:intro.matthew1': v('night', NIGHT_TALK, 1, 0, ['intro.matthew1', null, null]),
  'line:intro.george1': v('night', NIGHT_TALK, 2, 1, ['intro.matthew1', 'intro.george1', null]),
  'line:intro.victoria1': v('night', NIGHT_TALK, 3, 2, ['intro.matthew1', 'intro.george1', 'intro.victoria1']),
  'line:intro.victoria.bed': v('night', NIGHT_BED, 1, 0, ['intro.victoria.bed']),
  // Ніч — повнокадровий ролик за ОДИН крок: родина спить (три шоти один за одним) → їм сниться дорога (розчинення). Дотик у будь-яку мить іде далі.
  'night:': cine('night', NIGHT_SLEEP, 'intro.night', 'intro.zzz', { dream: true }),
  // Ранок — повний кадр: будильник у кімнаті Метью.
  'morning:': cine('morning', MORNING, 'intro.morning', 'intro.alarm', { focus: 1 }),
  'line:intro.chaos.victoria': v('morning', MORNING, 3, 0, ['intro.chaos.victoria', null, null]),
  'line:intro.chaos.matthew': v('morning', MORNING, 3, 1, ['intro.chaos.victoria', 'intro.chaos.matthew', null]),
  'line:intro.chaos.george': v('morning', MORNING, 3, 2, ['intro.chaos.victoria', 'intro.chaos.matthew', 'intro.chaos.george']),
};

export const sceneKey = (s: Pick<Step, 'kind' | 'text'>): string => `${s.kind}:${s.text ?? ''}`;
/** Вигляд кроку; null — крок поза гібридом (пошук, лист, вибір, Атлас, мета). */
export const sceneView = (s: Pick<Step, 'kind' | 'text'>): SceneView | null => VIEWS[sceneKey(s)] ?? null;

/** Для кожного ключа: комікс-сторінка накопичує панелі, тож `shown` не спадає в межах однієї сторінки (сторож моделі в intro-scene.test.ts). */
export const sceneKeys = (): readonly string[] => Object.keys(VIEWS);

/** Мова персонажа в кадрі кімнати → хто це (для бульбашки: ім'я з контенту). */
export const ROOM_WHO: Readonly<Record<RoomId, string>> = { matthew: 'npc.matthew', george: 'npc.george', victoria: 'npc.victoria' };
