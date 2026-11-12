// GAME-308 · поверхня еталонної міні-гри (`mg.reference`): шкала з маркером і велика кнопка «Стоп» (один палець, ціль ≥ 48 px). Малює лише те, що дає MinigameDef.view.
import type { SurfaceProps } from './MinigameHost';

/** Форма даних, яку віддає content/minigames/reference.ts (UI не імпортує значень з content — лише читає форму). */
interface RefSurface {
  readonly marker: number;
  readonly scores: readonly number[];
  readonly need: number;
  readonly core: { readonly from: number; readonly to: number };
  readonly band: { readonly from: number; readonly to: number };
  readonly hint: boolean;
}

const pct = (x: number): string => `${Math.max(0, Math.min(1, x)) * 100}%`;
const span = (r: { readonly from: number; readonly to: number }): { left: string; width: string } => ({ left: pct(r.from), width: `${Math.max(0, Math.min(1, r.to) - Math.max(0, r.from)) * 100}%` });

export function ReferenceSurface({ view, t, tap }: SurfaceProps) {
  const s = view.surface as RefSurface;
  return (
    <div class="mg-ref" data-ui="mg-ref" data-marker={s.marker.toFixed(3)} data-hint={s.hint ? 'yes' : 'no'}>
      <div class="mg-ref-track" role="img" aria-label={t('mg.ref.track')}>
        <div class="mg-ref-band" style={span(s.band)} />
        <div class="mg-ref-core" data-hint={s.hint ? 'yes' : 'no'} style={span(s.core)} />
        <div class="mg-ref-marker" style={{ left: pct(s.marker) }} />
      </div>
      <div class="mg-ref-pips" aria-hidden="true">
        {Array.from({ length: s.need }, (_, i) => <span key={i} class="mg-ref-pip" data-score={s.scores[i] ?? ''} />)}
      </div>
      <button type="button" class="ui-btn mg-btn mg-ref-stop" data-ui="mg-ref-stop" onClick={() => tap({ x: 0.5, y: 0.5 })}>{t('mg.ref.stop')}</button>
    </div>
  );
}
