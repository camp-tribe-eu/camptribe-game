// GAME-280 · offerFocusKey: той самий вміст у новому об'єкті — той самий ключ (фокус не стрибає); змінилось, що натискати, — інший (GAME-80 лишається).
// Закон 1: мутація «ключ = випадкове/ідентичність об'єкта» червонить перший рядок; «ключ без actions / без репліки» — відповідні рядки нижче.
import { describe, expect, it } from 'vitest';
import { inSampleCamp, offerFocusKey, sampleActionsFirst, sampleMenuActions, startHintOn, type FocusOffer } from './story-focus';

const base = (): FocusOffer => ({
  stage: 'play', locationKey: 'loc.home',
  characters: [],
  actions: [{ id: 'a1', kind: 'visit', key: 'loc.shop', minutes: 10 }, { id: 'a2', kind: 'sleep', key: null }],
  locked: [{ id: 'l1', kind: 'buy', key: 'item.tent', shortCents: 500 }],
  dialogue: { speakerKey: 'npc.eliza', speakerId: 'npc.eliza', key: 'line.1', answers: [{ id: 'd1', kind: 'continue', key: null }] },
  packing: null,
});

describe('offerFocusKey (GAME-280)', () => {
  it('той самий вміст у свіжому об\'єкті — той самий ключ', () => { expect(offerFocusKey(base())).toBe(offerFocusKey(base())); });
  it('ключ не залежить від часу/погоди/грошей (їх у ключі немає — додаткові поля ігноруються)', () => {
    const o = { ...base(), day: 2, timeMinutes: 600, weather: 'rain', moneyCents: 1 } as FocusOffer;
    expect(offerFocusKey(o)).toBe(offerFocusKey(base()));
  });
  it('інший набір дій — інший ключ', () => { expect(offerFocusKey({ ...base(), actions: base().actions.slice(1) })).not.toBe(offerFocusKey(base())); });
  it('інша репліка розмови — інший ключ', () => {
    const b = base();
    const d = b.dialogue ?? { speakerKey: null, speakerId: null, key: null, answers: [] };
    expect(offerFocusKey({ ...b, dialogue: { ...d, key: 'line.2' } })).not.toBe(offerFocusKey(b));
  });
  it('розмова закрилась — інший ключ', () => { expect(offerFocusKey({ ...base(), dialogue: null })).not.toBe(offerFocusKey(base())); });
  it('інший етап (create → play) — інший ключ', () => { expect(offerFocusKey({ ...base(), stage: 'create' })).not.toBe(offerFocusKey(base())); });
  it('пакування відкрилось — інший ключ', () => {
    const p: NonNullable<FocusOffer['packing']> = { used: 0, capacity: 10, groups: [], taken: 0, leftKeys: [], load: null, overflow: [] } as unknown as NonNullable<FocusOffer['packing']>;
    expect(offerFocusKey({ ...base(), packing: p })).not.toBe(offerFocusKey(base()));
  });
});

// GAME-320 · ☰ у таборі зразкового дня: без стрибків часу. Мутація: sampleMenuActions повертає всі дії / inSampleCamp ігнорує табір → рядки червоні.
describe('GAME-320: ☰ у таборі зразкового дня', () => {
  const acts = [{ id: 'a1', kind: 'visit', key: 'loc.home', minutes: 203 }, { id: 'a2', kind: 'sleep', key: null }, { id: 'a3', kind: 'wait', key: null }, { id: 'a4', kind: 'rest', key: null }, { id: 'a5', kind: 'talk', key: 'npc.amina' }] as const;
  it('у таборі зразкового дня лишається лише те, що не крутить час', () => {
    expect(sampleMenuActions(acts, true).map((a) => a.kind)).toEqual(['talk']);
  });
  it('поза зразковим табором — усі дії як були', () => {
    expect(sampleMenuActions(acts, false)).toHaveLength(5);
    expect(inSampleCamp(true, 'loc.camp.lake')).toBe(true);
    expect(inSampleCamp(false, 'loc.camp.lake')).toBe(false);
    expect(inSampleCamp(true, 'loc.road')).toBe(false);   // до табору (збори, дорога) ☰ працює як раніше
    expect(inSampleCamp(true, null)).toBe(false);
  });
});

// GAME-325 · закон 1: мутація «startHintOn = !hintSeen» червонить перший рядок; «sampleActionsFirst = false» — другий.
describe('startHintOn / sampleActionsFirst (GAME-325)', () => {
  it('зразок показує підказку «Відкрий ☰» і коли hintSeen уже записано (перезавантаження, «Почати знову»)', () => { expect(startHintOn(true, true)).toBe(true); });
  it('звичайна гра: підказка лише поки ☰ не відкривали', () => { expect(startHintOn(false, false)).toBe(true); expect(startHintOn(false, true)).toBe(false); });
  it('зразок: панель без довідкового списку лише в не-компактному вигляді; звичайна гра — ніколи', () => {
    expect(sampleActionsFirst(true, false)).toBe(true);
    expect(sampleActionsFirst(true, true)).toBe(false);
    expect(sampleActionsFirst(false, false)).toBe(false);
  });
});
