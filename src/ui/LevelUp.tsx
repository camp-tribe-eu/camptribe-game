// Екран «Що відкрилось» (GAME-229): нові ранги навичок наприкінці дня, ПЕРЕД підсумком (порядок — overlay-order.ts). Урочисто, без цифр досвіду:
// назва навички, звання рангу й що це відкриває (рядки content/locales `skill.<напрям>.r<N>` / `.unlock` — ті самі, що в ☰). Без покарань і порівнянь.
// Фанфара — через єдиний аудіомодуль (sfx), один раз на показ; кнопка «Далі» веде до підсумку дня.
import { useEffect, useRef } from 'preact/hooks';
import { ct } from '../i18n/content';
import type { AnyLang, Key } from '../i18n';
import { sfx } from '../audio/sfx';
import { trapTab } from './focus-trap';
import { collapseUps, type SkillUp } from './overlay-order';
import { revealDelay } from './summary-reveal';

export function LevelUp({ ups, lang, t, onContinue }: { ups: readonly SkillUp[]; lang: AnyLang; t: (k: Key) => string; onContinue: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  // Фокус — на заголовок (екранний читач починає з «Нові вміння»); фанфара раз за показ.
  useEffect(() => { root.current?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true }); sfx('fanfare'); }, []);
  return (
    <div ref={root} class="ui-overlay ui-levelup" role="dialog" aria-modal="true" aria-labelledby="ui-levelup-title" data-ui="levelup" data-count={ups.length}
      onKeyDown={(e) => { if (root.current) trapTab(e, root.current); }}>
      <h2 id="ui-levelup-title" tabIndex={-1}>{t('lvl.title')}</h2>
      <ul class="ui-levelup-list">
        {collapseUps(ups).map((u, i) => (
          <li key={u.skill} class="ui-levelup-item" data-ui="levelup-item" data-skill={u.skill} data-rank={u.rank} style={{ '--rv-delay': revealDelay(i) }}>
            <strong>{`${ct(lang, u.skill)} · ${t('ui.skills.rank')} ${u.rank} — ${ct(lang, `${u.skill}.r${u.rank}`)}`}</strong>
            <span class="ui-levelup-opened">{`${t('lvl.opened')}: ${u.ranks.map((r) => ct(lang, `${u.skill}.r${r}.unlock`)).join(' · ')}`}</span>
          </li>
        ))}
      </ul>
      <div class="ui-summary-actions">
        <button type="button" class="ui-btn" data-ui="levelup-continue" onClick={onContinue}>{t('lvl.continue')}</button>
      </div>
    </div>
  );
}
