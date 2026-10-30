// GAME-183 · спільний «гравець» для e2e розділу без ☰: куди каже стрілка → дійти клавішами → дія від наближення чи кнопка дії; рамка розмови / вибору → відповідь; підсумок дня → «Продовжити».
// Мапи (дім, крамниця, дорога, табір) — зі справжніх .tmj; шлях по плитках. Жодного дотику до ☰.
import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';

export interface Core { game: { player: { locationId: string; transportId?: string } | null; flags: string[]; quests: Record<string, { status: string }>; inventory: Record<string, number>; dialogue: unknown; wave?: unknown; campaignEnded: boolean }; clock: { minutes: number } }
/** GAME-193: зонд риболовлі (координати кнопок — у пікселях сторінки). */
export interface FishP { phase: string; power: number; zone: number; fish: number; progress: number; inZone: boolean; casts: number; slipped: number; aways: number; kept: number; released: number; catches: number; species: string; spot: { x: number; y: number }; buttons: { release: { x: number; y: number }; keep: { x: number; y: number } } }
export interface Probe { playerX: number; playerY: number; nearObject: string | null; playerMoving: boolean; saveLoaded: boolean; tent: { phase: string; pegs: number; marker: number; inBand: boolean; placeOk: boolean };
  wood: { phase: string; got: number; strikes: number; marker: number; inBand: boolean; branches: { x: number; y: number; got: boolean }[]; block: { x: number; y: number } };
  fire: { phase: string; logs: number; charge: number; inBand: boolean; holding: boolean; fizzles: number; x: number; y: number }; grill: { phase: string; heat: number; cook: number; holding: boolean; chars: number; charred: boolean }; fish: FishP; fx: { target: string | null; guide: string; ring: number; backpack: number } }
export const core = (page: Page): Promise<Core> => page.evaluate(() => (window as unknown as { __game: { read: () => Core } }).__game.read());
export const probe = (page: Page): Promise<Probe> => page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __game: { probe: Probe } }).__game.probe)) as Probe);
export const loaded = (page: Page): Promise<unknown> => page.waitForFunction(() => (window as unknown as { __game?: { probe: { saveLoaded: boolean } } }).__game?.probe.saveLoaded === true, null, { timeout: 30_000 });

export const MAP_OF: Readonly<Record<string, string>> = { 'loc.home': 'home', 'loc.shop': 'shop', 'loc.road': 'road', 'loc.camp.lake': 'camp-lake' };
interface Tmj { width: number; height: number; layers: { name: string; data?: number[]; objects?: { name: string; x: number; y: number }[] }[] }
const maps: Record<string, Tmj> = {};
const tmj = (key: string): Tmj => (maps[key] ??= JSON.parse(readFileSync(`public/maps/${key}.tmj`, 'utf8')) as Tmj);

