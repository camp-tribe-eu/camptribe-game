#!/usr/bin/env node
// Сторож експорту кемпінгів від чату Сайту (GAME-53). Схема — schema.mjs.
//   node scripts/campsites/check-campsites.mjs              перевірити data/campsites/be-nl.json
//   --file <шлях>                                           інший файл
//   --self-test                                             кожен код має зламаний приклад
//   --mutate                                                вимкнути кожен код по черзі → самотест мусить почервоніти
//   --allow-missing                                         файлу ще немає → NOT RUN (код 0), а не PASS
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cli } from '../lib/cli.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const TODAY = '2026-10-23';

const site = (over = {}) => ({ id: 'cs.de-lier', name: 'Camping De Lier', country: 'NL', lat: 52.0, lon: 4.25, kind: 'campsite', tents: true, campers: true, pets: null, season: { from: '04-01', to: '10-31' }, checkedAt: '2026-10-01', ...over });
const base = (over = {}) => ({ format: 'camptribe-campsites', version: 1, exportedAt: '2026-10-20', source: 'camptribe.eu export', licence: { name: 'ODbL 1.0', url: 'https://opendatacommons.org/licenses/odbl/1-0/', attribution: '© OpenStreetMap contributors' }, campsites: [site(), site({ id: 'cs.ardennen', name: 'Ardennen', country: 'BE', lat: 50.3, lon: 5.8, season: null })], ...over });
// Канонічний вигляд — як вимагає сторож (CS_NOT_CANONICAL).
const J = (o) => `${JSON.stringify(o, null, 1)}\n`;
const without = (o, k) => Object.fromEntries(Object.entries(o).filter(([x]) => x !== k));
const withSite = (over) => base({ campsites: [site(over)] });
const withLicence = (over) => base({ licence: { ...base().licence, ...over } });

