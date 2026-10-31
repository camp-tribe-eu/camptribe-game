// GAME-203 · намет разом (OD-024 §3): тато б'є кілки, мама й Метью тягнуть відтяжки з боків (власна анімація, полотно дихає) — кілків на руки тата 2 замість 4;
// результат — та сама справа ядра «Намет». Шлях «сам» (?tentAlone=1, лише збірка e2e): 4 кілки, помічників нема. Обидва шляхи доводять намет до кінця;
// разом — в обох орієнтаціях телефона, знімок — посеред забивання, поки помічники тягнуть.
import { expect, test } from '@playwright/test';
import { playTent, probe, route, walk } from './chapter-driver';
import { arriveInCamp, taskOutcome } from './camp-arrival';

const SHOTS = process.env.FAMILY_SHOTS ?? 'test-results';
const VIEWS = [{ side: 'landscape', w: 844, h: 390, name: 'ландшафт' }, { side: 'portrait', w: 390, h: 844, name: 'портрет' }] as const;
const CASES = [{ alone: false, view: VIEWS[0] }, { alone: false, view: VIEWS[1] }, { alone: true, view: VIEWS[0] }] as const;

for (const c of CASES) {
  test(`намет ${c.alone ? 'сам: 4 кілки, помічників нема' : 'разом: 2 кілки тата, двоє тягнуть відтяжки'} → справа «Намет» зроблена — ${c.view.name}`, async ({ browser }) => {
    test.setTimeout(600_000);
    const ctx = await browser.newContext({ viewport: { width: c.view.w, height: c.view.h }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errors = await arriveInCamp(page, c.alone ? '&tentAlone=1' : '');
    expect(await taskOutcome(page, 'pitch-tent')).toBe('open');
    const q = await probe(page);
    await walk(page, route('camp-lake', [q.playerX, q.playerY], 'task.pitch-tent'));
    await expect.poll(async () => (await probe(page)).nearObject, { timeout: 8_000 }).toBe('task.pitch-tent');
    await page.waitForTimeout(2_500);   // родина підходить: помічник тягне відтяжку, лише якщо поруч
    await page.locator('[data-touch="interact"]').tap();
    await playTent(page, true, async () => {
      const p = await probe(page);
      if (c.alone) {
        expect(p.tent.helpers).toBe(0);
        expect(p.tent.need).toBe(4);
        expect(p.jobs.every((j) => j === null), 'сам: ніхто не тягне відтяжки').toBe(true);
      } else {
        expect(p.tent.helpers, 'двоє тягнуть відтяжки').toBe(2);
        expect(p.tent.need, 'кілків на руки тата менше').toBe(2);
        await expect.poll(async () => (await probe(page)).jobs.filter((j) => j?.kind === 'tent' && j.phase === 'pull').length, { timeout: 8_000, message: 'обоє мусять дійти й тягнути' }).toBe(2);
        const r = await probe(page);
        // Помічники — по боках намету (ліворуч і праворуч від підошви), не в строю за героєм.
        const xs = r.followers.map((f) => f.x - r.tent.x);
        expect(Math.min(...xs), 'хтось ліворуч від намету').toBeLessThan(-16);
        expect(Math.max(...xs), 'хтось праворуч від намету').toBeGreaterThan(16);
        await page.screenshot({ path: `${SHOTS}/family-tent-${c.view.side}.png` });
      }
    });
    await expect.poll(() => taskOutcome(page, 'pitch-tent'), { timeout: 8_000, message: 'ядро зарахувало справу «Намет»' }).toBe('done');
    expect((await probe(page)).tent.phase).toBe('idle');
    // Намет стоїть — відтяжки відпущено, родина знову вільна.
    await expect.poll(async () => (await probe(page)).jobs.every((j) => j === null), { timeout: 5_000 }).toBe(true);
    expect(errors).toEqual([]);
    await ctx.close();
  });
}
