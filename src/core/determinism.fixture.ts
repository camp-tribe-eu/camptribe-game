// Спільний журнал для тестів детермінізму (GAME-13). Не тест — фікстура.
import type { Input } from './sim';

export const SEED = 20261022;

/** Журнал на ~2 ігрові доби: кадри різної довжини, команди, пауза меню, довгі дії. */
export const LOG: readonly Input[] = (() => {
  const log: Input[] = [];
  for (let i = 0; i < 3000; i++) {
    log.push({ kind: 'frame', realMs: 16 + ((i * 7) % 40) * 25 });
    if (i % 97 === 0) log.push({ kind: 'command', command: { type: 'GrantReward', commandId: `g${i}`, grantId: `rw.${i % 5}`, moneyCents: 250 } });
    if (i % 41 === 0) log.push({ kind: 'command', command: { type: 'BuyItem', commandId: `b${i}`, itemId: 'item.tent', priceCents: 300 } });
    if (i % 300 === 0) log.push({ kind: 'pause' }, { kind: 'frame', realMs: 5000 }, { kind: 'resume' });
    if (i % 500 === 0) log.push({ kind: 'advance', minutes: 480 });
  }
  return log;
})();

/** Відбиток, отриманий першим прогоном і зафіксований. Змінився — детермінізм зламано або змінено правила (тоді — свідомо, в PR). */
export const GOLDEN = '8065fdc0';
