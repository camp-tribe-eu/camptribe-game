// GAME-91 · рішення власника про телефон сторч: мапа на весь екран (камера їде за персонажем), шапка (☰ · текст · ‖),
// джойстик і кругла кнопка дії замість чотирьох стрілок, підпис збірки — лише в меню паузи.
// Кожна перевірка — числа (межі прямокутників, зсуви в px), не «на око». Негативні контролі (мутації) — у звіті картки.
import { expect, test, type Browser, type Page } from '@playwright/test';

const SETTINGS_KEY = 'camplife.settings.v1';
interface Probe { ready: boolean; playerX: number; playerY: number; cameraScrollX: number; cameraScrollY: number }
interface Rect { left: number; top: number; right: number; bottom: number; width: number; height: number }
const probe = (page: Page): Promise<Probe> => page.evaluate(() => ({ ...(window as unknown as { __game: { probe: Probe } }).__game.probe }));
const rectOf = (page: Page, sel: string): Promise<Rect> => page.locator(sel).first().evaluate((el) => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
});
const meets = (a: Rect, b: Rect): boolean => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

async function newPage(browser: Browser, vp: { width: number; height: number }, scale: 100 | 200, opts: { touch?: boolean; hintSeen?: boolean } = {}): Promise<Page> {
  const touch = opts.touch ?? true;
  const ctx = await browser.newContext({ viewport: vp, hasTouch: touch, isMobile: touch });
  const page = await ctx.newPage();
  await page.addInitScript(([k, s, seen]) => { try { localStorage.setItem(k, JSON.stringify({ textScale: s, language: 'uk', hintSeen: seen })); } catch { /* сховища немає */ } }, [SETTINGS_KEY, scale, opts.hintSeen ?? true] as const);
  await page.goto('/?seed=2');
  await page.waitForFunction(() => (window as unknown as { __game?: { probe: { ready: boolean; saveLoaded: boolean } } }).__game?.probe.saveLoaded === true, null, { timeout: 30_000 });
  return page;
}

/** Створити персонажа (як гравець: ☰ → «Велосипед» → закрити), щоб на мапі був шлях до скріншота й руху. */
async function createCharacter(page: Page): Promise<void> {
  await page.locator('[data-touch="story"]').tap();
  await page.locator('[data-ui="story"] [data-act="create"]', { hasText: /Велосипед|Bike/ }).first().tap();
  await page.waitForTimeout(400);   // GAME-80: панель глуха ~350 мс після дії
  await page.locator('[data-ui="story-close"]').tap();
  await expect(page.locator('[data-ui="story"]')).toHaveCount(0);
}

/** Відвести ручку джойстика СПРАВЖНІМ дотиком (CDP) на (dx, dy) від центру; `during` — що міряти, поки палець тримає. */
async function drag(page: Page, dx: number, dy: number, ms: number, during?: () => Promise<void>): Promise<void> {
  const box = await page.locator('[data-touch="stick"]').boundingBox();
  if (!box) throw new Error('джойстика немає');
  const c = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [c] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: c.x + dx, y: c.y + dy }] });
  await page.waitForTimeout(ms);
  if (during) await during();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(100);
}

const PHONES = [{ width: 390, height: 844 }, { width: 375, height: 667 }, { width: 360, height: 800 }] as const;

