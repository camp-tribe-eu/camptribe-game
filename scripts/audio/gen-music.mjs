#!/usr/bin/env node
// GAME-207 · власна фонова музика: детермінований синтез із нотних патернів (без чужих семплів і без випадковості поза сідом).
// Те саме джерело → той самий WAV → той самий OGG; ліцензія — наша, віддана як CC0 (docs/LICENSE_REGISTER.md SND-019…024).
// Кожна тема — коротка БЕЗШОВНА петля: хвости нот і луна загортаються по модулю довжини, тож шов не чути.
// Запуск: node scripts/audio/gen-music.mjs [--out public/audio] [--wav-dir <тека>] → public/audio/mus-*.ogg (моно, 22,05 кГц, Vorbis q2).
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, statSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const OUT = resolve(ROOT, arg('--out', 'public/audio'));
const WAV_DIR = arg('--wav-dir', join(tmpdir(), 'camptribe-music'));
const SR = 22050;

/** Детермінований PRNG (mulberry32): той самий сід — та сама мелодія. */
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);

// Тембри: гармоніки [кратність, амплітуда], обвідна ADSR (с), вібрато (Гц, глибина в півтонах).
export const INSTRUMENTS = {
  pad:     { h: [[1, 1], [2, 0.35], [3, 0.12], [4, 0.06]], a: 0.9, d: 0.6, s: 0.7, r: 1.6, vib: [4.5, 0.04] },
  piano:   { h: [[1, 1], [2, 0.5], [3, 0.25], [4, 0.12], [5, 0.06]], a: 0.004, d: 0.9, s: 0.0, r: 0.5, vib: [0, 0] },
  pluck:   { h: [[1, 1], [2, 0.6], [3, 0.3], [5, 0.1]], a: 0.003, d: 0.45, s: 0.0, r: 0.25, vib: [0, 0] },
  marimba: { h: [[1, 1], [4, 0.45], [9.2, 0.12]], a: 0.002, d: 0.35, s: 0.0, r: 0.2, vib: [0, 0] },
  bell:    { h: [[1, 1], [2.76, 0.35], [5.4, 0.15]], a: 0.002, d: 1.2, s: 0.0, r: 0.6, vib: [0, 0] },
  flute:   { h: [[1, 1], [2, 0.18], [3, 0.06]], a: 0.12, d: 0.2, s: 0.8, r: 0.3, vib: [5, 0.12] },
  bass:    { h: [[1, 1], [2, 0.3], [3, 0.08]], a: 0.01, d: 0.3, s: 0.5, r: 0.2, vib: [0, 0] },
};

/** Додає ноту в циклічний буфер: індекс береться по модулю довжини — хвіст після кінця петлі чути на її початку. */
function addNote(buf, startSec, midi, durSec, inst, gain) {
  const n = buf.length;
  const total = durSec + inst.r;
  const len = Math.floor(total * SR);
  const start = Math.floor(startSec * SR);
  const f0 = midiHz(midi);
  const [vf, vd] = inst.vib;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    let env;
    if (t < inst.a) env = t / inst.a;
    else if (t < inst.a + inst.d) env = 1 - (1 - inst.s) * ((t - inst.a) / inst.d);
    else if (t < durSec) env = inst.s;
    else env = inst.s * Math.max(0, 1 - (t - durSec) / inst.r);
    if (inst.s === 0 && t >= inst.a + inst.d) env = 0;   // ударні тембри: після спаду — тиша (рeліз не потрібен)
    if (env <= 0 && t > durSec) break;
    const f = vf > 0 ? f0 * 2 ** ((vd * Math.sin(2 * Math.PI * vf * t)) / 12) : f0;
    let s = 0;
    for (const [k, amp] of inst.h) { const hz = f * k; if (hz < SR / 2) s += amp * Math.sin(2 * Math.PI * hz * t); }
    buf[(start + i) % n] += s * env * gain;
  }
}

/** Луна/кімната: дві зворотні затримки по циклічному буферу (два оберти, щоб хвіст загорнувся на початок петлі). */
function reverb(buf, mix, delaysSec, fb) {
  const n = buf.length;
  const out = new Float32Array(n);
  const d = delaysSec.map((s) => Math.floor(s * SR));
  const lines = d.map((len) => new Float32Array(len));
  const pos = d.map(() => 0);
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      let wet = 0;
      for (let k = 0; k < d.length; k++) {
        const v = lines[k][pos[k]];
        wet += v;
        lines[k][pos[k]] = buf[i] + v * fb;
        pos[k] = (pos[k] + 1) % d[k];
      }
      if (pass === 1) out[i] = buf[i] + (wet / d.length) * mix;
    }
  }
  return out;
}

/** М'який односмуговий фільтр низьких частот (один полюс) — прибирає різкість. */
function lowpass(buf, hz) {
  const a = 1 - Math.exp(-2 * Math.PI * hz / SR);
  let y = 0;
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < buf.length; i++) { y += a * (buf[i] - y); if (pass === 1) buf[i] = y; }
  return buf;
}

