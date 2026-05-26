import { normalizeText } from './darkrisk-utils.ts';

export type SensitiveIndicators = {
  domains: number;
  passwords: number;
  addresses: number;
  credit_cards: number;
  phone_numbers: number;
  total_hits: number;
  tags: string[];
};

export type SensitiveValueTag = 'domains' | 'passwords' | 'addresses' | 'credit_cards' | 'phone_numbers';

export type SensitiveValueHit = {
  tag: SensitiveValueTag;
  value: string;
  masked_value: string;
  context: string;
};

const domainRegex = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}\b/gi;
const addressRegex = /\b(via|viale|piazza|corso|largo|strada|street|road|avenue|boulevard|blvd)\s+[a-z0-9à-ÿ'.,\-\s]{2,}\b/gi;
const phoneCandidateRegex = /(?:\+?\d[\d\s().-]{6,}\d)/g;
const cardCandidateRegex = /\b(?:\d[ -]*?){13,19}\b/g;
const passwordValueRegex = /\b(?:password|pass|pwd|credential(?:s)?|secret|token)\s*[:=]\s*([^\s,;|]{3,120})/gi;
const emailPasswordPairRegex = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\s*[:;|]\s*([^\s,;|]{3,120})/gi;
const accountPasswordPairRegex = /\b(?:[a-z][a-z0-9._-]{2,63})\s*[:;|]\s*([^\s,;|]{3,120})/gi;

const invalidPasswordTokens = new Set([
  'password',
  'pass',
  'passwd',
  'pwd',
  'credential',
  'credentials',
  'null',
  'none',
  'n/a',
  'na',
  'unknown',
  'test',
  'example',
  'changeme',
  'qwerty',
  '123456',
]);

function isLikelyPasswordCandidate(value: string): boolean {
  const clean = normalizeText(value);
  if (!clean) return false;
  if (clean.length < 3 || clean.length > 120) return false;
  const lower = clean.toLowerCase();
  if (invalidPasswordTokens.has(lower)) return false;
  if (/^https?:\/\//i.test(clean)) return false;
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(clean)) return false;
  if (/^[*xX•]+$/.test(clean)) return false;
  if (/^\d{1,6}$/.test(clean)) return false;
  return true;
}

function uniqueCount(matches: string[]): number {
  if (!matches.length) return 0;
  return new Set(matches.map((entry) => normalizeText(entry).toLowerCase()).filter(Boolean)).size;
}

function luhnCheck(number: string): boolean {
  const clean = number.replace(/\D/g, '');
  if (clean.length < 13 || clean.length > 19) return false;

  let sum = 0;
  let shouldDouble = false;
  for (let i = clean.length - 1; i >= 0; i -= 1) {
    let digit = Number(clean[i]);
    if (!Number.isFinite(digit)) return false;
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

function isAllZeroCardNumber(number: string): boolean {
  const clean = String(number || '').replace(/\D/g, '');
  if (clean.length < 13 || clean.length > 19) return false;
  return /^0+$/.test(clean);
}

function extractValidCardCandidates(text: string): string[] {
  const matches = text.match(cardCandidateRegex) || [];
  return matches
    .map((entry) => entry.replace(/\D/g, ''))
    .filter((entry) => entry.length >= 13 && entry.length <= 19)
    .filter((entry) => !isAllZeroCardNumber(entry))
    .filter((entry) => luhnCheck(entry));
}

function extractValidPhoneCandidates(text: string): string[] {
  const matches = text.match(phoneCandidateRegex) || [];
  return matches.filter((entry) => {
    const digits = entry.replace(/\D/g, '');
    return digits.length >= 7 && digits.length <= 15;
  });
}

function maskValue(tag: SensitiveValueTag, value: string): string {
  const trimmed = normalizeText(value);
  if (!trimmed) return '';
  if (tag === 'domains') {
    const parts = trimmed.split('.');
    if (parts.length < 2) return `${trimmed.slice(0, 2)}***`;
    const tld = parts.pop();
    const root = parts.pop() || '';
    const maskedRoot = root.length <= 2
      ? `${root[0] || '*'}***`
      : `${root.slice(0, 2)}***${root.slice(-1)}`;
    return [...parts, maskedRoot, tld].filter(Boolean).join('.');
  }
  if (tag === 'passwords') {
    if (trimmed.length <= 2) return `${trimmed[0] || '*'}*`;
    return `${trimmed.slice(0, 1)}***${trimmed.slice(-1)}`;
  }
  if (tag === 'addresses') {
    return `${trimmed.slice(0, 10)}***`;
  }
  if (tag === 'credit_cards') {
    const digits = trimmed.replace(/\D/g, '');
    if (digits.length < 6) return '****';
    return `${digits.slice(0, 6)}******${digits.slice(-4)}`;
  }
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 5) return '***';
  return `${digits.slice(0, 3)}***${digits.slice(-2)}`;
}

function safeContext(input: string, max = 220): string {
  const value = normalizeText(input);
  if (!value) return '';
  return value.slice(0, max);
}

function addHits(
  bag: SensitiveValueHit[],
  tag: SensitiveValueTag,
  values: string[],
  rawContext: string,
  maxHitsPerTag = 50,
): void {
  if (!values.length) return;
  const seen = new Set(
    bag
      .filter((entry) => entry.tag === tag)
      .map((entry) => normalizeText(entry.value).toLowerCase()),
  );
  for (const value of values) {
    const clean = normalizeText(value);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    const currentCount = bag.filter((entry) => entry.tag === tag).length;
    if (currentCount >= maxHitsPerTag) break;
    bag.push({
      tag,
      value: clean,
      masked_value: maskValue(tag, clean),
      context: safeContext(rawContext),
    });
    seen.add(key);
  }
}

function extractPasswordCandidates(text: string): string[] {
  const out = new Set<string>();
  let match: RegExpExecArray | null = null;
  passwordValueRegex.lastIndex = 0;
  emailPasswordPairRegex.lastIndex = 0;
  accountPasswordPairRegex.lastIndex = 0;
  while ((match = passwordValueRegex.exec(text)) !== null) {
    const value = normalizeText(String(match[1] || ''));
    if (!isLikelyPasswordCandidate(value)) continue;
    out.add(value);
  }
  while ((match = emailPasswordPairRegex.exec(text)) !== null) {
    const value = normalizeText(String(match[1] || ''));
    if (!isLikelyPasswordCandidate(value)) continue;
    out.add(value);
  }
  while ((match = accountPasswordPairRegex.exec(text)) !== null) {
    const value = normalizeText(String(match[1] || ''));
    if (!isLikelyPasswordCandidate(value)) continue;
    out.add(value);
  }
  return Array.from(out);
}

export function detectSensitiveIndicators(input: string): SensitiveIndicators {
  const text = normalizeText(input);
  if (!text) {
    return {
      domains: 0,
      passwords: 0,
      addresses: 0,
      credit_cards: 0,
      phone_numbers: 0,
      total_hits: 0,
      tags: [],
    };
  }

  const domains = uniqueCount(text.match(domainRegex) || []);
  const passwordCandidates = extractPasswordCandidates(text);
  const passwords = uniqueCount(passwordCandidates);
  const addresses = uniqueCount(text.match(addressRegex) || []);
  const creditCards = uniqueCount(extractValidCardCandidates(text));
  const phoneNumbers = uniqueCount(extractValidPhoneCandidates(text));

  const totalHits = domains + passwords + addresses + creditCards + phoneNumbers;
  const tags: string[] = [];
  if (domains > 0) tags.push('domains');
  if (passwords > 0) tags.push('passwords');
  if (addresses > 0) tags.push('addresses');
  if (creditCards > 0) tags.push('credit_cards');
  if (phoneNumbers > 0) tags.push('phone_numbers');

  return {
    domains,
    passwords,
    addresses,
    credit_cards: creditCards,
    phone_numbers: phoneNumbers,
    total_hits: totalHits,
    tags,
  };
}

export function hasSensitiveIndicators(indicators: SensitiveIndicators): boolean {
  return Number(indicators.total_hits || 0) > 0;
}

export function extractSensitiveValueHits(input: string, maxHitsPerTag = 50): SensitiveValueHit[] {
  const text = normalizeText(input);
  if (!text) return [];

  const hits: SensitiveValueHit[] = [];
  addHits(hits, 'domains', (text.match(domainRegex) || []).map((entry) => entry.toLowerCase()), text, maxHitsPerTag);
  addHits(hits, 'passwords', extractPasswordCandidates(text), text, maxHitsPerTag);
  addHits(hits, 'addresses', text.match(addressRegex) || [], text, maxHitsPerTag);
  addHits(hits, 'credit_cards', extractValidCardCandidates(text), text, maxHitsPerTag);
  addHits(hits, 'phone_numbers', extractValidPhoneCandidates(text), text, maxHitsPerTag);
  return hits;
}