// Один зламаний приклад на КОЖНУ перевірку, а не на код: мутація кожного місця виклику окремо
// (рецензія GAME-53: «10/10» рахувало коди — дев'ять рядків можна було стерти при зеленому самотесті).
export const FIXTURES = [
  ['позитивний контроль: справжня форма', J(base()), []],
  ['позитивний контроль: 29 лютого в сезоні (високосний рік — дозволено)', J(withSite({ season: { from: '02-29', to: '10-31' } })), []],
  ['не JSON', '{"format": обрізано', ['CS_PARSE']],
  ['не канонічний вигляд (однорядковий JSON)', JSON.stringify(base()), ['CS_NOT_CANONICAL']],
  ['дубль ключа ховає персональні дані в сирому тексті', J(base()).replace('"name": "Camping De Lier"', '"name": "jan@x.nl +31 6 12345678",\n   "name": "Camping De Lier"'), ['CS_NOT_CANONICAL']],
  ['масив замість об’єкта', J([1]), ['CS_FORMAT']],
  ['чужий формат', J(base({ format: 'osm-dump' })), ['CS_FORMAT']],
  ['інша версія', J(base({ version: 2 })), ['CS_FORMAT']],
  ['зайве поле на верхньому рівні', J(base({ owners: [] })), ['CS_FIELD_UNKNOWN']],
  ['без source', J(without(base(), 'source')), ['CS_FIELD_MISSING']],
  ['source порожній', J(base({ source: ' ' })), ['CS_FIELD_TYPE']],
  ['source з контактом', J(base({ source: 'owner jan@x.nl' })), ['CS_PERSONAL_DATA']],
  ['exportedAt у майбутньому', J(base({ exportedAt: '2027-01-01' })), ['CS_DATE']],
  ['ліцензія рядком', J(base({ licence: 'ODbL' })), ['CS_FIELD_TYPE']],
  ['зайве поле в ліцензії', J(withLicence({ email: 'a' })), ['CS_FIELD_UNKNOWN']],
  ['ліцензія без url', J(base({ licence: without(base().licence, 'url') })), ['CS_FIELD_MISSING']],
  ['порожня атрибуція', J(withLicence({ attribution: '' })), ['CS_FIELD_TYPE']],
  ['атрибуція з телефоном', J(withLicence({ attribution: 'тел. +32 470 12 34 56' })), ['CS_PERSONAL_DATA']],
  ['campsites — не масив', J(base({ campsites: {} })), ['CS_FIELD_TYPE']],
  ['порожній експорт', J(base({ campsites: [] })), ['CS_EMPTY']],
  ['кемпінг — рядок', J(base({ campsites: ['cs.x'] })), ['CS_FIELD_TYPE']],
  ['персональні дані — поле phone', J(withSite({ phone: '1' })), ['CS_FIELD_UNKNOWN']],
  ['ключ прототипу як поле', J(base({ campsites: [JSON.parse(JSON.stringify(site()).replace('{', '{"constructor":1,'))] })), ['CS_FIELD_UNKNOWN']],
  ['кемпінг без координат', J(base({ campsites: [without(site(), 'lat')] })), ['CS_FIELD_MISSING']],
  ['id з підкресленням', J(withSite({ id: 'cs.de_lier' })), ['CS_ID_FORMAT']],
  ['той самий id двічі', J(base({ campsites: [site(), site()] })), ['CS_ID_DUPLICATE']],
  ['порожня назва', J(withSite({ name: '' })), ['CS_FIELD_TYPE']],
  ['назва з телефоном і поштою власника', J(withSite({ name: 'Jan de Vries, +31 6 12345678, jan@x.nl' })), ['CS_PERSONAL_DATA']],
  ['назва з посиланням', J(withSite({ name: 'Camping https://jan.example' })), ['CS_PERSONAL_DATA']],
  ['країна поза BE/NL', J(withSite({ country: 'DE' })), ['CS_FIELD_TYPE']],
  ['kind hotel', J(withSite({ kind: 'hotel' })), ['CS_FIELD_TYPE']],
  ['tents рядком', J(withSite({ tents: 'yes' })), ['CS_FIELD_TYPE']],
  ['campers числом', J(withSite({ campers: 1 })), ['CS_FIELD_TYPE']],
  ['pets рядком', J(withSite({ pets: 'yes' })), ['CS_FIELD_TYPE']],
  ['координати рядком', J(withSite({ lat: '52.0' })), ['CS_FIELD_TYPE']],
  ['переставлені lat/lon', J(withSite({ lat: 4.25, lon: 52.0 })), ['CS_COORD_OUTSIDE']],
  ['широта в межах, довгота — у Німеччині', J(withSite({ lat: 52.0, lon: 8.0 })), ['CS_COORD_OUTSIDE']],
  ['широта на південь від NL', J(withSite({ lat: 50.0 })), ['CS_COORD_OUTSIDE']],
  ['сезон рядком', J(withSite({ season: 'summer' })), ['CS_FIELD_TYPE']],
  ['сезон із зайвим полем', J(withSite({ season: { from: '04-01', to: '10-31', ownerPhone: 'x' } })), ['CS_FIELD_UNKNOWN']],
  ['сезон без to', J(withSite({ season: { from: '04-01' } })), ['CS_FIELD_MISSING']],
  ['сезон у форматі дати', J(withSite({ season: { from: '2026-04-01', to: '10-31' } })), ['CS_FIELD_TYPE']],
  ['неможливий день у сезоні', J(withSite({ season: { from: '02-30', to: '10-31' } })), ['CS_FIELD_TYPE']],
  ['дата перевірки в майбутньому', J(withSite({ checkedAt: '2027-01-01' })), ['CS_DATE']],
  ['неможлива дата перевірки', J(withSite({ checkedAt: '2026-02-31' })), ['CS_DATE']],
];

function selfTest(check, codes) {
  let bad = 0;
  const proven = new Set();
  for (const [name, text, expect] of FIXTURES) {
    const got = [...new Set(check(text, { today: TODAY }).map((f) => f.code))].sort();
    const ok = JSON.stringify(got) === JSON.stringify([...expect].sort());
    if (ok) expect.forEach((c) => proven.add(c));
    else { bad++; console.log(`FAIL ${name}: очікував [${expect}], отримав [${got}]`); }
  }
  const unproven = Object.keys(codes).filter((c) => !proven.has(c));
  if (unproven.length) { bad++; console.log(`FAIL без зламаного прикладу: ${unproven.join(', ')}`); }
  console.log(bad ? `CAMPSITES SELF-TEST: FAILED ${bad}` : `CAMPSITES SELF-TEST: PASSED ${FIXTURES.length}/${FIXTURES.length} · кодів ${Object.keys(codes).length}, доведено ${proven.size}`);
  return bad ? 1 : 0;
}

