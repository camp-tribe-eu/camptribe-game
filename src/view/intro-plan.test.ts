// GAME-303 · сторож розстановки кадрів вступу: меблі стоять НА підлозі, а не висять на стіні (знайшов власник на знімках проби). Для кожної кімнати й кожного реального розміру кадру
// (панель комікса в портреті й ландшафті, повнокадровий кадр) — низ кожної твердої речі нижче лінії плінтуса й у смузі підлоги, спинка/узголів'я біля стіни, на стіні лише картина й вікно.
import { describe, expect, it } from 'vitest';
import type { RoomId } from '../content/intro-scene';
import { floorLine, roomPlan } from './intro-plan';

const ROOMS: readonly RoomId[] = ['matthew', 'george', 'victoria'];
/** Логічні розміри кадру (CSS ÷ ціле збільшення): панель 358×232 і 290×326 при ×2, повний кадр портрета 390×600 і ландшафту 932×270 при ×3 / ×2. */
const SIZES: readonly (readonly [number, number])[] = [[179, 116], [145, 163], [130, 200], [195, 300], [466, 135], [310, 160]];

describe('intro-plan: розстановка за законом «речі стоять на підлозі»', () => {
  for (const [w, h] of SIZES) for (const room of ROOMS) {
    it(`${room} ${w}×${h}`, () => {
      const plan = roomPlan(w, h, room);
      const { floorY } = plan;
      expect(floorY, 'лінія плінтуса в межах кадру').toBeGreaterThan(0);
      expect(floorY).toBeLessThan(h);
      for (const p of plan.pieces) {
        const base = p.y + p.h;
        if (p.wall) {
          expect(['painting', 'window']).toContain(p.id);   // на стіні висить лише картина й вікно
          expect(base, `${p.id}: стінна річ не заходить на підлогу`).toBeLessThanOrEqual(floorY);
        } else {
          expect(base, `${p.id}: низ (${base}) нижче лінії плінтуса (${floorY}) — річ стоїть на підлозі`).toBeGreaterThan(floorY);
          expect(base, `${p.id}: низ (${base}) у смузі підлоги (до ${h})`).toBeLessThanOrEqual(h);
        }
        if (p.backToWall) expect(p.y, `${p.id}: спинка/узголів'я біля стіни — верх (${p.y}) вище плінтуса (${floorY})`).toBeLessThan(floorY);
        expect(p.y, `${p.id}: не обрізано зверху`).toBeGreaterThanOrEqual(0);
        expect(p.x, `${p.id}: не обрізано зліва`).toBeGreaterThanOrEqual(0);
        expect(p.x + p.w, `${p.id}: не обрізано справа`).toBeLessThanOrEqual(w);
      }
      expect(plan.feet, 'ноги людини на підлозі, нижче плінтуса').toBeGreaterThan(floorY);
      expect(plan.feet).toBeLessThanOrEqual(h);
      expect(plan.feet - 58, 'голова людини в кадрі').toBeGreaterThanOrEqual(0);
    });
  }

  it('спальня має ліжко, вітальня — диван; обидві мають торшер/картину з підлогою під собою', () => {
    for (const [w, h] of SIZES) {
      expect(roomPlan(w, h, 'matthew').pieces.some((p) => p.id === 'bed')).toBe(true);
      expect(roomPlan(w, h, 'victoria').pieces.some((p) => p.id === 'bed')).toBe(true);
      expect(roomPlan(w, h, 'george').pieces.some((p) => p.id === 'sofa')).toBe(true);
    }
  });

  it('лінія плінтуса залишає під ліжком смугу підлоги (низ ліжка вміщається в кадр)', () => {
    for (let h = 116; h <= 400; h += 4) expect(floorLine(h) + 74).toBeLessThanOrEqual(h);
  });
});
