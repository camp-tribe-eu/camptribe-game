// Перевірки контенту. Кожна перевірка позначена маркером `// @check:<id>` у першому рядку тіла:
// scripts/mutate-validator.mjs вставляє після нього `return [];` і доводить, що самотест червоніє.
// Не прибирай і не дублюй маркери — мутаційний прогін звіряє їх із реєстром CHECKS.

import { checkSchema } from './schema.mjs';
import { FACT_KINDS } from './codes.mjs';
import { checkCombos, checkUnusable, NO_ANIMAL } from './combos.mjs';

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
};
const GRANT_ID = /^rw\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const OBJECTIVE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TARGET_TYPE = { talk: 'npcs', visit: 'locations', collect: 'items', deliver: 'items' };
const WHEN_TYPE = { profiles: 'profiles', transports: 'transports', animals: 'animals' };
// Перевірки, що проганяються окремо для кожної комбінації профіль × транспорт × тварина.
const PER_COMBO = ['objective-completable', 'cycle-exit', 'main-gate', 'path-to-end', 'optional-decline', 'branch-next'];

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
      for (const [where, rw] of rewards(c.content)) (rw.items ?? []).forEach((i) => ref('items', i.item, where));
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
  {
    id: 'combo-options',
    run(c) { // @check:combo-options
      return checkUnusable(c.content);
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
    for (const o of q.objectives) if (o.when) out.push([`${q.id}/${o.id}`, o.when]);
    q.transitions.forEach((t, i) => t.when && out.push([`${q.id}.transitions[${i}]`, t.when]));
  }
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
export function validate(content, { today }) {
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
  for (const chk of rest) if (chk.id !== 'combos') issues.push(...runOne(chk));
  // Комбінації — лише на контенті, чистому в цілому: на зламаних посиланнях вони дублюють і
  // затуляють першопричину. Ціна: дефект комбінації видно після виправлення загального.
  const combos = rest.find((chk) => chk.id === 'combos');
  if (issues.length === 0) issues.push(...runOne(combos));
  return issues;
}
