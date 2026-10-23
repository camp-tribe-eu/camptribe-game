// GAME-39 #4 · жодна дія гравця не має таймера реального часу: ні вибір, ні відповідь, ні кнопка не зникає
// й не спрацьовує сама, поки гравець думає (WCAG 2.2.1). Сторож шукає джерела реального часу в логіці
// рішень за синтаксичним деревом TypeScript (коментарі й рядки не рахуються) і звіряє кожну знахідку
// з переліком винятків нижче — з причиною і точною кількістю.
// Ядро вже стереже eslint (src/guards/core-boundary.test.ts); тут — той самий принцип для UI, платформи
// й шару view, що будує пропозицію дій.
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// Де живуть рішення гравця. Сцена (src/view/world/scene.ts) сюди не входить: вона малює й рухає, а дію
// віддає через actions.ts — його скануємо. Текст файлів — через Vite (?raw), як у map-content.test.ts.
const RAW = import.meta.glob<string>([
  '../core/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}', '../ui/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}', '../platform/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
  '../view/story-offer.ts', '../view/world/actions.ts',
  '!../**/*.test.*', '!../**/*.d.ts',
], { query: '?raw', import: 'default', eager: true });
const SOURCES: ReadonlyMap<string, string> = new Map(Object.entries(RAW).map(([k, v]) => [k.replace(/^\.\.\//, 'src/'), v]));

// Імена, що дають реальний час або відкладений виклик. Date — лише як значення (тип `Date` дозволено).
const TIMER_NAMES = new Set(['setTimeout', 'setInterval', 'requestAnimationFrame', 'requestIdleCallback', 'performance', 'Date']);
// Таймери Phaser (scene.time.delayedCall / addEvent) — на випадок, якщо логіка рішень колись їх покличе.
const TIMER_PROPS = new Set(['delayedCall', 'addEvent']);

/**
 * Винятки: файл → ім'я → скільки разів і чому це не таймер на дії гравця. Кількість — точна: нова
 * знахідка в тому ж файлі червона так само, як прибраний виняток (застарілий рядок переліку).
 * Класифікація поза скануванням: відкат 400 мс у createActionGate (src/view/world/actions.ts) рахує час
 * сцени, який йому передають параметром, — це захист від подвійного натискання (одне натискання = одна
 * команда), а не строк: нічого не зникає й не спрацьовує саме, якщо гравець повільний.
 */
const ALLOW: Readonly<Record<string, Readonly<Record<string, { count: number; why: string }>>>> = {
  'src/ui/Shell.tsx': {
    requestAnimationFrame: { count: 1, why: 'повернути фокус на #stage після закриття екрана подорожі — керування фокусом, не рішення й не строк' },
  },
};

interface Hit { readonly file: string; readonly name: string; readonly line: number }

/** Знахідки джерел реального часу у файлі. Коментарі, рядки й позиції типів не рахуються. */
function realtimeHits(file: string, text: string): Hit[] {
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : file.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const out: Hit[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isTypeNode(node)) return;                                     // `d: Date` — тип, не годинник
    if (ts.isIdentifier(node)) {
      const p = node.parent;
      const isPropName = p && ts.isPropertyAccessExpression(p) && p.name === node;
      const hit = TIMER_NAMES.has(node.text) || (isPropName && TIMER_PROPS.has(node.text));
      // Ключ об'єкта { setTimeout: 1 } чи оголошення поля — не виклик годинника.
      const isDeclName = p && (ts.isPropertyAssignment(p) || ts.isPropertySignature(p) || ts.isMethodDeclaration(p)) && p.name === node;
      if (hit && !isDeclName) out.push({ file, name: node.text, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1 });
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

  it('сканування не порожнє: файли ядра, UI і платформи справді прочитано', () => {
    expect(files.filter((f) => f.startsWith('src/core/')).length).toBeGreaterThan(5);
    expect(files).toContain('src/ui/Shell.tsx');
    expect(files).toContain('src/ui/StoryPanel.tsx');
    expect(files).toContain('src/platform/settings.ts');
    expect(files).toContain('src/view/story-offer.ts');
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
    expect(verdict(hits.filter((h) => h.file !== 'src/ui/Shell.tsx'))).toEqual(['src/ui/Shell.tsx requestAnimationFrame: у переліку 1, у коді 0']);
  });

  it('позитивний контроль: коментар, рядок і тип Date — не знахідки (без хибного спрацювання)', () => {
    const ok = "// не використовувати setTimeout тут\nexport const label = 'Date.now';\nexport const f = (d: Date): number => d.getTime();\nexport const o = { setTimeout: 1 };\n";
    expect(realtimeHits('src/ui/Ok.tsx', ok)).toEqual([]);
  });

  it(`файлів у скануванні: ${files.length}; знахідок у коді: ${hits.length} (усі — в переліку)`, () => {
    expect(hits.map((h) => `${h.file}|${h.name}`)).toEqual(['src/ui/Shell.tsx|requestAnimationFrame']);
  });
});
