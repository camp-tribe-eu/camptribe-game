// Рядок збірки для меню й баг-репортів: версія плюс ПОВНИЙ SHA коміту.
// Повний, бо скорочений SHA неоднозначний і мовчки віддає нуль прогонів CI (docs/TSYKL.md).

import { GAME_NAME } from '../config/brand';

const SHA = /^[0-9a-f]{40}$/;

export function buildLabel(version: string, commit: string): string {
  const sha = SHA.test(commit) ? commit : 'unknown';
  return `${GAME_NAME} v${version} · ${sha}`;
}
