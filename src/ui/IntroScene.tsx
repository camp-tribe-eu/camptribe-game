// GAME-303 · подача вступу «гібрид» (рішення власника): розмова родини «з різних кімнат» — КОМІКС (екран розрізано на 2–3 панелі, кожна — своя кімната зі своєю людиною;
// репліка належить панелі й лишається в ній, панелі з'являються по одній від дотику); ніч, сон про дорогу й ранок — ПОВНИЙ КАДР (кіно: родина спить, розчинення в сон, будильник).
// Крок, дотики, «Пропустити вступ», біти квестів і звук лишаються в Intro.tsx. Таймерів немає: вигляд змінюється лише дотиком, рух кіно — CSS-анімація (при «менше руху» вимкнена).
import { useEffect, useRef, useState } from 'preact/hooks';
import { ct } from '../i18n/content';
import type { AnyLang, Key } from '../i18n';
import { ROOM_WHO, type SceneView, type ShotSpec } from '../content/intro-scene';
import type { IntroShotPainter } from './port';

function useViewport(): string {
  const [vp, setVp] = useState(() => `${window.innerWidth}x${window.innerHeight}`);
  useEffect(() => {
    const on = (): void => setVp(`${window.innerWidth}x${window.innerHeight}`);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return vp;
}

const idOf = (spec: ShotSpec): string => (spec.kind === 'dream' ? 'dream' : `${spec.room}-${spec.pose}-${spec.phase}`);

/** Полотно кадру: малюється за фактичним розміром елемента (CSS), перемальовується при зміні орієнтації. `data-painted` — для e2e: кадр готовий. */
function Shot({ spec, paint }: { spec: ShotSpec; paint: IntroShotPainter | undefined }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const vp = useViewport();
  const id = idOf(spec);
  useEffect(() => {
    const el = ref.current;
    if (!el || !paint) return undefined;
    let dead = false;
    el.removeAttribute('data-painted');
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return undefined;
    paint(el, r.width, r.height, spec).then(() => { if (!dead) el.setAttribute('data-painted', 'yes'); }, () => undefined);
    return () => { dead = true; };
  }, [vp, id]);
  return <canvas ref={ref} class="ui-scene-canvas" data-ui="scene-canvas" data-shot={id} aria-hidden="true" />;
}

const whoOf = (s: ShotSpec): string | null => (s.kind === 'room' ? ROOM_WHO[s.room] : null);

function Bubble({ who, text, now, lang }: { who: string; text: string; now: boolean; lang: AnyLang }) {
  return (
    <div class="ui-bubble" data-now={now ? 'yes' : 'no'} data-npc={who}>
      <h3 class="ui-bubble-name" data-ui={now ? 'speaker' : 'speaker-past'} data-npc={who}>{ct(lang, who)}</h3>
      <p class="ui-bubble-line" data-ui={now ? 'line' : 'line-past'}>{text}</p>
    </div>
  );
}

export function IntroScene({ view, paint, lang, t, onNext }: { view: SceneView; paint: IntroShotPainter | undefined; lang: AnyLang; t: (k: Key) => string; onNext: (e: Event) => void }) {
  const next = <button type="button" class="ui-btn ui-scene-next" data-ui="intro-next" onClick={onNext}>{t('ui.continue')}</button>;
  const caption = view.caption ? t(view.caption) : null;
  const sfx = view.sfx ? t(view.sfx) : null;

  if (view.mode === 'comic') {
    // Ключ сторінки — склад панелей: панелі однієї сторінки не перемонтовуються (з'являється лише нова), нова сторінка починається з нуля.
    const pageId = view.slots.map(idOf).join('|');
    const cur = view.speaker;
    return (
      <div class="ui-scene ui-comic-wrap" data-ui="intro-scene" data-style="comic" data-phase={view.phase} data-shown={view.shown}>
        <div class="ui-comic" data-ui="comic-page" data-panels={view.slots.length} key={pageId}>
          {view.slots.map((s, k) => {
            const shown = k < view.shown;
            const key = view.lines[k];
            const line = key ? t(key) : null;
            const who = whoOf(s);
            return (
              <section key={`${pageId}#${k}`} class="ui-panel" data-ui="comic-panel" data-panel={k} data-state={shown ? 'shown' : 'pending'} data-room={s.kind === 'room' ? s.room : 'dream'} data-pose={s.kind === 'room' ? s.pose : 'dream'} aria-hidden={shown ? undefined : 'true'}>
                <Shot spec={s} paint={paint} />
                {shown && line && who && <Bubble who={who} text={line} now={k === cur} lang={lang} />}
              </section>
            );
          })}
        </div>
        {next}
      </div>
    );
  }

  // Кіно: шоти слотів лежать шарами один на одному й по черзі проявляються (CSS-затримка), останнім — сон; «менше руху» — шари статичні, зверху останній.
  const layers: readonly ShotSpec[] = view.dream ? view.slots : [view.slots[view.focus] as ShotSpec];
  const sleepers = view.slots.some((s) => s.kind === 'room' && s.pose === 'sleep');
  return (
    <div class="ui-scene ui-cine" data-ui="intro-scene" data-style="cinema" data-phase={view.phase} data-dream={view.dream ? 'yes' : 'no'}>
      <div class="ui-cine-shot" data-ui="cine-shot" data-layers={layers.length + (view.dream ? 1 : 0)}>
        {layers.map((s, k) => (
          <div key={idOf(s)} class="ui-cine-layer" data-ui="cine-layer" data-layer={k} data-room={s.kind === 'room' ? s.room : 'dream'} data-pose={s.kind === 'room' ? s.pose : 'dream'} style={{ '--n': String(k) }}>
            <Shot spec={s} paint={paint} />
          </div>
        ))}
        {view.dream && (
          <div class="ui-cine-layer ui-cine-dream" data-ui="cine-layer" data-layer={layers.length} data-room="dream" data-pose="dream" style={{ '--n': String(layers.length) }}>
            <Shot spec={{ kind: 'dream' }} paint={paint} />
          </div>
        )}
        {sfx && sleepers && <p class="ui-cine-zzz" aria-hidden="true">{sfx}</p>}
      </div>
      <div class="ui-cine-title">
        {caption && <p class="ui-cine-cap" data-ui="intro-caption">{caption}</p>}
        {view.dream && <p class="ui-cine-dreamcap" data-ui="intro-dream-caption" style={{ '--n': String(layers.length) }}>{t('intro.dream')}</p>}
        {sfx && view.phase === 'morning' && <p class="ui-cine-alarm" data-ui="intro-alarm">{sfx}</p>}
        {next}
      </div>
    </div>
  );
}
