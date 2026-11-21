// GAME-314 · зразковий день: те, чого в живій грі бракувало між уже готовими шматками. Тут лише показ і дотики:
//   заїзд на ділянку (drive-in, GAME-310) → дошка табору (рутини й пристрої, GAME-311) → ніч (ОДНА модель camp-night) → підсумок.
// Дорога (mg.drive) і місії йдуть через каркас міні-ігор (MinigameHost у Shell), ділянку обирає сцена приїзду — тут їх немає.
import { useEffect, useRef, useState } from 'preact/hooks';
import { money as fmtMoney } from './money';
import type { Key } from '../i18n';
import { ct, MISSING_MARK } from '../i18n/content';
import { goalNames } from '../content/sample-day';
import type { AnyLang } from '../i18n';
import type { Weather } from '../core/weather';
import { CampRoutines } from './CampRoutines';
import type { RoutineId } from '../content/camp-day';
import { DRIVE_STEPS, canUndo, driveOutcome, driveLog, laneOf, logStep, undo, type DriveLog, type DriveStep } from '../content/drive-in';
import { devicesFromFlags, missionsDone, sampleExtra } from '../content/sample-day';
import { arrivalOf, pitchTaken } from '../content/arrival-pitch';
import type { CampBoardSave } from '../core/camp-board';
import { roughCount, type NightFacts } from '../content/camp-night';

export type SampleStage = 'off' | 'drivein' | 'day';
export interface SamplePort {
  stage(): SampleStage;
  /** Смуга заїзду обраної ділянки. */
  lane(): string | null;
  /** GAME-317: ОДНА ціль дня після дороги (шапка показує її замість цілей старої гри розділу 1); null — дорогу ще не проїхано. */
  goal(): 'pitch' | 'day' | 'evening' | 'done' | null;
  /** GAME-338: сусіди, над якими зараз «!» (ціль дня називає саме їх). */
  neighbours(): readonly string[];
  /** GAME-346: видавець місії, до якого треба повернутись після міні-гри (чип цілі називає його); немає — null.  */
  report(): string | null;
  flags(): readonly string[];
  moneyCents(): number;
  seed(): number;
  weather(): Weather;
  onFrame(cb: (dtMs: number) => void): () => void;
  /** Заїзд закінчено: скільки разів зачепили чуже. */
  driveInDone(scrapes: number): void;
  /** Збережена дошка рутин (game.campBoard) і запис змін у сейв. */
  board(): CampBoardSave | undefined;
  saveBoard(b: CampBoardSave): void;
  /** Ніч із бурею: сцена dlg.storm-night з наслідками дня; раз за день. */
  stormNight(): void;
  /** GAME-323: «Почати знову» — нова гра й перезавантаження ?sampleDay=1 (день не продовжується в старому меню). */
  restart(): Promise<void>;
  /** GAME-335: місце справи на мапі табору просить відкрити рутину (нове `n` — новий запит). */
  request(): { id: RoutineId | null; n: number };
  /** GAME-335: яка рутина зараз у роботі — виконавець стоїть на її місці на мапі. */
  working(id: RoutineId | null): void;
  subscribe(l: () => void): () => void;
  /** GAME-346: холодний старт — кадр «хто ми й куди їдемо» перед першою подією дороги, поки гравець його не закрив (+1 дотик). */
  intro?(): boolean;
  introDone?(): void;
}

/** GAME-346: один кадр контексту перед першою подією дороги — без нього зразок відкривався подією «Подорож» із невідомими людьми. */
export function SampleIntro({ t, done }: { t: (k: Key) => string; done: () => void }) {
  return (
    <div class="ui-overlay ui-camp" style={{ zIndex: 60 }} data-ui="sample-intro" role="dialog" aria-labelledby="sd-intro-title">
      <h2 id="sd-intro-title">{t('sd.intro.title')}</h2>
      <p class="ui-camp-note" data-ui="sample-intro-text">{t('sd.intro.text')}</p>
      <button type="button" class="ui-btn ui-camp-big" data-ui="sample-intro-go" onClick={done}>{t('sd.intro.go')}</button>
    </div>
  );
}

const ARROWS: Readonly<Record<DriveStep, string>> = { forward: '▲', back: '▼', left: '◀', right: '▶' };

