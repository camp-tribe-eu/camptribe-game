// Мінімальний строгий валідатор схем без залежностей.
// Невідоме поле — помилка: так у визначення не просочується стан проходження
// (completed, progress, visited…) і не живуть одруківки.

const str = { t: 'string' };
const bool = { t: 'boolean' };
const int0 = { t: 'int', min: 0 };
const int1 = { t: 'int', min: 1 };
const arr = (of) => ({ t: 'array', of });
const obj = (fields) => ({ t: 'object', fields });
const en = (...values) => ({ t: 'string', enum: values });
const req = (s) => ({ ...s, required: true });
const ids = { t: 'array', of: str, min: 1 };

// Умова на стан гравця: усі названі виміри мусять збігтися, всередині виміру — будь-який зі списку.
// Порожній список заборонено: «нікому» — це одруківка, а не намір. Семантика: scripts/validator/combos.mjs.
const when = obj({ profiles: ids, transports: ids, animals: ids });

// Діалоги (GAME-28, TD-005/TD-006). Умова — типізований об'єкт, ніколи не рядок «car && x».
// union: об'єкт рівно з ОДНИМ ключем-дискримінатором зі списку варіантів; далі — строга схема варіанта.
const union = (variants) => ({ t: 'union', variants });
const cond = union({});
const conds = { t: 'array', of: cond, min: 1 };
Object.assign(cond.variants, {
  flag: obj({ flag: req(str) }),
  notFlag: obj({ notFlag: req(str) }),
  quest: obj({ quest: req(str), status: req(en('active', 'completed')) }),
  transport: obj({ transport: req(str) }),
  all: obj({ all: req(conds) }),
  any: obj({ any: req(conds) }),
});
const effect = union({
  setFlag: obj({ setFlag: req(str) }),
  startQuest: obj({ startQuest: req(str) }),
  completeObjective: obj({ completeObjective: req(obj({ quest: req(str), objective: req(str) })) }),
});
const choice = obj({ textKey: req(str), next: req(str), when: cond, effects: arr(effect) });
const node = obj({
  id: req(str), speaker: req(en('npc', 'player')), textKey: req(str),
  end: bool, next: str, choices: { t: 'array', of: choice, min: 1 },
});

const reward = obj({ grantId: req(str), items: arr(obj({ item: req(str), qty: req(int1) })), money: int0, once: bool });

// content/dialogue/<назва>.json — один діалог на файл; завантажувач складає їх у content.dialogues.
// У SCHEMAS як `dialogues` (DC-011), але НЕ в COLLECTIONS: це тека файлів, а не один <колекція>.json.
export const DIALOGUE_SCHEMA = obj({ id: req(str), npcId: req(str), start: req(str), nodes: req({ t: 'array', of: node, min: 1 }) });

export const SCHEMAS = {
  dialogues: DIALOGUE_SCHEMA,
  meta: obj({ start: req(str), locales: req(arr(str)) }),
  // transports — з якими транспортами сумісний запис; немає поля — з усіма. Несумісні комбінації
  // не перебираються: гравець не може їх обрати, тож тупик у них — не тупик (закон 5).
  profiles: obj({ id: req(str), nameKey: req(str), transports: ids }),
  transports: obj({ id: req(str), nameKey: req(str) }),
  animals: obj({ id: req(str), nameKey: req(str), transports: ids }),
  items: obj({ id: req(str), nameKey: req(str) }),
  npcs: obj({ id: req(str), nameKey: req(str), locationId: req(str), unlockedBy: str, sells: arr(str), when }),
  locations: obj({ id: req(str), nameKey: req(str), unlockedBy: str, items: arr(str), when }),
  quests: obj({
    id: req(str), titleKey: req(str), optional: req(bool), end: bool,
    giverId: str, locationId: str, when,
    requires: obj({ quests: arr(str), items: arr(str) }),
    objectives: req(arr(obj({
      id: req(str), textKey: req(str), kind: req(en('talk', 'visit', 'collect', 'deliver')),
      target: req(str), npcId: str, required: req(bool), when,
    }))),
    transitions: req(arr(obj({ on: req(en('complete', 'decline')), to: req(str), choiceKey: str, when }))),
    reward,
  }),
  events: obj({ id: req(str), titleKey: req(str), locationId: str, repeatable: req(bool), reward }),
  // source/checkedAt/kind навмисно не required тут: їх стереже перевірка fact-source
  // власними кодами, щоб відсутнє джерело не ховалось під загальним SCHEMA_INVALID.
  facts: obj({ id: req(str), claimKey: req(str), source: str, checkedAt: str, kind: str }),
};


export const COLLECTIONS = ['profiles', 'transports', 'animals', 'items', 'npcs', 'locations', 'quests', 'events', 'facts'];

