export type SensitiveIndicators = {
  domains: number;
  passwords: number;
  addresses: number;
  credit_cards: number;
  phone_numbers: number;
  total_hits: number;
  tags: string[];
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

function uniqueCount(values: string[]): number {
  return new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean)).size;
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
  const clean = number.replace(/\D/g, '');
  if (clean.length < 13 || clean.length > 19) return false;
  return /^0+$/.test(clean);
}

function parseCards(text: string): string[] {
  const matches = text.match(cardCandidateRegex) || [];
  return matches
    .map((entry) => entry.replace(/\D/g, ''))
    .filter((entry) => entry.length >= 13 && entry.length <= 19)
    .filter((entry) => !isAllZeroCardNumber(entry))
    .filter((entry) => luhnCheck(entry));
}

function parsePhones(text: string): string[] {
  const matches = text.match(phoneCandidateRegex) || [];
  return matches.filter((entry) => {
    const digits = entry.replace(/\D/g, '');
    return digits.length >= 7 && digits.length <= 15;
  });
}

function isLikelyPasswordCandidate(value: string): boolean {
  const clean = String(value || '').trim();
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

function parsePasswords(text: string): string[] {
  const out = new Set<string>();
  let match: RegExpExecArray | null = null;
  passwordValueRegex.lastIndex = 0;
  emailPasswordPairRegex.lastIndex = 0;
  accountPasswordPairRegex.lastIndex = 0;
  while ((match = passwordValueRegex.exec(text)) !== null) {
    const value = String(match[1] || '').trim();
    if (!isLikelyPasswordCandidate(value)) continue;
    out.add(value);
  }
  while ((match = emailPasswordPairRegex.exec(text)) !== null) {
    const value = String(match[1] || '').trim();
    if (!isLikelyPasswordCandidate(value)) continue;
    out.add(value);
  }
  while ((match = accountPasswordPairRegex.exec(text)) !== null) {
    const value = String(match[1] || '').trim();
    if (!isLikelyPasswordCandidate(value)) continue;
    out.add(value);
  }
  return Array.from(out);
}

export function detectSensitiveIndicators(text: string): SensitiveIndicators {
  const input = String(text || '').trim();
  if (!input) {
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

  const domains = uniqueCount(input.match(domainRegex) || []);
  const passwordCandidates = parsePasswords(input);
  const passwords = uniqueCount(passwordCandidates);
  const addresses = uniqueCount(input.match(addressRegex) || []);
  const creditCards = uniqueCount(parseCards(input));
  const phoneNumbers = uniqueCount(parsePhones(input));

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
    total_hits: domains + passwords + addresses + creditCards + phoneNumbers,
    tags,
  };
}
