// GAME-333 · поле «Вузлів»: кільця тенту посередині, кілки навколо, мотузки між ними. Лише показ і дотики — правила в src/content/guy-lines.
// Дотик по кільцю, тоді по кілку; ще раз по з'єднаному кільцю — зняти. Підказка (після двох «сяк-так») малює перетини червоним і довжини числами.
import type { Key } from '../i18n';
import { bandFor, windPath, crossingPairs, levelOf, lineLen, tensionOf, windward, type KnotState } from '../content/guy-lines';
import type { Difficulty } from '../content/minigame';

export interface KnotsFieldProps {
  readonly s: KnotState;
  readonly t: (k: Key) => string;
  readonly help: Difficulty;
  readonly onRing: (i: number) => void;
  readonly onPeg: (j: number) => void;
}

export function KnotsField({ s, t, help, onRing, onPeg }: KnotsFieldProps) {
  const l = levelOf(s.seed);
  const w = windward(l);
  const crossing = new Set(help.hint ? crossingPairs(l, s.links).flat() : []);
  return (
    <div class="ui-knots" data-ui="knots-field" data-seed={s.seed} data-linked={s.links.filter((p) => p >= 0).length}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <polygon class="ui-knots-tarp" points={l.rings.map((r) => `${r.x},${r.y}`).join(' ')} />
        {l.rings.map((r, i) => {
          const j = s.links[i] ?? -1;
          const p = l.pegs[j];
          const len = lineLen(l, s.links, i);
          return p && len !== null ? (
            <g key={i}>
              <line class="ui-knots-line" data-ui="knot-line" data-i={i} data-state={tensionOf(len, help)} data-cross={crossing.has(i) ? 'yes' : 'no'} x1={r.x} y1={r.y} x2={p.x} y2={p.y} />
              {help.hint && <text class="ui-knots-len" x={(r.x + p.x) / 2} y={(r.y + p.y) / 2}>{Math.round(len)}</text>}
            </g>
          ) : null;
        })}
        <path class="ui-knots-wind" data-ui="knot-wind" d={windPath(l.wind)} />
      </svg>
      {l.rings.map((r, i) => (
        <button key={`r${i}`} type="button" class="ui-btn ui-knots-ring" data-ui="knot-ring" data-i={i} data-wind={w.includes(i) ? 'yes' : 'no'} data-linked={(s.links[i] ?? -1) >= 0 ? 'yes' : 'no'}
          aria-pressed={s.sel === i} aria-label={`${t('camp.knots.ring')} ${i + 1}${w.includes(i) ? ` · ${t('camp.knots.wind')}` : ''}`} style={{ left: `${r.x}%`, top: `${r.y}%` }} onClick={() => onRing(i)} />
      ))}
      {l.pegs.map((p, j) => (
        <button key={`p${j}`} type="button" class="ui-btn ui-knots-peg" data-ui="knot-peg" data-j={j} data-used={s.links.includes(j) ? 'yes' : 'no'}
          aria-label={`${t('camp.knots.peg')} ${j + 1}`} style={{ left: `${p.x}%`, top: `${p.y}%` }} onClick={() => onPeg(j)} />
      ))}
    </div>
  );
}

/** Рядок смуги довжин для підказки. */
export const bandText = (t: (k: Key) => string, help: Difficulty): string => { const b = bandFor(help); return `${t('camp.knots.band')}: ${Math.round(b.min)}-${Math.round(b.max)}`; };
