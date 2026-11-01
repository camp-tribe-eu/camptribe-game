// GAME-202 · доручення родині: чисте читання прапорців у план сцени. Мутації (кожна — червоний тест): «доручення без виконавця» (parseErrand
// приймає будь-який хвіст як виконавця); «виконавець без справи» (план не фільтрує за isLive); «усі до однієї справи» (без унікальності).
import { describe, expect, it } from 'vitest';
import dialogues from '../../content/dialogue/victoria-chat.json';
import matthew from '../../content/dialogue/matthew-chat.json';
import flags from '../../content/flags.json';
import waves from '../../content/waves.json';
import { ERRAND_PREFIX, FAMILY, errandFlag, errandMove, parseErrand, plannedErrands } from './errands';

const setFlags = (d: { nodes: { choices?: { effects?: ({ setFlag: string } | object)[] }[] }[] }): string[] =>
  d.nodes.flatMap((n) => n.choices ?? []).flatMap((c) => c.effects ?? []).flatMap((e) => ('setFlag' in e ? [e.setFlag] : []));

describe('прапорець доручення → доручення', () => {
  it('f.errand-<справа>-<виконавець>: виконавець лише з родини; без нього — не доручення (мутація «доручення без виконавця»)', () => {
    expect(parseErrand('f.errand-gear-shelter-victoria')).toEqual({ member: 'victoria', task: 'gear-shelter', spot: 'task.gear-shelter', flag: 'f.errand-gear-shelter-victoria' });
    expect(parseErrand('f.errand-dinner-matthew')?.member).toBe('matthew');
    expect(parseErrand('f.errand-gear-shelter')).toBeNull();          // нікому
    expect(parseErrand('f.errand-gear-shelter-george')).toBeNull();   // герой роздає, а не виконує
    expect(parseErrand('f.errand-gear-shelter-elise')).toBeNull();    // сусідка — не родина
    expect(parseErrand('f.errand--victoria')).toBeNull();             // порожня справа
    expect(parseErrand('f.pitch-pines')).toBeNull();
    for (const m of FAMILY) expect(parseErrand(errandFlag('dinner', m))).toMatchObject({ member: m, task: 'dinner' });
  });
  it('план: лише живі справи, одна на виконавця й один виконавець на справу (мутації «виконавець без справи», «усі до однієї»)', () => {
    const live = new Set(['task.gear-shelter', 'task.dinner']);
    const isLive = (s: string): boolean => live.has(s);
    expect(plannedErrands([], isLive)).toEqual([]);
    expect(plannedErrands(['f.errand-gear-shelter-victoria', 'f.elise-met'], isLive).map((e) => e.member)).toEqual(['victoria']);
    // Справа закрита (не жива) — доручення зникає, Вікторія вільна.
    expect(plannedErrands(['f.errand-gear-shelter-victoria'], () => false)).toEqual([]);
    // Обидва на одну справу — іде лише перший за порядком родини; другий лишається вільним.
    expect(plannedErrands(['f.errand-gear-shelter-victoria', 'f.errand-gear-shelter-matthew'], isLive).map((e) => e.member)).toEqual(['matthew']);
    // У Вікторії дві справи — лише одна за раз (за абеткою прапорців), інша чекає живою.
    const two = plannedErrands(['f.errand-gear-shelter-victoria', 'f.errand-dinner-victoria'], isLive);
    expect(two).toHaveLength(1);
    expect(two[0]?.task).toBe('dinner');
    // Різні справи, різні виконавці — родина розходиться.
    expect(plannedErrands(['f.errand-gear-shelter-matthew', 'f.errand-dinner-victoria'], isLive)).toHaveLength(2);
  });
  it('команда ядру — CompleteTask від помічника (та сама справа, що й на позначці)', () => {
    const e = parseErrand('f.errand-gear-shelter-victoria');
    expect(e && errandMove(e)).toEqual({ type: 'CompleteTask', taskId: 'gear-shelter', actor: 'helper' });
  });
});

describe('контент доручень ↔ хвилі й реєстр (GAME-202)', () => {
  const content = [...setFlags(dialogues), ...setFlags(matthew)].filter((f) => f.startsWith(ERRAND_PREFIX));
  it('у розмовах родини є доручення, і кожне веде до справжньої справи хвилі, яку помічнику дозволено закривати', () => {
    expect(content.length).toBeGreaterThanOrEqual(2);   // інакше звірка нижче нічого не доводить
    const tasks = new Map(waves.flatMap((w) => w.tasks.map((t) => [t.id, t] as const)));
    for (const f of content) {
      const e = parseErrand(f);
      expect(e, `${f}: доручення без виконавця з родини`).not.toBeNull();
      const t = tasks.get(e?.task ?? '');
      expect(t, `${f}: такої справи немає в content/waves.json`).toBeDefined();
      expect((t as { leaderOnly?: boolean } | undefined)?.leaderOnly, `${f}: справа лише для лідера — ядро відмовить помічнику (TASK_LEADER_ONLY)`).not.toBe(true);
      expect(flags.some((r) => r.id === f), `${f}: не зареєстровано в content/flags.json`).toBe(true);
    }
  });
  it('у Вікторії й Метью — різні доручення на одній мапі (родина розходиться на ≥ 3 точки: герой + двоє)', () => {
    const members = new Set(content.map((f) => parseErrand(f)?.member));
    expect(members).toEqual(new Set(FAMILY));
  });
});

