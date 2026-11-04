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

/** GAME-215: позначка олівцем, як на мапі (scene.ts drawTrace): нерівне коло з розривом і зірочка; знайдений слід — графіт, інший — блідий. */
function PencilMark({ found }: { found: boolean }) {
  return (
    <svg class="ui-trace-mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false" data-found={found ? 'yes' : 'no'}>
      <circle cx="12" cy="12" r="8.5" stroke-width="2" stroke-dasharray="44 9" />
      <line x1="9" y1="9" x2="15" y2="15" stroke-width="1.6" /><line x1="15" y1="9" x2="9" y2="15" stroke-width="1.6" /><line x1="12" y1="7.5" x2="12" y2="16.5" stroke-width="1.6" />
    </svg>
  );
}

/**
 * GAME-215: сторінка «Шлях Генрі» — сліди дідуся за регіонами (content/traces.json), знайдені з назвою, видом і датою (1978 чи «цієї осені»:
 * дата каже, яка нитка стара, а яка — свіжа), незнайдені — лише позначка. Усі знайдено — листівка (наклейку видає ядро, тут лише напис).
 */
function HenryTrail({ henry, lang, t }: { henry: OfferAtlas['henry']; lang: AnyLang; t: (k: Key) => string }) {
  const regions = [...new Set(henry.traces.map((x) => x.location))];
  return (
    <section class="ui-henry" data-ui="henry" data-found={henry.found} data-total={henry.total} aria-label={t('atlas.henry')}>
      <h4 class="ui-henry-title">{t('atlas.henry')}</h4>
      <p class="ui-henry-hint">{t('atlas.henry.hint')}</p>
      {regions.map((loc) => (
        <div key={loc} class="ui-henry-region" data-ui="henry-region" data-location={loc}>
          <span class="ui-henry-region-name">{ct(lang, loc)}</span>
          <ul class="ui-henry-list">
            {henry.traces.filter((x) => x.location === loc).map((x) => (
              <li key={x.id} class="ui-trace" data-ui="trace" data-id={x.id} data-kind={x.kind} data-found={x.found ? 'yes' : 'no'} title={x.found ? ct(lang, x.textKey) : undefined}>
                <PencilMark found={x.found} />
                <span class="ui-trace-name">{x.found ? ct(lang, x.nameKey) : t('atlas.henry.unknown')}</span>
                {x.found && <span class="ui-trace-meta">{`${t(`trace.kind.${x.kind}` as Key)} · ${x.year === null ? t('trace.fresh') : String(x.year)}`}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p class="ui-henry-count" data-ui="henry-count">{`${t('atlas.henry.count')}: ${henry.found}/${henry.total}`}</p>
      {henry.postcard && <p class="ui-henry-postcard" data-ui="henry-postcard"><Icon icon="postcard" />{t('atlas.henry.postcard')}</p>}
    </section>
  );
}

/** GAME-213: розділ «Фото» — знімки камерою телефона (3 місця табору); зроблене фото з назвою, інше — порожня рамка. */
function PhotoRoll({ photos, t }: { photos: OfferAtlas['photos']; t: (k: Key) => string }) {
  return (
    <section class="ui-henry" data-ui="photos" data-taken={photos.taken} data-total={photos.total} aria-label={t('atlas.photos')}>
      <h4 class="ui-henry-title">{t('atlas.photos')}</h4>
      <p class="ui-henry-hint">{t('atlas.photos.hint')}</p>
      <ul class="ui-henry-list">
        {photos.photos.map((p) => (
          <li key={p.id} class="ui-trace" data-ui="photo" data-id={p.id} data-taken={p.taken ? 'yes' : 'no'}>
            <span class="ui-trace-name">{p.taken ? t(p.nameKey as Key) : t('atlas.photos.empty')}</span>
          </li>
        ))}
      </ul>
      <p class="ui-henry-count" data-ui="photos-count">{`${t('atlas.photos.count')}: ${photos.taken}/${photos.total}`}</p>
    </section>
  );
}

/** GAME-200: заповнення — загальне і по сторінках; нагорода за повну сторінку: що буде, а коли повна — що отримано (її видає ядро, тут лише напис). */
function AtlasFill({ atlas, t }: { atlas: OfferAtlas; t: (k: Key) => string }) {
  return (
    <section class="ui-atlas-fill" data-ui="atlas-fill" data-pct={atlas.fillPct} aria-label={t('atlas.fill')}>
      <p class="ui-atlas-fill-total" data-ui="atlas-fill-total">{`${t('atlas.fill')}: ${atlas.fillPct}%`}</p>
      <ul class="ui-atlas-fill-pages">
        {atlas.pages.map((p) => (
          <li key={p.id} data-ui="atlas-page-fill" data-page={p.id} data-pct={p.pct} data-have={p.have} data-total={p.total} data-done={p.done ? 'yes' : 'no'}>
            {`${t(p.titleKey as Key)}: ${p.pct}% (${p.have}/${p.total}) · ${p.done ? t('atlas.page.rewardGot') : `${t('atlas.page.reward')}: ${p.reward ? `+${p.reward.xp} ${t('ui.xp')}${p.reward.om > 0 ? ` · +${p.reward.om} ${t('ui.om')}` : ''}` : t('atlas.page.henryReward')}`}`}
          </li>
        ))}
      </ul>
    </section>
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
      <AtlasFill atlas={atlas} t={t} />
      <EuropeMap t={t} />
      <HenryTrail henry={atlas.henry} lang={lang} t={t} />
      <PhotoRoll photos={atlas.photos} t={t} />
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
