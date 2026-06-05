import jsPDF from 'jspdf';
import { COVER_BG_JPEG_B64, HISOLUTION_LOGO_PNG_B64 } from './reportCoverAssets';

// ─── Tipi (shape del report_json prodotto da darkrisk-dti-esteso-report v2.0) ───
interface DtiPasswordHit { collection_title: string; data_collection: string | null; value: string; context: string }
interface DtiPerDomain {
  domain: string;
  dns: { grade: string; score: number; scanned_at: string | null; records: string[][] } | null;
  email_security: {
    protection_pct: number; spf_present: boolean; dkim_status: string;
    dmarc_present: boolean; dmarc_enforced: boolean; dmarc_value: string;
    findings: Array<{ category: string; title: string; severity: string; recommendation: string }>;
  };
  dns_health: Array<{ category: string; title: string; severity: string; recommendation: string }>;
  ports: Array<{ port: number; protocol: string; service: string; version: string; is_web: boolean; is_tls: boolean; exposure: string }>;
  intelx_kpi: { total_results: number; search_results: number; leaks_results: number; phonebook_results: number; passwords: number; total_hits: number };
  source_runs: Array<{ source: string; query_kind: string; query_term: string; result_count: number; status: string }>;
  passwords: DtiPasswordHit[];
  passwords_total: number;
  stealer: Array<{ collection_title: string; data_collection: string | null; tag: string; context: string }>;
}
export interface DtiEstesoReportJson {
  schema_version?: string;
  generated_at: string;
  organization_name: string;
  scan_run_id?: string | null;
  scan_run?: { started_at: string | null; completed_at: string | null; status: string | null } | null;
  scope: { domains: string[]; emails: string[]; ips: string[] };
  intelx_stats?: Record<string, any>;
  tag_counts?: Record<string, number>;
  stealer_count?: number;
  total_creds?: number;
  counters?: { enriched_hits_total: number; surface_findings_count: number; intelx_findings_count: number; domains: number; emails: number };
  per_domain?: DtiPerDomain[];
  surface_findings?: Array<{ severity: string; finding_type: string; title: string; affected_asset: string; created_at: string | null }>;
  intelx_findings?: Array<{ severity: string; finding_type: string; title: string; confidence: string; risk_score: number | null; first_seen_at: string | null }>;
  risk_assessment?: { threat_score: string; items: Array<[string, string]>; has_high_creds: boolean; has_dmarc_issue: boolean; has_open_ports: boolean };
  recommendations?: { immediate: string[]; d30: string[]; d90: string[] };
  ai_recommendations?: Array<{ title: string; priority: string; why_it_matters: string; actions: string[]; expected_outcome: string; confidence: string; model: string }>;
}

const BRAND = { r: 59, g: 130, b: 246 };
const DARK = { r: 17, g: 24, b: 39 };
const MUTED = { r: 110, g: 118, b: 130 };
const LIGHT_BG = { r: 243, g: 246, b: 251 };
const BORDER = { r: 215, g: 222, b: 232 };

const sevColor = (s?: string): [number, number, number] => {
  switch ((s || '').toLowerCase()) {
    case 'critical': case 'alto': return [220, 38, 38];
    case 'high': return [234, 88, 12];
    case 'medium': case 'medio': return [202, 138, 4];
    case 'low': return [37, 99, 235];
    default: return [100, 116, 139];
  }
};

// Sanifica testo per jsPDF helvetica (rimuove glifi Unicode non-Latin1: emoji, frecce, ✓✗⚠)
const ascii = (s: unknown): string =>
  String(s ?? '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2713}\u{2717}\u{26A0}]/gu, '')
    .replace(/→/g, '->').replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/—/g, '-').replace(/·/g, '·')
    .replace(/\s{2,}/g, ' ').trim();

