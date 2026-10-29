// GAME-180 · картка прохання: що зробити одним рядком, цілі КАРТИНКАМИ (іконка + підпис), рядок нагороди. Портрет просильника й кнопки
// «Беруся» / «Пізніше» дає рамка розмови (DialogueBox): картка стоїть над кнопками й сама нічого не надсилає. Нагорода — дані для GAME-181.
// Іконки — власні пікселі (rect, crispEdges), без зовнішніх файлів і без тексту всередині.
import { ct } from '../i18n/content';
import type { AnyLang, Key } from '../i18n';
import type { OfferRequestCard } from './story-types';

const C = { ink: '#1b1f23', grey: '#8a8f94', light: '#cfd3d6', red: '#c8432b', green: '#4f9a45', gold: '#e0a458', sky: '#6ec1ff', brown: '#8a5a2b', cream: '#f4efe6' };
type R = readonly [x: number, y: number, w: number, h: number, fill: string];
const ICONS: Readonly<Record<string, readonly R[]>> = {
  // мішок зі сміттям і пляшка
  litter: [[2, 6, 8, 8, C.grey], [3, 4, 6, 2, C.grey], [5, 2, 2, 2, C.ink], [3, 8, 4, 1, C.light], [11, 5, 3, 9, C.sky], [12, 3, 1, 2, C.sky], [11, 9, 3, 1, C.cream]],
  // птах
  bird: [[3, 7, 8, 4, C.brown], [9, 5, 4, 4, C.brown], [12, 6, 3, 1, C.gold], [11, 6, 1, 1, C.ink], [1, 9, 3, 2, C.brown], [5, 11, 1, 3, C.ink], [8, 11, 1, 3, C.ink], [5, 5, 4, 2, C.light]],
  // ланки ланцюга
  chain: [[1, 5, 6, 6, C.grey], [3, 7, 2, 2, '#0000'], [9, 5, 6, 6, C.grey], [11, 7, 2, 2, '#0000'], [5, 7, 6, 2, C.light]],
  // ліхтар
  lantern: [[5, 1, 6, 2, C.ink], [4, 3, 8, 10, C.gold], [6, 5, 4, 6, C.cream], [4, 13, 8, 2, C.ink], [7, 0, 2, 1, C.ink]],
  // печиво з шматочками шоколаду
  cookie: [[3, 3, 10, 10, C.gold], [2, 5, 12, 6, C.gold], [5, 5, 2, 2, C.brown], [9, 7, 2, 2, C.brown], [6, 10, 2, 2, C.brown], [10, 4, 1, 1, C.brown]],
  // камера (GAME-184)
  camera: [[2, 5, 12, 8, C.ink], [5, 3, 4, 2, C.ink], [6, 7, 4, 4, C.sky], [7, 8, 2, 2, C.cream], [11, 6, 2, 1, C.gold]],
  // частина зоряної карти: аркуш із зіркою
  star: [[2, 2, 12, 12, C.cream], [7, 4, 2, 8, C.gold], [4, 7, 8, 2, C.gold], [6, 6, 4, 4, C.gold], [2, 2, 12, 1, C.brown], [2, 13, 12, 1, C.brown]],
  // дроти радіо
  wire: [[1, 4, 6, 2, C.red], [7, 4, 2, 8, C.red], [9, 10, 6, 2, C.sky], [1, 12, 6, 2, C.sky], [6, 3, 4, 2, C.gold], [6, 11, 4, 2, C.gold]],
  // яблуко
  apple: [[3, 5, 10, 8, C.red], [4, 4, 8, 1, C.red], [5, 13, 6, 1, C.red], [7, 2, 2, 3, C.brown], [9, 2, 3, 2, C.green], [5, 6, 2, 2, '#ffffff66']],
};

export function RequestIcon({ icon }: { icon: string }) {
  const parts = ICONS[icon] ?? ICONS.litter ?? [];
  return (
    <svg class="ui-req-icon" data-ui="req-icon" data-icon={icon} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      {parts.map(([x, y, w, h, fill], i) => (fill === '#0000' ? null : <rect key={i} x={x} y={y} width={w} height={h} fill={fill} />))}
    </svg>
  );
}

export function RequestCard({ card, lang, t }: { card: OfferRequestCard; lang: AnyLang; t: (k: Key) => string }) {
  const r = card.reward;
  // Однакові цілі (три шматки сміття) — одна картинка з «×3»: картка лишається компактною на вузькому екрані.
  const groups = card.goals.reduce<{ icon: string; label: string; count: number }[]>((acc, g) => { const label = ct(lang, g.labelKey); const hit = acc.find((x) => x.icon === g.icon && x.label === label); if (hit) hit.count++; else acc.push({ icon: g.icon, label, count: 1 }); return acc; }, []);
  const skills = r.skills.map((s) => t(`ui.req.${s}` as Key)).join(', ');
  return (
    <div class="ui-req-card" data-ui="req-card" data-request={card.id}>
      <p class="ui-req-title" data-ui="req-title">{ct(lang, card.titleKey)}</p>
      <p class="ui-req-goal" data-ui="req-goal">{ct(lang, card.goalKey)}</p>
      <ul class="ui-req-goals" data-ui="req-goals" aria-label={t('ui.req.goals')}>
        {groups.map((g) => (
          <li key={`${g.icon}|${g.label}`} data-ui="req-goal-pic" data-icon={g.icon} data-count={g.count}><RequestIcon icon={g.icon} /><span>{g.label}{g.count > 1 ? ` ×${g.count}` : ''}</span></li>
        ))}
      </ul>
      <p class="ui-req-reward" data-ui="req-reward" data-xp={r.xp} data-om={r.om}>{`${t('ui.req.reward')}: +${r.xp} ${t('ui.req.xp')} · +${r.om} ${t('ui.req.om')}${skills ? ` · ${skills}` : ''}`}</p>
    </div>
  );
}
