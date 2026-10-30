// Оболонка UI над канвою (GAME-25): пауза й налаштування. Preact, DOM — для кирилиці, масштабу тексту
// й екранного читача (TD-003).
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { mixer } from '../audio';
import { playUi, soundForButton } from '../audio/ui-sounds';
import { DEFAULT_SETTINGS, TEXT_SCALES, loadSettings, saveSettings, type Settings } from '../platform/settings';
import type { Credits, UiPort } from './port';
import { t as tr, type AnyLang, type Key } from '../i18n';
import { ct } from '../i18n/content';
import { StoryPanel, money } from './StoryPanel';
import { DaySummary } from './DaySummary';
import { DialogueBox } from './DialogueBox';
import { AtlasPanel } from './Atlas';
import { Intro } from './Intro';
import { trapTab } from './focus-trap';
import type { OfferSummary, StoryOffer } from './story-types';

/** Скільки тост-підказка висить на екрані (мс), якщо гравець нічого не зробив (GAME-95). Картка: ≤ 6 с. */
const TOAST_MS = 5000;
/** Скільки ігрових хвилин (≈ секунд живої гри) банер нового звання висить на мапі. */
const TITLE_UP_MIN = 6;

export function Shell({ port, langOverride, credits, build, holdToast = false, hideUi = [], intro: introOn = true }: { port: UiPort; langOverride?: AnyLang; credits: Credits; build: string; holdToast?: boolean; hideUi?: readonly string[]; intro?: boolean }) {
  const [paused, setPaused] = useState(false);
  // Підтвердження «Нової гри» (GAME-82): окремий діалог замість меню паузи; Escape — «Ні», а не закрити паузу.
  const [confirmNew, setConfirmNew] = useState(false);
  const noRef = useRef<HTMLButtonElement>(null);
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const resumeRef = useRef<HTMLButtonElement>(null);
  const [status, setStatus] = useState<Key | null>(null);
  const [codeOut, setCodeOut] = useState('');
  const [codeIn, setCodeIn] = useState('');
  const [staleCode, setStaleCode] = useState<string | null>(null);
  // Екран подорожі (GAME-32): поки відкритий, світ на паузі — як і в меню паузи.
  const [storyOpen, setStoryOpen] = useState(false);
  // Рамка розмови (GAME-179): розмова з NPC на мапі йде внизу екрана, а не екраном подорожі. Світ на паузі, поки вона відкрита.
  const [talk, setTalk] = useState(false);
  const [offer, setOffer] = useState<StoryOffer>(() => port.story());
  // GAME-182: вступ — замість підказки «Відкрий ☰, щоб почати»: персонажа ще немає → дощовий вечір, лист і перший вибір (хто вирушає), без ☰. Світ на паузі, поки вступ іде.
  // Сейв читається асинхронно: поки він не прочитаний, `create` ще не «нова гра» — вступ вирішуємо раз, на першому знімку ПІСЛЯ читання.
  const [intro, setIntro] = useState(false);
  const introChecked = useRef(false);
  const checkIntro = (): void => {
    if (introChecked.current || !port.loaded()) return;
    introChecked.current = true;
    if (introOn && port.story().stage === 'create') { setIntro(true); port.setPaused(true); }
  };
  useEffect(() => { checkIntro(); return port.onStory(() => { setOffer(port.story()); checkIntro(); }); }, []);
  const [atlasOpen, setAtlasOpen] = useState(false);
  // GAME-181: нове звання — маленьке свято: банер (назва + рядок родини) і звук підтвердження через єдиний мікшер. Банер не ловить дотики й гасне сам.
  // Гасне за ІГРОВИМ годинником (TITLE_UP_MIN хвилин, ≈ секунд живої гри): пауза й панелі його зупиняють — банер не зникає, поки його не видно; таймерів реального часу немає.
  const [titleUp, setTitleUp] = useState<{ index: number; at: number } | null>(null);
  useEffect(() => port.onReward((r) => { if (r.title !== null) { const o = port.story(); setTitleUp({ index: r.title, at: o.day * 1440 + o.timeMinutes }); playUi('confirm'); } }), []);
  // Підсумок дня (GAME-106): з'являється, коли ДІЯ гравця завершила день (daysEnded зріс саме на ній), а не при завантаженні
  // сейву вже завершеного дня — після «Завершити сесію» й перезавантаження гравець повертається на мапу, а не в підсумок.
  // Поки він відкритий, світ на паузі (як на екрані подорожі).
  const [summary, setSummary] = useState<OfferSummary | null>(null);
  const storyAct = (id: string): void => {
    const before = port.story().daysEnded;
    port.act(id);
    const after = port.story();
    if (after.daysEnded > before && after.summary) {
      setStoryOpen(false);   // екран подорожі ховається без відпускання паузи: підсумок тримає її далі
      setTalk(false);        // так само рамка розмови: розмова привела до кінця дня
      setSummary(after.summary);
    }
  };
  // «Продовжити»: назад до мапи — день іде далі (кінець Прологу: мапа жива, ☰ скаже, що далі).
  const summaryContinue = (): void => {
    setSummary(null);
    story(false);
  };
  // «Завершити сесію»: записати сейв і вийти в меню паузи з підтвердженням — гру можна закривати, прогрес на місці.
  const summaryEnd = (): void => {
    setSummary(null);
    setStoryOpen(false);
    setStatus(null);
    setPaused(true);
    port.setPaused(true);
    void port.save().then((ok) => setStatus(ok ? 'ui.sessionSaved' : 'ui.saveFailed'));
  };
  // Нагадування про код відновлення (GAME-94): тихий рядок після подорожі, не діалог — гра йде далі. Показ фіксуємо в
  // налаштуваннях одразу, як рядок з'явився: після перезавантаження про ту саму подорож він не повертається.
  const [remind, setRemind] = useState<{ trip: string; state: 'ask' | 'done' | 'manual'; code: string } | null>(null);
  // GAME-95: підказка — тост. Зникає через TOAST_MS або на першу дію гравця (дотик чи клавіша), але лише з екрана:
  // hintSeen лишається, поки гравець не відкрив ☰ чи паузу, тож після перезавантаження підказка повертається.
  const [toastGone, setToastGone] = useState(false);
  const toastLive = !settings.hintSeen && offer.stage === 'create' && !toastGone && !introOn;
  useEffect(() => {
    if (!toastLive) return;
    const done = (): void => setToastGone(true);
    const timer = holdToast ? undefined : setTimeout(done, TOAST_MS);   // holdToast — лише e2e (test-switches.ts)
    window.addEventListener('pointerdown', done);
    window.addEventListener('keydown', done);
    return () => { clearTimeout(timer); window.removeEventListener('pointerdown', done); window.removeEventListener('keydown', done); };
  }, [toastLive]);
  const lang: AnyLang = langOverride ?? settings.language;
  const t = (key: Key): string => tr(lang, key);

  // Перша дія (GAME-83): відкрито ☰ чи паузу — підказка «Відкрий ☰» більше не потрібна, і не повернеться після
  // перезавантаження. Зберігаємо в налаштуваннях (не в сейві): схема сейву не змінюється.
  const acted = (): void => { if (!settings.hintSeen) update({ ...settings, hintSeen: true }); };
  // Фокус — грі (#stage з підписом), коли закривається накладка: екран подорожі, підсумок дня, пауза (GAME-98). Інакше кнопка
  // зникає разом із накладкою і фокус падає на <body>: читач губить місце. Кадр затримки — щоб #stage уже не був під накладкою.
  const focusStage = (): void => { requestAnimationFrame(() => { if (document.activeElement === document.body) document.getElementById('stage')?.focus(); }); };
  const toggle = (next: boolean): void => {
    if (next) acted();
    setPaused(next);
    port.setPaused(next);
    // GAME-98: пауза закрилась («Продовжити», Escape) — фокус грі, як після екрана подорожі, а не на <body>.
    if (!next) focusStage();
  };
  // Підтверджено: порт чистить гру; далі — екран подорожі, а там вибір персонажа (гри без гравця на мапі немає).
  const startNew = (): void => {
    setConfirmNew(false);
    setStatus(null);
    setCodeOut('');
    setCodeIn('');
    void port.newGame().then((ok) => {
      // Запис не вдався — лишаємо меню паузи відкритим, щоб повідомлення було видно (рецензія PR #17).
      if (!ok) { setStatus('ui.newGameFailed'); return; }
      // commandId — лічильник (c1, c2…): у новій грі той самий маршрут дає той самий id приїзду, і старе «нагадано»
      // мовчки з'їло б перше нагадування нової гри (рецензія PR #44).
      setRemind(null);
      if (settings.remindedTrip !== null) update({ ...settings, remindedTrip: null });
      setPaused(false);
      if (introOn) { setIntro(true); port.setPaused(true); } else story(true);
    });
  };
  const story = (open: boolean): void => {
    if (open) acted();
    setStoryOpen(open);
    // Фокус повертається грі (#stage з підписом), а не на ☰: Space — клавіша дії в сцені, і сфокусована ☰
    // перехоплювала б її (знайдено e2e розмови з Елізою на мапі). ☰ лишається досяжною Tab.
    if (!open) focusStage();
    if (open) { setOffer(port.story()); void port.staleCode().then(setStaleCode); }
    port.setPaused(open);
  };

  // GAME-179: заговорили з NPC на мапі. Ядро прийняло розмову — рамка внизу; не прийняло (NPC не тут, ще закритий) — екран подорожі, де видно чому.
  useEffect(() => port.onTalk(() => {
    if (paused || storyOpen || talk) return;
    const now = port.story();
    if (!now.dialogue) { story(true); return; }
    acted();
    setOffer(now);
    setTalk(true);
    port.setPaused(true);
  }), [paused, storyOpen, talk]);
  // Розмова скінчилась (остання репліка прийнята) — рамка зникає, світ іде далі.
  useEffect(() => {
    if (!talk || offer.dialogue) return;
    setTalk(false);
    port.setPaused(false);
    focusStage();
  }, [talk, offer]);

  // Розмова з NPC на мапі відкриває екран подорожі (якщо не відкрите меню паузи).
  useEffect(() => port.onOpenStory(() => { if (!paused && !storyOpen) story(true); }), [paused, storyOpen]);

  // GAME-40: звук натискання кнопки UI — один делегований слухач (капча), а не виклик у кожному обробнику; вибір звуку — soundForButton.
  useEffect(() => {
    const onClick = (e: MouseEvent): void => {
      const b = e.target instanceof Element ? e.target.closest('button') : null;
      if (!b || !b.closest('#ui') || b.getAttribute('aria-disabled') === 'true' || (b as HTMLButtonElement).disabled) return;
      playUi(soundForButton(b.dataset.ui));
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  // useLayoutEffect: слухач Escape має бачити confirmNew до наступного кадру (інакше швидкий Escape закривав паузу).
  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.code !== 'Escape' || intro) return;   // у вступі Escape = «Пропустити» (Intro.tsx)
      e.preventDefault();
      if (atlasOpen) { playUi('back'); closeAtlas(); return; }
      if (confirmNew || summary || talk || storyOpen || paused) playUi('back');   // Escape закрив/скасував — «назад»; відкриття паузи звуку не має
      if (confirmNew) setConfirmNew(false); else if (summary) summaryContinue(); else if (talk) { if (offer.dialogue?.ui) storyAct(offer.dialogue.answers.find((a) => a.kind === 'cancel')?.id ?? ''); else if (!offer.mapFirst) { setTalk(false); story(true); } /* GAME-185: у мапі-першій Escape не відкриває ☰ з відповідями розмови — рамка лишається */ } else if (storyOpen) story(false); else toggle(!paused);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paused, storyOpen, confirmNew, summary, talk, intro, atlasOpen]);

  // GAME-182: Атлас із ☰ — окрема накладка (світ лишається на паузі); закрили — назад на екран подорожі.
  const openAtlas = (): void => { setOffer(port.story()); setStoryOpen(false); setAtlasOpen(true); };
  const closeAtlas = (): void => { setAtlasOpen(false); story(true); };
  const endIntro = (): void => { setIntro(false); port.setPaused(false); acted(); focusStage(); };

  // Фокус — у діалог, щоб клавіатура й екранний читач починали з «Продовжити».
  useEffect(() => {
    if (paused && !confirmNew) resumeRef.current?.focus();
    if (paused && confirmNew) noRef.current?.focus();
    // Відкладений застарілий сейв — питаємо при кожному відкритті меню (старт міг завершитись пізніше).
    if (paused) void port.staleCode().then(setStaleCode);
  }, [paused, confirmNew]);

  // Зберігаємо одразу в обробнику, а не в ефекті: ефект Preact відкладено до після малювання, і зміна
  // мови перед закриттям вкладки (чи reload у e2e на CI) губилась — сторінка встигала піти раніше.
  const update = (next: Settings): void => {
    setSettings(next);
    saveSettings(next);
    mixer.apply(next.audio);
  };

  // До малювання (useLayoutEffect): екранний читач не застає кнопки без підпису (рецензія).
  useLayoutEffect(() => {
    document.documentElement.style.fontSize = `${settings.textScale}%`;
    document.documentElement.lang = settings.language;
    document.getElementById('stage')?.setAttribute('aria-label', t('ui.stage'));
    // Дотикові кнопки сцени (src/view/world/touch.ts) — підписи мовою гравця, а не id дії англійською.
    const TOUCH: Readonly<Record<string, Key>> = { stick: 'touch.stick', interact: 'touch.interact' };
    for (const b of document.querySelectorAll<HTMLElement>('.touch [data-touch]')) {
      const k = TOUCH[b.dataset.touch ?? ''];
      if (k) b.setAttribute('aria-label', t(k));
    }
  }, [settings]);

  useEffect(() => {
    const trip = offer.lastTrip;
    if (paused || storyOpen || talk || summary || offer.stage === 'create' || trip === null || trip === settings.remindedTrip || remind?.trip === trip) return;
    setRemind({ trip, state: 'ask', code: '' });
    update({ ...settings, remindedTrip: trip });
  }, [paused, storyOpen, talk, summary, offer, settings.remindedTrip]);
  const copyCode = (): void => {
    void port.exportCode().then(async (code) => {
      try {
        await navigator.clipboard.writeText(code);
        setRemind((r) => r && { ...r, state: 'done' });
      } catch {
        setRemind((r) => r && { ...r, state: 'manual', code });   // буфер недоступний (дозвіл, не-HTTPS) — показуємо код
      }
    }).catch(() => setRemind((r) => r && { ...r, state: 'manual', code: '' }));   // код не зібрано — хоч не мовчимо
  };
  const reminder = remind && remind.trip === offer.lastTrip && !paused && !storyOpen && !talk && !summary && (
    <div class="ui-reminder" data-ui="recovery-reminder" role="status">
      <span data-ui="recovery-text">{t(remind.state === 'done' ? 'ui.remind.done' : remind.state === 'manual' ? 'ui.remind.manual' : 'ui.remind.text')}</span>
      {remind.state === 'manual' && <textarea class="ui-code" data-ui="recovery-code" readOnly rows={2} aria-label={t('ui.exportCode')} value={remind.code}
        onFocus={(e) => (e.currentTarget as HTMLTextAreaElement).select()} />}
      {remind.state !== 'done' && <button type="button" class="ui-btn" data-ui="recovery-copy" onClick={copyCode}>{t('ui.remind.copy')}</button>}
      <button type="button" class="ui-btn" data-ui="recovery-close" onClick={() => setRemind(null)}>{t('ui.remind.close')}</button>
    </div>
  );

  // Відкладений сейв: і в меню паузи, і на екрані подорожі (туди гравець іде першим), доки не сховає.
  const staleNotice = staleCode && (
    <p class="ui-status" data-ui="stale" role="status">
      {t('ui.staleSave')}
      <textarea class="ui-code" data-ui="stale-code" readOnly rows={3} aria-label={t('ui.staleSave')} value={staleCode}
        onFocus={(e) => (e.currentTarget as HTMLTextAreaElement).select()} />
      <button type="button" class="ui-btn" data-ui="stale-dismiss"
        onClick={() => { void port.dismissStale().then((ok) => { if (ok) setStaleCode(null); else setStatus('ui.saveFailed'); }); }}>{t('ui.staleDismiss')}</button>
    </p>
  );

  // HUD (GAME-83): де ти, день і час, гроші. Лежить над полем гри, а не на ньому (див. #app у index.html).
  const hh = String(Math.floor(offer.timeMinutes / 60)).padStart(2, '0');
  const mm = String(offer.timeMinutes % 60).padStart(2, '0');
  const showHint = !settings.hintSeen && offer.stage === 'create';
  // Банер — лише на мапі (не поверх екрана подорожі, паузи чи підсумку дня) і лише поки не минуло TITLE_UP_MIN ігрових хвилин.
  const sinceUp = titleUp ? offer.day * 1440 + offer.timeMinutes - titleUp.at : -1;
  const titleUpShown = titleUp !== null && sinceUp >= 0 && sinceUp < TITLE_UP_MIN && !paused && !storyOpen && !summary;
  const goalShown = offer.stage !== 'create' && (offer.goal !== null || offer.stage === 'ended') && !hideUi.includes('goal');
  const trackerShown = offer.stage !== 'create' && offer.requests.length > 0 && !hideUi.includes('requests');
  const nextShown = offer.stage !== 'create' && (offer.hint.near || offer.hint.next || offer.hint.backpack > 0) && !hideUi.includes('next');
  const portrait = (id: string | null, sprite?: boolean) => port.portrait(id, sprite);

  return (
    <>
      {/* GAME-91: шапка — ☰ ліворуч, ‖ праворуч, текст (HUD) між ними. Усе в одному ряду потоку, а не абсолютом: кнопки
          ніколи не лежать на тексті, при 200 % текст переноситься в середній колонці. Під діалогом шапки немає: дані HUD є
          в самому діалозі, а схована смуга під ним збивала вимірювання контрасту (axe). */}
      {!paused && !storyOpen && !talk && !summary && !intro && !atlasOpen && <header class="ui-header">
        <button type="button" class="ui-story-btn" data-hint={showHint || offer.stage === 'ended' ? 'yes' : undefined} data-touch="story" aria-label={t('ui.story')} onClick={() => story(true)}>{'☰'}</button>
        <div class="ui-hud" data-ui="hud" role="group" aria-label={t('ui.hud')}>
          <span data-ui="hud-place">{offer.locationKey ? ct(lang, offer.locationKey) : t('ui.noPlace')}</span>
          <span class="ui-hud-line"><span data-ui="hud-time">{`${t('ui.day')} ${offer.day}, ${hh}:${mm}`}</span>{' · '}<span data-ui="hud-money">{money(lang, offer.moneyCents)}</span></span>
          {/* GAME-92: підказка — окремий рядок знизу; місце й «день · гроші» над нею не рухаються (див. .ui-hint в index.html). */}
          {toastLive && <span class="ui-toast" data-ui="hint" role="status">{t('ui.hint')}</span>}
          {/* GAME-89 №6: кампанія завершена — мапа лишається живою (можна ходити), але про кінець видно й поза ☰. */}
          {offer.stage === 'ended' && <span class="ui-hint" data-ui="ended-hint" role="status">{t('ui.endedHint')}</span>}
        </div>
        <button type="button" class="ui-pause-btn" data-touch="pause" aria-label={t('ui.pause')} onClick={() => toggle(true)}>{'‖'}</button>
        {/* GAME-170 зріз 2: картка поточної мети — жива хвиля напруги: «назва · зроблено/усього» і хвилини ІГРОВОГО часу на кожну справу
            (з годинника ядра: пауза й панелі його зупиняють — і числа стоять). Окремий ряд сітки під ☰ · HUD · ‖, тож кнопок не торкається. */}
        {offer.wave && !hideUi.includes('wave') && <div class="ui-wave" data-ui="wave" data-done={offer.wave.done} data-total={offer.wave.total} role="group" aria-label={t('ui.wave')}>
          <span class="ui-wave-title" data-ui="wave-title">{`${ct(lang, offer.wave.titleKey)} · ${offer.wave.done}/${offer.wave.total}`}</span>
          <span class="ui-wave-tasks">
            {offer.wave.tasks.map((tk) => (
              <span class="ui-wave-task" key={tk.id} data-ui="wave-task" data-task={tk.id} data-outcome={tk.outcome} data-remaining={tk.remainingMin} title={ct(lang, tk.textKey)}>
                {t(`ui.wave.task.${tk.id}` as Key)}{' '}{tk.outcome === 'open' ? `${tk.remainingMin} ${t('ui.wave.min')}` : t(`ui.wave.${tk.outcome}` as Key)}
              </span>
            ))}
          </span>
        </div>}
        {/* GAME-175: рядок «Далі: …» — куди йти зараз (мапа першою, а не панель); біля об'єкта міняється на підпис дії («● Сісти в авто»). Один рядок
            у шапці під ☰ · HUD · ‖; тост-підказка про ☰ (GAME-95) його не заступає — вона лише на екрані вибору героя, де цього рядка немає. */}
        {/* GAME-181: ОДНА коротка поточна ціль (крок головного квесту) — завжди на екрані, обидві орієнтації. Лежить ВГОРІ смуги під шапкою, а «Далі: …» (GAME-175) — під нею:
            дві підказки одна на одній не стоять (картка мети — у потоці шапки вище). Не ловить дотик. */}
        {(goalShown || nextShown || trackerShown) && (
          <div class="ui-strip">
            {goalShown && <div class="ui-goal" data-ui="goal" data-ended={offer.stage === 'ended' ? 'yes' : undefined}>{`${t('ui.goal')}: ${offer.goal ? ct(lang, offer.goal.key) : t('ui.goal.ended')}`}</div>}
            {/* GAME-180: трекер прийнятих прохань — «Сміття 2/3» (окремий рядок смуги: ціль · трекер · «Далі»); стрілка на мапі веде до наступної цілі, а коли все зроблено — до просильника. */}
            {trackerShown && (
              <div class="ui-reqs" data-ui="req-tracker" role="group" aria-label={t('ui.req.tracker')}>
                {offer.requests.map((r) => (
                  <span class="ui-req-row" key={r.id} data-ui="req-row" data-request={r.id} data-done={r.done} data-total={r.total} data-ready={r.ready ? 'yes' : 'no'}>{`${ct(lang, r.trackKey)} ${r.done}/${r.total}`}</span>
                ))}
              </div>
            )}
            {offer.hint.blocked && (
              <div class="ui-next" data-ui="depart-hint" role="status">
                {offer.hint.blocked.carry ? t('depart.carry') : `${t('depart.missing')} ${offer.hint.blocked.itemKeys.map((k) => ct(lang, k)).join(', ')}`}
              </div>
            )}
            {nextShown && (
              <div class="ui-next" data-ui="next-hint" data-kind={offer.hint.near ? 'near' : 'next'} data-spot={offer.hint.near ? undefined : offer.hint.nextSpot ?? undefined}>
                {offer.hint.near
                  ? `● ${t(offer.hint.near.label)}${offer.hint.near.itemKey ? ` ${ct(lang, offer.hint.near.itemKey)}` : ''}`
                  : `${offer.hint.next ? `${t('ui.next')} ${t(offer.hint.next as Key)}` : ''}`}
                {offer.hint.backpack > 0 && <span data-ui="backpack">{` · ${t('ui.backpack')}: ${offer.hint.backpack}`}</span>}
              </div>
            )}
          </div>
        )}
        {reminder}
      </header>}
      {titleUpShown && titleUp && (
        <div class="ui-titleup" data-ui="title-up" data-title={titleUp.index + 1} role="status">
          <strong>{`${t('ui.titleUp')}: ${ct(lang, `title.${titleUp.index + 1}`)}`}</strong>
          <span>{ct(lang, `title.${titleUp.index + 1}.family`)}</span>
        </div>
      )}
      {storyOpen && <StoryPanel offer={offer} lang={lang} t={t} act={storyAct} close={() => story(false)} portrait={portrait} settings={() => { setStoryOpen(false); toggle(true); }} footer={offer.stage !== 'create' && <button type="button" class="ui-btn" data-ui="atlas-open" onClick={openAtlas}>{`${t('ui.atlas')}: ${offer.atlas.count}/${offer.atlas.total}`}</button>}>{staleNotice}</StoryPanel>}
      {atlasOpen && <AtlasPanel atlas={offer.atlas} lang={lang} t={t} close={closeAtlas} />}
      {intro && <Intro offer={offer} lang={lang} t={t} act={storyAct} portrait={portrait} onDone={endIntro} />}
      {talk && !paused && !storyOpen && !summary && offer.dialogue && <DialogueBox dialogue={offer.dialogue} lang={lang} t={t} act={storyAct} portrait={portrait} />}
      {summary && !paused && <DaySummary summary={summary} lang={lang} t={t} onContinue={summaryContinue} onEnd={summaryEnd} />}
      {paused && confirmNew && (
        <div class="ui-overlay" role="dialog" aria-modal="true" aria-label={t('ui.newGame')} data-ui="confirm-new" onKeyDown={(e) => trapTab(e, e.currentTarget)}>
          <h2>{t('ui.newGame')}</h2>
          <p data-ui="confirm-new-text">{t('ui.newGameAsk')}</p>
          <button type="button" class="ui-btn" data-ui="confirm-new-no" ref={noRef} onClick={() => setConfirmNew(false)}>{t('ui.newGameNo')}</button>
          <button type="button" class="ui-btn" data-ui="confirm-new-yes" onClick={startNew}>{t('ui.newGameYes')}</button>
        </div>
      )}
      {paused && !confirmNew && (
        <div class="ui-overlay" role="dialog" aria-modal="true" aria-label={t('ui.paused')} data-ui="pause" onKeyDown={(e) => trapTab(e, e.currentTarget)}>
          <h2>{t('ui.paused')}</h2>
          <button type="button" class="ui-btn" data-ui="resume" ref={resumeRef} onClick={() => toggle(false)}>{t('ui.resume')}</button>
          <fieldset>
            <legend>{t('ui.textSize')}</legend>
            {TEXT_SCALES.map((v) => (
              <button type="button" class="ui-btn" data-ui={`text-${v}`} aria-pressed={settings.textScale === v}
                onClick={() => update({ ...settings, textScale: v })}>{v}%</button>
            ))}
          </fieldset>
          <fieldset>
            <legend>{t('ui.language')}</legend>
            {(['uk', 'en'] as const).map((l) => (
              <button type="button" class="ui-btn" data-ui={`lang-${l}`} aria-pressed={settings.language === l}
                onClick={() => update({ ...settings, language: l })}>{l.toUpperCase()}</button>
            ))}
          </fieldset>
          <fieldset data-ui="audio">
            <legend>{t('ui.audio')}</legend>
            {(['master', 'sfx', 'music'] as const).map((ch) => (
              <label key={ch}>{t(ch === 'master' ? 'ui.volMaster' : ch === 'sfx' ? 'ui.volSfx' : 'ui.volMusic')}
                <input type="range" min="0" max="100" step="5" data-ui={`vol-${ch}`} value={Math.round(settings.audio[ch] * 100)}
                  onInput={(e) => update({ ...settings, audio: { ...settings.audio, [ch]: Number(e.currentTarget.value) / 100 } })} />
              </label>
            ))}
            <button type="button" class="ui-btn" data-ui="mute" aria-pressed={settings.audio.muted}
              onClick={() => update({ ...settings, audio: { ...settings.audio, muted: !settings.audio.muted } })}>{t('ui.mute')}</button>
          </fieldset>
          {staleNotice}
          <fieldset>
            <legend>{t('ui.saveGroup')}</legend>
            <button type="button" class="ui-btn" data-ui="save"
              onClick={() => { void port.save().then((ok) => { setStatus(ok ? 'ui.saved' : 'ui.saveFailed'); if (ok) playUi('confirm'); }); }}>{t('ui.save')}</button>
            <button type="button" class="ui-btn" data-ui="code-export"
              onClick={() => { void port.exportCode().then(setCodeOut); }}>{t('ui.exportCode')}</button>
            {codeOut && <textarea class="ui-code" data-ui="code-out" readOnly rows={3} aria-label={t('ui.exportCode')} value={codeOut}
              onFocus={(e) => (e.currentTarget as HTMLTextAreaElement).select()} />}
            <textarea class="ui-code" data-ui="code-in" rows={3} aria-label={t('ui.importCode')} placeholder={t('ui.importCode')}
              value={codeIn} onInput={(e) => setCodeIn((e.currentTarget as HTMLTextAreaElement).value)} />
            <button type="button" class="ui-btn" data-ui="code-apply"
              onClick={() => { void port.importCode(codeIn).then((r) => setStatus(({ ok: 'ui.importOk', bad: 'ui.importBad', outdated: 'ui.importOutdated', newer: 'ui.importNewer', unsaved: 'ui.importUnsaved' } as const)[r])); }}>{t('ui.apply')}</button>
            {status && <p class="ui-status" data-ui="status" role="status">{t(status)}</p>}
          </fieldset>
          <fieldset>
            <legend>{t('ui.gameMenu')}</legend>
            <button type="button" class="ui-btn" data-ui="new-game" onClick={() => setConfirmNew(true)}>{t('ui.newGame')}</button>
            <button type="button" class="ui-btn" data-ui="reset" onClick={() => update({ ...DEFAULT_SETTINGS, hintSeen: settings.hintSeen, remindedTrip: settings.remindedTrip })}>{t('ui.reset')}</button>
          </fieldset>
          {/* GAME-91: підпис збірки (версія + повний SHA) — тут, а не на екрані гри; для баг-репортів. */}
          <p class="ui-build" data-ui="build">{build}</p>
          {/* Титри обов'язкові (OD-013): автор, джерело, ліцензія і чи змінено — для кожного файлу графіки. */}
          <details class="ui-credits" data-ui="credits">
            <summary class="ui-btn">{t('ui.credits')}</summary>
            <p>{t('ui.creditsIntro')}</p>
            <ul>
              {credits.files.map((f) => (
                <li data-credit={f.file} key={f.file}>
                  <span class="ui-credit-file">{f.file}</span>
                  <span class="ui-credit-authors">{f.authors.join(', ')}</span>
                  <span class="ui-credit-links">
                    {/* Ліцензія без посилання — видно в e2e (кожна має бути посиланням), а не порожній href. */}
                    {credits.licences[f.licence]
                      ? <a href={credits.licences[f.licence]?.url ?? ''} target="_blank" rel="noopener noreferrer" data-licence={f.licence}>{f.licence}</a>
                      : <span data-licence-missing={f.licence}>{f.licence}</span>}
                    {' · '}
                    {f.sources.map((src, i) => <>{i > 0 && ', '}<a href={src} target="_blank" rel="noopener noreferrer">{`${t('ui.creditsSource')} ${i + 1}`}</a></>)}
                    {' · '}
                    {f.modified === 'no' ? t('ui.creditsUnmodified') : f.modified}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </>
  );
}