for (const vp of PHONES) {
  test.describe(`телефон сторч ${vp.width}×${vp.height}`, () => {
    test(`мапа на весь екран: канва ≥ 95 % ширини й ≥ 75 % висоти вікна; камера везе персонажа, він завжди в кадрі`, async ({ browser }) => {
      const page = await newPage(browser, vp, 100);
      await createCharacter(page);
      await page.waitForTimeout(300);
      const m = await page.evaluate(() => {
        const c = document.querySelector('#stage canvas') as HTMLCanvasElement;
        const r = c.getBoundingClientRect();
        return { w: r.width, h: r.height, bufW: c.width, bufH: c.height, vw: innerWidth, vh: innerHeight };
      });
      expect(m.w, `ширина ${m.w} з ${m.vw}`).toBeGreaterThanOrEqual(m.vw * 0.95);
      expect(m.h, `висота ${m.h} з ${m.vh}`).toBeGreaterThanOrEqual(m.vh * 0.75);
      // Пікселі чіткі: масштаб буфера → екран цілий (допуск на пів-відсотка округлення поля).
      const k = m.w / m.bufW;
      expect(Math.abs(k - Math.round(k)), `масштаб ${k}`).toBeLessThan(0.05);
      await page.screenshot({ path: `test-results/game-91-${vp.width}x${vp.height}.png` });

      // Мапа 640 px завширшки, кадр — ~200 (GAME-93): без камери персонаж, що дійшов до правої стіни, вийшов би за кадр.
      const inFrame = async (): Promise<{ x: number; y: number }> => { const p = await probe(page); return { x: p.playerX - p.cameraScrollX, y: p.playerY - p.cameraScrollY }; };
      let farthest = 0;
      for (const [dx, dy] of [[50, 0], [0, 50], [-50, 0], [0, -50]] as const) {
        await drag(page, dx, dy, 1500, async () => {
          const p = await probe(page);
          farthest = Math.max(farthest, p.playerX);
          const s = await inFrame();
          expect(s.x, `x у кадрі (${dx},${dy})`).toBeGreaterThanOrEqual(0);
          expect(s.x, `x у кадрі (${dx},${dy})`).toBeLessThanOrEqual(m.bufW);
          expect(s.y, `y у кадрі (${dx},${dy})`).toBeGreaterThanOrEqual(0);
          expect(s.y, `y у кадрі (${dx},${dy})`).toBeLessThanOrEqual(m.bufH);
        });
      }
      await drag(page, 50, 0, 3000);
      const end = await probe(page);
      farthest = Math.max(farthest, end.playerX);
      expect(farthest, 'дійшов далі за ширину кадру — без камери зник би').toBeGreaterThan(m.bufW);
      expect(end.cameraScrollX, 'камера справді поїхала').toBeGreaterThan(0);
      const s = await inFrame();
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThanOrEqual(m.bufW);
      await page.context().close();
    });
  });
}

