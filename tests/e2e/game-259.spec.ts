// GAME-259 · текст у рамці розмови / оповіді не обрізається, а плашка з іменем не налазить на перший рядок.
// Беремо найдовші справжні репліки (content/locales/uk.json, ключі dlg.*) у трьох видах рамки (розмова з портретом, оповідь, репліка героя з вибором)
// на трьох екранах і з текстом 200 %. Мутація (повернути старий CSS: плашка top:-17px у px-відступі, без тіней прокрутки) → червоніє.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { expect, test, type Page } from '@playwright/test';

const UK = JSON.parse(readFileSync(new URL('../../content/locales/uk.json', import.meta.url), 'utf8')) as Record<string, string>;
const byLen = (re: RegExp): string[] => Object.keys(UK).filter((k) => re.test(k)).sort((a, b) => (UK[b] as string).length - (UK[a] as string).length);
const LONG_LINES = byLen(/^dlg\.[^.]+\.[^.]+$/).slice(0, 5);
const LONG_CHOICES = byLen(/^dlg\..+\.c\d$/).slice(0, 3);

const VIEWPORTS = [{ w: 390, h: 844, scale: 100 }, { w: 932, h: 430, scale: 100 }, { w: 1280, h: 800, scale: 100 }, { w: 390, h: 844, scale: 200 }];
const FRAMES = [
  { name: 'npc', speakerId: 'npc.elise', speakerKey: 'npc.elise' },
  { name: 'narrator', speakerId: null, speakerKey: null },
  { name: 'player', speakerId: 'player', speakerKey: null },
];
const SHOTS = process.env.GAME259_SHOTS;   // тека для знімків «до/після» (лише ручний запуск)

let bundle = '';
test.beforeAll(async () => {
  const r = await build({ configFile: false, logLevel: 'silent', define: { __GAME_VERSION__: '"t"', __GAME_COMMIT__: '"t"' }, oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } }, esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
    build: { write: false, minify: false, lib: { entry: fileURLToPath(new URL('./frames-harness.tsx', import.meta.url)), formats: ['iife'], name: 'H' } } } as never) as unknown as { output: { code: string }[] } | { output: { code: string }[] }[];
  bundle = (Array.isArray(r) ? r[0] : r)?.output[0]?.code ?? '';
});

interface R { x: number; y: number; w: number; h: number }
async function measure(page: Page): Promise<{ problems: string[]; lines: number }> {
  return page.evaluate(() => {
    const rect = (e: Element): R => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
    const box = document.querySelector('.ui-talk-box') as HTMLElement;
    const main = document.querySelector('.ui-talk-main') as HTMLElement;
    const line = document.querySelector('.ui-talk-line') as HTMLElement;
    const badge = document.querySelector('.ui-talk-name') as HTMLElement;
    const problems: string[] = [];
    const vw = innerWidth; const vh = innerHeight;
    for (const el of [line, badge, ...Array.from(document.querySelectorAll<HTMLElement>('.ui-talk-answers .ui-btn'))]) {
      if (el.scrollWidth > el.clientWidth + 1) problems.push(`${el.className}: scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}`);
    }
    const br = rect(box);
    if (br.x < -1 || br.y < -1 || br.x + br.w > vw + 1 || br.y + br.h > vh + 1) problems.push(`рамка виходить за екран ${JSON.stringify(br)}`);
    const lr = rect(line); const mr = rect(main); const nr = rect(badge);
    // перший рядок видно повністю (без прокрутки) — відповіді не виштовхують його
    if (lr.y < mr.y - 1 || lr.y + Math.min(lr.h, mr.h) > mr.y + mr.h + 1) problems.push(`рядок поза видимою частиною: line ${JSON.stringify(lr)} main ${JSON.stringify(mr)}`);
    if (lr.y + lr.h > mr.y + mr.h + 1) {
      // рядок вищий за видиму частину: тоді main прокручується, і є ознака прокрутки (тіні)
      const cs = getComputedStyle(main);
      if (!(main.scrollHeight > main.clientHeight && /overlay|auto|scroll/.test(cs.overflowY) && cs.backgroundImage.includes('gradient'))) problems.push('рядок вищий за рамку, а прокрутки з ознакою немає');
    }
    // плашка не перетинає перший рядок і (рівно) лежить над краєм рамки
    const hit = nr.x < lr.x + lr.w && nr.x + nr.w > lr.x && nr.y < lr.y + lr.h && nr.y + nr.h > lr.y;
    if (hit) problems.push(`плашка перетинає перший рядок: badge ${JSON.stringify(nr)} line ${JSON.stringify(lr)}`);
    if (nr.y + nr.h > br.y + 8) problems.push(`плашка не над краєм рамки: badge ${JSON.stringify(nr)} box ${JSON.stringify(br)}`);
    if (nr.y < -1) problems.push('плашка вилізла за верх екрана');
    return { problems, lines: Math.round(lr.h / parseFloat(getComputedStyle(line).lineHeight)) };
  });
}

for (const vp of VIEWPORTS) {
  test(`GAME-259 · найдовші репліки не обрізаються — ${vp.w}×${vp.h}, текст ${vp.scale} %`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });   // друк миттєвий — міряємо повний текст
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.goto('/');
    await page.addScriptTag({ content: bundle });
    await page.evaluate((s) => { document.documentElement.style.fontSize = `${s}%`; }, vp.scale);
    const bad: string[] = [];
    for (const fr of FRAMES) {
      for (const lineKey of LONG_LINES) {
        for (const withChoices of [false, true]) {
          const answers = withChoices ? LONG_CHOICES.map((k, i) => ({ id: `a${i}`, kind: 'choose' as const, key: k })) : [{ id: 'c', kind: 'continue' as const, key: null }];
          await page.evaluate((s) => (window as unknown as { __mount: (x: unknown) => void }).__mount(s), { speakerId: fr.speakerId, speakerKey: fr.speakerKey, key: lineKey, answers });
          const r = await measure(page);
          for (const p of r.problems) bad.push(`${fr.name} ${lineKey} choices=${withChoices}: ${p}`);
          if (SHOTS && lineKey === LONG_LINES[0] && withChoices && fr.name === 'npc') await page.screenshot({ path: `${SHOTS}/${vp.w}x${vp.h}-${vp.scale}.png` });
        }
      }
    }
    const kinds = [...new Set(bad.map((b) => b.replace(/^.*?: /, '').replace(/[{[].*/, '').replace(/[0-9]+/g, 'N')))];
    expect(bad, kinds.join('\n') + '\n' + bad.slice(0, 2).map((b) => b.slice(0, 260)).join('\n')).toEqual([]);
  });
}
