// GAME-253: сторінка «щоденник» — мандрівник, навички, записи по днях. Лише показує знімок; нічого не рахує поза journal-model.
import { useState } from 'preact/hooks';
import { ct } from '../i18n/content';
import type { AnyLang, Key } from '../i18n';
import { groupByDay, JOURNAL_ICONS, JOURNAL_VISIBLE, SKILL_ICONS } from './journal-model';
import type { StoryOffer } from './story-types';

type T = (k: Key) => string;
const MAX_RANK = 5;

export function Bar({ pct, label }: { pct: number; label: string }) {
  const v = Math.max(0, Math.min(100, pct));
  return <div class="ui-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={v} aria-label={label}><span style={{ width: `${v}%` }} /></div>;
}

/** Картка «Мандрівник»: звання великим, смужка до наступного, XP · ОМ · наклейки значками. */
export function TravelerCard({ offer, lang, t }: { offer: StoryOffer; lang: AnyLang; t: T }) {
  const p = offer.progress;
  return (
    <section class="jb-card jb-traveler" data-ui="progress" data-xp={p.xp} data-om={p.om} data-title={p.title.index + 1} aria-label={t('ui.progress')}>
      <h3 class="jb-h">{t('ui.progress')}</h3>
      <p class="jb-rank" data-ui="title"><span class="jb-rank-label">{t('ui.title')}</span>{ct(lang, p.title.key)}</p>
      {p.title.nextKey
        ? <><Bar pct={Math.floor((p.title.into * 100) / p.title.span)} label={`${t('ui.titleNext')}: ${ct(lang, p.title.nextKey)}`} /><p class="jb-next">{`${t('ui.titleNext')}: ${ct(lang, p.title.nextKey)}`}</p></>
        : <p class="jb-next">{t('ui.titleMax')}</p>}
      <ul class="jb-stats">
        <li data-ui="stat-xp"><span class="jb-ico" data-icon="✨" aria-hidden="true" /><strong>{p.xp}</strong> {t('ui.xp')}</li>
        <li data-ui="stat-om"><span class="jb-ico" data-icon="🪙" aria-hidden="true" /><strong>{p.om}</strong> {t('ui.om')}</li>
        <li data-ui="stat-stickers"><span class="jb-ico" data-icon="🏷️" aria-hidden="true" /><strong>{`${offer.atlas.count}/${offer.atlas.total}`}</strong> {t('ui.journal.stickers')}</li>
      </ul>
    </section>
  );
}

/** «Навички»: вісім рядків — значок, назва, назва рангу, п'ять крапок рангу й підпис наступного. */
export function SkillsBook({ offer, lang, t }: { offer: StoryOffer; lang: AnyLang; t: T }) {
  return (
    <section class="jb-card jb-skills" data-ui="skills" aria-label={t('ui.skills')}>
      <h3 class="jb-h">{t('ui.skills')}</h3>
      <ul>
        {offer.progress.skills.map((s) => (
          <li key={s.id} data-ui="skill" data-skill={s.id} data-rank={s.rank} data-pct={s.pct}>
            <span class="jb-ico jb-ico-lg" data-icon={SKILL_ICONS[s.id] ?? '⭐'} aria-hidden="true" />
            <span class="jb-skill-main">
              <span class="ui-skill-head"><strong>{ct(lang, s.key)}</strong>{` · ${t('ui.skills.rank')} ${s.rank} — ${s.rankKey ? ct(lang, s.rankKey) : t('ui.skills.rank0')}`}</span>
              <span class="jb-pips" aria-hidden="true">{Array.from({ length: MAX_RANK }, (_, i) => <i key={i} data-on={i < s.rank ? 'yes' : 'no'} />)}</span>
              {!s.maxed && !s.mentor && <Bar pct={s.pct} label={`${ct(lang, s.key)}: ${s.pct} %`} />}
              {s.maxed && <span class="jb-note" data-ui="skill-note">{t('ui.skills.max')}</span>}
              {s.mentor && <span class="jb-note" data-ui="skill-note">{t('ui.skills.mentor')}</span>}
              {s.unlockKey && <span class="jb-note" data-ui="skill-next">{`${t('ui.skills.next')}: ${ct(lang, s.unlockKey)}`}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** «Записи»: дні від нового до старого з заголовком «День N»; довгий список згорнуто до останніх записів. */
export function EntriesBook({ offer, lang, t, labels }: { offer: StoryOffer; lang: AnyLang; t: T; labels: Readonly<Record<string, Key>> }) {
  const [all, setAll] = useState(false);
  const total = offer.journal.length;
  const days = groupByDay(offer.journal, all ? Infinity : JOURNAL_VISIBLE);
  return (
    <section class="jb-card jb-entries" data-ui="journal-log" aria-label={t('ui.journal')}>
      <h3 class="jb-h">{t('ui.journal.entries')}</h3>
      {total === 0 && <p class="jb-empty">{t('ui.journalEmpty')}</p>}
      {days.map((d) => (
        <div class="jb-day" key={d.day} data-day={d.day}>
          <h4>{`${t('ui.day')} ${d.day}`}</h4>
          <ol>
            {d.entries.map((e, i) => (
              <li key={i} data-type={e.type}>
                <span class="jb-ico" data-icon={JOURNAL_ICONS[e.type] ?? '📖'} aria-hidden="true" />
                <span>{`${t(labels[e.type] ?? 'ui.journal')}${e.key ? `: ${ct(lang, e.key)}` : ''}`}</span>
              </li>
            ))}
          </ol>
        </div>
      ))}
      {total > JOURNAL_VISIBLE && <button type="button" class="ui-btn" data-ui="journal-more" aria-expanded={all} onClick={() => setAll(!all)}>{all ? t('ui.journal.less') : t('ui.journal.more')}</button>}
    </section>
  );
}

/** Уся сторінка-щоденник: дві колонки в ландшафті, одна в портреті. */
export function JournalBook({ offer, lang, t, labels }: { offer: StoryOffer; lang: AnyLang; t: T; labels: Readonly<Record<string, Key>> }) {
  return (
    <div class="jb-book" data-ui="journal-book">
      <div class="jb-col"><TravelerCard offer={offer} lang={lang} t={t} /><SkillsBook offer={offer} lang={lang} t={t} /></div>
      <div class="jb-col"><EntriesBook offer={offer} lang={lang} t={t} labels={labels} /></div>
    </div>
  );
}
