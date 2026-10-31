#!/usr/bin/env node
// Сторож наративної біблії (GAME-70).
//   node scripts/bible/check-bible.mjs              перевірити docs/NARRATIVE_BIBLE.md проти content/
//   node scripts/bible/check-bible.mjs --self-test  зламані приклади: кожна перевірка мусить почервоніти
//   node scripts/bible/check-bible.mjs --mutate     підмінити content/ порожнім — сторож мусить почервоніти
// Що доводить: 5 правил тону з прикладами; родина; ≥ 6 NPC з усіма полями; звірка npcId/locId з
// content/ в обидва боки; дубль імені чи біографії; довідник фраз героїв 4–15 слів, без докору,
// без повторів. Чого НЕ доводить: «жодного рядка GDD дослівно» — це ручна звірка людини в PR
// (є лише дешевий поплавок: імена Alex/Mira/Leo з GDD, замінені OD-011).
// Закон 4: порожня біблія чи порожній розбір — червоне, а не «нічого не знайшов».
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cli } from '../lib/cli.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const MIN_WORDS = 4;
export const MAX_WORDS = 15;
export const MIN_NPC = 6;
export const MIN_PHRASES = 6;
export const HEROES = ['George', 'Victoria', 'Matthew'];
const IN = 'у контенті';
const OUT = 'ще не в контенті';
const NPC_FIELDS = ['npcId', "ім'я", 'вік', 'біографія', 'ціль', 'слабкість', 'розклад', 'статус'];

export const CODES = [
  'BIBLE_MISSING', 'BIBLE_SECTION_MISSING', 'BIBLE_TONE_RULES', 'BIBLE_FAMILY_MISSING', 'BIBLE_NPC_FEW',
  'BIBLE_NPC_FIELD', 'BIBLE_ID_FORMAT', 'BIBLE_ID_DUP', 'BIBLE_ID_NOT_IN_CONTENT', 'BIBLE_ID_STALE_MARK',
  'BIBLE_CONTENT_UNLISTED', 'BIBLE_NAME_MISMATCH', 'BIBLE_NAME_DUP', 'BIBLE_BIO_DUP',
  'BIBLE_PHRASE_LENGTH', 'BIBLE_PHRASE_DUP', 'BIBLE_PHRASE_FEW', 'BIBLE_PHRASE_REPROACH',
  'BIBLE_PHRASE_FORBIDDEN', 'BIBLE_GDD_NAME',
];

const REPROACH = ['ти завжди', 'ти ніколи', 'знову ти', 'я ж казав', 'через тебе', 'ти винен', 'твоя вина', 'вічно ти'];
// Політика й релігія — рішення власника: їх у грі немає.
const FORBIDDEN = /(?<![\p{L}])(політи\p{L}*|партій\p{L}*|партія|президент\p{L}*|уряд\p{L}*|релігі\p{L}*|молитв\p{L}*|церк\p{L}*|боже|господи)(?![\p{L}])/iu;
// Імена прикладу з GDD, замінені рішенням OD-011: поява означає, що текст тягнули з джерела.
const GDD_NAMES = /(?<![\p{L}])(Alex|Mira|Leo|Алекс|Міра|Лео)(?![\p{L}])/u;

const cells = (line) => line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
export const wordCount = (s) => s.trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

