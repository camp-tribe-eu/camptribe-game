// Перевірки контенту. Кожна перевірка позначена маркером `// @check:<id>` у першому рядку тіла:
// scripts/mutate-validator.mjs вставляє після нього `return [];` і доводить, що самотест червоніє.
// Не прибирай і не дублюй маркери — мутаційний прогін звіряє їх із реєстром CHECKS.

import { checkSchema } from './schema.mjs';
import { FACT_KINDS, FACT_STALE_DAYS, GEAR_FIELDS, isWarning, SKILL_IDS } from './codes.mjs';
import { checkCombos, checkOptions, enumerateCombos, NO_ANIMAL } from './combos.mjs';

const I = (code, where, msg) => ({ code, where, msg });

const ID_PATTERNS = {
  profiles: /^profile\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/,
  transports: /^transport\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/,
  animals: /^animal\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/,
  items: /^item\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/,
  npcs: /^npc\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/,
  locations: /^loc\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/,
  quests: /^(?:ST-\d{3}|q\.[a-z0-9]+(?:[.-][a-z0-9]+)*)$/,
  events: /^ev\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/,
  facts: /^fact\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/,
  dialogues: /^dlg\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/,
  roads: /^road\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/,
};
const FLAG_ID = /^f\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
// Факт пам'яті NPC (GAME-48): «m.» і слова через дефіс — m.came-by-bike.
const MEMORY_ID = /^m\.[a-z0-9]+(?:-[a-z0-9]+)*$/;
const GRANT_ID = /^rw\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const OBJECTIVE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TARGET_TYPE = { talk: 'npcs', visit: 'locations', collect: 'items', deliver: 'items' };
const WHEN_TYPE = { profiles: 'profiles', transports: 'transports', animals: 'animals' };
// Перевірки, що проганяються окремо для кожної комбінації профіль × транспорт × тварина.
const PER_COMBO = ['objective-completable', 'cycle-exit', 'main-gate', 'transition-gate', 'path-to-end', 'optional-decline', 'branch-next'];

// ---------- індекс і граф ----------

export function buildIndex(content) {
  const by = {};
  for (const t of Object.keys(ID_PATTERNS)) {
    by[t] = new Map();
    for (const e of content[t] ?? []) if (!by[t].has(e.id)) by[t].set(e.id, e);
  }
  const Q = by.quests;
  const start = content.meta.start;
  const edges = new Map();
  for (const q of Q.values()) edges.set(q.id, q.transitions.filter((t) => Q.has(t.to)));

  const reach = (from, skip) => {
    const seen = new Set();
    if (!Q.has(from)) return seen;
    const stack = [from];
    seen.add(from);
    while (stack.length) {
      const u = stack.pop();
      for (const tr of edges.get(u)) {
        if (skip && skip(u, tr)) continue;
        if (!seen.has(tr.to)) { seen.add(tr.to); stack.push(tr.to); }
      }
    }
    return seen;
  };
  const reachable = reach(start);

  // guaranteed(q) — квести, ЗАВЕРШЕННЯ яких неминуче перед входом у q:
  // якщо прибрати всі complete-переходи з X, то q стає недосяжним.
  // Відмова (decline) — не завершення, тож необов'язковий квест гарантованим не буває,
  // якщо в нього є шлях відмови.
  const guaranteed = new Map([...reachable].map((q) => [q, new Set()]));
  for (const X of reachable) {
    const r = reach(start, (u, tr) => u === X && tr.on === 'complete');
    for (const q of reachable) if (q !== X && !r.has(q)) guaranteed.get(q).add(X);
  }

  const avail = (ent, q) => !ent.unlockedBy || guaranteed.get(q).has(ent.unlockedBy);
  const npcAvail = (n, q) => avail(n, q) && (!by.locations.has(n.locationId) || avail(by.locations.get(n.locationId), q));
  const itemGuaranteedAt = (itemId, q) => {
    for (const X of guaranteed.get(q)) if (Q.get(X).reward?.items?.some((i) => i.item === itemId)) return true;
    for (const n of by.npcs.values()) if (n.sells?.includes(itemId) && npcAvail(n, q)) return true;
    for (const l of by.locations.values()) if (l.items?.includes(itemId) && avail(l, q)) return true;
    return false;
  };

  return { by, start, edges, reachable, guaranteed, avail, npcAvail, itemGuaranteedAt };
}

// Tarjan: сильно зв'язні компоненти. next(u) → масив сусідів.
function scc(nodes, next) {
  let idx = 0;
  const index = new Map(), low = new Map(), onStack = new Set(), stack = [], out = [];
  const visit = (v) => {
    index.set(v, idx); low.set(v, idx); idx++;
    stack.push(v); onStack.add(v);
    for (const w of next(v)) {
      if (!index.has(w)) { visit(w); low.set(v, Math.min(low.get(v), low.get(w))); }
      else if (onStack.has(w)) low.set(v, Math.min(low.get(v), index.get(w)));
    }
    if (low.get(v) === index.get(v)) {
      const comp = [];
      let w;
      do { w = stack.pop(); onStack.delete(w); comp.push(w); } while (w !== v);
      out.push(comp);
    }
  };
  for (const v of nodes) if (!index.has(v)) visit(v);
  return out;
}
const isCycle = (comp, next) => comp.length > 1 || next(comp[0]).includes(comp[0]);

// ---------- перевірки ----------

