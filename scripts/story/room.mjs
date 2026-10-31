// GAME-198: «сценарна кімната» — один бриф кільком моделям через fal-ai/any-llm.
// Лише для СТВОРЕННЯ гри: чернетки лягають у brain/Сценарій/drafts/, у content/ їх переносить
// людина-редактор, далі валідатор. Гра під час проходження ШІ не викликає (CLAUDE.md).
// Ключ береться лише з середовища (FAL_KEY, секрет Actions) і ніде не друкується.
// Запуск: node scripts/story/room.mjs brain/Сценарій/briefs/<бриф>.json
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

const FAL = 'https://fal.run/fal-ai/any-llm';

/** Бриф: { models: string[], system?: string, prompt?: string, prompt_file?: string }. Помилка — текстом, не мовчки. */
export function parseBrief(raw, readFile) {
  const b = JSON.parse(raw);
  if (!Array.isArray(b.models) || b.models.length === 0) throw new Error('бриф: models — непорожній список моделей');
  if (b.prompt_file && (/(^|[\\/])\.\.([\\/]|$)/.test(b.prompt_file) || /^([\\/]|[a-z]:)/i.test(b.prompt_file))) throw new Error('бриф: prompt_file лише поруч із брифом, без .. і абсолютних шляхів');
  const prompt = b.prompt ?? (b.prompt_file ? readFile(b.prompt_file) : '');
  if (!prompt.trim()) throw new Error('бриф: порожній prompt (prompt або prompt_file)');
  return { models: b.models, system: b.system ?? '', prompt };
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

async function ask(model, system, prompt, key) {
  const res = await fetch(FAL, {
    method: 'POST',
    headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, ...(system ? { system_prompt: system } : {}) }),
  });
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
  for (const model of brief.models) {
    try {
      const out = await ask(model, brief.system, brief.prompt, key);
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
