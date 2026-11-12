// GAME-312 · поверхні міні-ігор місій сусідів (оболонка — MinigameHost, GAME-308). Лише дотик і перетягування одним пальцем; UI читає форму даних, значень з content не імпортує.
import type { ComponentType } from 'preact';
import type { SurfaceProps } from './MinigameHost';
import type { Key } from '../i18n';

interface SiftSurface { readonly cols: number; readonly rows: number; readonly cells: readonly string[]; readonly hintRow: number | null; readonly scoops: number; readonly sifting: boolean }
interface TuneSurface { readonly dial: number; readonly station: number | null; readonly signal: number; readonly lock: number; readonly need: number }
interface CrankSurface { readonly charge: number; readonly need: number; readonly pulse: number; readonly hint: boolean; readonly jerks: number }

const pct = (x: number): string => `${Math.max(0, Math.min(1, x)) * 100}%`;
/** Префікс ключів тексту гри: `mg.aerial-tune` → `mg.aerial` (підписи шкали, лічильника й кнопки). */
const PREFIX: Readonly<Record<string, string>> = { 'mg.aerial-tune': 'mg.aerial', 'mg.panel-aim': 'mg.panel', 'mg.tarp-tie': 'mg.tarp', 'mg.lantern-crank': 'mg.lantern', 'mg.trap-weave': 'mg.trap' };
const key = (id: string, part: string): Key => `${PREFIX[id] ?? 'mg.ref'}.${part}` as Key;

export function SiftSurface({ view, t, tap }: SurfaceProps) {
  const s = view.surface as SiftSurface;
  return (
    <div class="mg-sift" data-ui="mg-sift" data-scoops={s.scoops} data-sifting={s.sifting ? 'yes' : 'no'}>
      {s.cells.map((c, i) => {
        const col = i % s.cols; const row = Math.floor(i / s.cols);
        return (
          <button type="button" key={i} class="mg-sift-cell" data-ui="mg-sift-cell" data-cell={i} data-state={c} data-hint={s.hintRow === row ? 'yes' : 'no'} aria-label={t('mg.ring.cell')}
            onClick={() => tap({ x: (col + 0.5) / s.cols, y: (row + 0.5) / s.rows })} />
        );
      })}
    </div>
  );
}

export function TuneSurface({ view, t, drag, tap }: SurfaceProps) {
  const s = view.surface as TuneSurface;
  const at = (e: PointerEvent): { x: number; y: number } => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: (e.clientX - r.left) / Math.max(1, r.width), y: 0.5 };
  };
  return (
    <div class="mg-tune" data-ui="mg-tune" data-dial={s.dial.toFixed(3)} data-signal={s.signal.toFixed(2)} data-lock={s.lock}>
      <div class="mg-tune-dial" data-ui="mg-tune-dial" role="slider" aria-label={t(key(view.id, 'dial'))} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(s.dial * 100)} tabIndex={0}
        onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); drag(at(e)); }}
        onPointerMove={(e) => { if (e.buttons > 0) drag(at(e)); }}
        onPointerUp={(e) => { tap(at(e)); drag(null); }}>
        {s.station !== null && <div class="mg-tune-station" style={{ left: pct(s.station) }} />}
        <div class="mg-tune-needle" style={{ left: pct(s.dial) }} />
      </div>
      <div class="mg-meter" role="progressbar" aria-label={t(key(view.id, 'meter'))} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((s.lock / s.need) * 100)}><i style={{ width: pct(s.lock / s.need) }} /></div>
    </div>
  );
}

export function CrankSurface({ view, t, tap }: SurfaceProps) {
  const s = view.surface as CrankSurface;
  return (
    <div class="mg-crank" data-ui="mg-crank" data-charge={s.charge} data-jerks={s.jerks}>
      <div class="mg-crank-ring"><div class="mg-crank-pulse" data-hint={s.hint ? 'yes' : 'no'} style={{ width: pct(0.6 + 0.4 * (1 - s.pulse)), height: pct(0.6 + 0.4 * (1 - s.pulse)) }} /></div>
      <div class="mg-meter" role="progressbar" aria-label={t(key(view.id, 'meter'))} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((s.charge / s.need) * 100)}><i style={{ width: pct(s.charge / s.need) }} /></div>
      <button type="button" class="ui-btn mg-btn" data-ui="mg-crank-tap" onClick={() => tap({ x: 0.5, y: 0.5 })}>{t(key(view.id, 'tap'))}</button>
    </div>
  );
}

/** Поверхня за id міні-гри місії; null — не місійна гра. */
export const missionSurface = (id: string): ComponentType<SurfaceProps> | null =>
  id === 'mg.ring-sift' ? SiftSurface : ['mg.aerial-tune', 'mg.panel-aim', 'mg.tarp-tie'].includes(id) ? TuneSurface : ['mg.lantern-crank', 'mg.trap-weave'].includes(id) ? CrankSurface : null;
