// GAME-319 · дві речі дошки, що не бачать DOM: мітка «Клює!» і запис кількості ягід. Мутації (перевірено): прибрати розмітку з FishBiteCue /
// не викликати FishBiteCue за biteCue → червоніє; berryFacts без `berries` або finish без berryFacts → червоніє.
import src from './CampRoutines.tsx?raw';
import { describe, expect, it } from 'vitest';
import { FishBiteCue } from './CampRoutines';
import { berryFacts, startBerries } from '../content/berries-patch';
import { FISH_IDLE } from '../content/fishing';
import uk from '../i18n/uk.json';

const t = (k: string): string => (uk as Record<string, string>)[k] ?? k;
const texts = (n: unknown): string[] => Array.isArray(n) ? n.flatMap(texts) : typeof n === 'string' ? [n] : n && typeof n === 'object' && 'props' in n ? texts((n as { props: { children?: unknown } }).props.children) : [];

describe('мітка поклівки', () => {
  it('FishBiteCue показує «Клює!», поплавок рухається разом із кадрами', () => {
    const v = FishBiteCue({ fish: { ...FISH_IDLE, phase: 'bite', t: 160 }, t }) as unknown as { props: Record<string, unknown> };
    expect(v.props['data-ui']).toBe('fish-bite');
    expect(texts(v).join('')).toContain('Клює!');
    expect(JSON.stringify(v.props.children)).toContain('translateY(5px)');
  });
  it('дошка малює мітку лише в фазі bite', () => {
    expect(src).toContain('{biteCue(fish) && <FishBiteCue fish={fish} t={t} />}');
  });
});

describe('кількість ягід у фактах дошки', () => {
  it('berryFacts несе розмір миски й гіркі', () => {
    const s = { ...startBerries(1), basket: ['ripe', 'ripe', 'bitter'] as const };
    expect(berryFacts({ ...s, basket: [...s.basket] })).toEqual({ bitter: 1, berries: 3 });
    expect(berryFacts(startBerries(1))).toEqual({ bitter: 0, berries: 0 });
  });
  it('рутина «ягоди» пише саме berryFacts', () => {
    expect(src).toContain("finish('berries', berryOutcome(s), berryFacts(s))");
  });
});
