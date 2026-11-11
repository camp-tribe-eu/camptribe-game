// GAME-303 · проба подачі вступу. Те саме місце сюжету — родина кличе одне одного з різних кімнат, ніч, ранок — у двох виглядах:
//  А «комікс»: екран розрізано на 2–3 панелі, кожна — своя кімната зі своєю людиною; репліка належить панелі й залишається в ній, панелі з'являються по одній від дотику;
//  Б «кінокадри»: один кадр на весь екран (кімната + людина), рамка розмови внизу — та сама, що в грі; між кадрами м'який вихід із темряви й повільний наїзд; сон про дорогу.
// Показує IntroScene лише за перемикачем (?introStyle=, збірка e2e); крок, дотики, «Пропустити вступ», біти квестів і звук лишаються в Intro.tsx без змін.
// Таймерів немає: «вигляд» змінюється лише дотиком, рух — CSS-анімація (при «менше руху» вимкнена).
import { useEffect, useRef, useState } from 'preact/hooks';
import { ct } from '../i18n/content';
import type { AnyLang, Key } from '../i18n';
import { ROOM_WHO, type IntroStyle, type SceneView, type ShotSpec } from '../content/intro-scene';
import { Portrait, type PortraitLookup } from './Portrait';
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

/** Полотно кадру: малюється за фактичним розміром елемента (CSS), перемальовується при зміні орієнтації. `data-painted` — для e2e: кадр готовий. */
function Shot({ spec, paint }: { spec: ShotSpec; paint: IntroShotPainter | undefined }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const vp = useViewport();
  const id = spec.kind === 'dream' ? 'dream' : `${spec.room}-${spec.pose}-${spec.phase}`;
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

export function IntroScene({ style, views, paint, lang, t, portrait, onNext }: { style: Exclude<IntroStyle, 'classic'>; views: readonly SceneView[]; paint: IntroShotPainter | undefined; lang: AnyLang; t: (k: Key) => string; portrait: PortraitLookup; onNext: (e: Event) => void }) {
  const [subRaw, setSub] = useState(0);
  // Інший крок вступу (інші `views`) — починаємо з першого вигляду; компонент при цьому не перемонтовується, тож панелі однієї сторінки не з'являються заново.
  const seenViews = useRef(views);
  const fresh = seenViews.current !== views;
  if (fresh) { seenViews.current = views; if (subRaw !== 0) setSub(0); }
  const sub = fresh ? 0 : subRaw;
  const view = views[Math.min(sub, views.length - 1)] as SceneView;
  const pageId = view.slots.map((s) => (s.kind === 'dream' ? 'dream' : `${s.room}.${s.pose}.${s.phase}`)).join('|');
  // Кілька видів на один крок (ніч: сплять → сниться): перший дотик гортає вигляд, останній — сам крок. Пауза між дотиками — за event.timeStamp, як у Intro.
  const last = useRef(Number.NEGATIVE_INFINITY);
  const advance = (e: Event): void => {
    if (sub < views.length - 1) {
      if (e.timeStamp - last.current < 250) return;
      last.current = e.timeStamp;
      setSub(sub + 1);
    } else onNext(e);
  };
  const next = <button type="button" class="ui-btn ui-scene-next" data-ui="intro-next" onClick={advance}>{t('ui.continue')}</button>;
  const lineOf = (k: number): string | null => { const key = view.lines[k]; return key ? t(key) : null; };
  const caption = view.caption ? t(view.caption) : null;
  const sfx = view.sfx ? t(view.sfx) : null;
  const cur = view.speaker;
  const curSpec = view.slots[cur ?? view.focus] as ShotSpec;
  const curWho = cur !== null ? whoOf(curSpec) : null;

  if (style === 'comic') {
    return (
      <div class="ui-scene ui-comic-wrap" data-ui="intro-scene" data-style="comic" data-phase={view.phase} data-view={sub} data-shown={view.shown}>
        <div class="ui-comic" data-ui="comic-page" data-panels={view.slots.length} key={pageId}>
          {view.slots.map((s, k) => {
            const shown = k < view.shown;
            const line = lineOf(k);
            const who = whoOf(s);
            return (
              <section key={`${pageId}#${k}`} class="ui-panel" data-ui="comic-panel" data-panel={k} data-state={shown ? 'shown' : 'pending'} data-room={s.kind === 'room' ? s.room : 'dream'} data-pose={s.kind === 'room' ? s.pose : 'dream'} aria-hidden={shown ? undefined : 'true'}>
                <Shot spec={s} paint={paint} />
                {shown && line && who && <Bubble who={who} text={line} now={k === cur} lang={lang} />}
                {shown && !line && sfx && view.phase === 'night' && <p class="ui-panel-zzz" aria-hidden="true">{sfx}</p>}
                {k === 0 && shown && caption && <p class="ui-panel-cap" data-ui="intro-caption">{caption}</p>}
                {k === 1 && shown && sfx && view.phase === 'morning' && <p class="ui-panel-alarm" data-ui="intro-alarm">{sfx}</p>}
              </section>
            );
          })}
        </div>
        {next}
      </div>
    );
  }

  // Б: один кадр. Ключ кадру міняється з вигляду/кроку — CSS-анімація входу (з темряви + наїзд) стартує на кожному новому кадрі.
  const talk = cur !== null && curWho !== null && lineOf(cur) !== null;
  return (
    <div class="ui-scene ui-cine" data-ui="intro-scene" data-style="cinema" data-phase={view.phase} data-view={sub} data-kind={talk ? 'line' : 'narration'}>
      <div class="ui-cine-shot" data-ui="cine-shot" data-kind={curSpec.kind} data-room={curSpec.kind === 'room' ? curSpec.room : 'dream'} data-pose={curSpec.kind === 'room' ? curSpec.pose : 'dream'} key={`${sub}-${cur ?? 'n'}`}>
        <Shot spec={curSpec} paint={paint} />
        {curSpec.kind === 'dream' && <p class="ui-cine-zzz" aria-hidden="true">{t('intro.zzz')}</p>}
        {curSpec.kind === 'room' && curSpec.pose === 'sleep' && sfx && <p class="ui-cine-zzz" aria-hidden="true">{sfx}</p>}
      </div>
      {talk ? (
        <div class="ui-talk">
          <div class="ui-talk-box" data-ui="dialogue" data-typing="no">
            <div class="ui-talk-portrait"><Portrait id={curWho} lookup={portrait} size="lg" /></div>
            <h3 class="ui-talk-name" data-ui="speaker" data-npc={curWho}>{ct(lang, curWho as string)}</h3>
            <div class="ui-talk-main">
              <p class="ui-talk-line" data-ui="line">{lineOf(cur as number)}</p>
              <div class="ui-answers ui-talk-answers" data-ui="answers">{next}</div>
            </div>
          </div>
        </div>
      ) : (
        <div class="ui-cine-title">
          {caption && <p class="ui-cine-cap" data-ui="intro-caption">{caption}</p>}
          {sfx && view.phase === 'morning' && <p class="ui-cine-alarm" data-ui="intro-alarm">{sfx}</p>}
          {next}
        </div>
      )}
    </div>
  );
}
