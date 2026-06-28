function stableValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value == null || typeof value !== 'object') return value;
  if (seen.has(value as object)) return '[Circular]';
  seen.add(value as object);

  if (Array.isArray(value)) return value.map((entry) => stableValue(entry, seen));
  const object = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(object)
      .sort()
      .map((key) => [key, stableValue(object[key], seen)]),
  );
}

export function stableIntelXRecordJson(record: Record<string, unknown>): string {
  return JSON.stringify(stableValue(record, new WeakSet<object>()));
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function intelXRecordFingerprint(
  selector: string,
  record: Record<string, unknown>,
  options: { preferSystemId?: boolean } = {},
): Promise<string> {
  const normalizedSelector = selector.trim().toLowerCase();
  const systemId = String(record.systemid || '').trim().toLowerCase();
  if (options.preferSystemId !== false && systemId) {
    return `${normalizedSelector}|systemid:${systemId}`;
  }
  return `${normalizedSelector}|sha256:${await sha256Hex(stableIntelXRecordJson(record))}`;
}
