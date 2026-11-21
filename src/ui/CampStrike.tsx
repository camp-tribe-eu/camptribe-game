// GAME-350 · ранок після ночі: дошка «згортаємо табір». Новий компонент: лише показ і дотики над чистою логікою content/camp-strike.
// Нічого не рахує за часом. Стан справ іде в сейв через onSave (команда SaveStrike), тож перезавантаження не губить зроблене;
// хід всередині ще не закритої справи не зберігається — вона починається спочатку (це кілька дотиків).
import { useState } from 'preact/hooks';
import type { Key } from '../i18n';
import {
  STRIKE_DEFS, STRIKE_JOBS, allResolved, shownTargets, closeStrike, jobComplete, jobOutcome, startJob, tap, withResult,
  type JobRun, type StrikeJob, type StrikeSave,
} from '../content/camp-strike';

export interface CampStrikeProps {
  t: (k: Key) => string;
  saved: StrikeSave | undefined;
  onSave: (s: StrikeSave) => void;
}

export function CampStrike({ t, saved, onSave }: CampStrikeProps) {
  const results = saved?.results ?? {};
  const firstOpen = STRIKE_JOBS.find((j) => results[j] === undefined) ?? STRIKE_JOBS[0];
  const [active, setActive] = useState<StrikeJob>(firstOpen);
  const [runs, setRuns] = useState<Partial<Record<StrikeJob, JobRun>>>({});
  const run = runs[active] ?? startJob();
  const def = STRIKE_DEFS[active];
  const resolved = results[active] !== undefined;
  const all = allResolved(results);
  const next = (from: StrikeJob, saveResults: StrikeSave['results']): StrikeJob => STRIKE_JOBS.find((j) => j !== from && saveResults[j] === undefined) ?? from;

  const resolve = (job: StrikeJob, jobRun: JobRun | null): void => {
    const s = withResult(saved, job, jobOutcome(jobRun));
    onSave(s);
    setActive(next(job, s.results));
  };
  const press = (targetId: string): void => {
    if (resolved) return;
    const after = tap(active, run, targetId);
    setRuns({ ...runs, [active]: after });
    if (jobComplete(active, after)) resolve(active, after);
  };
  const done = STRIKE_JOBS.filter((j) => results[j] !== undefined).length;
  const noteKey = (run.note === 'order' ? 'strike.step.order' : run.note === 'nature' ? 'strike.step.nature' : 'strike.step.ok') as Key;

  return (
    <div class="ui-overlay ui-camp sk-board" data-ui="camp-strike" data-stage="strike" data-done={done} data-all={all ? 'yes' : 'no'} role="dialog" aria-labelledby="sk-title" style={{ zIndex: 60 }}>
      <h2 id="sk-title">{t('strike.title')}</h2>
      <p class="ui-camp-note">{t('strike.note')}</p>
      <div class="ui-camp-row sk-jobs" role="tablist">
        {STRIKE_JOBS.map((j) => (
          <button key={j} type="button" role="tab" aria-selected={j === active} class="ui-btn sk-job" data-ui={`strike-job-${j}`} data-state={results[j] === undefined ? 'open' : 'closed'} data-active={j === active ? 'yes' : 'no'} onClick={() => setActive(j)}>
            <span>{t(STRIKE_DEFS[j].nameKey as Key)}</span>
            {results[j] !== undefined && <small data-ui={`strike-job-${j}-state`}>{t((results[j] === 'scrappy' ? 'strike.job.left' : 'strike.job.done') as Key)}</small>}
          </button>
        ))}
      </div>
      <p class="ui-camp-note" data-ui="strike-hint">{t(def.hintKey as Key)}</p>
      <div class="ui-camp-row sk-targets" data-ui="strike-targets" data-job={active}>
        {shownTargets(active).map((tg) => {
          const taken = run.done.includes(tg.id) || (resolved && tg.decoy !== true);
          return (
            <button key={tg.id} type="button" class="ui-btn sk-target" data-ui={`strike-t-${tg.id}`} data-taken={taken ? 'yes' : 'no'} disabled={taken || resolved} onClick={() => press(tg.id)}>{t(tg.labelKey as Key)}</button>
          );
        })}
      </div>
      <p class="ui-camp-note" data-ui="strike-note" role="status">{resolved ? '' : run.done.length > 0 || run.mistakes > 0 ? t(noteKey) : ''}</p>
      <div class="ui-camp-foot sk-foot">
        <div class="ui-camp-row">
          {!resolved && <button type="button" class="ui-btn ui-camp-big" data-ui="strike-skip" onClick={() => resolve(active, null)}>{t('strike.skip')}</button>}
          <button type="button" class="ui-btn ui-camp-big" data-ui="strike-finish" disabled={!all} onClick={() => { const c = closeStrike(saved); if (c) onSave(c); }}>{`${t('strike.finish')} (${done}/${STRIKE_JOBS.length})`}</button>
        </div>
      </div>
    </div>
  );
}
