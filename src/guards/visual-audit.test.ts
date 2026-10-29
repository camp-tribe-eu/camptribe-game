// GAME-99 · сторож research/visual-audit.md: 3 пари «наша сцена / зразок» (наш знімок існує на диску, зразок — посилання чи позначка
// «додає власник», чужих знімків у теці немає) і таблиця ефектів із повними клітинками (години, байти, fps, виграш, ризик).
// Мутації (див. сам файл): прибрати пару → червоне; порожня клітинка таблиці → червоне; чужий знімок у теці → червоне.
import { describe, expect, it } from 'vitest';

const MD = Object.values(import.meta.glob<string>('../../research/visual-audit.md', { query: '?raw', import: 'default', eager: true }))[0] ?? '';
const FILES = Object.keys(import.meta.glob('../../research/visual-audit/*', { query: '?url', import: 'default' })).map((k) => k.split('/').pop() ?? '');

/** Секції `### Пара N …` → їхній текст. */
export const pairs = (md: string): string[] => md.split(/^### /m).filter((s) => /^Пара \d/.test(s));
/** Рядки таблиці ефектів: `| № | Ефект | Години | Байти | fps | Виграш | Ризик |` з номером у першій клітинці. */
export const effectRows = (md: string): string[][] => md.split('\n').filter((l) => /^\|\s*\d+\s*\|/.test(l)).map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
/** Знімки нашої сцени, названі в тексті. */
export const shotsIn = (s: string): string[] => [...s.matchAll(/research\/visual-audit\/([\w.-]+\.png)/g)].map((m) => m[1] ?? '');
export const OURS = /^((day|dusk|night|before-no-effect)-(portrait-390x844|landscape-844x390)|family-(idle|walking-to-spots)|camp-(spawn|pier|tents-south|reception|clearing)-(portrait|landscape)|mapfirst-(portrait|landscape)-(ring|backpack|backpack-down|bike)|talk-(elise|luc)-(portrait|landscape))\.png$/;   // GAME-173 родина; GAME-172 camp-* живий кемпінг; GAME-175 день 1 на мапі

describe('research/visual-audit.md (GAME-99)', () => {
  it('файл прочитано', () => { expect(MD.length).toBeGreaterThan(500); });

  it('рівно 3 пари, у кожній наш знімок існує, а зразок — посилання або «додає власник»', () => {
    const ps = pairs(MD);
    expect(ps).toHaveLength(3);
    for (const p of ps) {
      const shots = shotsIn(p);
      expect(shots.length, `у «${p.slice(0, 30)}» нема знімка нашої сцени`).toBeGreaterThan(0);
      for (const s of shots) expect(FILES, `знімка ${s} нема в research/visual-audit/`).toContain(s);
      expect(/https?:\/\/\S+/.test(p) || /додає власник/.test(p), `у «${p.slice(0, 30)}» нема зразка`).toBe(true);
    }
  });

  it('у теці знімків — лише наші (чужі знімки в репозиторій не кладуться)', () => {
    expect(FILES.length).toBeGreaterThanOrEqual(8);
    for (const f of FILES) expect(OURS.test(f), `${f}: чуже або непередбачене ім'я`).toBe(true);
  });

  it('таблиця ефектів: 8 кандидатів картки, кожна клітинка заповнена, у годин/байтів/fps є цифра чи «не мірялося»', () => {
    const rows = effectRows(MD);
    expect(rows).toHaveLength(8);
    for (const r of rows) {
      expect(r, `рядок «${r[1]}»: не 7 клітинок`).toHaveLength(7);
      for (const c of r) expect(c.length, `порожня клітинка в «${r[1]}»`).toBeGreaterThan(0);
      expect(/\d/.test(r[2] ?? ''), `«${r[1]}»: години без числа`).toBe(true);
      expect(/\d|Б|—/.test(r[3] ?? ''), `«${r[1]}»: байти без числа`).toBe(true);
      expect(/\d|не мірялося|—/.test(r[4] ?? ''), `«${r[1]}»: fps без числа`).toBe(true);
    }
  });

  it('ефект 1 має вагу збірки до/після і fps до/після', () => {
    expect(MD).toMatch(/до — разом \d[\d\s]+ Б.*після — разом \d[\d\s]+ Б/);
    expect(MD).toMatch(/Приріст \+[\d\s]+ Б/);
    expect(MD).toMatch(/\| До \| Після \|/);
  });

  it('негативні контролі сторожа: уміє впізнати зламаний файл', () => {
    expect(pairs(MD.replace(/^### Пара 2/m, '### Розділ 2'))).toHaveLength(2);
    expect(effectRows(MD.replace(/^(\| 3 \| [^|]*\|)[^|]*\|/m, '$1  |'))[2]?.[2]).toBe('');
    expect(OURS.test('stardew-night.png')).toBe(false);
    expect(shotsIn('research/visual-audit/nope.png')[0]).toBe('nope.png');
  });
});
