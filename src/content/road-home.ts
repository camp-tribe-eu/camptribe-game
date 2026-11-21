// GAME-351 · дорога ДОДОМУ після «згортаємо табір». Та сама міні-гра дороги (src/content/minigames/drive.ts, варіант homebound), id `mg.drive-home`.
// Окремого поля в сейві нема й не треба: «дорогу додому пройдено + результат» уже лежить у `game.minigames['mg.drive-home']` (команда FinishMinigame,
// форму стереже save.ts → 'game: minigames'). Старий сейв без запису = «ще не їхали», міграції не треба. Скіп («Точно пропустити?») пише той самий запис зі scrappy.
// Тут лише читання результату для порядку етапів (sample-day.dayStage) і підсумку дня. Етап R3 «прихід додому» читатиме те саме.
import type { MinigameResults, Outcome } from '../core/minigame';

export const ROAD_HOME_ID = 'mg.drive-home';
export const ROAD_HOME_OUTCOMES: readonly Outcome[] = ['good', 'fine', 'scrappy'];

/** Результат дороги додому; null — ще не їхали (або запис чужий: тоді не вірити йому). */
export function roadHomeResult(results: MinigameResults | undefined): Outcome | null {
  const last = results !== undefined && Object.hasOwn(results, ROAD_HOME_ID) ? results[ROAD_HOME_ID]?.last : undefined;
  return ROAD_HOME_OUTCOMES.find((o) => o === last) ?? null;
}