export const CHECKS = [
  {
    id: 'schema',
    run(c) { // @check:schema
      return checkSchema(c.content);
    },
  },
  {
    id: 'id-format',
    run(c) { // @check:id-format
      const out = [];
      for (const [t, re] of Object.entries(ID_PATTERNS)) {
        for (const e of c.content[t] ?? []) if (!re.test(e.id)) out.push(I('ID_FORMAT', `${t}:${e.id}`, `id не відповідає ${re}`));
      }
      for (const a of c.content.animals ?? []) if (a.id === NO_ANIMAL) out.push(I('ID_FORMAT', `animals:${a.id}`, `${NO_ANIMAL} зарезервовано за «без тварини»`));
      for (const q of c.content.quests ?? []) for (const o of q.objectives) {
        if (!OBJECTIVE_ID.test(o.id)) out.push(I('ID_FORMAT', `${q.id}/${o.id}`, `id цілі не відповідає ${OBJECTIVE_ID}`));
      }
      for (const d of c.content.dialogues ?? []) for (const n of d.nodes) {
        if (!OBJECTIVE_ID.test(n.id)) out.push(I('ID_FORMAT', `${d.id}/${n.id}`, `id вузла не відповідає ${OBJECTIVE_ID}`));
      }
      for (const [where, f] of flagUses(c.content)) if (!FLAG_ID.test(f)) out.push(I('ID_FORMAT', where, `прапорець «${f}» не відповідає ${FLAG_ID}`));
      for (const [where, f] of memoryUses(c.content)) if (!MEMORY_ID.test(f)) out.push(I('ID_FORMAT', where, `факт пам\u2019яті «${f}» не відповідає ${MEMORY_ID}`));
      for (const [where, rw] of rewards(c.content)) {
        if (!GRANT_ID.test(rw.grantId)) out.push(I('ID_FORMAT', where, `grantId не відповідає ${GRANT_ID}`));
      }
      return out;
    },
  },
  {
    id: 'id-unique',
    run(c) { // @check:id-unique
      const out = [];
      const dup = (list, where) => {
        const seen = new Set();
        for (const id of list) { if (seen.has(id)) out.push(I('ID_DUPLICATE', where, `id «${id}» повторюється`)); seen.add(id); }
      };
      for (const t of Object.keys(ID_PATTERNS)) dup((c.content[t] ?? []).map((e) => e.id), t);
      for (const q of c.content.quests ?? []) dup(q.objectives.map((o) => o.id), `${q.id}.objectives`);
      for (const d of c.content.dialogues ?? []) dup(d.nodes.map((n) => n.id), `${d.id}.nodes`);
      return out;
    },
  },
  {
    id: 'refs',
    run(c) { // @check:refs
      const out = [];
      const { by } = c.ix;
      const ref = (t, id, where) => { if (id !== undefined && !by[t].has(id)) out.push(I('REF_MISSING', where, `${t} «${id}» не існує`)); };
      ref('quests', c.content.meta.start, 'meta.start');
      for (const [where, w] of whens(c.content)) {
        for (const [dim, t] of Object.entries(WHEN_TYPE)) {
          for (const id of w[dim] ?? []) if (!(dim === 'animals' && id === NO_ANIMAL)) ref(t, id, `${where}.when.${dim}`);
        }
      }
      for (const t of ['profiles', 'animals']) {
        for (const e of c.content[t] ?? []) for (const id of e.transports ?? []) ref('transports', id, `${e.id}.transports`);
      }
      for (const n of by.npcs.values()) {
        ref('locations', n.locationId, `${n.id}.locationId`);
        ref('quests', n.unlockedBy, `${n.id}.unlockedBy`);
        (n.sells ?? []).forEach((i) => ref('items', i, `${n.id}.sells`));
      }
      for (const l of by.locations.values()) {
        ref('quests', l.unlockedBy, `${l.id}.unlockedBy`);
        (l.items ?? []).forEach((i) => ref('items', i, `${l.id}.items`));
      }
      for (const q of by.quests.values()) {
        ref('npcs', q.giverId, `${q.id}.giverId`);
        ref('locations', q.locationId, `${q.id}.locationId`);
        (q.requires?.quests ?? []).forEach((x) => ref('quests', x, `${q.id}.requires.quests`));
        (q.requires?.items ?? []).forEach((x) => ref('items', x, `${q.id}.requires.items`));
        for (const o of q.objectives) {
          ref(TARGET_TYPE[o.kind], o.target, `${q.id}/${o.id}.target`);
          if (o.kind === 'deliver') {
            if (o.npcId === undefined) out.push(I('REF_MISSING', `${q.id}/${o.id}.npcId`, 'deliver без отримувача'));
            else ref('npcs', o.npcId, `${q.id}/${o.id}.npcId`);
          }
        }
        q.transitions.forEach((tr) => ref('quests', tr.to, `${q.id}.transitions`));
      }
      for (const e of by.events.values()) ref('locations', e.locationId, `${e.id}.locationId`);
      for (const r of by.roads.values()) {
        ref('locations', r.from, `${r.id}.from`);
        ref('locations', r.to, `${r.id}.to`);
        r.ways.forEach((w, i) => ref('transports', w.transport, `${r.id}.ways[${i}].transport`));
      }
      for (const [where, rw] of rewards(c.content)) (rw.items ?? []).forEach((i) => ref('items', i.item, where));
      return out;
    },
  },
  {
    id: 'skills',
    run(c) { // @check:skills
      // GAME-72: професія задає старт навичок. Одруківка в id мовчки дала б нуль замість рангу.
      const out = [];
      for (const p of c.content.profiles ?? []) {
        const seen = new Set();
        (p.startSkills ?? []).forEach((s, i) => {
          if (!SKILL_IDS.includes(s.skill)) out.push(I('SKILL_UNKNOWN', `${p.id}.startSkills[${i}]`, `навички «${s.skill}» немає; відомі: ${SKILL_IDS.join(', ')}`));
          if (seen.has(s.skill)) out.push(I('SKILL_DUPLICATE', `${p.id}.startSkills[${i}]`, `навичка «${s.skill}» вже задана`));
          seen.add(s.skill);
        });
      }
      return out;
    },
  },
  {
    id: 'gear',
    run(c) { // @check:gear
      // GAME-73: спорядження. Предмет із kind або з будь-яким полем картки — спорядження, і картка мусить бути повною:
      // забута вага чи ціна мовчки дала б «безкоштовний невагомий намет».
      const out = [];
      const gear = (c.content.items ?? []).filter((i) => i.kind !== undefined || GEAR_FIELDS.some((f) => i[f] !== undefined));
      const complete = [];
      for (const i of gear) {
        const missing = ['kind', ...GEAR_FIELDS].filter((f) => i[f] === undefined);
        if (missing.length) { out.push(I('GEAR_FIELD_MISSING', i.id, `бракує полів: ${missing.join(', ')}`)); continue; }
        if (i.resaleCents > i.priceCents) out.push(I('GEAR_RESALE_ABOVE_PRICE', i.id, `викуп ${i.resaleCents} > ціни ${i.priceCents} центів`));
        complete.push(i);
      }
      // SIM-INV-005: b «не гірший ні в чому» за a — легший чи такий самий, не більший, не менш вологостійкий, не холодніший,
      // не менший на місця, не дорожчий — і хоч в одному кращий. Тоді a нікому не потрібна: це не тир, а помилка.
      const notWorse = (b, a) => b.weightG <= a.weightG && b.volumeL <= a.volumeL && b.waterproofMm >= a.waterproofMm
        && b.comfortC <= a.comfortC && b.sleeps >= a.sleeps && b.priceCents <= a.priceCents;
      const same = (b, a) => b.weightG === a.weightG && b.volumeL === a.volumeL && b.waterproofMm === a.waterproofMm
        && b.comfortC === a.comfortC && b.sleeps === a.sleeps && b.priceCents === a.priceCents;
      for (const a of complete) {
        // Точна копія теж без своєї ситуації (рецензія 14117b9) — звітуємо пізнішу з пари, щоб знахідка була одна.
        const b = complete.find((x) => x !== a && x.kind === a.kind && notWorse(x, a) && (!same(x, a) || complete.indexOf(x) < complete.indexOf(a)));
        if (b) out.push(I('GEAR_DOMINATED', a.id, `«${b.id}» не гірший ні в чому — у «${a.id}» немає своєї ситуації (SIM-INV-005)`));
      }
      return out;
    },
  },
  {
    id: 'objective-completable',
    run(c) { // @check:objective-completable
      const out = [];
      const { by, reachable, avail, npcAvail, itemGuaranteedAt } = c.ix;
      for (const qid of reachable) {
        const q = by.quests.get(qid);
        for (const o of q.objectives) {
          if (!o.required) continue;
          const bad = (why) => out.push(I('OBJECTIVE_UNCOMPLETABLE', `${q.id}/${o.id}`, why));
          if (o.kind === 'talk' && by.npcs.has(o.target) && !npcAvail(by.npcs.get(o.target), qid)) bad(`NPC «${o.target}» не гарантовано доступний на цьому етапі`);
          if (o.kind === 'visit' && by.locations.has(o.target) && !avail(by.locations.get(o.target), qid)) bad(`локація «${o.target}» не гарантовано відкрита на цьому етапі`);
          if ((o.kind === 'collect' || o.kind === 'deliver') && by.items.has(o.target) && !itemGuaranteedAt(o.target, qid)) bad(`предмет «${o.target}» не гарантовано можна отримати до цього етапу`);
          if (o.kind === 'deliver' && by.npcs.has(o.npcId) && !npcAvail(by.npcs.get(o.npcId), qid)) bad(`отримувач «${o.npcId}» не гарантовано доступний`);
        }
      }
      return out;
    },
  },
  {
    id: 'item-obtainable',
    run(c) { // @check:item-obtainable
      const out = [];
      const { by } = c.ix;
      const sources = new Set();
      for (const [, rw] of rewards(c.content)) (rw.items ?? []).forEach((i) => sources.add(i.item));
      for (const n of by.npcs.values()) (n.sells ?? []).forEach((i) => sources.add(i));
      for (const l of by.locations.values()) (l.items ?? []).forEach((i) => sources.add(i));
      const needed = new Map();
      for (const q of by.quests.values()) {
        (q.requires?.items ?? []).forEach((i) => needed.set(i, `${q.id}.requires.items`));
        for (const o of q.objectives) if (o.kind === 'collect' || o.kind === 'deliver') needed.set(o.target, `${q.id}/${o.id}`);
      }
      for (const [item, where] of needed) {
        if (by.items.has(item) && !sources.has(item)) out.push(I('ITEM_UNOBTAINABLE', where, `предмет «${item}» не має жодного джерела`));
      }
      return out;
    },
  },
  {
    id: 'cycle-exit',
    run(c) { // @check:cycle-exit
      const out = [];
      const { by, edges } = c.ix;
      const next = (v) => edges.get(v).map((t) => t.to);
      for (const comp of scc([...by.quests.keys()], next)) {
        if (!isCycle(comp, next)) continue;
        const set = new Set(comp);
        const hasExit = comp.some((v) => by.quests.get(v).end || next(v).some((w) => !set.has(w)));
        if (!hasExit) out.push(I('CYCLE_NO_EXIT', comp.sort().join(' → '), 'цикл без жодного переходу назовні'));
      }
      return out;
    },
  },
  {
    id: 'main-gate',
    run(c) { // @check:main-gate
      const out = [];
      const { by, reachable, guaranteed, itemGuaranteedAt } = c.ix;
      for (const qid of reachable) {
        const q = by.quests.get(qid);
        if (q.optional) continue;
        for (const r of q.requires?.quests ?? []) {
          if (by.quests.has(r) && !guaranteed.get(qid).has(r)) {
            out.push(I('MAIN_GATE_NOT_GUARANTEED', `${q.id}.requires.quests`, `основний квест вимагає «${r}», завершення якого не гарантоване${by.quests.get(r).optional ? ' (він необов\u2019язковий)' : ''}`));
          }
        }
        for (const i of q.requires?.items ?? []) {
          if (by.items.has(i) && !itemGuaranteedAt(i, qid)) out.push(I('MAIN_GATE_NOT_GUARANTEED', `${q.id}.requires.items`, `основний квест вимагає предмет «${i}», отримання якого не гарантоване`));
        }
      }
      return out;
    },
  },
  {
    // Рецензія GAME-29: main-gate рахує «гарантоване перед входом у ціль», куди входить і квест-джерело
    // разом із локаціями, які ВІН відкриває. Але ядро перевіряє requires у мить переходу: предмет з
    // локації, що відчиняється завершенням джерела, ще не в руках — перехід відмовить, гравець застряг.
    // Тут — кожен перехід u→t окремо: requires цілі має бути виконуваним, поки u ще активний.
    // Ціна хибного спрацювання (закон 5): червоніє й вибір, поруч з яким є робочий перехід за
    // замовчуванням — це не тупик, а кнопка, яку гра запропонує й відмовить. Свідомо: такої кнопки в
    // грі бути не має; «бонус, якщо пройшов бічний» роби умовою when на переході, а не requires.
    id: 'transition-gate',
    run(c) { // @check:transition-gate
      const out = [];
      const { by, reachable, guaranteed, avail, npcAvail } = c.ix;
      for (const uid of reachable) {
        const u = by.quests.get(uid);
        u.transitions.forEach((tr, i) => {
          const t = by.quests.get(tr.to);
          if (!t?.requires) return;
          // Що вже точно є в мить переходу: гарантовано завершене перед u, плюс сам u — лише якщо його ЗАВЕРШУЮТЬ.
          const done = new Set(guaranteed.get(uid));
          if (tr.on === 'complete') done.add(uid);
          const where = `${uid}.transitions[${i}]`;
          for (const r of t.requires.quests ?? []) {
            if (by.quests.has(r) && !done.has(r)) out.push(I('TRANSITION_REQUIRES_NOT_READY', where, `«${t.id}» вимагає квест «${r}», а в мить переходу з «${uid}» його ще не завершено`));
          }
          for (const it of t.requires.items ?? []) {
            if (!by.items.has(it)) continue;
            const fromReward = [...done].some((x) => by.quests.get(x)?.reward?.items?.some((ri) => ri.item === it));
            const fromWorld = [...by.locations.values()].some((l) => l.items?.includes(it) && avail(l, uid))
              || [...by.npcs.values()].some((n) => n.sells?.includes(it) && npcAvail(n, uid));
            if (!fromReward && !fromWorld) out.push(I('TRANSITION_REQUIRES_NOT_READY', where, `«${t.id}» вимагає предмет «${it}», якого в мить переходу з «${uid}» ще не можна мати (джерело відкривається пізніше або лише нагородою, якої тут немає)`));
          }
        });
      }
      return out;
    },
  },
  {
    id: 'reward-once',
    run(c) { // @check:reward-once
      const out = [];
      const seen = new Map();
      for (const [where, rw] of rewards(c.content)) {
        if (seen.has(rw.grantId)) out.push(I('REWARD_GRANT_DUPLICATE', where, `grantId «${rw.grantId}» уже видається в ${seen.get(rw.grantId)}`));
        else seen.set(rw.grantId, where);
      }
      for (const e of c.content.events ?? []) {
        if (e.repeatable && e.reward && e.reward.once !== true) out.push(I('REWARD_REPEATABLE_UNGUARDED', `${e.id}.reward`, 'повторювана подія з нагородою без once: true видасть її щоразу'));
      }
      return out;
    },
  },
  {
    id: 'locale-keys',
    run(c) { // @check:locale-keys
      const out = [];
      const keys = new Map();
      const add = (k, where) => { if (k !== undefined) keys.set(k, where); };
      const ct = c.content;
      for (const t of ['profiles', 'transports', 'animals', 'items', 'npcs', 'locations']) (ct[t] ?? []).forEach((e) => add(e.nameKey, e.id));
      for (const q of ct.quests ?? []) {
        add(q.titleKey, q.id);
        q.objectives.forEach((o) => add(o.textKey, `${q.id}/${o.id}`));
        q.transitions.forEach((t) => add(t.choiceKey, `${q.id}.transitions`));
      }
      (ct.events ?? []).forEach((e) => add(e.titleKey, e.id));
      (ct.facts ?? []).forEach((f) => add(f.claimKey, f.id));
      (ct.dialogues ?? []).forEach((d) => add(d.trigger?.titleKey, `${d.id}.trigger`));
      for (const d of ct.dialogues ?? []) for (const n of d.nodes) {
        add(n.textKey, `${d.id}/${n.id}`);
        (n.choices ?? []).forEach((ch, i) => add(ch.textKey, `${d.id}/${n.id}.choices[${i}]`));
      }
      if (ct.meta.locales.length === 0) out.push(I('LOCALE_MISSING', 'meta.locales', 'не задано жодної мови'));
      for (const lang of ct.meta.locales) {
        const table = ct.locales?.[lang];
        if (!table) { out.push(I('LOCALE_MISSING', `locales.${lang}`, 'немає файлу перекладу для підтримуваної мови')); continue; }
        for (const [k, where] of keys) {
          if (typeof table[k] !== 'string' || table[k].trim() === '') out.push(I('LOCALE_MISSING', where, `[${lang}] немає перекладу ключа «${k}»`));
        }
      }
      return out;
    },
  },
  {
    id: 'fact-source',
    run(c) { // @check:fact-source
      const out = [];
      for (const f of c.content.facts ?? []) {
        if (typeof f.source !== 'string' || f.source.trim() === '') out.push(I('FACT_SOURCE_MISSING', f.id, 'факт без джерела'));
        const d = f.checkedAt;
        const valid = typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && new Date(d + 'T00:00:00Z').toISOString().slice(0, 10) === d;
        if (!valid) out.push(I('FACT_DATE_INVALID', f.id, `дата перевірки «${d}» не є датою РРРР-ММ-ДД`));
        else if (d > c.today) out.push(I('FACT_DATE_INVALID', f.id, `дата перевірки ${d} у майбутньому (сьогодні ${c.today})`));
        if (!FACT_KINDS.includes(f.kind)) out.push(I('FACT_KIND_INVALID', f.id, `тип «${f.kind}» не з ${FACT_KINDS.join('|')}`));
      }
      return out;
    },
  },
  {
    // GAME-56: давно не звірений факт — попередження (FACT_STALE має severity 'warning').
    // Зламану, порожню чи майбутню дату вже звітує fact-source; тут лише давність.
    id: 'fact-stale',
    run(c) { // @check:fact-stale
      const out = [];
      const now = Date.parse(`${c.today}T00:00:00Z`);
      for (const f of c.content.facts ?? []) {
        const then = typeof f.checkedAt === 'string' ? Date.parse(`${f.checkedAt}T00:00:00Z`) : NaN;
        if (Number.isNaN(then)) continue;
        const age = Math.round((now - then) / 86_400_000);
        if (age > FACT_STALE_DAYS) out.push(I('FACT_STALE', f.id, `факт звірено ${age} дн. тому (поріг ${FACT_STALE_DAYS}) — перезвір джерело й онови checkedAt`));
      }
      return out;
    },
  },
  {
    id: 'reachable',
    run(c) { // @check:reachable
      const { by, reachable } = c.ix;
      return [...by.quests.keys()].filter((q) => !reachable.has(q)).map((q) => I('NODE_UNREACHABLE', q, 'недосяжний зі старту'));
    },
  },
  {
    id: 'path-to-end',
    run(c) { // @check:path-to-end
      const { by, edges } = c.ix;
      const rev = new Map([...by.quests.keys()].map((q) => [q, []]));
      for (const [u, ts] of edges) for (const t of ts) rev.get(t.to).push(u);
      const ok = new Set([...by.quests.values()].filter((q) => q.end).map((q) => q.id));
      const stack = [...ok];
      while (stack.length) for (const u of rev.get(stack.pop())) if (!ok.has(u)) { ok.add(u); stack.push(u); }
      return [...by.quests.keys()].filter((q) => !ok.has(q)).map((q) => I('NO_PATH_TO_END', q, 'звідси немає шляху до завершення'));
    },
  },
  {
    id: 'requires-deadlock',
    run(c) { // @check:requires-deadlock
      const { by } = c.ix;
      const next = (v) => (by.quests.get(v).requires?.quests ?? []).filter((x) => by.quests.has(x));
      return scc([...by.quests.keys()], next)
        .filter((comp) => isCycle(comp, next))
        .map((comp) => I('REQUIRES_CYCLE', comp.sort().join(' ⇄ '), 'квести вимагають один одного — жоден не почнеться'));
    },
  },
  {
    id: 'optional-decline',
    run(c) { // @check:optional-decline
      return [...c.ix.by.quests.values()]
        .filter((q) => q.optional && !q.end && !q.transitions.some((t) => t.on === 'decline'))
        .map((q) => I('OPTIONAL_NO_DECLINE', q.id, 'необов\u2019язковий квест без переходу «відмова»'));
    },
  },
  {
    id: 'branch-next',
    run(c) { // @check:branch-next
      return [...c.ix.by.quests.values()]
        .filter((q) => !q.end && q.transitions.length === 0)
        .map((q) => I('BRANCH_NO_NEXT', q.id, 'не кінець і не має наступного етапу'));
    },
  },
  // ---------- діалоги (GAME-28) ----------
  {
    id: 'roads',
    run(c) { // @check:roads
      // GAME-31. Рух між локаціями — найкоротшою дорогою для транспорту гравця (src/core/story.ts, route).
      // Крізь замкнену локацію проїхати можна (зупинитись — ні), тож замки тут не рахуються: досить, щоб
      // граф доріг кожного транспорту був сильно зв'язним. Доріг немає зовсім — моделі подорожі ще немає.
      const roads = c.content.roads ?? [];
      if (roads.length === 0) return [];
      const out = [];
      const locs = (c.content.locations ?? []).map((l) => l.id);
      const known = new Set(locs);
      const seenPair = new Set();
      for (const r of roads) {
        if (r.from === r.to) { out.push(I('ROAD_SELF_LOOP', r.id, `дорога з «${r.from}» у саму себе`)); continue; }
        for (const [a, b] of r.twoWay ? [[r.from, r.to], [r.to, r.from]] : [[r.from, r.to]]) {
          const k = `${a}>${b}`;
          if (seenPair.has(k)) out.push(I('ROAD_DUPLICATE', r.id, `ребро ${a} → ${b} уже задано іншою дорогою`));
          seenPair.add(k);
        }
        // SIM-TRAVEL-003: поки немає доходу й економіки (GAME-47/71), платна дорога — грошовий тупик
        // (катаєшся туди-сюди до нуля й не доїжджаєш). Ядро гроші за дорогу вміє; вмикати — з економікою.
        r.ways.forEach((w, i) => { if (w.cents > 0) out.push(I('ROAD_PAID_NO_ECONOMY', `${r.id}.ways[${i}]`, `${w.cents} центів: платних доріг не можна, доки в грі немає доходу (SIM-TRAVEL-003)`)); });
      }
      const startQuest = (c.content.quests ?? []).find((q) => q.id === c.content.meta.start);
      // Без місця старту перша дорога миттєва й безкоштовна з «ніде» — граф доріг тоді нічого не означає.
      if (!startQuest?.locationId) { out.push(I('ROAD_NO_HOME', 'meta.start', 'є дороги, але стартовий квест не має locationId — звідки гравець їде вперше?')); return out; }
      const home = startQuest.locationId;
      if (!known.has(home)) return out; // першопричину назвав REF_MISSING
      // Лише транспорти, які гравець справді може обрати (комбінації); недоступний нікому — не вимога.
      const transports = [...new Set(enumerateCombos(c.content).map((k) => k.transport))];
      for (const tr of transports) {
        const next = new Map(locs.map((l) => [l, []]));
        const prev = new Map(locs.map((l) => [l, []]));
        for (const r of roads) {
          if (tr !== null && !r.ways.some((w) => w.transport === tr)) continue;
          for (const [a, b] of r.twoWay ? [[r.from, r.to], [r.to, r.from]] : [[r.from, r.to]]) {
            if (!known.has(a) || !known.has(b)) continue; // першопричину назвав REF_MISSING
            next.get(a).push(b);
            prev.get(b).push(a);
          }
        }
        const closure = (adj) => {
          const seen = new Set([home]);
          const stack = [home];
          for (let v = stack.pop(); v !== undefined; v = stack.pop()) for (const u of adj.get(v) ?? []) if (!seen.has(u)) { seen.add(u); stack.push(u); }
          return seen;
        };
        const there = closure(next);
        const back = closure(prev);
        const how = tr === null ? '' : ` (${tr})`;
        for (const l of locs) {
          if (!there.has(l)) out.push(I('ROAD_UNREACHABLE', l, `від «${home}» дорогами не доїхати${how}`));
          else if (!back.has(l)) out.push(I('ROAD_NO_RETURN', l, `звідси дорогами не повернутись до «${home}»${how}`));
        }
      }
      return out;
    },
  },
  {
    id: 'dialogue-refs',
    run(c) { // @check:dialogue-refs
      const out = [];
      const { by } = c.ix;
      const miss = (where, msg) => out.push(I('DIALOGUE_REF_MISSING', where, msg));
      for (const d of c.content.dialogues ?? []) {
        const nodes = new Set(d.nodes.map((n) => n.id));
        if (d.npcId !== undefined && !by.npcs.has(d.npcId)) miss(`${d.id}.npcId`, `NPC «${d.npcId}» не існує`);
        (d.trigger?.at ?? []).forEach((l, i) => { if (!by.locations.has(l)) miss(`${d.id}.trigger.at[${i}]`, `локації «${l}» не існує`); });
        if (!nodes.has(d.start)) miss(`${d.id}.start`, `вузла «${d.start}» немає`);
        for (const n of d.nodes) {
          if (n.next !== undefined && !nodes.has(n.next)) miss(`${d.id}/${n.id}.next`, `вузла «${n.next}» немає`);
          (n.choices ?? []).forEach((ch, i) => { if (!nodes.has(ch.next)) miss(`${d.id}/${n.id}.choices[${i}].next`, `вузла «${ch.next}» немає`); });
        }
      }
      for (const [where, leaf] of condLeavesAll(c.content)) {
        if (leaf.quest !== undefined && !by.quests.has(leaf.quest)) miss(where, `квесту «${leaf.quest}» не існує`);
        if (leaf.transport !== undefined && !by.transports.has(leaf.transport)) miss(where, `транспорту «${leaf.transport}» не існує`);
      }
      for (const [where, e] of dialogueEffects(c.content)) {
        if (e.startQuest !== undefined && !by.quests.has(e.startQuest)) miss(where, `квесту «${e.startQuest}» не існує`);
        const co = e.completeObjective;
        if (co && !by.quests.has(co.quest)) miss(where, `квесту «${co.quest}» не існує`);
        else if (co && !by.quests.get(co.quest).objectives.some((o) => o.id === co.objective)) miss(where, `у квесті «${co.quest}» немає цілі «${co.objective}»`);
      }
      return out;
    },
  },
  {
    id: 'dialogue-reachable',
    run(c) { // @check:dialogue-reachable
      const out = [];
      for (const d of c.content.dialogues ?? []) {
        const nodes = new Map(d.nodes.map((n) => [n.id, n]));
        if (!nodes.has(d.start)) continue; // першопричину вже назвав DIALOGUE_REF_MISSING
        const seen = new Set([d.start]);
        const stack = [d.start];
        while (stack.length) {
          for (const v of exits(nodes.get(stack.pop()), false)) if (nodes.has(v) && !seen.has(v)) { seen.add(v); stack.push(v); }
        }
        for (const n of d.nodes) if (!seen.has(n.id)) out.push(I('DIALOGUE_NODE_UNREACHABLE', `${d.id}/${n.id}`, `вузол недосяжний зі старту «${d.start}»`));
      }
      return out;
    },
  },
  {
    id: 'dialogue-dead-end',
    run(c) { // @check:dialogue-dead-end
      // Вихід гарантований лише безумовними переходами: умовний вибір може не показатись,
      // і гравець застрягне в розмові. Ціна хибного спрацювання — додати безумовний вибір
      // навіть там, де умови взаємовиключні й покривають усе (flag / notFlag).
      const out = [];
      for (const d of c.content.dialogues ?? []) {
        const rev = new Map(d.nodes.map((n) => [n.id, []]));
        for (const n of d.nodes) for (const v of exits(n, true)) if (rev.has(v)) rev.get(v).push(n.id);
        const ok = new Set(d.nodes.filter((n) => n.end === true).map((n) => n.id));
        const stack = [...ok];
        while (stack.length) for (const u of rev.get(stack.pop())) if (!ok.has(u)) { ok.add(u); stack.push(u); }
        for (const n of d.nodes) {
          if (ok.has(n.id)) continue;
          const why = exits(n, false).length === 0 ? 'вузол без виходу і не end'
            : exits(n, true).length === 0 ? 'усі виходи умовні — гравець може застрягти'
              : 'безумовні виходи не ведуть до жодного end';
          out.push(I('DIALOGUE_DEAD_END', `${d.id}/${n.id}`, why));
        }
      }
      return out;
    },
  },
  {
    id: 'dialogue-flags',
    run(c) { // @check:dialogue-flags
      // Прапорець «ставиться», лише якщо його сетер може спрацювати — нерухома точка settable() (нижче).
      // notFlag, quest і transport вважаються здійсненними (стан квесту й транспорт стереже інше),
      // окрім notFlag, що суперечить flag у тому самому all.
      const { set } = settable(c);
      const choices = dialogueChoices(c.content);
      const out = [];
      for (const [where, leaf] of condLeavesAll(c.content)) {
        const f = leaf.flag !== undefined ? leaf.flag : leaf.notFlag;
        if (f !== undefined && !set.has(f)) out.push(I('DIALOGUE_FLAG_NEVER_SET', where, `умова читає прапорець «${f}», який жоден здійсненний ефект не ставить`));
      }
      for (const [where, ch] of choices) {
        if (!ch.when) continue;
        for (const f of contradictions(ch.when)) out.push(I('DIALOGUE_COND_CONTRADICTION', `${where}.when`, `all вимагає водночас «так» і «ні» для «${f}» (flag/notFlag чи remembers/notRemembers) — вибір не покажеться ніколи`));
      }
      return out;
    },
  },
  {
    id: 'dialogue-memory',
    run(c) { // @check:dialogue-memory
      // GAME-48: пам'ять NPC — його власна. Умова remembers/notRemembers читає пам'ять NPC, чия це
      // розмова; поставити факт може лише здійсненний remember у розмові з ТИМ САМИМ NPC (нерухома
      // точка спільна з прапорцями: settable). Як і в прапорців, notRemembers на факт, якого ніхто не
      // ставить, — одруківка, а не «завжди так».
      const { mem } = settable(c);
      const out = [];
      for (const [where, leaf, d] of condLeavesAll(c.content)) {
        const f = leaf.remembers !== undefined ? leaf.remembers : leaf.notRemembers;
        if (f !== undefined && !mem(d.npcId).has(f)) out.push(I('MEMORY_NEVER_SET', where, d.npcId === undefined ? `подія в дорозі читає пам\u2019ять «${f}», а NPC у неї немає — ніхто нічого не пам\u2019ятає` : `умова читає факт «${f}», який жоден здійсненний remember у розмові з «${d.npcId}» не ставить`));
      }
      return out;
    },
  },
  {
    id: 'dialogue-owner',
    run(c) { // @check:dialogue-owner
      // GAME-31: подія в дорозі — діалог без NPC, що відкривається сам після приїзду (ядро: RoadEvent).
      const out = [];
      for (const d of c.content.dialogues ?? []) {
        if ((d.npcId === undefined) === (d.trigger === undefined)) out.push(I('DIALOGUE_OWNER', d.id, d.npcId === undefined ? 'немає ні npcId, ні trigger — діалог ніхто не відкриє' : 'і npcId, і trigger — незрозуміло, хто відкриває'));
        if (d.trigger === undefined) continue;
        // Лише setFlag: старт чи закриття квесту з події поставили б сюжет на везіння (SIM-EV-003), а
        // перевірки dialogue-quest-gate/objective-kind міркують через доступність NPC, якого в події немає.
        for (const n of d.nodes) (n.choices ?? []).forEach((ch, i) => (ch.effects ?? []).forEach((e) => {
          if (e.setFlag === undefined) out.push(I('EVENT_EFFECT_UNSUPPORTED', `${d.id}/${n.id}.choices[${i}].effects`, `подія в дорозі може лише ставити прапорці, а тут ${Object.keys(e)[0]}`));
        }));
      }
      return out;
    },
  },
  {
    id: 'dialogue-npc-unique',
    run(c) { // @check:dialogue-npc-unique
      // Один діалог на NPC: рушій запускає діалог за npcId, і двом кандидатам немає правила вибору.
      const out = [];
      const seen = new Map();
      for (const d of c.content.dialogues ?? []) {
        if (d.npcId === undefined) continue; // подія в дорозі — не розмова
        if (seen.has(d.npcId)) out.push(I('DIALOGUE_NPC_DUPLICATE', `${d.id}.npcId`, `NPC «${d.npcId}» уже має діалог «${seen.get(d.npcId)}»`));
        else seen.set(d.npcId, d.id);
      }
      return out;
    },
  },
  {
    id: 'dialogue-objective-kind',
    run(c) { // @check:dialogue-objective-kind
      // Розмова закриває лише ціль «поговорити» з тим самим NPC. visit/collect/deliver закриває
      // сам світ (локація, предмет), а розмова з іншим NPC — обхід цілі.
      const out = [];
      const { by } = c.ix;
      for (const [where, ch, d] of dialogueChoices(c.content)) {
        for (const e of ch.effects ?? []) {
          const co = e.completeObjective;
          const o = co && by.quests.get(co.quest)?.objectives.find((x) => x.id === co.objective);
          if (!o) continue; // відсутній квест чи ціль уже назвав DIALOGUE_REF_MISSING
          if (o.kind !== 'talk') out.push(I('DIALOGUE_OBJECTIVE_KIND', `${where}.effects`, `ціль «${co.quest}/${co.objective}» має kind «${o.kind}», а розмова закриває лише talk`));
          // Неіснуючого NPC цілі чи діалогу вже назвали REF_MISSING / DIALOGUE_REF_MISSING — лише першопричина.
          else if (o.target !== d.npcId && by.npcs.has(o.target) && by.npcs.has(d.npcId)) out.push(I('DIALOGUE_OBJECTIVE_KIND', `${where}.effects`, `ціль «${co.quest}/${co.objective}» — розмова з «${o.target}», а цей діалог належить «${d.npcId}»`));
        }
      }
      return out;
    },
  },
  {
    id: 'dialogue-quest-gate',
    run(c) { // @check:dialogue-quest-gate
      // startQuest не сміє обійти requires.quests квесту-цілі. Кожну вимогу r має гарантувати або
      // сам вибір (when містить {quest:r, status:'completed'} як кон'юнкт), або доступність NPC:
      // на КОЖНОМУ етапі, де NPC доступний (npcAvail), завершення r гарантоване (guaranteed).
      const out = [];
      // Рецензія GAME-29: requires.items теж — інакше ядро не стартує квест, а гравець цього не бачить.
      // Предмет умовою вибору не виразиш, тож його має гарантувати кожен етап, де NPC доступний.
      // (Обмеження: when квесту-цілі за комбінацією тут не враховано — dialogue-* не в PER_COMBO.)
      const { by, reachable, guaranteed, npcAvail, itemGuaranteedAt } = c.ix;
      for (const [where, ch, d] of dialogueChoices(c.content)) {
        const npc = by.npcs.get(d.npcId);
        if (!npc) continue; // відсутнього NPC уже назвав DIALOGUE_REF_MISSING
        const stages = [...reachable].filter((q) => npcAvail(npc, q));
        for (const e of ch.effects ?? []) {
          const target = e.startQuest !== undefined ? by.quests.get(e.startQuest) : undefined;
          if (!target) continue;
          for (const r of target.requires?.quests ?? []) {
            if (ch.when && conjuncts(ch.when).some((x) => x.quest === r && x.status === 'completed')) continue;
            const open = stages.filter((q) => !guaranteed.get(q).has(r));
            if (open.length) out.push(I('DIALOGUE_QUEST_GATE', `${where}.effects`, `startQuest «${target.id}» вимагає завершеного «${r}», а NPC «${d.npcId}» доступний і там, де воно не гарантоване (${open.sort().join(', ')}); додай when { quest: «${r}», status: completed } або відкривай NPC пізніше`));
          }
          for (const it of target.requires?.items ?? []) {
            if (!by.items.has(it)) continue;
            const open = stages.filter((q) => !itemGuaranteedAt(it, q));
            if (open.length) out.push(I('DIALOGUE_QUEST_GATE', `${where}.effects`, `startQuest «${target.id}» вимагає предмет «${it}», а NPC «${d.npcId}» доступний і там, де його ще не можна мати (${open.sort().join(', ')}); відкривай NPC пізніше`));
          }
        }
      }
      return out;
    },
  },
  {
    id: 'combo-options',
    run(c) { // @check:combo-options
      return checkOptions(c.content, whens(c.content));
    },
  },
  {
    id: 'combos',
    run(c) { // @check:combos
      return checkCombos(c.content, { buildIndex, checks: CHECKS.filter((k) => PER_COMBO.includes(k.id)), today: c.today });
    },
  },
];

