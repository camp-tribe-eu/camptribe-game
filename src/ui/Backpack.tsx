// GAME-244 (S3, ч.1) · екран рюкзака: що є, звідки, ціна; «Продати» біля приймальні. Лише показує знімок (`offer.backpack`) і просить дію через `sell`
// (id наміру з моделі). Жодних власних правил: чи можна продати й за скільки — вирішило ядро ще в моделі.
import { useEffect, useRef } from 'preact/hooks';
import { ct } from '../i18n/content';
import type { AnyLang, Key } from '../i18n';
import { itemSpot } from '../content/objective-icons';
import { trapTab } from './focus-trap';
import { PackItemIcon } from './ObjectiveIcon';
import { money } from './StoryPanel';
import type { OfferBackpack } from './story-types';

export function BackpackPanel({ backpack, lang, t, sell, close }: { backpack: OfferBackpack; lang: AnyLang; t: (k: Key) => string; sell: (id: string) => void; close: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { root.current?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true }); }, []);
  const anySellable = backpack.groups.some((g) => g.rows.some((r) => r.sellCents !== null));
  return (
    <div ref={root} class="ui-overlay ui-backpack" role="dialog" aria-modal="true" aria-label={t('backpack.title')} data-ui="backpack-panel" data-at-reception={backpack.atReception ? 'yes' : 'no'} data-gift-to={backpack.giftTo ?? ''} onKeyDown={(e) => { if (root.current) trapTab(e, root.current); }}>
      <div class="ui-backpack-head">
        <h2 tabIndex={-1}>{t('backpack.title')}</h2>
        <button type="button" class="ui-btn ui-backpack-x" data-ui="backpack-close" aria-label={t('backpack.close')} onClick={close}>{'✕'}</button>
      </div>
      {backpack.giftTo !== null && <p class="ui-bp-hint" data-ui="backpack-gift-to">{`${t('backpack.giftTo')}: ${ct(lang, backpack.giftTo)}`}</p>}
      {backpack.groups.length === 0 && <p data-ui="backpack-empty">{t('backpack.empty')}</p>}
      {backpack.trades.length > 0 && (
        <section class="ui-bp-group" data-ui="backpack-trades">
          {backpack.trades.map((o) => (
            <p key={o.id} class="ui-bp-hint" data-ui="backpack-trade" data-id={o.id} data-can={o.tradeId !== null ? 'yes' : 'no'}>
              {`${o.give.map((l) => `${ct(lang, l.id)} ×${l.qty}`).join(', ')} → ${o.get.map((l) => `${ct(lang, l.id)} ×${l.qty}`).join(', ')}`}
              {o.tradeId !== null && <button type="button" class="ui-btn ui-bp-sell" data-ui="backpack-trade-do" data-id={o.id} onClick={() => sell(o.tradeId as string)}>{t('backpack.trade')}</button>}
            </p>
          ))}
        </section>
      )}
      {backpack.groups.map((g) => (
        <section key={g.group} class="ui-bp-group" data-ui="backpack-group" data-group={g.group} aria-label={t(`backpack.group.${g.group}` as Key)}>
          <h3>{t(`backpack.group.${g.group}` as Key)}</h3>
          <ul class="ui-bp-list">
            {g.rows.map((r) => (
              <li key={r.id} class="ui-bp-row" data-ui="backpack-item" data-id={r.id} data-origin={r.origin} data-sellable={r.sellCents !== null ? 'yes' : 'no'}>
                <PackItemIcon spot={itemSpot(r.id)} />
                <span class="ui-bp-name">
                  <b data-ui="backpack-name">{`${ct(lang, r.id)}${r.qty > 1 ? ` ×${r.qty}` : ''}`}</b>
                  <small data-ui="backpack-origin">{t(`backpack.origin.${r.origin}` as Key)}{r.gear ? ` · ${t('ui.condition')} ${r.gear.condition} %${r.gear.wet ? `, ${t('ui.wet')}` : ''}` : ''}</small>
                </span>
                {r.sellCents !== null && <span class="ui-bp-price" data-ui="backpack-price" data-cents={r.sellCents}>{`${t('backpack.worth')}: ${money(lang, r.sellCents)}`}</span>}
                {r.sellId !== null && <button type="button" class="ui-btn ui-bp-sell" data-ui="backpack-sell" data-id={r.id} onClick={() => sell(r.sellId as string)}>{t('backpack.sell')}</button>}
                {r.giftId !== null && <button type="button" class="ui-btn ui-bp-sell" data-ui="backpack-gift" data-id={r.id} onClick={() => sell(r.giftId as string)}>{t('backpack.gift')}</button>}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {!backpack.atReception && anySellable && <p class="ui-bp-hint" data-ui="backpack-sell-hint">{t('backpack.sellHint')}</p>}
    </div>
  );
}
