#!/usr/bin/env node
// Мутаційний прогін: доводить, що самотест ловить поломку КОЖНОЇ перевірки.
// Закон «Зелене нічого не доводить, поки не почервоніло»: мутація ламає рівно одне місце,
// самотест мусить упасти саме як самотест (рядок «SELF-TEST: FAILED»), а не як зламаний модуль.
//
//   node scripts/mutate-validator.mjs
//
// Мутації робляться в тимчасовій КОПІЇ scripts/, оригінал не чіпається.

import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir, availableParallelism } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { CHECKS } from './validator/checks.mjs';
import { cli } from './lib/cli.mjs';

cli();

const scripts = dirname(fileURLToPath(import.meta.url));
const CHECKS_FILE = 'validator/checks.mjs';
const COMBOS_FILE = 'validator/combos.mjs';

// 1. Вимкнення кожної перевірки цілком. 2. Точкові мутації логіки, де помилка найдорожча.
const mutations = [
  ...CHECKS.map((c) => ({ name: `вимкнено перевірку ${c.id}`, file: CHECKS_FILE, from: `// @check:${c.id}\n`, to: `// @check:${c.id}\n      return [];\n` })),
  { name: 'формат id основного етапу — будь-що (рецензія PR #62)', file: CHECKS_FILE, from: 'quests: /^(?:(?:[A-Z][A-Z0-9]*-)+\\d{3}|', to: 'quests: /^(?:.+|' },
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
  { name: 'combo-options біжить і на брудному контенті', file: CHECKS_FILE, from: "const LATE = ['combo-options', 'combos', 'npc-has-dialogue'];", to: "const LATE = ['combos', 'npc-has-dialogue'];" },
  { name: 'npc-has-dialogue біжить і на брудному контенті (GAME-179)', file: CHECKS_FILE, from: "const LATE = ['combo-options', 'combos', 'npc-has-dialogue'];", to: "const LATE = ['combo-options', 'combos'];" },
  // GAME-70: сторож довжини реплік — межі й вимкнення розбору
  { name: '[репліка] нижня межа вимкнена', file: CHECKS_FILE, from: 'sl.words < LINE_MIN_WORDS || ', to: '' },
  { name: '[репліка] верхня межа вимкнена', file: CHECKS_FILE, from: ' || sl.words > LINE_MAX_WORDS', to: '' },
  { name: '[репліка] нижня межа зсунута на 3', file: CHECKS_FILE, from: 'export const LINE_MIN_WORDS = 4;', to: 'export const LINE_MIN_WORDS = 3;' },
  { name: '[репліка] верхня межа зсунута на 16', file: CHECKS_FILE, from: 'export const LINE_MAX_WORDS = 15;', to: 'export const LINE_MAX_WORDS = 16;' },
  { name: '[репліка] вузли NPC не перевіряються', file: CHECKS_FILE, from: "if (n.speaker === 'npc') npcKeys.add(n.textKey);", to: 'void 0;' },
  { name: '[репліка] вузли гравця теж рахуються репліками', file: CHECKS_FILE, from: "if (n.speaker === 'npc') npcKeys.add", to: 'npcKeys.add' },
  { name: '[репліка] будь-яке слово з великої — мовець (Табличка:)', file: CHECKS_FILE, from: '.filter((m) => cast.includes(m[1]))', to: '' },
  { name: '[репліка] en не перевіряється', file: CHECKS_FILE, from: 'for (const lang of c.content.meta.locales) {\n        const table = c.content.locales', to: "for (const lang of ['uk']) {\n        const table = c.content.locales" },
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
  // сцени й автоматичні гілки (GAME-142)
  { name: '[сцена] власник scene не рахується', file: CHECKS_FILE, from: 'd.trigger !== undefined, d.scene !== undefined].filter(Boolean)', to: 'd.trigger !== undefined].filter(Boolean)' },
  { name: '[сцена] сцені дозволено стартувати квест', file: CHECKS_FILE, from: 'if (d.trigger === undefined && d.scene === undefined) continue;', to: 'if (d.trigger === undefined) continue;' },
  { name: '[сцена] факти сцени не ставлять прапорців', file: CHECKS_FILE, from: 'for (const f of d.scene?.facts ?? []) set.add(f);', to: 'for (const f of d.scene?.facts ?? []) void f;' },
  { name: '[сцена] факти сцени не звіряються з реєстром', file: CHECKS_FILE, from: "(d.scene?.facts ?? []).forEach((f, i) => out.push([`${d.id}.scene.facts[${i}]`, f]));", to: '' },
  { name: '[сцена] назва сцени не йде в перевірку локалізації', file: CHECKS_FILE, from: 'add(d.scene?.titleKey, `${d.id}.scene`)', to: 'add(undefined, `${d.id}.scene`)' },
  { name: '[гілка] next гілки не звіряється з вузлами', file: CHECKS_FILE, from: 'if (!nodes.has(b.next)) miss(', to: 'if (false) miss(' },
  { name: '[гілка] гілка рахується безумовним виходом', file: CHECKS_FILE, from: 'if (!onlyUnconditional) for (const b of n.branches ?? []) out.push(b.next);', to: 'for (const b of n.branches ?? []) out.push(b.next);' },
  { name: '[гілка] гілки не ведуть до досяжності', file: CHECKS_FILE, from: 'if (!onlyUnconditional) for (const b of n.branches ?? []) out.push(b.next);', to: '' },
  { name: '[гілка] умови гілок не читаються', file: CHECKS_FILE, from: "(n.branches ?? []).forEach((b, i) => { for (const leaf of condLeaves(b.when)) out.push(", to: "(n.branches ?? []).forEach((b, i) => { for (const leaf of []) out.push(" },
  { name: '[гілка] суперечність умови гілки не помічається', file: CHECKS_FILE, from: 'for (const [where, ch] of [...choices, ...dialogueBranches(c.content)]) {', to: 'for (const [where, ch] of choices) {' },
  { name: '[гілка] гілки без next дозволено', file: 'validator/schema.mjs', from: 'if (n.branches !== undefined && n.next === undefined) out.push', to: 'if (false) out.push' },
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
  { name: '[економіка] тир 2+ без дешевшої альтернативи не звітується', file: CHECKS_FILE, from: 'if (a.tier >= 2 && !gear.some(', to: 'if (false && !gear.some(' },
  { name: '[економіка] альтернатива не мусить бути дешевшою', file: CHECKS_FILE, from: 'x.tier < a.tier && x.priceCents < a.priceCents', to: 'x.tier < a.tier' },
  { name: '[економіка] база виду не мусить вміщатись у стартові гроші', file: CHECKS_FILE, from: 'i.tier === 1 && i.priceCents <= ECON_FLOOR_CENTS', to: 'i.tier === 1' },
  { name: '[економіка] позика в id не ловиться', file: CHECKS_FILE, from: 'ID_KEYS.has(k) && LOAN_RE.test(x)', to: 'ID_KEYS.has(k) && false' },
  { name: '[дороги] самопетля не звітується', file: CHECKS_FILE, from: "if (r.from === r.to) { out.push(I('ROAD_SELF_LOOP'", to: "if (false) { out.push(I('ROAD_SELF_LOOP'" },
  { name: '[подія] прапорець «подія була» (f.seen-*) не породжується', file: 'validator/codes.mjs', from: '(content.dialogues ?? []).filter((d) => d.trigger)', to: '[].filter((d) => d.trigger)' },
  { name: '[подія] ефекти події не обмежуються', file: CHECKS_FILE, from: "if (e.setFlag === undefined) out.push(I('EVENT_EFFECT_UNSUPPORTED'", to: "if (false) out.push(I('EVENT_EFFECT_UNSUPPORTED'" },
  { name: '[подія] місця події не звіряються', file: CHECKS_FILE, from: "if (!by.locations.has(l)) miss(`${d.id}.trigger.at[${i}]`", to: "if (false) miss(`${d.id}.trigger.at[${i}]`" },
  // Семантика «гілки any — не кон'юнкти» тепер у satisfiable (contradictions лише називає прапорці мертвої умови).
  { name: '[діалог] гілки any всередині all рахуються кон\u2019юнктами', file: CHECKS_FILE, from: '    const cj = conjuncts(cond);\n    const yes = new Set(cj.filter((x) => x.flag !== undefined).map((x) => x.flag));\n    if (cj.some(', to: '    const cj = condLeaves(cond);\n    const yes = new Set(cj.filter((x) => x.flag !== undefined).map((x) => x.flag));\n    if (cj.some(' },
  { name: '[діалог] суперечність в одній гілці any звітується, хоч інша гілка жива', file: CHECKS_FILE, from: 'return satisfiable(cond, every, facts) ? new Set() : conflicts(cond);', to: 'return conflicts(cond);' },
  { name: '[діалог] completeObjective не звіряє kind цілі', file: CHECKS_FILE, from: "if (o.kind !== 'talk') out.push", to: 'if (false) out.push' },
  { name: '[діалог] completeObjective не звіряє NPC цілі', file: CHECKS_FILE, from: 'o.target !== d.npcId && by.npcs.has(o.target)', to: 'false && by.npcs.has(o.target)' },
  { name: '[діалог] byDialogue не обмежений цілями talk', file: CHECKS_FILE, from: "if (o.kind !== 'talk') { out.push(I('OBJECTIVE_BY_DIALOGUE_KIND'", to: "if (false) { out.push(I('OBJECTIVE_BY_DIALOGUE_KIND'" },
  { name: '[діалог] ціль byDialogue без закривальної репліки не помічається', file: CHECKS_FILE, from: "if (!closing.length) { out.push(I('OBJECTIVE_BY_DIALOGUE_OPEN'", to: "if (false) { out.push(I('OBJECTIVE_BY_DIALOGUE_OPEN'" },
  { name: '[діалог] закривальні репліки не обминаються при пошуку вільного шляху', file: CHECKS_FILE, from: '.filter((ch) => !closes(ch)).map((ch) => ch.next)', to: '.map((ch) => ch.next)' },
  { name: '[діалог] закриття на кожному шляху не звітується', file: CHECKS_FILE, from: "if (!free) out.push(I('OBJECTIVE_BY_DIALOGUE_ALWAYS'", to: "if (false) out.push(I('OBJECTIVE_BY_DIALOGUE_ALWAYS'" },
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
  // календар життя (GAME-71)
  { name: '[календар] школяр без календаря не звітується', file: CHECKS_FILE, from: 'if (p.job || p.childInSchool) out.push', to: 'if (p.job) out.push' },
  { name: '[календар] 02-29 вважається датою щороку', file: CHECKS_FILE, from: 'const DIM = [31, 28, 31,', to: 'const DIM = [31, 29, 31,' },
  { name: '[календар] старт не перевіряється', file: CHECKS_FILE, from: "if (!isIsoDay(cal.start)) out.push", to: 'if (false) out.push' },
  { name: '[календар] межа канікул не перевіряється', file: CHECKS_FILE, from: "const bad = ['from', 'to'].filter((k) => !mdOk(r[k]));", to: 'const bad = [];' },
  { name: '[календар] канікули через Новий рік не розгортаються', file: CHECKS_FILE, from: ': x >= n(r.from) || x <= n(r.to));', to: ': false);' },
  { name: '[календар] останній день канікул не входить (перетин в один день пропущено)', file: CHECKS_FILE, from: 'n(r.from) <= x && x <= n(r.to)', to: 'n(r.from) <= x && x < n(r.to)' },
  { name: '[календар] свято двічі не звітується', file: CHECKS_FILE, from: "if (seen.has(h)) out.push", to: 'if (false) out.push' },
  { name: '[календар] рахунки, рівні зарплаті, — помилка (межа зсунута)', file: CHECKS_FILE, from: 'p.job.billsCents > p.job.salaryCents', to: 'p.job.billsCents >= p.job.salaryCents' },
  { name: '[календар] схема не обмежує день виплати згори', file: 'validator/schema.mjs', from: "payday: req({ t: 'int', min: 1, max: 28 })", to: "payday: req({ t: 'int', min: 1 })" },
  { name: '[календар] завантажувач не знає calendar.json', file: 'validator/load.mjs', from: "'meta.json', 'calendar.json',", to: "'meta.json'," },
  { name: '[календар] схема не перевіряє календар', file: 'validator/schema.mjs', from: "if (content.calendar !== undefined) walk(", to: 'if (false) walk(' },
  // пакування (GAME-109)
  { name: '[пакування] завантажувач не знає packing.json', file: 'validator/load.mjs', from: "'calendar.json', 'packing.json',", to: "'calendar.json'," },
  { name: '[пакування] схема не перевіряє packing', file: 'validator/schema.mjs', from: "if (content.packing !== undefined) walk(", to: 'if (false) walk(' },
  { name: '[пакування] «потрібне» рівно в міру вважається переливом (межа зсунута)', file: CHECKS_FILE, from: 'need[1] > cap.units', to: 'need[1] >= cap.units' },
  { name: '[пакування] «потрібне» не рахується (перелив пропущено)', file: CHECKS_FILE, from: "x.group === 'needed' && (!x.when?.animals", to: "x.group === 'needed' && false && (!x.when?.animals" },
  { name: '[пакування] сімейства ядра (f.pack-*, f.seen-*) не вважаються здійсненними', file: CHECKS_FILE, from: 'const set = new Set(Object.values(FLAG_FAMILIES).flatMap((f) => f.gen(c.content)));', to: 'const set = new Set();' },
  { name: '[пакування] посилання речей пакування на items.json не перевіряються', file: CHECKS_FILE, from: "ref('items', x.item, `packing.items[${i}].item`);", to: ';' },
  { name: '[пакування] ключі підписів не потрапляють у перевірку перекладів', file: CHECKS_FILE, from: "(ct.packing?.notes ?? []).forEach((n, i) => add(n.textKey", to: "[].forEach((n, i) => add(n.textKey" },
  { name: '[пакування] дубль речі не звітується', file: CHECKS_FILE, from: "if (seen.has(x.item)) out.push(I('PACK_ITEM_DUPLICATE'", to: "if (false) out.push(I('PACK_ITEM_DUPLICATE'" },
  // GAME-115: реєстр прапорців (content/flags.json)
  { name: '[реєстр] незареєстрований прапорець не звітується', file: CHECKS_FILE, from: "        bad('FLAG_UNREGISTERED', where, `прапорця", to: "        if (false) bad('FLAG_UNREGISTERED', where, `прапорця" },
  { name: '[реєстр] незареєстрований факт пам\u2019яті не звітується', file: CHECKS_FILE, from: "else bad('FLAG_UNREGISTERED', where, `факту пам", to: "else if (false) bad('FLAG_UNREGISTERED', where, `факту пам" },
  { name: '[реєстр] умова transport не вимагає s.transport у реєстрі', file: CHECKS_FILE, from: "if (!e) { bad('FLAG_UNREGISTERED', where, 'умова transport", to: "if (!e) { if (false) bad('FLAG_UNREGISTERED', where, 'умова transport" },
  { name: '[реєстр] будь-яка назва з префіксом сімейства вважається зареєстрованою', file: CHECKS_FILE, from: 'if (!generated.get(fam.id).has(name)) bad(', to: 'if (false) bad(' },
  { name: '[реєстр] значення enum не звіряється зі списком', file: CHECKS_FILE, from: "if (!(en.values ?? []).includes(v)) bad('FLAG_ENUM_VALUE'", to: "if (false) bad('FLAG_ENUM_VALUE'" },
  { name: '[реєстр] тип запису не звіряється (enum читається як bool)', file: CHECKS_FILE, from: "if (e.type !== 'bool') bad('FLAG_TYPE_MISMATCH'", to: "if (false) bad('FLAG_TYPE_MISMATCH'" },
  { name: '[реєстр] сімейство «вжите» й без породжувача', file: CHECKS_FILE, from: 'for (const e of families) if (generated.get(e.id).size) used.add(e.id);', to: 'for (const e of families) used.add(e.id);' },
  { name: '[реєстр] reserved не звільняє від «невживаного»', file: CHECKS_FILE, from: "else if (e.reserved !== true && !used.has(e.id)) bad('FLAG_REGISTERED_UNUSED'", to: "else if (!used.has(e.id)) bad('FLAG_REGISTERED_UNUSED'" },
  { name: '[реєстр] невживаний рядок не звітується', file: CHECKS_FILE, from: "else if (e.reserved !== true && !used.has(e.id)) bad('FLAG_REGISTERED_UNUSED'", to: "else if (false) bad('FLAG_REGISTERED_UNUSED'" },
  // GAME-110: прапорець, який ставлять, але ніхто не читає
  { name: '[реєстр] прапорець без читача не звітується', file: CHECKS_FILE, from: "&& !read.has(e.id)) bad('FLAG_NEVER_READ'", to: "&& false) bad('FLAG_NEVER_READ'" },
  { name: '[реєстр] notFlag/notRemembers не вважаються читанням', file: CHECKS_FILE, from: 'const name = leaf.flag ?? leaf.notFlag ?? leaf.remembers ?? leaf.notRemembers;', to: 'const name = leaf.flag ?? leaf.remembers;' },
  { name: '[реєстр] значення enum не зводиться до рядка реєстру при читанні', file: CHECKS_FILE, from: "const row = byId.get(name) ?? enums.find((e) => name.startsWith(`${e.id}-`));", to: 'const row = byId.get(name);' },
  { name: '[реєстр] journal-ключі не потрапляють у перевірку перекладів', file: CHECKS_FILE, from: 'for (const f of ct.flags ?? []) for (const k of journalKeys(f)) add(k', to: 'for (const f of []) for (const k of journalKeys(f)) add(k' },
  { name: '[реєстр] journal у enum вимагає лише один текст', file: CHECKS_FILE, from: "return f.type === 'enum' ? (f.values ?? []).map((v) => `journal.${f.id}-${v}`) : [`journal.${f.id}`];", to: "return f.type === 'enum' ? (f.values ?? []).slice(0, 1).map((v) => `journal.${f.id}-${v}`) : [`journal.${f.id}`];" },
  { name: '[реєстр] journal дозволено будь-якому рядку', file: CHECKS_FILE, from: "if (e.journal === true && (!core ||", to: "if (false && (!core ||" },
  { name: '[реєстр] прапорець ядра може стартувати true', file: CHECKS_FILE, from: '(core && init !== false)', to: 'false' },
  { name: '[реєстр] «unset» дозволено серед значень enum', file: CHECKS_FILE, from: "if (!ENUM_VALUE.test(v) || v === 'unset') inv(", to: 'if (!ENUM_VALUE.test(v)) inv(' },
  { name: '[реєстр] завантажувач і схема не знають flags.json', file: 'validator/schema.mjs', from: "'facts', 'roads', 'flags', 'waves', 'requests', 'stickers'];", to: "'facts', 'roads', 'waves', 'requests', 'stickers'];" },
  { name: '[реєстр] id реєстру не звіряються з форматом', file: CHECKS_FILE, from: "if (!ok) out.push(I('ID_FORMAT', `flags:${e.id}`", to: "if (false) out.push(I('ID_FORMAT', `flags:${e.id}`" },
  { name: '[реєстр] дублі id реєстру не звітуються', file: CHECKS_FILE, from: "for (const t of [...Object.keys(ID_PATTERNS), 'flags']) dup(", to: 'for (const t of Object.keys(ID_PATTERNS)) dup(' },
  // GAME-170: хвилі напруги
  { name: '[хвиля] одна справа вважається хвилею (межа зсунута)', file: CHECKS_FILE, from: "if (w.tasks.length < WAVE_MIN_TASKS) out.push(I('WAVE_TOO_FEW_TASKS'", to: "if (w.tasks.length < 1) out.push(I('WAVE_TOO_FEW_TASKS'" },
  { name: '[хвиля] строк 0 приймається', file: CHECKS_FILE, from: '!Number.isInteger(t.limitMin) || t.limitMin < 1 || t.limitMin > WAVE_MAX_LIMIT', to: '!Number.isInteger(t.limitMin) || t.limitMin < 0 || t.limitMin > WAVE_MAX_LIMIT' },
  { name: '[хвиля] строк не обмежений згори', file: CHECKS_FILE, from: '|| t.limitMin > WAVE_MAX_LIMIT) out.push', to: '|| false) out.push' },
  { name: '[хвиля] межа строку в реєстрі ширша за хвилю', file: 'validator/codes.mjs', from: 'export const WAVE_MAX_LIMIT = 60;', to: 'export const WAVE_MAX_LIMIT = 61;' },
  { name: '[хвиля] п’ять справ не звітуються (верхня межа вимкнена)', file: CHECKS_FILE, from: "if (w.tasks.length > WAVE_MAX_TASKS) out.push(I('WAVE_TOO_MANY_TASKS'", to: "if (false) out.push(I('WAVE_TOO_MANY_TASKS'" },
  { name: '[хвиля] верхня межа в реєстрі зсунута на п’ять', file: 'validator/codes.mjs', from: 'export const WAVE_MAX_TASKS = 4;', to: 'export const WAVE_MAX_TASKS = 5;' },
  { name: '[хвиля] безпека Мії знову залежить від поля animal', file: CHECKS_FILE, from: 'if (isAnimalTask(t)) {', to: 'if (t.animal !== undefined) {' },
  { name: '[хвиля] ціль npc.mia / animal.* не робить справу справою про тварину', file: CHECKS_FILE, from: "(t.targets ?? []).some((x) => /^(animal\\.|npc\\.mia)/.test(x.id)) || ", to: '' },
  { name: '[хвиля] слово mia/cat в id справи не робить її справою про тварину', file: CHECKS_FILE, from: ' || /(^|-)(mia|cat)(-|$)/.test(t.id);', to: ';' },
  { name: '[хвиля] вибір за прапорцем хвилі, що рухає квест, не звітується', file: CHECKS_FILE, from: 'if (reads(ch.when) && ((ch.effects', to: 'if (false && ((ch.effects' },
  { name: '[хвиля] прапорці наслідків хвилі не збираються для перевірки квестів', file: CHECKS_FILE, from: 'const waveFlags = new Set(waveEffects(content).map(([, f]) => f));', to: 'const waveFlags = new Set();' },
  { name: '[хвиля] перевіряється лише наслідок «встиг»', file: CHECKS_FILE, from: "for (const k of ['done', 'late']) if (t[k] === undefined) out.push(I('WAVE_OUTCOME_MISSING'", to: "for (const k of ['done']) if (t[k] === undefined) out.push(I('WAVE_OUTCOME_MISSING'" },
  { name: '[хвиля] небезпечна ціль не звітується', file: CHECKS_FILE, from: 'if (!t.targets?.length || t.targets.some((x) => x.safe !== true)) out.push', to: 'if (!t.targets?.length) out.push' },
  { name: '[хвиля] справа про тварину без цілі приймається', file: CHECKS_FILE, from: 'if (!t.targets?.length || t.targets.some((x) => x.safe !== true)) out.push', to: 'if (t.targets?.some((x) => x.safe !== true)) out.push' },
  { name: '[Мія] велосипед у transports Мії не помічається', file: CHECKS_FILE, from: 'const bad = allowed.filter((t) => isBikeId(t) || bikes.includes(t));', to: 'const bad = [];' },
  { name: '[Мія] відсутній transports Мії не вважається «їде всім, і велосипедом»', file: CHECKS_FILE, from: 'mia.transports ?? (c.content.transports ?? []).map((t) => t.id)', to: 'mia.transports ?? []' },
  { name: '[Мія] умова з «без тварини» вважається умовою на кішку', file: CHECKS_FILE, from: 'w.animals.every((a) => a === MIA)', to: 'w.animals.includes(MIA)' },
  { name: '[Мія] подія про Мію без умови не перевіряється', file: CHECKS_FILE, from: 'if (d.trigger && isMiaId(d.id) && !gated(d.trigger.when))', to: 'if (false)' },
  { name: '[Мія] ціль квесту про Мію без умови не перевіряється', file: CHECKS_FILE, from: 'if (isMiaId(o.id) && !gated(o.when, q.when))', to: 'if (false)' },
  { name: '[Мія] річ пакування для Мії без умови не перевіряється', file: CHECKS_FILE, from: 'if (isMiaId(x.item) && !gated(x.when))', to: 'if (false)' },
  { name: '[хвиля] помічник може шукати тварину', file: CHECKS_FILE, from: "if (t.leaderOnly !== true) out.push(I('WAVE_ANIMAL_HELPER'", to: "if (false) out.push(I('WAVE_ANIMAL_HELPER'" },
  { name: '[хвиля] варіант рахує і справи поза when', file: CHECKS_FILE, from: 'const visible = w.tasks.filter((t) => matches(t.when, k));', to: 'const visible = w.tasks;' },
  { name: '[хвиля] варіант перевіряється й у комбінаціях поза when хвилі', file: CHECKS_FILE, from: 'if (!matches(w.when, k)) continue;\n          const visible', to: 'const visible' },
  { name: '[хвиля] повтор набору справ на іншому етапі не звітується', file: CHECKS_FILE, from: "if (prev && prev.stage !== w.stage) out.push(I('WAVE_REPEATED'", to: "if (false) out.push(I('WAVE_REPEATED'" },
  { name: '[хвиля] повтор на тому ж етапі рахується повтором між етапами', file: CHECKS_FILE, from: "if (prev && prev.stage !== w.stage) out.push(I('WAVE_REPEATED'", to: "if (prev) out.push(I('WAVE_REPEATED'" },
  { name: '[хвиля] етап хвилі не звіряється з квестами', file: CHECKS_FILE, from: "ref('quests', w.stage, `${w.id}.stage`);", to: ';' },
  { name: '[хвиля] тварина справи не звіряється', file: CHECKS_FILE, from: "for (const t of w.tasks) ref('animals', t.animal, `${w.id}/${t.id}.animal`);", to: ';' },
  { name: '[хвиля] тексти справ не йдуть у перевірку локалізації', file: CHECKS_FILE, from: "for (const t of w.tasks) { add(t.textKey, `${w.id}/${t.id}`); add(t.done?.textKey, `${w.id}/${t.id}.done`); add(t.late?.textKey, `${w.id}/${t.id}.late`); }", to: '' },
  { name: '[хвиля] ефекти наслідків не є вжитками реєстру', file: CHECKS_FILE, from: '  for (const [where, f] of waveEffects(content)) out.push([where, f]);\n', to: '' },
  { name: '[хвиля] ефекти наслідків не є сетерами прапорців', file: CHECKS_FILE, from: '  for (const [, f] of waveEffects(c.content)) set.add(f);\n', to: '' },
  { name: '[хвиля] when справи не успадковує when хвилі', file: CHECKS_FILE, from: 'for (const t of w.tasks) if (t.when) out.push([`${w.id}/${t.id}`, t.when, w.when]);', to: 'for (const t of w.tasks) if (t.when) out.push([`${w.id}/${t.id}`, t.when]);' },
  { name: '[хвиля] id справ не звіряються з форматом', file: CHECKS_FILE, from: "if (!OBJECTIVE_ID.test(t.id)) out.push(I('ID_FORMAT', `${w.id}/${t.id}`", to: "if (false) out.push(I('ID_FORMAT', `${w.id}/${t.id}`" },
  { name: '[хвиля] дубль id справи не звітується', file: CHECKS_FILE, from: 'for (const w of c.content.waves ?? []) dup(w.tasks.map((t) => t.id), `${w.id}.tasks`);', to: '' },
  { name: '[хвиля] схема дозволяє наслідку стартувати квест', file: 'validator/schema.mjs', from: "const waveEffect = union({ setFlag: obj({ setFlag: req(str) }), wetGear: obj({ wetGear: req({ t: 'boolean', only: true }) }) });", to: 'const waveEffect = effect;' },
  { name: '[хвиля] схема приймає wetGear: false', file: 'validator/schema.mjs', from: "wetGear: obj({ wetGear: req({ t: 'boolean', only: true }) })", to: 'wetGear: obj({ wetGear: req(bool) })' },
  { name: '[хвиля] перекриття when хвиль одного етапу не звітується', file: CHECKS_FILE, from: "if (k) out.push(I('WAVE_STAGE_OVERLAP'", to: "if (false) out.push(I('WAVE_STAGE_OVERLAP'" },
  { name: '[хвиля] хвилі одного етапу вважаються перекритими й без спільної комбінації', file: CHECKS_FILE, from: "const k = combos.find((x) => matches(a.when, x) && matches(b.when, x));", to: "const k = combos[0];" },
  { name: '[хвиля] схема не знає wetGear', file: 'validator/schema.mjs', from: "const waveEffect = union({ setFlag: obj({ setFlag: req(str) }), wetGear: obj({ wetGear: req({ t: 'boolean', only: true }) }) });", to: 'const waveEffect = union({ setFlag: obj({ setFlag: req(str) }) });' },
  { name: '[хвиля] завантажувач і схема не знають waves.json', file: 'validator/schema.mjs', from: "'facts', 'roads', 'flags', 'waves', 'requests', 'stickers'];", to: "'facts', 'roads', 'flags', 'requests', 'stickers'];" },
  // наклейки Атласу (GAME-182)
  { name: '[наклейка] наклейка без умови не звітується', file: CHECKS_FILE, from: "out.push(I('STICKER_NO_COND', where,", to: "void (I('STICKER_NO_COND', where," },
  { name: '[наклейка] умова за транспортом чи пам’яттю не звітується', file: CHECKS_FILE, from: "out.push(I('STICKER_COND_UNSUPPORTED',", to: "void (I('STICKER_COND_UNSUPPORTED'," },
  { name: '[наклейка] неіснуючий квест в умові не звітується', file: CHECKS_FILE, from: "leaf.quest !== undefined && !quests.has(leaf.quest)", to: "false" },
  { name: '[наклейка] прапорець, якого ніхто не ставить, не звітується', file: CHECKS_FILE, from: "leaf.flag !== undefined && !set.has(leaf.flag)", to: "false" },
  { name: '[наклейка] 12 слотів уже забагато (межа зсунута)', file: CHECKS_FILE, from: 'list.length > STICKER_SLOTS', to: 'list.length >= STICKER_SLOTS' },
  { name: '[наклейка] 13-та наклейка проходить (межа зсунута в інший бік)', file: CHECKS_FILE, from: 'list.length > STICKER_SLOTS', to: 'list.length > STICKER_SLOTS + 1' },
  { name: '[наклейка] тексти наклейок не входять до перевірки перекладу', file: CHECKS_FILE, from: "for (const s of ct.stickers ?? []) { add(s.nameKey,", to: "for (const s of []) { add(s.nameKey," },
  { name: '[наклейка] схема не обов’язує текст наклейки', file: 'validator/schema.mjs', from: "nameKey: req(str), textKey: req(str), kind: req(en('place'", to: "nameKey: str, textKey: str, kind: req(en('place'" },
  { name: '[прохання] завантажувач і схема не знають requests.json', file: 'validator/schema.mjs', from: "'facts', 'roads', 'flags', 'waves', 'requests', 'stickers'];", to: "'facts', 'roads', 'flags', 'waves', 'stickers'];" },
  // GAME-184: продовження арки (after) — ланцюг прохань одного просильника
  { name: '[прохання] after на неіснуюче/чуже прохання не звітується', file: CHECKS_FILE, from: "if (!prev || prev.giver !== r.giver) out.push(I('REQUEST_AFTER_INVALID'", to: "if (false) out.push(I('REQUEST_AFTER_INVALID'" },
  { name: '[прохання] продовження шукає пропозицію у вузлі offer (а не offer2)', file: CHECKS_FILE, from: "const offerId = r.after === undefined ? 'offer' : 'offer2';", to: "const offerId = 'offer';" },
  { name: '[Мія] гілка { animal } не вважається охороною: репліка про Мію у проханні лічиться безумовною', file: CHECKS_FILE, from: "conjuncts(cond).some((x) => x.animal === MIA)", to: "false" },
  { name: '[Мія] рядки прохання (картка) не перевіряються на ім’я Мії', file: CHECKS_FILE, from: "if (mentions(key)) out.push(I('MIA_CONTENT_UNGATED', `${r.id}.${key}`", to: "if (false) out.push(I('MIA_CONTENT_UNGATED', `${r.id}.${key}`" },
  // GAME-56: давність факту — попередження, не помилка
  { name: '[факт] поріг давності включно (>= замість >)', file: CHECKS_FILE, from: 'if (age > FACT_STALE_DAYS)', to: 'if (age >= FACT_STALE_DAYS)' },
  { name: '[факт] попередження рахується помилкою', file: 'validator/codes.mjs', from: "CODES[code]?.severity === 'warning'", to: 'false' },
  { name: '[факт] попередження бруднить контент і вимикає комбінації', file: CHECKS_FILE, from: 'const clean = issues.every((i) => isWarning(i.code));', to: 'const clean = issues.length === 0;' },
  { name: '[факт] вердикт: код виходу не залежить від помилок', file: 'validator/verdict.mjs', from: 'exitCode: errors.length ? 1 : 0', to: 'exitCode: 0' },
  // CLI (рецензія GAME-56): шлях, що справді вирішує CI.
  { name: '[факт] CLI не друкує ::warning::', file: 'validate-content.mjs', from: 'for (const i of warnings) console.log', to: 'for (const i of []) console.log' },
  { name: '[факт] CLI валить запуск на попередженні', file: 'validate-content.mjs', from: 'if (exitCode === 0 && ', to: 'if (errors.length + warnings.length === 0 && ' },
  { name: '[факт] CLI не передає «сьогодні»', file: 'validate-content.mjs', from: "validate(loaded.content, { today: new Date().toISOString().slice(0, 10), maps:", to: 'validate(loaded.content, { maps:' },
  { name: '[факт] --fail-on-warnings ігнорується', file: 'validate-content.mjs', from: "!(flag('--fail-on-warnings') && warnings.length)", to: 'true' },
  { name: '[факт] зламане «сьогодні» не зупиняє валідатор', file: CHECKS_FILE, from: "if (!isIsoDay(today)) return", to: 'if (false) return' },
];

