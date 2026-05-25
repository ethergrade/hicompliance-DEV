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
const passwordRegex = /\b(pass(?:word)?|pwd|credential(?:s)?|combo|hash|stealer|login\s*[:=]|user(?:name)?\s*[:=])\b/gi;
const addressRegex = /\b(via|viale|piazza|corso|largo|strada|street|road|avenue|boulevard|blvd)\s+[a-z0-9à-ÿ'.,\-\s]{2,}\b/gi;
const phoneCandidateRegex = /(?:\+?\d[\d\s().-]{6,}\d)/g;
const cardCandidateRegex = /\b(?:\d[ -]*?){13,19}\b/g;

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

function parseCards(text: string): string[] {
  const matches = text.match(cardCandidateRegex) || [];
  return matches
    .map((entry) => entry.replace(/\D/g, ''))
    .filter((entry) => entry.length >= 13 && entry.length <= 19)
    .filter((entry) => luhnCheck(entry));
}

function parsePhones(text: string): string[] {
  const matches = text.match(phoneCandidateRegex) || [];
  return matches.filter((entry) => {
    const digits = entry.replace(/\D/g, '');
    return digits.length >= 7 && digits.length <= 15;
  });
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
  const passwords = uniqueCount(input.match(passwordRegex) || []);
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
