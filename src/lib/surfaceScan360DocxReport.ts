import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { saveAs } from 'file-saver';
import type { SurfaceScan360Report } from './surfaceScan360PdfReport';

const SURFACESCAN_BRAND_TITLE_HICOMPLIANCE = 'HICOMPLIANCE · SURFACESCAN360';
const SURFACESCAN_BRAND_TITLE_HICONSOLE = 'HiConsole - SURFACESCAN360';

const asText = (value: unknown, fallback = '-'): string => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const hasHiComplianceBrand = (report: SurfaceScan360Report): boolean => {
  const org = report?.organization || {};
  if (typeof org.hicompliance_enabled === 'boolean') return org.hicompliance_enabled;
  if (typeof org.has_hicompliance === 'boolean') return org.has_hicompliance;
  return false;
};

const getBrandTitle = (report: SurfaceScan360Report): string => {
  const explicit = String((report?.organization as any)?.report_brand_title || '').trim();
  if (explicit) return explicit;
  return hasHiComplianceBrand(report) ? SURFACESCAN_BRAND_TITLE_HICOMPLIANCE : SURFACESCAN_BRAND_TITLE_HICONSOLE;
};

const heading = (label: string, level: HeadingLevel = HeadingLevel.HEADING_2) =>
  new Paragraph({
    heading: level,
    spacing: { before: 260, after: 120 },
    children: [new TextRun({ text: label, bold: true })],
  });

const paragraph = (text: string, bold = false) =>
  new Paragraph({
    spacing: { after: 80 },
    children: [new TextRun({ text, bold })],
  });

const buildSimpleTable = (
  headers: string[],
  rows: string[][],
): Table =>
  new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: headers.map((headerLabel) =>
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: headerLabel, bold: true })] })],
            margins: { top: 80, bottom: 80, left: 100, right: 100 },
          })),
      }),
      ...rows.map((row) =>
        new TableRow({
          children: row.map((cell) =>
            new TableCell({
              children: [new Paragraph(asText(cell))],
              margins: { top: 60, bottom: 60, left: 100, right: 100 },
            })),
        })),
    ],
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: 'D6DEE8' },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: 'D6DEE8' },
      left: { style: BorderStyle.SINGLE, size: 1, color: 'D6DEE8' },
      right: { style: BorderStyle.SINGLE, size: 1, color: 'D6DEE8' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'E5EBF2' },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: 'E5EBF2' },
    },
  });

export async function generateSurfaceScan360Docx(report: SurfaceScan360Report): Promise<void> {
  const org = report.organization || {};
  const scan = report.scan || {};
  const findings = Array.isArray(report.findings) ? report.findings : [];
  const cveCatalog = Array.isArray(report.cve_catalog) ? report.cve_catalog : [];
  const recommendations = Array.isArray(report.ai?.top_recommendations) ? report.ai?.top_recommendations ?? [] : [];
  const severity = report.findings_by_severity || {};

  const anagraficaRows = [
    ['Ragione sociale', asText(org.legal_name || org.name)],
    ['P.IVA', asText(org.vat_number)],
    ['Codice fiscale', asText(org.fiscal_code)],
    ['Sede legale', asText(org.legal_address)],
    ['Sede operativa', asText(org.operational_address)],
    ['PEC', asText(org.pec)],
    ['Email', asText(org.email)],
    ['Telefono', asText(org.phone)],
    ['Settore', asText(org.business_sector)],
    ['Classificazione NIS2', asText(org.nis2_classification)],
  ];

  const scanRows = [
    ['Target', asText(scan.target)],
    ['Tipo target', asText(scan.target_type)],
    ['Profilo', asText(scan.scan_profile)],
    ['Stato', asText(scan.status)],
    ['Avvio', asText(scan.started_at ? new Date(scan.started_at).toLocaleString('it-IT') : '-')],
    ['Completata', asText(scan.completed_at ? new Date(scan.completed_at).toLocaleString('it-IT') : '-')],
  ];

  const findingsRows = findings.slice(0, 120).map((finding: any) => [
    asText(String(finding.severity || '').toUpperCase(), 'INFO'),
    asText(finding.title),
    asText(finding.affected_asset || finding.affected_url || finding.ip),
    asText(finding.remediation),
  ]);

  const cveRows = cveCatalog.slice(0, 120).map((entry: any) => [
    asText(entry.cve_id),
    asText(entry.cvss ?? '-'),
    entry.cisa_kev ? 'SI' : 'NO',
    asText((entry.affected_assets || []).join(', '), '-'),
    asText(entry.description, 'Descrizione non disponibile'),
  ]);

  const recommendationRows = recommendations.slice(0, 30).map((entry: any) => [
    `#${asText(entry.priority)}`,
    asText(entry.title),
    asText(entry.severity, 'medium'),
    asText(entry.action),
    asText((entry.affected_assets || []).join(', '), '-'),
  ]);

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { after: 120 },
            children: [
              new TextRun({ text: 'Hi', bold: true, color: '3B82F6', size: 22 }),
              new TextRun({ text: '  HiSolution', bold: true, color: '3B82F6', size: 24 }),
            ],
          }),
          new Paragraph({
            heading: HeadingLevel.TITLE,
            spacing: { after: 120 },
            children: [new TextRun({ text: getBrandTitle(report), bold: true })],
          }),
          paragraph(`Report generato: ${new Date(report.generated_at).toLocaleString('it-IT')}`),
          paragraph('Template unificato SurfaceScan360 / DarkRisk360'),

          heading('1. Anagrafica cliente'),
          buildSimpleTable(['Campo', 'Valore'], anagraficaRows),

          heading('2. Dettagli scansione'),
          buildSimpleTable(['Campo', 'Valore'], scanRows),

          heading('3. Riepilogo severità'),
          buildSimpleTable(
            ['Critiche', 'Alte', 'Medie', 'Basse', 'Info'],
            [[
              asText(severity.critical ?? 0, '0'),
              asText(severity.high ?? 0, '0'),
              asText(severity.medium ?? 0, '0'),
              asText(severity.low ?? 0, '0'),
              asText(severity.info ?? 0, '0'),
            ]],
          ),

          heading('4. Security Findings & Vulnerabilità'),
          buildSimpleTable(
            ['Severity', 'Titolo', 'Asset impattato', 'Remediation'],
            findingsRows.length > 0 ? findingsRows : [['-', 'Nessun finding disponibile', '-', '-']],
          ),

          heading('5. Catalogo CVE'),
          buildSimpleTable(
            ['CVE', 'CVSS', 'KEV', 'Asset', 'Descrizione'],
            cveRows.length > 0 ? cveRows : [['-', '-', '-', '-', 'Nessuna CVE disponibile']],
          ),

          heading('6. Priorità operative'),
          buildSimpleTable(
            ['Priorità', 'Titolo', 'Severità', 'Azione', 'Asset'],
            recommendationRows.length > 0 ? recommendationRows : [['#1', 'Nessuna priorità disponibile', 'low', '-', '-']],
          ),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const filename = `${getBrandTitle(report).replace(/\s+/g, '_')}_${new Date(report.generated_at).toISOString().slice(0, 10)}.docx`;
  saveAs(blob, filename);
}