const fmtDate = (v: unknown): string => {
  const s = String(v || '');
  if (!s) return '-';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s.slice(0, 10) || '-';
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
};
const fmtDateTime = (v: unknown): string => {
  const s = String(v || '');
  if (!s) return '-';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s.slice(0, 16) || '-';
  return d.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export function generateDtiEstesoPdf(report: DtiEstesoReportJson): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true, putOnlyUsedFonts: true, precision: 2 });
  const margin = 40;
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  let y = margin;
  let pageNum = 1;
  let skipNextFooter = false;
  const sectionIndex: Array<{ title: string; page: number }> = [];

  const orgName = ascii(report.organization_name || 'Cliente').slice(0, 60);

  const drawFooter = () => {
    if (skipNextFooter) { skipNextFooter = false; return; }
    doc.setFontSize(8);
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    doc.setFont('helvetica', 'normal');
    doc.text('HiConsole · DARKRISK360 DTI Esteso · RISERVATO', margin, h - 18);
    doc.text(`Pagina ${pageNum}`, w - margin, h - 18, { align: 'right' });
  };
  const newPage = () => { drawFooter(); doc.addPage(); pageNum += 1; y = margin; };
  const ensure = (need: number) => { if (y + need > h - margin - 24) newPage(); };

  const text = (txt: string, opts: { size?: number; bold?: boolean; color?: [number, number, number]; indent?: number } = {}) => {
    const size = opts.size ?? 10;
    doc.setFontSize(size);
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    const c = opts.color ?? [DARK.r, DARK.g, DARK.b];
    doc.setTextColor(c[0], c[1], c[2]);
    const x = margin + (opts.indent ?? 0);
    const lines = doc.splitTextToSize(ascii(txt), w - margin * 2 - (opts.indent ?? 0));
    for (const l of lines) { ensure(size + 4); doc.text(l, x, y); y += size + 4; }
  };

  const sectionTitle = (title: string) => {
    ensure(50);
    y += 12;
    sectionIndex.push({ title, page: pageNum });
    doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
    doc.rect(margin, y - 2, 4, 18, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(DARK.r, DARK.g, DARK.b);
    doc.text(ascii(title), margin + 12, y + 12);
    y += 30;
  };

  const subTitle = (title: string, color: [number, number, number] = [BRAND.r, BRAND.g, BRAND.b]) => {
    ensure(24);
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(color[0], color[1], color[2]);
    doc.text(ascii(title), margin, y);
    y += 14;
  };

  const drawTable = (headers: string[], rows: string[][], columnWidths: number[], rowHeight = 16) => {
    if (rows.length === 0) return;
    const totalW = columnWidths.reduce((s, ww) => s + ww, 0);
    ensure(rowHeight + 6);
    doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
    doc.rect(margin, y, totalW, rowHeight, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    let cx = margin;
    headers.forEach((hd, i) => { doc.text(ascii(hd), cx + 4, y + 11); cx += columnWidths[i]; });
    y += rowHeight;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(DARK.r, DARK.g, DARK.b);
    rows.forEach((row, idx) => {
      let maxLines = 1;
      const wrapped: string[][] = [];
      row.forEach((cell, i) => {
        const lines = doc.splitTextToSize(ascii(cell), columnWidths[i] - 8);
        wrapped.push(lines);
        if (lines.length > maxLines) maxLines = lines.length;
      });
      const rh = Math.max(rowHeight, maxLines * 10 + 6);
      ensure(rh);
      if (idx % 2 === 0) { doc.setFillColor(LIGHT_BG.r, LIGHT_BG.g, LIGHT_BG.b); doc.rect(margin, y, totalW, rh, 'F'); }
      doc.setDrawColor(BORDER.r, BORDER.g, BORDER.b);
      doc.line(margin, y + rh, margin + totalW, y + rh);
      let cx2 = margin;
      wrapped.forEach((lines, i) => {
        let ty = y + 11;
        lines.forEach((ln: string) => { doc.text(ln, cx2 + 4, ty); ty += 10; });
        cx2 += columnWidths[i];
      });
      y += rh;
    });
    y += 12;
  };

  const kv = (k: string, v: string) => {
    ensure(14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    doc.text(`${ascii(k)}:`, margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(DARK.r, DARK.g, DARK.b);
    const lines = doc.splitTextToSize(ascii(v), w - margin * 2 - 160);
    doc.text(lines[0] || '', margin + 150, y);
    y += 12;
    for (let i = 1; i < lines.length; i++) { ensure(12); doc.text(lines[i], margin + 150, y); y += 12; }
  };

  const bullets = (items: string[], color: [number, number, number]) => {
    items.filter(Boolean).forEach((it) => {
      ensure(14);
      doc.setFillColor(color[0], color[1], color[2]);
      doc.circle(margin + 3, y - 3, 1.6, 'F');
      text(it, { size: 9, indent: 12 });
    });
  };

  // ===== COVER =====
  doc.addImage(COVER_BG_JPEG_B64, 'JPEG', 0, 0, w, h);
  doc.setFillColor(8, 15, 32); doc.rect(0, 0, w, 72, 'F');
  doc.setFillColor(8, 15, 32); doc.rect(0, h * 0.60, w, h * 0.40, 'F');
  doc.setFillColor(BRAND.r, BRAND.g, BRAND.b); doc.rect(0, 70, w, 3, 'F');
  doc.addImage(HISOLUTION_LOGO_PNG_B64, 'PNG', margin, 15, 130, 37);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(140, 175, 225);
  doc.text('HiSolution Srl  ·  support@hisolution.it', w - margin, 38, { align: 'right' });

  const titleY = h * 0.645;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(120, 170, 255);
  doc.text('DARKRISK360', margin, titleY - 26);
  doc.setFontSize(30); doc.setTextColor(255, 255, 255);
  doc.text('Domain Threat Intelligence', margin, titleY);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(13); doc.setTextColor(160, 200, 255);
  doc.text('Report DTI Esteso  ·  Confidenziale', margin, titleY + 22);
  doc.setFillColor(BRAND.r, BRAND.g, BRAND.b); doc.rect(margin, titleY + 33, 44, 2, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(255, 255, 255);
  doc.text(orgName, margin, titleY + 58);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(130, 170, 220);
  doc.text(`Generato il ${fmtDateTime(report.generated_at)}`, margin, titleY + 76);
  // Threat score badge
  const ts = report.risk_assessment?.threat_score || '';
  if (ts) {
    const label = `Threat Score: ${ts}`;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    const tw = doc.getTextWidth(label) + 20;
    const tc = sevColor(ts);
    doc.setFillColor(tc[0], tc[1], tc[2]);
    doc.roundedRect(w - margin - tw, titleY + 44, tw, 22, 4, 4, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text(label, w - margin - tw + 10, titleY + 59);
  }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(100, 140, 195);
  doc.text('Pubblico ( )  ·  Privato ( )  ·  Confidenziale (X)', margin, h - 34);
  doc.text('Il presente rapporto contiene informazioni riservate. Non distribuire senza autorizzazione.', margin, h - 22);
  doc.text('Via Della Canapiglia 5, Vecchiano (PI)', w - margin, h - 22, { align: 'right' });
  y = h + 1; skipNextFooter = true; newPage();

  // ===== METADATA =====
  sectionTitle('Anagrafica documento');
  kv('Prodotto / Servizio', 'DarkRisk360 Estesa - Domain Threat Intelligence');
  kv('Tipologia', 'Relazione Domain Threat Intelligence');
  kv('Cliente', orgName);
  kv('Data generazione', fmtDateTime(report.generated_at));
  kv('Classificazione', 'Confidenziale');
  if (report.scan_run) {
    kv('Ultima scansione', `${fmtDateTime(report.scan_run.started_at)} -> ${fmtDateTime(report.scan_run.completed_at)} [${report.scan_run.status || '-'}]`);
  }
  const c = report.counters;
  const tc = report.tag_counts || {};
  if (c) {
    kv('Sintesi', `${c.domains} domini · ${c.emails} email · ${report.total_creds || 0} password · ${c.enriched_hits_total} evidenze · ${c.intelx_findings_count} findings IntelX`);
  }

  // ===== PERIMETRO =====
  sectionTitle('Perimetro Concordato');
  const scopeRows: string[][] = [
    ...(report.scope?.domains || []).map((d, i) => [String(i + 1), d, 'Dominio']),
    ...(report.scope?.ips || []).map((ip, i) => [String((report.scope?.domains?.length || 0) + i + 1), ip, 'IP']),
  ];
  drawTable(['ID', 'URL / Indirizzo', 'Tipo'], scopeRows, [50, 350, 115]);
  if ((report.scope?.emails || []).length > 0) {
    subTitle('Email identity in scope (IntelX Leaks)');
    bullets(report.scope.emails.slice(0, 30), [BRAND.r, BRAND.g, BRAND.b]);
  }

  // ===== ANALISI PER DOMINIO =====
  const perDomain = report.per_domain || [];
  if (perDomain.length > 0) {
    sectionTitle('Analisi per Dominio');
    perDomain.forEach((d) => {
      ensure(40);
      y += 6;
      doc.setFillColor(30, 58, 95); doc.rect(margin, y - 2, w - margin * 2, 20, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(255, 255, 255);
      doc.text(ascii(d.domain), margin + 8, y + 12);
      y += 28;

      // DNS
      if (d.dns) {
        subTitle(`Inventario DNS - Grade ${d.dns.grade} · Score ${d.dns.score}/100 · Rilevato ${fmtDate(d.dns.scanned_at)}`);
        drawTable(['TTL', 'Tipo', 'Valore'], (d.dns.records || []).slice(0, 30), [60, 70, 385]);
      } else {
        subTitle('Inventario DNS', [180, 120, 10]);
        text('DNS non scansionato per questo dominio.', { size: 9, color: [MUTED.r, MUTED.g, MUTED.b] });
      }

      // Email security
      const es = d.email_security;
      if (es) {
        const col: [number, number, number] = es.protection_pct >= 70 ? [16, 133, 89] : es.protection_pct >= 40 ? [180, 120, 10] : [200, 50, 50];
        subTitle(`Email Security - Protezione ${es.protection_pct}%`, col);
        drawTable(['Protocollo', 'Stato', 'Dettaglio'], [
          ['SPF', es.spf_present ? 'Presente' : 'Assente', ''],
          ['DKIM', es.dkim_status, ''],
          ['DMARC', es.dmarc_present ? (es.dmarc_enforced ? 'Presente (enforcement)' : 'Presente (monitor)') : 'Assente', es.dmarc_value || ''],
          ['MTA-STS', 'Non rilevato', 'Verificare _mta-sts e policy HTTPS'],
        ], [110, 160, 245]);
        if (es.findings.length > 0) {
          drawTable(['Categoria', 'Problema', 'Severità', 'Raccomandazione'],
            es.findings.slice(0, 8).map((f) => [f.category, f.title, f.severity.toUpperCase(), f.recommendation]),
            [90, 130, 70, 225]);
        }
      }

      // DNS health
      if ((d.dns_health || []).length > 0) {
        subTitle('DNS Health');
        drawTable(['Categoria', 'Titolo', 'Severità', 'Raccomandazione'],
          d.dns_health.slice(0, 8).map((f) => [f.category, f.title, f.severity.toUpperCase(), f.recommendation]),
          [90, 130, 70, 225]);
      }

      // Ports
      if ((d.ports || []).length > 0) {
        subTitle('Porte Aperte e Servizi');
        drawTable(['Porta', 'Proto', 'Servizio', 'Versione', 'Web', 'TLS', 'Esposiz.'],
          d.ports.slice(0, 20).map((p) => [String(p.port), p.protocol, p.service, p.version, p.is_web ? 'Si' : 'No', p.is_tls ? 'Si' : 'No', p.exposure]),
          [50, 50, 130, 100, 50, 50, 85]);
      }

      // IntelX KPI
      const k = d.intelx_kpi;
      if (k) {
        subTitle('DTI - Rilevazioni IntelX');
        text(`Totale risultati: ${k.total_results}  ·  Search: ${k.search_results}  ·  Leaks: ${k.leaks_results}  ·  Phonebook: ${k.phonebook_results}  ·  Password: ${k.passwords}  ·  Hit sensibili: ${k.total_hits}`,
          { size: 9, bold: true, color: k.passwords > 0 ? [200, 50, 50] : [16, 133, 89] });
        if ((d.source_runs || []).length > 0) {
          drawTable(['Sorgente', 'Query Kind', 'Query Term', 'Risultati', 'Status'],
            d.source_runs.slice(0, 20).map((r) => [r.source, r.query_kind, r.query_term, String(r.result_count), r.status]),
            [130, 110, 130, 70, 75]);
        }
      }

      // Passwords in chiaro
      if ((d.passwords || []).length > 0) {
        subTitle(`Password / credenziali in chiaro rilevate (${d.passwords_total})`, [200, 50, 50]);
        text('Dati sensibili - riservato. Mostrare solo a personale autorizzato.', { size: 8, color: [200, 50, 50] });
        drawTable(['Collection', 'Data', 'Stringa trovata', 'Note'],
          d.passwords.slice(0, 200).map((p) => [p.collection_title, fmtDate(p.data_collection), p.value, p.context]),
          [150, 65, 170, 130]);
        if (d.passwords_total > d.passwords.length) {
          text(`Mostrate ${d.passwords.length} di ${d.passwords_total} credenziali.`, { size: 8, color: [MUTED.r, MUTED.g, MUTED.b] });
        }
      }

      // Stealer
      if ((d.stealer || []).length > 0) {
        subTitle('DTI Finding - Stealer Log', [200, 50, 50]);
        text('Dati esfiltrati da browser compromessi (infostealer: Redline/Vidar/Lumma/MetaStealer).', { size: 8, color: [MUTED.r, MUTED.g, MUTED.b] });
        drawTable(['Collection', 'Data', 'Tipo', 'Contesto'],
          d.stealer.slice(0, 20).map((s) => [s.collection_title, fmtDate(s.data_collection), s.tag, s.context]),
          [150, 65, 90, 210]);
      }
      y += 6;
    });
  }

  // ===== SURFACE FINDINGS =====
  const sf = report.surface_findings || [];
  if (sf.length > 0) {
    sectionTitle('SurfaceScan360 - Findings');
    drawTable(['Severità', 'Tipo', 'Titolo', 'Asset', 'Data'],
      sf.slice(0, 80).map((f) => [f.severity, f.finding_type, f.title, f.affected_asset, fmtDate(f.created_at)]),
      [70, 90, 180, 110, 65]);
  }

  // ===== INTELX FINDINGS =====
  const ifs = report.intelx_findings || [];
  if (ifs.length > 0) {
    sectionTitle('DarkRisk360 - Findings IntelX');
    const tcEntries = Object.entries(tc);
    if (tcEntries.length > 0) {
      text(tcEntries.map(([k2, v]) => `${k2}: ${v}`).join('   ·   '), { size: 9, bold: true });
      y += 2;
    }
    drawTable(['Severità', 'Tipo', 'Titolo', 'Confidenza', 'Score', 'Prima vista'],
      ifs.slice(0, 80).map((f) => [f.severity, f.finding_type, f.title, f.confidence, String(f.risk_score ?? '-'), fmtDate(f.first_seen_at)]),
      [65, 95, 160, 70, 50, 75]);
  }

  // ===== RISK ASSESSMENT =====
  const ra = report.risk_assessment;
  if (ra) {
    sectionTitle('DTI - Risk Assessment');
    drawTable(['Elemento', 'Valutazione'], ra.items.map(([k2, v]) => [k2, v]), [320, 195]);
    const tcol = sevColor(ra.threat_score);
    text(`Threat Score complessivo: ${ra.threat_score}`, { size: 11, bold: true, color: tcol });
    const cnt = report.counters;
    if (cnt) text(`Basato su ${cnt.enriched_hits_total} evidenze sensibili, ${cnt.intelx_findings_count} findings IntelX, ${cnt.surface_findings_count} findings SurfaceScan.`,
      { size: 9, color: [MUTED.r, MUTED.g, MUTED.b] });
  }

  // ===== RACCOMANDAZIONI =====
  const recs = report.recommendations;
  if (recs) {
    sectionTitle('Raccomandazioni Operative');
    if ((recs.immediate || []).length > 0) { subTitle('Priorità IMMEDIATA (0-7 giorni)', [200, 50, 50]); bullets(recs.immediate, [200, 50, 50]); }
    if ((recs.d30 || []).length > 0) { subTitle('Priorità 30 giorni', [180, 120, 10]); bullets(recs.d30, [180, 120, 10]); }
    if ((recs.d90 || []).length > 0) { subTitle('Priorità 90 giorni', [37, 99, 235]); bullets(recs.d90, [37, 99, 235]); }
  }

  // ===== AI RECOMMENDATIONS =====
  const ai = report.ai_recommendations || [];
  if (ai.length > 0) {
    sectionTitle('Raccomandazioni AI (OpenAI)');
    if (ai[0].model) text(`Generate da ${ai[0].model} · ${ai.length} raccomandazioni.`, { size: 9, color: [MUTED.r, MUTED.g, MUTED.b] });
    const prioLabel: Record<string, string> = { immediate: 'IMMEDIATA', short_term: 'BREVE TERMINE', mid_term: 'MEDIO TERMINE', long_term: 'LUNGO TERMINE' };
    ai.forEach((r) => {
      ensure(40);
      y += 4;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(DARK.r, DARK.g, DARK.b);
      const pl = prioLabel[String(r.priority)] || String(r.priority || '').toUpperCase();
      text(`${r.title}  [${pl}]`, { size: 10, bold: true });
      if (r.why_it_matters) text(r.why_it_matters, { size: 9, color: [MUTED.r, MUTED.g, MUTED.b] });
      (r.actions || []).forEach((a) => text(`> ${a}`, { size: 9, indent: 10 }));
      if (r.expected_outcome) text(`Outcome atteso: ${r.expected_outcome}`, { size: 8, color: [MUTED.r, MUTED.g, MUTED.b], indent: 10 });
      y += 4;
    });
  }

  drawFooter();

  const filename = `DARKRISK360_DTI_ESTESO_${orgName.replace(/[^a-z0-9]+/gi, '_')}_${new Date(report.generated_at).toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}