export function DriveInCard({ laneId, t, done }: { laneId: string; t: (k: Key) => string; done: (scrapes: number) => void }) {
  const lane = laneOf(laneId);
  const [log, setLog] = useState<DriveLog>(() => driveLog(lane));
  const [note, setNote] = useState('');
  const st = log.state;
  const press = (s: DriveStep): void => {
    const r = logStep(lane, log, s);
    setLog(r.log);
    setNote(r.outcome === 'scrape' ? t('sd.scrape') : r.outcome === 'blocked' ? t('sd.blocked') : '');
  };
  return (
    <div class="ui-overlay ui-camp" data-ui="drive-in" data-done={st.done ? 'yes' : 'no'} data-scrapes={st.scrapes} data-lane={laneId}>
      <h2>{t('sd.drivein.title')}</h2>
      <p class="ui-camp-note">{t('sd.drivein.hint')}</p>
      <div class="sd-lane" style={{ '--cols': lane.cols, '--rows': lane.rows } as Record<string, number>} role="img" aria-label={t('sd.drivein.title')}>
        {lane.cells.map((c, i) => {
          const col = i % lane.cols; const row = Math.floor(i / lane.cols);
          const car = st.at.c === col && st.at.r === row;
          const goal = lane.goal.c === col && lane.goal.r === row;
          return <i key={i} class="sd-cell" data-cell={c} data-car={car ? st.facing : ''} data-goal={goal ? 'yes' : 'no'} />;
        })}
      </div>
      <p class="ui-camp-note" data-ui="di-note" role="status">{note || `${t('sd.scrapes')}: ${st.scrapes}`}</p>
      {!st.done ? (
        <div class="sd-pad">
          {DRIVE_STEPS.map((s) => (
            <button key={s} type="button" class="ui-btn ui-camp-big" data-ui={`di-${s}`} aria-label={t(`sd.step.${s}` as Key)} onClick={() => press(s)}>{ARROWS[s]}</button>
          ))}
          <button type="button" class="ui-btn ui-camp-big" data-ui="di-undo" disabled={!canUndo(log)} onClick={() => setLog(undo(log))}>{t('sd.undo')}</button>
        </div>
      ) : (
        <button type="button" class="ui-btn ui-camp-big" data-ui="di-done" data-outcome={driveOutcome(st)} onClick={() => done(st.scrapes)}>{t('sd.drivein.done')}</button>
      )}
    </div>
  );
}

/** GAME-323: кінець зразкового дня — підсумок і ЄДИНА дія «Почати знову». Після перезавантаження сторінки фактів ночі нема — тоді лише картка кінця. */
/** Рядок гаманця в підсумку дня; гроші — тим самим форматером, що й усюди (GAME-346). */
/** GAME-346 · текст чипа цілі зразкового дня: «Допомогти сусідам: Аміна, Люк», а після міні-гри місії — «Повернутись до: Клер». Єдине місце, звідки Shell бере цей текст. */
export function sampleGoalLine(sample: SamplePort, t: (k: Key) => string, lang: AnyLang): string {
  const goal = sample.goal();
  if (goal === null) return '';
  const back = sample.report();
  const who = goalNames(goal, sample.neighbours(), back);
  const head = t(back !== null && (goal === 'day' || goal === 'evening') ? 'sd.goal.back' : (`sd.goal.${goal}` as Key));
  if (who.length === 0) return head;
  return `${head}${goal === 'evening' && back === null ? `. ${t('sd.goal.wait')}` : ''}: ${who.map((id) => ct(lang, id)).join(', ')}`;
}

export const walletLine = (t: (k: Key) => string, lang: AnyLang, cents: number): string => `${t('sd.sum.wallet')}: ${fmtMoney(lang, cents)}`;

