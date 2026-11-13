// GAME-314 · зразковий день: те, чого в живій грі бракувало між уже готовими шматками. Тут лише показ і дотики:
//   заїзд на ділянку (drive-in, GAME-310) → дошка табору (рутини й пристрої, GAME-311) → ніч (ОДНА модель camp-night) → підсумок.
// Дорога (mg.drive) і місії йдуть через каркас міні-ігор (MinigameHost у Shell), ділянку обирає сцена приїзду — тут їх немає.
import { useEffect, useState } from 'preact/hooks';
import type { Key } from '../i18n';
import { ct, MISSING_MARK } from '../i18n/content';
import type { AnyLang } from '../i18n';
import type { Weather } from '../core/weather';
import { CampRoutines } from './CampRoutines';
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
  subscribe(l: () => void): () => void;
}

const ARROWS: Readonly<Record<DriveStep, string>> = { forward: '▲', back: '▼', left: '◀', right: '▶' };

function DriveInCard({ laneId, t, done }: { laneId: string; t: (k: Key) => string; done: (scrapes: number) => void }) {
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
      <div class="sd-lane" style={{ '--cols': lane.cols } as Record<string, number>} role="img" aria-label={t('sd.drivein.title')}>
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

function Summary({ facts, flags, money, t, lang, close }: { facts: NightFacts; flags: readonly string[]; money: number; t: (k: Key) => string; lang: AnyLang; close: () => void }) {
  const pitch = pitchTaken(flags);
  return (
    <div class="ui-overlay ui-camp" data-ui="sd-summary" data-money={money} data-missions={missionsDone(flags)} data-arrival={arrivalOf(flags)} data-pitch={pitch ?? ''} data-rough={roughCount(facts)}>
      <h2>{t('sd.summary.title')}</h2>
      <ul class="ui-camp-list">
        <li data-ui="sd-sum-arrival">{`${t('sd.sum.arrival')}: ${t(`sd.arrival.${arrivalOf(flags)}` as Key)}`}</li>
        <li data-ui="sd-sum-pitch">{`${t('sd.sum.pitch')}: ${pitch === null ? '-' : ct(lang, `pitch.${pitch}.name`)}`}</li>
        <li data-ui="sd-sum-missions">{`${t('sd.sum.missions')}: ${missionsDone(flags)}`}</li>
        <li data-ui="sd-sum-wallet">{`${t('sd.sum.wallet')}: ${(money / 100).toFixed(2)} €`}</li>
        <li data-ui="sd-sum-night">{`${t('sd.sum.rough')}: ${roughCount(facts)}`}</li>
      </ul>
      <p class="ui-camp-note">{t('sd.summary.end')}</p>
      <button type="button" class="ui-btn ui-camp-big" data-ui="sd-finish" onClick={close}>{t('sd.finish')}</button>
    </div>
  );
}

export function SampleDay({ port, t, lang }: { port: SamplePort; t: (k: Key) => string; lang: AnyLang }) {
  const [, force] = useState(0);
  useEffect(() => port.subscribe(() => force((n) => n + 1)), [port]);
  const [boardOpen, setBoardOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [night, setNight] = useState<NightFacts | null>(null);
  const [summary, setSummary] = useState(false);
  const stage = port.stage();
  if (stage === 'off') return null;
  const text = (id: string): string => { const v = ct(lang, id); return v.startsWith(MISSING_MARK) ? t(id as Key) : v; };
  const lane = port.lane();
  if (stage === 'drivein' && lane !== null) return <DriveInCard laneId={lane} t={t} done={port.driveInDone} />;
  const flags = port.flags();
  return (
    <>
      {!boardOpen && !summary && (
        <button type="button" class="ui-btn sd-board-btn" data-ui="sd-board" onClick={() => { setMounted(true); setBoardOpen(true); }}>{t('sd.board')}</button>
      )}
      {mounted && !summary && (
        <div class="sd-board-wrap" data-ui="sd-board-wrap" hidden={!boardOpen}>
          <CampRoutines t={t} weather={port.weather()} seed={port.seed()} onFrame={port.onFrame} devices={devicesFromFlags(flags)} extra={sampleExtra(flags)} text={text}
            onNight={setNight} saved={port.board()} onSave={port.saveBoard} onSummary={() => { setSummary(true); setBoardOpen(false); port.stormNight(); }} />
          <button type="button" class="ui-btn sd-board-close" data-ui="sd-board-close" onClick={() => setBoardOpen(false)}>{t('sd.back')}</button>
        </div>
      )}
      {summary && night && <Summary facts={night} flags={flags} money={port.moneyCents()} t={t} lang={lang} close={() => setSummary(false)} />}
    </>
  );
}