export function route(key: string, from: [number, number], spot: string, car = false): [number, number][] {
  const o = (tmj(key).layers.find((l) => l.name === 'objects')?.objects ?? []).find((x) => x.name === spot);
  if (!o) throw new Error(`на мапі ${key} немає ${spot}`);
  return routeXY(key, from, o, car, spot);
}
/** Те саме до довільної точки мапи (гілки дров GAME-190 — не об'єкти .tmj, а точки сцени). */
export function routeXY(key: string, from: [number, number], o: { x: number; y: number }, car = false, spot = `${o.x},${o.y}`): [number, number][] {
  const m = tmj(key);
  const walls = m.layers.find((l) => l.name === 'walls')?.data ?? [];
  const objs = m.layers.find((l) => l.name === 'objects')?.objects ?? [];
  const veh = objs.find((x) => x.name === 'obj.vehicle');
  const blocked = (tx: number, ty: number): boolean => {
    if ((walls[ty * m.width + tx] ?? 1) > 0) return true;
    if (car && key !== 'camp-lake' && veh) { const cx = veh.x + 16; const cy = veh.y + 80; if (tx * 32 + 32 > cx - 52 && tx * 32 < cx + 52 && ty * 32 + 32 > cy - 30 && ty * 32 < cy) return true; }
    return false;
  };
  const goal = (tx: number, ty: number): boolean => !blocked(tx, ty) && Math.hypot(tx * 32 + 16 - o.x, ty * 32 + 16 - o.y) <= 24;
  const start = [Math.floor(from[0] / 32), Math.floor(from[1] / 32)] as const;
  const prev = new Map<string, string | null>([[`${start[0]},${start[1]}`, null]]);
  const q: [number, number][] = [[start[0], start[1]]];
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i] as [number, number];
    if (goal(x, y)) {
      const out: [number, number][] = [];
      for (let k: string | null | undefined = `${x},${y}`; k; k = prev.get(k)) { const [a, b] = k.split(',').map(Number) as [number, number]; out.unshift([a * 32 + 16, b * 32 + 16]); }
      return out;
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx; const ny = y + dy; const k = `${nx},${ny}`;
      if (nx < 0 || ny < 0 || nx >= m.width || ny >= m.height || prev.has(k) || blocked(nx, ny)) continue;
      prev.set(k, `${x},${y}`); q.push([nx, ny]);
    }
  }
  throw new Error(`немає шляху до ${spot} на мапі ${key}`);
}

export async function walk(page: Page, pts: [number, number][]): Promise<void> {
  await page.evaluate((pts) => new Promise<void>((resolve) => {
    const g = (window as unknown as { __game: { probe: { playerX: number; playerY: number } } }).__game;
    const down = new Set<string>();
    const fire = (type: string, key: string, code: number): void => {
      const e = new KeyboardEvent(type, { key, code: key, bubbles: true, cancelable: true });
      Object.defineProperty(e, 'keyCode', { get: () => code });
      window.dispatchEvent(e);
    };
    const codes: Record<string, number> = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40 };
    const set = (want: string | null): void => {
      for (const k of [...down]) if (k !== want) { fire('keyup', k, codes[k] as number); down.delete(k); }
      if (want && !down.has(want)) { fire('keydown', want, codes[want] as number); down.add(want); }
    };
    let i = 0;
    const t0 = performance.now();
    const tick = (): void => {
      const p = pts[i];
      if (!p || performance.now() - t0 > 45_000) { set(null); resolve(); return; }
      const dx = p[0] - g.probe.playerX;
      const dy = p[1] - g.probe.playerY;
      if (Math.abs(dx) < 3 && Math.abs(dy) < 3) { i++; requestAnimationFrame(tick); return; }
      set(Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'ArrowLeft' : 'ArrowRight') : (dy < 0 ? 'ArrowUp' : 'ArrowDown'));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), pts);
}

export const talk = (page: Page) => page.locator('.ui-talk [data-ui="dialogue"]');
export const signature = async (page: Page): Promise<string> => {
  const c = await core(page);
  const p = await probe(page);
  // Рамка вибору (авто, сушарка, крок із кількома виходами) — теж «дія спрацювала»: стан ядра ще не змінився, але гравцю вже питають, що саме.
  return JSON.stringify([await page.locator('.ui-talk').count(), c.game.player?.locationId, c.game.flags, Object.entries(c.game.quests).map(([k, v]) => `${k}:${v.status}`), c.game.inventory, c.game.dialogue, c.game.wave, p.fx.backpack]);
};

