// Екран подорожі (GAME-32): вибір персонажа, завдання, розмова, дії й журнал. Лише показує знімок
// сюжету й просить дію за id — що це за команда, знає шар view (src/view/story-offer.ts).
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { ct } from '../i18n/content';
import type { AnyLang, Key } from '../i18n';
import type { OfferAction, StoryOffer } from './story-types';

const ACT: Readonly<Record<Exclude<OfferAction['kind'], 'choose' | 'continue'>, Key>> = {
  visit: 'act.visit', talk: 'act.talk', pickup: 'act.pickup', buy: 'act.buy', sell: 'act.sell', complete: 'act.complete', decline: 'act.decline',
};

// Записи журналу: тип команди → підпис. Перелік той самий, що JOURNAL_TYPES ядра (звіряє src/view/story-offer.test.ts).
const JR: Readonly<Record<string, Key>> = {
  CreateCharacter: 'jr.CreateCharacter', Visit: 'jr.Visit', Pickup: 'jr.Pickup', BuyItem: 'jr.BuyItem', SellItem: 'jr.SellItem',
  Interact: 'jr.Interact', CompleteQuest: 'jr.CompleteQuest', DeclineQuest: 'jr.DeclineQuest',
};
export const JOURNAL_LABELS = JR;

export function money(lang: AnyLang, cents: number): string {
  return new Intl.NumberFormat(lang === 'uk' ? 'uk-UA' : 'en-IE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

export function StoryPanel({ offer, lang, t, act, close, children }: { offer: StoryOffer; lang: AnyLang; t: (k: Key) => string; act: (id: string) => void; close: () => void; children?: ComponentChildren }) {
  const root = useRef<HTMLDivElement>(null);
  // Фокус — на першу дію після кожної зміни: клавіатура й екранний читач не губляться.
  useEffect(() => { root.current?.querySelector<HTMLButtonElement>('button[data-act]')?.focus(); }, [offer]);

  const label = (a: OfferAction): string => {
    if (a.kind === 'continue') return t('ui.continue');
    if (a.kind === 'choose') return ct(lang, a.key);
    const extras = [
      ...(a.minutes !== undefined ? [`${a.minutes} ${t('ui.minutes')}`] : []),
      ...(a.priceCents !== undefined ? [money(lang, a.priceCents)] : []),
    ];
    return `${t(ACT[a.kind])} ${ct(lang, a.key)}${extras.length ? ` (${extras.join(', ')})` : ''}`;
  };
  const button = (a: OfferAction) => (
    <button type="button" class="ui-btn" key={a.id} data-act={a.kind} data-key={a.key ?? ''} onClick={() => act(a.id)}>{label(a)}</button>
  );

  return (
    // Затиснутий Enter/Space (автоповтор) не «пробігає» кроки: фокус після кожної дії стрибає на нову першу
    // кнопку, і повтор клавіші влучав би вже в неї (рецензія GAME-32). Свідомі натискання — без затримки.
    <div ref={root} onKeyDown={(e) => { if (e.repeat && (e.key === 'Enter' || e.key === ' ')) e.preventDefault(); }} class="ui-overlay ui-story" role="dialog" aria-modal="true" aria-label={t('ui.story')} data-ui="story">
      <h2>{t('ui.story')}</h2>
      {children}
      {offer.stage === 'create' && (
        <fieldset data-ui="create">
          <legend>{t('ui.createTitle')}</legend>
          {offer.characters.map((c) => (
            <button type="button" class="ui-btn" key={c.id} data-act="create" onClick={() => act(c.id)}>
              {`${ct(lang, c.profileKey)} · ${ct(lang, c.transportKey)} · ${c.animalKey ? ct(lang, c.animalKey) : t('ui.noAnimal')}`}
            </button>
          ))}
        </fieldset>
      )}
      {offer.stage !== 'create' && (
        <p class="ui-status" data-ui="where">{`${t('ui.here')}: ${ct(lang, offer.locationKey)} · ${t('ui.money')}: ${money(lang, offer.moneyCents)}`}</p>
      )}
      {offer.stage === 'ended' && <p class="ui-status" data-ui="ended" role="status">{t('ui.ended')}</p>}
      {offer.quests.map((q) => (
        <section class="ui-quest" data-ui="quest" key={q.key}>
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
      {offer.dialogue && (
        <section class="ui-dialogue" data-ui="dialogue" aria-live="polite">
          <h3>{offer.dialogue.speakerKey ? ct(lang, offer.dialogue.speakerKey) : t('ui.dialogue')}</h3>
          <p data-ui="line">{ct(lang, offer.dialogue.key)}</p>
          <div class="ui-answers">{offer.dialogue.answers.map(button)}</div>
        </section>
      )}
      {offer.actions.length > 0 && (
        <fieldset data-ui="actions">
          <legend>{t('ui.actions')}</legend>
          {offer.actions.map(button)}
        </fieldset>
      )}
      {offer.inventory.length > 0 && (
        <p class="ui-status" data-ui="inventory">{`${t('ui.inventory')}: ${offer.inventory.map((i) => `${ct(lang, i.key)}${i.qty > 1 ? ` ×${i.qty}` : ''}`).join(', ')}`}</p>
      )}
      <details class="ui-journal" data-ui="journal">
        <summary class="ui-btn">{t('ui.journal')}</summary>
        {offer.journal.length === 0
          ? <p>{t('ui.journalEmpty')}</p>
          : <ol>{offer.journal.map((e, i) => <li key={i} data-type={e.type}>{`${t(JR[e.type] ?? 'ui.journal')}${e.key ? `: ${ct(lang, e.key)}` : ''}`}</li>)}</ol>}
      </details>
      <button type="button" class="ui-btn" data-ui="story-close" onClick={close}>{t('ui.storyClose')}</button>
    </div>
  );
}