function sections(text) {
  const out = {};
  for (const p of text.split(/^##\s+/m).slice(1)) {
    const nl = p.indexOf('\n');
    out[p.slice(0, nl).trim()] = p.slice(nl + 1);
  }
  return out;
}
const pick = (secs, re) => { const k = Object.keys(secs).find((h) => re.test(h)); return k === undefined ? null : secs[k]; };

function table(body) {
  const rows = body.split('\n').filter((l) => /^\s*\|/.test(l));
  if (rows.length < 2) return { head: [], rows: [] };
  const head = cells(rows[0]);
  return { head, rows: rows.slice(2).map((r) => { const c = cells(r); return Object.fromEntries(head.map((h, i) => [h, c[i] ?? ''])); }) };
}

/** content: { npcs: [{id}], locations: [{id}], animals: [{id}], names: { 'npc.x': 'Ім’я' } } */
export function checkBible(text, content) {
  const issues = [];
  const bad = (code, where, msg) => issues.push({ code, where, msg });
  if (typeof text !== 'string' || !text.trim()) { bad('BIBLE_MISSING', 'docs/NARRATIVE_BIBLE.md', 'файл порожній або відсутній'); return issues; }
  const secs = sections(text);
  const tone = pick(secs, /Тон і голос/), family = pick(secs, /Родина/), npcs = pick(secs, /NPC зрізу/),
    locs = pick(secs, /Локації зрізу/), phrases = pick(secs, /Довідник фраз/);
  for (const [name, s] of [['Тон і голос', tone], ['Родина', family], ['NPC зрізу', npcs], ['Локації зрізу', locs], ['Довідник фраз', phrases]]) {
    if (s === null) bad('BIBLE_SECTION_MISSING', name, `немає розділу «## … ${name}»`);
  }

  // Тон: рівно 5 правил, кожне з «Так:» і «Не так:».
  if (tone !== null) {
    const blocks = tone.split(/^\d+\.\s+/m).slice(1);
    if (blocks.length !== 5) bad('BIBLE_TONE_RULES', 'Тон і голос', `правил ${blocks.length}, мусить бути 5`);
    blocks.forEach((b, i) => {
      if (!/^\s*\*\s*Так:\s*«[^»]{3,}»/m.test(b) || !/^\s*\*\s*Не так:\s*«[^»]{3,}»/m.test(b)) bad('BIBLE_TONE_RULES', `правило ${i + 1}`, 'бракує прикладу «Так: «…»» чи «Не так: «…»»');
    });
  }

  // Родина й NPC: однакова таблиця.
  const people = [];
  for (const [label, body] of [['Родина', family], ['NPC зрізу', npcs]]) {
    if (body === null) continue;
    const t = table(body);
    const missingCols = NPC_FIELDS.slice(1).filter((f) => !t.head.includes(f));
    if (!(t.head[0] ?? '').toLowerCase().endsWith('id')) missingCols.unshift('id');
    if (missingCols.length) { bad('BIBLE_NPC_FIELD', label, `у таблиці немає колонок: ${missingCols.join(', ')}`); continue; }
    const idCol = t.head[0];
    for (const r of t.rows) {
      const id = r[idCol];
      for (const f of NPC_FIELDS.slice(1)) if (!r[f]) bad('BIBLE_NPC_FIELD', `${label} ${id || '?'}`, `порожнє поле «${f}»`);
      if (!/^(npc|animal)\.[a-z0-9.-]+$/.test(id)) bad('BIBLE_ID_FORMAT', `${label} ${id}`, 'id не за шаблоном npc.* / animal.*');
      if (r['вік'] && !/^\d{1,3}$/.test(r['вік'])) bad('BIBLE_NPC_FIELD', `${label} ${id}`, `вік не число: «${r['вік']}»`);
      people.push({ id, name: r["ім'я"], bio: r['біографія'], status: r['статус'], section: label });
    }
  }
  if (family !== null && !['npc.george', 'npc.victoria', 'npc.matthew', 'animal.cat'].every((id) => people.some((p) => p.id === id && p.section === 'Родина'))) {
    bad('BIBLE_FAMILY_MISSING', 'Родина', 'родина OD-011: George, Victoria, Matthew, кішка Mia — когось бракує');
  }
  if (npcs !== null && people.filter((p) => p.section === 'NPC зрізу').length < MIN_NPC) bad('BIBLE_NPC_FEW', 'NPC зрізу', `NPC менше ${MIN_NPC}`);

  // Звірка з content/ в обидва боки.
  const contentIds = new Set([...content.npcs, ...content.animals].map((x) => x.id));
  const seen = new Set();
  const reconcile = (items, ids, where) => {
    for (const p of items) {
      if (seen.has(`${where}:${p.id}`)) bad('BIBLE_ID_DUP', p.id, 'id двічі');
      seen.add(`${where}:${p.id}`);
      const exists = ids.has(p.id);
      if (p.status !== IN && p.status !== OUT) bad('BIBLE_ID_NOT_IN_CONTENT', p.id, `статус «${p.status}» — лише «${IN}» чи «${OUT}»`);
      else if (p.status === IN && !exists) bad('BIBLE_ID_NOT_IN_CONTENT', p.id, 'біблія каже «у контенті», а в content/ такого id немає');
      else if (p.status === OUT && exists) bad('BIBLE_ID_STALE_MARK', p.id, 'уже є в content/ — зміни статус на «у контенті»');
    }
  };
  reconcile(people, contentIds, 'npc');
  const locRows = locs === null ? [] : table(locs).rows.map((r) => ({ id: r.locId ?? '', status: r['статус'] ?? '' }));
  reconcile(locRows, new Set(content.locations.map((x) => x.id)), 'loc');
  for (const n of content.npcs) if (!people.some((p) => p.id === n.id)) bad('BIBLE_CONTENT_UNLISTED', n.id, 'є в content/npcs.json, а в біблії немає');
  if (locs !== null) for (const l of content.locations) if (!locRows.some((p) => p.id === l.id)) bad('BIBLE_CONTENT_UNLISTED', l.id, 'є в content/locations.json, а в біблії немає');
  for (const p of people) {
    const real = content.names[p.id];
    if (real && real !== p.name) bad('BIBLE_NAME_MISMATCH', p.id, `у біблії «${p.name}», у content/locales «${real}»`);
  }

  // Унікальність: ім'я й біографія (правило власника: кожен NPC унікальний).
  const byName = new Map();
  const words = (s) => new Set(norm(s).split(' ').filter((w) => w.length > 3));
  for (const p of people) {
    const k = norm(p.name);
    if (byName.has(k)) bad('BIBLE_NAME_DUP', p.id, `ім'я «${p.name}» уже в ${byName.get(k)}`);
    else byName.set(k, p.id);
  }
  for (let i = 0; i < people.length; i++) for (let j = i + 1; j < people.length; j++) {
    const a = words(people[i].bio), b = words(people[j].bio);
    const inter = [...a].filter((w) => b.has(w)).length, union = new Set([...a, ...b]).size || 1;
    if (norm(people[i].bio) === norm(people[j].bio) || inter / union >= 0.7) bad('BIBLE_BIO_DUP', `${people[i].id} ~ ${people[j].id}`, 'біографії збігаються');
  }

  // Довідник фраз.
  if (phrases !== null) {
    const parts = phrases.split(/^###\s+/m).slice(1);
    const all = new Map();
    for (const hero of HEROES) {
      const part = parts.find((p) => p.split('\n')[0].trim() === hero);
      const lines = part ? [...part.matchAll(/^\s*\*\s*«([^»]*)»/gm)].map((m) => m[1]) : [];
      if (lines.length < MIN_PHRASES) bad('BIBLE_PHRASE_FEW', hero, `фраз ${lines.length}, мінімум ${MIN_PHRASES}`);
      for (const ph of lines) {
        const n = wordCount(ph);
        if (n < MIN_WORDS || n > MAX_WORDS) bad('BIBLE_PHRASE_LENGTH', `${hero}: «${ph}»`, `${n} слів, треба ${MIN_WORDS}–${MAX_WORDS}`);
        const k = norm(ph);
        if (all.has(k)) bad('BIBLE_PHRASE_DUP', `${hero}: «${ph}»`, `уже є в ${all.get(k)}`);
        else all.set(k, hero);
        if (REPROACH.some((r) => k.includes(r))) bad('BIBLE_PHRASE_REPROACH', `${hero}: «${ph}»`, 'докір на адресу людини');
        if (FORBIDDEN.test(ph)) bad('BIBLE_PHRASE_FORBIDDEN', `${hero}: «${ph}»`, 'політика чи релігія');
      }
    }
  }
  // Приклади «Так:» теж живий голос: без докору й заборонених тем.
  if (tone !== null) for (const m of tone.matchAll(/^\s*\*\s*Так:\s*(.*)$/gm)) {
    if (REPROACH.some((r) => norm(m[1]).includes(r))) bad('BIBLE_PHRASE_REPROACH', `тон: ${m[1]}`, 'докір у прикладі «Так»');
    if (FORBIDDEN.test(m[1])) bad('BIBLE_PHRASE_FORBIDDEN', `тон: ${m[1]}`, 'політика чи релігія в прикладі «Так»');
  }
  const gdd = text.match(GDD_NAMES);
  if (gdd) bad('BIBLE_GDD_NAME', gdd[0], "ім'я прикладу з GDD (замінене OD-011): текст міг піти з приватного джерела");
  return issues;
}

export function loadContent(dir = join(ROOT, 'content')) {
  const j = (f) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const uk = j('locales/uk.json');
  const npcs = j('npcs.json');
  return { npcs, locations: j('locations.json'), animals: j('animals.json'), names: Object.fromEntries(npcs.map((n) => [n.id, uk[n.nameKey]])) };
}

// ---------- зламані приклади (самотест) ----------

const must = (text, from, to) => { if (!text.includes(from)) throw new Error(`мутація не застосувалась: немає «${from}»`); return text.replace(from, to); };
const ELISE = '| npc.elise | Еліза | 55 |';
const ELISE_END = 'ввечері біля вогнища | у контенті |';
const CASES = [
  ['фраза 3 слова → BIBLE_PHRASE_LENGTH', (t) => must(t, '«Мінус один пункт у моєму списку.»', '«Мінус один пункт.»'), 'BIBLE_PHRASE_LENGTH'],
  ['фраза 16 слів → BIBLE_PHRASE_LENGTH', (t) => must(t, '«Дощ запізнився. Цього разу не ми.»', '«Дощ запізнився, і цього разу, мабуть, не ми, а хтось інший, правда ж, друзі мої, чесно кажучи.»'), 'BIBLE_PHRASE_LENGTH'],
  ['дубль фрази між героями → BIBLE_PHRASE_DUP', (t) => must(t, '«Ось це вже схоже на відпочинок.»', '«Мінус один пункт у моєму списку.»'), 'BIBLE_PHRASE_DUP'],
  ['докір у фразі → BIBLE_PHRASE_REPROACH', (t) => must(t, '«Вечеря готова, а речі вже сохнуть.»', '«Знову ти забув дістати спальник.»'), 'BIBLE_PHRASE_REPROACH'],
  ['політика у фразі → BIBLE_PHRASE_FORBIDDEN', (t) => must(t, '«Ось це вже схоже на відпочинок.»', '«Ось це вже схоже на політику, друже.»'), 'BIBLE_PHRASE_FORBIDDEN'],
  ['бракує фраз героя → BIBLE_PHRASE_FEW', (t) => must(t, '* «Базового набору на одну ніч цілком вистачить.»\n', ''), 'BIBLE_PHRASE_FEW'],
  ['npcId, якого немає в content/ → BIBLE_ID_NOT_IN_CONTENT', (t) => must(t, ELISE, '| npc.elisa | Еліза | 55 |'), 'BIBLE_ID_NOT_IN_CONTENT'],
  ['«ще не в контенті», а в content/ уже є → BIBLE_ID_STALE_MARK', (t) => must(t, ELISE_END, 'ввечері біля вогнища | ще не в контенті |'), 'BIBLE_ID_STALE_MARK'],
  ['NPC із content/ немає в біблії → BIBLE_CONTENT_UNLISTED', (t) => must(must(t, ELISE, '| npc.elisa | Еліза | 55 |'), ELISE_END, 'ввечері біля вогнища | ще не в контенті |'), 'BIBLE_CONTENT_UNLISTED'],
  ["ім'я не збігається з content/ → BIBLE_NAME_MISMATCH", (t) => must(t, ELISE, '| npc.elise | Елеонора | 55 |'), 'BIBLE_NAME_MISMATCH'],
  ['дубль імені NPC → BIBLE_NAME_DUP', (t) => must(t, '| npc.nora | Нора |', '| npc.nora | Люк |'), 'BIBLE_NAME_DUP'],
  ['дубль біографії NPC → BIBLE_BIO_DUP', (t) => must(t, 'велотуристка з одним велосипедом і жовтим наметом', 'веломеханік, що носить олівець за вухом'), 'BIBLE_BIO_DUP'],
  ['дубль id → BIBLE_ID_DUP', (t) => must(t, '| npc.nora | Нора |', '| npc.luc | Нора |'), 'BIBLE_ID_DUP'],
  ['порожня слабкість → BIBLE_NPC_FIELD', (t) => must(t, 'губить окуляри й не довіряє застосункам', ''), 'BIBLE_NPC_FIELD'],
  ['NPC менше шести → BIBLE_NPC_FEW', (t) => t.split('\n').filter((l) => !/^\| npc\.(amina|claire|cashier) /.test(l)).join('\n'), 'BIBLE_NPC_FEW'],
  ['немає Victoria в родині → BIBLE_FAMILY_MISSING', (t) => t.split('\n').filter((l) => !/^\| npc\.victoria /.test(l)).join('\n'), 'BIBLE_FAMILY_MISSING'],
  ['4 правила тону → BIBLE_TONE_RULES', (t) => must(t, '5. **Тільки люди', '* **Тільки люди'), 'BIBLE_TONE_RULES'],
  ['правило без «Не так» → BIBLE_TONE_RULES', (t) => must(t, '  * Не так: «Так.»', ''), 'BIBLE_TONE_RULES'],
  ['немає розділу → BIBLE_SECTION_MISSING', (t) => must(t, '## 5. Довідник фраз', '## 5. Щось інше'), 'BIBLE_SECTION_MISSING'],
  ["ім'я з GDD → BIBLE_GDD_NAME", (t) => must(t, 'Біблія складена', 'Лео і Alex. Біблія складена'), 'BIBLE_GDD_NAME'],
  ['id не за шаблоном → BIBLE_ID_FORMAT', (t) => must(t, '| npc.luc |', '| npc.Luc |'), 'BIBLE_ID_FORMAT'],
  ['порожня біблія → BIBLE_MISSING', () => '', 'BIBLE_MISSING'],
];

export function selfTest(text, content) {
  const lines = []; let failed = 0;
  const base = checkBible(text, content);
  if (base.length) failed++;
  lines.push(`${base.length ? 'FAIL' : 'PASS'} · справжня біблія чиста${base.length ? ': ' + base.map((i) => `${i.code} ${i.where}`).join('; ') : ''}`);
  for (const [name, mutate, code] of CASES) {
    let r;
    try { r = checkBible(mutate(text), content).map((i) => i.code); } catch (e) { r = [`ПОМИЛКА ПРИКЛАДУ ${e.message}`]; }
    const ok = r.includes(code);
    if (!ok) failed++;
    lines.push(`${ok ? 'PASS' : 'FAIL'} · ${name}${ok ? '' : ` (отримано: ${r.join(', ') || 'зелене'})`}`);
  }
  const covered = new Set(CASES.map((c) => c[2]));
  const uncovered = CODES.filter((c) => !covered.has(c));
  if (uncovered.length) { failed++; lines.push(`FAIL · коди без зламаного прикладу: ${uncovered.join(', ')}`); }
  return { ok: failed === 0, text: `${lines.join('\n')}\n${failed ? 'SELF-TEST FAIL' : 'SELF-TEST PASS'} · прикладів ${CASES.length}` };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = cli({ flags: ['self-test', 'mutate'] });
  let text = '';
  try { text = readFileSync(join(ROOT, 'docs', 'NARRATIVE_BIBLE.md'), 'utf8'); } catch { /* BIBLE_MISSING нижче */ }
  const content = loadContent();
  if (args['self-test']) { const r = selfTest(text, content); console.log(r.text); process.exit(r.ok ? 0 : 1); }
  if (args.mutate) {
    // Мутація сторожа: звірку з content/ підмінено порожнім контентом — сторож мусить почервоніти.
    const empty = { npcs: [], locations: [], animals: [], names: {} };
    const blind = checkBible(text, empty);
    if (blind.length === 0 || selfTest(text, empty).ok) { console.log('::error::MUTATION SURVIVED · content/ підмінено порожнім, а сторож зелений — він сліпий'); process.exit(1); }
    console.log('MUTATION KILLED · порожній content/ → біблія червона, самотест червоний, як і має бути');
    process.exit(0);
  }
  const issues = checkBible(text, content);
  for (const i of issues) console.log(`::error::${i.code} · ${i.where} · ${i.msg}`);
  if (issues.length) { console.log(`\nFAIL · проблем: ${issues.length}`); process.exit(1); }
  console.log(`PASS · біблія: тон 5, родина, NPC зрізу ≥ ${MIN_NPC}, довідник фраз ${MIN_WORDS}–${MAX_WORDS} слів, звірка з content/`);
}
