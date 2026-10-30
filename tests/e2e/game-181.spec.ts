// GAME-181 · прогресія мандрівника на екрані: поточна ціль завжди видна (обидві орієнтації, не налазить на інші рядки HUD), XP/ОМ і «+N» над героєм,
// нове звання ходьбою — у перші ~10 хвилин (число міряється тут і потрапляє в PR), навички в ☰, картка підсумку дня з «+N XP · +N ОМ» і «Наступного разу».
// Негативні контролі (закон 1): ?hideUi=goal — цілі немає (перевірка «ціль видна» на цьому червоніє); завантаження сейву нагородою не святкується.
import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';

interface Progress { xp: number; om: number; keys: string[] }
interface Core { clock: { minutes: number }; game: { player: { locationId: string } | null; flags: string[]; quests: Record<string, { status: string }>; inventory: Record<string, number>; progress?: Progress } }
interface Fx { target: string | null; ring: number; backpack: number; pops: number; auto: number; rewards: number; rewardLast: string }
interface Probe { playerX: number; playerY: number; clockMinutes: number; fx: Fx; saveLoaded: boolean }
const core = (page: Page): Promise<Core> => page.evaluate(() => (window as unknown as { __game: { read: () => Core } }).__game.read());
const probe = (page: Page): Promise<Probe> => page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __game: { probe: Probe } }).__game.probe)) as Probe);
const sounds = (page: Page): Promise<string[]> => page.evaluate(() => (window as unknown as { __game: { sounds: () => string[] } }).__game.sounds());
const loaded = (page: Page): Promise<unknown> => page.waitForFunction(() => (window as unknown as { __game?: { probe: Probe } }).__game?.probe.saveLoaded === true, null, { timeout: 30_000 });

const VIEWS = [{ name: 'портрет', side: 'portrait', w: 390, h: 844 }, { name: 'ландшафт', side: 'landscape', w: 844, h: 390 }] as const;
const shot = (side: string, what: string): string => `research/visual-audit/progress-${side}-${what}.png`;

// ---------- ходьба по мапі (як tests/e2e/game-175.spec.ts: шлях по плитках, клавіші стрілок, дія від наближення) ----------
const MAPS = { 'loc.home': 'home', 'loc.shop': 'shop' } as const;
interface Tmj { width: number; height: number; layers: { name: string; data?: number[]; objects?: { name: string; x: number; y: number }[] }[] }
const maps: Record<string, Tmj> = {};
const tmj = (key: string): Tmj => (maps[key] ??= JSON.parse(readFileSync(`public/maps/${key}.tmj`, 'utf8')) as Tmj);

