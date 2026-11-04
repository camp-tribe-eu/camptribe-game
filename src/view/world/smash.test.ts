// GAME-228 · «Розбивання»: уламки, знахідка (підскок, відскок, магніт, зменшення), плашка, тварини недоторкані, речі табору на мапі.
// Мутації (вручну, кожна червоніє — див. PR): (1) прибрати магніт знахідки (POP_MAGNET_R → 0) — червоніє «знахідка летить до героя»; (2) debrisCount → 0 і crumbCount → 0 — червоніють «уламків 4–7», «крихти 3–6, гаснуть за 30 кадрів»;
// (3) pickSmash без фільтра `kind !== 'prop'` (тварина — ціль) — червоніє «тварини недоторкані»; (4) звук мимо src/audio (new AudioContext у smash-rig) — червоніє сторож audio-boundary.test.ts.
import { describe, expect, it } from 'vitest';
import { COLLECT_R, EAT_MS, FALL_MS, FRAME_MS, REACTIONS, itemAt, stepItems, type Item } from './camp-alive';
import { CAMP_SPECS } from '../../audio/camp-sounds';
import uk from '../../i18n/uk.json';
import en from '../../i18n/en.json';
import {
  BRANCH_SHAKE, DEBRIS_FRAMES, DEBRIS_MS, FIND_KEY, FIND_OF, FREEZE_MAX, FREEZE_MIN, POP_MAX, POP_MIN, SMASH_HINT, SMASH_PROPS, SMOKE_FRAMES, TOAST_MAX, TOAST_MS,
  branchShift, crumbCount, debrisAt, debrisCount, debrisPlan, findCount, findScale, freezeFrames, isSmashKind, pickSmash, planFinds, pushToast, smokeAt, stepToasts, toastAlpha,
  type Entity, type SmashProp, type ToastEntry,
} from './smash';
import { findPath, gridFromWalls, isSolid, type Grid } from './follow';

const RAW = import.meta.glob<string>('../../../public/maps/camp-lake.tmj', { query: '?raw', import: 'default', eager: true });
const map = JSON.parse(Object.values(RAW)[0] ?? '{}') as { width: number; height: number; layers: { name: string; type: string; data?: number[]; objects?: { name: string; x: number; y: number }[] }[] };
const layer = (n: string): number[] => map.layers.find((l) => l.name === n)?.data ?? [];
const objs = map.layers.find((l) => l.type === 'objectgroup')?.objects ?? [];
const grid: Grid = gridFromWalls(map.width, map.height, 32, layer('walls'));
const prop = (id: string): SmashProp => { const p = SMASH_PROPS.find((x) => x.id === id); if (!p) throw new Error(id); return p; };
const crate = prop('crate.reception'); const branch = prop('branch.wood'); const pot = prop('pot.reception');

describe('уламки й дим', () => {
  it('уламків 4–7 для кожної розбивної речі й будь-якого дня (детерміновано від зерна)', () => {
    const seen = new Set<number>();
    for (const p of SMASH_PROPS.filter((x) => x.kind !== 'branch')) for (let day = 0; day < 80; day++) {
      const n = debrisPlan(p, day).length;
      expect(n, `${p.id} день ${day}`).toBeGreaterThanOrEqual(4); expect(n).toBeLessThanOrEqual(7);
      expect(n).toBe(debrisCount(p.id, day)); expect(debrisPlan(p, day)).toEqual(debrisPlan(p, day));
      seen.add(n);
    }
    expect(seen.size, 'зерно справді міняє кількість').toBeGreaterThan(1);
  });
  it('тріски 2×4 px, скалки глини 3×3 px', () => {
    for (const d of debrisPlan(crate, 3)) expect([d.w, d.h]).toEqual([2, 4]);
    for (const d of debrisPlan(pot, 3)) expect([d.w, d.h]).toEqual([3, 3]);
  });
  it('крихти гілки 3–6, гаснуть за ~30 кадрів: на 15-му видно, на 30-му — ні', () => {
    for (let day = 0; day < 60; day++) {
      const ds = debrisPlan(branch, day);
      expect(ds.length).toBe(crumbCount(branch.id, day)); expect(ds.length).toBeGreaterThanOrEqual(3); expect(ds.length).toBeLessThanOrEqual(6);
    }
    expect(DEBRIS_FRAMES).toBe(30);
    for (const d of [...debrisPlan(branch, 1), ...debrisPlan(crate, 1)]) {
      expect(debrisAt(d, branch.at.y, 0).alpha).toBe(1);
      const mid = debrisAt(d, branch.at.y, 15 * FRAME_MS).alpha;
      expect(mid).toBe(1);
      expect(debrisAt(d, branch.at.y, 25 * FRAME_MS).alpha).toBeGreaterThan(0);
      expect(debrisAt(d, branch.at.y, 25 * FRAME_MS).alpha).toBeLessThan(1);
      expect(debrisAt(d, branch.at.y, 30 * FRAME_MS).alpha).toBe(0);
      expect(debrisAt(d, branch.at.y, DEBRIS_MS).y, 'не провалюється під ногу речі').toBeLessThanOrEqual(branch.at.y + 2);
    }
  });
  it('дим — 4 кадри і гасне; далі немає', () => {
    expect(SMOKE_FRAMES).toBe(4);
    let prev = 1;
    for (let f = 0; f < 4; f++) { const q = smokeAt(f * FRAME_MS + 1); expect(q, `кадр ${f}`).not.toBeNull(); expect(q?.alpha ?? 9).toBeLessThan(prev); prev = q?.alpha ?? 0; }
    expect(smokeAt(4 * FRAME_MS)).toBeNull();
  });
  it('стоп героя 5–7 кадрів', () => {
    const seen = new Set<number>();
    for (const p of SMASH_PROPS) for (let day = 0; day < 60; day++) { const f = freezeFrames(p.id, day); expect(f).toBeGreaterThanOrEqual(FREEZE_MIN); expect(f).toBeLessThanOrEqual(FREEZE_MAX); seen.add(f); }
    expect(seen.size).toBeGreaterThan(1);
  });
  it('гілка: тремтіння до 2 px, 1–2 гілочки', () => {
    expect(Math.max(...BRANCH_SHAKE.map(Math.abs))).toBe(2);
    expect(branchShift(0)).toBe(2); expect(branchShift(BRANCH_SHAKE.length * FRAME_MS)).toBe(0);
    const seen = new Set<number>();
    for (let day = 0; day < 60; day++) { const n = findCount(branch, day); expect(n).toBeGreaterThanOrEqual(1); expect(n).toBeLessThanOrEqual(2); seen.add(n); expect(planFinds(branch, day, { x: branch.at.x + 20, y: branch.at.y }, 1)).toHaveLength(n); }
    expect(seen.size).toBe(2);
  });
});

