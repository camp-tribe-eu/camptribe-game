// Підсумок дня (GAME-106): що сталось за день — лише факти з ядра, порожніх секцій немає. Дві дії: «Продовжити» (назад
// до мапи, день триває далі) і «Завершити сесію» (зберегти й вийти в паузу — гру можна закривати, прогрес на місці).
import { useEffect, useRef } from 'preact/hooks';
import { ct } from '../i18n/content';
import type { AnyLang, Key } from '../i18n';
import { trapTab } from './focus-trap';
import { money } from './StoryPanel';
import type { OfferSummary } from './story-types';

const TITLE: Readonly<Record<OfferSummary['sections'][number]['kind'], Key>> = {
  night: 'sum.night', packed: 'sum.packed', events: 'sum.events', quests: 'sum.quests', bought: 'sum.bought', got: 'sum.got', sold: 'sum.sold',
};

export function DaySummary({ summary, lang, t, onContinue, onEnd }: {
  summary: OfferSummary; lang: AnyLang; t: (k: Key) => string; onContinue: () => void; onEnd: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  // Фокус — на заголовок: екранний читач починає з «Підсумок дня N», далі Tab веде секціями до кнопок.
  useEffect(() => { root.current?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true }); }, [summary.day]);
  return (
    <div ref={root} class="ui-overlay ui-summary" role="dialog" aria-modal="true" aria-labelledby="ui-summary-title" data-ui="summary" data-day={summary.day}
      onKeyDown={(e) => { if (root.current) trapTab(e, root.current); }}>
      <h2 id="ui-summary-title" tabIndex={-1}>{`${t('sum.title')} ${summary.day}`}</h2>
      {/* Секції — сіткою: сторч одна колонка, лежачи (844×390) — дві-три, щоб кнопки не тікали далеко вниз. */}
      <div class="ui-summary-body">
        {/* GAME-181: «+45 XP · +15 ОМ» і «Наступного разу» — зверху, щоб у горизонтальній орієнтації були видні без прокрутки; пропущені дні нічого не забирають — рядок унизу. */}
        <p class="ui-summary-sec ui-summary-reward" data-ui="summary-reward" data-xp={summary.reward.xp} data-om={summary.reward.om}>
          {`${t('sum.reward')}: +${summary.reward.xp} ${t('ui.xp')}${summary.reward.om > 0 ? ` · +${summary.reward.om} ${t('ui.om')}` : ''}`}
        </p>
        <p class="ui-summary-sec" data-ui="summary-next">{`${t('sum.next')}: ${summary.nextKey ? ct(lang, summary.nextKey) : t('sum.nextEnded')}`}</p>
        {summary.sections.map((s) => (
          <section class="ui-summary-sec" data-ui="summary-section" data-kind={s.kind} key={s.kind}>
            <h3>{t(TITLE[s.kind])}</h3>
            <ul>{s.keys.map((k) => <li key={k} data-key={k}>{s.kind === 'night' ? t(k as Key) : ct(lang, k)}</li>)}</ul>
          </section>
        ))}
        {summary.money && (
          <p class="ui-summary-sec" data-ui="summary-money" data-start={summary.money.start} data-end={summary.money.end}>
            {`${t('sum.money')}: ${money(lang, summary.money.start)} → ${money(lang, summary.money.end)}`}
          </p>
        )}
        <p class="ui-summary-sec" data-ui="summary-safe">{t('sum.safe')}</p>
      </div>
      <div class="ui-summary-actions">
        <button type="button" class="ui-btn" data-ui="summary-continue" onClick={onContinue}>{t('sum.continue')}</button>
        <button type="button" class="ui-btn" data-ui="summary-end" onClick={onEnd}>{t('sum.endSession')}</button>
      </div>
    </div>
  );
}
