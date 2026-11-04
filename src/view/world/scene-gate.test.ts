// GAME-235: проводка у scene.ts (Phaser у юніті не піднімається) — охоронці на текст: скид мапи чистить talkingTo, сцена серця стоїть за heroBusy, «+1» за canForage.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const scene = readFileSync(new URL('./scene.ts', import.meta.url), 'utf8');
const rig = readFileSync(new URL('./camp-alive-rig.ts', import.meta.url), 'utf8');

describe('scene.ts · GAME-235', () => {
  it('teardown (скид мапи) чистить talkingTo', () => {
    const body = scene.slice(scene.indexOf('private teardown()'), scene.indexOf('private teardown()') + 400);
    expect(body).toMatch(/this\.talkingTo = null/);
  });
  it('hooks.heart() кличеться лише коли heroBusy(...) хибне', () => {
    expect(scene).toMatch(/!heroBusy\(\{[^}]*\}\)\) this\.hooks\.heart\?\.\(\)/);
  });
  it('плашка «+1» шишки/ягоди пропускається, коли canForage хибне', () => {
    expect(rig).toMatch(/f\.canForage && !f\.canForage\([^)]*\)\) return;/);
  });
});
