// GAME-342 / GAME-353 · швидкий старт зразкового дня, винесений з main.ts, щоб його міг перевірити юніт-тест (крок за кроком, на справжньому містку).
// Це ТІ САМІ наміри ☰ (storyOffer → intents), у тому ж порядку «що далі» (nextAction); стан виходить такий самий, як після ручного проходу.
// GAME-353: без `skipHome` він зупиняється на порозі дому (герой, пролог, ST-003 активний) — ранок удома, крамницю й багажник гравець грає сам;
// з `skipHome` (лише e2e ?skipHome=1) проходить усе до дороги, як було до картки.
import type { CoreDefs } from '../core/defs';
import { SAMPLE_QUICK_STEPS, sampleHeroes, sampleHomeReady } from '../content/sample-day';
import { nextAction, sampleActions } from '../ui/story-focus';
import type { Bridge } from './world/bridge';
import { storyOffer, type StoryView } from './story-offer';

export type QuickResult = 'ok' | 'stuck' | 'skipped';

export function runSampleQuickStart(bridge: Pick<Bridge, 'state' | 'send'>, defs: CoreDefs, baseView: StoryView, skipHome: boolean): { readonly result: QuickResult; readonly at: string | null } {
  const view: StoryView = { ...baseView, mapFirst: false };
  const pick = (): string | undefined => {
    const o = storyOffer(bridge.state, defs, view).offer;
    if (o.dialogue !== null || bridge.state.game.player?.locationId === 'loc.road') return undefined;
    if (o.stage === 'create') return sampleHeroes(o.characters)[0]?.id;
    return nextAction(sampleActions(o.actions, true), o.goal?.key ?? null)?.id;
  };
  if (storyOffer(bridge.state, defs, view).offer.stage !== 'create') return { result: 'skipped', at: bridge.state.game.player?.locationId ?? null };
  for (let i = 0; i < SAMPLE_QUICK_STEPS; i++) {
    if (!skipHome && sampleHomeReady(bridge.state.game)) break;   // GAME-353: далі — ранок удома руками
    const id = pick();
    if (id === undefined) break;
    const intent = storyOffer(bridge.state, defs, view).intents.get(id);
    if (!intent) break;
    bridge.send(intent);
  }
  const at = bridge.state.game.player?.locationId ?? null;
  // «Там, де мав»: удома з активною крамницею (ST-003); з skipHome — на дорозі.
  return { result: (skipHome ? at === 'loc.road' : sampleHomeReady(bridge.state.game)) ? 'ok' : 'stuck', at };
}
