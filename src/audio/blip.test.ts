// GAME-221 · планувальник «голосу» друку: які літери звучать, тон за мовцем, мікшер глушить. Мутації — у кінці файлу (ручний прогін описаний у PR).
import { describe, expect, it } from 'vitest';
import npcsRaw from '../../content/npcs.json?raw';
import { BLIP_EVERY, BLIP_PEAK, VOICE_HZ, blipDue, blipIndices, createBlipper, speakerPitch } from './blip';
import { DEFAULT_AUDIO, createMixer } from './mixer';

const chars = (s: string): string[] => Array.from(s);

describe('blipIndices', () => {
  it('кожна 3-тя озвучувана літера, починаючи з першої', () => {
    expect(BLIP_EVERY).toBe(3);
    expect(blipIndices(chars('abcdefgh'))).toEqual([0, 3, 6]);
  });
  it('пробіл і розділові знаки мовчать і не рахуються', () => {
    // a b c d e → озвучені: a(0) b(2) c(5) d(8) e(11); звучать 1-ша й 4-та
    expect(blipIndices(chars('a b, c. d! e'))).toEqual([0, 8]);
    expect(blipIndices(chars('… — «»  '))).toEqual([]);
  });
  it('кирилиця й літери понад BMP рахуються за кодовими точками', () => {
    expect(blipIndices(chars('Вікторія'))).toEqual([0, 3, 6]);
    expect(blipIndices(chars('😀😀абвг'))).toEqual([2, 5]);
  });
  it('порожній рядок і крок < 1 безпечні', () => {
    expect(blipIndices([])).toEqual([]);
    expect(blipIndices(chars('abc'), 0)).toEqual([0, 1, 2]);
  });
  it('частота: у реплісі ~110 знаків звучить не більше третини літер', () => {
    const line = 'Вікторія: «Ну що, перша ніч минула, а ми все ще розмовляємо одне з одним».';
    expect(blipIndices(chars(line)).length).toBeLessThanOrEqual(Math.ceil(chars(line).length / 3));
  });
});

describe('blipDue', () => {
  it('кадр, що показав літери [from, to), звучить, якщо в ньому є blip; не більше одного запиту за кадр', () => {
    const idx = [0, 3, 6];
    expect(blipDue(idx, 0, 1)).toBe(true);
    expect(blipDue(idx, 1, 3)).toBe(false);
    expect(blipDue(idx, 1, 4)).toBe(true);
    expect(blipDue(idx, 7, 20)).toBe(false);
    expect(blipDue(idx, 4, 4)).toBe(false);
  });
});

describe('speakerPitch', () => {
  it('Джордж, Вікторія, Метью і кожен NPC зі складу мають власний тон', () => {
    const npcs = (JSON.parse(npcsRaw) as { id: string }[]).map((n) => n.id);
    expect(npcs.length).toBeGreaterThanOrEqual(10);
    const hz = npcs.map((id) => { expect(VOICE_HZ[id], `${id} без тону в VOICE_HZ`).toBeDefined(); return speakerPitch(id); });
    const all = [...hz, speakerPitch('player'), speakerPitch(null)];
    expect(new Set(all).size).toBe(all.length);
    const sorted = [...all].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) expect((sorted[i] ?? 0) / (sorted[i - 1] ?? 1), 'різниця менш як пів тону').toBeGreaterThan(1.05);
  });
  it('у сценах мовця називає підпис у тексті (імена дає викликач, будь-якою мовою), він важливіший за speakerId', () => {
    const uk = { 'npc.victoria': 'Вікторія', 'npc.matthew': 'Метью', 'npc.george': 'Джордж', 'npc.nora': 'Нора' };
    const en = { 'npc.victoria': 'Victoria', 'npc.matthew': 'Matthew', 'npc.george': 'George', 'npc.nora': 'Nora' };
    expect(speakerPitch('player', 'Вікторія: «Ну що»', uk)).toBe(speakerPitch('npc.victoria'));
    expect(speakerPitch('player', 'Matthew: “Fine”', en)).toBe(speakerPitch('npc.matthew'));
    expect(speakerPitch('player', '  Джордж: «Це для темряви»', uk)).toBe(speakerPitch('npc.george'));
    expect(speakerPitch('player', 'Нора простягає пакуночок.', uk)).toBe(speakerPitch('player'));   // без двокрапки — не підпис
    expect(speakerPitch('player', 'Вікторія: «Ну що»')).toBe(speakerPitch('player'));               // імен не дали — speakerId
  });
  it('невідомий мовець — стабільний тон у розумному діапазоні', () => {
    const a = speakerPitch('npc.newcomer');
    expect(speakerPitch('npc.newcomer')).toBe(a);
    expect(a).toBeGreaterThanOrEqual(160);
    expect(a).toBeLessThan(400);
  });
});

function rig(audio = DEFAULT_AUDIO, hasCtx = true) {
  let created = 0;
  const osc: { frequency: { value: number } }[] = [];
  const gains: number[] = [];
  const ctx = {
    currentTime: 0, destination: {},
    createOscillator: () => { const o = { type: '', frequency: { value: 0 }, connect() {}, start() {}, stop() {} }; osc.push(o); return o; },
    createGain: () => ({ gain: { setValueAtTime() {}, linearRampToValueAtTime: (v: number) => { gains.push(v); }, exponentialRampToValueAtTime() {} }, connect() {} }),
  };
  const b = createBlipper(createMixer(audio), () => { created++; return hasCtx ? ctx : null; });
  return { b, osc, gains, created: () => created };
}

describe('createBlipper', () => {
  it('грає тоном мовця з гучністю sfx × master × пік', () => {
    const { b, osc, gains } = rig({ master: 0.5, sfx: 0.5, music: 0.6, muted: false });
    expect(b.blip(294)).toBe(true);
    expect(osc[0]?.frequency.value).toBe(294);
    expect(gains[0]).toBeCloseTo(0.25 * BLIP_PEAK, 6);
  });
  it('звук вимкнено: ні blip, ні AudioContext', () => {
    const r = rig({ ...DEFAULT_AUDIO, muted: true });
    expect(r.b.blip(220)).toBe(false);
    expect(r.created()).toBe(0);
    expect(r.osc).toHaveLength(0);
  });
  it('гучність 0 (sfx чи master) — тиша', () => {
    expect(rig({ ...DEFAULT_AUDIO, sfx: 0 }).b.blip(220)).toBe(false);
    expect(rig({ ...DEFAULT_AUDIO, master: 0 }).b.blip(220)).toBe(false);
  });
  it('немає WebAudio — тиша без винятку', () => {
    expect(rig(DEFAULT_AUDIO, false).b.blip(220)).toBe(false);
  });
  it('контекст «suspended» (політика автовідтворення) будять перед звуком', () => {
    let resumed = 0;
    const ctx = {
      currentTime: 0, destination: {}, state: 'suspended', resume: () => { resumed++; },
      createOscillator: () => ({ type: '', frequency: { value: 0 }, connect() {}, start() {}, stop() {} }),
      createGain: () => ({ gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }),
    };
    expect(createBlipper(createMixer(DEFAULT_AUDIO), () => ctx).blip(220)).toBe(true);
    expect(resumed).toBe(1);
  });
});
