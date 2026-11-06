import { describe, it, expect } from 'vitest';
import { mapSupplierRows } from './supplierExcelImport';

describe('supplier excel import', () => {
  it('maps Italian headers and criticality', () => {
    const [r] = mapSupplierRows([{ Fornitore: 'Acme', 'Criticità': 'Alta', Email: 'a@acme.it' }]);
    expect(r.data.supplier_name).toBe('Acme');
    expect(r.data.criticality).toBe('high');
    expect(r.error).toBeUndefined();
  });
  it('flags missing name', () => expect(mapSupplierRows([{ Fornitore: '', Email: 'a@b.it' }])[0].error).toBe('Nome fornitore mancante'));
  it('skips existing suppliers (case-insensitive)', () => expect(mapSupplierRows([{ Fornitore: 'acme' }], ['ACME'])[0].duplicate).toBe(true));
  it('skips duplicates within the file', () => expect(mapSupplierRows([{ Fornitore: 'X' }, { Fornitore: 'x' }])[1].duplicate).toBe(true));
});
