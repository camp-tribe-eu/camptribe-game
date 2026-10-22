// Спільний журнал для тестів детермінізму (GAME-13). Не тест — фікстура.
import type { CoreDefs } from './defs';
import type { Input } from './sim';

export const SEED = 20261022;

/** Журнал на ~2 ігрові доби: кадри різної довжини, команди, пауза меню, довгі дії. */
export const LOG: readonly Input[] = (() => {
  const log: Input[] = [];
  for (let i = 0; i < 3000; i++) {
    log.push({ kind: 'frame', realMs: 16 + ((i * 7) % 40) * 25 });
    if (i % 97 === 0) log.push({ kind: 'command', command: { type: 'Interact', commandId: `g${i}`, targetId: `obj.spot_${i % 5}` } });
    if (i % 41 === 0) log.push({ kind: 'command', command: { type: 'BuyItem', commandId: `b${i}`, itemId: 'item.tent' } });
    if (i % 300 === 0) log.push({ kind: 'pause' }, { kind: 'frame', realMs: 5000 }, { kind: 'resume' });
    if (i % 500 === 0) log.push({ kind: 'advance', minutes: 480 });
  }
  return log;
})();

/** Каталог для журналу: 5 точок з одноразовою нагородою, намет за 3 €. */
export const DEFS: CoreDefs = {
  items: { 'item.tent': { buyCents: 300 } },
  interactions: Object.fromEntries([0, 1, 2, 3, 4].map((n) => [`obj.spot_${n}`, { grantId: `rw.spot_${n}`, moneyCents: 250 }])),
};

/** Відбиток, отриманий першим прогоном і зафіксований. Змінився — детермінізм зламано або змінено правила (тоді — свідомо, в PR). */
export const GOLDEN = 'c0cfbb35';
