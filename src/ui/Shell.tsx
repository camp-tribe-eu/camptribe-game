// Оболонка UI над канвою (GAME-25): пауза й налаштування. Preact, DOM — для кирилиці, масштабу тексту
// й екранного читача (TD-003).
import { useEffect, useState } from 'preact/hooks';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from '../platform/settings';
import type { UiPort } from './port';
import { STRINGS } from './strings';

export function Shell({ port }: { port: UiPort }) {
  const [paused, setPaused] = useState(false);
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const t = STRINGS[settings.language];

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

  useEffect(() => {
    document.documentElement.style.fontSize = `${settings.textScale}%`;
    document.documentElement.lang = settings.language;
    saveSettings(settings);
  }, [settings]);

  return (
    <>
      <button type="button" class="ui-pause-btn" data-touch="pause" aria-label={t.pause} onClick={() => toggle(true)}>{'‖'}</button>
      {paused && (
        <div class="ui-overlay" role="dialog" aria-modal="true" aria-label={t.paused} data-ui="pause">
          <h2>{t.paused}</h2>
          <button type="button" class="ui-btn" data-ui="resume" onClick={() => toggle(false)}>{t.resume}</button>
          <fieldset>
            <legend>{t.textSize}</legend>
            {([100, 125, 150] as const).map((v) => (
              <button type="button" class="ui-btn" data-ui={`text-${v}`} aria-pressed={settings.textScale === v}
                onClick={() => setSettings({ ...settings, textScale: v })}>{v}%</button>
            ))}
          </fieldset>
          <fieldset>
            <legend>{t.language}</legend>
            {(['uk', 'en'] as const).map((l) => (
              <button type="button" class="ui-btn" data-ui={`lang-${l}`} aria-pressed={settings.language === l}
                onClick={() => setSettings({ ...settings, language: l })}>{l.toUpperCase()}</button>
            ))}
          </fieldset>
          <button type="button" class="ui-btn" data-ui="reset" onClick={() => setSettings(DEFAULT_SETTINGS)}>↺</button>
        </div>
      )}
    </>
  );
}
