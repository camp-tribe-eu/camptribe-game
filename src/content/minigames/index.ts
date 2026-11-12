// GAME-308 · реєстр міні-ігор. ЄДИНЕ місце, де гра стає відомою ядру (CoreDefs.minigames → команда FinishMinigame) і сторожам (minigames.test: усі три результати, межа 30–90 с, ключі uk+en).
// Додати міні-гру: 1) defineMinigame(...) у своєму файлі поруч; 2) додати її сюди; 3) ключі тексту в src/i18n/uk.json і en.json; 4) поверхня гри — компонент для MinigameHost (src/ui/MinigameHost.tsx).
import { minigameDefsOf, type AnyMinigame } from '../../core/minigame';
import { REFERENCE } from './reference';
import { EMBERS_GAME, NIGHT_CAMP_GAME } from './camp';

export const MINIGAMES: readonly AnyMinigame[] = [REFERENCE, EMBERS_GAME, NIGHT_CAMP_GAME];
export const MINIGAME_DEFS = minigameDefsOf(MINIGAMES);
export const minigameById = (id: string): AnyMinigame | undefined => MINIGAMES.find((m) => m.id === id);