describe('знахідка', () => {
  const hero = { x: crate.at.x + 24, y: crate.at.y + 4 };
  const run = (items: Item[], h: { x: number; y: number }, frames: number) => {
    let cur = items; const got: string[] = []; const sizes: number[] = [];
    for (let f = 0; f < frames; f++) { const r = stepItems(cur, h, FRAME_MS); cur = r.items; got.push(...r.collected); for (const it of cur) if (it.eat !== undefined && it.eat >= 0) sizes.push(findScale(it.eat)); }
    return { cur, got, sizes };
  };
  it('підскок 16–24 px і відскок 4 px: вершина дуги — pop, потім лягає й раз відскакує на 4', () => {
    for (let day = 0; day < 40; day++) {
      const [it] = planFinds(crate, day, hero, 1);
      if (!it) throw new Error('немає знахідки');
      expect(it.pop ?? 0).toBeGreaterThanOrEqual(POP_MIN); expect(it.pop ?? 99).toBeLessThanOrEqual(POP_MAX);
      const mid = itemAt({ ...it, age: FALL_MS / 2 });
      const base = it.y0 + (it.y1 - it.y0) / 2;
      expect(base - mid.y, 'піднялась на pop px над лінією польоту').toBeCloseTo(it.pop ?? 0, 5);
      expect(itemAt({ ...it, age: FALL_MS }).y).toBeCloseTo(it.y1, 5);
      expect(it.y1 - itemAt({ ...it, age: FALL_MS + 80 }).y, 'відскок 4 px').toBeCloseTo(4, 0);
    }
  });
  it('знахідка летить до героя (магніт) і розмір 0 — на ТРЕТЬОМУ кадрі зменшення; далі «поп»', () => {
    const items = planFinds(crate, 5, hero, 1, true);   // вже лежить
    expect(items).toHaveLength(1);
    const { cur, got, sizes } = run(items, hero, 80);
    expect(got, 'підібрана рівно одна').toEqual(['plank']);
    expect(cur).toHaveLength(0);
    expect(sizes, '3 кадри зменшення на торсі: 2/3, 1/3, 0').toEqual([2 / 3, 1 / 3, 0]);
    expect(findScale(0)).toBeCloseTo(2 / 3, 5); expect(findScale(FRAME_MS)).toBeCloseTo(1 / 3, 5);
    expect(findScale(2 * FRAME_MS), 'розмір 0 на 3-му кадрі').toBe(0);
    expect(EAT_MS).toBe(3 * FRAME_MS);
  });
  it('без магніта знахідка лежала б: поруч із героєм вона зникає з підлоги, а далеко (понад клітинку) — ні', () => {
    const near = run(planFinds(crate, 5, hero, 1, true), hero, 60);
    expect(near.got.length).toBe(1);
    const far = run(planFinds(crate, 5, hero, 1, true), { x: crate.at.x + 300, y: crate.at.y }, 60);
    expect(far.got.length, 'далеко — лежить').toBe(0); expect(far.cur).toHaveLength(1);
  });
  it('дотягується до торса: у мить зменшення центр — на героєві (y − 10) і ближче за COLLECT_R', () => {
    let cur = planFinds(crate, 5, hero, 1, true);
    for (let f = 0; f < 60 && !cur.some((i) => (i.eat ?? -1) >= 0); f++) cur = stepItems(cur, hero, FRAME_MS).items;
    const it = cur[0];
    expect(it?.eat).toBeGreaterThanOrEqual(0);
    expect(Math.hypot((it?.x ?? 0) - hero.x, (it?.y ?? 0) - (hero.y - 10))).toBeLessThanOrEqual(COLLECT_R);
  });
  it('вид знахідки за річчю й усі підписи є в uk та en', () => {
    expect(FIND_OF).toEqual({ crate: 'plank', barrel: 'plank', pot: 'shard', branch: 'twig' });
    for (const k of [...Object.values(FIND_KEY), ...Object.values(SMASH_HINT)]) { expect((uk as Record<string, string>)[k], `uk ${k}`).toBeTruthy(); expect((en as Record<string, string>)[k], `en ${k}`).toBeTruthy(); }
    for (const k of Object.values(FIND_KEY)) { expect((uk as Record<string, string>)[k]).toMatch(/^\+1 /); expect((en as Record<string, string>)[k]).toMatch(/^\+1 /); }
  });
});

