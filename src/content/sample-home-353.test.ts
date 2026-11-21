// GAME-353 · зразковий день ПОЧИНАЄТЬСЯ вдома: дім → крамниця → дім (збір, «Багажник») → дорога. Крок за кроком на справжньому містку й справжніх об'єктах мапи (resolveSpot),
// без ярликів: те, що гравець робить ногами, тут — ті самі ходи ядра.
// Закон 1 — кожна ланка має мутацію (перевірено, див. звіт картки):
//   M1 sampleHomePhase → false ...................... «фаза дому живе за станом» і «до виїзду на дорогу» червоніють
//   M2 швидкий старт не зупиняється на порозі дому ... «старт зупиняється вдома» червоніє (герой уже на дорозі, крамницю пропущено)
//   M3 sampleExtra не передає прапорців гри в ніч ... «лишений ліхтар → темна ніч» червоніє (зв'язок «вдома → табір» обірвано)
//   M4 NO_LAMP вказує на інший прапорець ............ той самий тест червоніє
//   M5 sampleHomePhase ігнорує результат дороги ..... «після дороги фаза дому скінчена» червоніє
import { describe, expect, it } from 'vitest';
import { fromSave, serialize } from '../core/save';
import { createBridge } from '../view/world/bridge';
import { runSampleQuickStart } from '../view/sample-quick-start';
import { PANEL_VIEW } from '../view/story-offer';
import { GAME_DEFS } from './slice-defs';
import { SAMPLE_HOLD_MINUTE, sampleExtra, sampleHomePhase, sampleHomeReady } from './sample-day';
import { resolveSpot, unpackMoves } from './map-first';
import { NIGHT_FACTS, nightOf, type NightFacts } from './camp-night';
import { packFlag, leftFlag } from '../core/packing';
import type { Intent } from '../view/world/bridge';

const fresh = () => createBridge(7, GAME_DEFS, undefined, undefined, SAMPLE_HOLD_MINUTE);
type B = ReturnType<typeof fresh>;
const g = (b: B) => b.state.game;
const at = (b: B): string | null => g(b).player?.locationId ?? null;
const must = (b: B, name: string) => { const r = resolveSpot(b.state, GAME_DEFS, name); if (!r) throw new Error(`${name} мертвий: ${at(b)} ${JSON.stringify(g(b).quests)}`); return r; };
const doSpot = (b: B, name: string): void => { for (const m of must(b, name).moves) b.send(m as Intent); };

/** Нова гра → швидкий старт зразка (як у main.ts) → гравець на порозі дому. */
function home(): B {
  const b = fresh();
  expect(runSampleQuickStart(b, GAME_DEFS, PANEL_VIEW, false).result).toBe('ok');
  return b;
}
/** Поїздка авто: об'єкт `obj.vehicle` веде туди, куди каже сюжет (одна відповідь «їдемо»). */
const drive = (b: B): void => doSpot(b, 'obj.vehicle');
const NEEDED = ['item.tent', 'item.sleeping-bag', 'item.documents', 'item.wallet', 'item.water', 'item.simple-dinner'] as const;
const EXTRAS = ['item.lantern', 'item.snacks', 'item.phones', 'item.first-aid', 'item.clothes'] as const;

/** Крамниця руками: три речі з полиці й каса (оплата + завершення ST-003). */
function shop(b: B): void {
  drive(b);
  for (const it of ['tent', 'sleeping-bag', 'lantern']) doSpot(b, `take.item.${it}`);
  doSpot(b, 'obj.buy');
}
/** Дім після крамниці: «розпакувати як радить гра» (як main.ts), узяти речі з контейнерів, «Багажник» (що не влізло — лишити), завантажити. */
function pack(b: B, take: readonly string[], leave: readonly string[] = []): void {
  drive(b);   // з крамниці додому
  for (const m of unpackMoves(b.state, GAME_DEFS)) b.send(m as Intent);
  for (const itemId of take) b.send({ type: 'TakeItem', itemId });
  for (const itemId of leave) b.send({ type: 'LeaveItem', itemId });
  b.send({ type: 'LoadCar' });
}

