// GAME-346 · чип цілі після міні-гри місії: «Повернутись до: <видавець>», а не «Допомогти сусідам» без імені.
// Мутації (перевірено): sampleGoalLine ігнорує port.report() → тест тексту червоніє; Shell не викликає sampleGoalLine → source-тест червоніє; main.ts: `report: reportGiver` видалити → tsc червоніє (поле обов'язкове),
// reportGiver/ціль без sampleReportGiver / sampleMissionTarget → source-тест червоніє; sampleReportGiver без перевірки відкритої розмови → «розмова з ним уже триває» червоніє.
import { describe, expect, it } from 'vitest';
import { t } from '../i18n';
import type { Key } from '../i18n';
import { ct } from '../i18n/content';
import { MISSIONS } from '../content/missions';
import type { GameState } from '../core/state';
import { sampleMissionTarget, sampleReportGiver } from '../view/mission-work';
import { sampleGoalLine, type SamplePort } from './SampleDay';
import shell from './Shell.tsx?raw';
import main from '../main.ts?raw';

const port = (over: Partial<SamplePort>): SamplePort => ({ goal: () => 'day', neighbours: () => ['npc.amina', 'npc.luc', 'npc.claire'], report: () => null, ...over } as unknown as SamplePort);

describe('sampleGoalLine', () => {
  for (const lang of ['uk', 'en'] as const) {
    const tr = (k: Key): string => t(lang, k);
    it(`${lang}: після міні-гри — лише видавець і «Повернутись до»; без неї — усі, хто чекає`, () => {
      expect(sampleGoalLine(port({ report: () => 'npc.claire' }), tr, lang)).toBe(`${tr('sd.goal.back')}: ${ct(lang, 'npc.claire')}`);
      expect(sampleGoalLine(port({}), tr, lang)).toBe(`${tr('sd.goal.day')}: ${['npc.amina', 'npc.luc', 'npc.claire'].map((id) => ct(lang, id)).join(', ')}`);
      expect(sampleGoalLine(port({ goal: () => null }), tr, lang)).toBe('');
      expect(sampleGoalLine(port({ goal: () => 'done' }), tr, lang)).toBe(tr('sd.goal.done'));
    });
  }
  it('вечір: «Ще чекає» не додається до «Повернутись до»', () => {
    const tr = (k: Key): string => t('uk', k);
    expect(sampleGoalLine(port({ goal: () => 'evening', report: () => 'npc.luc' }), tr, 'uk')).toBe(`${tr('sd.goal.back')}: ${ct('uk', 'npc.luc')}`);
  });
});

describe('проводка (GAME-346)', () => {
  const m = MISSIONS[2] ?? MISSIONS[0];
  const [a] = m?.trips ?? [];
  const g = (over: Partial<GameState> = {}): GameState => ({ flags: [a?.flag ?? ''], minigames: { [a?.minigame ?? '']: { last: 'good' } }, dialogue: null, ...over } as unknown as GameState);
  it('місія після міні-гри: ціль і видавець; не «живий» день — нічого', () => {
    expect(sampleReportGiver(g(), true)).toBe(m?.giver);
    expect(sampleMissionTarget(g(), true)).toBe(m?.giver);
    expect(sampleReportGiver(g(), false)).toBeNull();
    expect(sampleMissionTarget(g(), false)).toBeNull();
  });
  it('розмова з ним уже триває — «повернутись» нікуди', () => {
    expect(sampleReportGiver(g({ dialogue: { id: m?.dialogue ?? '', node: 'gate' } }), true)).toBeNull();
    expect(sampleReportGiver(g({ dialogue: { id: 'dlg.other', node: 'x' } }), true)).toBe(m?.giver);
  });
  it('Shell бере текст чипа з sampleGoalLine, main.ts віддає порту report і ціль через ці функції', () => {
    expect(shell).toContain('sampleGoalLine(port.sample, t, lang)');
    expect(main).toContain('  report: reportGiver,');
    expect(main).toContain('sampleReportGiver(bridge.state.game,');
    expect(main).toContain('sampleMissionTarget(bridge.state.game,');
    expect(main).toContain('targetSpot = trip ?? requestTarget');
  });
});