function Summary({ facts, flags, money, t, lang, again }: { facts: NightFacts | null; flags: readonly string[]; money: number; t: (k: Key) => string; lang: AnyLang; again: () => void }) {
  const pitch = pitchTaken(flags);
  return (
    <div class="ui-overlay ui-camp" data-ui="sd-summary" data-money={money} data-missions={missionsDone(flags)} data-arrival={arrivalOf(flags)} data-pitch={pitch ?? ''} data-rough={facts ? roughCount(facts) : ''}>
      <h2>{t('sd.summary.title')}</h2>
      <ul class="ui-camp-list">
        <li data-ui="sd-sum-arrival">{`${t('sd.sum.arrival')}: ${t(`sd.arrival.${arrivalOf(flags)}` as Key)}`}</li>
        <li data-ui="sd-sum-pitch">{`${t('sd.sum.pitch')}: ${pitch === null ? '-' : ct(lang, `pitch.${pitch}.name`)}`}</li>
        <li data-ui="sd-sum-missions">{`${t('sd.sum.missions')}: ${missionsDone(flags)}`}</li>
        <li data-ui="sd-sum-wallet">{walletLine(t, lang, money)}</li>
        {facts && <li data-ui="sd-sum-night">{`${t('sd.sum.rough')}: ${roughCount(facts)}`}</li>}
      </ul>
      <p class="ui-camp-note">{t('sd.summary.end')}</p>
      <button type="button" class="ui-btn ui-camp-big" data-ui="sd-restart" onClick={again}>{t('sd.restart')}</button>
    </div>
  );
}

export function SampleDay({ port, t, lang, onBoard }: { port: SamplePort; t: (k: Key) => string; lang: AnyLang; onBoard: () => void }) {
  const [, force] = useState(0);
  useEffect(() => port.subscribe(() => force((n) => n + 1)), [port]);
  const [boardOpen, setBoardOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [night, setNight] = useState<NightFacts | null>(null);
  const stage = port.stage();
  // GAME-335: запит із мапи (місце справи) відкриває дошку з потрібною рутиною — той самий вхід, що й кнопка «Дошка табору».
  const req = port.request();
  const seenReq = useRef(req.n);
  // GAME-337: запит живе лише до першого прочитання панеллю; інакше панель, змонтована знову після розмови, відкрила б застарілу рутину замість дошки.
  const [fresh, setFresh] = useState<typeof req>({ id: null, n: req.n });
  useEffect(() => {
    if (req.n === seenReq.current) return;
    seenReq.current = req.n;
    setFresh(req);
    onBoard(); setMounted(true); setBoardOpen(true);
  }, [req.n]);
  useEffect(() => { if (fresh.id !== null) setFresh({ id: null, n: fresh.n }); }, [fresh.n]);
  if (port.intro?.() === true) return <SampleIntro t={t} done={() => port.introDone?.()} />;
  if (stage === 'off') return null;
  const text = (id: string): string => { const v = ct(lang, id); return v.startsWith(MISSING_MARK) ? t(id as Key) : v; };
  const lane = port.lane();
  if (stage === 'drivein' && lane !== null) return <DriveInCard laneId={lane} t={t} done={port.driveInDone} />;
  const flags = port.flags();
  const ended = port.goal() === 'done';   // GAME-323: сцену бурі зіграно — день скінчено; ☰ і дошка вже не відкриваються
  return (
    <>
      {!mounted && !ended && <p class="sd-hint" data-ui="sd-station-hint" role="status">{t('sd.stationHint')}</p>}
      {!boardOpen && !ended && (
        <button type="button" class="ui-btn sd-board-btn" data-ui="sd-board" onClick={() => { onBoard(); setMounted(true); setBoardOpen(true); }}>{t('sd.board')}</button>
      )}
      {mounted && !ended && (
        <div class="sd-board-wrap" data-ui="sd-board-wrap" hidden={!boardOpen}>
          <CampRoutines live={boardOpen} t={t} weather={port.weather()} seed={port.seed()} onFrame={port.onFrame} devices={devicesFromFlags(flags)} extra={sampleExtra(flags)} text={text} focus={fresh} onWork={port.working}
            onNight={setNight} saved={port.board()} onSave={port.saveBoard} onSummary={() => { setBoardOpen(false); port.stormNight(); }} />
          <button type="button" class="ui-btn sd-board-close" data-ui="sd-board-close" onClick={() => setBoardOpen(false)}>{t('sd.back')}</button>
        </div>
      )}
      {ended && <Summary facts={night} flags={flags} money={port.moneyCents()} t={t} lang={lang} again={() => void port.restart()} />}
    </>
  );
}
