// GAME-119 · сторож назви гри. Рішення власника 24.10.2026: гра зветься CampTribe (було CampLife), і назва записана в коді
// РІВНО в одному місці — src/config/brand.ts (GAME_NAME). Рядковий скан (рядки й коментарі теж):
//   * код src/ (крім тестів) + index.html + spike.html: будь-яке «CampTribe»/«CampLife» (у будь-якому регістрі, з пробілом,
//     дефісом, крапкою чи без) поза brand.ts і поза ALLOW → червоне. Видиме гравцю бере назву з константи;
//   * тексти для гравця (src/i18n/*.json, content/**/*.json): «CampTribe» можна писати буквально, «CampLife» — червоне;
//   * ALLOW — ідентифікатори формату, які НЕ перейменовуються (зламали б сейви й налаштування). Рядок ALLOW, якого вже
//     немає у файлі, — червоне (застарілий виняток).
// Межі: тести (*.test.*) не скануються — вони законно містять ідентифікатори формату у фікстурах; назву, складену під час
// виконання ('Camp' + 'Life'), скан не бачить — це ловить рецензія. Як і save-boundary: vitest кешує import.meta.glob,
// новий файл-порушник локально видно після `npm run check` (він чистить кеш); CI стартує з чистого кешу.
import { describe, expect, it } from 'vitest';
import { GAME_NAME } from '../config/brand';

const glob = (raw: Record<string, string>, base: string): [string, string][] =>
  Object.entries(raw).map(([k, v]) => [k.replace(/^(\.\.\/)+/, base), v]);

const CODE_RAW = import.meta.glob<string>(['../**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}', '!../**/*.test.*', '!../**/*.d.ts'],
  { query: '?raw', import: 'default', eager: true });
const HTML_RAW = import.meta.glob<string>(['../../index.html', '../../spike.html'], { query: '?raw', import: 'default', eager: true });
const TEXT_RAW = import.meta.glob<string>(['../i18n/*.json', '../../content/**/*.json'], { query: '?raw', import: 'default', eager: true });

