// Чи можна дограти сейв на НИНІШНЬОМУ контенті (рецензія сейвів): перевірка id не бачить квесту, чий
// перехід або requires змінились, чи предмета, який давала вже видана нагорода. Тож — той самий
// обмежений пошук, що в бота: з завантаженого стану кінець розділу досяжний?
//   true — так; false — ні (сейв відкласти, не вантажити); undefined — ліміт вичерпано (вантажимо).
import type { CoreDefs } from '../core/defs';
import type { GameState } from '../core/state';
import { endReachable } from './bot';

export function saveViable(game: GameState, defs: CoreDefs, cap = 20_000): boolean | undefined {
  if (!game.player || game.campaignEnded) return true; // до створення персонажа чи після фіналу — нема чого дограти
  return endReachable(game, defs, new Map(), cap);
}