// Мутації: кожне місце виклику перевірки окремо + точкові (межа довготи, список так/ні-полів).
async function mutate() {
  const src = readFileSync(join(HERE, 'schema.mjs'), 'utf8');
  const sites = [...src.matchAll(/\b(I|unknown|need|date|personal)\(/g)].map((m) => m.index);
  const point = [
    ['довгота не перевіряється', 'c.lon >= box.lon[0] && c.lon <= box.lon[1]', 'true'],
    ['з так/ні-полів лишились лише pets', "['tents', 'campers', 'pets']", "['pets']"],
    ['телефон не розпізнається', String.raw`/\+?\d[\d\s().-]{7,}\d/`, '/$^/'],
    ['посилання не розпізнається', String.raw`/https?:\/\//i`, '/$^/'],
    ['неможливі дні сезону пропускаються', "realMonthDay(c.season[k])", "MONTH_DAY.test(c.season[k])"],
  ];
  const mutants = [
    ...sites.map((at) => [`виклик ${src.slice(at, at + 24).split('\n')[0]}… (рядок ${src.slice(0, at).split('\n').length})`, src.slice(0, at) + 'void (' + src.slice(src.indexOf('(', at) + 1)]),
    ...point.map(([name, from, to]) => [name, src.split(from).length === 2 ? src.replace(from, to) : null]),
  ];
  const tmp = mkdtempSync(join(tmpdir(), 'ct-cs-mut-'));
  let caught = 0;
  const fails = [];
  try {
    for (const [k, [name, text]] of mutants.entries()) {
      if (text === null) { fails.push(`${name}: рядок мутації не знайдено рівно раз`); continue; }
      const p = join(tmp, `m-${k}.mjs`);
      writeFileSync(p, text);
      // Мутант, що падає як модуль чи кидає виняток, — НЕ «спіймано»: це не доказ, що перевірка червоніє.
      let r;
      const quiet = console.log;
      try {
        const m = await import(pathToFileURL(p).href);
        console.log = () => {};
        r = selfTest(m.check, m.CODES);
      } catch (e) { r = 'crash'; fails.push(`${name}: мутант упав (${String(e).slice(0, 80)}) — не доказ`); } finally { console.log = quiet; }
      if (r === 'crash') continue;
      if (r !== 0) caught++; else fails.push(`${name}: самотест ЗЕЛЕНИЙ — мутація пережила`);
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  for (const f of fails) console.log(`ПЕРЕЖИЛА  ${f}`);
  console.log(`CAMPSITES MUTATION: ${fails.length ? 'FAILED' : 'PASSED'} · спіймано ${caught} із ${mutants.length} (місць виклику ${sites.length}, точкових ${point.length})`);
  return fails.length ? 1 : 0;
}

const args = cli({ flags: ['self-test', 'mutate', 'allow-missing'], options: ['file'] });
// Режими не змішуються: «--self-test --file x» мовчки ігнорувало б файл (рецензія GAME-53).
if ([args['self-test'], args.mutate, args.file !== undefined || args['allow-missing']].filter(Boolean).length > 1) {
  console.log('::error::CLI_UNKNOWN_ARG · режими --self-test, --mutate і перевірка файлу (--file/--allow-missing) не поєднуються');
  process.exit(2);
}
const { check, CODES } = await import('./schema.mjs');
if (args['self-test']) process.exit(selfTest(check, CODES));
if (args.mutate) process.exit(await mutate());
const file = resolve(args.file ?? join(ROOT, 'data', 'campsites', 'be-nl.json'));
if (!existsSync(file)) {
  // Файл під іншою назвою (be_nl.json, BE-NL.json) не має вічно ховатись за NOT RUN.
  const dir = dirname(file);
  const others = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
  if (others.length) { console.log(`::error::CAMPSITES: очікував ${file}, а в теці є ${others.join(', ')} — перейменуй або вкажи --file`); process.exit(1); }
  if (args['allow-missing']) { console.log(`::warning::CAMPSITES: NOT RUN — файлу ${file} ще немає (чекаємо експорт чату Сайту, GAME-53). Це не PASS.`); process.exit(0); }
  console.log(`::error::CAMPSITES: файлу ${file} немає`); process.exit(1);
}
const found = check(readFileSync(file, 'utf8'), { today: new Date().toISOString().slice(0, 10) });
for (const f of found) console.log(`::error::${f.code} · ${f.where} · ${f.msg}`);
const n = (() => { try { return JSON.parse(readFileSync(file, 'utf8')).campsites?.length ?? 0; } catch { return 0; } })();
console.log(found.length ? `CAMPSITES: FAILED ${found.length}` : `CAMPSITES: OK · ${n} кемпінгів · ${file}`);
process.exit(found.length ? 1 : 0);