function whens(content) {
  const out = [];
  for (const t of ['npcs', 'locations']) for (const e of content[t] ?? []) if (e.when) out.push([e.id, e.when]);
  for (const q of content.quests ?? []) {
    if (q.when) out.push([q.id, q.when]);
    // Третій елемент — умова квесту: ціль і перехід живуть лише там, де живе їхній квест.
    for (const o of q.objectives) if (o.when) out.push([`${q.id}/${o.id}`, o.when, q.when]);
    q.transitions.forEach((t, i) => t.when && out.push([`${q.id}.transitions[${i}]`, t.when, q.when, 'transition']));
  }
  return out;
}

// Виходи вузла діалогу. onlyUnconditional — лише ті, що доступні завжди (next або вибір без when).
function exits(n, onlyUnconditional) {
  const out = n.next !== undefined ? [n.next] : [];
  for (const ch of n.choices ?? []) if (!onlyUnconditional || !ch.when) out.push(ch.next);
  return out;
}

function condLeaves(cond, out = []) {
  if (cond.all) cond.all.forEach((x) => condLeaves(x, out));
  else if (cond.any) cond.any.forEach((x) => condLeaves(x, out));
  else out.push(cond);
  return out;
}

// Кон'юнкти умови: вкладені all розгортаються, решта (лист чи any) — як є.
function conjuncts(cond) {
  return cond.all ? cond.all.flatMap(conjuncts) : [cond];
}

