// GAME-216 · холодний початок демо (OD-025): перед вступом — ≤ 45 с кіно (src/view/cold-open.ts): дощ у вікні, родина вдома, атлас, листівка дідуся Генрі з
// ескізом «H+E», затемнення → вступ (Intro). Показується раз на нову гру (Shell: при завантаженні — лише коли сейву не було; з меню «Нова гра» — завжди),
// пропускається будь-якої миті — ЛИШЕ явною кнопкою «Пропустити вступ» або Escape (GAME-302: раніше пропускав будь-який дотик по сцені чи клавіша — гравець, що не хотів
// пропускати, випадково обривав кіно першим же дотиком, і історія дідуся не доходила до листівки). Починається з дотику «Почати»: він же розблоковує звук (політика браузерів) — без нього
// музика вступу (mus-intro) не зазвучала б. Світ на паузі (Shell), таймерів реального часу немає: час сцени — від міток кадру всередині painter.
import { useEffect, useRef, useState } from 'preact/hooks';
import { setIntroOpen } from '../audio';
import type { Key } from '../i18n';
import { calmMotion } from '../platform/motion';
import type { ColdOpenPainter } from './port';

export function ColdOpen({ paint, t, onDone }: { paint?: ColdOpenPainter | undefined; t: (k: Key) => string; onDone: () => void }) {
  const [playing, setPlaying] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const caption = useRef<HTMLParagraphElement>(null);
  const startBtn = useRef<HTMLButtonElement>(null);
  const clock = useRef({ elapsed: 0 });
  const [size, setSize] = useState(() => `${window.innerWidth}x${window.innerHeight}`);
  useEffect(() => { setIntroOpen(true); return () => setIntroOpen(false); }, []);   // музика вступу й дощ за вікном — як у Intro
  useEffect(() => { startBtn.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    const on = (): void => setSize(`${window.innerWidth}x${window.innerHeight}`);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  // Пропуск — один і той самий вихід, що й кінець сцени. Викликається лише раз (сцена могла скінчитися в той самий кадр, що й дотик).
  const ended = useRef(false);
  const finish = (): void => { if (ended.current) return; ended.current = true; onDone(); };
  const finishRef = useRef(finish);
  finishRef.current = finish;
  useEffect(() => {
    const el = canvas.current;
    const cap = caption.current;
    if (!playing || !el || !cap) return undefined;
    if (!paint) { finishRef.current(); return undefined; }   // без painter (тести без полотна) — сцени немає, одразу вступ
    let dead = false;
    let stop: () => void = () => undefined;
    const [w, h] = size.split('x').map(Number) as [number, number];
    paint(el, cap, w, h, calmMotion(), () => dead, { line: (k) => t(k as Key) }, clock.current, () => { if (!dead) finishRef.current(); })
      .then((s) => { if (dead) s(); else stop = s; }, () => { if (!dead) finishRef.current(); });
    return () => { dead = true; stop(); };
  }, [playing, size]);
  // GAME-302: пропуск клавішею — лише Escape (без модифікаторів: Ctrl+Escape і подібні браузерні комбінації не ковтаються). Enter, Space, стрілки сцену не обривають.
  useEffect(() => {
    if (!playing) return undefined;
    const onKey = (e: KeyboardEvent): void => { if (e.code !== 'Escape' || e.ctrlKey || e.metaKey || e.altKey) return; e.preventDefault();
      e.stopPropagation(); finishRef.current(); };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [playing]);

  return (
    <div class="ui-intro ui-cold" data-ui="cold-open" data-state={playing ? 'play' : 'start'} role="dialog" aria-modal="true" aria-label={t('cold.title')}>
      {playing && <canvas ref={canvas} class="ui-intro-room" data-ui="cold-canvas" aria-hidden="true" />}
      {playing && <p ref={caption} class="ui-cold-caption" data-ui="cold-caption" aria-live="off" />}
      {playing && <button type="button" class="ui-btn ui-intro-skip" data-ui="cold-open-skip" onClick={() => finishRef.current()}>{t('intro.skip')}</button>}
      {!playing && (
        <div class="ui-cold-start">
          <h1 class="ui-cold-title">{t('cold.title')}</h1>
          <p class="ui-cold-sub">{t('cold.sub')}</p>
          <button type="button" class="ui-btn" ref={startBtn} data-ui="cold-open-start" onClick={() => setPlaying(true)}>{t('cold.start')}</button>
          <button type="button" class="ui-btn ui-cold-skip-start" data-ui="cold-open-skip" onClick={() => finishRef.current()}>{t('intro.skip')}</button>
        </div>
      )}
    </div>
  );
}
