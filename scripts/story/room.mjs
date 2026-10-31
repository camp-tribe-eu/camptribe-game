// GAME-198: «сценарна кімната» — один бриф кільком моделям через fal-ai/any-llm.
// Лише для СТВОРЕННЯ гри: чернетки лягають у brain/Сценарій/drafts/, у content/ їх переносить
// людина-редактор, далі валідатор. Гра під час проходження ШІ не викликає (CLAUDE.md).
// Ключ береться лише з середовища (FAL_KEY, секрет Actions) і ніде не друкується.
// Запуск: node scripts/story/room.mjs brain/Сценарій/briefs/<бриф>.json
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

const QUEUE = 'https://queue.fal.run/fal-ai/any-llm';

/** Модель брифу: рядок або { model, reasoning } (деякі моделі, напр. gemini-2.5-pro, вимагають reasoning: true). */
export const modelSpec = (m) => (typeof m === 'string' ? { model: m, reasoning: false } : { model: String(m?.model ?? ''), reasoning: m?.reasoning === true });

/** Бриф: { models: (string | {model, reasoning})[], system?: string, prompt?: string, prompt_file?: string }. Помилка — текстом, не мовчки. */
export function parseBrief(raw, readFile) {
  const b = JSON.parse(raw);
  if (!Array.isArray(b.models) || b.models.length === 0) throw new Error('бриф: models — непорожній список моделей');
  if (b.prompt_file && (/(^|[\\/])\.\.([\\/]|$)/.test(b.prompt_file) || /^([\\/]|[a-z]:)/i.test(b.prompt_file))) throw new Error('бриф: prompt_file лише поруч із брифом, без .. і абсолютних шляхів');
  const prompt = b.prompt ?? (b.prompt_file ? readFile(b.prompt_file) : '');
  if (!prompt.trim()) throw new Error('бриф: порожній prompt (prompt або prompt_file)');
  const models = b.models.map(modelSpec);
  if (models.some((m) => !m.model)) throw new Error('бриф: у кожної моделі має бути назва');
  return { models, system: b.system ?? '', prompt };
}

/** Ім'я файлу чернетки з назви моделі: openai/gpt-5-chat → openai--gpt-5-chat.md */
export const draftName = (model) => `${model.replace(/[^a-z0-9.-]+/gi, '--')}.md`;

/** Відповідь any-llm → текст. Порожня відповідь чи поле error — збій (закон 4: мовчання на межі — не факт). */
export function outputOf(json) {
  if (json?.error) throw new Error(`модель повернула помилку: ${String(json.error).slice(0, 300)}`);
  const out = typeof json?.output === 'string' ? json.output : '';
  if (!out.trim()) throw new Error('порожня відповідь моделі');
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Через чергу fal: довга відповідь (> 5 хв) не обриває з'єднання, як прямий виклик (прогін 41193545217: «fetch failed»). */
async function ask({ model, reasoning }, system, prompt, key) {
  const headers = { Authorization: `Key ${key}`, 'Content-Type': 'application/json' };
  const body = { model, prompt, ...(system ? { system_prompt: system } : {}), ...(reasoning ? { reasoning: true } : {}) };
  const sub = await fetch(QUEUE, { method: 'POST', headers, body: JSON.stringify(body) });
  const subText = await sub.text();
  if (!sub.ok) throw new Error(`HTTP ${sub.status}: ${subText.slice(0, 300)}`);
  const { status_url: statusUrl, response_url: responseUrl } = JSON.parse(subText);
  const deadline = Date.now() + 20 * 60_000;
  for (;;) {
    if (Date.now() > deadline) throw new Error('немає відповіді за 20 хв');
    await sleep(5000);
    const st = await fetch(statusUrl, { headers });
    const sj = await st.json().catch(() => ({}));
    if (sj.status === 'COMPLETED') break;
    if (!st.ok && st.status !== 202) throw new Error(`статус HTTP ${st.status}`);
  }
  const res = await fetch(responseUrl, { headers });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  return outputOf(JSON.parse(text));
}

async function main() {
  const file = process.argv[2];
  const key = process.env.FAL_KEY;
  if (!file) throw new Error('вкажи файл брифу');
  if (!key) throw new Error('FAL_KEY не заданий у середовищі');
  const brief = parseBrief(readFileSync(file, 'utf8'), (p) => readFileSync(join(dirname(file), p), 'utf8'));
  const outDir = join('brain', 'Сценарій', 'drafts', basename(file, '.json'));
  mkdirSync(outDir, { recursive: true });
  const failed = [];
  for (const spec of brief.models) {
    const model = spec.model;
    try {
      const out = await ask(spec, brief.system, brief.prompt, key);
      writeFileSync(join(outDir, draftName(model)), `<!-- ${model} · ${new Date().toISOString().slice(0, 10)} · чернетка, не канон -->\n\n${out}\n`);
      console.log(`OK   ${model}: ${out.length} знаків`);
    } catch (e) {
      failed.push(model);
      console.log(`FAIL ${model}: ${e.message}`);
    }
  }
  if (failed.length === brief.models.length) throw new Error('жодна модель не відповіла');
  if (failed.length) console.log(`::warning::не відповіли: ${failed.join(', ')}`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((e) => { console.error(`::error::${e.message}`); process.exit(1); });
}
