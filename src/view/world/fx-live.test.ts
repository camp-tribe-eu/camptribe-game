// GAME-206 · живі дрібниці: кожна траєкторія — чиста функція, і кожна має перевірку, що вміє почервоніти (закон 1).
// Головна: дуга закиду сідає ТОЧНО в точку закиду й не стрибає (мутація «поплавок телепортується» — червона, див. негативні контролі).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  CAP, DUST_IDLE, DUST_LIFE_MS, DUST_STEP_PX, FX_COLORS, FX_PALETTE, carSway, castArc, castArcSamples, dustLook, exhaustPuffs, fireSparks, floatBob, grassBlades, groundKind, hash01,
  leanTarget, ripples, splashDrops, stepDust, stepLean, type Pt,
} from './fx-live';

const LPC = import.meta.glob<string>('../../../art/palette/lpc.json', { query: '?raw', import: 'default', eager: true });
const palette = new Set((JSON.parse(Object.values(LPC)[0] ?? '{}') as { colors?: string[] }).colors ?? []);
const RAW = import.meta.glob<string>(['./fx-live.ts', './fx-live-layer.ts', './fishing.ts'], { query: '?raw', import: 'default', eager: true });
const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

/** Найбільший крок між сусідніми точками дуги з n відрізків: хорда прямої + вклад підйому (похідна sin ≤ π·h/n). Неперервна дуга в межі; телепорт — ні. */
const maxStep = (pts: Pt[]): number => Math.max(...pts.slice(1).map((p, i) => Math.hypot(p.x - (pts[i]?.x ?? 0), p.y - (pts[i]?.y ?? 0))));
const stepBound = (from: Pt, to: Pt, h: number, n: number): number => (Math.hypot(to.x - from.x, to.y - from.y) + Math.PI * h) / n * 1.01;
const arbPt = fc.record({ x: fc.integer({ min: -2000, max: 2000 }), y: fc.integer({ min: -2000, max: 2000 }) });

describe('дуга закиду (castArc)', () => {
  it('k = 0 — рука, k = 1 — точно точка закиду (не поруч): будь-які цілі точки й висоти', () => {
    fc.assert(fc.property(arbPt, arbPt, fc.integer({ min: 0, max: 80 }), (from, to, h) => {
      expect(castArc(from, to, 0, h)).toEqual({ x: from.x, y: from.y });
      expect(castArc(from, to, 1, h)).toEqual({ x: to.x, y: to.y });
    }), { numRuns: 300 });
    // Конкретно, як у грі: герой (300, 400), рука на 18 px вище, вода за 24 + 60 px праворуч.
    expect(castArc({ x: 300, y: 382 }, { x: 384, y: 400 }, 1)).toEqual({ x: 384, y: 400 });
  });

  it('k поза 0..1 затискається: до польоту — в руці, після — у воді (не летить далі)', () => {
    expect(castArc({ x: 0, y: 0 }, { x: 10, y: 0 }, -0.5)).toEqual({ x: 0, y: 0 });
    expect(castArc({ x: 0, y: 0 }, { x: 10, y: 0 }, 1.7)).toEqual({ x: 10, y: 0 });
  });

  it('дуга підіймається над прямою посередині на всю висоту й лише вгору (y менше), симетрично', () => {
    const from = { x: 0, y: 0 }; const to = { x: 100, y: 0 };
    expect(castArc(from, to, 0.5, 34)).toEqual({ x: 50, y: -34 });
    for (let i = 1; i < 24; i++) { const p = castArc(from, to, i / 24, 34); expect(p.y).toBeLessThan(0); expect(p.y).toBeCloseTo(castArc(from, to, 1 - i / 24, 34).y, 9); }
  });

  it('неперервна: крок між сусідніми точками ≤ хорда + вклад підйому (24 відрізки, будь-які точки)', () => {
    fc.assert(fc.property(arbPt, arbPt, fc.integer({ min: 0, max: 80 }), (from, to, h) => {
      const pts = castArcSamples(from, to, h, 24);
      expect(pts).toHaveLength(25);
      expect(maxStep(pts)).toBeLessThanOrEqual(stepBound(from, to, h, 24));
    }), { numRuns: 300 });
  });

  it('негативний контроль «поплавок телепортується»: стрибок з руки у воду посеред польоту червоніє на тій самій межі', () => {
    const from = { x: 300, y: 382 }; const to = { x: 384, y: 400 };
    const teleport = (k: number): Pt => (k < 0.5 ? from : to);
    const pts = Array.from({ length: 25 }, (_, i) => teleport(i / 24));
    expect(maxStep(pts)).toBeGreaterThan(stepBound(from, to, 34, 24));
    // …і «стрибок в останній кадр» (летить прямо, а в кінці підскакує) — теж.
    const snap = Array.from({ length: 25 }, (_, i) => (i < 24 ? { x: from.x + (to.x - from.x) * (i / 24), y: from.y } : to));
    expect(maxStep(snap)).toBeGreaterThan(stepBound(from, to, 0, 24));
  });

  it('негативний контроль «сідає поруч»: дуга, що не долітає 4 px, червоніє на перевірці точки посадки', () => {
    const short = (from: Pt, to: Pt, k: number): Pt => castArc(from, { x: to.x - 4, y: to.y }, k);
    expect(short({ x: 0, y: 0 }, { x: 100, y: 0 }, 1)).not.toEqual({ x: 100, y: 0 });
  });

  it('у fishing.ts поплавок летить саме цією дугою (а не власною формулою поруч)', () => {
    const src = RAW['./fishing.ts'] ?? '';
    expect(src).toContain('castArc(');
    expect(src).not.toMatch(/Math\.sin\(k \* Math\.PI\) \* 34/);
  });
});