/** Яку відповідь вибирає гравець у розмові (за текстом): те, що веде сюжет; «просто привіталась» і прохання — ні. */
const PREFER = [/Де краще поставити намет/, /Чудово! Там і поставлю/, /Намет уже стоїть/, /Доброго ранку/, /Зрозуміло, дякую/, /Можна взяти мангал/, /Разом: кожен/, /Ми вже збираємося додому/, /Розкажімо по одній/, /Неодмінно/];
export async function answerOne(page: Page): Promise<string> {
  const box = talk(page);
  const acts = await box.locator('[data-act]').evaluateAll((els) => els.map((e) => ({ act: e.getAttribute('data-act') ?? '', key: e.getAttribute('data-key') ?? '', text: (e as HTMLElement).innerText })));
  const choiceBox = acts.some((a) => a.act === 'cancel');
  let idx = -1;
  if (choiceBox) {
    // Рамка вибору дії: авто — за кінцем сюжету (табір ← дорога; дорога ← табір), решта — перший варіант (не «Не зараз»). Куди саме — за квестами в ядрі.
    const c = await core(page);
    const want = c.game.player?.locationId === 'loc.camp.lake' ? 'loc.road' : c.game.player?.locationId === 'loc.road' ? (c.game.quests['ST-005']?.status === 'active' ? 'loc.camp.lake' : 'loc.home') : '';
    idx = acts.findIndex((a) => a.act !== 'cancel' && a.key === want);   // GAME-185: «Не зараз» теж має порожній ключ — без цього на вимкненому «want» водій вибирав скасування
    if (idx < 0) idx = acts.findIndex((a) => a.act !== 'cancel');
  } else {
    for (const re of PREFER) { idx = acts.findIndex((a) => re.test(a.text)); if (idx >= 0) break; }
    if (idx < 0) idx = acts.findIndex((a) => a.act === 'continue');
    if (idx < 0) idx = acts.length - 1;
  }
  const a = acts[idx];
  if (!a) throw new Error('у рамці розмови немає жодної відповіді');
  await box.locator('[data-act]').nth(idx).click();
  await page.waitForTimeout(450);   // «глухота» рамки ~350 мс після відповіді
  return `${choiceBox ? 'choice' : 'talk'}:${a.act}:${a.key || a.text.slice(0, 24)}`;
}

/**
 * GAME-189 · намет руками: гравець уже натиснув дію біля task.pitch-tent (фаза «place»). Дальше — як людина: дочекатись, що привид зелений, поставити; на кожен із 4 кілків
 * стежити за шкалою й натискати, коли маркер у зеленому (зонд tent.marker/inBand — лише читання). Тиснемо, коли маркер ≈ посередині зеленого: запас ≈ ±0,11 шкали (≈130 мс затримки).
 */
export async function playTent(page: Page, touch: boolean, midShot?: () => Promise<void>): Promise<void> {
  const press = async (): Promise<void> => {
    if (touch) await page.locator('[data-touch="interact"]').tap();
    else { await page.keyboard.down('KeyE'); await page.waitForTimeout(80); await page.keyboard.up('KeyE'); }
  };
  await expect.poll(async () => (await probe(page)).tent.phase, { timeout: 5_000, message: 'дія біля намету мусить почати розміщення' }).toBe('place');
  await expect.poll(async () => (await probe(page)).tent.placeOk, { timeout: 5_000, message: 'привид намету мусить стати зеленим (місце придатне)' }).toBe(true);
  await page.waitForTimeout(450);   // затвор дії сцени: ≥ 400 мс між натисканнями
  await press();
  await expect.poll(async () => (await probe(page)).tent.phase, { timeout: 5_000, message: 'друга дія ставить намет' }).toBe('peg');
  for (let k = 0; k < 4; k++) {
    await page.waitForTimeout(450);   // затвор (маркер за цей час не дійде до середини: хід від краю ≥ 0,3 с)
    await page.waitForFunction((n) => { const t = (window as unknown as { __game: { probe: { tent: { phase: string; pegs: number; marker: number } } } }).__game.probe.tent; return t.phase !== 'peg' || (t.pegs === n && Math.abs(t.marker - 0.5) < 0.07); }, k, { timeout: 10_000, polling: 'raf' });
    await press();
    await expect.poll(async () => { const t = (await probe(page)).tent; return t.phase !== 'peg' || t.pegs > k; }, { timeout: 5_000, message: `кілок ${k + 1} не забито` }).toBe(true);
    if (k === 1 && midShot) await midShot();
  }
}

