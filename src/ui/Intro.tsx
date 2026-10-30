// Вступ (GAME-182, brain/Сценарій/scenario.md §1): дощовий вечір удома, Метью знаходить атлас дідуся Генрі й лист у ньому. Перший вибір гравця — хто вирушає
// в дорогу — стоїть на четвертому кроці (три дотики), без ☰. Решта — короткі родинні репліки й сторінка Атласу, на яку лягає перша наклейка «Дім» (звук «дзинь»).
// Кожен крок пропускається («Пропустити»: до вибору героя — вибір усе одно лишається; після нього — одразу на мапу). Світ на паузі, поки вступ іде (Shell).
// Тексти — src/i18n (intro.*); таймерів реального часу немає — рядки йдуть за дотиком, друк не потрібен.
import { useEffect, useRef, useState } from 'preact/hooks';
import { setIntroOpen } from '../audio';
import { playUi } from '../audio/ui-sounds';
import { ct } from '../i18n/content';
import type { AnyLang, Key } from '../i18n';
import { AtlasPage } from './Atlas';
import { iconRects } from './atlas-icons';
import { Portrait, type PortraitLookup } from './Portrait';
import type { IntroRoomPainter } from './port';
import type { StoryOffer } from './story-types';
import { calmMotion } from '../platform/motion';

type Step =
  | { readonly kind: 'line'; readonly who: string | null; readonly text: Key }
  | { readonly kind: 'letter' }
  | { readonly kind: 'pick' }
  | { readonly kind: 'final' };

const PRE: readonly Step[] = [
  { kind: 'line', who: null, text: 'intro.narr1' },
  { kind: 'line', who: 'npc.matthew', text: 'intro.matthew1' },
  { kind: 'letter' },
  { kind: 'pick' },
];
const POST: readonly Step[] = [
  { kind: 'line', who: 'npc.george', text: 'intro.george1' },
  { kind: 'line', who: 'npc.victoria', text: 'intro.victoria2' },
  { kind: 'line', who: 'npc.george', text: 'intro.george2' },
];
const MIA: Step = { kind: 'line', who: null, text: 'intro.mia' };
const PICK_AT = PRE.length - 1;
/** Кількість кроків до вибору героя (включно з ним) — e2e міряє «перший вибір ≤ 15 с». */
export const INTRO_STEPS_TO_PICK = PRE.length;

function Book() {
  return (
    <svg class="ui-intro-book" viewBox="0 0 8 8" aria-hidden="true" focusable="false">
      {iconRects('atlas').map((r) => <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width="1" height="1" fill={r.fill} />)}
    </svg>
  );
}

/** Тло вступу: кімната з вікном і дощем (intro-room.ts). Розмір береться з вікна й перемальовується при зміні орієнтації. */
function Room({ paint }: { paint: IntroRoomPainter | undefined }) {
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
    paint(el, w, h, reduced, () => dead).then((s) => { if (dead) s(); else stop = s; }, () => undefined);
    return () => { dead = true; stop(); };
  }, [size]);
  return <canvas ref={ref} class="ui-intro-room" data-ui="intro-room" aria-hidden="true" />;
}

export function Intro({ offer, lang, t, act, portrait, room, onDone }: { room?: IntroRoomPainter | undefined; offer: StoryOffer; lang: AnyLang; t: (k: Key) => string; act: (id: string) => void; portrait: PortraitLookup; onDone: () => void }) {
  const [i, setI] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const steps: readonly Step[] = [...PRE, ...POST, ...(offer.mia !== null ? [MIA] : []), { kind: 'final' }];
  const step = steps[Math.min(i, steps.length - 1)] as Step;
  const created = offer.stage !== 'create';
  // Герой обраний (вибір зроблено тут чи гра вже мала персонажа) — крок вибору проминуто.
  useEffect(() => { if (step.kind === 'pick' && created) setI(PICK_AT + 1); }, [step.kind, created]);
  // Фокус — на кнопку «далі» (або на першу відповідь вибору): клавіатура й екранний читач починають із неї.
  useEffect(() => { root.current?.querySelector<HTMLElement>('[data-ui="intro-next"], [data-act="create"]')?.focus({ preventScroll: true }); }, [i]);
  // Кінець вступу: наклейка «Дім» влітає зі звуком «дзинь» (той самий єдиний мікшер UI, що й решта підтверджень).
  useEffect(() => { setIntroOpen(true); return () => setIntroOpen(false); }, []);   // GAME-194: дощ за вікном, поки вступ відкрито
  useEffect(() => { if (step.kind === 'final') playUi('confirm'); }, [step.kind]);
  // Дотик двічі за мить не пропускає два кроки: пауза між кроками за event.timeStamp (без таймерів).
  const last = useRef(Number.NEGATIVE_INFINITY);
  const go = (e: Event, fn: () => void): void => {
    if (e.timeStamp - last.current < 250) return;
    last.current = e.timeStamp;
    fn();
  };
  const next = (e: Event): void => go(e, () => { if (i >= steps.length - 1) onDone(); else setI(i + 1); });
  const skip = (e: Event): void => go(e, () => { if (step.kind === 'pick' || (i < PICK_AT && !created)) setI(PICK_AT); else onDone(); });
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

  const nextBtn = <button type="button" class="ui-btn" data-ui="intro-next" onClick={next}>{step.kind === 'final' ? t('intro.go') : t('ui.continue')}</button>;
  const who = step.kind === 'line' ? step.who : step.kind === 'pick' ? 'npc.victoria' : null;
  const name = who ? ct(lang, who) : t('ui.narrator');
  return (
    <div ref={root} class="ui-intro" data-ui="intro" data-step={i} data-kind={step.kind} role="dialog" aria-modal="true" aria-label={t('ui.story')}>
      <Room paint={room} />
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
      {step.kind === 'final' && (
        <div class="ui-intro-stage">
          <div class="ui-intro-atlas">
            <AtlasPage atlas={offer.atlas} lang={lang} t={t} fly="sticker.home" />
            <p class="ui-intro-final" data-ui="intro-final" role="status">{t('intro.final')}</p>
            {nextBtn}
          </div>
        </div>
      )}
      {(step.kind === 'line' || step.kind === 'pick') && (
        <>
          <div class="ui-intro-stage"><Book /></div>
          <div class="ui-talk">
            <div class="ui-talk-box" data-ui="dialogue" data-typing="no">
              <div class="ui-talk-portrait"><Portrait id={who} lookup={portrait} size="lg" /></div>
              <h3 class="ui-talk-name" data-ui="speaker" data-npc={who ?? 'narrator'}>{name}</h3>
              <div class="ui-talk-main">
                <p class="ui-talk-line" data-ui="line">{step.kind === 'line' ? t(step.text) : t('intro.victoria1')}</p>
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
