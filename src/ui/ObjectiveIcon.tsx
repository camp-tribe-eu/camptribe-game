// GAME-201 · та сама піктограма цілі, що над об'єктом на мапі, — у рядку мети й «Далі» шапки. Аркуш assets/icons/objective_icons.png різаний CSS-тлом
// (image-rendering: pixelated; клітинка 16 px показується в 1,5×). Без тексту: підпис мети поруч, тож іконка — aria-hidden.
import sheet from '../../assets/icons/objective_icons.png';
import itemSheet from '../../assets/icons/item_icons.png';
import { iconCss, itemIconCss, itemIconKey, objectiveIcon } from '../content/objective-icons';

const SCALE = 1.5;

export function ObjectiveIcon({ spot, scale = SCALE }: { spot: string | null | undefined; scale?: number }) {
  if (!spot) return null;
  const key = objectiveIcon(spot).key;
  return <span class="ui-oicon" data-ui="oicon" data-icon={key} aria-hidden="true" style={iconCss(key, sheet, scale)} />;
}

/** GAME-245: велика піктограма речі (картка «взято»): 16 px клітинка в 5× = 80 px на екрані. */
export function BigItemIcon({ spot }: { spot: string }) {
  const ik = itemIconKey(spot);
  if (ik) return <span class="ui-itemcard-icon" data-ui="itemcard-icon" data-icon={ik} aria-hidden="true" style={itemIconCss(ik, itemSheet, 3)} />;
  const key = objectiveIcon(spot).key;
  return <span class="ui-itemcard-icon" data-ui="itemcard-icon" data-icon={key} aria-hidden="true" style={iconCss(key, sheet, 5)} />;
}

/** GAME-263: піктограма речі в рюкзаку — 32-px клітинка в 2× (64 px, ≥ 2× тайла); без власної іконки — 16-px клітинка цілей у 4× (теж 64 px). */
export function PackItemIcon({ spot }: { spot: string }) {
  const ik = itemIconKey(spot);
  if (ik) return <span class="ui-oicon ui-bp-icon" data-ui="bp-icon" data-icon={ik} aria-hidden="true" style={itemIconCss(ik, itemSheet, 2)} />;
  const key = objectiveIcon(spot).key;
  return <span class="ui-oicon ui-bp-icon" data-ui="bp-icon" data-icon={key} aria-hidden="true" style={iconCss(key, sheet, 4)} />;
}