// GAME-202 (решта картки) · сторож «кожен f.errand-* має справу й точку на мапі»: усі діалоги content/dialogue/*.json (не лише двоє з родини),
// справа — у хвилі, не leaderOnly; об'єкт task.<справа> лежить на мапі ЕТАПУ хвилі (дім → home.tmj, табір → camp-lake.tmj, дорога → road.tmj);
// вибір-доручення стоїть за умовою taskOpen САМЕ цієї справи (інакше «Іду» — а ніхто не йде, бо справи вже нема).
// Мутації (кожна червона, перевірено руками 01.11.2026): прапорець на неіснуючу справу; прибрати task.iron-clothes з home.tmj; замінити taskOpen на quest.
import quests from '../../content/quests.json';
import homeMap from '../../public/maps/home.tmj?raw';
import campMap from '../../public/maps/camp-lake.tmj?raw';
import roadMap from '../../public/maps/road.tmj?raw';
import { mapKeyFor } from './map-first';

type Cond = { all?: Cond[]; any?: Cond[]; taskOpen?: string } & Record<string, unknown>;
type Choice = { when?: Cond; effects?: ({ setFlag: string } | object)[] };
type Dialogue = { id: string; nodes: { choices?: Choice[] }[] };
const ALL_DIALOGUES = Object.values(import.meta.glob<Dialogue>('../../content/dialogue/*.json', { eager: true, import: 'default' }));
const objectsOf = (raw: string): string[] => (JSON.parse(raw) as { layers: { name: string; objects?: { name: string }[] }[] }).layers.find((l) => l.name === 'objects')?.objects?.map((o) => o.name) ?? [];
const MAP_OBJECTS: Record<string, string[]> = { home: objectsOf(homeMap), camp: objectsOf(campMap), road: objectsOf(roadMap) };
const leaves = (c: Cond | undefined, out: Cond[] = []): Cond[] => { if (!c) return out; if (c.all) c.all.forEach((x) => leaves(x, out)); else if (c.any) c.any.forEach((x) => leaves(x, out)); else out.push(c); return out; };

describe('усі доручення контенту ↔ хвилі, мапи, умова taskOpen (GAME-202)', () => {
  const choices = ALL_DIALOGUES.flatMap((d) => d.nodes.flatMap((n) => (n.choices ?? []).map((ch) => [d.id, ch] as const)));
  const errands = choices.flatMap(([id, ch]) => (ch.effects ?? []).flatMap((e) => ('setFlag' in e && e.setFlag.startsWith(ERRAND_PREFIX) ? [[id, ch, e.setFlag] as const] : [])));
  it('доручень ≥ 4 (табір: навіс ×2, вечеря; дім: праска, карта) — інакше звірка нижче нічого не доводить', () => {
    expect(errands.length).toBeGreaterThanOrEqual(5);
    expect(errands.some(([, , f]) => f === 'f.errand-iron-clothes-victoria')).toBe(true);
    expect(errands.some(([, , f]) => f === 'f.errand-map-to-luggage-matthew')).toBe(true);
  });
  it('кожне доручення: справа існує, не leaderOnly, зареєстрована, має task.<справа> на мапі етапу хвилі, а вибір стоїть за taskOpen цієї справи', () => {
    const byTask = new Map(waves.flatMap((w) => w.tasks.map((t) => [t.id, { t, w }] as const)));
    for (const [dlg, ch, f] of errands) {
      const e = parseErrand(f);
      expect(e, `${dlg}: ${f} — доручення без виконавця з родини`).not.toBeNull();
      const hit = byTask.get(e?.task ?? '');
      expect(hit, `${dlg}: ${f} — такої справи немає в content/waves.json`).toBeDefined();
      if (!hit || !e) continue;
      expect((hit.t as { leaderOnly?: boolean }).leaderOnly, `${f}: справа лише для лідера — ядро відмовить помічнику`).not.toBe(true);
      expect(flags.some((r) => r.id === f), `${f}: не зареєстровано в content/flags.json`).toBe(true);
      const stage = quests.find((q) => q.id === hit.w.stage);
      const map = mapKeyFor(stage?.locationId);
      expect(MAP_OBJECTS[map], `${f}: на мапі «${map}» етапу ${hit.w.stage} немає об'єкта ${e.spot} — виконавцеві нікуди йти`).toContain(e.spot);
      expect(leaves(ch.when).some((l) => l.taskOpen === e.task), `${dlg}: вибір «${f}» не стоїть за taskOpen «${e.task}» — доручення пропонувалось би й після того, як справу зроблено`).toBe(true);
    }
  });
});
