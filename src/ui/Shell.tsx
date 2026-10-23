// Оболонка UI над канвою (GAME-25): пауза й налаштування. Preact, DOM — для кирилиці, масштабу тексту
// й екранного читача (TD-003).
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { DEFAULT_SETTINGS, TEXT_SCALES, loadSettings, saveSettings, type Settings } from '../platform/settings';
import type { Credits, UiPort } from './port';
import { t as tr, type AnyLang, type Key } from '../i18n';
import { StoryPanel } from './StoryPanel';
import type { StoryOffer } from './story-types';

export function Shell({ port, langOverride, credits }: { port: UiPort; langOverride?: AnyLang; credits: Credits }) {
  const [paused, setPaused] = useState(false);
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const resumeRef = useRef<HTMLButtonElement>(null);
  const [status, setStatus] = useState<Key | null>(null);
  const [codeOut, setCodeOut] = useState('');
  const [codeIn, setCodeIn] = useState('');
  const [staleCode, setStaleCode] = useState<string | null>(null);
  // Екран подорожі (GAME-32): поки відкритий, світ на паузі — як і в меню паузи.
  const [storyOpen, setStoryOpen] = useState(false);
  const [offer, setOffer] = useState<StoryOffer>(() => port.story());
  useEffect(() => port.onStory(() => setOffer(port.story())), []);
  const lang: AnyLang = langOverride ?? settings.language;
  const t = (key: Key): string => tr(lang, key);

  const toggle = (next: boolean): void => {
    setPaused(next);
    port.setPaused(next);
  };
  const story = (open: boolean): void => {
    setStoryOpen(open);
    // Фокус повертається грі (#stage з підписом), а не на ☰: Space — клавіша дії в сцені, і сфокусована ☰
    // перехоплювала б її (знайдено e2e розмови з Елізою на мапі). ☰ лишається досяжною Tab.
    if (!open) requestAnimationFrame(() => document.getElementById('stage')?.focus());
    if (open) { setOffer(port.story()); void port.staleCode().then(setStaleCode); }
    port.setPaused(open);
  };

  // Розмова з NPC на мапі відкриває екран подорожі (якщо не відкрите меню паузи).
  useEffect(() => port.onOpenStory(() => { if (!paused && !storyOpen) story(true); }), [paused, storyOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.code !== 'Escape') return;
      e.preventDefault();
      if (storyOpen) story(false); else toggle(!paused);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paused, storyOpen]);

  // Фокус — у діалог, щоб клавіатура й екранний читач починали з «Продовжити».
  useEffect(() => {
    if (paused) resumeRef.current?.focus();
    // Відкладений застарілий сейв — питаємо при кожному відкритті меню (старт міг завершитись пізніше).
    if (paused) void port.staleCode().then(setStaleCode);
  }, [paused]);

  // Зберігаємо одразу в обробнику, а не в ефекті: ефект Preact відкладено до після малювання, і зміна
  // мови перед закриттям вкладки (чи reload у e2e на CI) губилась — сторінка встигала піти раніше.
  const update = (next: Settings): void => {
    setSettings(next);
    saveSettings(next);
  };

  // До малювання (useLayoutEffect): екранний читач не застає кнопки без підпису (рецензія).
  useLayoutEffect(() => {
    document.documentElement.style.fontSize = `${settings.textScale}%`;
    document.documentElement.lang = settings.language;
    document.getElementById('stage')?.setAttribute('aria-label', t('ui.stage'));
    // Дотикові кнопки сцени (src/view/world/touch.ts) — підписи мовою гравця, а не id дії англійською.
    const TOUCH: Readonly<Record<string, Key>> = { up: 'touch.up', down: 'touch.down', left: 'touch.left', right: 'touch.right', interact: 'touch.interact' };
    for (const b of document.querySelectorAll<HTMLElement>('.touch [data-touch]')) {
      const k = TOUCH[b.dataset.touch ?? ''];
      if (k) b.setAttribute('aria-label', t(k));
    }
  }, [settings]);

  // Відкладений сейв: і в меню паузи, і на екрані подорожі (туди гравець іде першим), доки не сховає.
  const staleNotice = staleCode && (
    <p class="ui-status" data-ui="stale" role="status">
      {t('ui.staleSave')}
      <textarea class="ui-code" data-ui="stale-code" readOnly rows={3} aria-label={t('ui.staleSave')} value={staleCode}
        onFocus={(e) => (e.currentTarget as HTMLTextAreaElement).select()} />
      <button type="button" class="ui-btn" data-ui="stale-dismiss"
        onClick={() => { void port.dismissStale().then((ok) => { if (ok) setStaleCode(null); else setStatus('ui.saveFailed'); }); }}>{t('ui.staleDismiss')}</button>
    </p>
  );

  return (
    <>
      {!paused && !storyOpen && <button type="button" class="ui-pause-btn" data-touch="pause" aria-label={t('ui.pause')} onClick={() => toggle(true)}>{'‖'}</button>}
      {!paused && !storyOpen && <button type="button" class="ui-story-btn" data-touch="story" aria-label={t('ui.story')} onClick={() => story(true)}>{'☰'}</button>}
      {storyOpen && <StoryPanel offer={offer} lang={lang} t={t} act={(id) => port.act(id)} close={() => story(false)}>{staleNotice}</StoryPanel>}
      {paused && (
        <div class="ui-overlay" role="dialog" aria-modal="true" aria-label={t('ui.paused')} data-ui="pause">
          <h2>{t('ui.paused')}</h2>
          <button type="button" class="ui-btn" data-ui="resume" ref={resumeRef} onClick={() => toggle(false)}>{t('ui.resume')}</button>
          <fieldset>
            <legend>{t('ui.textSize')}</legend>
            {TEXT_SCALES.map((v) => (
              <button type="button" class="ui-btn" data-ui={`text-${v}`} aria-pressed={settings.textScale === v}
                onClick={() => update({ ...settings, textScale: v })}>{v}%</button>
            ))}
          </fieldset>
          <fieldset>
            <legend>{t('ui.language')}</legend>
            {(['uk', 'en'] as const).map((l) => (
              <button type="button" class="ui-btn" data-ui={`lang-${l}`} aria-pressed={settings.language === l}
                onClick={() => update({ ...settings, language: l })}>{l.toUpperCase()}</button>
            ))}
          </fieldset>
          {staleNotice}
          <fieldset>
            <legend>{t('ui.save')}</legend>
            <button type="button" class="ui-btn" data-ui="save"
              onClick={() => { void port.save().then((ok) => setStatus(ok ? 'ui.saved' : 'ui.saveFailed')); }}>{t('ui.save')}</button>
            <button type="button" class="ui-btn" data-ui="code-export"
              onClick={() => { void port.exportCode().then(setCodeOut); }}>{t('ui.exportCode')}</button>
            {codeOut && <textarea class="ui-code" data-ui="code-out" readOnly rows={3} aria-label={t('ui.exportCode')} value={codeOut}
              onFocus={(e) => (e.currentTarget as HTMLTextAreaElement).select()} />}
            <textarea class="ui-code" data-ui="code-in" rows={3} aria-label={t('ui.importCode')} placeholder={t('ui.importCode')}
              value={codeIn} onInput={(e) => setCodeIn((e.currentTarget as HTMLTextAreaElement).value)} />
            <button type="button" class="ui-btn" data-ui="code-apply"
              onClick={() => { void port.importCode(codeIn).then((r) => setStatus(({ ok: 'ui.importOk', bad: 'ui.importBad', outdated: 'ui.importOutdated', newer: 'ui.importNewer', unsaved: 'ui.importUnsaved' } as const)[r])); }}>{t('ui.apply')}</button>
            {status && <p class="ui-status" data-ui="status" role="status">{t(status)}</p>}
          </fieldset>
          <button type="button" class="ui-btn" data-ui="reset" onClick={() => update(DEFAULT_SETTINGS)}>{t('ui.reset')}</button>
          {/* Титри обов'язкові (OD-013): автор, джерело, ліцензія і чи змінено — для кожного файлу графіки. */}
          <details class="ui-credits" data-ui="credits">
            <summary class="ui-btn">{t('ui.credits')}</summary>
            <p>{t('ui.creditsIntro')}</p>
            <ul>
              {credits.files.map((f) => (
                <li data-credit={f.file} key={f.file}>
                  <span class="ui-credit-file">{f.file}</span>
                  <span class="ui-credit-authors">{f.authors.join(', ')}</span>
                  <span class="ui-credit-links">
                    {/* Ліцензія без посилання — видно в e2e (кожна має бути посиланням), а не порожній href. */}
                    {credits.licences[f.licence]
                      ? <a href={credits.licences[f.licence]?.url ?? ''} target="_blank" rel="noopener noreferrer" data-licence={f.licence}>{f.licence}</a>
                      : <span data-licence-missing={f.licence}>{f.licence}</span>}
                    {' · '}
                    {f.sources.map((src, i) => <>{i > 0 && ', '}<a href={src} target="_blank" rel="noopener noreferrer">{`${t('ui.creditsSource')} ${i + 1}`}</a></>)}
                    {' · '}
                    {f.modified === 'no' ? t('ui.creditsUnmodified') : f.modified}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </>
  );
}
