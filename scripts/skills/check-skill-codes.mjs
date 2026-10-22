#!/usr/bin/env node
// Сторож скілу game-content (GAME-19): КОЖЕН код із scripts/validator/codes.mjs мусить мати в
// .claude/skills/game-content/SKILL.md, у розділі «Коди валідатора: як не допустити», власний
// рядок-пункт `- \`CODE\` … Не допустити: …`. Новий код у реєстрі без правила — червоне.
//
//   node scripts/skills/check-skill-codes.mjs              перевірити справжній SKILL.md
//   node scripts/skills/check-skill-codes.mjs --self-test  довести, що перевірка вміє почервоніти
//   node scripts/skills/check-skill-codes.mjs --mutate     вимкнути звірку й довести, що самотест це помічає
//
// Коди виходу: 0 — чисто (або самотест/мутація пройшли); 1 — є пропуски, або самотест/мутація впали.
// Закон 4: порожній реєстр кодів чи відсутній розділ — не «нічого не бракує», а червоне.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SECTION = /^##\s+(?:\d+\.\s*)?Коди валідатора: як не допустити\s*$/;
const RULE_MARK = 'Не допустити:';
const MIN_RULE_CHARS = 20;

// Повертає { ok, problems[] }. compare=false — мутація: звірку вимкнено.
export function checkSkill(text, codes, { compare = true } = {}) {
  const problems = [];
  if (!Array.isArray(codes) || codes.length === 0) {
    return { ok: false, problems: ['реєстр кодів порожній — перевіряти нічого, і це не «зелено» (закон 4)'] };
  }
  const lines = String(text ?? '').split(/\r?\n/);
  const start = lines.findIndex((l) => SECTION.test(l));
  if (start < 0) return { ok: false, problems: ['у SKILL.md немає розділу «## … Коди валідатора: як не допустити»'] };
  let end = lines.findIndex((l, i) => i > start && /^##\s/.test(l));
  if (end < 0) end = lines.length;
  const section = lines.slice(start + 1, end);

  if (!compare) return { ok: true, problems };
  for (const code of codes) {
    const head = `- \`${code}\``;
    const line = section.find((l) => l.startsWith(head + ' ') || l === head);
    if (!line) { problems.push(`${code}: немає пункту «${head} …» у розділі`); continue; }
    const at = line.indexOf(RULE_MARK);
    if (at < 0 || line.slice(at + RULE_MARK.length).trim().length < MIN_RULE_CHARS) {
      problems.push(`${code}: пункт є, але без правила «${RULE_MARK} …» (≥ ${MIN_RULE_CHARS} символів)`);
    }
  }
  return { ok: problems.length === 0, problems };
}

// ---------- самотест ----------

const SYN_CODES = ['ALPHA_ONE', 'BETA_TWO', 'GAMMA_THREE'];
const rule = (c) => `- \`${c}\` — щось ламається. Не допустити: роби отак і не інакше, з прикладом.`;
const doc = (body, heading = '## 8. Коди валідатора: як не допустити') => `# Скіл\n\n## 1. Інше\n\n${heading}\n\n${body}\n\n## 9. Далі\n`;

const CASES = [
  { name: 'повний розділ → зелене', text: doc(SYN_CODES.map(rule).join('\n')), codes: SYN_CODES, ok: true },
  { name: 'бракує одного коду → червоне з його назвою', text: doc(SYN_CODES.slice(0, 2).map(rule).join('\n')), codes: SYN_CODES, ok: false, mentions: 'GAMMA_THREE' },
  { name: 'порожній реєстр кодів → червоне (закон 4)', text: doc(SYN_CODES.map(rule).join('\n')), codes: [], ok: false },
  { name: 'немає розділу → червоне', text: doc(SYN_CODES.map(rule).join('\n'), '## 8. Інший розділ'), codes: SYN_CODES, ok: false },
  { name: 'код лише поза розділом → червоне', text: doc(SYN_CODES.slice(0, 2).map(rule).join('\n')) + `\n${rule('GAMMA_THREE')}\n`, codes: SYN_CODES, ok: false, mentions: 'GAMMA_THREE' },
  { name: 'код без правила → червоне', text: doc([...SYN_CODES.slice(0, 2).map(rule), '- `GAMMA_THREE` — щось ламається.'].join('\n')), codes: SYN_CODES, ok: false, mentions: 'GAMMA_THREE' },
  { name: 'префікс іншого коду не зараховується → червоне', text: doc([...SYN_CODES.slice(0, 2).map(rule), rule('GAMMA_THREE_X')].join('\n')), codes: SYN_CODES, ok: false, mentions: 'GAMMA_THREE' },
];

export function selfTest(opts = {}) {
  const out = [];
  let ok = true;
  for (const c of CASES) {
    const r = checkSkill(c.text, c.codes, opts);
    const pass = r.ok === c.ok && (!c.mentions || r.problems.some((p) => p.startsWith(c.mentions + ':')));
    if (!pass) ok = false;
    out.push(`${pass ? 'PASS' : 'FAIL'} · ${c.name}${pass ? '' : ` (отримано ok=${r.ok}: ${r.problems.join('; ') || '—'})`}`);
  }
  return { ok, text: out.join('\n') + `\n${ok ? 'SELF-TEST PASS' : 'SELF-TEST FAIL'} · прикладів ${CASES.length}` };
}

// ---------- запуск ----------

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) {
    const r = selfTest();
    console.log(r.text);
    process.exit(r.ok ? 0 : 1);
  }
  if (args.includes('--mutate')) {
    const r = selfTest({ compare: false });
    if (r.ok) {
      console.log('::error::MUTATION SURVIVED · звірку вимкнено, а самотест зелений — сторож сліпий');
      process.exit(1);
    }
    console.log(`${r.text}\nMUTATION KILLED · звірку вимкнено → самотест червоний, як і має бути`);
    process.exit(0);
  }
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const { CODES } = await import('../validator/codes.mjs');
  const codes = Object.keys(CODES ?? {});
  const skillPath = resolve(repo, '.claude/skills/game-content/SKILL.md');
  let text;
  try { text = readFileSync(skillPath, 'utf8'); }
  catch (e) { console.log(`::error::не прочитано ${skillPath}: ${e.message}`); process.exit(1); }
  const r = checkSkill(text, codes);
  if (r.ok) {
    console.log(`PASS · у SKILL.md є правило для кожного з ${codes.length} кодів валідатора`);
    process.exit(0);
  }
  for (const p of r.problems) console.log(`::error::${p}`);
  console.log(`\nFAIL · пропусків: ${r.problems.length} з ${codes.length} кодів`);
  process.exit(1);
}
