#!/usr/bin/env node
// Мутаційний прогін: доводить, що самотест ловить поломку КОЖНОЇ перевірки.
// Закон «Зелене нічого не доводить, поки не почервоніло»: мутація ламає рівно одне місце,
// самотест мусить упасти саме як самотест (рядок «SELF-TEST: FAILED»), а не як зламаний модуль.
//
//   node scripts/mutate-validator.mjs
//
// Мутації робляться в тимчасовій КОПІЇ scripts/, оригінал не чіпається.

import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { CHECKS } from './validator/checks.mjs';
import { cli } from './lib/cli.mjs';

cli();

const scripts = dirname(fileURLToPath(import.meta.url));
const CHECKS_FILE = 'validator/checks.mjs';
const COMBOS_FILE = 'validator/combos.mjs';

// 1. Вимкнення кожної перевірки цілком. 2. Точкові мутації логіки, де помилка найдорожча.
const mutations = [
  ...CHECKS.map((c) => ({ name: `вимкнено перевірку ${c.id}`, file: CHECKS_FILE, from: `// @check:${c.id}\n`, to: `// @check:${c.id}\n      return [];\n` })),
  { name: 'відмова рахується як завершення', file: CHECKS_FILE, from: "u === X && tr.on === 'complete'", to: 'u === X' },
  { name: 'transition-gate: джерело зараховано й при відмові', file: CHECKS_FILE, from: "if (tr.on === 'complete') done.add(uid);", to: 'done.add(uid);' },
  { name: 'transition-gate: локація рахується відкритою на вході в ціль, а не на джерелі', file: CHECKS_FILE, from: 'l.items?.includes(it) && avail(l, uid)', to: 'l.items?.includes(it) && avail(l, tr.to)' },
  { name: 'transition-gate: перевіряються лише основні цілі', file: CHECKS_FILE, from: "if (!t?.requires) return;", to: "if (!t?.requires || t.optional) return;" },
  { name: 'transition-gate: NPC рахується відкритим на вході в ціль', file: CHECKS_FILE, from: 'n.sells?.includes(it) && npcAvail(n, uid)', to: 'n.sells?.includes(it) && npcAvail(n, tr.to)' },
  { name: 'dialogue-quest-gate: requires.items не перевіряються', file: CHECKS_FILE, from: 'const open = stages.filter((q) => !itemGuaranteedAt(it, q));', to: 'const open = [];' },
  { name: 'unlockedBy ігнорується', file: CHECKS_FILE, from: '!ent.unlockedBy || guaranteed', to: 'true || guaranteed' },
  { name: 'нагорода будь-якого квесту вважається гарантованою', file: CHECKS_FILE, from: 'for (const X of guaranteed.get(q)) if (Q.get(X)', to: 'for (const X of Q.keys()) if (Q.get(X)' },
  { name: 'петля на себе не вважається циклом', file: CHECKS_FILE, from: 'comp.length > 1 || next(comp[0]).includes(comp[0])', to: 'comp.length > 1' },
  { name: 'необов\u2019язкова ціль теж перевіряється', file: CHECKS_FILE, from: 'if (!o.required) continue;', to: '' },
  { name: 'схемні помилки не зупиняють змістові перевірки', file: CHECKS_FILE, from: 'if (issues.length) return issues;', to: '' },
  { name: 'NOT_RUN видається як OK', file: 'validator/load.mjs', from: "return { status: 'NOT_RUN'", to: "return { status: 'OK'" },
  { name: 'порожній контент вважається нормою', file: 'validator/load.mjs', from: '|| content.quests.length === 0', to: '' },
  { name: 'комбінації запускаються й на брудному контенті', file: CHECKS_FILE, from: 'for (const id of LATE) if (clean) issues.push', to: 'for (const id of LATE) issues.push' },
  { name: 'пізні перевірки знову ховають одна одну', file: CHECKS_FILE, from: 'for (const id of LATE) if (clean)', to: 'for (const id of LATE) if (issues.length === 0)' },
  { name: 'умова квесту-джерела переходу не враховується', file: COMBOS_FILE, from: 'const conds = [q.when, t.when,', to: 'const conds = [t.when,' },
  { name: 'переходи без власного when не перевіряються', file: COMBOS_FILE, from: 'if (conds.some(Boolean) && dead(conds))', to: 'if (t.when && dead(conds))' },
  { name: 'переходи мертвого квесту дублюють його звіт', file: COMBOS_FILE, from: 'if (deadQuest(q.id) || deadQuest(t.to)) return;', to: '' },
  { name: 'цілі мертвого квесту дублюють його звіт', file: COMBOS_FILE, from: 'if (parent && dead([parent])) continue;', to: '' },
  { name: 'звірка count послаблена до «не менше»', file: 'validator/self-test.mjs', from: 'return n === f.count.n ? null', to: 'return n >= f.count.n ? null' },
  { name: 'judge схлопує знахідки до однієї на код перед звіркою count', file: 'validator/self-test.mjs', from: 'const cmis = countMismatch(f, issues);', to: 'const cmis = countMismatch(f, [...new Map(issues.map((i) => [i.code, i])).values()]);' },
  { name: 'звірка count вимкнена', file: 'validator/self-test.mjs', from: 'const cmis = countMismatch(f, issues);', to: 'const cmis = null;' },
  { name: 'умова квесту-цілі переходу не враховується', file: COMBOS_FILE, from: 'quests.get(t.to)?.when]', to: ']' },
  { name: 'when на переходах ігнорується', file: COMBOS_FILE, from: 'matches(t.when, k) && ids.has(t.to)', to: 'ids.has(t.to)' },
  { name: 'NPC і локації поза комбінацією доступні', file: COMBOS_FILE, from: ': { ...strip(e), unlockedBy: NEVER }', to: ': strip(e)' },
  { name: 'перебирається лише перша комбінація', file: COMBOS_FILE, from: 'for (const k of all) {', to: 'for (const k of all.slice(0, 1)) {' },
  { name: 'комбінації без тварини пропущено', file: COMBOS_FILE, from: '[NO_ANIMAL, ...ids(\'animals\')]', to: 'ids(\'animals\')' },
  { name: 'недосяжні в комбінації квести не відсікаються', file: COMBOS_FILE, from: '(!keep || keep.has(q.id))', to: 'true' },
  { name: 'обмеження транспорту профілю ігнорується', file: COMBOS_FILE, from: "if (!allows('profiles', profile, transport)) continue;", to: '' },
  { name: 'обмеження транспорту тварини ігнорується', file: COMBOS_FILE, from: "if (allows('animals', animal, transport)) out.push", to: 'out.push' },
  { name: 'when без жодної дозволеної комбінації пропускається', file: COMBOS_FILE, from: "if (!all.some((k) => matches(w, k) && matches(parent, k))) out.push", to: 'if (false) out.push' },
  { name: 'умова квесту не успадковується ціллю', file: COMBOS_FILE, from: '&& matches(parent, k)', to: '' },
  { name: 'combo-options біжить і на брудному контенті', file: CHECKS_FILE, from: "const LATE = ['combo-options', 'combos'];", to: "const LATE = ['combos'];" },
  // діалоги (GAME-28)
  { name: '[діалог] умовний вибір рахується як гарантований вихід', file: CHECKS_FILE, from: 'if (!onlyUnconditional || !ch.when) out.push', to: 'out.push' },
  { name: '[діалог] умови всередині any не перевіряються', file: CHECKS_FILE, from: 'else if (cond.any) cond.any.forEach((x) => condLeaves(x, out));', to: 'else if (cond.any) {}' },
  { name: '[діалог] notFlag не перевіряється на прапорці', file: CHECKS_FILE, from: 'leaf.flag !== undefined ? leaf.flag : leaf.notFlag', to: 'leaf.flag' },
  { name: '[діалог] ефекти completeObjective не звіряються з цілями', file: CHECKS_FILE, from: '.objectives.some((o) => o.id === co.objective)', to: '.objectives.some(() => true)' },
  { name: '[діалог] ключі реплік не йдуть у перевірку локалізації', file: CHECKS_FILE, from: 'add(n.textKey, `${d.id}/${n.id}`);', to: '' },
  { name: '[діалог] union приймає два дискримінатори', file: 'validator/schema.mjs', from: 'if (keys.length !== 1) {', to: 'if (keys.length === 0) {' },
  { name: '[діалог] вузол може мати і next, і choices', file: 'validator/schema.mjs', from: 'if (ways > 1) out.push', to: 'if (ways > 3) out.push' },
  { name: '[діалог] тека dialogue/ не читається', file: 'validator/load.mjs', from: 'content.dialogues.push(v);', to: '' },
  { name: '[діалог] недосяжність не рахує старт', file: CHECKS_FILE, from: 'const seen = new Set([d.start]);', to: 'const seen = new Set();' },
  // діалоги, рецензія GAME-28: кожна гілка, яку самотест раніше не вмів почервонити
  { name: '[діалог] next вузла не звіряється з вузлами', file: CHECKS_FILE, from: 'if (n.next !== undefined && !nodes.has(n.next)) miss(', to: 'if (false) miss(' },
  { name: '[діалог] completeObjective на неіснуючий квест не звіряється', file: CHECKS_FILE, from: 'if (co && !by.quests.has(co.quest)) miss(where, `квесту «${co.quest}» не існує`);', to: 'if (false) {}' },
  { name: '[діалог] формат id вузла не перевіряється', file: CHECKS_FILE, from: 'if (!OBJECTIVE_ID.test(n.id)) out.push', to: 'if (false) out.push' },
  { name: '[діалог] тека x.json у dialogue/ читається як файл', file: 'validator/load.mjs', from: ' || statSync(join(dlgDir, name)).isDirectory()', to: '' },
  { name: '[діалог] назва файлу не звіряється з id', file: 'validator/load.mjs', from: "if (typeof v?.id === 'string' && v.id !== want) issues.push", to: 'if (false) issues.push' },
  { name: '[діалог] схема діалогу без раннього виходу на зламаній формі', file: 'validator/schema.mjs', from: 'if (out.length > before) return;', to: '' },
  { name: 'схема: прототипні ключі рахуються відомими полями', file: 'validator/schema.mjs', from: '!Object.hasOwn(s.fields, k)', to: '!(k in s.fields)' },
  { name: 'схема: прототипні ключі рахуються варіантами union', file: 'validator/schema.mjs', from: 'Object.hasOwn(s.variants, k)', to: 'k in s.variants' },
  { name: '[діалог] умовний сетер прапорця рахується завжди', file: CHECKS_FILE, from: 'if (ch.when && !satisfiable(ch.when, set, mem(d.npcId))) continue;', to: '' },
  { name: '[діалог] нерухома точка прапорців — лише один прохід', file: CHECKS_FILE, from: 'set.add(e.setFlag); grew = true; }', to: 'set.add(e.setFlag); }' },
  { name: '[діалог] суперечливий all вважається здійсненним', file: CHECKS_FILE, from: 'if (cj.some((x) => x.notFlag !== undefined && yes.has(x.notFlag))) return false;', to: '' },
  { name: '[діалог] суперечність flag/notFlag не звітується', file: CHECKS_FILE, from: 'for (const f of contradictions(ch.when)) out.push', to: 'for (const f of []) out.push' },
  { name: '[діалог] вкладений all не розгортається', file: CHECKS_FILE, from: 'return cond.all ? cond.all.flatMap(conjuncts) : [cond];', to: 'return cond.all ? cond.all : [cond];' },
  { name: '[дороги] twoWay не дає ребра назад', file: CHECKS_FILE, from: 'for (const [a, b] of r.twoWay ? [[r.from, r.to], [r.to, r.from]] : [[r.from, r.to]]) {\n            if (!known.has(a)', to: 'for (const [a, b] of [[r.from, r.to]]) {\n            if (!known.has(a)' },
  { name: '[дороги] транспорт ребра не враховується', file: CHECKS_FILE, from: "if (tr !== null && !r.ways.some((w) => w.transport === tr)) continue;", to: 'if (false) continue;' },
  { name: '[дороги] шлях назад рахується по ребрах туди', file: CHECKS_FILE, from: 'const back = closure(prev);', to: 'const back = closure(next);' },
  { name: '[дороги] дубль ребра не звітується', file: CHECKS_FILE, from: "if (seenPair.has(k)) out.push(I('ROAD_DUPLICATE'", to: "if (false) out.push(I('ROAD_DUPLICATE'" },
  { name: '[дороги] платна дорога пропускається', file: CHECKS_FILE, from: 'if (w.cents > 0) out.push', to: 'if (false) out.push' },
  { name: '[дороги] вимагати дороги для кожного транспорту з transports.json', file: CHECKS_FILE, from: 'const transports = [...new Set(enumerateCombos(c.content).map((k) => k.transport))];', to: 'const transports = (c.content.transports ?? []).map((t) => t.id);' },
  { name: '[дороги] самопетля не звітується', file: CHECKS_FILE, from: "if (r.from === r.to) { out.push(I('ROAD_SELF_LOOP'", to: "if (false) { out.push(I('ROAD_SELF_LOOP'" },
  { name: '[подія] прапорець «подія була» не рахується поставленим', file: CHECKS_FILE, from: "const set = new Set((c.content.dialogues ?? []).filter((d) => d.trigger).map((d) => `f.seen-${d.id.replace(/^dlg\\./, '')}`));", to: 'const set = new Set();' },
  { name: '[подія] ефекти події не обмежуються', file: CHECKS_FILE, from: "if (e.setFlag === undefined) out.push(I('EVENT_EFFECT_UNSUPPORTED'", to: "if (false) out.push(I('EVENT_EFFECT_UNSUPPORTED'" },
  { name: '[подія] місця події не звіряються', file: CHECKS_FILE, from: "if (!by.locations.has(l)) miss(`${d.id}.trigger.at[${i}]`", to: "if (false) miss(`${d.id}.trigger.at[${i}]`" },
  // Семантика «гілки any — не кон'юнкти» тепер у satisfiable (contradictions лише називає прапорці мертвої умови).
  { name: '[діалог] гілки any всередині all рахуються кон\u2019юнктами', file: CHECKS_FILE, from: '    const cj = conjuncts(cond);\n    const yes = new Set(cj.filter((x) => x.flag !== undefined).map((x) => x.flag));\n    if (cj.some(', to: '    const cj = condLeaves(cond);\n    const yes = new Set(cj.filter((x) => x.flag !== undefined).map((x) => x.flag));\n    if (cj.some(' },
  { name: '[діалог] суперечність в одній гілці any звітується, хоч інша гілка жива', file: CHECKS_FILE, from: 'return satisfiable(cond, every, facts) ? new Set() : conflicts(cond);', to: 'return conflicts(cond);' },
  { name: '[діалог] completeObjective не звіряє kind цілі', file: CHECKS_FILE, from: "if (o.kind !== 'talk') out.push", to: 'if (false) out.push' },
  { name: '[діалог] completeObjective не звіряє NPC цілі', file: CHECKS_FILE, from: 'o.target !== d.npcId && by.npcs.has(o.target)', to: 'false && by.npcs.has(o.target)' },
  { name: '[діалог] startQuest: when вибору не зараховується як гарантія', file: CHECKS_FILE, from: 'if (ch.when && conjuncts(ch.when).some(', to: 'if (false && conjuncts(ch.when).some(' },
  { name: '[діалог] startQuest: квест у when зараховується навіть активним', file: CHECKS_FILE, from: "x.quest === r && x.status === 'completed'", to: 'x.quest === r' },
  { name: '[діалог] startQuest: квест у гілці any зараховується як гарантія', file: CHECKS_FILE, from: 'conjuncts(ch.when).some((x) => x.quest', to: 'condLeaves(ch.when).some((x) => x.quest' },
  { name: '[діалог] startQuest: доступність NPC не враховується', file: CHECKS_FILE, from: '[...reachable].filter((q) => npcAvail(npc, q))', to: '[...reachable]' },
  { name: '[діалог] startQuest: вимога вважається гарантованою завжди', file: CHECKS_FILE, from: 'stages.filter((q) => !guaranteed.get(q).has(r))', to: '[]' },
  { name: '[діалог] другий діалог того самого NPC не помічається', file: CHECKS_FILE, from: 'if (seen.has(d.npcId)) out.push', to: 'if (false) out.push' },
  // пам'ять NPC (GAME-48)
  { name: '[пам’ять] notRemembers не перевіряється на факти', file: CHECKS_FILE, from: 'leaf.remembers !== undefined ? leaf.remembers : leaf.notRemembers', to: 'leaf.remembers' },
  { name: '[пам’ять] факт, який пам’ятає будь-який NPC, зараховується всім', file: CHECKS_FILE, from: '!mem(d.npcId).has(f)', to: '!(c.content.dialogues ?? []).some((x) => mem(x.npcId).has(f))' },
  { name: '[пам’ять] умова remembers не обмежує запам’ятовувача', file: CHECKS_FILE, from: 'if (cond.remembers !== undefined) return remembered.has(cond.remembers);', to: '' },
  { name: '[пам’ять] нерухома точка пам’яті — лише проходи, де росли прапорці', file: CHECKS_FILE, from: 'e.remember])); grew = true; }', to: 'e.remember])); }' },
  { name: '[пам’ять] подія в дорозі (без NPC) запам’ятовує', file: CHECKS_FILE, from: 'e.remember !== undefined && d.npcId !== undefined &&', to: 'e.remember !== undefined &&' },
  { name: '[пам’ять] all з remembers і notRemembers вважається здійсненним', file: CHECKS_FILE, from: 'if (cj.some((x) => x.notRemembers !== undefined && kept.has(x.notRemembers))) return false;', to: '' },
  { name: '[пам’ять] суперечність remembers/notRemembers не називається', file: CHECKS_FILE, from: 'if (x.notRemembers !== undefined && kept.has(x.notRemembers)) out.add(x.notRemembers);', to: '' },
  { name: '[пам’ять] contradictions не знає фактів — жива гілка any з remembers рахується мертвою', file: CHECKS_FILE, from: 'satisfiable(cond, every, facts) ?', to: 'satisfiable(cond, every) ?' },
  { name: '[пам’ять] формат id факту не перевіряється', file: CHECKS_FILE, from: 'if (!MEMORY_ID.test(f)) out.push', to: 'if (false) out.push' },
  { name: '[пам’ять] схема не знає ефекту remember', file: 'validator/schema.mjs', from: '  remember: obj({ remember: req(str) }),\n', to: '' },
  { name: 'посилання transports не перевіряються', file: CHECKS_FILE, from: "ref('transports', id, `${e.id}.transports`)", to: '0' },
  // навички й небезпека дороги (GAME-72)
  { name: '[навички] невідома навичка не звітується', file: CHECKS_FILE, from: "if (!SKILL_IDS.includes(s.skill)) out.push(I('SKILL_UNKNOWN'", to: "if (false) out.push(I('SKILL_UNKNOWN'" },
  { name: '[навички] дубль навички не звітується', file: CHECKS_FILE, from: "if (seen.has(s.skill)) out.push(I('SKILL_DUPLICATE'", to: "if (false) out.push(I('SKILL_DUPLICATE'" },
  { name: '[навички] дубль рахується між профілями', file: CHECKS_FILE, from: '      for (const p of c.content.profiles ?? []) {\n        const seen = new Set();\n', to: '      const seen = new Set();\n      for (const p of c.content.profiles ?? []) {\n' },
  { name: '[навички] реєстр знає вигадану навичку', file: 'validator/codes.mjs', from: "'skill.communication'];", to: "'skill.communication', 'skill.swimming'];" },
  { name: '[навички] схема не обмежує ранг згори', file: 'validator/schema.mjs', from: "rank: req({ t: 'int', min: 0, max: 5 })", to: "rank: req({ t: 'int', min: 0 })" },
  { name: '[дороги] схема не обмежує небезпеку згори', file: 'validator/schema.mjs', from: "risk: { t: 'int', min: 0, max: 3 }", to: "risk: { t: 'int', min: 0 }" },
  { name: '[дороги] схема не знає небезпеки', file: 'validator/schema.mjs', from: ", risk: { t: 'int', min: 0, max: 3 } }), min: 1 }),", to: ' }), min: 1 }),' },
  // спорядження (GAME-73)
  { name: '[спорядження] відсутнє поле не звітується', file: CHECKS_FILE, from: "if (missing.length) { out.push(I('GEAR_FIELD_MISSING'", to: "if (missing.length) { (I('GEAR_FIELD_MISSING'" },
  { name: '[спорядження] реєстр полів забув ціну викупу', file: 'validator/codes.mjs', from: "'priceCents', 'resaleCents'];", to: "'priceCents'];" },
  { name: '[спорядження] предмет без виду не вважається спорядженням', file: CHECKS_FILE, from: "(i) => i.kind !== undefined || GEAR_FIELDS.some((f) => i[f] !== undefined)", to: '(i) => i.kind !== undefined' },
  { name: '[спорядження] викуп дорожчий за купівлю пропускається', file: CHECKS_FILE, from: 'if (i.resaleCents > i.priceCents) out.push', to: 'if (false) out.push' },
  { name: '[спорядження] викуп, рівний ціні, — помилка (межа зсунута)', file: CHECKS_FILE, from: 'if (i.resaleCents > i.priceCents) out.push', to: 'if (i.resaleCents >= i.priceCents) out.push' },
  { name: '[спорядження] точна копія не вважається домінуванням', file: CHECKS_FILE, from: '(!same(x, a) || complete.indexOf(x) < complete.indexOf(a))', to: '!same(x, a)' },
  { name: '[спорядження] домінування не звітується', file: CHECKS_FILE, from: "if (b) out.push(I('GEAR_DOMINATED'", to: "if (false) out.push(I('GEAR_DOMINATED'" },
  { name: '[спорядження] домінування між різними видами', file: CHECKS_FILE, from: 'x !== a && x.kind === a.kind && notWorse(x, a)', to: 'x !== a && notWorse(x, a)' },
  { name: '[спорядження] місця не рахуються (сімейний намет «гірший» за дешевий)', file: CHECKS_FILE, from: '&& b.comfortC <= a.comfortC && b.sleeps >= a.sleeps && b.priceCents <= a.priceCents;', to: '&& b.comfortC <= a.comfortC && b.priceCents <= a.priceCents;' },
  { name: '[спорядження] схема не знає ваги', file: 'validator/schema.mjs', from: 'weightG: int1, volumeL: int1,', to: 'volumeL: int1,' },
  { name: '[спорядження] схема не обмежує тир згори', file: 'validator/schema.mjs', from: "tier: { t: 'int', min: 1, max: 3 }", to: "tier: { t: 'int', min: 1 }" },
  // GAME-56: давність факту — попередження, не помилка
  { name: '[факт] поріг давності включно (>= замість >)', file: CHECKS_FILE, from: 'if (age > FACT_STALE_DAYS)', to: 'if (age >= FACT_STALE_DAYS)' },
  { name: '[факт] попередження рахується помилкою', file: 'validator/codes.mjs', from: "CODES[code]?.severity === 'warning'", to: 'false' },
  { name: '[факт] попередження бруднить контент і вимикає комбінації', file: CHECKS_FILE, from: 'const clean = issues.every((i) => isWarning(i.code));', to: 'const clean = issues.length === 0;' },
  { name: '[факт] вердикт: код виходу не залежить від помилок', file: 'validator/verdict.mjs', from: 'exitCode: errors.length ? 1 : 0', to: 'exitCode: 0' },
  // CLI (рецензія GAME-56): шлях, що справді вирішує CI.
  { name: '[факт] CLI не друкує ::warning::', file: 'validate-content.mjs', from: 'for (const i of warnings) console.log', to: 'for (const i of []) console.log' },
  { name: '[факт] CLI валить запуск на попередженні', file: 'validate-content.mjs', from: 'if (exitCode === 0 && ', to: 'if (errors.length + warnings.length === 0 && ' },
  { name: '[факт] CLI не передає «сьогодні»', file: 'validate-content.mjs', from: "validate(loaded.content, { today: new Date().toISOString().slice(0, 10) })", to: 'validate(loaded.content, {})' },
  { name: '[факт] --fail-on-warnings ігнорується', file: 'validate-content.mjs', from: "!(flag('--fail-on-warnings') && warnings.length)", to: 'true' },
  { name: '[факт] зламане «сьогодні» не зупиняє валідатор', file: CHECKS_FILE, from: "if (!isIsoDay(today)) return", to: 'if (false) return' },
];

