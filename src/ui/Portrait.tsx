// GAME-179 · портрет того, хто говорить чи дає завдання: голова по плечі. Справжній (assets/portraits/*.png, GAME-49) чи запасний
// обрізок спрайта ходьби — вирішує порт (src/view/portraits.ts), UI лише малює картинку. Оповідач (id = null) — нейтральна іконка книжки.
// Картинка завжди <img>: тест бачить портрет однаково, відкіля б він не взявся (data-source: file | sprite | icon).
import { useState } from 'preact/hooks';

export interface PortraitSrc { readonly src: string; readonly kind: 'file' | 'sprite' }
/** `sprite: true` — не брати файл (він не завантажився): лише обрізок спрайта. */
export type PortraitLookup = (npcId: string | null, sprite?: boolean) => PortraitSrc | null;

/** Нейтральна іконка оповідача: розгорнута книжка. Малюється пікселями (crispEdges), без тексту й посилань. */
function NarratorIcon({ size }: { size: 'lg' | 'sm' }) {
  return (
    <svg class={`ui-portrait ui-portrait-icon ui-portrait-${size}`} data-ui="portrait" data-npc="narrator" data-source="icon" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <rect x="0" y="0" width="40" height="40" fill="#4a5a63" />
      <rect x="5" y="11" width="14" height="19" fill="#f4f1e8" />
      <rect x="21" y="11" width="14" height="19" fill="#f4f1e8" />
      <rect x="19" y="10" width="2" height="21" fill="#a8452a" />
      <rect x="7" y="14" width="10" height="2" fill="#8a8f94" />
      <rect x="7" y="18" width="10" height="2" fill="#8a8f94" />
      <rect x="7" y="22" width="7" height="2" fill="#8a8f94" />
      <rect x="23" y="14" width="10" height="2" fill="#8a8f94" />
      <rect x="23" y="18" width="10" height="2" fill="#8a8f94" />
      <rect x="23" y="22" width="7" height="2" fill="#8a8f94" />
    </svg>
  );
}

export function Portrait({ id, lookup, size }: { id: string | null; lookup: PortraitLookup; size: 'lg' | 'sm' }) {
  // Файл не завантажився (битий файл) — один раз пробуємо обрізок спрайта; не вийшло — іконка, а не порожня рамка.
  const [failed, setFailed] = useState<string | null>(null);
  const p = id === null ? null : lookup(id, failed === id);
  if (!p || id === null) return <NarratorIcon size={size} />;
  return <img class={`ui-portrait ui-portrait-${size}`} data-ui="portrait" data-npc={id} data-source={p.kind} src={p.src} alt="" draggable={false}
    onError={() => { if (failed !== id) setFailed(id); }} />;
}
