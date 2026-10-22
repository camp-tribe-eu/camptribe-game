// Оболонка UI над канвою (GAME-25): пауза й налаштування. Preact, DOM — для кирилиці, масштабу тексту
// й екранного читача (TD-003).
import { useEffect, useRef, useState } from 'preact/hooks';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from '../platform/settings';
import type { Credits, UiPort } from './port';
import { t as tr, type AnyLang, type Key } from '../i18n';

export function Shell({ port, langOverride, credits }: { port: UiPort; langOverride?: AnyLang; credits: Credits }) {
  const [paused, setPaused] = useState(false);
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const resumeRef = useRef<HTMLButtonElement>(null);
  const [status, setStatus] = useState<Key | null>(null);
  const [codeOut, setCodeOut] = useState('');
  const [codeIn, setCodeIn] = useState('');
  const lang: AnyLang = langOverride ?? settings.language;
  const t = (key: Key): string => tr(lang, key);

  const toggle = (next: boolean): void => {
    setPaused(next);
    port.setPaused(next);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.code === 'Escape') { e.preventDefault(); toggle(!paused); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paused]);

  // Фокус — у діалог, щоб клавіатура й екранний читач починали з «Продовжити».
  useEffect(() => {
    if (paused) resumeRef.current?.focus();
  }, [paused]);

  // Зберігаємо одразу в обробнику, а не в ефекті: ефект Preact відкладено до після малювання, і зміна
  // мови перед закриттям вкладки (чи reload у e2e на CI) губилась — сторінка встигала піти раніше.
  const update = (next: Settings): void => {
    setSettings(next);
    saveSettings(next);
  };

  useEffect(() => {
    document.documentElement.style.fontSize = `${settings.textScale}%`;
    document.documentElement.lang = settings.language;
  }, [settings]);

  return (
    <>
      {!paused && <button type="button" class="ui-pause-btn" data-touch="pause" aria-label={t('ui.pause')} onClick={() => toggle(true)}>{'‖'}</button>}
      {paused && (
        <div class="ui-overlay" role="dialog" aria-modal="true" aria-label={t('ui.paused')} data-ui="pause">
          <h2>{t('ui.paused')}</h2>
          <button type="button" class="ui-btn" data-ui="resume" ref={resumeRef} onClick={() => toggle(false)}>{t('ui.resume')}</button>
          <fieldset>
            <legend>{t('ui.textSize')}</legend>
            {([100, 125, 150] as const).map((v) => (
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
              onClick={() => { void port.importCode(codeIn).then((r) => setStatus(r === 'ok' ? 'ui.importOk' : r === 'bad' ? 'ui.importBad' : 'ui.importUnsaved')); }}>{t('ui.apply')}</button>
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
                  <span>
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
