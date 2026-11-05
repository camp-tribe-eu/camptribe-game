// Екран подорожі (GAME-32): вибір персонажа, завдання, розмова, дії й журнал. Лише показує знімок
// сюжету й просить дію за id — що це за команда, знає шар view (src/view/story-offer.ts).
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { ct } from '../i18n/content';
import type { AnyLang, Key } from '../i18n';
import { trapTab } from './focus-trap';
import { EntriesBook, JournalBook, SkillsBook, TravelerCard } from './JournalBook';
import { Portrait, type PortraitLookup } from './Portrait';
import type { OfferAction, StoryOffer } from './story-types';

const ACT: Readonly<Record<Exclude<OfferAction['kind'], 'choose' | 'continue' | 'cancel'>, Key>> = {
  visit: 'act.visit', talk: 'act.talk', pickup: 'act.pickup', buy: 'act.buy', sell: 'act.sell', dry: 'act.dry', complete: 'act.complete', decline: 'act.decline',
  load: 'pack.load', leave: 'pack.leave', task: 'act.task', gift: 'act.gift', sleep: 'act.sleep', wait: 'act.waitShop',
};

// Записи журналу: тип команди → підпис. Перелік той самий, що JOURNAL_TYPES ядра (звіряє src/view/story-offer.test.ts).
const JR: Readonly<Record<string, Key>> = {
  CreateCharacter: 'jr.CreateCharacter', Visit: 'jr.Visit', Pickup: 'jr.Pickup', BuyItem: 'jr.BuyItem', SellItem: 'jr.SellItem',
  Interact: 'jr.Interact', CompleteQuest: 'jr.CompleteQuest', DeclineQuest: 'jr.DeclineQuest', RoadEvent: 'jr.RoadEvent', StartScene: 'jr.StartScene',
  PackItem: 'jr.PackItem', UnpackItem: 'jr.UnpackItem', AutoPack: 'jr.AutoPack', TakeItem: 'jr.TakeItem', LoadCar: 'jr.LoadCar', LeaveItem: 'jr.LeaveItem', Memory: 'jr.Memory', CompleteTask: 'jr.CompleteTask', Sleep: 'jr.Sleep',
};
export const JOURNAL_LABELS = JR;

const PACK_STATE = { home: 'pack.state.home', bag: 'pack.state.bag', car: 'pack.state.car' } as const satisfies Record<string, Key>;
// Групи пакування (GAME-109) → підпис.
const PACK_GROUP = { needed: 'pack.group.needed', useful: 'pack.group.useful', leave: 'pack.group.leave' } as const satisfies Record<string, Key>;

// Погода дня (GAME-46): вид → підпис.
const WX: Readonly<Record<StoryOffer['weather'], Key>> = { sunny: 'ui.weather.sunny', cloudy: 'ui.weather.cloudy', rain: 'ui.weather.rain' };
export const WEATHER_LABELS = WX;

/** Скільки після прийнятої дії панель глуха до нових активацій (мс між event.timeStamp). */
export const ACT_COOLDOWN_MS = 350;

export function money(lang: AnyLang, cents: number): string {
  // GAME-84 №7: Intl ставить між числом і валютою нерозривний пробіл. Коли «249,00 EUR» не вміщується в рядок (текст 200 %),
  // браузер різав її посеред слова («EU R»). Звичайний пробіл — рядок рветься між числом і валютою, а слово лишається цілим.
  return new Intl.NumberFormat(lang === 'uk' ? 'uk-UA' : 'en-IE', { style: 'currency', currency: 'EUR' }).format(cents / 100).replace(/[\u00a0\u202f]/g, ' ');
}

/** Підпис дії-кнопки (панель подорожі й рамка розмови, GAME-179): однаково скрізь. */
export function actionLabel(lang: AnyLang, t: (k: Key) => string, a: OfferAction): string {
  if (a.kind === 'continue') return t('ui.continue');
  if (a.kind === 'cancel') return t('ui.notNow');
  if (a.kind === 'choose') return ct(lang, a.key);
  if (a.kind === 'sleep' || a.kind === 'wait') return t(ACT[a.kind]);
  const extras = [
    ...(a.minutes !== undefined ? [`${a.minutes} ${t('ui.minutes')}`] : []),
    ...(a.priceCents !== undefined ? [money(lang, a.priceCents)] : []),
  ];
  return `${t(ACT[a.kind])} ${ct(lang, a.key)}${extras.length ? ` (${extras.join(', ')})` : ''}`;
}

