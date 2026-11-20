// GAME-346 · репліка мешканця не лягає на підпис дії біля героя (L05).
// Мутація (перевірено): barkAvoiding завжди повертає `bottom` → «не перетинає підпис» червоніє.
import { describe, expect, it } from 'vitest';
import { barkAvoiding, type Box } from './bark-place';

const overlap = (a: Box, b: Box): boolean => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
const hint: Box = { x0: 100, y0: 100, x1: 180, y1: 112 };
const box = (bottom: number, h: number): Box => ({ x0: 110, y0: bottom - h, x1: 170, y1: bottom });

describe('barkAvoiding', () => {
  it('підпису нема або не заважає — репліка там, де була', () => {
    expect(barkAvoiding(150, 110, 170, 30, null, 0)).toBe(150);
    expect(barkAvoiding(60, 110, 170, 30, hint, 0)).toBe(60);
  });
  it('лягає на підпис — не перетинає його: зсувається вгору', () => {
    const b = barkAvoiding(120, 110, 170, 30, hint, 0);
    expect(overlap(box(b, 30), hint)).toBe(false);
    expect(b).toBeLessThan(120);
  });
  it('угорі нема місця (край кадру) — переходить під підпис, а не за межі кадру', () => {
    const b = barkAvoiding(120, 110, 170, 30, hint, 90);
    expect(overlap(box(b, 30), hint)).toBe(false);
    expect(b - 30).toBeGreaterThanOrEqual(hint.y1);
  });
});

// Проводка: сцена справді ставить репліку через barkAvoiding і дає їй рамку підпису з CampProps.hintBox (лише видимого підпису). Phaser у юніт-тесті не піднімається, тож — договір по тексту.
// Мутація (перевірено): у scene.ts прибрати виклик barkAvoiding (або hintBox()) → червоніє.
import scene from './scene.ts?raw';
import crate from './crate.ts?raw';
describe('проводка barkAvoiding (GAME-346)', () => {
  it('scene.updateBark → barkY → barkAvoiding(…, this.props.hintBox(), …); hintBox дивиться на видимий підпис', () => {
    expect(scene).toContain('this.barkY(s.y - 52, view.y, bark.text,');
    expect(scene).toContain('const raw = Math.round(Math.max(anchor, viewTop + text.height + 2));\n    return barkAvoiding(raw, x - text.width / 2, x + text.width / 2, text.height, this.props.hintBox(), viewTop);');
    expect(crate).toContain('if (!h || !h.visible) return null;');
  });
});
