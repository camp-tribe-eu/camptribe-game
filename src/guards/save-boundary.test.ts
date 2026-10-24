// GAME-103 (OD-015 п.4) · усе збереження гри йде через ОДИН модуль, щоб згодом сховище YouTube Playables SDK
// замінило IndexedDB в одному місці. Сторож шукає за синтаксичним деревом TypeScript (коментарі й рядки не
// рахуються) звернення до indexedDB / localStorage / sessionStorage у всьому src/ — і пускає лише:
//   * модуль збереження: src/platform/save-*.ts (не тести);
//   * settings.ts — названий виняток (див. ALLOW_SETTINGS).
// Друга половина: поза модулем ніхто не імпортує реалізації (save-store, save-memory) напряму — лише save-backend.
// Межі сторожа: (1) імена, складені під час виконання (globalThis['local' + 'Storage']), AST не бачить — це ловить лише
// рецензія; (2) vitest кешує результат import.meta.glob у node_modules/.vitest-cache, тож локально НОВИЙ файл-порушник
// видно лише після `npm run check` (він чистить кеш) — CI завжди стартує з чистого кешу.
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const RAW = import.meta.glob<string>([
  '../**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
  '!../**/*.test.*', '!../**/*.d.ts', '!../view/spike/**',
], { query: '?raw', import: 'default', eager: true });
const SOURCES: ReadonlyMap<string, string> = new Map(Object.entries(RAW).map(([k, v]) => [k.replace(/^\.\.\//, 'src/'), v]));

/** Браузерні сховища, у які сейв потрапляти не має поза модулем. */
const STORAGE_NAMES = new Set(['indexedDB', 'localStorage', 'sessionStorage']);
/** Модуль збереження: файли src/platform/save-*.ts. */
const isSaveModule = (file: string): boolean => /^src\/platform\/save-[^/]+\.ts$/.test(file);
/** Реалізації, що імпортуються лише всередині модуля (поза ним — через save-backend). */
const IMPLEMENTATIONS = /(^|\/)save-(store|memory)$/;

/**
 * Названий виняток: налаштування — не сейв. Лише `camplife.settings.v1` (масштаб тексту, мова, прапорці підказок),
 * у сейв вони не входять і формату сейву не змінюють; у YouTube-збірці їм буде своя реалізація (GAME-103 не чіпає).
 * Кількість точна: нова знахідка в settings.ts червона так само, як застарілий рядок.
 */
const ALLOW_SETTINGS: Readonly<Record<string, { name: string; count: number; why: string }>> = {
  'src/platform/settings.ts': { name: 'localStorage', count: 1, why: 'налаштування гравця (camplife.settings.v1) — не частина сейву, окремий ключ і окремий життєвий цикл' },
};

interface Hit { readonly file: string; readonly name: string; readonly line: number }

function parse(file: string, text: string): ts.SourceFile {
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : file.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
}

/** Знахідки: ім'я сховища як ідентифікатор (`indexedDB`, `window.localStorage`) чи ключ `globalThis['localStorage']`. */
function storageHits(file: string, text: string): Hit[] {
  const sf = parse(file, text);
  const out: Hit[] = [];
  const at = (n: ts.Node): number => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const visit = (node: ts.Node): void => {
    if (ts.isTypeNode(node)) return;
    if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression) && STORAGE_NAMES.has(node.argumentExpression.text)) {
      out.push({ file, name: node.argumentExpression.text, line: at(node.argumentExpression) });
    }
    if (ts.isIdentifier(node) && STORAGE_NAMES.has(node.text)) {
      const p = node.parent;
      const isDeclName = p && (ts.isPropertyAssignment(p) || ts.isPropertySignature(p) || ts.isMethodDeclaration(p)) && p.name === node;
      if (!isDeclName) out.push({ file, name: node.text, line: at(node) });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** Імпорти реалізацій сховища (`./save-store`, `../platform/save-memory`, динамічний import()). */
function implementationImports(file: string, text: string): Hit[] {
  const sf = parse(file, text);
  const out: Hit[] = [];
  const visit = (node: ts.Node): void => {
    const spec = ts.isImportDeclaration(node) || ts.isExportDeclaration(node) ? node.moduleSpecifier
      : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword ? node.arguments[0] : undefined;
    if (spec && ts.isStringLiteralLike(spec) && IMPLEMENTATIONS.test(spec.text)) out.push({ file, name: spec.text, line: sf.getLineAndCharacterOfPosition(spec.getStart(sf)).line + 1 });
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** Порушення: знахідки поза модулем і поза винятком; рядки винятку, що розійшлися з кодом. */
function verdict(hits: readonly Hit[], allow = ALLOW_SETTINGS): string[] {
  const out: string[] = [];
  for (const h of hits) {
    if (isSaveModule(h.file)) continue;
    const a = allow[h.file];
    if (!a || a.name !== h.name) out.push(`${h.file}:${h.line} ${h.name} — поза модулем збереження`);
  }
  for (const [file, a] of Object.entries(allow)) {
    const got = hits.filter((h) => h.file === file && h.name === a.name).length;
    if (got !== a.count) out.push(`${file} ${a.name}: у винятку ${a.count}, у коді ${got}`);
  }
  return out;
}

const importVerdict = (hits: readonly Hit[]): string[] => hits.filter((h) => !isSaveModule(h.file)).map((h) => `${h.file}:${h.line} імпортує ${h.name} напряму — лише через save-backend`);

describe('збереження — один модуль (GAME-103, OD-015 п.4)', () => {
  const files = [...SOURCES.keys()];
  const hits = files.flatMap((f) => storageHits(f, SOURCES.get(f) ?? ''));
  const imports = files.flatMap((f) => implementationImports(f, SOURCES.get(f) ?? ''));

  it('сканування не порожнє, модуль визначено явно', () => {
    expect(files.length).toBeGreaterThan(30);
    for (const f of ['src/main.ts', 'src/ui/Shell.tsx', 'src/platform/settings.ts', 'src/platform/save-store.ts', 'src/platform/save-backend.ts', 'src/platform/save-memory.ts', 'src/platform/save-session.ts', 'src/platform/save-code.ts']) expect(files).toContain(f);
    expect(files.filter(isSaveModule).sort()).toEqual(['src/platform/save-backend.ts', 'src/platform/save-code.ts', 'src/platform/save-memory.ts', 'src/platform/save-session.ts', 'src/platform/save-store.ts']);
    expect(files.filter((f) => /\.test\./.test(f))).toEqual([]);
  });

  it('indexedDB / localStorage / sessionStorage: 0 знахідок поза модулем і винятком; виняток збігається з кодом', () => {
    expect(verdict(hits)).toEqual([]);
  });

  it('IndexedDB справді в модулі (сторож бачить те, що стереже) і лише там', () => {
    expect(hits.filter((h) => h.name === 'indexedDB').map((h) => h.file)).toEqual(['src/platform/save-store.ts']);
  });

  it('виняток settings.ts має причину і не торкається сейву', () => {
    for (const a of Object.values(ALLOW_SETTINGS)) expect(a.why.length).toBeGreaterThan(20);
    const text = SOURCES.get('src/platform/settings.ts') ?? '';
    expect(text).toContain("'camplife.settings.v1'");
    expect(text).not.toMatch(/camplife-save|save-store|save-backend|SAVE_FORMAT/);
  });

  it('поза модулем ніхто не імпортує save-store / save-memory напряму', () => {
    expect(importVerdict(imports)).toEqual([]);
    expect(imports.some((h) => h.file === 'src/platform/save-backend.ts' && /save-store$/.test(h.name))).toBe(true); // сторож бачить імпорти
  });

  // Негативні контролі: кожна форма мусить почервоніти в UI.
  const INJECTED: [form: string, code: string][] = [
    ['localStorage.setItem', "export const f = (j: string): void => { localStorage.setItem('save', j); };\n"],
    ['window.localStorage', "export const f = (j: string): void => window.localStorage.setItem('save', j);\n"],
    ['globalThis.sessionStorage', "export const f = (j: string): void => globalThis.sessionStorage.setItem('save', j);\n"],
    ["globalThis['localStorage']", "export const f = (): unknown => globalThis['localStorage'];\n"],
    ['indexedDB.open', "export const f = (): unknown => indexedDB.open('camplife', 1);\n"],
    ['self.indexedDB', "export const f = (): unknown => self.indexedDB;\n"],
  ];
  for (const [form, code] of INJECTED) {
    it(`негативний контроль: ${form} у src/ui червоніє`, () => {
      expect(verdict([...hits, ...storageHits('src/ui/Probe.tsx', code)]).some((x) => x.startsWith('src/ui/Probe.tsx:'))).toBe(true);
    });
  }

  it('негативний контроль: прямий localStorage.setItem у справжньому Shell.tsx — червоніє', () => {
    const shell = SOURCES.get('src/ui/Shell.tsx') ?? '';
    const more = storageHits('src/ui/Shell.tsx', `${shell}\nexport const leak = (j: string): void => { localStorage.setItem('save', j); };\n`);
    expect(verdict([...hits, ...more])).toEqual([expect.stringMatching(/^src\/ui\/Shell\.tsx:\d+ localStorage — поза модулем збереження$/)]);
  });

  it('негативний контроль: другий localStorage у settings.ts — понад виняток, червоніє; застарілий виняток — теж', () => {
    const text = SOURCES.get('src/platform/settings.ts') ?? '';
    const more = storageHits('src/platform/settings.ts', `${text}\nexport const x = localStorage;\n`);
    expect(verdict([...hits.filter((h) => h.file !== 'src/platform/settings.ts'), ...more])).toEqual(['src/platform/settings.ts localStorage: у винятку 1, у коді 2']);
    expect(verdict(hits.filter((h) => h.file !== 'src/platform/settings.ts'))).toEqual(['src/platform/settings.ts localStorage: у винятку 1, у коді 0']);
  });

  it('негативний контроль: прямий імпорт save-store з UI червоніє (і динамічний теж)', () => {
    expect(importVerdict(implementationImports('src/ui/Probe.tsx', "import { writeSave } from '../platform/save-store';\nexport const f = writeSave;\n"))).toHaveLength(1);
    expect(importVerdict(implementationImports('src/ui/Probe.tsx', "export const f = () => import('../platform/save-memory');\n"))).toHaveLength(1);
    expect(importVerdict(implementationImports('src/ui/Probe.tsx', "export { writeSave } from '../platform/save-store';\n"))).toHaveLength(1);
  });

  it('позитивний контроль: коментар, рядок, тип Storage і ключ об\'єкта — не знахідки; файл модуля дозволений', () => {
    const ok = "// localStorage тут не вживається\nexport const label = 'indexedDB';\nexport type S = Pick<Storage, 'getItem'>;\nexport const o = { localStorage: 1 };\n";
    expect(storageHits('src/ui/Ok.tsx', ok)).toEqual([]);
    expect(verdict([...hits, ...storageHits('src/platform/save-future.ts', "export const f = (): unknown => indexedDB;\n")])).toEqual([]);
  });

  it(`файлів у скануванні: ${files.length}; знахідок: ${hits.length}`, () => {
    expect(hits.map((h) => `${h.file}|${h.name}`)).toEqual(['src/platform/save-store.ts|indexedDB', 'src/platform/settings.ts|localStorage']);
  });
});
