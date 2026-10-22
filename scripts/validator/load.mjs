// Завантажувач контенту з теки. Повертає { status, content, issues }.
// status: 'OK' (завантажено), 'ISSUES' (є помилки завантаження), 'NOT_RUN' (теки немає і це явно дозволено).
// 🔴 NOT_RUN — окремий стан, не 'OK': відсутній контент не сміє виглядати як перевірений.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { COLLECTIONS } from './schema.mjs';

const KNOWN = new Set(['meta.json', ...COLLECTIONS.map((c) => `${c}.json`)]);
const I = (code, where, msg) => ({ code, where, msg });

export function loadContent(dir, { allowMissing = false } = {}) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    if (allowMissing) return { status: 'NOT_RUN', content: null, issues: [] };
    return { status: 'ISSUES', content: null, issues: [I('CONTENT_MISSING', dir, 'теки контенту немає')] };
  }
  const issues = [];
  const content = {};
  const read = (path, where) => {
    try { return JSON.parse(readFileSync(path, 'utf8')); }
    catch (e) { issues.push(I('CONTENT_PARSE', where, e.message)); return undefined; }
  };
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== 'locales' && name !== 'dialogue') issues.push(I('CONTENT_UNKNOWN_FILE', name, 'невідома тека в content/'));
      continue;
    }
    if (!name.endsWith('.json')) continue;
    if (!KNOWN.has(name)) { issues.push(I('CONTENT_UNKNOWN_FILE', name, `невідомий файл; очікуються: ${[...KNOWN].join(', ')}`)); continue; }
    const v = read(p, name);
    if (v !== undefined) content[name.slice(0, -5)] = v;
  }
  const locDir = join(dir, 'locales');
  if (existsSync(locDir)) {
    content.locales = {};
    for (const name of readdirSync(locDir).sort()) {
      if (!name.endsWith('.json')) { issues.push(I('CONTENT_UNKNOWN_FILE', `locales/${name}`, 'у locales/ очікуються лише <мова>.json')); continue; }
      const v = read(join(locDir, name), `locales/${name}`);
      if (v !== undefined) content.locales[name.slice(0, -5)] = v;
    }
  }
  // content/dialogue/<назва>.json — по одному діалогу на файл (GAME-28).
  const dlgDir = join(dir, 'dialogue');
  if (existsSync(dlgDir)) {
    content.dialogues = [];
    for (const name of readdirSync(dlgDir).sort()) {
      if (!name.endsWith('.json') || statSync(join(dlgDir, name)).isDirectory()) { issues.push(I('CONTENT_UNKNOWN_FILE', `dialogue/${name}`, 'у dialogue/ очікуються лише <назва>.json')); continue; }
      const v = read(join(dlgDir, name), `dialogue/${name}`);
      if (v !== undefined) content.dialogues.push(v);
    }
  }
  if (!issues.some((i) => i.code === 'CONTENT_PARSE') && (!Array.isArray(content.quests) || content.quests.length === 0)) {
    issues.push(I('CONTENT_EMPTY', 'quests.json', 'немає жодного квесту — перевіряти нічого, і це не «зелено»'));
  }
  return { status: issues.length ? 'ISSUES' : 'OK', content, issues };
}
