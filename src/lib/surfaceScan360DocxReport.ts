import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  PageBreak,
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
import { REPORT_GLOSSARY } from './reportGlossary';

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

const isDarkRiskReport = (report: SurfaceScan360Report): boolean =>
  /darkrisk360/i.test(getBrandTitle(report)) || /darkrisk360/i.test(String(report?.scan?.scan_profile || ''));

const formatReportDate = (value: unknown): string => {
  const date = new Date(String(value || new Date().toISOString()));
  if (Number.isNaN(date.getTime())) return new Date().toLocaleDateString('it-IT');
  return date.toLocaleDateString('it-IT');
};

const uniq = (values: string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const text = String(value || '').trim();
    if (!text || text === '-') continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
};

const collectScopeValues = (report: SurfaceScan360Report): string[] => {
  const scan = report.scan || {};
  const assets = Array.isArray(report.assets_in_scope) ? report.assets_in_scope : [];
  const monitored = Array.isArray(report.monitored_scope) ? report.monitored_scope : [];
  const scanTargets = Array.isArray(scan.scope_targets) ? scan.scope_targets : [];

  const values = [
    ...assets.map((asset: any) => asset?.asset_value || asset?.hostname || asset?.ip || asset?.affected_asset),
    ...monitored.map((entry: any) => entry?.input_value || entry?.asset_value || entry?.hostname || entry?.ip),
    ...scanTargets.map((entry: any) => (typeof entry === 'string' ? entry : entry?.target || entry?.value || entry?.asset_value)),
  ];

  const target = String(scan.target || '').trim();
  if (target && !/^scope completo|^scope cliente/i.test(target)) values.push(target);
  return uniq(values.map((value) => String(value || '').replace(/^https?:\/\//i, '').replace(/\/$/, '')));
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

const pageBreak = () =>
  new Paragraph({
    children: [new PageBreak()],
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

const buildDocumentInfoRows = (report: SurfaceScan360Report): string[][] => {
  const darkRisk = isDarkRiskReport(report);
  const org = report.organization || {};
  const clientName = asText(org.legal_name || org.name, 'CLIENTE');
  return [
    ['Nome del Prodotto / Servizio', darkRisk ? 'DarkRisk360 Estesa - Domain Threat Intelligence' : 'SurfaceScan360'],
    ['Tipologia Documento', darkRisk ? 'Relazione Domain Threat Intelligence' : 'Relazione SurfaceScan360'],
    ['Stato del documento', 'Rilasciato'],
    ['Versione', `v.1.0 - Data ${formatReportDate(report.generated_at)}`],
    ['Proprietario del documento', 'HiSolution Srl'],
    ['Revisionato da', 'Dipartimento R&D - Dipartimento Digital Transformation'],
    ['Cliente', clientName],
  ];
};

const buildScopeRows = (report: SurfaceScan360Report): string[][] => {
  const scopeValues = collectScopeValues(report);
  if (scopeValues.length === 0) return [['1', asText(report.scan?.target, 'Scope cliente')]];
  return scopeValues.slice(0, 250).map((value, index) => [String(index + 1), value]);
};

const buildTemplateFrontMatter = (report: SurfaceScan360Report): Array<Paragraph | Table> => {
  const darkRisk = isDarkRiskReport(report);
  const org = report.organization || {};
  const clientName = asText(org.legal_name || org.name, 'CLIENTE');
  const serviceTitle = darkRisk ? 'Accordo di Servizio - DTI' : 'Accordo di Servizio - SurfaceScan360';
  const intro = darkRisk
    ? 'Il Cliente incarica il Fornitore di condurre un security Domain Threat Intelligence sui domini indicati di seguito. Il servizio effettua un analisi approfondita di fonti OSINT e di esposizioni note relative a domini aziendali, asset digitali ed eventuali identita autorizzate.'
    : 'Il Cliente incarica il Fornitore di condurre una verifica SurfaceScan360 sugli asset indicati di seguito. Il servizio analizza la superficie di attacco esterna, le evidenze tecniche, le esposizioni pubbliche, i controlli di sicurezza e le vulnerabilita associate al perimetro concordato.';

  return [
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
      spacing: { after: 180 },
      children: [new TextRun({ text: getBrandTitle(report), bold: true })],
    }),
    buildSimpleTable(['Campo', 'Valore'], buildDocumentInfoRows(report)),
    pageBreak(),
    heading(serviceTitle, HeadingLevel.HEADING_1),
    paragraph('Tra:', true),
    paragraph('HiSolution s.r.l., con sede in Via della Canapiglia 5 - Vecchiano (PI) (di seguito "Fornitore")'),
    paragraph('e'),
    paragraph(`${clientName} (di seguito "Cliente").`, true),
    heading('Premessa', HeadingLevel.HEADING_2),
    paragraph(intro),
    pageBreak(),
    heading('HiSolution Standard', HeadingLevel.HEADING_1),
    paragraph('I servizi della Business Unit CyberSecurity di HiSolution utilizzano i seguenti standard e framework.'),
    paragraph('CWE - Il Common Weakness Enumeration e un sistema di classificazione delle debolezze e delle vulnerabilita del software.', true),
    paragraph('CVE - Il sistema Common Vulnerabilities and Exposures fornisce un metodo di riferimento per vulnerabilita ed esposizioni di sicurezza informatica di pubblica conoscenza.', true),
    paragraph('CVSS - Il Common Vulnerability Scoring System e uno standard industriale aperto per la valutazione della gravita delle vulnerabilita.', true),
    paragraph('OWASP - L OWASP Top 10 evidenzia le principali criticita in ambito di sicurezza delle applicazioni web e supporta la prioritizzazione dei rischi.', true),
    heading('Perimetro concordato', HeadingLevel.HEADING_1),
    paragraph('Di seguito gli indirizzi URL, domini, sottodomini e IP concordati oggetto dello Scope of Work.'),
    buildSimpleTable(['ID', 'URL o Indirizzo IP'], buildScopeRows(report)),
    pageBreak(),
  ];
};

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

  // Glossario: paragrafi da iniettare nell'unica section del documento
  const glossaryNodes = [
    new Paragraph({
      text: '7. Glossario tecnico',
      heading: HeadingLevel.HEADING_1,
      pageBreakBefore: true,
    }),
    new Paragraph({
      children: [new TextRun({ text: 'Definizioni semplificate dei termini tecnici usati in questo report.', italics: true, color: '6B7280' })],
      spacing: { after: 200 },
    }),
    ...REPORT_GLOSSARY.flatMap((entry) => [
      new Paragraph({
        children: [new TextRun({ text: entry.term, bold: true, color: '111827' })],
        spacing: { before: 120, after: 40 },
      }),
      new Paragraph({
        children: [new TextRun({ text: entry.definition, color: '374151' })],
        indent: { left: 360 },
        spacing: { after: 80 },
      }),
    ]),
  ];

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          ...buildTemplateFrontMatter(report),
          heading('Report operativo', HeadingLevel.HEADING_1),
          paragraph(`Report generato: ${new Date(report.generated_at).toLocaleString('it-IT')}`),

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

          // ── Sezione 7: Glossario tecnico ─────────────────────────────────
          ...glossaryNodes,
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const filename = `${getBrandTitle(report).replace(/\s+/g, '_')}_${new Date(report.generated_at).toISOString().slice(0, 10)}.docx`;
  saveAs(blob, filename);
}
