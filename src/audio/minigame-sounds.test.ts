// GAME-308 · звук результату міні-гри іде лише крізь єдиний мікшер і лише наявними файлами UI-звуків; «сяк-так» не звучить як покарання.
import { describe, expect, it } from 'vitest';
import { createUiSounds, UI_SOUND_FILES } from './ui-sounds';
import { RESULT_SOUND, type MinigameOutcome } from './minigame-sounds';

describe('звук результату міні-гри', () => {
  it('кожен із трьох результатів має наявний звук UI (нових ресурсів немає)', () => {
    for (const o of ['good', 'fine', 'scrappy'] as MinigameOutcome[]) expect(Object.keys(UI_SOUND_FILES), o).toContain(RESULT_SOUND[o]);
  });
  it('«сяк-так» не грає звук «назад/скасувати»: це не відмова', () => {
    expect(RESULT_SOUND.scrappy).not.toBe('back');
  });
  it('звук доходить до мікшера, а не повз нього (немає виходу — тиша, не виняток)', () => {
    const played: string[] = [];
    const sounds = createUiSounds({ play: (_bus: string, key: string) => { played.push(key); return true; } } as never);
    expect(sounds.play(RESULT_SOUND.good)).toBe(true);
    expect(played).toEqual([UI_SOUND_FILES[RESULT_SOUND.good].key]);
    const silent = createUiSounds({ play: () => false } as never);
    expect(silent.play(RESULT_SOUND.scrappy)).toBe(false);
  });
});
