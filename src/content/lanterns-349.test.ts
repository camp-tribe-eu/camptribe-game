// GAME-349 · приймання №9: ніч не каже «риба на вогні» поруч із «Вогню не було»; ключі існують у двох мовах.
// Мутація (перевірено, див. звіт): у camp-night прибрати `fire === undefined ? 'night.fish.supper.cold' :` → тест «без вогню» червоніє.
import { describe, expect, it } from 'vitest';
import uk from '../i18n/uk.json';
import en from '../i18n/en.json';
import { NIGHT_FACTS, nightKeys, type NightFacts } from './camp-night';

const base: NightFacts = { ...NIGHT_FACTS, results: { fish: 'good', fire: 'good', firewood: 'good' }, fish: 2, dryLogs: 6 };

describe('GAME-349 · риба й вогонь у ночі', () => {
  it('з вогнем: риба на вогні', () => {
    const k = nightKeys(base);
    expect(k).toContain('night.fire.warm');
    expect(k).toContain('night.fish.supper');
    expect(k).not.toContain('night.fish.supper.cold');
  });
  it('без вогню (і без дров): жодної «риби на вогні» поруч із «Вогню не було»', () => {
    const k = nightKeys({ ...base, results: { fish: 'good' } });
    expect(k).toContain('night.fire.none');
    expect(k).not.toContain('night.fish.supper');
    expect(k).toContain('night.fish.supper.cold');
  });
  it('ключі є в uk і en, а слід без вогню не згадує вогонь як місце риби', () => {
    for (const d of [uk, en] as Record<string, string>[]) { expect(d['night.fish.supper.cold']).toBeTruthy(); expect(d['camp.lantern.noSun']).toBeTruthy(); expect(d['camp.fire.wetBoard']).toBeTruthy(); }
    expect((uk as Record<string, string>)['night.fish.supper.cold']).not.toMatch(/на вогні/);
  });
});
