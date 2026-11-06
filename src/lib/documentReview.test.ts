import { describe, it, expect } from 'vitest';
import { reviewState, daysUntil } from './documentReview';

const today = new Date(2026, 10, 6);
describe('document review state', () => {
  it('overdue when date passed', () => expect(reviewState('2026-11-05', today)).toBe('scaduto'));
  it('imminente within 7 days', () => expect(reviewState('2026-11-13', today)).toBe('imminente'));
  it('prossimo within 30 days', () => expect(reviewState('2026-12-06', today)).toBe('prossimo'));
  it('pianificato beyond 30 days', () => expect(reviewState('2026-12-07', today)).toBe('pianificato'));
  it('days until today is 0', () => expect(daysUntil('2026-11-06', today)).toBe(0));
});