describe('хвилі й вода', () => {
  it('гойдання поплавка — у межах ±2,1 px і ±0,12 рад, плавне (сусідні кадри 16 мс — < 0,1 px)', () => {
    for (let t = 0; t < 20_000; t += 16) {
      const a = floatBob(t); const b = floatBob(t + 16);
      expect(Math.abs(a.dy)).toBeLessThanOrEqual(2.1); expect(Math.abs(a.tilt)).toBeLessThanOrEqual(0.12);
      expect(Math.abs(a.dy - b.dy)).toBeLessThan(0.1);
    }
    expect(floatBob(0)).toEqual({ dy: 0, tilt: 0 });
  });

  it('кільця: рівно CAP.ripples, радіус 2..maxR, що більше кільце — то блідіше, і через період та сама картинка', () => {
    const r = ripples(1234);
    expect(r).toHaveLength(CAP.ripples);
    for (const k of r) { expect(k.r).toBeGreaterThanOrEqual(2); expect(k.r).toBeLessThanOrEqual(12); expect(k.alpha).toBeGreaterThanOrEqual(0); expect(k.alpha).toBeLessThanOrEqual(0.55); }
    const byR = [...r].sort((a, b) => a.r - b.r);
    for (let i = 1; i < byR.length; i++) expect(byR[i]?.alpha).toBeLessThan(byR[i - 1]?.alpha ?? 0);
    ripples(1234 + 1100).forEach((k, i) => { expect(k.r).toBeCloseTo(r[i]?.r ?? -1, 9); expect(k.alpha).toBeCloseTo(r[i]?.alpha ?? -1, 9); });
    expect(ripples(500, 12, 1100, 99)).toHaveLength(CAP.ripples);
  });

  it('краплі сплеску: у мить 0 усі в точці удару, далі розлітаються й гаснуть; те саме зерно — та сама картинка, інше — інша', () => {
    for (const d of splashDrops(0, 1)) { expect(Math.abs(d.dx)).toBe(0); expect(Math.abs(d.dy)).toBe(0); expect(d.alpha).toBe(1); }
    const mid = splashDrops(0.5, 1);
    expect(mid).toHaveLength(CAP.drops);
    expect(mid.some((d) => d.dx > 0) && mid.some((d) => d.dx < 0)).toBe(true);
    for (const d of splashDrops(1, 1)) expect(d.alpha).toBe(0);
    expect(splashDrops(0.3, 7)).toEqual(splashDrops(0.3, 7));
    expect(splashDrops(0.3, 7)).not.toEqual(splashDrops(0.3, 8));
    expect(splashDrops(0.3, 7, 50)).toHaveLength(CAP.drops);
  });
});

