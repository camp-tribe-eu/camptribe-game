// Вердикт запуску (GAME-56): помилки валять запуск (код 1), попередження — ні (код 0).
// Окремий модуль, щоб самотест перевіряв саме ту логіку коду виходу, яку бере validate-content.mjs.
import { isWarning } from './codes.mjs';

export function verdict(issues) {
  const errors = issues.filter((i) => !isWarning(i.code));
  const warnings = issues.filter((i) => isWarning(i.code));
  return { exitCode: errors.length ? 1 : 0, errors, warnings };
}