// Шапка: ☰ зліва, ‖ справа, текст посередині; жодних перетинів, також при тексті 200 % і з підказкою першого запуску.
for (const scale of [100, 200] as const) for (const hint of [false, true]) {
  test(`шапка 390×844, текст ${scale} %${hint ? ', з підказкою першого запуску' : ''}: ☰ ліворуч, ‖ праворуч, текст між ними без перетинів`, async ({ browser }) => {
    const page = await newPage(browser, { width: 390, height: 844 }, scale, { hintSeen: !hint });
    if (hint) await expect(page.locator('[data-ui="hint"]')).toBeVisible();
    const [menu, pause, hud, place, time, money, header] = await Promise.all(
      ['[data-touch="story"]', '[data-touch="pause"]', '[data-ui="hud"]', '[data-ui="hud-place"]', '[data-ui="hud-time"]', '[data-ui="hud-money"]', '.ui-header'].map((q) => rectOf(page, q)));
    if (!menu || !pause || !hud || !place || !time || !money || !header) throw new Error('немає елемента шапки');
    expect(menu.left, '☰ у лівому куті').toBeLessThan(20);
    expect(390 - pause.right, '‖ у правому куті').toBeLessThan(20);
    expect(menu.top).toBeLessThan(20);
    expect(pause.top).toBeLessThan(20);
    expect(menu.right, '☰ ліворуч від тексту').toBeLessThanOrEqual(hud.left + 0.5);
    expect(hud.right, 'текст ліворуч від ‖').toBeLessThanOrEqual(pause.left + 0.5);
    expect(meets(menu, hud) || meets(pause, hud) || meets(menu, pause)).toBe(false);
    // Кожен шматок тексту лежить усередині середньої колонки (нічого не сховано під кнопками, не вилізло вбік).
    for (const [name, r] of Object.entries({ place, time, money })) {
      expect(r.left, name).toBeGreaterThanOrEqual(hud.left - 0.5);
      expect(r.right, name).toBeLessThanOrEqual(hud.right + 0.5);
      expect(meets(r, menu) || meets(r, pause), `${name} під кнопкою`).toBe(false);
    }
    expect(await page.locator('[data-ui="hud"]').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    for (const [name, r] of Object.entries({ menu, pause })) { expect(r.width, name).toBeGreaterThanOrEqual(44); expect(r.height, name).toBeGreaterThanOrEqual(44); }
    if (hint) { const h = await rectOf(page, '[data-ui="hint"]'); expect(h.left).toBeGreaterThanOrEqual(hud.left - 0.5); expect(h.right).toBeLessThanOrEqual(hud.right + 0.5); }
    await page.context().close();
  });
}

test.describe('джойстик', () => {
  test('ціль ≥ 44×44; вісім напрямків рухають персонажа в свій бік; ручка їде за пальцем; відпустив — стоїть', async ({ browser }) => {
    const page = await newPage(browser, { width: 390, height: 844 }, 100);
    await createCharacter(page);
    const base = await rectOf(page, '[data-touch="stick"]');
    expect(base.width).toBeGreaterThanOrEqual(44);
    expect(base.height).toBeGreaterThanOrEqual(44);
    expect(base.left, 'знизу ліворуч').toBeLessThan(40);
    expect(844 - base.bottom, 'знизу ліворуч').toBeLessThan(60);
    const act = await rectOf(page, '[data-touch="interact"]');
    expect(act.width).toBeGreaterThanOrEqual(44);
    expect(390 - act.right, 'кнопка дії знизу праворуч').toBeLessThan(40);
    expect(meets(base, act)).toBe(false);

    // Порядок: пара, що повертає на місце, — щоб не впертися в стіну.
    const dirs: [string, number, number][] = [
      ['вниз-праворуч', 36, 36], ['вгору-ліворуч', -36, -36], ['вниз-ліворуч', -36, 36], ['вгору-праворуч', 36, -36],
      ['праворуч', 50, 0], ['ліворуч', -50, 0], ['вниз', 0, 50], ['вгору', 0, -50],
    ];
    for (const [name, dx, dy] of dirs) {
      const a = await probe(page);
      let knob = '';
      await drag(page, dx, dy, 350, async () => { knob = await page.locator('.touch-knob').evaluate((e) => (e as HTMLElement).style.transform); });
      // Відпускання дійшло (data-held порожній) і персонаж став: кадр сцени гасить швидкість не миттєво, а під
      // навантаженням CI кадр довший (PR #39: фіксована пауза ловила ще 15 px руху). Залиплий джойстик не дасть
      // порожнього data-held — тест червоніє на ньому, а не на позиції (персонаж міг би стати й у стіні).
      await expect(page.locator('[data-touch="stick"]'), `${name}: відпущено`).toHaveAttribute('data-held', '');
      await expect.poll(async () => {
        const y1 = await probe(page);
        await page.waitForTimeout(150);
        const y2 = await probe(page);
        return Math.abs(y2.playerX - y1.playerX) + Math.abs(y2.playerY - y1.playerY);
      }, { timeout: 3000 }).toBeLessThan(0.5);
      const b = await probe(page);
      const mx = b.playerX - a.playerX;
      const my = b.playerY - a.playerY;
      if (dx === 0) expect(Math.abs(mx), `${name}: по X`).toBeLessThan(1); else expect(mx * Math.sign(dx), `${name}: по X`).toBeGreaterThan(8);
      if (dy === 0) expect(Math.abs(my), `${name}: по Y`).toBeLessThan(1); else expect(my * Math.sign(dy), `${name}: по Y`).toBeGreaterThan(8);
      expect(knob, `${name}: ручка відведена`).toContain('translate(');
      expect(knob, `${name}: ручка відведена`).not.toBe('translate(0px, 0px)');
      // Відпустили — персонаж не доїжджає: позиція за 250 мс не змінилась.
      await page.waitForTimeout(250);
      const c = await probe(page);
      expect(Math.abs(c.playerX - b.playerX) + Math.abs(c.playerY - b.playerY), `${name}: після відпускання стоїть`).toBeLessThan(0.5);
      expect(await page.locator('.touch-knob').evaluate((e) => (e as HTMLElement).style.transform), `${name}: ручка повернулась`).toBe('');
    }
    await page.context().close();
  });

  test('мишею (вказівник): потягнув — пішов, відпустив — зупинився', async ({ browser }) => {
    const page = await newPage(browser, { width: 390, height: 844 }, 100);
    await createCharacter(page);
    const box = await page.locator('[data-touch="stick"]').boundingBox();
    if (!box) throw new Error('джойстика немає');
    const a = await probe(page);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 50, { steps: 4 });
    await page.waitForTimeout(400);
    await page.mouse.up();
    await expect(page.locator('[data-touch="stick"]')).toHaveAttribute('data-held', '');
    // Кадр сцени гасить швидкість не миттєво, а під паралельним e2e кадр великої сцени LPC довший (PR #36: фіксовані
    // 100 мс не встигали). Тож чекаємо, поки позиція стане (два заміри через 150 мс збіглися). Залиплий джойстик не
    // стане ніколи. Але в стіні персонаж теж «стає», тому сторож відпускання — data-held: мутація «pointerup не
    // відпускає» червоніє на ньому, а не на позиції (перевірено).
    await expect.poll(async () => {
      const y1 = (await probe(page)).playerY;
      await page.waitForTimeout(150);
      return Math.abs((await probe(page)).playerY - y1);
    }, { timeout: 3000 }).toBeLessThan(0.5);
    const b = await probe(page);
    expect(b.playerY - a.playerY).toBeGreaterThan(8);
    await page.waitForTimeout(250);
    expect(Math.abs((await probe(page)).playerY - b.playerY)).toBeLessThan(0.5);
    await page.context().close();
  });

  test('дрібний зсув у мертвій зоні не рухає персонажа', async ({ browser }) => {
    const page = await newPage(browser, { width: 390, height: 844 }, 100);
    const a = await probe(page);
    await drag(page, 6, 6, 400);
    const b = await probe(page);
    expect(Math.abs(b.playerX - a.playerX) + Math.abs(b.playerY - a.playerY)).toBeLessThan(0.5);
    await page.context().close();
  });

  // Відпускання без pointerup (рецензія PR #31): палець ще «тримає», а подія відпускання не прийде. Усе міряємо ВСЕРЕДИНІ
  // утримання (до справжнього touchEnd, який сам би відпустив), інакше тест нічого не доводить.
  const heldDirs = (page: Page): Promise<string> => page.locator('[data-touch="stick"]').evaluate((e) => (e as HTMLElement).dataset.held ?? '');
  async function expectStopped(page: Page, why: string): Promise<void> {
    await page.waitForTimeout(150);
    const a = await probe(page);
    await page.waitForTimeout(500);
    const b = await probe(page);
    expect(Math.abs(b.playerX - a.playerX) + Math.abs(b.playerY - a.playerY), `${why}: стоїть`).toBeLessThan(0.5);
    expect(await heldDirs(page), `${why}: жоден напрямок не натиснутий`).toBe('');
    expect(await page.locator('.touch-knob').evaluate((e) => (e as HTMLElement).style.transform), `${why}: ручка повернулась`).toBe('');
  }
  async function movingNow(page: Page): Promise<void> {
    const a = await probe(page);
    await page.waitForTimeout(200);
    const b = await probe(page);
    expect(Math.abs(b.playerY - a.playerY) + Math.abs(b.playerX - a.playerX), 'до перерви персонаж ішов').toBeGreaterThan(2);
    expect(await heldDirs(page), 'до перерви напрямок натиснутий').not.toBe('');
  }
  const stickEvent = (page: Page, type: string): Promise<void> => page.locator('[data-touch="stick"]').evaluate((el, t) => {
    el.dispatchEvent(new PointerEvent(t, { pointerId: (window as unknown as { __pid: number }).__pid, bubbles: true }));
  }, type);
  async function trackPointerId(page: Page): Promise<void> {
    await page.locator('[data-touch="stick"]').evaluate((el) => el.addEventListener('pointerdown', (e) => { (window as unknown as { __pid: number }).__pid = (e as PointerEvent).pointerId; }, { capture: true }));
  }

  for (const type of ['pointercancel', 'lostpointercapture']) {
    test(`${type} посеред утримання: персонаж зупиняється, жоден напрямок не лишається`, async ({ browser }) => {
      const page = await newPage(browser, { width: 390, height: 844 }, 100);
      await createCharacter(page);
      await trackPointerId(page);
      await drag(page, 0, 50, 350, async () => {
        await movingNow(page);
        await stickEvent(page, type);
        await expectStopped(page, type);
      });
      await page.context().close();
    });
  }

  test('blur вікна посеред утримання: персонаж зупиняється', async ({ browser }) => {
    const page = await newPage(browser, { width: 390, height: 844 }, 100);
    await createCharacter(page);
    await drag(page, 0, 50, 350, async () => {
      await movingNow(page);
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      await expectStopped(page, 'blur');
    });
    await page.context().close();
  });

  test('pagehide посеред утримання: персонаж зупиняється', async ({ browser }) => {
    const page = await newPage(browser, { width: 390, height: 844 }, 100);
    await createCharacter(page);
    await drag(page, 0, 50, 350, async () => {
      await movingNow(page);
      await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
      await expectStopped(page, 'pagehide');
    });
    await page.context().close();
  });

  test('вкладка схована (visibilitychange → hidden) посеред утримання: персонаж зупиняється', async ({ browser }) => {
    const page = await newPage(browser, { width: 390, height: 844 }, 100);
    await createCharacter(page);
    await drag(page, 0, 50, 350, async () => {
      await movingNow(page);
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await expectStopped(page, 'visibilitychange');
    });
    await page.context().close();
  });

  test('пауза (‖) відкрита посеред утримання, потім закрита: персонаж не йде сам', async ({ browser }) => {
    const page = await newPage(browser, { width: 390, height: 844 }, 100);
    await createCharacter(page);
    await drag(page, 0, 50, 350, async () => {
      await movingNow(page);
      await page.locator('[data-touch="pause"]').evaluate((el) => (el as HTMLElement).click());
      await expect(page.locator('[data-ui="pause"]')).toHaveCount(1);
      await page.locator('[data-ui="resume"]').evaluate((el) => (el as HTMLElement).click());
      await expect(page.locator('[data-ui="pause"]')).toHaveCount(0);
      await expectStopped(page, 'після закриття паузи');
    });
    await page.context().close();
  });

  test('панель «Подорож» відкрита посеред утримання, потім закрита: персонаж не йде сам', async ({ browser }) => {
    const page = await newPage(browser, { width: 390, height: 844 }, 100);
    await createCharacter(page);
    await drag(page, 0, 50, 350, async () => {
      await movingNow(page);
      await page.locator('[data-touch="story"]').evaluate((el) => (el as HTMLElement).click());
      await expect(page.locator('[data-ui="story"]')).toHaveCount(1);
      await page.waitForTimeout(400);
      await page.locator('[data-ui="story-close"]').evaluate((el) => (el as HTMLElement).click());
      await expect(page.locator('[data-ui="story"]')).toHaveCount(0);
      await expectStopped(page, 'після закриття історії');
    });
    await page.context().close();
  });

  for (const type of ['pointercancel', 'lostpointercapture']) {
    test(`кнопка дії: ${type} відпускає її`, async ({ browser }) => {
      const page = await newPage(browser, { width: 390, height: 844 }, 100);
      const btn = page.locator('[data-touch="interact"]');
      await btn.evaluate((el) => el.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, bubbles: true })));
      expect(await btn.evaluate((e) => (e as HTMLElement).dataset.held), 'натиснута').toBe('interact');
      await btn.evaluate((el, t) => el.dispatchEvent(new PointerEvent(t, { pointerId: 7, bubbles: true })), type);
      expect(await btn.evaluate((e) => (e as HTMLElement).dataset.held), `${type}: відпущена`).toBe('');
      await page.context().close();
    });
  }
});