describe('авто на дорозі', () => {
  it('дим: ≤ CAP клубків, пливуть у бік `back` і вгору, тануть із віком, фази різні; детерміновано від часу', () => {
    for (const back of [-1, 1] as const) {
      const p = exhaustPuffs(777, 1, back);
      expect(p).toHaveLength(CAP.exhaust);
      for (const e of p) { expect(Math.sign(e.dx)).toBe(back); expect(e.dy).toBeLessThan(0); expect(e.alpha).toBeGreaterThanOrEqual(0); expect(e.alpha).toBeLessThanOrEqual(0.5); expect(e.r).toBeGreaterThanOrEqual(1); }
      expect(new Set(p.map((e) => e.r.toFixed(2))).size).toBeGreaterThan(1);
    }
    expect(exhaustPuffs(777, 1)).toEqual(exhaustPuffs(777, 1));
    expect(exhaustPuffs(777, 1, -1, 40)).toHaveLength(CAP.exhaust);
  });

  it('мікропогойдування: під піксель (|dy| < 0,5) і кут < 0,005 рад — видно як життя, не як стрибки', () => {
    for (let t = 0; t < 5000; t += 7) { const s = carSway(t); expect(Math.abs(s.dy)).toBeLessThan(0.5); expect(Math.abs(s.angle)).toBeLessThan(0.005); }
    expect(carSway(0)).toEqual({ dy: 0, angle: 0 });
  });
});

describe('вогнище й земля під ногами', () => {
  it('іскри: ≤ CAP, усі летять угору (dy < 0), гаснуть із віком, гарячі — лише молоді; не всі в одній фазі; детерміновано', () => {
    const s = fireSparks(4321, 1);
    expect(s).toHaveLength(CAP.sparks);
    for (const k of s) { expect(k.dy).toBeLessThan(0); expect(k.alpha).toBeGreaterThanOrEqual(0); expect(k.alpha).toBeLessThanOrEqual(1); if (k.hot) expect(k.alpha).toBeGreaterThan(0.65); }
    expect(new Set(s.map((k) => k.alpha.toFixed(2))).size).toBeGreaterThan(2);
    expect(fireSparks(4321, 1)).toEqual(fireSparks(4321, 1));
    expect(fireSparks(4321, 1, 99)).toHaveLength(CAP.sparks);
  });

  it('нахил трави наближається до цілі, не перескакує її, а довгий кадр не кидає далі за ціль', () => {
    let l = 0;
    for (let i = 0; i < 20; i++) { const n = stepLean(l, 1, 16); expect(n).toBeGreaterThan(l); expect(n).toBeLessThanOrEqual(1); l = n; }
    expect(stepLean(0, 1, 100_000)).toBeCloseTo(1, 6);
    expect(stepLean(0.8, 0, 16)).toBeLessThan(0.8);
    expect(stepLean(0.5, 0.5, 16)).toBe(0.5);
    expect(leanTarget({ x: 3, y: 0 }, true)).toBe(1); expect(leanTarget({ x: -3, y: 1 }, true)).toBe(-1);
    expect(leanTarget({ x: 3, y: 0 }, false)).toBe(0); expect(leanTarget({ x: 0, y: 2 }, true)).toBe(0);
  });

  it('стебла: ≤ CAP, коло ніг (|dx| ≤ 11, |dy| ≤ 3), висота 3..5, верхівка гнеться з нахилом', () => {
    const b = grassBlades(0, 1, 1);
    expect(b).toHaveLength(CAP.blades);
    for (const s of b) { expect(Math.abs(s.dx)).toBeLessThanOrEqual(11); expect(Math.abs(s.dy)).toBeLessThanOrEqual(3); expect(s.h).toBeGreaterThanOrEqual(3); expect(s.h).toBeLessThanOrEqual(5); }
    const flat = grassBlades(0, 0, 1); const bent = grassBlades(0, 1, 1);
    for (let i = 0; i < flat.length; i++) expect((bent[i]?.tip ?? 0) - (flat[i]?.tip ?? 0)).toBeCloseTo(3, 9);
    expect(grassBlades(0, 0, 1, 50)).toHaveLength(CAP.blades);
  });

  it('рід землі: трава terrain (локальні 180..183) — grass; стежка terrain — earth; поза набором (підлога дому, намет) і порожньо — none', () => {
    // Табір: lpc-terrain з gid 1, 1024 тайли; camp-tent від 1025. Стежка табору — gid 181 (локальний 180, коричневий тайл), трава — 182..184.
    for (const g of [182, 183, 184]) expect(groundKind(g, 1, 1024)).toBe('grass');
    for (const g of [181, 392, 360, 424, 1, 1024]) expect(groundKind(g, 1, 1024)).toBe('earth');
    for (const g of [0, -1, 1025, 1143]) expect(groundKind(g, 1, 1024)).toBe('none');
    // Дім і дорога: terrain від 1025; смуга дороги — gid 1205 (локальний 180), узбіччя 1206..1208; підлога дому (13) — не terrain.
    expect(groundKind(1205, 1025, 1024)).toBe('earth'); for (const g of [1206, 1207, 1208]) expect(groundKind(g, 1025, 1024)).toBe('grass');
    expect(groundKind(1497, 1025, 1024)).toBe('earth'); expect(groundKind(13, 1025, 1024)).toBe('none');
    expect(groundKind(181, 0, 0)).toBe('none');
  });

  it('пил: на траві не народжується; на землі — клубок на кожні DUST_STEP_PX; не більше CAP.dust; живе DUST_LIFE_MS; пауза (dt 0) не старить', () => {
    let s = DUST_IDLE;
    for (let i = 0; i < 50; i++) s = stepDust(s, { x: 0, y: 0, movedPx: 4, ground: 'grass', dtMs: 16 });
    expect(s.puffs).toHaveLength(0); expect(s.walked).toBe(0);
    s = DUST_IDLE;
    for (let i = 0; i < 5; i++) s = stepDust(s, { x: 100, y: 50, movedPx: 4, ground: 'earth', dtMs: 16 });
    expect(s.puffs).toHaveLength(0); expect(s.walked).toBe(20);
    s = stepDust(s, { x: 104, y: 50, movedPx: 4, ground: 'earth', dtMs: 16 });
    expect(s.puffs).toHaveLength(1); expect(s.walked).toBe(24 - DUST_STEP_PX); expect(s.puffs[0]?.age).toBe(0); expect(Math.abs((s.puffs[0]?.x ?? 0) - 104)).toBeLessThanOrEqual(4);
    const paused = stepDust(s, { x: 104, y: 50, movedPx: 0, ground: 'earth', dtMs: 0 });
    expect(paused.puffs[0]?.age).toBe(0); expect(paused.walked).toBe(0);   // стояв — лічильник кроку скинуто
    for (let i = 0; i < 400; i++) s = stepDust(s, { x: 104 + i, y: 50, movedPx: 4, ground: 'earth', dtMs: 16 });
    expect(s.puffs.length).toBeLessThanOrEqual(CAP.dust); expect(s.puffs.length).toBeGreaterThan(0);
    s = stepDust(s, { x: 0, y: 0, movedPx: 0, ground: 'earth', dtMs: DUST_LIFE_MS });
    expect(s.puffs).toHaveLength(0);
    const look0 = dustLook({ x: 0, y: 0, age: 0, seed: 1 }); const look1 = dustLook({ x: 0, y: 0, age: DUST_LIFE_MS, seed: 1 });
    expect(Math.abs(look0.dy)).toBe(0); expect(look0.r).toBe(1); expect(look0.alpha).toBe(0.5); expect(look1.alpha).toBe(0); expect(look1.r).toBe(3);
  });
});

