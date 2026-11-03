import { describe, expect, it } from 'vitest';
import { noveApiBase } from './endpoint';

describe('Nove API endpoint', () => {
  it('uses the supplied HTTP server, port and API root', () => {
    expect(noveApiBase('http://nove.hisolution.it:8000/api') + '/va/clienti/').toBe('http://nove.hisolution.it:8000/api/v1/va/clienti/');
  });
  it('accepts a legacy HTTPS host', () => {
    expect(noveApiBase('https://example.com')).toBe('https://example.com/api/v1');
  });
  it('does not duplicate an existing version path', () => {
    expect(noveApiBase('https://example.com/api/v1/')).toBe('https://example.com/api/v1');
  });
  it('rejects embedded credentials', () => {
    expect(() => noveApiBase('http://user:password@example.com/api')).toThrow();
  });
});