const CODE: ReadonlyMap<string, string> = new Map([...glob(CODE_RAW, 'src/'), ...glob(HTML_RAW, '')]);
const TEXTS: ReadonlyMap<string, string> = new Map(Object.entries(TEXT_RAW).map(([k, v]) => [k.startsWith('../../') ? k.slice(6) : k.replace(/^\.\.\//, 'src/'), v]));

const BRAND_FILE = 'src/config/brand.ts';
/** Будь-яке написання назви: CampTribe, camptribe, Camp Tribe, camp-life, camplife.settings… */
const ANY_NAME = /camp[\s_.-]?(?:tribe|life)/gi;
const OLD_NAME = /camp[\s_.-]?life/gi;

interface Allow { readonly file: string; readonly literal: string; readonly why: string }
/** Ідентифікатори формату: лишаються «camplife», бо їх уже записано в браузерах гравців. */
export const ALLOW: readonly Allow[] = [
  { file: 'src/core/save.ts', literal: "'camplife-save'", why: 'SAVE_FORMAT — поле format у кожному сейві й коді відновлення; зміна → наявні сейви «чужі»' },
  { file: 'src/platform/save-store.ts', literal: "'camplife'", why: 'назва БД IndexedDB; зміна → гра не бачить наявного сейву' },
  { file: 'src/platform/settings.ts', literal: "'camplife.settings.v1'", why: 'ключ localStorage налаштувань; зміна → гравець втрачає масштаб тексту й мову' },
];

interface Finding { readonly file: string; readonly line: number; readonly text: string }

const lineOf = (text: string, index: number): number => text.slice(0, index).split('\n').length;

/** Порушення в коді та застарілі рядки ALLOW. Чиста функція — щоб мутації самотесту йшли тим самим шляхом, що й справжній скан. */
export function scan(code: ReadonlyMap<string, string>, texts: ReadonlyMap<string, string>, allow: readonly Allow[]): { violations: Finding[]; stale: Allow[] } {
  const violations: Finding[] = [];
  const stale: Allow[] = [];
  for (const a of allow) if (!(code.get(a.file) ?? '').includes(a.literal)) stale.push(a);
  for (const [file, raw] of code) {
    if (file === BRAND_FILE) continue;
    let text = raw;
    // Дозволений літерал замінюється пробілами тієї ж довжини: номери рядків решти знахідок не зсуваються.
    for (const a of allow) if (a.file === file) text = text.split(a.literal).join(' '.repeat(a.literal.length));
    for (const m of text.matchAll(ANY_NAME)) violations.push({ file, line: lineOf(text, m.index), text: m[0] });
  }
  for (const [file, text] of texts) {
    for (const m of text.matchAll(OLD_NAME)) violations.push({ file, line: lineOf(text, m.index), text: m[0] });
  }
  return { violations, stale };
}

const withFile = (src: ReadonlyMap<string, string>, file: string, text: string): Map<string, string> => new Map(src).set(file, text);

describe('сторож назви гри (GAME-119)', () => {
  it('назва — CampTribe, рішення власника 24.10.2026', () => {
    expect(GAME_NAME).toBe('CampTribe');
  });

  it('скан бачить код, html і тексти (порожній скан — збій, закон 4)', () => {
    expect(CODE.has(BRAND_FILE)).toBe(true);
    expect(CODE.has('src/ui/Shell.tsx')).toBe(true);
    expect(CODE.has('index.html')).toBe(true);
    expect(CODE.has('spike.html')).toBe(true);
    expect(TEXTS.has('src/i18n/uk.json')).toBe(true);
    expect(TEXTS.has('content/locales/uk.json')).toBe(true);
    expect(CODE.get('index.html')).toContain('<title>%GAME_NAME%</title>');
  });

  it('у коді назва лише в brand.ts; «CampLife» у текстах немає; ALLOW не застарів', () => {
    const { violations, stale } = scan(CODE, TEXTS, ALLOW);
    expect(violations).toEqual([]);
    expect(stale).toEqual([]);
  });

  describe('мутації (кожна мусить почервоніти)', () => {
    it('«CampTribe» прямо в компоненті UI → червоне', () => {
      const shell = CODE.get('src/ui/Shell.tsx') ?? '';
      const { violations } = scan(withFile(CODE, 'src/ui/Shell.tsx', `${shell}\nexport const TITLE = 'CampTribe';\n`), TEXTS, ALLOW);
      expect(violations.map((v) => v.file)).toEqual(['src/ui/Shell.tsx']);
    });

    it('стара назва в <title> index.html → червоне', () => {
      const html = (CODE.get('index.html') ?? '').replace('%GAME_NAME%', 'CampLife');
      expect(scan(withFile(CODE, 'index.html', html), TEXTS, ALLOW).violations.map((v) => v.file)).toEqual(['index.html']);
    });

    it('«CampLife» у src/i18n/uk.json → червоне; «CampTribe» там — дозволено', () => {
      const uk = TEXTS.get('src/i18n/uk.json') ?? '';
      expect(scan(CODE, withFile(TEXTS, 'src/i18n/uk.json', uk.replace('{', '{\n  "x.title": "CampLife",')), ALLOW).violations).toHaveLength(1);
      expect(scan(CODE, withFile(TEXTS, 'src/i18n/uk.json', uk.replace('{', '{\n  "x.title": "CampTribe",')), ALLOW).violations).toEqual([]);
    });

    it('прибрати рядок з ALLOW → червоне (ідентифікатор формату без причини)', () => {
      for (const drop of ALLOW) {
        const { violations } = scan(CODE, TEXTS, ALLOW.filter((a) => a !== drop));
        expect(violations.map((v) => v.file)).toEqual([drop.file]);
      }
    });

    it('застарілий рядок ALLOW (ідентифікатора у файлі вже немає) → червоне', () => {
      const [first] = ALLOW;
      if (!first) throw new Error('ALLOW порожній');
      const code = withFile(CODE, first.file, (CODE.get(first.file) ?? '').split(first.literal).join("'renamed'"));
      expect(scan(code, TEXTS, ALLOW).stale).toEqual([first]);
    });
  });
});