describe('GAME-353: зразок починається вдома', () => {
  it('швидкий старт зупиняється на порозі дому: герой-родина в авто, пролог закрито, крамницю ще не відвідано', () => {
    const b = home();
    expect(at(b)).toBe('loc.home');
    expect(sampleHomeReady(g(b))).toBe(true);
    expect(g(b).quests['ST-003']?.status).toBe('active');
    for (const q of ['PROLOGUE-HOME-001', 'ST-001', 'ST-002']) expect(g(b).quests[q]?.status).toBe('completed');
    expect(g(b).inventory, 'речей ще нема: їх треба купити й узяти').toEqual({});
    expect(g(b).moneyCents).toBe(5_000);
    expect(g(b).minigames?.['mg.drive'], 'дорогу ще не їхано').toBeUndefined();
    expect(sampleHomePhase(g(b))).toBe(true);
  });
  it('без кроку «крамниця» шляху на дорогу нема: авто з дому веде лише до крамниці', () => {
    const b = home();
    expect(must(b, 'obj.vehicle').moves).toEqual([{ type: 'Visit', locationId: 'loc.shop' }]);
  });
  it('порядок: дім → крамниця (гроші) → дім (збір, багажник) → дорога; фаза дому живе до виїзду на дорогу', () => {
    const b = home();
    const phases: string[] = [];
    const note = (): void => { phases.push(`${at(b)}:${sampleHomePhase(g(b))}`); };
    note();
    shop(b);
    note();
    expect(at(b)).toBe('loc.shop');
    expect(g(b).inventory['item.tent']).toBe(1);
    expect(g(b).inventory['item.sleeping-bag']).toBe(1);
    expect(g(b).quests['ST-003']?.status, 'каса закрила ST-003').toBe('completed');
    const left = g(b).moneyCents;
    expect(left, 'куплено в межах бюджету (50 € — 24,99 + 9,99 + 4,99)').toBe(5_000 - 2_499 - 999 - 499);
    pack(b, [...NEEDED, ...EXTRAS]);
    note();
    expect(at(b)).toBe('loc.home');
    expect(g(b).quests['CH1-HOME-001']?.status).toBe('active');
    drive(b);   // «У дорогу»: CH1-HOME-001 закрито, виїзд на дорогу
    note();
    expect(at(b)).toBe('loc.road');
    expect(phases).toEqual(['loc.home:true', 'loc.shop:true', 'loc.home:true', 'loc.road:false']);
  });
  it('після результату дороги фаза дому скінчена, навіть коли стоїш у домі (повернення не відкриває її знову)', () => {
    const b = home();
    shop(b); pack(b, [...NEEDED]); drive(b);
    b.send({ type: 'FinishMinigame', minigameId: 'mg.drive', outcome: 'fine' } as Intent);
    const p = g(b).player;
    if (p === null) throw new Error('героя нема');
    expect(sampleHomePhase({ ...g(b), player: { ...p, locationId: 'loc.home' } })).toBe(false);
  });
});

