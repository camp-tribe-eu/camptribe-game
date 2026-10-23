// Рядок збірки для меню й баг-репортів: версія плюс ПОВНИЙ SHA коміту.
// Повний, бо скорочений SHA неоднозначний і мовчки віддає нуль прогонів CI (docs/TSYKL.md).

const SHA = /^[0-9a-f]{40}$/;

export function buildLabel(version: string, commit: string): string {
  const sha = SHA.test(commit) ? commit : 'unknown';
  return `CampLife v${version} · ${sha}`;
}
