// Код відновлення (GAME-33, OD-008): сейв, який гравець може скопіювати й записати на телефоні.
// Формат: `CL1.` + base64url(deflate-raw(JSON сейву)). Префікс — версія самого коду, не сейву.

const PREFIX = 'CL1.';

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

function toB64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export async function encodeRestoreCode(saveJson: string): Promise<string> {
  const packed = await pipe(new TextEncoder().encode(saveJson), new CompressionStream('deflate-raw'));
  return PREFIX + toB64url(packed);
}

/** Повертає JSON сейву або null, якщо код не наш чи пошкоджений. Перевірку сейву робить ядро (fromSave). */
export async function decodeRestoreCode(code: string): Promise<string | null> {
  const clean = code.replace(/\s+/g, '');
  if (!clean.startsWith(PREFIX)) return null;
  try {
    const bytes = await pipe(fromB64url(clean.slice(PREFIX.length)), new DecompressionStream('deflate-raw'));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}