/**
 * GAME-190 · дрова руками: стрілка веде до гілок по черзі, потім до колоди. Як людина: дійти до кожної непідібраної гілки (точки зі зонда), натиснути дію; до колоди, дія → 3 удари
 * по шкалі (тиснемо, коли маркер ≈ посередині зеленого, як у наметі). `midShot` — знімок посередині рубання.
 */
export async function playWood(page: Page, touch: boolean, midShot?: () => Promise<void>): Promise<void> {
  const press = async (): Promise<void> => {
    if (touch) await page.locator('[data-touch="interact"]').tap();
    else { await page.keyboard.down('KeyE'); await page.waitForTimeout(80); await page.keyboard.up('KeyE'); }
  };
  await expect.poll(async () => (await probe(page)).wood.phase, { timeout: 8_000, message: 'дрова руками: рига мусить стартувати (гілки лежать на мапі)' }).toBe('gather');
  const near = async (pt: { x: number; y: number }): Promise<void> => {
    for (let t = 0; t < 3; t++) {
      const q = await probe(page);
      if (Math.hypot(q.playerX - pt.x, q.playerY - pt.y) <= 40 && !q.playerMoving) return;
      await walk(page, routeXY('camp-lake', [q.playerX, q.playerY], pt));
      await page.waitForTimeout(250);
    }
  };
  for (let i = 0; i < 3; i++) {
    const w = (await probe(page)).wood;
    const b = w.branches[i];
    if (!b || b.got) continue;
    await near(b);
    await page.waitForTimeout(450);   // затвор дії сцени
    await press();
    await expect.poll(async () => (await probe(page)).wood.got, { timeout: 5_000, message: `гілку ${i + 1} не підняв` }).toBeGreaterThan(w.got);
  }
  const block = (await probe(page)).wood.block;
  await near(block);
  await page.waitForTimeout(450);
  await press();
  await expect.poll(async () => (await probe(page)).wood.phase, { timeout: 5_000, message: 'дія біля колоди з 3 гілками починає рубання' }).toBe('chop');
  for (let k = 0; k < 3; k++) {
    await page.waitForTimeout(450);
    await page.waitForFunction((n) => { const t = (window as unknown as { __game: { probe: { wood: { phase: string; strikes: number; marker: number } } } }).__game.probe.wood; return t.phase !== 'chop' || (t.strikes === n && Math.abs(t.marker - 0.5) < 0.07); }, k, { timeout: 10_000, polling: 'raf' });
    await press();
    await expect.poll(async () => { const t = (await probe(page)).wood; return t.phase !== 'chop' || t.strikes > k; }, { timeout: 5_000, message: `удар ${k + 1} не влучив` }).toBe(true);
    if (k === 1 && midShot) await midShot();
  }
}

/**
 * GAME-190 · вогнище руками: гравець уже натиснув дію біля obj.campfire (кострище чекає). 3 дії — 3 поліна; тоді ТРИМАТИ дію й відпустити, коли шкала ≈ посередині зеленого
 * (зонд fire.charge). Згасло (рідко: затримка) — ще раз. `midShot` — знімок посеред утримання сірника.
 */