export function StoryPanel({ offer, lang, t, act, close, portrait, children, footer, settings }: { offer: StoryOffer; lang: AnyLang; t: (k: Key) => string; act: (id: string) => void; close: () => void; portrait: PortraitLookup; children?: ComponentChildren; settings?: () => void; footer?: ComponentChildren }) {
  const root = useRef<HTMLDivElement>(null);
  // GAME-185: у мапі-першій грі ☰ — лише меню; квести, навички, речі й журнал — на екрані «Журнал» (page === 'journal').
  const [page, setPage] = useState<'menu' | 'journal'>('menu');
  const compact = offer.mapFirst && offer.stage !== 'create';
  const showRest = !compact || page === 'journal';   // квести, прогрес, навички, речі, журнал

  // GAME-80: після дії кнопки перебудовуються, і друге натискання (дотик чи Enter) через ~150 мс влучало б
  // в нову першу кнопку — дорогу покупку чи дорогу додому. Тому: (а) фокус після зміни йде на СТАБІЛЬНИЙ
  // рядок стану (де ти, гроші, погода), а не на кнопку; (б) панель ігнорує активації ще ACT_COOLDOWN_MS
  // після прийнятої. Мірка — event.timeStamp двох подій (без таймерів і без годинника: див. no-realtime).
  const lastAct = useRef(Number.NEGATIVE_INFINITY);
  useEffect(() => {
    const el = root.current;
    // GAME-84 №7: фокус без прокрутки (інакше браузер тягнув рядок стану нагору панелі, і заголовок зникав за межею),
    // а панель повертається на початок — гравець бачить заголовок, де він і що змінилось.
    (el?.querySelector<HTMLElement>('[data-ui="where"]') ?? el?.querySelector<HTMLElement>('h2'))?.focus({ preventScroll: true });
    if (el) el.scrollTop = 0;
  }, [offer, page]);
  const guarded = (id: string) => (e: Event): void => {
    if (e.timeStamp - lastAct.current < ACT_COOLDOWN_MS) return;
    lastAct.current = e.timeStamp;
    act(id);
  };

  const label = (a: OfferAction): string => actionLabel(lang, t, a);
  // Недоступна купівля (GAME-83): aria-disabled, а не disabled — лишається в порядку Tab, тож екранний читач
  // чує назву, ціну й причину; активація нічого не робить. Причина — частина доступного імені кнопки.
  const lockedButton = (a: OfferAction) => (
    <button type="button" class="ui-btn ui-btn-locked" key={a.id} aria-disabled="true" data-act="buy-locked" data-key={a.key ?? ''}
      onClick={(e) => e.preventDefault()}>{`${label(a)} — ${t('ui.short')} ${money(lang, a.shortCents ?? 0)}`}</button>
  );
  const button = (a: OfferAction) => (
    <button type="button" class="ui-btn" key={a.id} data-act={a.kind} data-key={a.key ?? ''} onClick={guarded(a.id)}>{label(a)}</button>
  );

  return (
    // Затиснутий Enter/Space (автоповтор) не «пробігає» кроки: фокус після кожної дії стрибає на нову першу
    // кнопку, і повтор клавіші влучав би вже в неї (рецензія GAME-32). Свідомі натискання — без затримки.
    <div ref={root} onKeyDown={(e) => { if (e.repeat && (e.key === 'Enter' || e.key === ' ')) e.preventDefault(); if (root.current) trapTab(e, root.current); }} class="ui-overlay ui-story" role="dialog" aria-modal="true" aria-label={t('ui.story')} data-ui="story">
      <h2 tabIndex={-1}>{compact && page === 'journal' ? t('ui.journal') : t('ui.story')}</h2>
      {children}
      {offer.stage === 'create' && (
        <fieldset data-ui="create">
          <legend>{t('ui.createTitle')}</legend>
          {offer.characters.map((c) => (
            <button type="button" class="ui-btn" key={c.id} data-act="create" onClick={guarded(c.id)}>
              {`${ct(lang, c.profileKey)} · ${ct(lang, c.transportKey)} · ${c.animalKey ? ct(lang, c.animalKey) : t('ui.noAnimal')}`}
            </button>
          ))}
        </fieldset>
      )}
      {offer.stage !== 'create' && (
        <p class="ui-status" data-ui="where" tabIndex={-1} role="status" data-weather={offer.weather}>{`${t('ui.here')}: ${ct(lang, offer.locationKey)} · ${t('ui.money')}: ${money(lang, offer.moneyCents)} · ${t('ui.weather')}: ${t(WX[offer.weather])}`}</p>
      )}
      {offer.stage !== 'create' && showRest && (
        // GAME-169: прогноз на сьогодні (GAME-131) — окремим рядком від факту й зі словом «прогноз»: він може не збутись,
        // і гравець має бачити обидва. Та сама лексика підписів, що й у погоди (WX). Не кнопка — без цілі 44 px.
        <p class="ui-status" data-ui="forecast" data-forecast={offer.forecast} data-hit={offer.forecast === offer.weather ? 'yes' : 'no'}>{`${t('ui.forecast.today')}: ${t(WX[offer.forecast])}`}</p>
      )}
      {offer.stage !== 'create' && showRest && offer.mia && (
        // GAME-111: Мія — два текстові стани й жодного числа чи шкали (сторож DOM: tests/e2e/game-111.spec.ts).
        <section class="ui-mia" data-ui="mia" data-state={offer.mia} aria-label={t('ui.mia')}>
          <h3>{t('ui.mia')}</h3>
          <p data-ui="mia-state" role="status">{t(offer.mia === 'pause' ? 'ui.mia.pause' : 'ui.mia.settled')}</p>
        </section>
      )}
      {offer.stage !== 'create' && showRest && (compact
        ? <JournalBook offer={offer} lang={lang} t={t} labels={JR} />   // GAME-253: щоденник — мандрівник, навички, записи по днях
        : <TravelerCard offer={offer} lang={lang} t={t} />)}
      {offer.stage !== 'create' && showRest && offer.goals.length > 0 && (
        // GAME-200: 2–4 паралельні цілі — головна, побічні й «нагорода близько» (ще N). Без таймерів і покарань (OD-022).
        <section class="ui-goals" data-ui="goals" data-count={offer.goals.length} aria-label={t('ui.goals')}>
          <h3>{t('ui.goals')}</h3>
          <ul>{offer.goals.map((g, i) => (
            <li key={`${g.kind}-${i}`} data-ui="goal-row" data-kind={g.kind}>
              {`${t(`ui.goals.${g.kind}` as Key)}: ${g.ui ? t(g.key as Key) : ct(lang, g.key)}${g.left !== undefined ? ` — ${t('rw.more')} ${g.left}` : ''}`}
            </li>
          ))}</ul>
        </section>
      )}
      {offer.stage === 'ended' && <p class="ui-status" data-ui="ended" role="status">{t('ui.ended')}</p>}
      {showRest && offer.quests.map((q) => (
        <section class="ui-quest" data-ui="quest" key={q.key}>
          {/* GAME-179: від кого завдання — портрет і ім'я; без giverId — оповідач (нейтральна іконка). */}
          <div class="ui-giver" data-ui="giver" data-npc={q.giver?.id ?? 'narrator'}>
            <Portrait id={q.giver?.id ?? null} lookup={portrait} size="sm" />
            <span data-ui="giver-name">{q.giver?.key ? `${t('ui.questFrom')}: ${ct(lang, q.giver.key)}` : t('ui.narrator')}</span>
          </div>
          <h3>{`${t('ui.quest')}: ${ct(lang, q.key)}`}</h3>
          <ul>
            {q.objectives.map((o) => (
              <li key={o.key} data-done={o.done ? 'yes' : 'no'}>
                {`${o.done ? '✓' : '○'} ${ct(lang, o.key)}${o.required ? '' : ` (${t('ui.optional')})`}`}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {offer.dialogue && !compact && (
        <section class="ui-dialogue" data-ui="dialogue" aria-live="polite">
          <div class="ui-giver" data-ui="speaker-head" data-npc={offer.dialogue.speakerId ?? 'narrator'}>
            <Portrait id={offer.dialogue.speakerId} lookup={portrait} size="sm" />
            <h3>{offer.dialogue.speakerKey ? ct(lang, offer.dialogue.speakerKey) : t('ui.dialogue')}</h3>
          </div>
          <p data-ui="line">{offer.dialogue.ui ? t((offer.dialogue.key ?? 'ui.dialogue') as Key) : ct(lang, offer.dialogue.key)}</p>
          <div class="ui-answers">{offer.dialogue.answers.map(button)}</div>
        </section>
      )}
      {offer.packing && !offer.dialogue && (!compact || page === 'journal' || offer.packing.overflow.length > 0) && (
        <fieldset data-ui="packing">
          <legend>{t('pack.title')}</legend>
          <p class="ui-status" data-ui="pack-space" data-used={offer.packing.used} data-capacity={offer.packing.capacity} role="status">
            {`${t('pack.space')}: ${offer.packing.used} / ${offer.packing.capacity} ${t('pack.units')}`}
          </p>
          <p class="ui-status" data-ui="pack-progress" data-taken={offer.packing.taken} data-total={offer.packing.total} role="status">
            {`${t('pack.taken')} ${offer.packing.taken}/${offer.packing.total}${offer.packing.leftKeys.length > 0 ? ` · ${t('pack.left')}: ${offer.packing.leftKeys.slice(0, 3).map((k) => ct(lang, k)).join(', ')}${offer.packing.leftKeys.length > 3 ? '…' : ''}` : ''}`}
          </p>
          {offer.packing.groups.map((g) => (
            <div key={g.group} data-ui="pack-group" data-group={g.group} role="group" aria-label={t(PACK_GROUP[g.group])}>
              <h4>{t(PACK_GROUP[g.group])}</h4>
              <ul>
                {g.items.map((i) => <li key={i.key} data-ui="pack-item" data-key={i.key} data-state={i.state}>{`${ct(lang, i.key)} · ${i.units} ${t('pack.units')} — ${t(PACK_STATE[i.state])}`}</li>)}
              </ul>
            </div>
          ))}
          {offer.packing.load && <button type="button" class="ui-btn" data-act="load" data-key="" onClick={guarded(offer.packing.load.id)}>{t('pack.load')}</button>}
          {offer.packing.overflow.length > 0 && (
            <div data-ui="pack-overflow" role="group" aria-label={t('pack.overflow')}>
              <h4>{t('pack.overflow')}</h4>
              {offer.packing.overflow.map((o) => <button type="button" class="ui-btn" key={o.key} data-act="leave" data-key={o.key} onClick={guarded(o.action.id)}>{`${t('pack.leave')} ${ct(lang, o.key)} · ${o.units} ${t('pack.units')}`}</button>)}
            </div>
          )}
          {offer.packing.noteKey && <p class="ui-status" data-ui="pack-note">{ct(lang, offer.packing.noteKey)}</p>}
        </fieldset>
      )}
      {offer.rest.shopClosed && !offer.dialogue && <p data-ui="shop-closed" role="status">{t('shop.closed')}</p>}
      {/* GAME-242: на мапі ☰ стиснуте й кнопок не має — але «Лягти спати» / «Почекати» мапа дати не може: лише вони лишаються. */}
      {compact && !offer.dialogue && offer.actions.some((x) => x.kind === 'sleep' || x.kind === 'wait') && (
        <fieldset data-ui="rest">
          <legend>{t('ui.actions')}</legend>
          {offer.actions.filter((x) => x.kind === 'sleep' || x.kind === 'wait').map(button)}
        </fieldset>
      )}
      {!compact && (offer.actions.length > 0 || offer.locked.length > 0) && (
        <fieldset data-ui="actions">
          <legend>{t('ui.actions')}</legend>
          {offer.actions.map(button)}
          {!offer.dialogue && offer.locked.map(lockedButton)}
        </fieldset>
      )}
      {showRest && offer.inventory.length > 0 && (
        <p class="ui-status" data-ui="inventory">{`${t('ui.inventory')}: `}
          {offer.inventory.map((i, n) => (
            // Спорядження — зі станом і позначкою «мокре» (GAME-83); решта речей — як і було.
            <span key={i.key} data-ui="inv-item" data-key={i.key} data-wet={i.gear ? (i.gear.wet ? 'yes' : 'no') : undefined}>
              {n > 0 && ', '}
              {`${ct(lang, i.key)}${i.qty > 1 ? ` ×${i.qty}` : ''}${i.gear ? ` (${t('ui.condition')} ${i.gear.condition} %${i.gear.wet ? `, ${t('ui.wet')}` : ''})` : ''}`}
            </span>
          ))}
        </p>
      )}
      {offer.stage !== 'create' && showRest && !compact && <SkillsBook offer={offer} lang={lang} t={t} />}
      {!compact && <details class="ui-journal-fold" data-ui="journal">
        <summary class="ui-btn">{t('ui.journal')}</summary>
        <EntriesBook offer={offer} lang={lang} t={t} labels={JR} />
      </details>}
      {compact && page === 'menu' && <>
        {footer}
        <button type="button" class="ui-btn" data-ui="journal" onClick={() => setPage('journal')}>{t('ui.journal')}</button>
        {settings && <button type="button" class="ui-btn" data-ui="settings-open" onClick={settings}>{t('ui.settingsOpen')}</button>}
      </>}
      {!compact && footer}
      {compact && page === 'journal' && <button type="button" class="ui-btn" data-ui="journal-back" onClick={() => setPage('menu')}>{t('ui.journalBack')}</button>}
      <button type="button" class="ui-btn" data-ui="story-close" onClick={close}>{t('ui.storyClose')}</button>
    </div>
  );
}