describe('детермінізм, палітра, межі модуля', () => {
  it('hash01 — у [0, 1), стабільний, різний для різних номерів і зерен', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) { const h = hash01(i, 5); expect(h).toBeGreaterThanOrEqual(0); expect(h).toBeLessThan(1); seen.add(h); }
    expect(seen.size).toBeGreaterThan(190);
    expect(hash01(3, 9)).toBe(hash01(3, 9)); expect(hash01(3, 9)).not.toBe(hash01(3, 10));
  });

  it('кожен колір ефектів є в палітрі LPC (art/palette/lpc.json), палітра прочитана', () => {
    expect(palette.size).toBeGreaterThan(400);
    expect(FX_COLORS.length).toBe(Object.keys(FX_PALETTE).length);
    for (const c of FX_COLORS) expect(palette.has(hex(c)), `${hex(c)} немає в палітрі`).toBe(true);
    expect(palette.has(hex(0x9ad0ff)), 'негативний контроль: стара синь сплеску поза палітрою').toBe(false);
  });

  it('fx-live.ts — чиста математика: без Phaser, без Math.random, без таймерів; шар і рибалка — без Math.random і tween', () => {
    const pure = RAW['./fx-live.ts'] ?? '';
    expect(pure.length).toBeGreaterThan(1000);
    expect(pure).not.toMatch(/from 'phaser'/);
    for (const f of Object.values(RAW)) { expect(f).not.toMatch(/Math\.random/); expect(f).not.toMatch(/tweens\.|setTimeout|setInterval|requestAnimationFrame|delayedCall/); }
  });
});