// Прапорці, через суперечність яких (all вимагає водночас flag і notFlag) умова НЕ справдиться ніколи —
// навіть якщо всі прапорці можна поставити. Суперечність в одній гілці any, коли інша гілка жива, —
// не «вибір не покажеться ніколи» (знайдено перехресною перевіркою з ядром, semantics.test, 23.10:
// раніше така умова червоніла й блокувала здійсненний контент).
export function contradictions(cond) {
  const every = new Set(condLeaves(cond).flatMap((x) => [x.flag, x.notFlag]).filter((f) => f !== undefined));
  const facts = new Set(condLeaves(cond).flatMap((x) => [x.remembers, x.notRemembers]).filter((f) => f !== undefined));
  return satisfiable(cond, every, facts) ? new Set() : conflicts(cond);
}

// Усі пари flag/notFlag того самого прапорця (і remembers/notRemembers того самого факту) в одному all
// (і в any всередині) — сирий перелік.
function conflicts(cond, out = new Set()) {
  if (cond.any) { cond.any.forEach((x) => conflicts(x, out)); return out; }
  if (!cond.all) return out;
  const cj = conjuncts(cond);
  const yes = new Set(cj.filter((x) => x.flag !== undefined).map((x) => x.flag));
  const kept = new Set(cj.filter((x) => x.remembers !== undefined).map((x) => x.remembers));
  for (const x of cj) {
    if (x.notFlag !== undefined && yes.has(x.notFlag)) out.add(x.notFlag);
    if (x.notRemembers !== undefined && kept.has(x.notRemembers)) out.add(x.notRemembers);
    if (x.any) conflicts(x, out);
  }
  return out;
}