describe('плашка «+1 Предмет»', () => {
  it('той самий вид додає до лічильника й подовжує час; новий вид кладеться над попереднім', () => {
    let t: ToastEntry[] = pushToast([], 'plank');
    t = stepToasts(t, 2000);
    t = pushToast(t, 'plank');
    expect(t).toEqual([{ kind: 'plank', count: 2, age: 0 }]);
    t = pushToast(t, 'shard');
    expect(t.map((x) => x.kind)).toEqual(['plank', 'shard']);   // кінець списку — верх
    expect(pushToast(pushToast(pushToast(t, 'twig'), 'plank'), 'shard').length).toBeLessThanOrEqual(TOAST_MAX);
  });
  it('тримається ≈3 с і гасне', () => {
    let t = pushToast([], 'twig');
    t = stepToasts(t, TOAST_MS - 600); expect(t).toHaveLength(1); expect(toastAlpha(t[0]?.age ?? 0)).toBe(1);
    t = stepToasts(t, 350); expect(toastAlpha(t[0]?.age ?? 0)).toBeLessThan(1); expect(toastAlpha(t[0]?.age ?? 0)).toBeGreaterThan(0);
    expect(stepToasts(t, 400)).toHaveLength(0);
  });
});

describe('тварини недоторкані', () => {
  const cat = (at: { x: number; y: number }): Entity => ({ id: 'animal.mia', kind: 'animal', at, range: 40 });
  it('кішка впритул до героя ближче за ящик — ціль усе одно ящик, а сама вона не ціль', () => {
    const hero = { x: crate.at.x + 12, y: crate.at.y };
    expect(pickSmash(hero, SMASH_PROPS, [cat({ x: hero.x + 1, y: hero.y })])?.id).toBe(crate.id);
  });
  it('поруч лише кішка — удар нічого не вибирає (жодної цілі)', () => {
    const hero = { x: 20, y: 20 };
    expect(pickSmash(hero, SMASH_PROPS, [cat({ x: 21, y: 20 })])).toBeNull();
    expect(pickSmash(hero, SMASH_PROPS, [cat({ x: 21, y: 20 }), { ...cat({ x: 22, y: 20 }), id: 'animal.dog' }])).toBeNull();
  });
  it('серед розбивних речей немає тварин', () => { for (const p of SMASH_PROPS) { expect(isSmashKind(p.kind)).toBe(true); expect(p.id).not.toMatch(/mia|cat|dog|animal|pet/i); } });
});

describe('речі табору на мапі', () => {
  it('стоять на прохідних клітинках, досяжні від старту, не збігаються з цілями мапи (48 px) і живими речами', () => {
    const spawn = objs.find((o) => o.name === 's.camp');
    const from = { c: Math.floor((spawn?.x ?? 0) / 32), r: Math.floor((spawn?.y ?? 0) / 32) };
    for (const p of SMASH_PROPS) {
      const t = { c: Math.floor(p.at.x / 32), r: Math.floor(p.at.y / 32) };
      expect(isSolid(grid, t), `${p.id} на стіні`).toBe(false);
      expect(findPath(grid, from, t), `шлях до ${p.id}`).not.toBeNull();
      for (const o of objs) expect(Math.hypot(p.at.x - o.x, p.at.y - o.y), `${p.id} надто близько до ${o.name}`).toBeGreaterThan(48);
      for (const r of REACTIONS) expect(Math.hypot(p.at.x - r.at.x, p.at.y - r.at.y), `${p.id} на ${r.id}`).toBeGreaterThan(r.range);
    }
    expect(new Set(SMASH_PROPS.map((p) => p.id)).size).toBe(SMASH_PROPS.length);
  });
  it('звуки матеріалів є в таблиці src/audio (звук лише через модуль звуку)', () => { for (const n of ['crack', 'clay', 'hollow', 'snap']) expect(CAMP_SPECS[n as keyof typeof CAMP_SPECS], n).toBeDefined(); });
});
