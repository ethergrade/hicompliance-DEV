export interface EnvelopeCiphertext {
  algorithm: "AES-256-GCM+AES-KW-GCM";
  keyVersion: string;
  encryptedDek: string;
  dekIv: string;
  ciphertext: string;
  payloadIv: string;
  sha256: string;
}

const encoder = new TextEncoder();

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const normalized = value.trim().replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function parseKek(base64Key: string): Uint8Array {
  const bytes = fromBase64(base64Key);
  if (bytes.byteLength !== 32) throw new Error("darkrisk_kek_must_be_32_bytes");
  return bytes;
}

async function sha256(value: Uint8Array): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", Uint8Array.from(value).buffer),
  );
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function envelopeEncryptJson(
  payload: unknown,
  kekBytes: Uint8Array,
  keyVersion: string,
): Promise<EnvelopeCiphertext> {
  const plaintext = encoder.encode(JSON.stringify(payload));
  const dekBytes = crypto.getRandomValues(new Uint8Array(32));
  const payloadIv = crypto.getRandomValues(new Uint8Array(12));
  const dekIv = crypto.getRandomValues(new Uint8Array(12));
  const dek = await crypto.subtle.importKey("raw", dekBytes, "AES-GCM", false, [
    "encrypt",
  ]);
  const kek = await crypto.subtle.importKey(
    "raw",
    Uint8Array.from(kekBytes).buffer,
    "AES-GCM",
    false,
    ["encrypt"],
  );
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: payloadIv },
      dek,
      plaintext,
    ),
  );
  const encryptedDek = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: dekIv },
      kek,
      dekBytes,
    ),
  );
  dekBytes.fill(0);
  return {
    algorithm: "AES-256-GCM+AES-KW-GCM",
    keyVersion,
    encryptedDek: toBase64(encryptedDek),
    dekIv: toBase64(dekIv),
    ciphertext: toBase64(ciphertext),
    payloadIv: toBase64(payloadIv),
    sha256: await sha256(plaintext),
  };
}

export function retryDelaySeconds(attemptCount: number): number {
  return Math.min(900, Math.max(30, 30 * (2 ** Math.max(0, attemptCount - 1))));
}

export function safeErrorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    return String((error as { code?: unknown }).code || "provider_error").slice(
      0,
      120,
    );
  }
  if (error instanceof Error) return error.name.slice(0, 120);
  return "provider_error";
}

export function isRetryableProviderError(error: unknown): boolean {
  if (error && typeof error === "object" && "retryable" in error) {
    return (error as { retryable?: unknown }).retryable === true;
  }
  const code = safeErrorCode(error);
  return /timeout|rate|concurrent|network|provider_unavailable/i.test(code);
}

export function filterAuthorizedCorrelatedDomains(
  discovered: Iterable<string>,
  approvedRoots: Iterable<string>,
): { authorized: string[]; rejectedCount: number } {
  const roots = [...new Set(approvedRoots)];
  const candidates = [...new Set(discovered)];
  const authorized = candidates.filter((candidate) =>
    roots.some((root) => candidate === root || candidate.endsWith(`.${root}`))
  );
  return { authorized, rejectedCount: candidates.length - authorized.length };
}
