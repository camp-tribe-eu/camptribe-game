// GAME-216 · сторож таблиці картки-«серії» (закон 1): живе поза src/ui, бо коди порушень — англійські рядки, а в UI літералів бути не може (сторож i18n).
// Мутації — episode-beats.test.ts.
import { EPISODE_MAX_DELAY_MS, type EpisodeLine, LINE_MAX_CHARS, RECAP_LINES } from '../ui/episode-beats';

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
