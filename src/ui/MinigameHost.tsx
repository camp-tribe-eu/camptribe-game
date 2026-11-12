// GAME-308 · спільна оболонка міні-ігор: вступ → гра → результат → закрити; пауза завжди під пальцем; смуга часу; допомога без докору. Поверхню самої гри малює компонент `Surface`,
// який передає сцена/реєстр: оболонка про правила гри не знає. Лише дотик (кнопки ≥ 48 px), обидві орієнтації (CSS .mg у index.html), жодних таймерів: кадри рахує сесія.
import { useEffect, useState } from 'preact/hooks';
import type { ComponentType } from 'preact';
import { playMinigameResult } from '../audio/minigame-sounds';
import type { Key } from '../i18n';
import type { MinigamePoint, MinigameSessionPort, MinigameView } from './minigame-types';

export interface SurfaceProps {
  readonly view: MinigameView;
  readonly t: (key: Key) => string;
  readonly tap: (p: MinigamePoint) => void;
  readonly drag: (p: MinigamePoint | null) => void;
}

export function MinigameHost({ session, t, Surface }: { session: MinigameSessionPort; t: (key: Key) => string; Surface: ComponentType<SurfaceProps> }) {
  const [view, setView] = useState<MinigameView>(() => session.view());
  useEffect(() => { setView(session.view()); return session.subscribe(() => setView(session.view())); }, [session]);
  // Звук результату — раз, коли гра дійшла до результату (через src/audio).
  const outcome = view.phase === 'result' ? view.outcome : null;
  useEffect(() => { if (outcome) playMinigameResult(outcome); }, [outcome]);

  if (view.phase === 'closed') return null;
  const k = (key: string): string => t(key as Key);
  return (
    <section class="mg" data-ui="minigame" data-phase={view.phase} data-paused={view.paused ? 'yes' : 'no'} data-helped={view.helped ? 'yes' : 'no'} data-outcome={view.outcome ?? ''} role="dialog" aria-modal="true" aria-label={k(view.titleKey)}>
      <header class="mg-bar">
        <h2 class="mg-title">{k(view.titleKey)}</h2>
        <div class="mg-time" role="progressbar" aria-label={t('mg.timeLeft')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((1 - view.progress) * 100)}><i style={{ width: `${(1 - view.progress) * 100}%` }} /></div>
        {!view.paused && <button type="button" class="ui-btn mg-btn mg-pause" data-ui="mg-pause" onClick={() => session.pause()}>{t('mg.pause')}</button>}
      </header>
      {view.helped && view.phase !== 'result' && <p class="mg-help" role="status" data-ui="mg-help">{t('mg.help')}</p>}
      <div class="mg-stage">
        {view.phase === 'open' && (
          <>
            <p class="mg-text" data-ui="mg-intro">{k(view.introKey)}</p>
            {view.helped && <p class="mg-text mg-hint" data-ui="mg-hint">{k(view.hintKey)}</p>}
            <button type="button" class="ui-btn mg-btn" data-ui="mg-start" onClick={() => session.start()}>{t('mg.start')}</button>
          </>
        )}
        {view.phase === 'play' && <Surface view={view} t={t} tap={(p) => session.tap(p)} drag={(p) => session.drag(p)} />}
        {view.phase === 'result' && (
          <>
            <p class="mg-text mg-result" data-ui="mg-result" data-outcome={view.outcome ?? ''}>{view.resultKey ? k(view.resultKey) : ''}</p>
            <button type="button" class="ui-btn mg-btn" data-ui="mg-close" onClick={() => session.close()}>{t('mg.close')}</button>
          </>
        )}
      </div>
      {view.paused && (
        <div class="mg-paused" data-ui="mg-paused" role="group" aria-label={t('mg.paused')}>
          <p class="mg-text">{t('mg.paused')}</p>
          <button type="button" class="ui-btn mg-btn" data-ui="mg-resume" onClick={() => session.resume()}>{t('mg.resume')}</button>
          {view.phase !== 'result' && <button type="button" class="ui-btn mg-btn" data-ui="mg-move-on" onClick={() => session.moveOn()}>{t('mg.moveOn')}</button>}
        </div>
      )}
    </section>
  );
}