function selfTestIn(dir) {
  const r = spawnSync(process.execPath, [join(dir, 'validate-content.mjs'), '--self-test'], { encoding: 'utf8' });
  return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
}

// GAME-176: кожна мутація живе у власній тимчасовій копії, тож їх можна жати паралельно.
// Пул обмежений; результати збираються за індексом і друкуються в початковому порядку.
const POOL = Math.max(1, Math.min(8, availableParallelism()));
function selfTestAsync(dir) {
  return new Promise((res) => {
    const c = spawn(process.execPath, [join(dir, 'validate-content.mjs'), '--self-test']);
    let out = '';
    c.stdout.on('data', (d) => { out += d; });
    c.stderr.on('data', (d) => { out += d; });
    c.on('error', (e) => res({ code: null, out: String(e) }));
    c.on('close', (code) => res({ code, out }));
  });
}
async function pool(items, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(POOL, items.length) }, async () => {
    while (next < items.length) { const i = next++; results[i] = await fn(items[i]); }
  }));
  return results;
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
async function runMutation(m) {
  const tmp = mkdtempSync(join(tmpdir(), 'ct-mut-'));
  try {
    cpSync(scripts, tmp, { recursive: true });
    const path = join(tmp, m.file);
    const text = readFileSync(path, 'utf8');
    const hits = text.split(m.from).length - 1;
    // Мутація, що не знайшла свого рядка, звітує як «пережила» — тому вимагаємо рівно одне входження.
    if (hits !== 1) return { fail: `${m.name}: рядок мутації знайдено ${hits} разів, а не 1` };
    writeFileSync(path, text.replace(m.from, m.to));
    const r = await selfTestAsync(tmp);
    const asSelfTest = /SELF-TEST: FAILED \d+ of \d+/.test(r.out);
    if (r.code !== 0 && asSelfTest) return { ok: `спіймано  ${m.name}` };
    return { fail: `${m.name}: ${r.code === 0 ? 'самотест ЗЕЛЕНИЙ — мутація пережила' : 'самотест не дійшов до вердикту (впав як модуль)'}` };
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
for (const r of await pool(mutations, runMutation)) {
  if (r.ok) { caught++; console.log(r.ok); } else fails.push(r.fail);
}

// Нешкідливий контроль (закон 1, звірка GAME-17/18): змінено лише текст повідомлення — коди ті самі,
// тож мутація МУСИТЬ пережити. Якщо її «спіймано», харнес червоніє сам по собі й 100 % нічого не варті.
const HARMLESS = [
  { name: 'текст повідомлення WHEN_UNSATISFIABLE', file: 'validator/combos.mjs', from: 'умові не відповідає жодна з', to: 'умові не відповідає ні одна з' },
];
let survived = 0;
async function runHarmless(m) {
  const tmp = mkdtempSync(join(tmpdir(), 'ct-mut-'));
  try {
    cpSync(scripts, tmp, { recursive: true });
    const path = join(tmp, m.file);
    const text = readFileSync(path, 'utf8');
    if (text.split(m.from).length - 1 !== 1) return { fail: `контроль «${m.name}»: рядок не знайдено рівно раз` };
    writeFileSync(path, text.replace(m.from, m.to));
    const r = await selfTestAsync(tmp);
    if (r.code === 0) return { ok: `пережила  [контроль, так і треба] ${m.name}` };
    return { fail: `контроль «${m.name}»: нешкідливу мутацію «спіймано» — харнес червоний без дефекту` };
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
for (const r of await pool(HARMLESS, runHarmless)) {
  if (r.ok) { survived++; console.log(r.ok); } else fails.push(r.fail);
}

for (const f of fails) console.log(`ПЕРЕЖИЛА  ${f}`);
console.log(`\nMUTATION: ${fails.length === 0 ? 'PASSED' : 'FAILED'} · спіймано ${caught} із ${mutations.length} (перевірок ${CHECKS.length}, точкових ${mutations.length - CHECKS.length}) · нешкідливий контроль пережив: ${survived} із ${HARMLESS.length}`);
process.exit(fails.length === 0 ? 0 : 1);
