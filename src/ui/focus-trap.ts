// Пастка фокуса для модальних діалогів (GAME-89 №5). Діалоги мають aria-modal="true", але самі браузери Tab не замикають:
// після останньої кнопки фокус вилітав на <body> (і лише потім замикався на початок). Тут Tab і Shift+Tab ходять по колу
// всередині діалогу — так само, як обіцяє aria-modal.

/** Закрите <details> ховає все, крім свого <summary>, але getClientRects у Chromium дає для вмісту прямокутники — тож перевіряємо явно. */
function inClosedDetails(el: HTMLElement, root: HTMLElement): boolean {
  for (let p = el.parentElement, child: HTMLElement = el; p && p !== root; child = p, p = p.parentElement) {
    if (p instanceof HTMLDetailsElement && !p.open && !(child.tagName === 'SUMMARY' && child.parentElement === p)) return true;
  }
  return false;
}

/** Елементи діалогу, на які дійде Tab: видимі (закрите <details> ховає вміст — до нього Tab не доходить). */
export function tabbables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])')].filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && !inClosedDetails(el, root));
}

/** Обробник keydown діалогу: Tab з краю веде на протилежний край; фокус поза діалогом чи на його заголовку (tabindex -1) — теж у коло. */
export function trapTab(e: KeyboardEvent, root: HTMLElement): void {
  if (e.key !== 'Tab' || e.altKey || e.ctrlKey || e.metaKey) return;
  const list = tabbables(root);
  const first = list[0];
  const last = list[list.length - 1];
  if (!first || !last) { e.preventDefault(); return; }
  const active = document.activeElement;
  const inside = active instanceof HTMLElement && root.contains(active);
  const before = (a: Node, b: Node): boolean => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  if (e.shiftKey) {
    // Shift+Tab: з першої кнопки, з елемента перед нею (заголовок) чи ззовні діалогу — на останню.
    if (!inside || active === first || (active !== last && !list.includes(active as HTMLElement) && before(active as Node, first))) { e.preventDefault(); last.focus(); }
  } else if (!inside || active === last || (!list.includes(active as HTMLElement) && before(last, active as Node))) {
    e.preventDefault();
    first.focus();
  }
}
