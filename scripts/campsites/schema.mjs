// Схема експорту кемпінгів BE–NL від чату Сайту (GAME-53). Гра бере ФАЙЛ, а не БД сайту (CLAUDE.md):
// впаде одне — інше живе. Лише те, що потрібно світу гри; жодних персональних даних (власники,
// телефони, пошта, відгуки) — це друга правова поверхня (DSA, GDPR), не для першої версії.

export const FORMAT = 'camptribe-campsites';
export const VERSION = 1;
export const COUNTRIES = ['BE', 'NL'];
export const KINDS = ['campsite', 'camper-park', 'nature-camp'];

export const CODES = {
  CS_PARSE: 'файл не JSON',
  CS_FORMAT: 'format/version не ті',
  CS_FIELD_UNKNOWN: 'поле поза схемою (зокрема будь-які персональні дані)',
  CS_FIELD_MISSING: 'обов’язкове поле відсутнє',
  CS_FIELD_TYPE: 'хибний тип чи значення поля',
  CS_ID_FORMAT: 'id не у форматі cs.<назва>',
  CS_ID_DUPLICATE: 'той самий id двічі',
  CS_COORD_OUTSIDE: 'координати поза межами BE/NL',
  CS_DATE: 'дата не РРРР-ММ-ДД або в майбутньому',
  CS_EMPTY: 'кемпінгів 0 — порожній експорт не «усе гаразд» (закон 4)',
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_DAY = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const ID = /^cs\.[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Грубі рамки країн (з запасом на узбережжя): ловлять переставлені lat/lon і чужу країну.
const BOX = { BE: { lat: [49.4, 51.6], lon: [2.4, 6.5] }, NL: { lat: [50.7, 53.7], lon: [3.2, 7.3] } };

const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v) => typeof v === 'string' && v.trim() !== '';
const boolOrNull = (v) => typeof v === 'boolean' || v === null;

const TOP = { format: 1, version: 1, exportedAt: 1, source: 1, licence: 1, campsites: 1 };
const LICENCE = { name: 1, url: 1, attribution: 1 };
const SITE = { id: 1, name: 1, country: 1, lat: 1, lon: 1, kind: 1, tents: 1, campers: 1, pets: 1, season: 1, checkedAt: 1 };
const SEASON = { from: 1, to: 1 };

export function check(text, { today }) {
  const out = [];
  const I = (code, where, msg) => out.push({ code, where, msg });
  let d;
  try { d = JSON.parse(text); } catch (e) { I('CS_PARSE', 'file', String(e)); return out; }
  if (!isObj(d)) { I('CS_FORMAT', 'file', 'не об’єкт'); return out; }
  const unknown = (o, allowed, where) => { for (const k of Object.keys(o)) if (!Object.hasOwn(allowed, k)) I('CS_FIELD_UNKNOWN', `${where}.${k}`, 'поля немає в схемі'); };
  const need = (o, allowed, where) => { for (const k of Object.keys(allowed)) if (!Object.hasOwn(o, k)) I('CS_FIELD_MISSING', `${where}.${k}`, 'обов’язкове'); };
  unknown(d, TOP, 'file'); need(d, TOP, 'file');
  if (d.format !== FORMAT || d.version !== VERSION) I('CS_FORMAT', 'file', `очікується ${FORMAT} v${VERSION}`);
  const date = (v, where) => { if (!(typeof v === 'string' && DATE.test(v) && !Number.isNaN(Date.parse(v)) && v <= today)) I('CS_DATE', where, String(v)); };
  if (Object.hasOwn(d, 'exportedAt')) date(d.exportedAt, 'file.exportedAt');
  if (Object.hasOwn(d, 'source') && !str(d.source)) I('CS_FIELD_TYPE', 'file.source', 'непорожній рядок');
  if (Object.hasOwn(d, 'licence')) {
    if (!isObj(d.licence)) I('CS_FIELD_TYPE', 'file.licence', 'об’єкт');
    else {
      unknown(d.licence, LICENCE, 'licence'); need(d.licence, LICENCE, 'licence');
      for (const k of Object.keys(LICENCE)) if (Object.hasOwn(d.licence, k) && !str(d.licence[k])) I('CS_FIELD_TYPE', `licence.${k}`, 'непорожній рядок');
    }
  }
  if (!Array.isArray(d.campsites)) { if (Object.hasOwn(d, 'campsites')) I('CS_FIELD_TYPE', 'file.campsites', 'масив'); return out; }
  if (d.campsites.length === 0) I('CS_EMPTY', 'file.campsites', '0');
  const seen = new Set();
  d.campsites.forEach((c, i) => {
    const w = `campsites[${i}]`;
    if (!isObj(c)) { I('CS_FIELD_TYPE', w, 'об’єкт'); return; }
    unknown(c, SITE, w); need(c, SITE, w);
    if (Object.hasOwn(c, 'id')) {
      if (typeof c.id !== 'string' || !ID.test(c.id)) I('CS_ID_FORMAT', `${w}.id`, String(c.id));
      else if (seen.has(c.id)) I('CS_ID_DUPLICATE', `${w}.id`, c.id);
      else seen.add(c.id);
    }
    if (Object.hasOwn(c, 'name') && !str(c.name)) I('CS_FIELD_TYPE', `${w}.name`, 'непорожній рядок');
    if (Object.hasOwn(c, 'country') && !COUNTRIES.includes(c.country)) I('CS_FIELD_TYPE', `${w}.country`, `одне з ${COUNTRIES}`);
    if (Object.hasOwn(c, 'kind') && !KINDS.includes(c.kind)) I('CS_FIELD_TYPE', `${w}.kind`, `одне з ${KINDS}`);
    for (const k of ['tents', 'campers', 'pets']) if (Object.hasOwn(c, k) && !boolOrNull(c[k])) I('CS_FIELD_TYPE', `${w}.${k}`, 'true | false | null (невідомо)');
    const num = (v) => typeof v === 'number' && Number.isFinite(v);
    if (Object.hasOwn(c, 'lat') && Object.hasOwn(c, 'lon')) {
      if (!num(c.lat) || !num(c.lon)) I('CS_FIELD_TYPE', `${w}.lat/lon`, 'числа');
      else {
        const box = BOX[c.country];
        if (box && !(c.lat >= box.lat[0] && c.lat <= box.lat[1] && c.lon >= box.lon[0] && c.lon <= box.lon[1])) I('CS_COORD_OUTSIDE', `${w}`, `${c.lat},${c.lon} поза ${c.country}`);
      }
    }
    if (Object.hasOwn(c, 'season')) {
      if (c.season !== null && !isObj(c.season)) I('CS_FIELD_TYPE', `${w}.season`, 'null (цілий рік) або { from, to }');
      else if (c.season) {
        unknown(c.season, SEASON, `${w}.season`); need(c.season, SEASON, `${w}.season`);
        for (const k of ['from', 'to']) if (Object.hasOwn(c.season, k) && !(typeof c.season[k] === 'string' && MONTH_DAY.test(c.season[k]))) I('CS_FIELD_TYPE', `${w}.season.${k}`, 'ММ-ДД');
      }
    }
    if (Object.hasOwn(c, 'checkedAt')) date(c.checkedAt, `${w}.checkedAt`);
  });
  return out;
}
