const DOMAIN_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
const IPV4_PATTERN = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

function isIpv6(value: string): boolean {
  return value.includes(':') && /^[a-f0-9:]+$/i.test(value);
}

export type IntelXScopeSelectorType = 'domain' | 'ipv4' | 'ipv6';

export interface IntelXScopeSelector {
  value: string;
  type: IntelXScopeSelectorType;
}

export function normalizeIntelXScopeSelector(input: string): IntelXScopeSelector {
  let value = String(input || '').trim();
  if (value.startsWith('@')) value = value.slice(1);
  value = value.toLowerCase().replace(/\.$/, '');

  if (DOMAIN_PATTERN.test(value)) return { value, type: 'domain' };
  if (IPV4_PATTERN.test(value)) return { value, type: 'ipv4' };
  if (isIpv6(value)) return { value, type: 'ipv6' };
  throw new Error('intelx_scope_selector_invalid');
}

export function normalizeIntelXAccountSelector(input: string): string {
  const selector = normalizeIntelXScopeSelector(input);
  if (selector.type !== 'domain') throw new Error('intelx_accounts_selector_requires_domain');
  return selector.value;
}