export async function playFire(page: Page, touch: boolean, midShot?: () => Promise<void>): Promise<void> {
  const btn = page.locator('[data-touch="interact"]');
  const press = async (): Promise<void> => {
    if (touch) await btn.tap();
    else { await page.keyboard.down('KeyE'); await page.waitForTimeout(80); await page.keyboard.up('KeyE'); }
  };
  const down = async (): Promise<void> => { if (touch) await btn.dispatchEvent('pointerdown', { pointerId: 7, pointerType: 'touch', isPrimary: true }); else await page.keyboard.down('KeyE'); };
  const up = async (): Promise<void> => { if (touch) await btn.dispatchEvent('pointerup', { pointerId: 7, pointerType: 'touch', isPrimary: true }); else await page.keyboard.up('KeyE'); };
  await expect.poll(async () => ['stack', 'match'].includes((await probe(page)).fire.phase), { timeout: 5_000, message: 'кострище мусить чекати на дрова (або вже зі складеними полінами)' }).toBe(true);
  for (let k = 0; k < 3; k++) {
    const logs = (await probe(page)).fire.logs;
    if (logs > k) continue;   // перша дія (що відкрила розмову з вогнищем) могла вже покласти полінце
    await page.waitForTimeout(450);
    await press();
    await expect.poll(async () => (await probe(page)).fire.logs, { timeout: 5_000, message: `полінце ${k + 1} не лягло` }).toBeGreaterThan(k);
  }
  await expect.poll(async () => (await probe(page)).fire.phase, { timeout: 5_000, message: 'три поліна відкривають сірник' }).toBe('match');
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.waitForTimeout(450);
    await down();
    await expect.poll(async () => (await probe(page)).fire.holding, { timeout: 3_000, message: 'утримання мусить почати шкалу' }).toBe(true);
    await page.waitForFunction(() => { const f = (window as unknown as { __game: { probe: { fire: { holding: boolean; charge: number } } } }).__game.probe.fire; return !f.holding || Math.abs(f.charge - 0.65) < 0.05; }, null, { timeout: 5_000, polling: 'raf' });
    if (attempt === 0 && midShot) await midShot();
    await up();
    await page.waitForTimeout(150);
    if (['lit', 'done'].includes((await probe(page)).fire.phase) || (await page.locator('.ui-talk').count()) > 0) return;
  }
  throw new Error('сірник не запалився за 3 спроби');
}

const AUTO = (name: string): boolean => name.startsWith('step.') || name.startsWith('take.') || name === 'obj.vehicle' || name.startsWith('req.') || name.startsWith('pack.');
/** Один «заход»: куди каже стрілка → дійти → дія від наближення (кільце) або кнопка дії (E / тап по кнопці). Повертає назву цілі. */
export async function goAndDo(page: Page, touch: boolean, car = false): Promise<string> {
  await expect.poll(async () => (await probe(page)).fx.target, { timeout: 20_000, message: 'стрілка «Далі» мусить вказувати ціль' }).not.toBeNull();
  const p = await probe(page);
  const target = p.fx.target as string;
  const loc = (await core(page)).game.player?.locationId ?? 'loc.home';
  const key = MAP_OF[loc];
  if (!key) throw new Error(`локація ${loc} без мапи`);
  // GAME-190: дрова — руками (гілки → колода → удари); стрілка веде гілка за гілкою.
  if (target.startsWith('wood.') || (target === 'take.item.firewood' && (await probe(page)).wood.phase !== 'idle')) { await playWood(page, touch); await page.waitForTimeout(150); return target; }
  const before = await signature(page);
  for (let t = 0; t < 3; t++) {
    const q = t === 0 ? p : await probe(page);
    await walk(page, route(key, [q.playerX, q.playerY], target, car));
    // GAME-186 (2/2): прийшов ≠ «стоїть у зоні». Під навантаженням (кадр 60–120 мс) герой проскакує ціль, а мешканець чи слідувач опиняється ближчим за неї —
    // тоді кільце не заповнюється й кнопка дії бачить когось іншого. Гравець у цій миті просто підступає ще; ми теж: спершу дочекатись «стоїть і ціль найближча», інакше — новий захід із поточної точки.
    // Дія, що вже спрацювала (кільце, рамка вибору — сцена на паузі й проба застигла), теж «дійшов»: повторний захід тоді лише тримав би стрілку до 45 с (рецензія #111).
    const settled = await expect.poll(async () => { const s = await probe(page); return (s.nearObject === target && !s.playerMoving) || (await signature(page)) !== before; }, { timeout: 2_500 }).toBe(true).then(() => true, () => false);
    if (!settled && t < 2) continue;
    if (!AUTO(target)) {
      await expect.poll(async () => (await probe(page)).nearObject, { timeout: 5_000, message: `біля ${target} кнопка дії мусить знати, що поруч` }).toBe(target);
      if (touch) await page.locator('[data-touch="interact"]').tap();
      else { await page.keyboard.down('KeyE'); await page.waitForTimeout(200); await page.keyboard.up('KeyE'); }
    }
    if (target === 'task.pitch-tent' && !AUTO(target)) await playTent(page, touch);
    if (target === 'obj.campfire' && (await probe(page)).fire.phase === 'stack') await playFire(page, touch);   // GAME-190: вогнище руками
    try { await expect.poll(() => signature(page), { timeout: 5_000 }).not.toBe(before); break; } catch { /* ще раз із поточної точки */ }
  }
  const q = await probe(page);
  expect(await signature(page), `біля ${target} дія не спрацювала (гравець ${Math.round(q.playerX)},${Math.round(q.playerY)}, кільце ${JSON.stringify(q.fx)})`).not.toBe(before);
  await page.waitForTimeout(150);
  return target;
}

