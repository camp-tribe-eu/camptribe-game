// GAME-201 · та сама піктограма цілі, що над об'єктом на мапі, — у рядку мети й «Далі» шапки. Аркуш assets/icons/objective_icons.png різаний CSS-тлом
// (image-rendering: pixelated; клітинка 16 px показується в 1,5×). Без тексту: підпис мети поруч, тож іконка — aria-hidden.
import sheet from '../../assets/icons/objective_icons.png';
import { ICON_COLS, ICON_SIZE, iconCell, objectiveIcon } from '../content/objective-icons';

const SCALE = 1.5;

export function ObjectiveIcon({ spot }: { spot: string | null | undefined }) {
  if (!spot) return null;
  const key = objectiveIcon(spot).key;
  const c = iconCell(key);
  const px = ICON_SIZE * SCALE;
  return <span class="ui-oicon" data-ui="oicon" data-icon={key} aria-hidden="true"
    style={{ width: `${px}px`, height: `${px}px`, backgroundImage: `url(${sheet})`, backgroundSize: `${ICON_COLS * px}px auto`, backgroundPosition: `-${c.x * SCALE}px -${c.y * SCALE}px` }} />;
}
