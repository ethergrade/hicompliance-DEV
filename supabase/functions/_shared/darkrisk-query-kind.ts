import { normalizeText } from './darkrisk-utils.ts';

export function isEmailLikeSelectorTerm(value: string | null | undefined): boolean {
  const normalized = normalizeText(String(value || '')).toLowerCase();
  return Boolean(normalized && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized));
}

export function isEmailSelectorCoverageKind(queryKind: string | null | undefined, queryTerm: string | null | undefined): boolean {
  const kind = normalizeText(String(queryKind || '')).toLowerCase();
  if (kind === 'email_selector') return true;
  if (kind === 'selector' && isEmailLikeSelectorTerm(queryTerm)) return true;
  return false;
}
