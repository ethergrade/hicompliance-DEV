import { describe, it, expect } from 'vitest';
import PizZip from 'pizzip';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType } from 'docx';
import { readDocxMetadataFromZip, writeDocxMetadataToZip, normalizeMetaValue, canTransition } from './docxMetadata';

async function sampleZip(withCustom = true) {
  const cell = (t: string) => new TableCell({ width: { size: 3000, type: WidthType.DXA }, children: [new Paragraph(t)] });
  const doc = new Document({
    title: 'Procedura Backup',
    customProperties: withCustom ? [{ name: 'Classificazione', value: 'Riservato' }] : [],
    sections: [{ children: [
      new Paragraph({ children: [new TextRun('Revisione: '), new TextRun('3')] }),
      new Paragraph('Stato: Approvato'),
      new Table({ columnWidths: [3000, 3000], rows: [new TableRow({ children: [cell('Categoria'), cell('Processo')] })] }),
    ] }],
  });
  return new PizZip(await Packer.toBuffer(doc));
}

describe('docx metadata', () => {
  it('reads custom props, core title, text lines and table cells', async () => {
    const m = readDocxMetadataFromZip(await sampleZip());
    expect(m.confidentiality?.value).toBe('Riservato');
    expect(m.confidentiality?.source).toBe('custom');
    expect(m.name?.value).toBe('Procedura Backup');
    expect(m.revision?.value).toBe('3');
    expect(m.status?.value).toBe('Approvato');
    expect(m.category?.value).toBe('Processo');
  });

  it('writes values back and reads them again', async () => {
    const zip = writeDocxMetadataToZip(await sampleZip(false), { status: 'Obsoleto', category: 'Tecnico', revision: '4', confidentiality: 'Interno' });
    const again = readDocxMetadataFromZip(new PizZip(zip.generate({ type: 'uint8array' })));
    expect(again.status?.value).toBe('Obsoleto');
    expect(again.category?.value).toBe('Tecnico');
    expect(again.revision?.value).toBe('4');
    expect(again.confidentiality?.value).toBe('Interno');
    const body = zip.file('word/document.xml')!.asText();
    expect(body).toContain('Stato: Obsoleto');
    expect(body).toContain('Tecnico');
  });

  it('normalizes English and variant values', () => {
    expect(normalizeMetaValue('status', 'Draft')).toBe('Bozza');
    expect(normalizeMetaValue('confidentiality', 'Confidential')).toBe('Confidenziale');
    expect(normalizeMetaValue('revision', 'Rev. 02')).toBe('2');
    expect(normalizeMetaValue('category', 'Sconosciuta')).toBeNull();
  });

  it('blocks status jumps outside the workflow', () => {
    expect(canTransition('Bozza', 'Approvato')).toBe(false);
    expect(canTransition('In Revisione', 'Approvato')).toBe(true);
    expect(canTransition('Approvato', 'Bozza')).toBe(false);
  });
});
