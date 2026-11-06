import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel, WidthType, BorderStyle, ShadingType, PageOrientation, AlignmentType } from 'docx';
import { saveAs } from 'file-saver';
import type { DocumentResource } from '@/types/api';

type Doc = DocumentResource & { folder_id?: string | null; source_type?: string | null };

export interface DocumentListExportOptions {
  title: string;
  scope: string;
  organizationName?: string;
  folderLabel: (doc: Doc) => string;
  groupBy: 'category' | 'folder';
}

const COLS = [
  { h: 'Codice', w: 1900 },
  { h: 'Nome documento', w: 3200 },
  { h: 'Rev.', w: 600 },
  { h: 'Stato', w: 1300 },
  { h: 'Riservatezza', w: 1400 },
  { h: 'Cartella', w: 1900 },
  { h: 'Descrizione / contenuto', w: 3100 },
  { h: 'Aggiornato', w: 1200 },
];
const TOTAL = COLS.reduce((s, c) => s + c.w, 0);
const border = { style: BorderStyle.SINGLE, size: 1, color: 'BBBBBB' };
const borders = { top: border, bottom: border, left: border, right: border };

const cell = (text: string, w: number, header = false) => new TableCell({
  borders, width: { size: w, type: WidthType.DXA },
  margins: { top: 60, bottom: 60, left: 100, right: 100 },
  shading: header ? { fill: 'E4E8EE', type: ShadingType.CLEAR } : undefined,
  children: [new Paragraph({ children: [new TextRun({ text, bold: header, size: 18 })] })],
});

const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString('it-IT') : '');

export function groupDocuments(docs: Doc[], key: (d: Doc) => string): [string, Doc[]][] {
  const map = new Map<string, Doc[]>();
  for (const d of docs) {
    const k = key(d) || 'Senza gruppo';
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(d);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => [k, v.sort((a, b) => a.name.localeCompare(b.name))]);
}

export async function exportDocumentListDocx(docs: Doc[], opts: DocumentListExportOptions) {
  const groups = groupDocuments(docs, opts.groupBy === 'category' ? (d) => d.category : opts.folderLabel);
  const children: (Paragraph | Table)[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(opts.title)] }),
    new Paragraph({ children: [new TextRun({ text: [opts.organizationName, opts.scope, `${docs.length} documenti`, `Generato il ${new Date().toLocaleString('it-IT')}`].filter(Boolean).join(' · '), size: 20, color: '555555' })] }),
  ];
  for (const [name, list] of groups) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 120 }, children: [new TextRun(`${name} (${list.length})`)] }));
    children.push(new Table({
      width: { size: TOTAL, type: WidthType.DXA }, columnWidths: COLS.map(c => c.w),
      rows: [
        new TableRow({ tableHeader: true, children: COLS.map(c => cell(c.h, c.w, true)) }),
        ...list.map(d => new TableRow({ children: [
          d.document_code || '', d.name, String(d.revision ?? ''), d.status || '', d.confidentiality || '',
          opts.folderLabel(d), [d.description, d.tags?.length ? `Tag: ${d.tags.map(t => '#' + t).join(' ')}` : ''].filter(Boolean).join('\n'),
          fmtDate(d.revision_date || d.updated_at),
        ].map((t, i) => cell(t, COLS[i].w))) })),
      ],
    }));
  }
  if (!docs.length) children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun('Nessun documento presente.')] }));
  const file = new Document({
    styles: { default: { document: { run: { font: 'Arial', size: 20 } } } },
    sections: [{ properties: { page: { size: { width: 11906, height: 16838, orientation: PageOrientation.LANDSCAPE }, margin: { top: 720, bottom: 720, left: 720, right: 720 } } }, children }],
  });
  const blob = await Packer.toBlob(file);
  const safe = opts.scope.replace(/[^\w\-]+/g, '_').slice(0, 40);
  saveAs(blob, `Elenco_documenti_${safe}_${new Date().toISOString().slice(0, 10)}.docx`);
}
