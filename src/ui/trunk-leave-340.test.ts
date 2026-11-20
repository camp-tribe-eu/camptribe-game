// GAME-340 · «Не влазить»: остання зайва річ лишена → ☰ закривається і ТОЙ САМИЙ крок відкриває «Куди їдемо?» (setPaused(false) → actOnMap('obj.vehicle')), без другої «Дії».
// Чесно: e2e game-337-trunk цей шлях проходить і без цього гачка (рамка вже з'являється іншим шляхом), тож гачок — страховка від порядку ефектів; тут його тримає сторож за текстом.
// Мутація (перевірено): прибрати з setPaused рядок `if (vehicleAfterClose) …` → червоніє.
import { describe, expect, it } from 'vitest';
import mainSource from '../main.ts?raw';
import panelSource from './StoryPanel.tsx?raw';

describe('GAME-340 · «Не влазить»: лічильник і продовження', () => {
  it('остання лишена річ готує «Куди їдемо?», а закриття ☰ її відкриває', () => {
    expect(mainSource).toContain("vehicleAfterClose = backpack.length === 0 && !switches.panelActs;");
    expect(mainSource).toContain("if (vehicleAfterClose) { vehicleAfterClose = false; actOnMap('obj.vehicle'); }");
  });
  it('екран показує живий лічильник із довжини списку «лишити»', () => {
    expect(panelSource).toContain('data-ui="pack-left" data-left={offer.packing.overflow.length}');
  });
});
