// Значок накладки «Поверни телефон» (GAME-96): телефон і стрілка повороту. Окремий файл поза src/ui (поруч із phone.ts) — це геометрія, а не текст для гравця.
export function RotateIcon() {
  return (
    <svg class="ui-rotate-icon" viewBox="0 0 64 64" width="96" height="96" aria-hidden="true" focusable="false">
      <rect x="22" y="6" width="20" height="36" rx="4" fill="none" stroke="currentColor" stroke-width="3" />
      <path d="M8 50c8 8 24 10 36 4m0 0-8-1m8 1 1-8" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}
