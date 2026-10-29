// GAME-179 · рамка розмови внизу екрана, як у Stardew Valley / Eastward: портрет ліворуч (голова по плечі), табличка з іменем, текст друкується,
// тап = дописати рядок / далі, кнопки відповідей. Це не екран подорожі: мапа лишається видно над рамкою, але світ стоїть на паузі.
// Друк тексту — лише краса: увесь рядок уже в DOM (приглушений), тож екранний читач і тести бачать його одразу; тап, E/Space/Enter дописують за мить.
import { useEffect, useRef, useState } from 'preact/hooks';
import { ct } from '../i18n/content';
import type { AnyLang, Key } from '../i18n';
import { calmMotion } from '../platform/motion';
import { Portrait, type PortraitLookup } from './Portrait';
import { ACT_COOLDOWN_MS, actionLabel } from './StoryPanel';
import { trapTab } from './focus-trap';
import type { OfferAction, StoryOffer } from './story-types';

type Dialogue = NonNullable<StoryOffer['dialogue']>;

/** Скільки мс на літеру: ≈ 62 літери/с — рядок у 100 знаків дописується за півтори секунди. */
export const CHAR_MS = 16;

/** Хто говорить: ім'я за ключем із контенту; репліка героя — «Ти»; оповідач — «Оповідь». */
function nameOf(offer: Dialogue, lang: AnyLang, t: (k: Key) => string): string {
  if (offer.speakerKey) return ct(lang, offer.speakerKey);
  return t(offer.speakerId === 'player' ? 'ui.you' : 'ui.narrator');
}

export function DialogueBox({ dialogue: d, lang, t, act, portrait }: { dialogue: Dialogue; lang: AnyLang; t: (k: Key) => string; act: (id: string) => void; portrait: PortraitLookup }) {
  const root = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLParagraphElement>(null);
  const lastAct = useRef(Number.NEGATIVE_INFINITY);
  const raf = useRef(0);
  const text = ct(lang, d.key);
  const chars = Array.from(text);
  // Скільки літер уже показано. Рух зменшено (prefers-reduced-motion) — одразу весь рядок, без друку.
  const [n, setN] = useState(0);
  const done = n >= chars.length;
  useEffect(() => {
    const calm = calmMotion();
    const total = Array.from(text).length;
    if (calm || total === 0) { setN(total); return; }
    setN(0);
    let t0 = -1;
    // Один виклик requestAnimationFrame на файл (сторож no-realtime): перший запуск без мітки лише планує кадр.
    const loop = (ts?: number): void => {
      if (ts !== undefined) {
        if (t0 < 0) t0 = ts;
        const k = Math.min(total, Math.floor((ts - t0) / CHAR_MS) + 1);
        setN(k);
        if (k >= total) return;
      }
      raf.current = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf.current);
  }, [text]);
  // Новий рядок — фокус на текст (екранний читач читає його), без прокрутки.
  useEffect(() => { line.current?.focus({ preventScroll: true }); }, [text]);

  const finish = (): void => { cancelAnimationFrame(raf.current); setN(chars.length); };
  /** Та сама «глухота» ~350 мс після прийнятої дії, що й у панелі: другий тап не влучає в нову першу кнопку. */
  const guarded = (e: Event, fn: () => void): void => {
    if (e.timeStamp - lastAct.current < ACT_COOLDOWN_MS) return;
    lastAct.current = e.timeStamp;
    fn();
  };
  const answers = d.answers;
  const only: OfferAction | undefined = answers.length === 1 ? answers[0] : undefined;
  /** Тап / E / Space / Enter поза кнопкою: друк іде — дописати; одна відповідь («далі») — прийняти; кілька — фокус на першу. */
  const advance = (e: Event): void => {
    if (!done) { guarded(e, finish); return; }
    if (only) { guarded(e, () => act(only.id)); return; }
    root.current?.querySelector<HTMLElement>('[data-act]')?.focus({ preventScroll: true });
  };
  const advanceRef = useRef(advance);
  advanceRef.current = advance;
  const answersRef = useRef(answers);
  answersRef.current = answers;

  // Клавіші: E / Space / Enter — «далі»; цифри 1–9 — відповідь за номером. Слухач на window: фокус міг загубитись після кліку.
  // Затиснута клавіша (автоповтор) не «пробігає» рядки.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const acting = e.code === 'Space' || e.code === 'KeyE' || e.code === 'Enter' || e.code === 'NumpadEnter';
      if (e.repeat && acting) { e.preventDefault(); return; }
      const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
      if (digit) {
        const a = answersRef.current[Number(digit[1]) - 1];
        if (a && !(e.target instanceof Element && e.target.closest('input, textarea'))) { e.preventDefault(); guardedRef.current(e, () => act(a.id)); }
        return;
      }
      if (!acting) return;
      const btn = e.target instanceof Element ? e.target.closest('button') : null;
      // На кнопці Enter/Space робить власний клік; якщо його вже скасував хтось інший (клавіші дії відсікає й сцена) — клікаємо самі.
      if (btn) { if (e.defaultPrevented) btn.click(); return; }
      e.preventDefault();
      advanceRef.current(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const guardedRef = useRef(guarded);
  guardedRef.current = guarded;

  const shown = chars.slice(0, n).join('');
  const rest = chars.slice(n).join('');
  const name = nameOf(d, lang, t);
  return (
    <div ref={root} class="ui-talk" data-ui="story" data-mode="talk" role="dialog" aria-modal="true" aria-labelledby="ui-talk-name"
      onKeyDown={(e) => { if (root.current) trapTab(e, root.current); }}>
      <div class="ui-talk-box" data-ui="dialogue" data-typing={done ? 'no' : 'yes'} onClick={(e) => { if (!(e.target instanceof Element && e.target.closest('button'))) advance(e); }}>
        <div class="ui-talk-portrait"><Portrait id={d.speakerId} lookup={portrait} size="lg" /></div>
        <h3 id="ui-talk-name" class="ui-talk-name" data-ui="speaker" data-npc={d.speakerId ?? 'narrator'}>{name}</h3>
        <div class="ui-talk-main">
          <p ref={line} id="ui-talk-line" class="ui-talk-line" data-ui="line" tabIndex={-1}>{shown}<span class="ui-ghost">{rest}</span></p>
          <div class="ui-answers ui-talk-answers" data-ui="answers">
            {answers.map((a, i) => (
              <button type="button" class="ui-btn" key={a.id} data-act={a.kind} data-key={a.key ?? ''} onClick={(e) => guarded(e, () => act(a.id))}>
                {a.kind === 'choose' ? `${i + 1}. ${actionLabel(lang, t, a)}` : actionLabel(lang, t, a)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
