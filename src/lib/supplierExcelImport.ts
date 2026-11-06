import * as XLSX from 'xlsx';
import type { Criticality } from '@/features/supply-chain/api';

export const SUPPLIER_TEMPLATE_HEADERS = ['Fornitore', 'Partita IVA', 'Categoria', 'Servizio', 'Descrizione servizio', 'Criticità', 'Referente', 'Email', 'Telefono', 'Sito web', 'Paese', 'Note'];

const ALIASES: Record<string, string> = {
  fornitore: 'supplier_name', nome: 'supplier_name', 'ragione sociale': 'supplier_name', supplier: 'supplier_name',
  'partita iva': 'vat_number', 'p.iva': 'vat_number', piva: 'vat_number', vat: 'vat_number',
  categoria: 'category', servizio: 'service_type', 'tipo servizio': 'service_type',
  'descrizione servizio': 'service_description', descrizione: 'service_description',
  criticità: 'criticality', criticita: 'criticality', referente: 'contact_name', contatto: 'contact_name',
  email: 'email', 'e-mail': 'email', telefono: 'phone', tel: 'phone', 'sito web': 'website', sito: 'website',
  paese: 'country', note: 'notes',
};

const CRIT: Record<string, Criticality> = {
  bassa: 'low', low: 'low', media: 'medium', medium: 'medium', alta: 'high', high: 'high', critica: 'critical', critical: 'critical',
};

export interface ParsedSupplierRow {
  row: number;
  data: Record<string, string | null> & { supplier_name: string; criticality: Criticality };
  error?: string;
  duplicate?: boolean;
}

/** Maps sheet rows (header → value) to supplier payloads. Unknown criticality defaults to "medium". */
export function mapSupplierRows(rows: Record<string, unknown>[], existingNames: string[] = []): ParsedSupplierRow[] {
  const seen = new Set(existingNames.map(n => n.trim().toLowerCase()));
  return rows.map((raw, i) => {
    const data: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(raw)) {
      const key = ALIASES[k.trim().toLowerCase()];
      if (key) { const s = String(v ?? '').trim(); data[key] = s || null; }
    }
    const name = data.supplier_name ?? '';
    const crit = CRIT[(data.criticality ?? '').toLowerCase()] ?? 'medium';
    const out: ParsedSupplierRow = { row: i + 2, data: { ...data, supplier_name: name, criticality: crit } };
    if (!name) out.error = 'Nome fornitore mancante';
    else if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) out.error = 'Email non valida';
    else if (seen.has(name.toLowerCase())) out.duplicate = true;
    else seen.add(name.toLowerCase());
    return out;
  }).filter((_, i) => Object.values(rows[i]).some(v => String(v ?? '').trim() !== ''));
}

export async function readSupplierFile(file: File, existingNames: string[]) {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  return mapSupplierRows(rows, existingNames);
}

export function downloadSupplierTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([SUPPLIER_TEMPLATE_HEADERS, ['Esempio Srl', 'IT01234567890', 'IT', 'Cloud hosting', 'Hosting server gestionale', 'Alta', 'Mario Rossi', 'mario.rossi@esempio.it', '+39 02 1234567', 'https://esempio.it', 'Italia', '']]);
  ws['!cols'] = SUPPLIER_TEMPLATE_HEADERS.map(h => ({ wch: Math.max(14, h.length + 4) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Fornitori');
  XLSX.writeFile(wb, 'Modello_import_fornitori.xlsx');
}