// Чи може умова справдитись, якщо поставлені прапорці known (а решта — ні або пізніше).
// remembered — факти, які може пам'ятати NPC цієї розмови (GAME-48).
export function satisfiable(cond, known, remembered = NONE) {
  if (cond.any) return cond.any.some((x) => satisfiable(x, known, remembered));
  if (cond.all) {
    const cj = conjuncts(cond);
    const yes = new Set(cj.filter((x) => x.flag !== undefined).map((x) => x.flag));
    if (cj.some((x) => x.notFlag !== undefined && yes.has(x.notFlag))) return false;
    const kept = new Set(cj.filter((x) => x.remembers !== undefined).map((x) => x.remembers));
    if (cj.some((x) => x.notRemembers !== undefined && kept.has(x.notRemembers))) return false;
    return cj.every((x) => satisfiable(x, known, remembered));
  }
  if (cond.flag !== undefined) return known.has(cond.flag);
  if (cond.remembers !== undefined) return remembered.has(cond.remembers);
  return true; // notFlag, notRemembers, quest, transport
}

const NONE = new Set();

// Нерухома точка: що можна поставити (прапорці, глобальні) і запам'ятати (пам'ять — окремо в кожного
// NPC) хоч в одному проходженні. Спершу ефекти виборів без when; далі — ефекти умовного вибору, коли
// його умова здійсненна за вже відомих прапорців і пам'яті ЦЬОГО NPC. Прапорці ставлять лише ефекти
// setFlag у діалогах (у quests.json ефектів поки немає — з'являться, додай їх у початкову множину);
// прапорець «подія була» (f.seen-<назва>) ставить ядро саме, коли подія відкривається (GAME-31).
// Пам'ять — лише remember у розмові з NPC; подія в дорозі NPC не має, тож нічого не запам'ятовує.
function settable(c) {
  const set = new Set((c.content.dialogues ?? []).filter((d) => d.trigger).map((d) => `f.seen-${d.id.replace(/^dlg\./, '')}`));
  const memory = new Map();
  const mem = (npc) => memory.get(npc) ?? NONE;
  const choices = dialogueChoices(c.content);
  for (let grew = true; grew;) {
    grew = false;
    for (const [, ch, d] of choices) {
      if (ch.when && !satisfiable(ch.when, set, mem(d.npcId))) continue;
      for (const e of ch.effects ?? []) {
        if (e.setFlag !== undefined && !set.has(e.setFlag)) { set.add(e.setFlag); grew = true; }
        if (e.remember !== undefined && d.npcId !== undefined && !mem(d.npcId).has(e.remember)) { memory.set(d.npcId, new Set([...mem(d.npcId), e.remember])); grew = true; }
      }
    }
  }
  return { set, mem };
}

