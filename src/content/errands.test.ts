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
