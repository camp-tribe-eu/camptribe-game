// GAME-216 · кінець розділу як «серія» (OD-025: кіно дозовано): коротка картка в стилі холодного початку — три рядки про те, що сталось
// (лише факти ядра), новий слід дідуся Генрі й кліфхенгер «Далі в наступній серії…». Показується раз, у мить завершення розділу (Shell),
// пропускається одним дотиком чи клавішею і нічого не блокує: сейв уже записано ядром, під карткою — звичайна гра. Рядки з'являються
// один за одним CSS-затримкою (таблиця src/view/episode-beats.ts), «менше руху» чи дотик — усе одразу. Таймерів реального часу немає.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Key } from '../i18n';
import { calmMotion } from '../platform/motion';
import { type EpisodeLine, episodeLines } from './episode-beats';

export function EpisodeCard({ flags, chapter = 1, t, onDone }: { flags: readonly string[]; chapter?: 1 | 2; t: (k: Key) => string; onDone: () => void }) {
  const lines = useRef<EpisodeLine[]>(episodeLines(flags, chapter));
  const [all, setAll] = useState(() => calmMotion());
  const ended = useRef(false);
  const finish = (): void => { if (ended.current) return; ended.current = true; onDone(); };
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => { btn.current?.focus({ preventScroll: true }); }, []);
  // Перший дотик — показати все; другий (або кнопка, або клавіша) — закрити. Клавіші: будь-яка, крім Tab і модифікаторів (як у ColdOpen).
  // Саме click, а не pointerdown: картка зникає на другому дотику, і «примарний» click того ж дотику інакше влучав би в те, що під нею (підсумок дня, world.spec на телефоні).
  const tap = (): void => { if (all) finish(); else setAll(true); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.code === 'Tab' || e.ctrlKey || e.metaKey || e.altKey || /^(Shift|Control|Alt|Meta)$/.test(e.key)) return;
      e.preventDefault(); e.stopPropagation(); tap();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [all]);
  return (
    <div class="ui-intro ui-cold ui-episode" data-ui="episode" data-state={all ? 'all' : 'typing'} role="dialog" aria-modal="true" aria-label={t(chapter === 2 ? 'ep2.title' : 'ep.title')} onClick={tap}>
      <div class="ui-episode-body">
        {lines.current.map((l) => (
          <p key={l.text} class="ui-episode-line" data-kind={l.kind} data-voice={l.voice} data-ui="episode-line" style={all ? undefined : { '--ep-delay': l.delayMs }}>
            {t(l.text)}
          </p>
        ))}
      </div>
      <button type="button" class="ui-btn ui-intro-skip" data-ui="episode-skip" ref={btn} onClick={(e) => { e.stopPropagation(); finish(); }}>{t('ep.continue')}</button>
    </div>
  );
}