// [where, choice, dialogue] для кожного вибору кожного діалогу.
function dialogueChoices(content) {
  const out = [];
  for (const d of content.dialogues ?? []) for (const n of d.nodes) {
    (n.choices ?? []).forEach((ch, i) => out.push([`${d.id}/${n.id}.choices[${i}]`, ch, d]));
  }
  return out;
}

function condLeavesAll(content) {
  const out = [];
  for (const d of content.dialogues ?? []) for (const n of d.nodes) {
    (n.choices ?? []).forEach((ch, i) => { if (ch.when) for (const leaf of condLeaves(ch.when)) out.push([`${d.id}/${n.id}.choices[${i}].when`, leaf, d]); });
  }
  return out;
}

function dialogueEffects(content) {
  const out = [];
  for (const d of content.dialogues ?? []) for (const n of d.nodes) {
    (n.choices ?? []).forEach((ch, i) => (ch.effects ?? []).forEach((e) => out.push([`${d.id}/${n.id}.choices[${i}].effects`, e])));
  }
  return out;
}

function flagUses(content) {
  const out = [];
  for (const [where, leaf] of condLeavesAll(content)) { const f = leaf.flag ?? leaf.notFlag; if (f !== undefined) out.push([where, f]); }
  for (const [where, e] of dialogueEffects(content)) if (e.setFlag !== undefined) out.push([where, e.setFlag]);
  return out;
}