function normalize(buf, peak) {
  let m = 0;
  for (const v of buf) m = Math.max(m, Math.abs(v));
  const g = m > 0 ? peak / m : 1;
  for (let i = 0; i < buf.length; i++) buf[i] *= g;
  return buf;
}

function wav(buf) {
  const bytes = Buffer.alloc(44 + buf.length * 2);
  bytes.write('RIFF', 0); bytes.writeUInt32LE(36 + buf.length * 2, 4); bytes.write('WAVE', 8);
  bytes.write('fmt ', 12); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(SR, 24); bytes.writeUInt32LE(SR * 2, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(buf.length * 2, 40);
  for (let i = 0; i < buf.length; i++) bytes.writeInt16LE(Math.round(Math.max(-1, Math.min(1, buf[i])) * 32767), 44 + i * 2);
  return bytes;
}

// Лади — лише приємні: мажорна пентатоніка (0 2 4 7 9) і натуральний мажор для акордів.
const PENTA = [0, 2, 4, 7, 9];
/** Акорди ступенями мажору: I, vi, IV, V, ii, iii (тризвуки). */
const CHORDS = { I: [0, 4, 7], vi: [9, 12, 16], IV: [5, 9, 12], V: [7, 11, 14], ii: [2, 5, 9], iii: [4, 7, 11] };

/**
 * Одна тема. Структура: такти по 4 долі; акорд на такт (прогресія по колу); бас на 1-шу й 3-тю долі; мелодія — крокова (сусідні
 * ступені пентатоніки частіше за стрибки), ритм із набору тривалостей; необов'язкове арпеджіо.
 */
export const TRACKS = {
  // Вступ: дощовий вечір за вікном. Повільно, тихо, піаніно рідкими нотами над подушкою.
  intro: { seed: 207001, bpm: 60, bars: 8, root: 57 /* A3 */, prog: ['I', 'vi', 'IV', 'V', 'I', 'IV', 'vi', 'V'], pad: ['pad', 0.16], bass: null,
    melody: ['piano', 0.5, [2, 2, 1, 1, 2], 12, 0.35], arp: null, reverb: [0.35, [0.211, 0.317], 0.35], lp: 3200 },
  // Дім і пакування: тепло, затишно, пощипування струн у середньому темпі.
  home: { seed: 207002, bpm: 84, bars: 12, root: 60 /* C4 */, prog: ['I', 'IV', 'vi', 'V', 'I', 'IV', 'ii', 'V'], pad: ['pad', 0.10], bass: ['bass', 0.22],
    melody: ['pluck', 0.42, [1, 1, 2, 0.5, 0.5, 1], 12, 0.3], arp: ['pluck', 0.14, 0.5], reverb: [0.22, [0.173, 0.251], 0.3], lp: 4200 },
  // Дорога: рівний пульс басу й світла мелодія — їдемо.
  road: { seed: 207003, bpm: 100, bars: 16, root: 62 /* D4 */, prog: ['I', 'V', 'vi', 'IV', 'I', 'V', 'IV', 'IV'], pad: ['pad', 0.09], bass: ['bass', 0.26, 'pulse'],
    melody: ['flute', 0.30, [1, 1, 2, 0.5, 0.5, 1, 1], 12, 0.25], arp: ['pluck', 0.12, 0.5], reverb: [0.18, [0.149, 0.223], 0.25], lp: 4500 },
  // Крамниця (GAME-204): легка весела мелодія на маримбі з дзвіночками.
  shop: { seed: 207004, bpm: 112, bars: 16, root: 65 /* F4 */, prog: ['I', 'IV', 'I', 'V', 'I', 'IV', 'V', 'I'], pad: ['pad', 0.07], bass: ['bass', 0.20],
    melody: ['marimba', 0.45, [0.5, 0.5, 1, 0.5, 0.5, 1, 2], 12, 0.4], arp: ['bell', 0.08, 1], reverb: [0.2, [0.131, 0.197], 0.25], lp: 5200 },
  // Табір удень: пташки вже у фоні, музика — спокійна флейта над подушкою, неспішно.
  'camp-day': { seed: 207005, bpm: 80, bars: 12, root: 60 /* C4 */, prog: ['I', 'IV', 'vi', 'IV', 'I', 'V', 'vi', 'IV', 'ii', 'V', 'I', 'I'], pad: ['pad', 0.12], bass: ['bass', 0.16],
    melody: ['flute', 0.32, [2, 1, 1, 2, 0.5, 0.5, 1], 12, 0.3], arp: ['pluck', 0.09, 1], reverb: [0.3, [0.197, 0.293], 0.35], lp: 3800 },
  // Табір увечері, біля вогнища: найповільніше й найтепліше — нижній регістр, довгі ноти.
  'camp-evening': { seed: 207006, bpm: 60, bars: 12, root: 55 /* G3 */, prog: ['I', 'vi', 'IV', 'I', 'vi', 'IV', 'V', 'I', 'IV', 'vi', 'V', 'I'], pad: ['pad', 0.18], bass: ['bass', 0.14],
    melody: ['piano', 0.38, [2, 2, 1, 1, 4], 12, 0.3], arp: null, reverb: [0.4, [0.233, 0.353], 0.4], lp: 2800 },
};

export function render(name, spec) {
  const beat = 60 / spec.bpm;
  const barSec = beat * 4;
  const lenSec = barSec * spec.bars;
  const buf = new Float32Array(Math.round(lenSec * SR));
  const rand = rng(spec.seed);
  const chordAt = (bar) => CHORDS[spec.prog[bar % spec.prog.length]];
  // Подушка: тризвук на такт, легато з перекриттям.
  if (spec.pad) {
    const [inst, g] = spec.pad;
    for (let b = 0; b < spec.bars; b++) for (const d of chordAt(b)) addNote(buf, b * barSec, spec.root - 12 + d, barSec * 0.98, INSTRUMENTS[inst], g);
  }
  // Бас: основний тон на 1-шу й квінта на 3-тю долю (режим pulse — на кожну долю).
  if (spec.bass) {
    const [inst, g, mode] = spec.bass;
    for (let b = 0; b < spec.bars; b++) {
      const c = chordAt(b);
      const beats = mode === 'pulse' ? [0, 1, 2, 3] : [0, 2];
      for (const k of beats) addNote(buf, b * barSec + k * beat, spec.root - 24 + (k % 2 === 0 ? c[0] : c[2] - 12), beat * 0.8, INSTRUMENTS[inst], g);
    }
  }
  // Арпеджіо: ноти акорду вгору на кожну долю (або половину).
  if (spec.arp) {
    const [inst, g, step] = spec.arp;
    for (let b = 0; b < spec.bars; b++) {
      const c = chordAt(b);
      let k = 0;
      for (let t = 0; t < 4 - 1e-9; t += step, k++) addNote(buf, b * barSec + t * beat, spec.root + c[k % 3] + (k % 6 >= 3 ? 12 : 0), beat * step * 0.9, INSTRUMENTS[inst], g);
    }
  }
  // Мелодія: крок по пентатоніці (±1 ступінь частіше, інколи ±2), на сильну долю — тон акорду; остання нота петлі веде до тоніки.
  if (spec.melody) {
    const [inst, g, rhythms, octave, rest] = spec.melody;
    let deg = 2;   // стартуємо з терції (ступінь 4 півтони)
    let t = 0;
    while (t < lenSec - 1e-9) {
      const dur = rhythms[Math.floor(rand() * rhythms.length)] * beat;
      const d = Math.min(dur, lenSec - t);
      const bar = Math.floor(t / barSec);
      const onBeat = Math.abs((t % barSec) % beat) < 1e-6;
      if (rand() < rest && !onBeat) { t += d; continue; }
      const r = rand();
      deg += r < 0.4 ? 1 : r < 0.75 ? -1 : r < 0.88 ? 2 : -2;
      deg = Math.max(0, Math.min(9, deg));   // дві октави пентатоніки
      let semis = PENTA[deg % 5] + 12 * Math.floor(deg / 5);
      if ((t % barSec) < 1e-6) {   // перша доля такту — найближчий тон акорду, щоб мелодія «сиділа» на гармонії
        const c = chordAt(bar);
        const cands = [...c, ...c.map((x) => x + 12)];
        semis = cands.reduce((best, x) => (Math.abs(x - semis) < Math.abs(best - semis) ? x : best), cands[0]);
      }
      if (t + d >= lenSec - 1e-9) semis = 0 + 12;   // остання нота — тоніка: петля замикається природно
      addNote(buf, t, spec.root + octave - 12 + semis, d * 0.95, INSTRUMENTS[inst], g);
      t += d;
    }
  }
  lowpass(buf, spec.lp);
  const wet = reverb(buf, ...spec.reverb);
  return { buf: normalize(wet, 0.7), lenSec };
}

function main() {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(WAV_DIR, { recursive: true });
  const rows = [];
  for (const [name, spec] of Object.entries(TRACKS)) {
    const { buf, lenSec } = render(name, spec);
    const wavPath = join(WAV_DIR, `mus-${name}.wav`);
    writeFileSync(wavPath, wav(buf));
    const ogg = join(OUT, `mus-${name}.ogg`);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wavPath, '-ac', '1', '-ar', String(SR), '-c:a', 'libvorbis', '-q:a', '2', ogg]);
    rmSync(wavPath);
    rows.push(`${name}: ${lenSec.toFixed(1)} с, ${statSync(ogg).size} Б → ${ogg}`);
  }
  console.log(rows.join('\n'));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
