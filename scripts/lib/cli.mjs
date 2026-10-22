// Суворий розбір аргументів для всіх сторожів (закон 4). Незнайомий прапорець — вихід 2, а не
// тиха підміна: `--content <тека>` замість `--dir` раніше перевіряв content/ репозиторію і
// друкував PASS про чужу теку (експеримент GAME-19).
import { parseArgs } from 'node:util';

/** flags — булеві (`--self-test`), options — зі значенням (`--dir x`). Повертає { 'self-test': true, dir: 'x' }. */
export function cli({ flags = [], options = [], positionals = false } = {}) {
  const spec = Object.fromEntries([...flags.map((f) => [f, { type: 'boolean' }]), ...options.map((o) => [o, { type: 'string' }])]);
  try {
    const { values, positionals: pos } = parseArgs({ args: process.argv.slice(2), options: spec, strict: true, allowPositionals: positionals });
    // `--dir=` — порожній шлях резолвиться в поточну теку: перевірили б не те, що просили.
    for (const o of options) if (values[o] !== undefined && String(values[o]).trim() === '') throw new Error(`порожнє значення --${o}`);
    return { ...values, _: pos };
  } catch (e) {
    const allowed = [...flags.map((f) => `--${f}`), ...options.map((o) => `--${o} <значення>`)].join(', ') || 'жодних';
    console.log(`::error::CLI_UNKNOWN_ARG · ${e.message} · дозволено: ${allowed}`);
    process.exit(2);
  }
}
