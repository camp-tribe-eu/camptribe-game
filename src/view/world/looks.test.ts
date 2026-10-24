// GAME-114 · сторож: жоден шаблон вигляду (родина + NPC) не збігається з іншим. Збіг = ті самі шари в тому ж порядку І ті самі tint.
import { describe, expect, it } from 'vitest';
import { ELISE_LOOK, FAMILY_LOOKS, NPC_LOOKS, PLAYER_LOOK } from './art';
import type { LayerSpec } from './character';

const signature = (look: readonly LayerSpec[]): string => JSON.stringify(look.map((l) => [l.url, l.tint ?? null]));

describe('шаблони вигляду', () => {
  const all: ReadonlyArray<readonly [string, readonly LayerSpec[]]> = [
    ...Object.entries(FAMILY_LOOKS).map(([k, v]) => [`family.${k}`, v] as const),
    ...Object.entries(NPC_LOOKS).map(([k, v]) => [`npc.${k}`, v] as const),
  ];

  it('жодні два шаблони (родина + NPC) не однакові', () => {
    const seen = new Map<string, string>();
    for (const [name, look] of all) {
      const sig = signature(look);
      expect(seen.get(sig), `${name} збігається з ${seen.get(sig) ?? ''}`).toBeUndefined();
      seen.set(sig, name);
    }
    expect(all.length).toBeGreaterThanOrEqual(3);
  });

  it('гравець — George, Eliza в реєстрі NPC — саме ELISE_LOOK', () => {
    expect(PLAYER_LOOK).toBe(FAMILY_LOOKS.george);
    expect(NPC_LOOKS.elise).toBe(ELISE_LOOK);
  });
});
