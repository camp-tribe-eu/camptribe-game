// GAME-319 · дві речі дошки, що не бачать DOM: мітка «Клює!» і запис кількості ягід. Мутації (перевірено): прибрати розмітку з FishBiteCue /
// не викликати FishBiteCue за biteCue → червоніє; berryFacts без `berries` або finish без berryFacts → червоніє.
import src from './CampRoutines.tsx?raw';
import { describe, expect, it } from 'vitest';
import { FishBiteCue, FishSlot } from './CampRoutines';
import { berryFacts, startBerries } from '../content/berries-patch';
import { FISH_IDLE, SPECIES } from '../content/fishing';
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
  it('дошка малює мітку лише в фазі bite — усередині місця FishSlot, яке є завжди', () => {
    expect(src).toContain('{biteCue(fish) && <FishBiteCue fish={fish} t={t} />}');
    expect(src).toContain('<FishSlot fish={fish} t={t} />');
  });
});

// GAME-323 · місце під мітку / шкалу / «піймав» є в КОЖНІЙ фазі (його висоту фіксує css, її стереже e2e game-311), а вміст — за фазою.
// Мутації (перевірено): прибрати гілку reel з FishSlot → «шкала підсікання» червоніє; прибрати choice → «піймав» червоніє; FishSlot лише в bite → «місце є завжди».
describe('місце під мітку, шкалу й «піймав» (GAME-323)', () => {
  const slot = (phase: string, extra = {}) => FishSlot({ fish: { ...FISH_IDLE, phase: phase as 'idle', ...extra }, t }) as unknown as { props: Record<string, unknown> };
  const flat = (n: unknown): string => JSON.stringify(n);
  const has = (n: unknown, type: unknown): boolean => Array.isArray(n) ? n.some((x) => has(x, type)) : n !== null && typeof n === 'object' && 'type' in n ? (n as { type: unknown }).type === type || has((n as { props?: { children?: unknown } }).props?.children, type) : false;
  it('місце є в кожній фазі, а мітка — лише коли клює', () => {
    for (const ph of ['idle', 'charge', 'wait', 'bite', 'reel', 'choice']) expect(slot(ph).props['data-ui'], ph).toBe('fish-slot');
    expect(has(slot('bite'), FishBiteCue)).toBe(true);
    for (const ph of ['idle', 'wait', 'reel', 'choice']) expect(has(slot(ph), FishBiteCue), ph).toBe(false);
  });
  it('шкала підсікання: підказка, прогрес, зона й рибка — видно, що робити', () => {
    const v = flat(slot('reel', { progress: 0.5, zone: 0.5 }));
    expect(v).toContain('fish-reel');
    expect(v).toContain(t('camp.fish.reel'));
    expect(v).toContain('"width":"50%"');
    expect(v).toContain('ui-fish-zone');
  });
  it('«піймав»: назва виду після підсікання', () => {
    const v = flat(slot('choice', { species: 2 }));
    expect(v).toContain('fish-landed');
    expect(v).toContain(t(`fish.sp.${SPECIES[2]?.id}`));
    expect(v).toContain(t('camp.fish.landed'));
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
