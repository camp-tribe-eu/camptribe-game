// Вступ (GAME-182, brain/Сценарій/scenario.md §1): дощовий вечір удома, Метью знаходить атлас дідуся Генрі й лист у ньому. Перший вибір гравця — хто вирушає
// в дорогу — стоїть на четвертому кроці (три дотики), без ☰. Решта — короткі родинні репліки й сторінка Атласу, на яку лягає перша наклейка «Дім» (звук «дзинь»).
// Кожен крок пропускається («Пропустити»: до вибору героя — вибір усе одно лишається; після нього — одразу на мапу). Світ на паузі, поки вступ іде (Shell).
// Тексти — src/i18n (intro.*); таймерів реального часу немає — рядки йдуть за дотиком, друк не потрібен.
import { useEffect, useRef, useState } from 'preact/hooks';
import { setIntroOpen } from '../audio';
import { playUi } from '../audio/ui-sounds';
import { ct } from '../i18n/content';
import type { AnyLang, Key } from '../i18n';
import { AtlasMapPage } from './Atlas';
import { iconRects } from './atlas-icons';
import { Portrait, type PortraitLookup } from './Portrait';
import type { IntroRoomPainter } from './port';
import type { StoryOffer } from './story-types';
import { calmMotion } from '../platform/motion';
import { sfx } from '../audio/sfx';
import { INTRO_STEPS, INTRO_STEPS_TO_PICK, afterPick, skipTarget, type Step } from '../content/intro-story';

/** Розкадровка — чиста модель intro-story.ts; тут лише малювання кроків. */
export { INTRO_STEPS_TO_PICK };

function Book() {
  return (
    <svg class="ui-intro-book" viewBox="0 0 8 8" aria-hidden="true" focusable="false">
      {iconRects('atlas').map((r) => <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width="1" height="1" fill={r.fill} />)}
    </svg>
  );
}

/** Тло вступу: кімната з вікном і дощем (intro-room.ts). Розмір береться з вікна й перемальовується при зміні орієнтації. */
function Room({ paint, morning }: { paint: IntroRoomPainter | undefined; morning: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState(() => `${window.innerWidth}x${window.innerHeight}`);
  useEffect(() => {
    const on = (): void => setSize(`${window.innerWidth}x${window.innerHeight}`);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el || !paint) return undefined;
    let dead = false;
    let stop: () => void = () => undefined;
    const [w, h] = size.split('x').map(Number) as [number, number];
    const reduced = calmMotion();
    paint(el, w, h, reduced, () => dead, morning).then((s) => { if (dead) s(); else stop = s; }, () => undefined);
    return () => { dead = true; stop(); };
  }, [size, morning]);
  return <canvas ref={ref} class="ui-intro-room" data-ui="intro-room" aria-hidden="true" />;
}

const SPOTS = ['drawer', 'box', 'shelf'] as const;
type Spot = (typeof SPOTS)[number];

