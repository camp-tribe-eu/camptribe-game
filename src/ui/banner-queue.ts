// GAME-260 · банери («Нове звання», «Пора спати», «Ви заснули») — у черзі за екранами: показуються, лише коли нічого не закриває поле гри
// (рамка розмови, екран подорожі, підсумок, пауза, атлас, картка розділу, вступ). Банер, що чекає, не втрачається: стан лишається, а лічильник
// його життя — ігровий годинник, який на цих екранах стоїть. Таймерів реального часу немає.
export interface BannerBlockers {
  readonly paused: boolean;
  readonly storyOpen: boolean;
  readonly talk: boolean;
  readonly summary: boolean;
  readonly atlasOpen: boolean;
  /** GAME-244: рюкзак. */
  readonly backpackOpen: boolean;
  readonly episode: boolean;
  readonly intro: boolean;
}

export const bannersOpen = (b: BannerBlockers): boolean => !(b.paused || b.storyOpen || b.talk || b.summary || b.atlasOpen || b.backpackOpen || b.episode || b.intro);