function selfTestIn(dir) {
  const r = spawnSync(process.execPath, [join(dir, 'validate-content.mjs'), '--self-test'], { encoding: 'utf8' });
  return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
}

// 0. Немутований код мусить бути зеленим — інакше «спіймані» мутації нічого не значать.
const clean = selfTestIn(scripts);
if (clean.code !== 0) { console.log(clean.out); console.log('MUTATION: ABORT — немутований самотест не зелений'); process.exit(1); }

// Маркери в коді мусять збігатися з реєстром CHECKS один-в-один.
const src = readFileSync(join(scripts, CHECKS_FILE), 'utf8');
const markers = [...src.matchAll(/\/\/ @check:([a-z-]+)\n/g)].map((m) => m[1]).sort();
const registry = CHECKS.map((c) => c.id).sort();
if (JSON.stringify(markers) !== JSON.stringify(registry)) {
  console.log(`MUTATION: ABORT — маркери [${markers}] не збігаються з реєстром [${registry}]`);
  process.exit(1);
}

let caught = 0;
const fails = [];
for (const m of mutations) {
  const tmp = mkdtempSync(join(tmpdir(), 'ct-mut-'));
  try {
    cpSync(scripts, tmp, { recursive: true });
    const path = join(tmp, m.file);
    const text = readFileSync(path, 'utf8');
    const hits = text.split(m.from).length - 1;
    // Мутація, що не знайшла свого рядка, звітує як «пережила» — тому вимагаємо рівно одне входження.
    if (hits !== 1) { fails.push(`${m.name}: рядок мутації знайдено ${hits} разів, а не 1`); continue; }
    writeFileSync(path, text.replace(m.from, m.to));
    const r = selfTestIn(tmp);
    const asSelfTest = /SELF-TEST: FAILED \d+ of \d+/.test(r.out);
    if (r.code !== 0 && asSelfTest) { caught++; console.log(`спіймано  ${m.name}`); }
    else fails.push(`${m.name}: ${r.code === 0 ? 'самотест ЗЕЛЕНИЙ — мутація пережила' : 'самотест не дійшов до вердикту (впав як модуль)'}`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

// Нешкідливий контроль (закон 1, звірка GAME-17/18): змінено лише текст повідомлення — коди ті самі,
// тож мутація МУСИТЬ пережити. Якщо її «спіймано», харнес червоніє сам по собі й 100 % нічого не варті.
const HARMLESS = [
  { name: 'текст повідомлення WHEN_UNSATISFIABLE', file: 'validator/combos.mjs', from: 'умові не відповідає жодна з', to: 'умові не відповідає ні одна з' },
];
let survived = 0;
for (const m of HARMLESS) {
  const tmp = mkdtempSync(join(tmpdir(), 'ct-mut-'));
  try {
    cpSync(scripts, tmp, { recursive: true });
    const path = join(tmp, m.file);
    const text = readFileSync(path, 'utf8');
    if (text.split(m.from).length - 1 !== 1) { fails.push(`контроль «${m.name}»: рядок не знайдено рівно раз`); continue; }
    writeFileSync(path, text.replace(m.from, m.to));
    const r = selfTestIn(tmp);
    if (r.code === 0) { survived++; console.log(`пережила  [контроль, так і треба] ${m.name}`); }
    else fails.push(`контроль «${m.name}»: нешкідливу мутацію «спіймано» — харнес червоний без дефекту`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

for (const f of fails) console.log(`ПЕРЕЖИЛА  ${f}`);
console.log(`\nMUTATION: ${fails.length === 0 ? 'PASSED' : 'FAILED'} · спіймано ${caught} із ${mutations.length} (перевірок ${CHECKS.length}, точкових ${mutations.length - CHECKS.length}) · нешкідливий контроль пережив: ${survived} із ${HARMLESS.length}`);
process.exit(fails.length === 0 ? 0 : 1);
