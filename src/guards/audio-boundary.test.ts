// GAME-40 · звук — через ОДИН модуль (CLAUDE.md): поза src/audio/ ніхто не торкається звуку Phaser і WebAudio.
// Сторож самотестується: перевірка на підробних джерелах мусить червоніти (закон 1).
import { describe, expect, it } from 'vitest';

const RAW = import.meta.glob<string>(['../**/*.{ts,tsx}', '!../**/*.test.*', '!../**/*.d.ts', '!../audio/**'], { query: '?raw', import: 'default', eager: true });
const SOURCES: ReadonlyMap<string, string> = new Map(Object.entries(RAW).map(([k, v]) => [k.replace(/^\.\.\//, 'src/'), v]));

const FORBIDDEN = /\b(AudioContext|webkitAudioContext|HTMLAudioElement|OfflineAudioContext)\b|new\s+Audio\s*\(|\.sound\.(play|add|playAudioSprite|stopAll|pauseAll|resumeAll|removeAll|setVolume|setMute|setRate|volume|mute)\b|Phaser\.Sound\b/;

export function soundLeaks(sources: ReadonlyMap<string, string>): string[] {
  const out: string[] = [];
  for (const [file, text] of sources) {
    const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const m = FORBIDDEN.exec(code);
    if (m) out.push(`${file}: ${m[0]}`);
  }
  return out;
}

describe('сторож меж звуку (GAME-40)', () => {
  it('самотест: червоніє на кожному способі зіграти звук поза модулем', () => {
    for (const bad of ['const c = new AudioContext();', 'new Audio("a.ogg").play();', 'this.sound.play("x");', 'scene.sound.add("x");', 'const s: Phaser.Sound.BaseSound = q;', 'this.sound.volume = 0.5;', 'scene.sound.setMute(true);', 'game.sound.pauseAll();']) {
      expect(soundLeaks(new Map([['src/view/x.ts', bad]])), bad).toHaveLength(1);
    }
  });
  it('самотест: коментар зелений, а сам файл не порожній', () => {
    expect(soundLeaks(new Map([['src/view/x.ts', '// new AudioContext()\n/* this.sound.play */ export {};']]))).toEqual([]);
    expect(SOURCES.size).toBeGreaterThan(20);
  });
  it('у грі поза src/audio/ звук не чіпають', () => {
    expect(soundLeaks(SOURCES)).toEqual([]);
  });
});
