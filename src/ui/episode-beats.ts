// GAME-216 · кінець розділу як «серія»: картка-підсумок у стилі холодного початку (ColdOpen) — три короткі рядки про те, що сталось,
// новий слід дідуся Генрі й рядок-кліфхенгер «Далі в наступній серії…». Чиста таблиця без DOM і годинника: рядки з'являються
// один за одним (CSS-затримки з `delayMs`), картка пропускається одним дотиком і ніколи не блокує збереження (це лише накладка UI;
// сейв уже записано ядром у мить завершення квесту-кінця). Малює src/ui/EpisodeCard.tsx.
import type { Key } from '../i18n';

export type EpisodeKind = 'title' | 'recap' | 'trace' | 'next';

export interface EpisodeLine {
  readonly kind: EpisodeKind;
  readonly text: Key;
  /** Голос рядка: 'narrator' — оповідач, 'henry' — дідусь (курсив, теплий колір, як у холодному початку). */
  readonly voice: 'narrator' | 'henry';
  /** Затримка появи від відкриття картки, мс (лише краса: дотик показує все одразу). */
  readonly delayMs: number;
}

/** Рядків підсумку рівно стільки (картка — коротка, читається з телефона). */
export const RECAP_LINES = 3;
/** Репліка ≤ 110 знаків у кожній мові (game-content). */
export const LINE_MAX_CHARS = 110;
/** Остання поява ≤ 6 с: далі картка просто стоїть і чекає дотику. */
export const EPISODE_MAX_DELAY_MS = 6_000;
const STEP_MS = 900;

/** Факти розділу → рядок підсумку: перший рядок, чий прапорець стоїть; кандидати — за порядком дня. Порожньо без факту не буває: є запасні рядки. */
const RECAP_BY_FLAG: readonly (readonly [flag: string | null, key: Key])[] = [
  ['f.night-tent', 'ep.recap.night-tent'],
  ['f.night-car', 'ep.recap.night-car'],
  ['f.night-gazebo', 'ep.recap.night-gazebo'],
  ['f.fish-released', 'ep.recap.fish-released'],
  ['f.fish-kept', 'ep.recap.fish-kept'],
  ['f.litter-cleaned-ch1', 'ep.recap.litter'],
  ['f.req-nora-shore-done', 'ep.recap.nora'],
  ['f.fire-photo-tent', 'ep.recap.photo'],
  [null, 'ep.recap.tent'],
  [null, 'ep.recap.fire'],
  [null, 'ep.recap.home'],
];

/** Три рядки «що сталось» за прапорцями ядра (лише факти; жодного здогаду з тексту), доповнені запасними до RECAP_LINES. */
export function recapKeys(flags: readonly string[]): Key[] {
  const out: Key[] = [];
  for (const [flag, key] of RECAP_BY_FLAG) {
    if (out.length >= RECAP_LINES) break;
    if (flag === null || flags.includes(flag)) out.push(key);
  }
  return out;
}

/** Таблиця рядків картки для цих прапорців: заголовок, три рядки, слід дідуся, кліфхенгер. */
export function episodeLines(flags: readonly string[]): EpisodeLine[] {
  const recap = recapKeys(flags);
  return [
    { kind: 'title', text: 'ep.title', voice: 'narrator', delayMs: 0 },
    ...recap.map((text, i): EpisodeLine => ({ kind: 'recap', text, voice: 'narrator', delayMs: STEP_MS * (i + 1) })),
    { kind: 'trace', text: 'ep.trace', voice: 'henry', delayMs: STEP_MS * (recap.length + 1) + 400 },
    { kind: 'next', text: 'ep.next', voice: 'narrator', delayMs: STEP_MS * (recap.length + 2) + 800 },
  ];
}

/**
 * Перевірка таблиці (закон 1, мутації — episode-beats.test.ts): рівно RECAP_LINES рядків підсумку, є слід дідуся й кліфхенгер,
 * кліфхенгер — ОСТАННІЙ (вихід картки: після нього нічого не з'являється, лише дотик), затримки зростають і ≤ межі, рядки ≤ 110 знаків.
 */
export function episodeProblems(lines: readonly EpisodeLine[], texts: Readonly<Record<string, readonly string[]>> = {}): string[] {
  const out: string[] = [];
  const recap = lines.filter((l) => l.kind === 'recap').length;
  if (recap !== RECAP_LINES) out.push(`RECAP_COUNT: ${recap} recap lines, expected ${RECAP_LINES}`);
  if (!lines.some((l) => l.kind === 'trace')) out.push('NO_TRACE: no grandpa line');
  if (lines.at(-1)?.kind !== 'next') out.push('NO_EXIT: last line is not the cliffhanger');
  for (let i = 1; i < lines.length; i++) if (!((lines[i]?.delayMs ?? 0) > (lines[i - 1]?.delayMs ?? 0))) out.push(`ORDER ${lines[i]?.text}: delay does not grow`);
  for (const l of lines) {
    if (l.delayMs > EPISODE_MAX_DELAY_MS) out.push(`TOO_LATE ${l.text}: ${l.delayMs} ms > ${EPISODE_MAX_DELAY_MS}`);
    for (const s of texts[l.text] ?? []) if (Array.from(s).length > LINE_MAX_CHARS) out.push(`LINE_TOO_LONG ${l.text}: ${Array.from(s).length} > ${LINE_MAX_CHARS}`);
  }
  return out;
}