/** Грає, поки `stop(core)` не стане правдою: рамка → відповідь, підсумок дня → «Продовжити», інакше ходьба до цілі зі стрілки. Повертає запис спостерігача ☰ на мить ПЕРЕД останньою дією. */
export async function playUntil(page: Page, touch: boolean, log: string[], stop: (c: Core) => boolean, menuSeen: () => Promise<string[]>, max = 160): Promise<string[]> {
  let before: string[] = [];
  for (let i = 0; i < max; i++) {
    const c = await core(page);
    if (stop(c)) return before;
    before = await menuSeen();
    if (await page.locator('[data-ui="summary-continue"]').count()) { await page.locator('[data-ui="summary-continue"]').click(); log.push('summary'); await page.waitForTimeout(500); continue; }
    if (await talk(page).count()) { log.push(await answerOne(page)); continue; }
    log.push(await goAndDo(page, touch));
  }
  throw new Error(`розділ не дійшов до мети за ${max} кроків: ${log.slice(-12).join(' → ')}`);
}

/** Спостерігач ☰: будь-яка поява панелі (.ui-story) чи клік на кнопці ☰ — запис. Рамка розмови (.ui-talk) і вступ — не панель. Ставиться ДО навігації. */
export async function installMenuObserver(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __menu: string[] };
    w.__menu = [];
    const look = (): void => { if (document.querySelector('.ui-story') && !w.__menu.includes('panel')) w.__menu.push('panel'); };
    new MutationObserver(look).observe(document, { childList: true, subtree: true });
    document.addEventListener('click', (e) => { if ((e.target as Element | null)?.closest('[data-touch="story"]')) w.__menu.push('☰-click'); }, true);
  });
}
export const menuSeen = (page: Page): Promise<string[]> => page.evaluate(() => (window as unknown as { __menu?: string[] }).__menu ?? []);

/**
 * GAME-193 · риболовля: герой уже біля берега. Тримати дію (шкала сили) → відпустити (закид) → дочекатись «клює» → торкнутись у вікні → вести зелену зону за рибкою (зонд читає зону й рибку) → вибір.
 * `choice`: 'release' | 'keep'. Втеча рибки (рідко: затримка) — закидає ще. `midShot` — знімок посеред підсікання. Повертає вибір, що було зроблено.
 */
