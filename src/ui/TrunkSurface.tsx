// GAME-332 · поверхня «Багажника» для MinigameHost: сітка (двері праворуч, термосумка в кутку), лоток речей, «Повернути» й «Готово». Правила — content/minigames/trunk.ts; тут лише показ і дотик.
// Вхід — канонічні точки поля (ті самі формули, що в trunk.ts: сітка y<0,6, лоток 0,7, кнопки 0,9): розкладка екрана вільна, обидві орієнтації. Лише дотик одним пальцем, цілі ≥ 44 px.
import type { Key } from '../i18n';
import { ct } from '../i18n/content';
import type { AnyLang } from '../i18n';
import { itemSpot } from '../content/objective-icons';
import type { SurfaceProps } from './MinigameHost';
import { PackItemIcon } from './ObjectiveIcon';

type Cell = readonly [number, number];
interface TrunkItem { readonly id: string; readonly needed: boolean; readonly placed: boolean; readonly bad: boolean; readonly rot: number; readonly cells: readonly Cell[]; readonly at: { readonly r: number; readonly c: number } | null }
/** Форма даних із content/minigames/trunk.ts (UI читає лише форму). */
interface TrunkData {
  readonly w: number; readonly h: number; readonly cool: Cell; readonly items: readonly TrunkItem[]; readonly sel: number; readonly note: string;
  readonly balance: number; readonly tilt: boolean; readonly flags: readonly string[]; readonly missing: number; readonly hintCell: { readonly r: number; readonly c: number } | null; readonly cat: boolean; readonly bike: boolean;
}
const GRID_Y = 0.6; const TRAY_Y = 0.7; const BTN_Y = 0.9;

export function TrunkSurface({ view, t, tap }: SurfaceProps) {
  const s = view.surface as TrunkData;
  const lang = (document.documentElement.lang || 'uk') as AnyLang;
  const n = s.items.length;
  const owner = new Map<string, string>();
  for (const it of s.items) if (it.at) for (const [r, c] of it.cells) owner.set(`${r + it.at.r},${c + it.at.c}`, it.id);
  const cur = s.sel >= 0 ? s.items[s.sel] : undefined;
  const rules = s.flags.map((f) => t(`mg.trunk.rule.${f}` as Key));
  if (s.tilt) rules.push(t('mg.trunk.rule.tilt'));
  const left = s.items.filter((i) => !i.needed && !i.placed).length;
  return (
    <div class="mg-trunk" data-ui="mg-trunk" data-placed={s.items.filter((i) => i.placed).length} data-total={n} data-note={s.note} data-missing={s.missing} data-sel={cur?.id ?? ''}>
      <div class="mg-trunk-left">
        <div class="mg-trunk-grid" role="group" aria-label={t('mg.trunk.title')} style={{ '--cols': s.w, '--rows': s.h } as Record<string, number>}>
          {Array.from({ length: s.w * s.h }, (_, i) => {
            const c = i % s.w; const r = Math.floor(i / s.w);
            const id = owner.get(`${r},${c}`);
            const isCool = s.cool[0] === r && s.cool[1] === c;
            const it = id ? s.items.find((x) => x.id === id) : undefined;
            const same = (rr: number, cc: number): boolean => owner.get(`${rr},${cc}`) === id;
            const first = it?.at && it.cells.length > 0 && (it.cells[0] as Cell)[0] + it.at.r === r && (it.cells[0] as Cell)[1] + it.at.c === c;
            const hint = s.hintCell !== null && s.hintCell.r === r && s.hintCell.c === c;
            return (
              <button key={i} type="button" class="mg-trunk-cell" data-ui="trunk-cell" data-r={r} data-c={c} data-cool={isCool ? 'yes' : 'no'} data-item={id ?? ''} data-bad={it?.bad ? 'yes' : 'no'} data-hint={hint ? 'yes' : 'no'} data-door={c === s.w - 1 ? 'yes' : 'no'}
                data-top={id && same(r - 1, c) ? 'join' : ''} data-bottom={id && same(r + 1, c) ? 'join' : ''} data-left={id && same(r, c - 1) ? 'join' : ''} data-right={id && same(r, c + 1) ? 'join' : ''}
                aria-label={isCool ? t('mg.trunk.cool') : id ? ct(lang, `item.${id.replace(/^item\./, '')}`) : t('mg.trunk.cell')}
                onClick={() => tap({ x: (c + 0.5) / s.w, y: ((r + 0.5) / s.h) * GRID_Y })}>
                {isCool && <small>{t('mg.trunk.cool')}</small>}
                {first && id && <PackItemIcon spot={itemSpot(id)} />}
              </button>
            );
          })}
        </div>
        <p class="mg-trunk-door" aria-hidden="true">{`${t('mg.trunk.door')} ▶`}</p>
        <div class="mg-meter mg-trunk-balance" role="progressbar" aria-label={t('mg.trunk.balance')} aria-valuemin={-100} aria-valuemax={100} aria-valuenow={Math.round(s.balance * 100)} data-tilt={s.tilt ? 'yes' : 'no'}><i style={{ left: `${50 + s.balance * 50}%` }} /></div>
      </div>
      <div class="mg-trunk-right">
        <div class="mg-trunk-tray" role="group" aria-label={t('mg.trunk.title')}>
          {s.items.map((it, i) => (
            <button key={it.id} type="button" class="mg-trunk-item" data-ui="trunk-item" data-id={it.id} data-placed={it.placed ? 'yes' : 'no'} data-selected={s.sel === i ? 'yes' : 'no'} data-needed={it.needed ? 'yes' : 'no'}
              aria-pressed={s.sel === i} aria-label={ct(lang, `item.${it.id.replace(/^item\./, '')}`)} onClick={() => tap({ x: (i + 0.5) / n, y: TRAY_Y })}>
              <PackItemIcon spot={itemSpot(it.id)} />
            </button>
          ))}
        </div>
        <p class="mg-text mg-trunk-note" role="status" data-ui="trunk-note">{s.missing > 0 && s.note === 'none' ? t('mg.trunk.missing') : t(`mg.trunk.note.${s.note === 'none' ? 'pick' : s.note}` as Key)}</p>
        {left > 0 && <p class="mg-text mg-trunk-rules" data-ui="trunk-left" data-left={left}>{`${t('mg.trunk.left')}: ${left}`}</p>}
        {rules.length > 0 && <p class="mg-text mg-trunk-rules" data-ui="trunk-rules">{rules[0]}</p>}
        <div class="mg-trunk-btns">
          {cur && !cur.placed && (
            <span class="mg-trunk-shape" data-ui="trunk-shape" aria-hidden="true" style={{ '--sc': Math.max(...cur.cells.map((x) => x[1])) + 1 } as Record<string, number>}>
              {cur.cells.map(([r, c]) => <i key={`${r}-${c}`} style={{ gridRow: r + 1, gridColumn: c + 1 }} />)}
            </span>
          )}
          <button type="button" class="ui-btn mg-btn" data-ui="trunk-rotate" disabled={!cur || cur.placed} onClick={() => tap({ x: 0.25, y: BTN_Y })}>{t('mg.trunk.rotate')}</button>
          <button type="button" class="ui-btn mg-btn" data-ui="trunk-done" onClick={() => tap({ x: 0.75, y: BTN_Y })}>{t('mg.trunk.done')}</button>
        </div>
      </div>
    </div>
  );
}
