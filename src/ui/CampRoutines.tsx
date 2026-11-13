// GAME-311 · дошка рутин табору й сама робота: сім справ, у кожної свій виконавець, своя причина саме сьогодні
// і свій слід у ночі. Шар UI: уся логіка — у src/content (camp-day, camp-night і сім робіт), тут лише показ і дотики.
// Час приходить ЛИШЕ кроком кадру ззовні (prop onFrame) — свого таймера панель не має (GAME-39 #4).
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Key } from '../i18n';
import type { Weather } from '../core/weather';
import { ROUNDS, ROUTINES, ROUTINE_IDS, addPick, awayIn, campBusy, emptyRounds, isDone, minutesLeft, recordResult, startCampDay, whyNot, type CampDay, type Round, type RoutineId } from '../content/camp-day';
import { nightOf, type NightBeat, type NightFacts } from '../content/camp-night';
import { deviceFacts, deviceFor, statusOf, tend, withDevices, type Devices } from '../content/camp-devices';
import { HELP_AFTER, NORMAL, RELAXED, type Difficulty, type Outcome } from '../content/minigame';
import type { CampBoardSave } from '../core/camp-board';
import { STEPS, needSide, startWater, stepWater, waterOutcome, waterScore, type Side, type WaterState } from '../content/water-carry';
import { LANTERNS, SPOTS, lanternOutcome, litCount, startLanterns, stepLanterns, type LanternState } from '../content/lantern-charge';
import { DISHES, emberOutcome, startEmbers, stepEmbers, type EmberAct, type EmberState } from '../content/embers';
import { BASKET, berryOutcome, bitterCount, enoughBerries, hinted, patchOf, pickBerry, startBerries, type BerryState } from '../content/berries-patch';
import { COVER, ENOUGH_DRY, LOGS, dryLogs, finishStack, placeLog, startStack, type StackState, type WoodPlace } from '../content/firewood-stack';
import { THINGS, foodOutside, putThing, sleepNow, startTidy, tidyOutcome, type Place, type TidyState } from '../content/night-camp';
import { FISH_IDLE, makeRng, stepFish, type FishState } from '../content/fishing';
import { speciesAt, supperFish } from '../content/fish-table';

type Phase = 'board' | 'work' | 'night';
const PLACES: readonly Place[] = ['car', 'hung', 'bin', 'tarp'];

export interface CampRoutinesProps {
  readonly t: (k: Key) => string;
  readonly weather: Weather;
  readonly seed: number;
  /** Крок кадру ззовні (сцена або стенд): повертає відписку. */
  readonly onFrame: (cb: (dtMs: number) => void) => () => void;
  /** Що в таборі вже налагоджено (§9а): пристрої, збудовані з матеріалів пригод, і їхня доглянутість. */
  readonly devices?: Devices;
  /** GAME-314: решта фактів ночі з гри (ділянка, місії, підготовка) — ніч лишається ОДНІЄЮ моделлю (camp-night). */
  readonly extra?: Partial<NightFacts>;
  /** GAME-314: ніч настала — ті самі факти, за якими її показано (підсумок дня читає їх). */
  readonly onNight?: (facts: NightFacts) => void;
  /** GAME-314: кнопка «до підсумку» після ночі. */
  readonly onSummary?: () => void;
  /** GAME-314: текст слідів ночі, коли ключ живе в каталозі змісту (ділянки), а не в інтерфейсі. */
  readonly text?: (id: string) => string;
  /** GAME-314: збережена дошка (game.campBoard) — розмова з сусідом закриває панель, але не губить день. */
  readonly saved?: CampBoardSave | undefined;
  /** GAME-314: дошка змінилась — у сейв (команда SaveCampBoard). */
  readonly onSave?: (b: CampBoardSave) => void;
}

