// GAME-308 · звук результату міні-гри — лише через src/audio (CLAUDE.md: звук — один модуль) і лише наявні файли UI-звуків (нових ресурсів немає).
// «Сяк-так» звучить нейтрально, а не як невдача: покарання звуком теж докір (DAY-DESIGN §5a).
import { playUi, type UiSound } from './ui-sounds';

export type MinigameOutcome = 'good' | 'fine' | 'scrappy';

export const RESULT_SOUND: Readonly<Record<MinigameOutcome, UiSound>> = { good: 'confirm', fine: 'confirm', scrappy: 'press' };

export const playMinigameResult = (outcome: MinigameOutcome): boolean => playUi(RESULT_SOUND[outcome]);
