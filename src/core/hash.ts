// Відбиток стану для тестів детермінізму й реплеїв: FNV-1a 32 над канонічним JSON
// (ключі об'єктів відсортовано, тож порядок вставки не впливає).

function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

export function stateHash(v: unknown): string {
  let h = 0x811c9dc5;
  const s = canonical(v);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
