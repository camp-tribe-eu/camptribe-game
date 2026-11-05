import { appendFileSync } from 'node:fs';
import { it } from 'vitest';
import { minuteOfDay } from '../core/clock';
import { newSim, step } from '../core/sim';
import { storyDay } from '../core/story';
import { GAME_DEFS } from './slice-defs';
import * as NEW from './replay.scenario';
import * as OLD from './zz-old-scenario';
const hh = (m: number): string => { const t = minuteOfDay(m); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
const BEATS = ['ST-004', 'ST-005', 'CH1-D2-001', 'CH1-D2-ELISE-001', 'CH1-D2-CAMP-001', 'CH1-D2-FIRE-001', 'CH1-D3-001', 'CH1-D3-ELISE-001', 'CH1-D3-HOME-001'];
for (const [name, sc] of [['ДО (main)', OLD], ['ПІСЛЯ', NEW]] as const) it(name, () => {
  let s = newSim(sc.SEED, sc.START_MONEY);
  const out: string[] = [`## ${name}`];
  for (const i of sc.PROLOGUE_BIKE) {
    const before = s;
    s = step(s, i, { defs: GAME_DEFS });
    if (i.kind === 'command') {
      const c = i.command as { type: string; questId?: string };
      if (c.type === 'CompleteQuest' && c.questId && BEATS.includes(c.questId) && s.game.quests[c.questId]?.status === 'completed' && before.game.quests[c.questId]?.status !== 'completed') out.push(`${c.questId}: ${hh(s.clock.minutes)} · день сюжету ${storyDay(s.game.slept)} · спав ${s.game.slept ?? 0}`);
      if (c.type === 'Sleep') out.push(`Sleep: ${hh(before.clock.minutes)} → ${hh(s.clock.minutes)}`);
    }
  }
  appendFileSync('/tmp/claude-0/timeline.txt', out.join('\n') + '\n');
});