test.describe('підпис збірки', () => {
  test('є в меню паузи (повний SHA), на екрані гри його немає', async ({ browser }) => {
    const page = await newPage(browser, { width: 390, height: 844 }, 100);
    await expect(page.locator('.build')).toHaveCount(0);
    await expect(page.locator('[data-ui="build"]')).toHaveCount(0);
    await page.locator('[data-touch="pause"]').tap();
    await expect(page.locator('[data-ui="pause"] [data-ui="build"]')).toHaveText(/^CampLife v\S+ · ([0-9a-f]{40}|unknown)$/);
    await page.context().close();
  });
});

test.describe('десктоп без дотику', () => {
  test('стрілки клавіатури працюють, дотикових елементів немає, кадр широкий', async ({ browser }) => {
    const page = await newPage(browser, { width: 1280, height: 800 }, 100, { touch: false });
    await expect(page.locator('[data-touch="stick"]')).toBeHidden();
    await expect(page.locator('[data-touch="interact"]')).toBeHidden();
    await expect(page.locator('[data-touch="story"]')).toBeVisible();
    expect(await page.evaluate(() => (document.querySelector('#stage canvas') as HTMLCanvasElement).width)).toBe(640);   // GAME-93: широкий кадр 640×352 (тайл 32 px)
    const a = await probe(page);
    await page.keyboard.down('ArrowDown');
    await expect.poll(async () => (await probe(page)).playerY - a.playerY, { timeout: 5000 }).toBeGreaterThan(20);
    await page.keyboard.up('ArrowDown');
    await page.context().close();
  });
});
