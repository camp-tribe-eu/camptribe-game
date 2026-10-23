import { describe, expect, it } from 'vitest';
import v1 from '../../tests/saves/v1.json';
import { decodeRestoreCode, encodeRestoreCode } from './save-code';

describe('код відновлення (GAME-33)', () => {
  const json = JSON.stringify(v1);
  it('кодування → декодування повертає той самий сейв', async () => {
    const code = await encodeRestoreCode(json);
    expect(code.startsWith('CL1.')).toBe(true);
    expect(await decodeRestoreCode(code)).toBe(json);
  });
  it('код стиснутий і безпечний для копіювання (лише base64url)', async () => {
    const code = await encodeRestoreCode(json);
    expect(code.length).toBeLessThan(json.length);
    expect(code.slice(4)).toMatch(/^[A-Za-z0-9_-]+$/);
  });
  it('пробіли й переноси, що з’явились при копіюванні, не заважають', async () => {
    const code = await encodeRestoreCode(json);
    expect(await decodeRestoreCode(`  ${code.slice(0, 20)}\n${code.slice(20)}  `)).toBe(json);
  });
  it('чужий префікс, обрізаний чи зіпсований код — null, без винятку', async () => {
    const code = await encodeRestoreCode(json);
    expect(await decodeRestoreCode('XX1.' + code.slice(4))).toBeNull();
    expect(await decodeRestoreCode(code.slice(0, 30))).toBeNull();
    expect(await decodeRestoreCode('CL1.@@@@')).toBeNull();
  });
});