function route(key: string, from: [number, number], spot: string): [number, number][] {
  const m = tmj(key);
  const walls = m.layers.find((l) => l.name === 'walls')?.data ?? [];
  const o = (m.layers.find((l) => l.name === 'objects')?.objects ?? []).find((x) => x.name === spot);
  if (!o) throw new Error(`на мапі ${key} немає ${spot}`);
  const blocked = (tx: number, ty: number): boolean => (walls[ty * m.width + tx] ?? 1) > 0;
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

async function walk(page: Page, pts: [number, number][]): Promise<void> {
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

const signature = async (page: Page): Promise<string> => {
  const c = await core(page);
  const p = await probe(page);
  // GAME-185: рамка підтвердження поїздки «Куди їдемо?» — теж «дія спрацювала» (ядро ще не змінилось, але авто вже спитало).
  const frame = await page.locator('.ui-talk [data-ui="dialogue"]').count();
  return JSON.stringify([frame, c.game.player?.locationId, c.game.flags, Object.entries(c.game.quests).map(([k, v]) => `${k}:${v.status}`), c.game.inventory, p.fx.backpack]);
};

/** Один «заход»: куди каже йти стрілка → дійти → дочекатись дії. Повертає назву цілі. */
async function goAndDo(page: Page): Promise<string> {
  await expect.poll(async () => (await probe(page)).fx.target, { timeout: 20_000 }).not.toBeNull().catch(() => undefined);
  const p = await probe(page);
  const target = p.fx.target;
  if (!target) throw new Error('стрілка не вказує мети — гравець не знає, що далі');
  const c = await core(page);
  const key = MAPS[(c.game.player?.locationId ?? 'loc.home') as keyof typeof MAPS];
  if (!key) throw new Error(`локація ${c.game.player?.locationId} — не мапа зрізу 1`);
  const before = await signature(page);
  for (let t = 0; t < 3; t++) {
    const q = t === 0 ? p : await probe(page);
    await walk(page, route(key, [q.playerX, q.playerY], target));
    if ((await signature(page)) !== before) break;
  }
  await expect.poll(() => signature(page), { timeout: 5_000, message: `біля ${target} дія не спрацювала від наближення` }).not.toBe(before);
  // GAME-185: авто питає «Куди їдемо?» — гравець погоджується (єдина відповідь-напрямок); «Не зараз» не обираємо, інакше прохід не рухається.
  const go = page.locator('.ui-talk [data-ui="dialogue"] [data-act="visit"]');
  if (target === 'obj.vehicle' && await go.count()) {
    const framed = await signature(page);
    await page.waitForTimeout(450);   // «глухота» рамки ~350 мс після появи
    await go.first().click();
    await expect.poll(() => signature(page), { timeout: 5_000, message: 'відповідь «їдемо» не повезла авто' }).not.toBe(framed);
  }
  await page.waitForTimeout(150);
  return target;
}

async function startSolo(page: Page, query = ''): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/?seed=7&mapFirst=1${query}`);
  await loaded(page);
  await page.locator('[data-touch="story"]').click();
  await page.locator('[data-ui="story"] [data-act="create"]', { hasText: /Велосипед|Bike/ }).first().click();
  await page.waitForTimeout(400);
  await page.locator('[data-ui="story-close"]').click();
  await page.locator('[data-ui="recovery-close"]').click({ timeout: 800 }).catch(() => undefined);
  return errors;
}

const rect = async (loc: Locator): Promise<{ l: number; t: number; r: number; b: number } | null> => {
  if ((await loc.count()) === 0) return null;   // evaluate() на відсутньому елементі чекав би до кінця тесту
  return loc.first().evaluate((el) => { const r = el.getBoundingClientRect(); return r.width === 0 && r.height === 0 ? null : { l: r.left, t: r.top, r: r.right, b: r.bottom }; });
};
const overlap = (a: { l: number; t: number; r: number; b: number }, b: { l: number; t: number; r: number; b: number }): number => {
  const w = Math.min(a.r, b.r) - Math.max(a.l, b.l);
  const h = Math.min(a.b, b.b) - Math.max(a.t, b.t);
  return w > 0 && h > 0 ? Math.round(w * h) : 0;
};

for (const v of VIEWS) {
  test(`поточна ціль: одна, коротка, завжди на екрані і не налазить на інші рядки HUD — ${v.name}`, async ({ browser }) => {
    test.setTimeout(300_000);
    const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errors = await startSolo(page);
    const goal = page.locator('[data-ui="goal"]');
    await expect(goal).toBeVisible();
    await expect(goal).toHaveText('Ціль: Вечір удома');            // крок головного квесту (PROLOGUE-HOME-001), одним рядком
    expect(await page.locator('[data-ui="goal"]').count(), 'ціль одна').toBe(1);
    expect((await goal.innerText()).length, 'коротко: ≤ 60 знаків').toBeLessThanOrEqual(60);
    // Рядок «Далі» (GAME-175) з'являється з кадром сцени; чекаємо його, щоб міряти саме пару.
    await expect(page.locator('[data-ui="next-hint"]')).toBeVisible({ timeout: 20_000 });
    const g = await rect(goal);
    expect(g).not.toBeNull();
    const vp = { l: 0, t: 0, r: v.w, b: v.h };
    if (g) { expect(g.l).toBeGreaterThanOrEqual(0); expect(g.r).toBeLessThanOrEqual(v.w); expect(overlap(g, vp)).toBeGreaterThan(0); }
    for (const other of ['[data-ui="next-hint"]', '[data-ui="wave"]', '[data-touch="story"]', '[data-touch="pause"]', '[data-ui="hud"]']) {
      const o = await rect(page.locator(other));
      if (g && o) expect(overlap(g, o), `ціль налазить на ${other}`).toBe(0);
    }
    // Ціль міняється разом із квестом: ходьбою закрили крок — у HUD уже інший.
    const first = await goal.innerText();
    for (let i = 0; i < 4 && (await goal.innerText()) === first; i++) await goAndDo(page);
    expect(await goal.innerText(), 'після кроку ціль — наступна').not.toBe(first);
    await page.locator('[data-ui="recovery-close"]').click({ timeout: 800 }).catch(() => undefined);
    await page.screenshot({ path: shot(v.side, 'goal') });
    expect(errors).toEqual([]);
    await ctx.close();
  });
}

test('мутація: ?hideUi=goal — цілі на екрані немає (перевірка «ціль видна» на цьому червоніє)', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await startSolo(page, '&hideUi=goal');
  await page.waitForTimeout(500);
  await expect(page.locator('[data-ui="goal"]')).toHaveCount(0);
  await expect(page.locator('[data-ui="hud"]')).toBeVisible();   // шапка жива — зникла саме ціль
  await ctx.close();
});

for (const v of VIEWS) {
  test(`перше нове звання — ходьбою: «+N» над героєм, банер, звук, час до нього; після перезавантаження банера нема — ${v.name}`, async ({ browser }) => {
    test.setTimeout(540_000);
    const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errors = await startSolo(page);
    const t0 = Date.now();
    const clock0 = (await probe(page)).clockMinutes;
    const path: string[] = [];
    for (let i = 0; i < 40; i++) {
      if (((await core(page)).game.progress?.xp ?? 0) >= 60) break;
      path.push(await goAndDo(page));
    }
    // Звання вже дано (XP ≥ 60) — міряємо час тут, до будь-яких дій з екраном: це час ГРИ до звання (годинник стоїть, коли відкрито панель).
    const wallS = Math.round((Date.now() - t0) / 1000);
    const clockMin = (await probe(page)).clockMinutes - clock0;
    // Звання заробили дією, що вивела на дорогу: подія в дорозі відкриває екран подорожі — банер чекає, поки гравець його закриє (як і «+N»). Закриваємо, як гравець.
    const panel = page.locator('[data-ui="story"]');
    for (let i = 0; i < 8 && (await panel.count()) > 0; i++) {
      const answers = panel.locator('[data-ui="dialogue"] [data-act]');
      if ((await answers.count()) > 0) await answers.last().tap(); else await panel.locator('[data-ui="story-close"]').tap();
      await page.waitForTimeout(450);
    }
    const c = await core(page);
    await expect.poll(async () => (await probe(page)).fx.rewardLast, { timeout: 10_000 }).not.toBe('');
    const seenPop = (await probe(page)).fx.rewardLast;
    const banner = page.locator('[data-ui="title-up"]');
    await expect(banner).toBeVisible({ timeout: 10_000 });
    // Банер: назва нового звання й рядок родини; звання з'явилось на XP ≥ 60.
    await expect(banner).toContainText('Нове звання: Майстер «Де мій ліхтар?»');
    await expect(banner).toContainText('Вікторія:');
    expect(c.game.progress?.xp ?? 0).toBeGreaterThanOrEqual(60);
    expect(Object.keys(c.game.quests).filter((q) => c.game.quests[q]?.status === 'completed').length, 'кроків позаду до звання').toBeGreaterThanOrEqual(5);
    // Банер не ловить дотики й не виходить за екран.
    const br = await rect(banner);
    expect(br && br.l >= 0 && br.r <= v.w && br.t >= 0 && br.b <= v.h, `банер у межах екрана ${JSON.stringify(br)}`).toBe(true);
    expect(await banner.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
    // Звук: через єдиний мікшер (ключ ui-confirmation); «+N» — сплив над героєм (лічильник проби).
    expect(await sounds(page)).toContain('ui-confirmation');
    const p = await probe(page);
    expect(p.fx.rewards, 'спливів нагороди').toBeGreaterThanOrEqual(1);
    expect(seenPop, 'підпис спливу: «+N XP»').toMatch(/^\+\d+ XP/);
    await page.locator('[data-ui="recovery-close"]').click({ timeout: 800 }).catch(() => undefined);   // нагадування про код відновлення не закриває банер на знімку
    await page.screenshot({ path: shot(v.side, 'titleup') });
    // Міряємо живий час ходьби скриптом (стіна годинника, що тече лише коли гра на мапі) і число дій гравця. Ігровий годинник (clockMin) тут НЕ міра: дорога (Visit) перемотує його на хвилини маршруту.
    console.log(`GAME-181 ЧАС ДО ПЕРШОГО ЗВАННЯ [${v.side}]: ${wallS} с ходьби скриптом, ${path.length} дій, XP ${c.game.progress?.xp}, ігровий годинник +${clockMin} хв (з перемотуванням доріг), шлях: ${path.join(' → ')}`);
    // Бюджет «перше нове звання за ~10 хв реальної гри»: ходьба скриптом ≤ 5 хв (решта 5 хв — читання підписів людиною, ≈ 20 с на дію × ≤ 15 дій) і ≤ 15 дій.
    expect(wallS, 'секунд ходьби скриптом до першого звання').toBeLessThanOrEqual(300);
    expect(path.length, 'дій гравця до першого звання').toBeLessThanOrEqual(15);
    expect(errors).toEqual([]);

    // Закон 1 (нагорода не святкується двічі): перезавантаження повертає прогрес і НЕ показує банер знову.
    const xp = c.game.progress?.xp;
    await page.waitForTimeout(800);
    await page.reload();
    await loaded(page);
    await page.waitForTimeout(600);
    expect((await core(page)).game.progress?.xp).toBe(xp);
    await expect(page.locator('[data-ui="title-up"]')).toHaveCount(0);
    await ctx.close();
  });
}

// ---------- ☰ «Навички» і картка підсумку дня: швидкий шлях кнопками панелі (як game-106) ----------
for (const v of VIEWS) {
  test(`☰ «Навички» (ранг, смужка, що відкриє наступний) і картка підсумку дня «+N XP · +N ОМ» з «Наступного разу» — ${v.name}`, async ({ browser }) => {
    test.setTimeout(240_000);
    const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/?seed=2');
    await loaded(page);
    const panel = page.locator('[data-ui="story"]');
    const press = async (loc: Locator): Promise<void> => { await loc.scrollIntoViewIfNeeded(); await loc.tap(); await page.waitForTimeout(400); };
    const act = async (kind: string, key = ''): Promise<void> => {
      const b = panel.locator(`[data-act="${kind}"][data-key="${key}"]`);
      if (!(await b.isVisible({ timeout: 5_000 }).catch(() => false))) throw new Error(`крок «${kind} ${key}»: кнопки немає`);
      await press(b);
      const dlg = panel.locator('[data-ui="dialogue"]');
      for (let i = 0; kind === 'visit' && key === 'loc.road' && i < 6 && await dlg.isVisible({ timeout: 400 }).catch(() => false); i++) await press(dlg.locator('[data-act]').last());
    };
    await press(page.locator('[data-touch="story"]'));
    await press(panel.locator('[data-act="create"]', { hasText: /Авто|Car/ }).first());
    // До створення звання на нулі: рядок «Звання» й вісім навичок вже в ☰.
    const prog = panel.locator('[data-ui="progress"]');
    await expect(prog).toBeVisible();
    await expect(prog.locator('[data-ui="title"]')).toContainText('Турист із запасними шкарпетками · 0 XP · 0 ОМ');
    const skills = panel.locator('[data-ui="skills"]');
    await expect(skills.locator('[data-ui="skill"]')).toHaveCount(8);

    for (const [k, key] of [['complete', 'q.prologue-home-001'], ['complete', 'q.st-001'], ['complete', 'q.st-002'], ['visit', 'loc.shop'], ['pickup', 'item.tent'], ['pickup', 'item.sleeping-bag'],
      ['complete', 'q.st-003'], ['visit', 'loc.home'], ['complete', 'q.ch1-home-001'], ['visit', 'loc.road'], ['complete', 'q.st-004'], ['visit', 'loc.camp.lake'], ['talk', 'npc.elise'],
      ['choose', 'dlg.elise-greeting.hello.c2'], ['continue', ''], ['choose', 'dlg.elise-greeting.spot.c1'], ['continue', ''], ['pickup', 'item.firewood']] as const) await act(k, key);

    // Навички після практики (візити, розмова, підбір): рядок кожної — ранг із назвою, смужка (до рангу 3), підпис «що відкриє наступний ранг».
    await expect(panel.locator('[data-ui="title"]')).toContainText('Майстер «Де мій ліхтар?»');   // 60+ XP позаду
    const rows = await skills.locator('[data-ui="skill"]').evaluateAll((els) => els.map((e) => ({
      id: (e as HTMLElement).dataset.skill, rank: Number((e as HTMLElement).dataset.rank), pct: Number((e as HTMLElement).dataset.pct),
      bar: e.querySelector('[role="progressbar"]') !== null, next: e.querySelector('[data-ui="skill-next"]')?.textContent ?? '', head: e.querySelector('.ui-skill-head')?.textContent ?? '',
    })));
    expect(rows.map((r) => r.id)).toEqual(['skill.planning', 'skill.camping', 'skill.mechanics', 'skill.electrics', 'skill.cooking', 'skill.finance', 'skill.endurance', 'skill.communication']);
    for (const r of rows) {
      expect(r.head, r.id).toMatch(/Ранг \d — /);
      expect(r.next, r.id).toMatch(/^Наступний ранг відкриє: \S/);
      if (r.rank < 3) expect(r.bar, `${r.id}: смужка до наступного рангу`).toBe(true);
    }
    expect(rows.some((r) => r.rank >= 1), 'практика дала хоч одній навичці ранг').toBe(true);
    await skills.evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: shot(v.side, 'skills') });
    await expect(panel.locator('[data-ui="summary"]')).toHaveCount(0);   // контроль: до кінця дня картки підсумку немає
    await act('complete', 'q.st-005');

    const summary = page.locator('[data-ui="summary"]');
    await expect(summary).toBeVisible();
    const c = await core(page);
    const reward = summary.locator('[data-ui="summary-reward"]');
    await expect(reward).toHaveText(/^За день: \+\d+ XP( · \+\d+ ОМ)?$/);
    // Число картки = те, що ядро справді нарахувало за день 1 (усе XP гри зараз — дня 1; ОМ — лише видані).
    expect(Number(await reward.getAttribute('data-xp'))).toBe(c.game.progress?.xp);
    expect(Number(await reward.getAttribute('data-om'))).toBe(c.game.progress?.om);
    await expect(summary.locator('[data-ui="summary-next"]')).toHaveText('Наступного разу: Ранок біля озера');
    await expect(summary.locator('[data-ui="summary-safe"]')).toContainText('Прогрес збережено');
    // Картка вміщає кнопки на екран (прокрутка допустима, але кнопки існують і ≥ 44 px).
    for (const b of ['summary-continue', 'summary-end']) {
      const r = await rect(summary.locator(`[data-ui="${b}"]`));
      expect(r && r.b - r.t >= 44, b).toBe(true);
    }
    await page.screenshot({ path: shot(v.side, 'summary') });
    expect(errors).toEqual([]);
    await ctx.close();
  });
}
