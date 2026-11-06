// GAME-243 (S2): нотатник Вікторії і мінімапа. Нотатник — вигляд списку з ядра (стан не зберігає); мінімапа — полотно, що малюється кадром сцени (без таймерів).
import { useEffect, useRef, useState } from 'preact/hooks';
import { t, type AnyLang, type Key } from '../i18n';
import { ct } from '../i18n/content';
import { miniSig, paintMini } from '../platform/minimap-draw';
import type { UiPort } from './port';
import type { OfferAgenda } from './story-types';

export function Notebook({ agenda, lang }: { agenda: OfferAgenda; lang: AnyLang }) {
  const [open, setOpen] = useState(true);
  if (agenda.items.length === 0) return null;
  return (
    <div class="ui-agenda" data-ui="agenda" data-open={open ? 'yes' : 'no'} data-phase={agenda.phase} data-done={agenda.doneCount} data-total={agenda.total}>
      <button type="button" class="ui-agenda-head" data-touch="agenda" aria-expanded={open} aria-label={t(lang, open ? 'agenda.close' : 'agenda.open')} onClick={() => setOpen(!open)}>
        <span aria-hidden="true">{'📓'}</span>
        {open && <span class="ui-agenda-title">{`${t(lang, 'agenda.title')} · ${agenda.doneCount}/${agenda.total}`}</span>}
      </button>
      {open && (
        <ul class="ui-agenda-list">
          {agenda.items.map((i) => (
            <li key={i.id} data-ui="agenda-item" data-item={i.id} data-done={i.done ? 'yes' : 'no'} data-current={i.current ? 'yes' : undefined} data-spot={i.spot ?? undefined}>
              <span class="ui-agenda-mark" aria-hidden="true">{i.done ? '✓' : ''}</span>
              <span class="ui-agenda-text">
                {'ui' in i.label ? t(lang, i.label.ui) : ct(lang, i.label.content)}
                {i.placeKey && <span class="ui-agenda-place">{` — ${t(lang, i.placeKey as Key)}`}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Мапа-радар у куті; дотик відкриває велику мапу з тими самими крапками й легендою. */
export function Radar({ port, lang }: { port: UiPort; lang: AnyLang }) {
  const small = useRef<HTMLCanvasElement>(null);
  const big = useRef<HTMLCanvasElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let last = '';   // GAME-267: щокадру сцена шле знімок, а малюємо лише коли він змінився (стоїмо на місці — 0 перемальовувань)
    const draw = (f: NonNullable<ReturnType<UiPort['minimap']['frame']>>): void => {
      const sig = miniSig(f);
      if (sig === last) return;
      last = sig;
      for (const cv of [small.current, big.current]) {
        if (!cv) continue;
        const n = paintMini(cv, f);
        if (cv.dataset.dots !== String(n)) cv.dataset.dots = String(n);
        if (cv.dataset.map !== f.key) cv.dataset.map = f.key;
        cv.dataset.draws = String(Number(cv.dataset.draws ?? '0') + 1);
        cv.dataset.px = f.px.toFixed(1); cv.dataset.py = f.py.toFixed(1); cv.dataset.dir = f.dir;
      }
    };
    const first = port.minimap.frame();
    if (first) draw(first);
    return port.minimap.subscribe(draw);
  }, [port, open]);
  useEffect(() => {
    if (!open) return undefined;
    const key = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open]);
  return (
    <>
      <button type="button" class="ui-radar" data-ui="minimap" data-touch="minimap" aria-label={t(lang, 'minimap.open')} onClick={() => setOpen(true)}>
        <canvas ref={small} data-ui="minimap-canvas" aria-hidden="true" />
      </button>
      {open && (
        <div class="ui-radar-big" data-ui="minimap-big" role="dialog" aria-label={t(lang, 'minimap.big')} onClick={() => setOpen(false)}>
          <canvas ref={big} data-ui="minimap-big-canvas" aria-hidden="true" />
          <p class="ui-radar-legend" data-ui="minimap-legend"><span class="ui-radar-you" aria-hidden="true">{'▲'}</span>{` ${t(lang, 'minimap.legend.you')}   `}<span class="ui-radar-goal" aria-hidden="true">{'●'}</span>{` ${t(lang, 'minimap.legend.goal')}`}</p>
          <button type="button" class="ui-btn" data-ui="minimap-close" aria-label={t(lang, 'minimap.close')} onClick={() => setOpen(false)}>{t(lang, 'minimap.close')}</button>
        </div>
      )}
    </>
  );
}
