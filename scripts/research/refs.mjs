// GAME-197 (OD-024): справжні референси перед малюванням — вільні фото з Wikimedia Commons.
// Мережа сесії закрита, тому запускає runner (research-fetch.yml, рядок `refs-<тема>\trefs:<запит>|<запит>…`).
// Комітимо лише мініатюри (≤ 640 px) з вільною ліцензією і з автором у CREDITS.txt; невільне — пропускаємо.
// Запуск: node scripts/research/refs.mjs <тека> "<запит>|<запит>" [мінімум]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'CampTribeGame-research/1.0 (https://github.com/camp-tribe-eu/camptribe-game)';

/** Вільна ліцензія, яку можна покласти в публічний репозиторій із титрами. Усе інше (і невідоме) — ні. */
export function freeLicense(short) {
  const s = String(short ?? '').trim().toLowerCase();
  return s === 'cc0' || s === 'public domain' || s.startsWith('pd') || /^cc[ -]by(-sa)?([ -]\d(\.\d)?)?$/.test(s);
}

/** Справжнє фото (JPEG/PNG), а не документ чи скан. */
export const photo = (title, mime) => /^image\/(jpeg|png)$/.test(String(mime ?? '')) && !/\.(pdf|djvu?|tiff?|svg)$/i.test(String(title ?? ''));

const strip = (html) => String(html ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/** Відповідь API Commons → картки з мініатюрою, автором і ліцензією; лише вільні. */
export function pick(json) {
  const pages = Object.values(json?.query?.pages ?? {});
  return pages.flatMap((p) => {
    const ii = p.imageinfo?.[0];
    const m = ii?.extmetadata ?? {};
    const license = strip(m.LicenseShortName?.value);
    // Лише фото: пошук Commons повертає й PDF/DjVu (скани книжок пройшли як «фото» — прогін 31.10, закон 1).
    if (!ii?.thumburl || !freeLicense(license) || !photo(p.title, ii.mime)) return [];
    return [{ title: p.title, thumb: ii.thumburl, page: ii.descriptionurl, license, author: strip(m.Artist?.value) || 'unknown' }];
  });
}

export const creditLine = (i, file) => `${file}\t${i.title}\t${i.author}\t${i.license}\t${i.page}`;

async function search(q) {
  const u = new URL(API);
  Object.entries({ action: 'query', format: 'json', generator: 'search', gsrsearch: `${q} filetype:bitmap`, gsrnamespace: '6', gsrlimit: '40',
    prop: 'imageinfo', iiprop: 'url|mime|extmetadata', iiurlwidth: '640', iiextmetadatafilter: 'LicenseShortName|Artist' })
    .forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`Commons API HTTP ${r.status}`);
  return pick(await r.json());
}

async function main() {
  const [dir, queries, minArg] = process.argv.slice(2);
  const min = Number(minArg ?? 10);
  if (!dir || !queries) throw new Error('використання: refs.mjs <тека> "<запит>|<запит>" [мінімум]');
  const seen = new Set();
  const items = [];
  for (const q of queries.split('|').map((s) => s.trim()).filter(Boolean)) {
    for (const i of await search(q)) if (!seen.has(i.title) && items.length < 20) { seen.add(i.title); items.push(i); }
  }
  mkdirSync(dir, { recursive: true });
  const lines = ['file\ttitle\tauthor\tlicense\tsource'];
  for (const [n, i] of items.entries()) {
    const ext = (i.thumb.match(/\.(jpe?g|png|webp)(?:$|\?)/i)?.[1] ?? 'jpg').toLowerCase();
    const file = `ref${String(n).padStart(2, '0')}.${ext}`;
    const r = await fetch(i.thumb, { headers: { 'User-Agent': UA } });
    if (!r.ok) { console.log(`skip ${i.title}: HTTP ${r.status}`); continue; }
    writeFileSync(join(dir, file), Buffer.from(await r.arrayBuffer()));
    lines.push(creditLine(i, file));
  }
  writeFileSync(join(dir, 'CREDITS.txt'), `${lines.join('\n')}\n`);
  const got = lines.length - 1;
  console.log(`${dir}: ${got} вільних фото`);
  // Менше за мінімум — збій, а не «нічого не знайшли» (закон 4; власник: одне фото може бути хибним).
  if (got < min) throw new Error(`лише ${got} вільних фото (< ${min}) — розшир запит`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((e) => { console.error(`::error::${e.message}`); process.exit(1); });
}
