// Рецензія PR #146: ефект, доданий з end() іншого ефекту (сплеск після кидка поплавця), мусить відіграти й прибрати за собою.
import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({ default: {} }));
const { FrameFx } = await import('./hand-fx');

describe('FrameFx', () => {
  it('ефект, доданий з end(), відіграє до кінця і викликає свій end', () => {
    const fx = new FrameFx({} as never);
    const seen: number[] = [];
    let innerEnded = false;
    fx.push(100, () => {}, () => { fx.push(100, (k) => seen.push(k), () => { innerEnded = true; }); });
    fx.update(100);   // перший закінчився, додав другий
    fx.update(50);
    fx.update(50);
    expect(seen).toEqual([0.5, 1]);
    expect(innerEnded).toBe(true);
  });
  it('clear() прибирає й ефекти, додані з end() під час очищення, наступним update', () => {
    const fx = new FrameFx({} as never);
    let inner = 0;
    fx.push(100, () => {}, () => { fx.push(10, () => {}, () => { inner++; }); });
    fx.clear();
    fx.update(10);
    expect(inner).toBe(1);
  });
});
