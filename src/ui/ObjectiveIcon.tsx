// GAME-201 · та сама піктограма цілі, що над об'єктом на мапі, — у рядку мети й «Далі» шапки. Аркуш assets/icons/objective_icons.png різаний CSS-тлом
// (image-rendering: pixelated; клітинка 16 px показується в 1,5×). Без тексту: підпис мети поруч, тож іконка — aria-hidden.
import sheet from '../../assets/icons/objective_icons.png';
import { iconCss, objectiveIcon } from '../content/objective-icons';

const SCALE = 1.5;

export function ObjectiveIcon({ spot }: { spot: string | null | undefined }) {
  if (!spot) return null;
  const key = objectiveIcon(spot).key;
  return <span class="ui-oicon" data-ui="oicon" data-icon={key} aria-hidden="true" style={iconCss(key, sheet, SCALE)} />;
}

/** GAME-245: велика піктограма речі (картка «взято»): 16 px клітинка в 5× = 80 px на екрані. */
export function BigItemIcon({ spot }: { spot: string }) {
  const key = objectiveIcon(spot).key;
  return <span class="ui-itemcard-icon" data-ui="itemcard-icon" data-icon={key} aria-hidden="true" style={iconCss(key, sheet, 5)} />;
}
