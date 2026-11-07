// GAME-263 · мінімальний читач PNG (8 біт, без interlace; типи 2, 3, 6) для e2e: піксель і хеш клітинки аркуша з диска, без нових залежностей.
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

/** Елемент або 0 (noUncheckedIndexedAccess). */
export const g = (a: ArrayLike<number>, i: number): number => a[i] ?? 0;

export interface Png { readonly width: number; readonly height: number; readonly rgba: Uint8Array }

export function readPng(file: string): Png {
  const b = readFileSync(file);
  let o = 8, w = 0, h = 0, ct = 0;
  const idat: Buffer[] = [];
  let plte: Buffer = Buffer.alloc(0), trns: Buffer = Buffer.alloc(0);
  while (o < b.length) {
    const len = b.readUInt32BE(o), type = b.toString('latin1', o + 4, o + 8), d = b.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = g(d, 9); if (d[8] !== 8 || d[12] !== 0) throw new Error(`${file}: потрібен 8 біт без interlace`); }
    else if (type === 'PLTE') plte = Buffer.from(d); else if (type === 'tRNS') trns = Buffer.from(d); else if (type === 'IDAT') idat.push(Buffer.from(d));
    o += 12 + len;
  }
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : ct === 3 ? 1 : 0;
  if (!bpp) throw new Error(`${file}: тип PNG ${ct} не підтримано`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const px = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++) {
    const f = g(raw, y * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const v = g(raw, y * (stride + 1) + 1 + x);
      const a = x >= bpp ? g(px, y * stride + x - bpp) : 0, up = y ? g(px, (y - 1) * stride + x) : 0, c = x >= bpp && y ? g(px, (y - 1) * stride + x - bpp) : 0;
      const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c);
      px[y * stride + x] = (v + (f === 0 ? 0 : f === 1 ? a : f === 2 ? up : f === 3 ? (a + up) >> 1 : pa <= pb && pa <= pc ? a : pb <= pc ? up : c)) & 255;
    }
  }
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    if (ct === 6) rgba.set(px.subarray(i * 4, i * 4 + 4), i * 4);
    else if (ct === 2) rgba.set([g(px, i * 3), g(px, i * 3 + 1), g(px, i * 3 + 2), 255], i * 4);
    else { const k = g(px, i); rgba.set([g(plte, k * 3), g(plte, k * 3 + 1), g(plte, k * 3 + 2), trns[k] ?? 255], i * 4); }
  }
  return { width: w, height: h, rgba };
}