export function CampRoutines({ t, weather, seed, onFrame, devices: devices0 = {}, extra, onNight, onSummary, text, saved, onSave }: CampRoutinesProps) {
  const [devices, setDevices] = useState<Devices>(() => ({ ...devices0, ...((saved?.devices ?? {}) as Devices) }));
  // GAME-314: пристрій, що з'явився вже по ходу дня (місія віддала матеріал), додається, не стираючи догляд за наявними.
  const dev0Key = Object.keys(devices0).sort().join(',');
  useEffect(() => setDevices((d) => ({ ...devices0, ...d })), [dev0Key]);
  const [day, setDay] = useState<CampDay>(() => (saved ? { picks: saved.picks as CampDay['picks'], results: saved.results as CampDay['results'] } : startCampDay()));
  const dayNow = withDevices(day, devices);
  const [round, setRound] = useState<Round>(saved?.round ?? 'morning');
  const [phase, setPhase] = useState<Phase>('board');
  const [active, setActive] = useState<RoutineId | null>(null);
  // Лічильник «сяк-так» поспіль на кожну справу — рівно той, за яким каркас (GAME-308) вмикає допомогу.
  const [streak, setStreak] = useState<Readonly<Partial<Record<RoutineId, number>>>>({});
  const [water, setWater] = useState<WaterState>(() => startWater(seed));
  const [tap, setTap] = useState(false);
  const [lanterns, setLanterns] = useState<LanternState>(startLanterns);
  const [embers, setEmbers] = useState<EmberState>(() => startEmbers(true));
  const [berries, setBerries] = useState<BerryState>(() => startBerries(seed));
  const [tidy, setTidy] = useState<TidyState>(startTidy);
  const [thing, setThing] = useState<string | null>(null);
  const [stack, setStack] = useState<StackState | null>(null);
  const [fish, setFish] = useState<FishState>(FISH_IDLE);
  const [rod, setRod] = useState(false);
  const [facts, setFacts] = useState(() => saved?.facts ?? { water: 0, dryLogs: 0, lit: 0, fish: 0, bitter: 0, foodOut: true });
  const rng = useRef(makeRng(seed));

  const helpOf = (id: RoutineId): Difficulty => ((streak[id] ?? 0) >= HELP_AFTER ? RELAXED : NORMAL);
  const finish = (id: RoutineId, outcome: Outcome, more: Partial<typeof facts> = {}) => {
    setDay((d) => recordResult(d, id, outcome));
    setStreak((h) => ({ ...h, [id]: outcome === 'scrappy' ? (h[id] ?? 0) + 1 : 0 }));
    setFacts((f) => ({ ...f, ...more }));
    setActive(null);
    setPhase('board');
  };

  // Крок кадру: тільки активна робота, і лише та, що справді йде від часу.
  const tick = useRef<(dtMs: number) => void>(() => undefined);
  tick.current = (dtMs: number) => {
    if (phase !== 'work' || active === null) return;
    if (active === 'water' && water.phase === 'fill') setWater((s) => stepWater(s, { kind: 'tick', dtMs, down: tap }, helpOf('water')).state);
    if (active === 'lanterns') setLanterns((s) => stepLanterns(s, { kind: 'tick', dtMs, weather }, helpOf('lanterns')).state);
    if (active === 'fire') setEmbers((s) => stepEmbers(s, { kind: 'tick', dtMs }, helpOf('fire')).state);
    if (active === 'fish') setFish((s) => stepFish(s, { kind: 'tick', dtMs, down: rod }, rng.current).state);
  };
  useEffect(() => onFrame((dtMs) => tick.current(dtMs)), [onFrame]);

  // Робота, що завершується сама (вода донесена, вечеря зварена) — відразу в день.
  useEffect(() => {
    if (active === 'water' && water.phase === 'done') finish('water', waterOutcome(water), { water: waterScore(water) });
    if (active === 'fire' && embers.done) finish('fire', emberOutcome(embers));
  });

  const open = (id: RoutineId) => {
    if (whyNot(dayNow, id, round) !== null) return;
    setDay((d) => addPick(d, id, round));
    setActive(id);
    setPhase('work');
    if (id === 'water') { setWater(startWater(seed)); setTap(false); }
    if (id === 'lanterns') setLanterns(startLanterns());
    if (id === 'fire') setEmbers(startEmbers(facts.dryLogs >= ENOUGH_DRY));   // сухі дрова з рутини «дрова» — інший вогонь
    if (id === 'berries') setBerries(startBerries(seed));
    if (id === 'tidy') { setTidy(startTidy()); setThing(null); }
    if (id === 'firewood') setStack(null);
    if (id === 'fish') { setFish(FISH_IDLE); setRod(false); }
  };

  // Ніч читає і ручне, і налагоджене — та сама модель фактів (camp-night), пристрої лише додають свої.
  const nightFacts: NightFacts = deviceFacts(devices, { results: dayNow.results, litLanterns: facts.lit, dryLogs: facts.dryLogs, water: facts.water, fish: facts.fish, bitterBerries: facts.bitter, foodOutside: facts.foodOut, emptyRounds: emptyRounds(day).length, weather, ...extra });

  // GAME-314: на дошці (не посеред роботи) і в ніч — у сейв; так результати переживають закриту панель і перезавантаження.
  const boardJson = JSON.stringify({ round, picks: day.picks, results: day.results, facts, devices });
  useEffect(() => { if (phase !== 'work') onSave?.(JSON.parse(boardJson) as CampBoardSave); }, [boardJson, phase]);

  const nightNow = phase === 'night';
  useEffect(() => { if (nightNow) onNight?.(nightFacts); }, [nightNow]);
  if (phase === 'night') {
    const night = nightOf(nightFacts);
    return (
      <div class="ui-overlay ui-camp" data-ui="camp-night" data-blocked={night.blocked ? 'yes' : 'no'}>
        <h2>{t('night.title')}</h2>
        <ul class="ui-camp-night">
          {night.beats.map((b: NightBeat) => (
            <li key={b.id} data-ui="night-beat" data-id={b.id} data-routine={b.routine} data-severity={b.severity}>{text ? text(b.id) : t(b.id as Key)}</li>
          ))}
        </ul>
        <p class="ui-camp-note" data-ui="night-morning">{t('night.morning')}</p>
        {onSummary && <button type="button" class="ui-btn ui-camp-big" data-ui="camp-summary" onClick={onSummary}>{t('sd.toSummary')}</button>}
      </div>
    );
  }

  if (phase === 'work' && active !== null) {
    return (
      <div class="ui-overlay ui-camp" data-ui="camp-work" data-kind={active} data-help={helpOf(active).hint ? 'yes' : 'no'}>
        <h2>{t(`camp.routine.${active}` as Key)}</h2>
        {helpOf(active).hint && <p class="ui-camp-note" data-ui="camp-help">{t('camp.help')}</p>}
        {active === 'water' && (
          <section class="ui-camp-work">
            <p data-ui="water-level" data-level={Math.round(water.level * 100)}>{`${t('camp.water.level')}: ${Math.round(water.level * 100)} %`}</p>
            <div class="ui-camp-bar" aria-hidden="true"><i style={{ width: `${Math.round(water.level * 100)}%` }} /></div>
            {water.phase === 'fill' ? (
              <button type="button" class="ui-btn ui-camp-big" data-ui="water-tap" aria-pressed={tap}
                onPointerDown={() => setTap(true)} onPointerUp={() => setTap(false)} onPointerLeave={() => setTap(false)}>{t('camp.water.tap')}</button>
            ) : (
              <>
                <p data-ui="water-steps">{`${t('camp.water.step')} ${water.step + 1} / ${STEPS}`}</p>
                <p data-ui="water-cue" data-side={needSide(water)}>{`${t('camp.water.cue')}: ${t(needSide(water) === 'left' ? 'camp.water.left' : 'camp.water.right')}`}</p>
                <div class="ui-camp-tilt" aria-label={t('camp.water.tilt')} data-tilt={Math.round(water.tilt * 100)}><i style={{ left: `${Math.round(50 + water.tilt * 45)}%` }} /></div>
                <div class="ui-camp-row">
                  {(['left', 'right'] as const).map((side: Side) => (
                    <button key={side} type="button" class="ui-btn ui-camp-big" data-ui="water-step" data-side={side}
                      onClick={() => setWater((s) => stepWater(s, { kind: 'step', side }, helpOf('water')).state)}>{t(side === 'left' ? 'camp.water.left' : 'camp.water.right')}</button>
                  ))}
                </div>
                <p data-ui="water-spills">{`${t('camp.water.spill')}: ${water.spills}`}</p>
              </>
            )}
          </section>
        )}
        {active === 'firewood' && (
          <section class="ui-camp-work">
            {stack === null ? (
              <div class="ui-camp-col">
                {(['near', 'far'] as const).map((p: WoodPlace) => (
                  <button key={p} type="button" class="ui-btn ui-camp-big" data-ui="wood-place-choice" data-place={p} onClick={() => setStack(startStack(p))}>{t(p === 'near' ? 'camp.wood.near' : 'camp.wood.far')}</button>
                ))}
              </div>
            ) : (
              <>
                <p data-ui="wood-room">{`${t('camp.wood.room')}: ${COVER - stack.under.length}`}</p>
                <ul class="ui-camp-list">
                  {LOGS.map((size, i) => {
                    const placed = stack.under.includes(i) || stack.outside.includes(i);
                    return (
                      <li key={i} data-ui="wood-log" data-i={i} data-size={size} data-placed={placed ? 'yes' : 'no'}>
                        <span>{t(`camp.wood.${size}` as Key)}</span>
                        <button type="button" class="ui-btn" data-ui="wood-under" data-i={i} disabled={placed} onClick={() => setStack((s) => (s ? placeLog(s, i, true).state : s))}>{t('camp.wood.under')}</button>
                        <button type="button" class="ui-btn" data-ui="wood-outside" data-i={i} disabled={placed} onClick={() => setStack((s) => (s ? placeLog(s, i, false).state : s))}>{t('camp.wood.outside')}</button>
                      </li>
                    );
                  })}
                </ul>
                <button type="button" class="ui-btn ui-camp-big" data-ui="wood-done" onClick={() => {
                  const s = finishStack(stack);
                  const dry = dryLogs(s);
                  finish('firewood', dry >= ENOUGH_DRY ? 'good' : dry >= ENOUGH_DRY / 2 ? 'fine' : 'scrappy', { dryLogs: dry });
                }}>{t('camp.next')}</button>
              </>
            )}
          </section>
        )}
        {active === 'fire' && (
          <section class="ui-camp-work">
            <p data-ui="fire-heat" data-heat={Math.round(embers.heat * 100)}>{`${t('camp.fire.heat')}: ${Math.round(embers.heat * 100)} %`}</p>
            <p data-ui="fire-dish" data-dish={DISHES[embers.dish]?.id ?? ''}>{DISHES[embers.dish] ? t(`camp.fire.dish.${DISHES[embers.dish]?.id}` as Key) : ''}</p>
            <div class="ui-camp-row">
              {(['wood', 'blow', 'rake'] as const).map((a: EmberAct) => (
                <button key={a} type="button" class="ui-btn ui-camp-big" data-ui="fire-act" data-act={a} onClick={() => setEmbers((s) => stepEmbers(s, { kind: 'act', act: a }, helpOf('fire')).state)}>{t(`camp.fire.${a}` as Key)}</button>
              ))}
            </div>
          </section>
        )}
        {active === 'lanterns' && (
          <section class="ui-camp-work">
            <p data-ui="lantern-sun" data-spot={lanterns.sun}>{`${t('camp.lantern.sun')}: ${t('camp.lantern.spot')} ${lanterns.sun + 1}`}</p>
            <ul class="ui-camp-list">
              {Array.from({ length: LANTERNS }, (_, l) => (
                <li key={l} data-ui="lantern" data-i={l} data-charge={Math.round((lanterns.charge[l] ?? 0) * 100)}>
                  <span>{`${t('camp.lantern.charge')} ${Math.round((lanterns.charge[l] ?? 0) * 100)} %`}</span>
                  {Array.from({ length: SPOTS }, (_, s) => (
                    <button key={s} type="button" class="ui-btn" data-ui="lantern-spot" data-l={l} data-s={s} aria-pressed={lanterns.at[l] === s}
                      onClick={() => setLanterns((x) => stepLanterns(x, { kind: 'put', lantern: l, spot: s }, helpOf('lanterns')).state)}>{`${t('camp.lantern.spot')} ${s + 1}`}</button>
                  ))}
                  <button type="button" class="ui-btn" data-ui="lantern-crank" data-l={l}
                    onClick={() => setLanterns((x) => stepLanterns(x, { kind: 'crank', lantern: l }, helpOf('lanterns')).state)}>{t('camp.lantern.crank')}</button>
                </li>
              ))}
            </ul>
            <button type="button" class="ui-btn ui-camp-big" data-ui="lantern-done" onClick={() => finish('lanterns', lanternOutcome(lanterns), { lit: litCount(lanterns) })}>{t('camp.next')}</button>
          </section>
        )}
        {active === 'fish' && (
          <section class="ui-camp-work">
            <p data-ui="fish-biting">{`${t('camp.fish.biting')}: ${speciesAt('afternoon', weather).join(', ')}`}</p>
            <p data-ui="fish-kept" data-kept={fish.kept}>{`${t('camp.fish.kept')}: ${fish.kept}`}</p>
            {fish.phase === 'choice' ? (
              <div class="ui-camp-row">
                <button type="button" class="ui-btn ui-camp-big" data-ui="fish-keep" onClick={() => setFish((s) => stepFish(s, { kind: 'choose', keep: true }, rng.current).state)}>{t('camp.fish.keep')}</button>
                <button type="button" class="ui-btn ui-camp-big" data-ui="fish-release" onClick={() => setFish((s) => stepFish(s, { kind: 'choose', keep: false }, rng.current).state)}>{t('camp.fish.release')}</button>
              </div>
            ) : (
              <button type="button" class="ui-btn ui-camp-big" data-ui="fish-rod" aria-pressed={rod}
                onPointerDown={() => setRod(true)} onPointerUp={() => setRod(false)} onPointerLeave={() => setRod(false)}>{t('camp.fish.rod')}</button>
            )}
            <button type="button" class="ui-btn" data-ui="fish-done" onClick={() => finish('fish', supperFish(fish.kept) ? 'good' : fish.kept > 0 ? 'fine' : 'scrappy', { fish: fish.kept })}>{t('camp.back')}</button>
          </section>
        )}
        {active === 'berries' && (
          <section class="ui-camp-work">
            <p data-ui="berry-basket">{`${t('camp.berry.basket')}: ${berries.basket.length} / ${BASKET}`}</p>
            <ul class="ui-camp-grid">
              {patchOf(berries.seed).map((b, i) => {
                const taken = berries.picked.includes(i);
                const doubt = hinted(berries, helpOf('berries')).includes(i);
                return (
                  <li key={i}>
                    <button type="button" class="ui-btn ui-camp-bush" data-ui="berry" data-i={i} data-taken={taken ? 'yes' : 'no'} data-doubt={doubt ? 'yes' : 'no'} disabled={taken}
                      onClick={() => setBerries((s) => pickBerry(s, i).state)}>
                      {`${t(b.shiny ? 'camp.berry.shiny' : 'camp.berry.matte')} · ${t(b.leaf === 'toothed' ? 'camp.berry.toothed' : 'camp.berry.smooth')}${doubt ? ` · ${t('camp.berry.doubt')}` : ''}`}
                    </button>
                  </li>
                );
              })}
            </ul>
            <button type="button" class="ui-btn ui-camp-big" data-ui="berry-enough" onClick={() => {
              const s = enoughBerries(berries);
              finish('berries', berryOutcome(s), { bitter: bitterCount(s) });
            }}>{t('camp.berry.enough')}</button>
          </section>
        )}
        {active === 'tidy' && (
          <section class="ui-camp-work">
            <p class="ui-camp-note" data-ui="tidy-hint">{t('camp.tidy.hint')}</p>
            <ul class="ui-camp-list">
              {THINGS.map((x) => {
                const where = tidy.put[x.id];
                return (
                  <li key={x.id} data-ui="tidy-thing" data-id={x.id} data-place={where ?? 'out'}>
                    <button type="button" class="ui-btn" data-ui="tidy-pick" data-id={x.id} aria-pressed={thing === x.id} onClick={() => setThing(x.id)}>{t(`camp.thing.${x.id}` as Key)}</button>
                    <span>{where === undefined ? t('camp.tidy.out') : t(`camp.tidy.${where}` as Key)}</span>
                  </li>
                );
              })}
            </ul>
            <div class="ui-camp-row">
              {PLACES.map((p) => (
                <button key={p} type="button" class="ui-btn ui-camp-big" data-ui="tidy-place" data-place={p} disabled={thing === null}
                  onClick={() => { if (thing !== null) { setTidy((s) => putThing(s, thing, p).state); setThing(null); } }}>{t(`camp.tidy.${p}` as Key)}</button>
              ))}
            </div>
            <button type="button" class="ui-btn ui-camp-big" data-ui="tidy-sleep" onClick={() => {
              const s = sleepNow(tidy);
              finish('tidy', tidyOutcome(s), { foodOut: foodOutside(s) });
            }}>{t('camp.tidy.sleep')}</button>
          </section>
        )}
      </div>
    );
  }

  const busy = campBusy(day, round);
  return (
    <div class="ui-overlay ui-camp" data-ui="camp-board" data-round={round} data-left={minutesLeft(day)}>
      <h2>{t('camp.title')}</h2>
      <p class="ui-camp-note" data-ui="camp-left">{`${t(`camp.round.${round}` as Key)} · ${t('camp.left')}: ${minutesLeft(day)}`}</p>
      <p class="ui-camp-note" data-ui="camp-skip">{t('camp.skip')}</p>
      <ul class="ui-camp-list">
        {ROUTINE_IDS.map((id) => {
          const no = whyNot(dayNow, id, round);
          const def = ROUTINES[id];
          const out = dayNow.results[id];
          const status = statusOf(devices, id);
          const dev = deviceFor(id);
          return (
            <li key={id}>
              <button type="button" class="ui-btn ui-camp-routine" data-ui="camp-routine" data-id={id} data-owner={def.owner} data-status={status} data-done={isDone(dayNow, id) ? 'yes' : 'no'} data-outcome={out ?? ''} data-blocked={no ?? ''}
                disabled={no !== null} onClick={() => open(id)}>
                <b>{`${t(`camp.routine.${id}` as Key)} · ${status === 'hands' ? t(`camp.owner.${def.owner}` as Key) : t(`camp.status.${status}` as Key)}`}</b>
                <small>{out !== undefined
                  ? `${t('camp.done')} · ${t(`camp.out.${out}` as Key)}`
                  : `${no === null ? t(`camp.why.${id}` as Key) : t(`camp.no.${no}` as Key)} · ${def.minutes[0]} ${t('camp.min')}`}</small>
              </button>
              {status === 'low' && dev !== null && (
                <button type="button" class="ui-btn" data-ui="camp-tend" data-id={id} onClick={() => setDevices((d) => tend(d, dev))}>{t('camp.tend')}</button>
              )}
            </li>
          );
        })}
      </ul>
      <p class="ui-camp-note" data-ui="camp-busy" data-away={awayIn(day, round).length}>
        {busy.length === 0 ? t('camp.alone') : `${t('camp.busy')}: ${busy.map((h) => `${t(`camp.owner.${h.member}` as Key)} — ${t(`camp.job.${h.job}` as Key)}`).join(', ')}`}
      </p>
      <div class="ui-camp-row">
        <button type="button" class="ui-btn ui-camp-big" data-ui="camp-next" disabled={round === 'evening'}
          onClick={() => setRound((r) => ROUNDS[Math.min(ROUNDS.length - 1, ROUNDS.indexOf(r) + 1)] as Round)}>{t('camp.next')}</button>
        <button type="button" class="ui-btn ui-camp-big" data-ui="camp-to-night" onClick={() => setPhase('night')}>{t('camp.night')}</button>
      </div>
    </div>
  );
}
