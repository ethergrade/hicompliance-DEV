import { describe, it, expect } from 'vitest';
import { answerCodesForProfile, measuresForProfile, scoreMeasure } from './catalog';
import { classify, sizeClass, nis2Deadlines } from './classify';
import { suggestFromLegacy } from './legacyMapping';

describe('Catalogo ACN', () => {
  it('importanti: 37 misure e 87 requisiti', () => {
    expect(measuresForProfile('imp')).toHaveLength(37);
    expect(answerCodesForProfile('imp')).toHaveLength(87);
  });
  it('essenziali: 43 misure e 116 requisiti', () => {
    expect(measuresForProfile('ess')).toHaveLength(43);
    expect(answerCodesForProfile('ess')).toHaveLength(116);
  });
  it('profilo Base: 20 misure, una risposta per misura', () => {
    expect(answerCodesForProfile('base')).toHaveLength(20);
  });
  it('parziale vale 0,5', () => {
    const m = measuresForProfile('imp').find((x) => x.code === 'GV.OC-04')!;
    expect(scoreMeasure(m, { 'GV.OC-04 p1': 'parziale' }, 'imp').score).toBe(50);
  });
});

describe('Classificazione NIS2', () => {
  it('soglie dimensionali', () => {
    expect(sizeClass({ ula: 250, fatturato: 0, bilancio: 0 })).toBe('grande');
    expect(sizeClass({ ula: 49, fatturato: 11e6, bilancio: 11e6 })).toBe('media');
    expect(sizeClass({ ula: 49, fatturato: 11e6, bilancio: 5e6 })).toBe('piccola');
  });
  it('la PEC ACN prevale', () => {
    expect(classify({ C00: 'essenziale' }).tipologia).toBe('essenziale');
  });
  it('Allegato I grande impresa = essenziale', () => {
    const r = classify({ C02: 'si', C03: 'no', C05: ['I'], C06: { ula: 300, fatturato: 0, bilancio: 0 } });
    expect(r).toMatchObject({ stato: 'in_ambito', tipologia: 'essenziale', profilo_assessment: 'ess' });
  });
  it('Allegato I media impresa = importante', () => {
    expect(classify({ C02: 'si', C05: ['I'], C06: { ula: 60, fatturato: 0, bilancio: 0 } }).tipologia).toBe('importante');
  });
  it('Allegato II piccola impresa = fuori ambito', () => {
    expect(classify({ C02: 'si', C05: ['II'], C06: { ula: 20, fatturato: 0, bilancio: 0 } }).stato).toBe('fuori_ambito');
  });
  it('DNS a prescindere dalla dimensione = essenziale', () => {
    expect(classify({ C02: 'si', C04: ['DNS'], C06: { ula: 3, fatturato: 0, bilancio: 0 } }).tipologia).toBe('essenziale');
  });
  it('Allegato IV = da verificare', () => {
    expect(classify({ C02: 'si', C05: ['IV'] }).stato).toBe('da_verificare');
  });
  it('non stabilita in Italia = fuori ambito', () => {
    expect(classify({ C02: 'no' }).stato).toBe('fuori_ambito');
  });
});

describe('Scadenze', () => {
  it('inserimento 2026: misure entro 31/07/2027', () => {
    expect(nis2Deadlines(2026, 2026).find((d) => d.label.startsWith('Misure'))?.date).toBe('2027-07-31');
  });
  it('inserimento 2025: PEC + 18 mesi', () => {
    expect(nis2Deadlines(2026, 2025, '2025-04-14').find((d) => d.label.startsWith('Misure'))?.date).toBe('2026-10-14');
  });
});

describe('Suggerimento da assessment esistente', () => {
  it('mappa gli stati', () => {
    expect(suggestFromLegacy(['completed', 'completed'])).toBe('implementato');
    expect(suggestFromLegacy(['completed', 'not_started'])).toBe('parziale');
    expect(suggestFromLegacy(['not_applicable'])).toBeNull();
  });
});
