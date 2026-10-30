// GAME-39 #4 · жодна дія гравця не має таймера реального часу: ні вибір, ні відповідь, ні кнопка не зникає
// й не спрацьовує сама, поки гравець думає (WCAG 2.2.1). Сторож шукає джерела реального часу в логіці
// рішень за синтаксичним деревом TypeScript (коментарі й рядки не рахуються) і звіряє кожну знахідку
// з переліком винятків нижче — з причиною і точною кількістю.
// Ядро вже стереже eslint (src/guards/core-boundary.test.ts); тут — той самий принцип для всього src/.
// Сам ігровий годинник іде від дельти кадру (src/view/world/scene.ts → bridge.frame(game.loop.rawDelta), GAME-97) і стоїть,
// поки відкрито меню, — це хід світу, а не строк на вибір: жодна дія не зникає, поки гравець думає.
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// Увесь src/, крім тестів і src/view/spike (проба графіки, у гру не входить). Сцена теж: таймер там
// так само міг би вирішити за гравця. Текст файлів — через Vite (?raw), як у map-content.test.ts.
const RAW = import.meta.glob<string>([
  '../**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
  '!../**/*.test.*', '!../**/*.d.ts', '!../view/spike/**',
], { query: '?raw', import: 'default', eager: true });
const SOURCES: ReadonlyMap<string, string> = new Map(Object.entries(RAW).map(([k, v]) => [k.replace(/^\.\.\//, 'src/'), v]));

// Імена, що дають реальний час або відкладений виклик. Date — лише як значення (тип `Date` дозволено).
const TIMER_NAMES = new Set(['setTimeout', 'setInterval', 'requestAnimationFrame', 'requestIdleCallback', 'performance', 'Date']);
// Властивості, що дають відкладений виклик чи час: таймери й анімації Phaser (time.delayedCall / addEvent,
// tweens, add.timeline), AbortSignal.timeout, scheduler.postTask. `now` — лише на `time` (scene.time.now).
const TIMER_PROPS = new Set(['delayedCall', 'addEvent', 'tweens', 'timeline', 'timeout', 'postTask']);

/**
 * Винятки: файл → ім'я → скільки разів і чому це не таймер на дії гравця. Кількість — точна: нова
 * знахідка в тому ж файлі червона так само, як прибраний виняток (застарілий рядок переліку).
 * Класифікація поза скануванням: відкат 400 мс у createActionGate (src/view/world/actions.ts) рахує час
 * сцени, який йому передають параметром, — це захист від подвійного натискання (одне натискання = одна
 * команда), а не строк: нічого не зникає й не спрацьовує саме, якщо гравець повільний.
 */
const ALLOW: Readonly<Record<string, Readonly<Record<string, { count: number; why: string }>>>> = {
  'src/ui/Shell.tsx': {
    setTimeout: { count: 1, why: 'GAME-95: тост-підказка першого запуску сам зникає з екрана (TOAST_MS) — це лише гасіння підказки: жодна дія не зникає й не спрацьовує, ☰ лишається підсвіченою, hintSeen не чіпається' },
    requestAnimationFrame: { count: 1, why: 'повернути фокус на #stage після закриття екрана подорожі — керування фокусом, не рішення й не строк' },
  },
  'src/ui/DialogueBox.tsx': {
    requestAnimationFrame: { count: 1, why: 'GAME-179: друк тексту рамки розмови літера за літерою (≈ 62 літери/с) — лише краса: увесь рядок уже в DOM, тап/E/Space/Enter дописують миттєво, prefers-reduced-motion друку не має; жодна дія не зникає й не спрацьовує сама, поки гравець думає' },
  },
  'src/view/intro-room.ts': {
    requestAnimationFrame: { count: 2, why: 'GAME-191: дощ за вікном кімнати вступу — лише картинка (краплі від мітки кадру); жодна дія не залежить від нього й не зникає: кроки вступу йдуть тільки за дотиком, prefers-reduced-motion малює один статичний кадр' },
  },
  'src/view/frame-lag.ts': {
    performance: { count: 3, why: 'GAME-97/GAME-38: штучна затримка кадру й старту лише в збірці e2e (?frameLagMs, ?bootDelayMs) і вимір часу першого кадру (probe.firstFrameMs) — міряють затримку, гра нічого за ними не вирішує' },
  },
};

interface Hit { readonly file: string; readonly name: string; readonly line: number }

/** Знахідки джерел реального часу у файлі. Коментарі, рядки й позиції типів не рахуються. */
function realtimeHits(file: string, text: string): Hit[] {
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : file.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const out: Hit[] = [];
  const at = (n: ts.Node): number => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  // `time` або `….time` — об'єкт годинника Phaser, на якому `now` дає реальний час.
  const isTimeObj = (e: ts.Expression): boolean => (ts.isIdentifier(e) && e.text === 'time') || (ts.isPropertyAccessExpression(e) && e.name.text === 'time');
  const visit = (node: ts.Node): void => {
    if (ts.isTypeNode(node)) return;                                     // `d: Date` — тип, не годинник
    // Доступ за ключем: window['setTimeout'], globalThis['Date'], this.time['delayedCall'], time['now'].
    if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) {
      const k = node.argumentExpression.text;
      if (TIMER_NAMES.has(k) || TIMER_PROPS.has(k) || (k === 'now' && isTimeObj(node.expression))) out.push({ file, name: k, line: at(node.argumentExpression) });
    }
    if (ts.isPropertyAccessExpression(node) && node.name.text === 'now' && isTimeObj(node.expression)) out.push({ file, name: 'now', line: at(node.name) });
    if (ts.isIdentifier(node)) {
      const p = node.parent;
      const isPropName = p && ts.isPropertyAccessExpression(p) && p.name === node;
      const hit = TIMER_NAMES.has(node.text) || (isPropName && TIMER_PROPS.has(node.text));
      // Ключ об'єкта { setTimeout: 1 } чи оголошення поля — не виклик годинника.
      const isDeclName = p && (ts.isPropertyAssignment(p) || ts.isPropertySignature(p) || ts.isMethodDeclaration(p)) && p.name === node;
      if (hit && !isDeclName) out.push({ file, name: node.text, line: at(node) });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** Порушення: знахідки, яких немає в переліку, і рядки переліку, що розійшлися з кодом. */
function verdict(hits: readonly Hit[], allow = ALLOW): string[] {
  const counts = new Map<string, number>();
  for (const h of hits) counts.set(`${h.file}|${h.name}`, (counts.get(`${h.file}|${h.name}`) ?? 0) + 1);
  const out: string[] = [];
  for (const h of hits) if (!allow[h.file]?.[h.name]) out.push(`${h.file}:${h.line} ${h.name} — не в переліку винятків`);
  for (const [file, names] of Object.entries(allow)) {
    for (const [name, { count }] of Object.entries(names)) {
      const got = counts.get(`${file}|${name}`) ?? 0;
      if (got !== count) out.push(`${file} ${name}: у переліку ${count}, у коді ${got}`);
    }
  }
  return out;
}

describe('жодного таймера реального часу на діях гравця (GAME-39 #4)', () => {
  const files = [...SOURCES.keys()];
  const hits = files.flatMap((f) => realtimeHits(f, SOURCES.get(f) ?? ''));

  it('сканування не порожнє: увесь src/ без тестів і spike справді прочитано', () => {
    expect(files.filter((f) => f.startsWith('src/core/')).length).toBeGreaterThan(5);
    for (const f of ['src/main.ts', 'src/view/world/scene.ts', 'src/view/world/actions.ts', 'src/view/world/bridge.ts', 'src/content/story.ts', 'src/i18n/index.ts']) expect(files).toContain(f);
    expect(files.filter((f) => f.startsWith('src/view/spike/') || /\.test\./.test(f))).toEqual([]);
    expect(files).toContain('src/ui/Shell.tsx');
    expect(files).toContain('src/ui/StoryPanel.tsx');
    expect(files).toContain('src/platform/settings.ts');
    expect(files).toContain('src/view/story-offer.ts');
    // GAME-131: погода й прогноз — у скануванні, і для них винятків немає.
    for (const f of ['src/core/weather.ts', 'src/core/sim.ts', 'src/core/save.ts']) { expect(files).toContain(f); expect(ALLOW[f]).toBeUndefined(); }
  });

  it('логіка рішень: 0 знахідок поза переліком винятків, і перелік збігається з кодом', () => {
    expect(verdict(hits)).toEqual([]);
  });

  it('кожен виняток має причину', () => {
    for (const names of Object.values(ALLOW)) for (const { why } of Object.values(names)) expect(why.length).toBeGreaterThan(20);
  });

  // Негативні контролі: кожна форма мусить почервоніти у файлі UI.
  const INJECTED: [form: string, code: string][] = [
    ['setTimeout', 'export const f = (act: () => void): void => { setTimeout(act, 5000); };\n'],
    ['window.setTimeout', 'export const f = (act: () => void): number => window.setTimeout(act, 5000);\n'],
    ['setInterval', 'export const f = (): number => setInterval(() => {}, 1000);\n'],
    ['requestAnimationFrame', 'export const f = (): number => requestAnimationFrame(() => {});\n'],
    ['Date.now()', 'export const deadline = Date.now() + 10_000;\n'],
    ['new Date()', 'export const at = new Date();\n'],
    ['performance.now()', 'export const t0 = performance.now();\n'],
    ['globalThis.performance', 'export const t0 = globalThis.performance.now();\n'],
    ['scene.time.delayedCall', 'export const f = (s: { time: { delayedCall: (ms: number, cb: () => void) => void } }): void => s.time.delayedCall(5000, () => {});\n'],
    ["window['setTimeout']", "export const f = (act: () => void): number => window['setTimeout'](act, 5000);\n"],
    ["globalThis['Date']", "export const t0 = globalThis['Date'].now();\n"],
    ["this.time['delayedCall']", "export class S { time = { delayedCall: (_ms: number, _cb: () => void): void => {} }; go(): void { this.time['delayedCall'](5000, () => {}); } }\n"],
    ['this.tweens.add', 'export class S { tweens = { add: (_c: object): void => {} }; go(): void { this.tweens.add({ duration: 5000 }); } }\n'],
    ['this.add.timeline', 'export class S { add = { timeline: (_c: object[]): void => {} }; go(): void { this.add.timeline([]); } }\n'],
    ['scene.time.now', 'export const f = (s: { time: { now: number } }): number => s.time.now + 5000;\n'],
    ["time['now']", "export const f = (time: { now: number }): number => time['now'] + 5000;\n"],
    ['AbortSignal.timeout', 'export const sig = AbortSignal.timeout(5000);\n'],
    ['scheduler.postTask', 'export const f = (s: { postTask: (cb: () => void, o: object) => void }): void => s.postTask(() => {}, { delay: 5000 });\n'],
  ];
  for (const [form, code] of INJECTED) {
    it(`негативний контроль: ${form} у src/ui червоніє`, () => {
      const v = verdict([...hits, ...realtimeHits('src/ui/Probe.tsx', code)]);
      expect(v.some((x) => x.startsWith('src/ui/Probe.tsx:'))).toBe(true);
    });
  }

  it('негативний контроль: ще один requestAnimationFrame у Shell.tsx — понад перелік, червоніє', () => {
    const shell = SOURCES.get('src/ui/Shell.tsx') ?? '';
    expect(shell).toContain('requestAnimationFrame');
    const more = realtimeHits('src/ui/Shell.tsx', `${shell}\nexport const again = (): number => requestAnimationFrame(() => {});\n`);
    expect(verdict([...hits.filter((h) => h.file !== 'src/ui/Shell.tsx'), ...more])).toEqual(['src/ui/Shell.tsx requestAnimationFrame: у переліку 1, у коді 2']);
  });

  it('негативний контроль: застарілий виняток (знахідки в коді вже немає) — червоніє', () => {
    expect(verdict(hits.filter((h) => !(h.file === 'src/ui/Shell.tsx' && h.name === 'requestAnimationFrame')))).toEqual(['src/ui/Shell.tsx requestAnimationFrame: у переліку 1, у коді 0']);
  });

  it('негативний контроль (GAME-95): другий setTimeout у Shell.tsx — понад перелік, червоніє', () => {
    const shell = SOURCES.get('src/ui/Shell.tsx') ?? '';
    const more = realtimeHits('src/ui/Shell.tsx', `${shell}\nexport const again = (): number => setTimeout(() => {}, 1);\n`);
    expect(verdict([...hits.filter((h) => h.file !== 'src/ui/Shell.tsx'), ...more])).toEqual(['src/ui/Shell.tsx setTimeout: у переліку 1, у коді 2']);
  });

  // GAME-131 №3: прогноз, що «на завтра» рахує від годинника браузера, — червоніє в самому weather.ts.
  for (const [form, code] of [
    ['Date.now() у прогнозі', 'export const forecastDay = (): number => Math.floor(Date.now() / 86_400_000);\n'],
    ['new Date().getDate() у прогнозі', 'export const forecastDay = (): number => new Date().getDate();\n'],
  ] as const) {
    it(`негативний контроль (GAME-131): ${form} у src/core/weather.ts червоніє`, () => {
      const weather = SOURCES.get('src/core/weather.ts') ?? '';
      expect(weather).toContain('export function forecastOf');
      const injected = realtimeHits('src/core/weather.ts', `${weather}\n${code}`);
      expect(verdict([...hits.filter((h) => h.file !== 'src/core/weather.ts'), ...injected])).toEqual([expect.stringMatching(/^src\/core\/weather\.ts:\d+ Date — не в переліку винятків$/)]);
    });
  }

  it('позитивний контроль: коментар, рядок і тип Date — не знахідки (без хибного спрацювання)', () => {
    const ok = "// не використовувати setTimeout тут\nexport const label = 'Date.now';\nexport const f = (d: Date): number => d.getTime();\nexport const o = { setTimeout: 1 };\n"
      + "export const g = (o: Record<string, number>): number => o['label'] ?? 0;\nexport const h = (x: { now: number }): number => x.now;\n";
    expect(realtimeHits('src/ui/Ok.tsx', ok)).toEqual([]);
  });

  it(`файлів у скануванні: ${files.length}; знахідок у коді: ${hits.length} (усі — в переліку)`, () => {
    expect(hits.map((h) => `${h.file}|${h.name}`)).toEqual(['src/ui/DialogueBox.tsx|requestAnimationFrame', 'src/ui/Shell.tsx|setTimeout', 'src/ui/Shell.tsx|requestAnimationFrame', 'src/view/frame-lag.ts|performance', 'src/view/frame-lag.ts|performance', 'src/view/frame-lag.ts|performance', 'src/view/intro-room.ts|requestAnimationFrame', 'src/view/intro-room.ts|requestAnimationFrame']);
  });
});
