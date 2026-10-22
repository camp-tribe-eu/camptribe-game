// Оболонка UI над канвою (GAME-25): пауза й налаштування. Preact, DOM — для кирилиці, масштабу тексту
// й екранного читача (TD-003).
import { useEffect, useRef, useState } from 'preact/hooks';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from '../platform/settings';
import type { UiPort } from './port';
import { t as tr, type AnyLang, type Key } from '../i18n';

export function Shell({ port, langOverride }: { port: UiPort; langOverride?: AnyLang }) {
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

  useEffect(() => {
    document.documentElement.style.fontSize = `${settings.textScale}%`;
    document.documentElement.lang = settings.language;
    saveSettings(settings);
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
                onClick={() => setSettings({ ...settings, textScale: v })}>{v}%</button>
            ))}
          </fieldset>
          <fieldset>
            <legend>{t('ui.language')}</legend>
            {(['uk', 'en'] as const).map((l) => (
              <button type="button" class="ui-btn" data-ui={`lang-${l}`} aria-pressed={settings.language === l}
                onClick={() => setSettings({ ...settings, language: l })}>{l.toUpperCase()}</button>
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
          <button type="button" class="ui-btn" data-ui="reset" onClick={() => setSettings(DEFAULT_SETTINGS)}>{t('ui.reset')}</button>
        </div>
      )}
    </>
  );
}
