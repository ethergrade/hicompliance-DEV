export const maskEmail = (value: string): string => {
  const email = String(value || '').trim();
  const parts = email.split('@');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return '[REDACTED_EMAIL]';
  const local = parts[0];
  return `${local.slice(0, 1)}***@${parts[1]}`;
};

export const maskPassword = (_value: string): string => '[REDACTED]';

export const maskToken = (_value: string): string => '[TOKEN_REDACTED]';

export const maskCreditCard = (value: string): string => {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length < 12) return '[REDACTED_CARD]';
  return `${digits.slice(0, 6)}******${digits.slice(-4)}`;
};

export const maskIban = (value: string): string => {
  const clean = String(value || '').replace(/\s+/g, '').toUpperCase();
  if (clean.length < 8) return '[REDACTED_IBAN]';
  return `${clean.slice(0, 2)}** **** **** ****`;
};
