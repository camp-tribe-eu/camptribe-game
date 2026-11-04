// GAME-225 · підпис справи («Підбери гілки…») висить лише біля справи, а не над водою чи за пів табору.
// Мутація (вручну): labelNear → завжди true — червоніє «над озером підпису нема».
import { describe, expect, it } from 'vitest';
import { LABEL_RANGE, labelNear } from './label-range';

const block = { x: 720, y: 592 };
const branches = [{ x: 690, y: 580 }, { x: 750, y: 600 }];
describe('підпис справи руками — лише поруч', () => {
  it('біля гілки чи колоди підпис є', () => {
    expect(labelNear({ x: 700, y: 585 }, block, branches)).toBe(true);
    expect(labelNear({ x: block.x, y: block.y + LABEL_RANGE - 5 }, block, [])).toBe(true);
  });
  it('над озером (пірс, вода) й далеко від справи підпису нема', () => {
    expect(labelNear({ x: 1000, y: 240 }, block, branches)).toBe(false);
    expect(labelNear({ x: 900, y: 336 }, block, branches)).toBe(false);
    expect(labelNear({ x: block.x, y: block.y - LABEL_RANGE - 5 }, block, [])).toBe(false);
  });
  it('підібрана гілка підпису не тримає: лишилась лише колода', () => {
    expect(labelNear({ x: 690, y: 580 }, { x: 900, y: 592 }, [])).toBe(false);
    expect(labelNear({ x: 690, y: 580 }, { x: 900, y: 592 }, [{ x: 690, y: 580 }])).toBe(true);
  });
});