function typeOk(s, v) {
  switch (s.t) {
    case 'string': return typeof v === 'string' && (!s.enum || s.enum.includes(v));
    case 'boolean': return typeof v === 'boolean';
    case 'int': return Number.isInteger(v) && v >= (s.min ?? -Infinity);
    case 'array': return Array.isArray(v) && v.length >= (s.min ?? 0);
    case 'object': case 'union': return v !== null && typeof v === 'object' && !Array.isArray(v);
    default: return false;
  }
}

function walk(s, v, where, out) {
  if (!typeOk(s, v)) {
    const want = s.enum ? `одне з ${s.enum.join('|')}` : s.t + (s.min != null ? (s.t === 'array' ? ` довжини >= ${s.min}` : ` >= ${s.min}`) : '');
    out.push({ code: 'SCHEMA_INVALID', where, msg: `очікується ${want}, отримано ${JSON.stringify(v)}` });
    return;
  }
  if (s.t === 'union') {
    // Object.hasOwn, а не `in`: інакше `constructor`/`__proto__` з JSON рахуються за варіант.
    const keys = Object.keys(v).filter((k) => Object.hasOwn(s.variants, k));
    if (keys.length !== 1) {
      out.push({ code: 'SCHEMA_INVALID', where, msg: `очікується рівно один із ключів ${Object.keys(s.variants).join('|')}, отримано ${JSON.stringify(v)}` });
      return;
    }
    return walk(s.variants[keys[0]], v, where, out);
  }
  if (s.t === 'array') v.forEach((x, i) => walk(s.of, x, `${where}[${i}]`, out));
  if (s.t === 'object') {
    for (const [k, fs] of Object.entries(s.fields)) {
      if (v[k] === undefined) {
        if (fs.required) out.push({ code: 'SCHEMA_INVALID', where: `${where}.${k}`, msg: 'обов\u2019язкове поле відсутнє' });
      } else walk(fs, v[k], `${where}.${k}`, out);
    }
    for (const k of Object.keys(v)) {
      // Object.hasOwn, а не `in`: прототипні ключі (`constructor`, `__proto__` з JSON) — теж невідомі поля.
      if (!Object.hasOwn(s.fields, k)) out.push({ code: 'SCHEMA_UNKNOWN_FIELD', where: `${where}.${k}`, msg: 'невідоме поле (стан проходження чи одруківка?)' });
    }
  }
}

export function checkSchema(content) {
  const out = [];
  if (!typeOk({ t: 'object' }, content)) return [{ code: 'SCHEMA_INVALID', where: 'content', msg: 'не об\u2019єкт' }];
  const known = ['meta', 'locales', 'dialogues', ...COLLECTIONS];
  for (const k of Object.keys(content)) {
    if (!known.includes(k)) out.push({ code: 'SCHEMA_UNKNOWN_FIELD', where: k, msg: 'невідомий розділ контенту' });
  }
  walk(SCHEMAS.meta, content.meta, 'meta', out);
  for (const c of COLLECTIONS) {
    if (content[c] === undefined) continue;
    if (!Array.isArray(content[c])) { out.push({ code: 'SCHEMA_INVALID', where: c, msg: 'очікується масив' }); continue; }
    content[c].forEach((e, i) => walk(SCHEMAS[c], e, `${c}[${i}]`, out));
  }
  if (content.dialogues !== undefined) {
    if (!Array.isArray(content.dialogues)) out.push({ code: 'SCHEMA_INVALID', where: 'dialogues', msg: 'очікується масив' });
    else content.dialogues.forEach((d, i) => {
      const where = `dialogue:${typeof d?.id === 'string' ? d.id : i}`;
      const before = out.length;
      walk(DIALOGUE_SCHEMA, d, where, out);
      if (out.length > before) return;
      // Вихід вузла — рівно один спосіб: end, next або choices. Два одразу — рушій не знає, що робити.
      for (const n of d.nodes) {
        const ways = [n.end === true, n.next !== undefined, n.choices !== undefined].filter(Boolean).length;
        if (ways > 1) out.push({ code: 'SCHEMA_INVALID', where: `${where}/${n.id}`, msg: 'вузол має більше одного способу виходу: лише одне з end | next | choices' });
      }
    });
  }
  const loc = content.locales;
  if (loc !== undefined) {
    if (!typeOk({ t: 'object' }, loc)) out.push({ code: 'SCHEMA_INVALID', where: 'locales', msg: 'очікується об\u2019єкт мова → ключі' });
    else for (const [lang, table] of Object.entries(loc)) {
      if (!typeOk({ t: 'object' }, table)) { out.push({ code: 'SCHEMA_INVALID', where: `locales.${lang}`, msg: 'очікується об\u2019єкт ключ → рядок' }); continue; }
      for (const [k, v] of Object.entries(table)) {
        if (typeof v !== 'string') out.push({ code: 'SCHEMA_INVALID', where: `locales.${lang}.${k}`, msg: 'переклад має бути рядком' });
      }
    }
  }
  return out;
}
