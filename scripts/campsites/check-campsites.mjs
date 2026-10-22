#!/usr/bin/env node
// Сторож експорту кемпінгів від чату Сайту (GAME-53). Схема — schema.mjs.
//   node scripts/campsites/check-campsites.mjs              перевірити data/campsites/be-nl.json
//   --file <шлях>                                           інший файл
//   --self-test                                             кожен код має зламаний приклад
//   --mutate                                                вимкнути кожен код по черзі → самотест мусить почервоніти
//   --allow-missing                                         файлу ще немає → NOT RUN (код 0), а не PASS
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cli } from '../lib/cli.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const TODAY = '2026-10-23';

const site = (over = {}) => ({ id: 'cs.de-lier', name: 'Camping De Lier', country: 'NL', lat: 52.0, lon: 4.25, kind: 'campsite', tents: true, campers: true, pets: null, season: { from: '04-01', to: '10-31' }, checkedAt: '2026-10-01', ...over });
const base = (over = {}) => ({ format: 'camptribe-campsites', version: 1, exportedAt: '2026-10-20', source: 'camptribe.eu export', licence: { name: 'ODbL 1.0', url: 'https://opendatacommons.org/licenses/odbl/1-0/', attribution: '© OpenStreetMap contributors' }, campsites: [site(), site({ id: 'cs.ardennen', name: 'Ardennen', country: 'BE', lat: 50.3, lon: 5.8, season: null })], ...over });
const J = (o) => JSON.stringify(o);

export const FIXTURES = [
  ['позитивний контроль: справжня форма', J(base()), []],
  ['не JSON', '{"format": обрізано', ['CS_PARSE']],
  ['чужий формат', J(base({ format: 'osm-dump' })), ['CS_FORMAT']],
  ['персональні дані — телефон власника', J(base({ campsites: [site({ phone: '+31 …' })] })), ['CS_FIELD_UNKNOWN']],
  ['зайве поле на верхньому рівні', J(base({ owners: [] })), ['CS_FIELD_UNKNOWN']],
  ['зайве поле в ліцензії', J(base({ licence: { name: 'x', url: 'y', attribution: 'z', email: 'a@b' } })), ['CS_FIELD_UNKNOWN']],
  ['ключ прототипу як поле', '{"format":"camptribe-campsites","version":1,"exportedAt":"2026-10-20","source":"s","licence":{"name":"a","url":"b","attribution":"c"},"campsites":[' + J(site()).replace('{', '{"constructor":1,') + ']}', ['CS_FIELD_UNKNOWN']],
  ['без ліцензії', J((({ licence: _l, ...r }) => r)(base())), ['CS_FIELD_MISSING']],
  ['кемпінг без координат', J(base({ campsites: [(({ lat: _a, ...r }) => r)(site())] })), ['CS_FIELD_MISSING']],
  ['pets рядком', J(base({ campsites: [site({ pets: 'yes' })] })), ['CS_FIELD_TYPE']],
  ['країна поза BE/NL', J(base({ campsites: [site({ country: 'DE' })] })), ['CS_FIELD_TYPE']],
  ['сезон у форматі дати', J(base({ campsites: [site({ season: { from: '2026-04-01', to: '10-31' } })] })), ['CS_FIELD_TYPE']],
  ['id з підкресленням', J(base({ campsites: [site({ id: 'cs.de_lier' })] })), ['CS_ID_FORMAT']],
  ['той самий id двічі', J(base({ campsites: [site(), site()] })), ['CS_ID_DUPLICATE']],
  ['переставлені lat/lon', J(base({ campsites: [site({ lat: 4.25, lon: 52.0 })] })), ['CS_COORD_OUTSIDE']],
  ['дата перевірки в майбутньому', J(base({ campsites: [site({ checkedAt: '2027-01-01' })] })), ['CS_DATE']],
  ['порожній експорт', J(base({ campsites: [] })), ['CS_EMPTY']],
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

async function mutate() {
  const src = readFileSync(join(HERE, 'schema.mjs'), 'utf8');
  const { CODES } = await import('./schema.mjs');
  const tmp = mkdtempSync(join(tmpdir(), 'ct-cs-mut-'));
  let caught = 0;
  const fails = [];
  try {
    for (const code of Object.keys(CODES)) {
      const hits = src.split(`I('${code}'`).length - 1;
      if (hits === 0) { fails.push(`${code}: рядка мутації немає`); continue; }
      const p = join(tmp, `m-${code}.mjs`);
      writeFileSync(p, src.replaceAll(`I('${code}'`, `void ('${code}'`));
      const m = await import(pathToFileURL(p).href);
      const quiet = console.log; console.log = () => {};
      const r = selfTest(m.check, m.CODES);
      console.log = quiet;
      if (r !== 0) { caught++; console.log(`спіймано  вимкнено ${code}`); } else fails.push(`${code}: самотест ЗЕЛЕНИЙ — мутація пережила`);
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  for (const f of fails) console.log(`ПЕРЕЖИЛА  ${f}`);
  console.log(`CAMPSITES MUTATION: ${fails.length ? 'FAILED' : 'PASSED'} · спіймано ${caught} із ${Object.keys(CODES).length}`);
  return fails.length ? 1 : 0;
}

const args = cli({ flags: ['self-test', 'mutate', 'allow-missing'], options: ['file'] });
const { check, CODES } = await import('./schema.mjs');
if (args['self-test']) process.exit(selfTest(check, CODES));
if (args.mutate) process.exit(await mutate());
const file = resolve(args.file ?? join(ROOT, 'data', 'campsites', 'be-nl.json'));
if (!existsSync(file)) {
  if (args['allow-missing']) { console.log(`::warning::CAMPSITES: NOT RUN — файлу ${file} ще немає (чекаємо експорт чату Сайту, GAME-53). Це не PASS.`); process.exit(0); }
  console.log(`::error::CAMPSITES: файлу ${file} немає`); process.exit(1);
}
const found = check(readFileSync(file, 'utf8'), { today: new Date().toISOString().slice(0, 10) });
for (const f of found) console.log(`::error::${f.code} · ${f.where} · ${f.msg}`);
const n = (() => { try { return JSON.parse(readFileSync(file, 'utf8')).campsites?.length ?? 0; } catch { return 0; } })();
console.log(found.length ? `CAMPSITES: FAILED ${found.length}` : `CAMPSITES: OK · ${n} кемпінгів · ${file}`);
process.exit(found.length ? 1 : 0);