function memoryUses(content) {
  const out = [];
  for (const [where, leaf] of condLeavesAll(content)) { const f = leaf.remembers ?? leaf.notRemembers; if (f !== undefined) out.push([where, f]); }
  for (const [where, e] of dialogueEffects(content)) if (e.remember !== undefined) out.push([where, e.remember]);
  return out;
}

function rewards(content) {
  const out = [];
  for (const q of content.quests ?? []) if (q.reward) out.push([`${q.id}.reward`, q.reward]);
  for (const e of content.events ?? []) if (e.reward) out.push([`${e.id}.reward`, e.reward]);
  return out;
}

// Схема йде першою: якщо форма зламана, змістові перевірки не запускаються,
// бо на кривих даних вони або впадуть, або збрешуть.
/** Справжня календарна дата YYYY-MM-DD (не 2026-02-30). */
const isIsoDay = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)
  && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;

export function validate(content, { today }) {
  // Без «сьогодні» давність і майбутні дати фактів мовчки вимикаються (NaN > 365 — завжди false) — це збій, не PASS (закон 4).
  if (!isIsoDay(today)) return [I('INTERNAL_ERROR', 'today', `«сьогодні» не дата YYYY-MM-DD: ${JSON.stringify(today)}`)];
  const ctx = { content, today, ix: null };
  const issues = [];
  const runOne = (chk) => {
    try { return chk.run(ctx); }
    catch (e) { return [I('INTERNAL_ERROR', chk.id, `перевірка впала: ${e.message}`)]; }
  };
  const [schema, ...rest] = CHECKS;
  issues.push(...runOne(schema));
  if (issues.length) return issues;
  try { ctx.ix = buildIndex(content); }
  catch (e) { return [I('INTERNAL_ERROR', 'buildIndex', e.message)]; }
  const LATE = ['combo-options', 'combos'];
  for (const chk of rest) if (!LATE.includes(chk.id)) issues.push(...runOne(chk));
  // Комбінації — лише на контенті, чистому в цілому: на зламаних посиланнях вони дублюють і
  // затуляють першопричину. Ціна: дефект комбінації видно після виправлення загального.
  // Обидві пізні перевірки біжать разом: знахідка однієї не ховає знахідку іншої.
  // Попередження (GAME-56) не бруднять контент: застарілий факт не вимикає перевірку комбінацій.
  const clean = issues.every((i) => isWarning(i.code));
  for (const id of LATE) if (clean) issues.push(...runOne(rest.find((chk) => chk.id === id)));
  return issues;
}