export async function playFishing(page: Page, touch: boolean, choice: 'release' | 'keep', midShot?: () => Promise<void>): Promise<void> {
  const btn = page.locator('[data-touch="interact"]');
  const fish = async (): Promise<FishP> => (await probe(page)).fish;
  const down = async (): Promise<void> => { if (touch) await btn.dispatchEvent('pointerdown', { pointerId: 7, pointerType: 'touch', isPrimary: true }); else await page.keyboard.down('KeyE'); };
  const up = async (): Promise<void> => { if (touch) await btn.dispatchEvent('pointerup', { pointerId: 7, pointerType: 'touch', isPrimary: true }); else await page.keyboard.up('KeyE'); };
  const raf = (fn: string, arg: unknown, timeout: number): Promise<unknown> => page.waitForFunction(fn, arg, { timeout, polling: 'raf' });
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.waitForTimeout(450);
    await down();
    await expect.poll(async () => (await fish()).phase, { timeout: 3_000, message: 'утримання біля берега мусить почати шкалу сили' }).toBe('charge');
    await raf('window.__game.probe.fish.power > 0.6', null, 4_000);
    await up();
    await expect.poll(async () => (await fish()).phase, { timeout: 3_000, message: 'відпустив — закид, поплавок чекає' }).toBe('wait');
    await raf('window.__game.probe.fish.phase === "bite"', null, 8_000);
    await down(); await up();   // тап у вікні 600 мс
    await expect.poll(async () => (await fish()).phase, { timeout: 2_000, message: 'тап у вікні «клює» підсікає' }).toBe('reel');
    // Підсікання: у самій сторінці, кадр за кадром: тримати, коли рибка вища за центр зони.
    const shotAt = midShot ? page.waitForFunction('window.__game.probe.fish.phase !== "reel" || window.__game.probe.fish.progress > 0.5', null, { timeout: 8_000, polling: 'raf' }).then(async () => { if ((await fish()).phase === 'reel') await midShot(); }) : Promise.resolve();
    await page.evaluate((isTouch) => new Promise<void>((resolve) => {
      const g = (window as unknown as { __game: { probe: { fish: { phase: string; zone: number; fish: number } } } }).__game;
      const b = document.querySelector('[data-touch="interact"]');
      let holding = false;
      const set = (want: boolean): void => {
        if (want === holding) return;
        holding = want;
        if (isTouch && b) b.dispatchEvent(new PointerEvent(want ? 'pointerdown' : 'pointerup', { pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true }));
        else { const e = new KeyboardEvent(want ? 'keydown' : 'keyup', { key: 'e', code: 'KeyE', bubbles: true, cancelable: true }); Object.defineProperty(e, 'keyCode', { get: () => 69 }); window.dispatchEvent(e); }
      };
      const t0 = performance.now();
      const step = (): void => {
        const f = g.probe.fish;
        if (f.phase !== 'reel' || performance.now() - t0 > 12_000) { set(false); resolve(); return; }
        set(f.fish > f.zone);
        requestAnimationFrame(step);
      };
      step();
    }), touch);
    await shotAt;
    if ((await fish()).phase === 'choice') break;
    expect((await fish()).phase, 'рибка втекла — повернулись у спокій без штрафу').toBe('idle');
  }
  await expect.poll(async () => (await fish()).phase, { timeout: 3_000, message: 'улов: рамка вибору' }).toBe('choice');
  await page.waitForTimeout(300);
  if (touch) { const b = (await fish()).buttons[choice]; await page.touchscreen.tap(b.x, b.y); }
  else {
    if (choice === 'keep') { await page.keyboard.down('ArrowRight'); await page.waitForTimeout(80); await page.keyboard.up('ArrowRight'); await page.waitForTimeout(100); }
    await page.keyboard.down('KeyE'); await page.waitForTimeout(80); await page.keyboard.up('KeyE');
  }
  await expect.poll(async () => (await fish()).phase, { timeout: 3_000, message: 'вибір закриває рамку' }).toBe('idle');
  await closeFishScene(page);
}

/** GAME-195: вибір на озері пишеться сценою-однорядником (рамка розмови чи панель ☰): дочитати її й повернутись на мапу. */
export async function closeFishScene(page: Page): Promise<void> {
  await expect.poll(async () => (await core(page)).game.dialogue !== null, { timeout: 3_000, message: 'вибір рибки відкриває сцену-однорядник' }).toBe(true);
  for (let i = 0; i < 6 && (await core(page)).game.dialogue !== null; i++) {
    if (await talk(page).count()) await answerOne(page);
    else await page.locator('.ui-story [data-ui="dialogue"] [data-act]').last().click({ timeout: 3_000 });
    await page.waitForTimeout(350);
  }
  expect((await core(page)).game.dialogue, 'сцена-однорядник закінчилась').toBeNull();
  const close = page.locator('[data-ui="story-close"]');
  if (await close.count()) await close.click({ timeout: 3_000 }).catch(() => undefined);
}
