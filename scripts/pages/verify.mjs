#!/usr/bin/env node
// GAME-15 · перевірка опублікованої збірки: сторінка відповідає 200, а збірка на ній несе ПОВНИЙ SHA
// очікуваного коміту (той, що підставляє рядок версії в меню). Повтори — CDN Pages оновлюється не миттєво.
//   node scripts/pages/verify.mjs --url https://…/camptribe-game/ --sha <40 hex> [--tries 10] [--wait-ms 15000]
import { cli } from '../lib/cli.mjs';

const args = cli({ options: ['url', 'sha', 'tries', 'wait-ms'] });
const url = args.url;
const sha = args.sha ?? '';
if (!url || !/^[0-9a-f]{40}$/.test(sha)) { console.log('::error::PAGES VERIFY: потрібні --url і --sha (повні 40 hex)'); process.exit(2); }
const tries = Number(args.tries ?? 10);
const waitMs = Number(args['wait-ms'] ?? 15000);

async function once() {
  const page = await fetch(url, { cache: 'no-store' });
  if (page.status !== 200) return `сторінка ${url} → HTTP ${page.status}`;
  const html = await page.text();
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => new URL(m[1], url).href);
  if (scripts.length === 0) return 'на сторінці немає жодного <script src> — це не збірка гри';
  for (const s of scripts) {
    const r = await fetch(s, { cache: 'no-store' });
    if (r.status !== 200) return `скрипт ${s} → HTTP ${r.status}`;
    if ((await r.text()).includes(sha)) return null;
  }
  return `жоден зі скриптів (${scripts.length}) не містить SHA ${sha} — опубліковано іншу збірку`;
}

let last = '';
for (let i = 1; i <= tries; i++) {
  try { last = (await once()) ?? ''; } catch (e) { last = `мережа: ${String(e)}`; }
  if (!last) { console.log(`PAGES VERIFY: OK · ${url} → 200, збірка містить ${sha} (спроба ${i})`); process.exit(0); }
  console.log(`спроба ${i}/${tries}: ${last}`);
  if (i < tries) await new Promise((r) => setTimeout(r, waitMs));
}
console.log(`::error::PAGES VERIFY: FAILED · ${last}`);
process.exit(1);