describe('GAME-353: лишене вдома відчує табір', () => {
  /** Прапорці після дому → ніч за ТОЮ САМОЮ моделлю, що й у зразку (sampleExtra бере прапорці гри). */
  const lanternBeat = (flags: readonly string[]): string => {
    const f: NightFacts = { ...NIGHT_FACTS, results: { lanterns: 'good' }, litLanterns: 3, ...sampleExtra(flags) };
    return nightOf(f).beats.find((x) => x.routine === 'lanterns')?.id as string;
  };
  it('ліхтар лишили в «Багажнику» (LeaveItem) → прапорець f.left-lantern → ніч темна', () => {
    const b = home();
    shop(b); pack(b, [...NEEDED, ...EXTRAS], ['item.lantern']);
    const flags = g(b).flags;
    expect(flags).toContain(leftFlag('item.lantern'));
    expect(flags).not.toContain(packFlag('item.lantern'));
    expect(lanternBeat(flags)).toBe('night.light.dark');
  });
  it('контроль: ліхтар поїхав у авто → ніч НЕ темна (зв’язок справжній, а не «завжди темно»)', () => {
    const b = home();
    shop(b); pack(b, [...NEEDED, ...EXTRAS]);
    expect(g(b).flags).toContain(packFlag('item.lantern'));
    expect(g(b).flags).not.toContain(leftFlag('item.lantern'));
    expect(lanternBeat(g(b).flags)).toBe('night.light.bright');
  });
});

describe('GAME-353: сейв і перезавантаження посеред дому', () => {
  const roundTrip = (b: B) => {
    const back = fromSave(serialize(b.state));
    if (!back.ok) throw new Error(`${back.code}: ${back.detail}`);
    return back.sim;
  };
  it('на порозі дому, у крамниці з кошиком і вдома після збору — стан читається назад і фаза та сама (відновлюється, а не починається знову)', () => {
    const b = home();
    const s0 = roundTrip(b);
    expect(sampleHomePhase(s0.game)).toBe(true);
    expect(sampleHomeReady(s0.game)).toBe(true);
    drive(b); doSpot(b, 'take.item.tent');   // у крамниці: річ у кошику
    const s1 = roundTrip(b);
    expect(s1.game.player?.locationId).toBe('loc.shop');
    expect(s1.game.flags).toEqual(g(b).flags);
    expect(sampleHomePhase(s1.game)).toBe(true);
    doSpot(b, 'take.item.sleeping-bag'); doSpot(b, 'take.item.lantern'); doSpot(b, 'obj.buy');
    pack(b, [...NEEDED, 'item.lantern'], []);
    const s2 = roundTrip(b);
    expect(s2.game.player?.locationId).toBe('loc.home');
    expect(s2.game.flags).toEqual(g(b).flags);
    expect(s2.game.quests).toEqual(g(b).quests);
    expect(s2.game.inventory).toEqual(g(b).inventory);
    expect(sampleHomePhase(s2.game)).toBe(true);
    // Завантажений стан не «перезапускає» епізод: швидкий старт бачить не-«create» і мовчить.
    const loaded = fresh();
    loaded.load(s2);
    expect(runSampleQuickStart(loaded, GAME_DEFS, PANEL_VIEW, false).result).toBe('skipped');
    expect(loaded.state.game.flags).toEqual(g(b).flags);
    // …і продовжується: з відновленого стану авто так само веде на дорогу.
    drive(loaded);
    expect(loaded.state.game.player?.locationId).toBe('loc.road');
  });
  it('сейв стану дому далеко під стелею (500 КБ)', () => {
    const b = home();
    shop(b); pack(b, [...NEEDED, ...EXTRAS]);
    expect(serialize(b.state).length).toBeLessThan(500 * 1024);
  });
});

describe('GAME-353: ?skipHome=1 (лише e2e) — як до картки', () => {
  it('швидкий старт доходить до дороги сам, з усім спакованим', () => {
    const b = fresh();
    expect(runSampleQuickStart(b, GAME_DEFS, PANEL_VIEW, true)).toEqual({ result: 'ok', at: 'loc.road' });
    expect(sampleHomePhase(g(b))).toBe(false);
    expect(g(b).inventory['item.tent']).toBe(1);
  });
});

// За рецензією: до створення героя (холодний старт) — це вже фаза дому, а не табір. Мутація (перевірено): прибрати `g.player === null ||` → червоне.
describe('GAME-353 · фаза дому до героя', () => {
  it('без героя й без дороги — фаза дому', () => {
    expect(sampleHomePhase({ player: null, minigames: {} } as never)).toBe(true);
  });
});
