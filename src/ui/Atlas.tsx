// Атлас (GAME-182, brain/Сценарій/scenario.md §2): сторінка «Перша спроба» — 12 слотів-наклейок (не отримана — силует), печатка господаря в центрі
// й маленька мапа Європи з позначкою «ми тут». Лише показує знімок (`offer.atlas`); наклейки видає ядро за умовами content/stickers.json.
import { useEffect, useRef } from 'preact/hooks';
import { ct } from '../i18n/content';
import type { AnyLang, Key } from '../i18n';
import { iconRects } from './atlas-icons';
import { trapTab } from './focus-trap';
import type { OfferAtlas } from './story-types';

function Icon({ icon }: { icon: string }) {
  return (
    <svg class="ui-sticker-icon" viewBox="0 0 8 8" aria-hidden="true" focusable="false">
      {iconRects(icon).map((r) => <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width="1" height="1" fill={r.fill} />)}
    </svg>
  );
}

/** Мапа Європи — умовний силует (не карта для навігації) і шпилька. Малюється кодом: ні файлу, ні ліцензії. */
function EuropeMap({ t }: { t: (k: Key) => string }) {
  return (
    <div class="ui-atlas-map" data-ui="atlas-map" role="img" aria-label={t('atlas.map')}>
      <svg viewBox="0 0 200 130" aria-hidden="true" focusable="false">
        <polygon points="20,60 28,48 40,50 45,38 60,32 68,20 82,14 95,22 92,34 100,38 112,30 120,10 135,8 140,22 128,34 134,48 150,52 168,60 176,76 160,84 150,100 138,96 128,86 118,92 112,108 104,98 98,84 86,80 80,92 70,104 54,112 40,106 32,92 22,84" fill="#d9c79b" stroke="#6b5430" stroke-width="2" stroke-linejoin="round" />
        <circle cx="84" cy="50" r="5" fill="#c4482e" stroke="#2b2f36" stroke-width="2" data-ui="atlas-pin" />
      </svg>
      <span class="ui-atlas-here" data-ui="atlas-here">{t('atlas.here')}</span>
    </div>
  );
}

/** Сторінка Атласу. `fly` — id наклейки, що влітає (кінець вступу): лише анімація, стан уже в ядрі. */
export function AtlasPage({ atlas, lang, t, fly = null }: { atlas: OfferAtlas; lang: AnyLang; t: (k: Key) => string; fly?: string | null }) {
  const slots = Array.from({ length: atlas.total }, (_, i) => atlas.slots[i] ?? null);
  const cell = (s: OfferAtlas['slots'][number] | null, i: number) => {
    const owned = s?.owned === true;
    return (
      <li key={s?.id ?? i} class="ui-sticker" data-ui="sticker" data-id={s?.id ?? ''} data-owned={owned ? 'yes' : 'no'} data-fly={owned && fly === s?.id ? 'yes' : undefined}
        title={owned && s ? ct(lang, s.textKey) : undefined} aria-label={owned && s ? ct(lang, s.nameKey) : t('atlas.empty')}>
        <Icon icon={s?.icon ?? 'star'} />
        {owned && s && <span class="ui-sticker-name">{ct(lang, s.nameKey)}</span>}
      </li>
    );
  };
  // 12 слотів + печатка 2×2 в центрі сітки 4×4: рядок 1 — слоти 0–3, рядки 2–3 — слот, печатка, слот, 4 слоти останнього рядка.
  const order = [...slots.slice(0, 5)];
  return (
    <section class="ui-atlas-page" data-ui="atlas" aria-label={t('ui.atlas')}>
      <h3 class="ui-atlas-title">{t('atlas.title')}</h3>
      <ul class="ui-atlas-grid" data-ui="atlas-grid">
        {order.map(cell)}
        <li class="ui-stamp" data-ui="stamp" aria-label={t('atlas.stamp')}><span>{t('atlas.stamp')}</span></li>
        {slots.slice(5).map((s, i) => cell(s, i + 5))}
      </ul>
      <p class="ui-atlas-count" data-ui="atlas-count" data-count={atlas.count} data-total={atlas.total}>{`${t('atlas.count')}: ${atlas.count}/${atlas.total}`}</p>
      <EuropeMap t={t} />
    </section>
  );
}

/** Атлас із ☰: накладка над грою, закривається кнопкою чи Escape (Escape обробляє Shell). */
export function AtlasPanel({ atlas, lang, t, close }: { atlas: OfferAtlas; lang: AnyLang; t: (k: Key) => string; close: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { root.current?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true }); }, []);
  return (
    <div ref={root} class="ui-overlay ui-atlas" role="dialog" aria-modal="true" aria-label={t('ui.atlas')} data-ui="atlas-panel" onKeyDown={(e) => { if (root.current) trapTab(e, root.current); }}>
      <h2 tabIndex={-1}>{t('ui.atlas')}</h2>
      <AtlasPage atlas={atlas} lang={lang} t={t} />
      <button type="button" class="ui-btn" data-ui="atlas-close" onClick={close}>{t('atlas.close')}</button>
    </div>
  );
}
