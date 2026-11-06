// GAME-268 · чи світ повністю закритий екраном на все поле. Одне рішення в одному місці (чиста функція, src/ui/world-cover.test.ts):
// поки так, малювати Phaser нема чого — кадр світу під накладкою не бачить ніхто, а на слабкому телефоні він їв 80–93 % головного потоку.
// Рамка розмови (внизу) світ закриває лише частково — її тут немає навмисно: під нею світ має жити.
export interface CoverState {
  /** Меню паузи (‖ / Escape), разом із підтвердженням «Нова гра». */
  readonly paused: boolean;
  /** Екран подорожі ☰. */
  readonly storyOpen: boolean;
  /** Підсумок дня і екран «Що відкрилось» (вони йдуть під одним станом). */
  readonly summary: boolean;
  /** Атлас. */
  readonly atlasOpen: boolean;
}

export function worldCovered(s: CoverState): boolean {
  return s.paused || s.storyOpen || s.summary || s.atlasOpen;
}
