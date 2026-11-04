// GAME-224 · ЄДИНЕ джерело правди про «побічне»: взаємодії, нагороди й прапорці, що не впливають на сюжет.
// Раніше це були три ручні списки (story.ts requestFlags, moves.ts фільтр нагород за префіксами, виключення в тестах) —
// кожна нова побічна справа (лавка, фото, сліди, погода) мусила потрапити в усі, і те, що випало, множило простір станів
// повного перебору (story-offer.test: 36 тис. станів замість ~4,5 тис.). Тепер:
//   * SIDE_INTERACTIONS — і є взаємодіями ядра (slice-defs), і визначає, що косметичне (нагороди → SIDE_GRANTS);
//   * SIDE_EXTRA_FLAGS — прапорці побічного, що ставить не прохання (рибка, сліди, фото, лавка, сміття);
//   * перебір (moves.ts exploreView) читає лише StoryDefs.requestFlags / sideGrants, які story.ts бере звідси.
// Чесність («побічне» справді не читає сюжет) стереже side.test.ts: жоден квест, хвиля, життя чи пакування не читає
// побічний прапорець чи нагороду; розмова — лише розмови просильників і лише так, що вузол не лишається без виходу.
import type { InteractionDef } from '../core/defs';
import { FISH_FACTS } from './fish-fork';
import { photoFlags, photoInteractions } from './photos';
import { REPAIR_FLAG, REPAIR_INTERACTION, REPAIR_SPOT } from './repair';
import { requestInteractions } from './requests';
import { traceFlags, traceInteractions } from './traces';

export const LITTER_FLAG = 'f.litter-cleaned-ch1';
/** GAME-181: перше «погрітись» біля вогнища поза сценою — маленький секрет (+5 XP, раз). */
export const CAMPFIRE_INTERACTION: InteractionDef = { grantId: 'rw.campfire-warmth', moneyCents: 0, award: 'secret' };
/** GAME-170 зріз 2: чужі пакети біля води — добра справа без строку й поза хвилею; журнал пише запис, Еліза дякує. */
export const LITTER_INTERACTION: InteractionDef = { grantId: 'rw.litter-cleaned', moneyCents: 0, flags: [LITTER_FLAG], award: 'clean' };

/** Усі побічні взаємодії сцени за id об'єкта. Додав побічну справу — додай сюди, і перебір її вже не розрізняє. */
export const SIDE_INTERACTIONS: Readonly<Record<string, InteractionDef>> = {
  'obj.campfire': CAMPFIRE_INTERACTION,
  'obj.litter': LITTER_INTERACTION,
  ...requestInteractions(),
  ...traceInteractions(),
  ...photoInteractions(),
  [REPAIR_SPOT]: REPAIR_INTERACTION,
};

/** Нагороди побічних взаємодій (`grantId`): косметика для перебору. */
export const SIDE_GRANTS: readonly string[] = Object.values(SIDE_INTERACTIONS).map((i) => i.grantId);

/** Прапорці побічного, які ставить НЕ прохання (прохання дає requestFlags із requests.json): рибка, сліди, фото, лавка, сміття. */
export const SIDE_EXTRA_FLAGS: readonly string[] = [FISH_FACTS.kept, FISH_FACTS.released, FISH_FACTS.charred, FISH_FACTS.trustNora, ...traceFlags(), ...photoFlags(), REPAIR_FLAG, LITTER_FLAG];
