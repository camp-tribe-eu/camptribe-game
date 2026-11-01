// GAME-216 · картка-«серія» кінця розділу: таблиця рядків із виходом; рядки підсумку — лише з фактів ядра; тексти ≤ 110 знаків у uk і en.
// Закон 1: кожна перевірка має мутацію, на якій вона червоніє (нижче — зламані таблиці).
import { describe, expect, it } from 'vitest';
import en from '../i18n/en.json';
import uk from '../i18n/uk.json';
import flags from '../../content/flags.json';
import { EPISODE_MAX_DELAY_MS, type EpisodeLine, LINE_MAX_CHARS, RECAP_LINES, episodeLines, episodeStep, recapKeys } from '../ui/episode-beats';
import { episodeProblems } from './episode-check';

const texts = (lines: readonly EpisodeLine[]): Record<string, string[]> =>
  Object.fromEntries(lines.map((l) => [l.text, [(uk as Record<string, string>)[l.text] ?? '', (en as Record<string, string>)[l.text] ?? '']]));

describe('картка-«серія» — таблиця рядків (GAME-216)', () => {
  it('без жодного факту: заголовок, три запасні рядки, слід дідуся, кліфхенгер останній; тексти є в обох мовах і ≤ 110 знаків', () => {
    const lines = episodeLines([]);
    expect(lines.map((l) => l.kind)).toEqual(['title', 'recap', 'recap', 'recap', 'trace', 'next']);
    for (const [k, [u, e]] of Object.entries(texts(lines))) { expect(u, k).not.toBe(''); expect(e, k).not.toBe(''); expect(Array.from(u ?? '').length).toBeLessThanOrEqual(LINE_MAX_CHARS); expect(Array.from(e ?? '').length).toBeLessThanOrEqual(LINE_MAX_CHARS); }
    expect(episodeProblems(lines, texts(lines))).toEqual([]);
    expect(lines.at(-1)?.delayMs).toBeLessThanOrEqual(EPISODE_MAX_DELAY_MS);
  });
  it('факти ядра обирають рядки: ніч у наметі й відпущена рибка — спершу вони; кожен прапорець таблиці зареєстровано в content/flags.json', () => {
    expect(recapKeys(['f.night-tent', 'f.fish-released'])).toEqual(['ep.recap.night-tent', 'ep.recap.fish-released', 'ep.recap.litter'].slice(0, 2).concat('ep.recap.tent'));
    expect(recapKeys(['f.fish-kept'])).toContain('ep.recap.fish-kept');
    expect(recapKeys(['f.fish-kept'])).not.toContain('ep.recap.fish-released');
    expect(recapKeys(['f.night-car', 'f.litter-cleaned-ch1', 'f.req-nora-shore-done', 'f.fire-photo-tent'])).toHaveLength(RECAP_LINES);
    // Прапорці, які читає таблиця, — лише зареєстровані (enum f.night → значення night-tent/car/gazebo).
    const ids = new Set(flags.flatMap((f) => ('values' in f && Array.isArray(f.values) ? f.values.map((v) => `${f.id}-${v}`) : [f.id])));
    for (const f of ['f.night-tent', 'f.night-car', 'f.night-gazebo', 'f.fish-released', 'f.fish-kept', 'f.litter-cleaned-ch1', 'f.req-nora-shore-done', 'f.fire-photo-tent']) expect(ids.has(f), f).toBe(true);
    // Усі тексти, які може дати будь-який набір фактів, є в обох мовах.
    const all = episodeLines(['f.night-tent', 'f.fish-released', 'f.litter-cleaned-ch1']).concat(episodeLines(['f.night-car', 'f.fish-kept', 'f.req-nora-shore-done']), episodeLines(['f.night-gazebo', 'f.fire-photo-tent']));
    for (const [k, [u, e]] of Object.entries(texts(all))) { expect(u, k).not.toBe(''); expect(e, k).not.toBe(''); }
  });
  it('мутації: без кліфхенгера в кінці — NO_EXIT; два рядки підсумку — RECAP_COUNT; без сліду дідуся — NO_TRACE; затримка не росте — ORDER; надто пізно — TOO_LATE; довгий рядок — LINE_TOO_LONG', () => {
    const ok = episodeLines([]);
    expect(episodeProblems(ok.slice(0, -1))).toContain('NO_EXIT: last line is not the cliffhanger');
    expect(episodeProblems(ok.filter((l, i) => !(l.kind === 'recap' && i === 1)))).toContain(`RECAP_COUNT: 2 recap lines, expected ${RECAP_LINES}`);
    expect(episodeProblems(ok.filter((l) => l.kind !== 'trace'))).toContain('NO_TRACE: no grandpa line');
    expect(episodeProblems(ok.map((l, i) => (i === 2 ? { ...l, delayMs: 0 } : l))).some((p) => p.startsWith('ORDER'))).toBe(true);
    expect(episodeProblems(ok.map((l) => (l.kind === 'next' ? { ...l, delayMs: EPISODE_MAX_DELAY_MS + 1 } : l))).some((p) => p.startsWith('TOO_LATE'))).toBe(true);
    expect(episodeProblems(ok, { 'ep.next': ['x'.repeat(LINE_MAX_CHARS + 1)] }).some((p) => p.startsWith('LINE_TOO_LONG ep.next'))).toBe(true);
  });
});

describe('коли показувати картку (рецензія PR #145): лише перехід play → ended після читання сейву', () => {
  it('завантаження вже завершеного сейву: create (до читання) → ended (після) — картки НЕМА; мутація «сіяти стан при монтуванні» — червона', () => {
    let prev: boolean | null = null;
    const a = episodeStep(prev, false, false); prev = a.next;   // монтування: сейв ще не прочитано, stage create
    expect(a.show).toBe(false);
    const b = episodeStep(prev, true, true); prev = b.next;     // saves.start завершився: stage одразу ended
    expect(b.show).toBe(false);
    expect(episodeStep(prev, true, true).show).toBe(false);     // далі теж тихо
  });
  it('справжній кінець розділу: після читання play → ended — картка рівно раз', () => {
    let prev: boolean | null = null;
    prev = episodeStep(prev, true, false).next;                  // сейв прочитано, гра триває
    const end = episodeStep(prev, true, true); prev = end.next;
    expect(end.show).toBe(true);
    expect(episodeStep(prev, true, true).show).toBe(false);     // повторні знімки — без картки
  });
  it('до читання сейву стан не запам’ятовується (next null), навіть якщо він «ended»', () => {
    expect(episodeStep(null, false, true)).toEqual({ show: false, next: null });
    expect(episodeStep(true, false, false)).toEqual({ show: false, next: null });
  });
});

