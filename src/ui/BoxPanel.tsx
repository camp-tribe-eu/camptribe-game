// GAME-304 · вікно «всередині контейнера»: крупний план полиць холодильника, комори, шафи, тумби чи скриньки Мії. Той самий ідіом, що в рюкзака (накладка на все поле,
// ✕ праворуч угорі, піктограми речей 64 px, шрифт гри): гравець бере потрібне й закриває. Лише показує знімок (`offer.box`) і просить дію через `take`/`close` (id із моделі) —
// чи можна взяти, вирішило ядро ще в моделі (box-offer.ts). Клавіатура: Tab, стрілки між речами, Enter/Пробіл — взяти, Escape — закрити (Shell). Дотик: кнопки ≥ 44 px.
import { useEffect, useRef } from 'preact/hooks';
import { ct } from '../i18n/content';
import type { AnyLang, Key } from '../i18n';
import { trapTab } from './focus-trap';
import { PackItemIcon } from './ObjectiveIcon';
import type { OfferBox, OfferBoxSlot, OfferHint } from './story-types';

const GROUP: Readonly<Record<OfferBoxSlot['group'], Key>> = { needed: 'pack.group.needed', useful: 'pack.group.useful', leave: 'pack.group.leave' };

export function BoxPanel({ box, card, lang, t, take, close }: { box: OfferBox; card: OfferHint['card']; lang: AnyLang; t: (k: Key) => string; take: (id: string) => void; close: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const left = useRef(box.left);
  // Взяли річ — її кнопка стала «порожньою полицею»: фокус не лишається на зниклій кнопці, а йде на наступну річ (чи на ✕, коли полиці порожні).
  useEffect(() => {
    if (box.left === left.current) return;
    left.current = box.left;
    const next = root.current?.querySelector<HTMLElement>('[data-ui="box-take"]:not([disabled])') ?? root.current?.querySelector<HTMLElement>('[data-ui="box-close"]');
    next?.focus({ preventScroll: true });
  }, [box.left]);
  useEffect(() => { (root.current?.querySelector<HTMLElement>('[data-ui="box-take"]:not([disabled])') ?? root.current?.querySelector<HTMLElement>('h2'))?.focus({ preventScroll: true }); }, []);
  const arrows = (e: KeyboardEvent): void => {
    if (root.current) trapTab(e, root.current);
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (dir === 0 || !root.current) return;
    const all = [...root.current.querySelectorAll<HTMLElement>('[data-ui="box-take"]:not([disabled]), [data-ui="box-close"]')];
    const at = all.indexOf(document.activeElement as HTMLElement);
    if (all.length === 0) return;
    e.preventDefault();
    all[(at + dir + all.length) % all.length]?.focus({ preventScroll: true });
  };
  return (
    <div ref={root} class="ui-overlay ui-box" role="dialog" aria-modal="true" aria-label={t(box.nameKey)} data-ui="box-panel" data-box={box.id} data-left={box.left} onKeyDown={arrows}>
      <div class="ui-backpack-head ui-box-head">
        <h2 tabIndex={-1} data-ui="box-title">{t(box.nameKey)}</h2>
        <button type="button" class="ui-btn ui-backpack-x" data-ui="box-close" aria-label={t('box.close')} onClick={close}>{'✕'}</button>
      </div>
      <p class="ui-bp-hint ui-box-hint" data-ui="box-hint">{box.left > 0 ? t('box.hint') : t('box.empty')}</p>
      <div class="ui-box-inside" data-ui="box-inside">
        <ul class="ui-box-shelf" data-ui="box-shelf">
            {box.slots.map((s) => (
              <li key={s.id} class="ui-box-slot" data-ui="box-slot" data-id={s.id} data-state={s.state} data-group={s.group}>
                {s.state === 'here' ? (
                  <button type="button" class="ui-btn ui-box-item" data-ui="box-take" data-id={s.id} disabled={s.action === null} aria-label={`${t('box.take')}: ${ct(lang, s.key)}`} onClick={() => { if (s.action !== null) take(s.action); }}>
                    <PackItemIcon spot={s.spot} />
                    <b data-ui="box-name">{ct(lang, s.key)}</b>
                    <small>{t(GROUP[s.group])}</small>
                  </button>
                ) : (
                  <div class="ui-box-gone" data-ui="box-gone" role="img" aria-label={`${t('box.taken')}: ${ct(lang, s.key)}`}>
                    <span class="ui-box-ghost"><PackItemIcon spot={s.spot} /></span>
                    <small>{`✓ ${t('box.taken')}`}</small>
                  </div>
                )}
              </li>
            ))}
        </ul>
      </div>
      <div class="ui-box-card" data-ui="box-card" role="status" aria-live="polite">
        {card && <>
          <strong data-ui="box-card-name">{ct(lang, card.nameKey)}</strong>
          <span data-ui="box-card-line">{ct(lang, card.reactKey)}</span>
          {card.xp > 0 && <em data-ui="box-card-xp">{`+${card.xp} ${t('pack.card.xp')}`}</em>}
        </>}
      </div>
      <button type="button" class="ui-btn ui-box-done" data-ui="box-done" onClick={close}>{t('box.close')}</button>
    </div>
  );
}