export function Intro({ offer, lang, t, act, portrait, room, onDone }: { room?: IntroRoomPainter | undefined; offer: StoryOffer; lang: AnyLang; t: (k: Key) => string; act: (id: string) => void; portrait: PortraitLookup; onDone: () => void }) {
  const [i, setI] = useState(0);
  const [seen, setSeen] = useState<Spot | null>(null);
  const skipped = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const steps = INTRO_STEPS;
  const step = steps[Math.min(i, steps.length - 1)] as Step;
  const created = offer.stage !== 'create';
  const morning = step.phase === 'morning';
  // Герой обраний (вибір зроблено тут чи гра вже мала персонажа) — крок вибору проминуто; якщо вступ пропущено — одразу на ранок.
  useEffect(() => { if (step.kind === 'pick' && created) setI(afterPick(skipped.current)); }, [step.kind, created]);
  // Фокус — на кнопку «далі» (або на першу відповідь вибору): клавіатура й екранний читач починають із неї.
  useEffect(() => { root.current?.querySelector<HTMLElement>('[data-ui="intro-next"], [data-ui="atlas-cta"], [data-act="create"], [data-ui="intro-spot"]')?.focus({ preventScroll: true }); }, [i]);
  // Дощ за вікном і шум — лише вночі (GAME-194); вранці дощ стих. Наклейка «Дім» влітає зі звуком «дзинь»; будильник — дзвіночок (існуючий sfx, без нового синтезу).
  useEffect(() => { setIntroOpen(!morning); return () => setIntroOpen(false); }, [morning]);
  useEffect(() => { if (step.kind === 'atlas') playUi('confirm'); if (step.kind === 'morning') sfx('chime'); }, [step.kind]);
  // Дотик двічі за мить не пропускає два кроки: пауза між кроками за event.timeStamp (без таймерів).
  const last = useRef(Number.NEGATIVE_INFINITY);
  const go = (e: Event, fn: () => void): void => {
    if (e.timeStamp - last.current < 250) return;
    last.current = e.timeStamp;
    fn();
  };
  const next = (e: Event): void => go(e, () => { if (i >= steps.length - 1) onDone(); else setI(i + 1); });
  const skip = (e: Event): void => go(e, () => {
    skipped.current = true;
    const to = skipTarget(i, created);
    if (to === null) onDone(); else setI(to);
  });
  // Escape = «Пропустити». Слухач один на весь вступ і кличе найсвіжіший `skip` (через ref): інакше між дотиком і перемальовкою він бачив би застарілий крок.
  const skipRef = useRef(skip);
  skipRef.current = skip;
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); skipRef.current(e); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // Атлас — ОДНА головна кнопка дії (GAME-250): веде до родинної розмови про першу поїздку; «Пропустити вступ» лишається вторинною вгорі.
  const nextBtn = step.kind === 'atlas'
    ? <button type="button" class="ui-btn ui-amap-cta" data-ui="atlas-cta" data-cta="primary" onClick={next}>{t('atlas.cta.plan')}</button>
    : <button type="button" class="ui-btn" data-ui="intro-next" onClick={next}>{step.kind === 'goal' ? t('intro.go') : t('ui.continue')}</button>;
  const who = step.kind === 'line' || step.kind === 'pick' ? step.who : step.kind === 'search' ? null : null;
  const name = who ? ct(lang, who) : t('ui.narrator');
  const spotTap = (e: Event, sp: Spot): void => go(e, () => { if (sp === 'shelf') { setSeen(null); setI(i + 1); } else setSeen(sp); });
  const talkLine = step.kind === 'search' ? (seen ? t(`intro.spot.${seen}.line` as Key) : t(step.text as Key)) : step.text ? t(step.text) : '';
  return (
    <div ref={root} class="ui-intro" data-ui="intro" data-step={i} data-kind={step.kind} data-phase={step.phase} role="dialog" aria-modal="true" aria-label={t('ui.story')}>
      <Room paint={room} morning={morning} />
      {step.kind !== 'pick' && <button type="button" class="ui-btn ui-intro-skip" data-ui="intro-skip" onClick={skip}>{t('intro.skip')}</button>}
      {step.kind === 'letter' && (
        <div class="ui-intro-stage">
          <article class="ui-letter" data-ui="letter">
            <h2 class="ui-letter-from">{t('intro.letter.from')}</h2>
            <p>{t('intro.letter.1')}</p>
            <p data-ui="letter-quote">{t('intro.letter.2')}</p>
            {nextBtn}
          </article>
        </div>
      )}
      {step.kind === 'atlas' && (
        <div class="ui-intro-stage">
          <div class="ui-intro-atlas">
            <AtlasMapPage atlas={offer.atlas} t={t} mode="intro" fly>{nextBtn}</AtlasMapPage>
          </div>
        </div>
      )}
      {step.kind === 'night' && (
        <div class="ui-intro-black" data-ui="intro-night">
          <p class="ui-intro-cap" data-ui="intro-caption">{t('intro.night')}</p>
          <p class="ui-intro-zzz" aria-hidden="true">{t('intro.zzz')}</p>
          {nextBtn}
        </div>
      )}
      {step.kind === 'morning' && (
        <div class="ui-intro-stage ui-intro-wake">
          <div class="ui-intro-black ui-intro-dawn" data-ui="intro-morning">
            <p class="ui-intro-cap" data-ui="intro-caption">{t('intro.morning')}</p>
            <p class="ui-intro-alarm" data-ui="intro-alarm">{t('intro.alarm')}</p>
            {nextBtn}
          </div>
        </div>
      )}
      {step.kind === 'goal' && (
        <div class="ui-intro-stage ui-intro-wake">
          <div class="ui-intro-black ui-intro-dawn" data-ui="intro-goal">
            <p class="ui-intro-goal-title">{t('ui.goal')}</p>
            <p class="ui-intro-cap" data-ui="intro-goal-text">{t('intro.goal')}</p>
            {nextBtn}
          </div>
        </div>
      )}
      {step.kind === 'search' && (
        <div class="ui-intro-stage ui-intro-spots" data-ui="intro-spots" role="group">
          {SPOTS.map((sp) => <button key={sp} type="button" class="ui-btn" data-ui="intro-spot" data-spot={sp} data-seen={seen === sp ? 'yes' : 'no'} onClick={(e) => spotTap(e, sp)}>{t(`intro.spot.${sp}` as Key)}</button>)}
        </div>
      )}
      {(step.kind === 'line' || step.kind === 'pick' || step.kind === 'search') && (
        <>
          {step.kind === 'line' && !morning && <div class="ui-intro-stage"><Book /></div>}
          <div class="ui-talk">
            <div class="ui-talk-box" data-ui="dialogue" data-typing="no">
              <div class="ui-talk-portrait"><Portrait id={who} lookup={portrait} size="lg" /></div>
              <h3 class="ui-talk-name" data-ui="speaker" data-npc={who ?? 'narrator'}>{name}</h3>
              <div class="ui-talk-main">
                <p class="ui-talk-line" data-ui="line">{talkLine}</p>
                <div class="ui-answers ui-talk-answers" data-ui="answers">
                  {step.kind === 'line' && nextBtn}
                  {step.kind === 'pick' && (
                    <div class="ui-intro-pick" data-ui="create" role="group" aria-labelledby="ui-intro-pick-title">
                      <p id="ui-intro-pick-title" class="ui-intro-pick-title">{t('ui.createTitle')}</p>
                      {offer.characters.map((c) => (
                        <button type="button" class="ui-btn" key={c.id} data-act="create" onClick={() => act(c.id)}>
                          {`${ct(lang, c.profileKey)} · ${ct(lang, c.transportKey)} · ${c.animalKey ? ct(lang, c.animalKey) : t('ui.noAnimal')}`}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
