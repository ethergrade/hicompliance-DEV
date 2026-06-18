import jsPDF from 'jspdf';
import { COVER_BG_JPEG_B64, HISOLUTION_LOGO_PNG_B64 } from './reportCoverAssets';
import { REPORT_GLOSSARY } from './reportGlossary';

// ─── Tipi (shape del report_json prodotto da darkrisk-dti-esteso-report v2.0) ───
interface DtiPasswordHit { collection_title: string; data_collection: string | null; username?: string; value: string; context: string }
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
  dti_kpi: { total_results: number; search_results: number; leaks_results: number; phonebook_results: number; passwords: number; total_hits: number };
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
  scope: { domains: string[]; emails: string[]; ips: string[] };  tag_counts?: Record<string, number>;
  stealer_count?: number;
  total_creds?: number;
  counters?: { enriched_hits_total: number; surface_findings_count: number; passwords_count: number; domains: number; emails: number };
  per_domain?: DtiPerDomain[];
  all_passwords?: Array<{ asset: string; username: string; value: string; source: string; date: string | null }>;
  findings_by_source?: Array<{ source: string; count: number }>;
  surface_findings?: Array<{ severity: string; finding_type: string; title: string; affected_asset: string; created_at: string | null }>;
  risk_assessment?: { threat_score: string; items: Array<[string, string]>; has_high_creds: boolean; has_dmarc_issue: boolean; has_open_ports: boolean };
  recommendations?: { immediate: string[]; d30: string[]; d90: string[] };
  bucket_legend?: Array<{ category: string; description: string }>;
  identity_findings?: Array<{
    email: string;
    status: string;
    total: number;
    high: number;
    medium: number;
    low: number;
    findings: Array<{
      title: string;
      finding_type: string;
      severity: string;
      risk_score: number;
      first_seen_at: string;
    }>;
  }>;
}

// ── Mappa nomenclature sorgenti: nomi interni → etichette dashboard ────────
const SOURCE_LABEL_DISPLAY: Record<string, string> = {
  'DARKRISK_ESTESO Leaks':     'Ricerca leak & databreach',
  'DARKRISK_ESTESO Search':    'Ricerca threat intelligence',
  'DARKRISK_ESTESO Phonebook': 'Directory contatti esposti',
  'DarkRisk360 DTI':           'Analisi dominio',
  'DarkRisk360 Phonebook':     'Directory pubblica',
  'DarkRisk360 Search':        'Ricerca intelligence',
  'DarkRisk360 Leaks':         'Ricerca leak & databreach',
};
const displaySource = (raw: unknown): string => {
  const s = String(raw || '').trim();
  if (SOURCE_LABEL_DISPLAY[s]) return SOURCE_LABEL_DISPLAY[s];
  // Rimuovi prefissi tecnici interni come fallback
  return s.replace(/DARKRISK_ESTESO\s*/gi, '').replace(/DarkRisk360\s*/gi, 'DarkRisk360 ').trim() || s;
};

// Significato sintetico dei tipi di query DTI (colonna "Significato" della tabella Rilevazioni).
const QUERY_KIND_MEANING: Record<string, string> = {
  at_domain_tld: 'Tutto il dominio (es. @dominio)',
  selector: 'Asset specifico (sottodominio/URL)',
  email_selector: 'Indirizzo email specifico',
  leaks_log: 'Log malware infostealer',
};
const queryKindMeaning = (raw: unknown): string =>
  QUERY_KIND_MEANING[String(raw || '').trim().toLowerCase()] || '-';

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
    kv('Sintesi', `${c.domains} domini · ${c.emails} email · ${report.total_creds || 0} password in chiaro · ${c.enriched_hits_total} evidenze · ${c.surface_findings_count} findings SurfaceScan`);
  }

  // ===== PERIMETRO =====
  sectionTitle('Perimetro Concordato');
  const scopeRows: string[][] = [
    ...(report.scope?.domains || []).map((d, i) => [String(i + 1), d, 'Dominio']),
    ...(report.scope?.ips || []).map((ip, i) => [String((report.scope?.domains?.length || 0) + i + 1), ip, 'IP']),
  ];
  drawTable(['ID', 'URL / Indirizzo', 'Tipo'], scopeRows, [50, 350, 115]);
  if ((report.scope?.emails || []).length > 0) {
    subTitle('Email identity in scope (DarkRisk360)');
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

      // DTI KPI numerici (no nomi provider), source_runs senza FAILED
      const k = d.dti_kpi;
      if (k) {
        subTitle('DTI - Rilevazioni DarkRisk360');
        text(`Totale risultati: ${k.total_results}  ·  Password in chiaro: ${k.passwords}  ·  Hit sensibili: ${k.total_hits}`,
          { size: 9, bold: true, color: k.passwords > 0 ? [200, 50, 50] : [16, 133, 89] });
        const runs = (d.source_runs || []).filter((r) => String(r.status || '').toLowerCase() !== 'failed');
        if (runs.length > 0) {
          drawTable(['Sorgente', 'Tipo query', 'Significato', 'Termine', 'Risultati'],
            runs.slice(0, 20).map((r) => [displaySource(r.source), r.query_kind, queryKindMeaning(r.query_kind), r.query_term, String(r.result_count)]),
            [115, 95, 150, 95, 60]);
        }
      }

      // Password in chiaro REALI (asset/username/password) — niente stringhe URL/segnali
      if ((d.passwords || []).length > 0) {
        subTitle(`Password in chiaro rilevate (${d.passwords_total})`, [200, 50, 50]);
        text('Dati sensibili - riservato. Mostrare solo a personale autorizzato.', { size: 8, color: [200, 50, 50] });
        drawTable(['#', 'Account / Username', 'Password in chiaro', 'Fonte', 'Data'],
          d.passwords.slice(0, 300).map((p, i) => [String(i + 1), String(p.username || '-'), p.value, p.collection_title, fmtDate(p.data_collection)]),
          [30, 150, 150, 120, 65]);
        if (d.passwords_total > d.passwords.length) {
          text(`Mostrate ${d.passwords.length} di ${d.passwords_total} password.`, { size: 8, color: [MUTED.r, MUTED.g, MUTED.b] });
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

  // ===== CREDENZIALI ESPOSTE — elenco globale password reali =====
  const allPw = report.all_passwords || [];
  if (allPw.length > 0) {
    sectionTitle(`Credenziali esposte — Password in chiaro (${allPw.length})`);
    text('Dati sensibili - riservato. Mostrare solo a personale autorizzato.', { size: 8, color: [200, 50, 50] });
    drawTable(['#', 'Asset', 'Account / Username', 'Password in chiaro', 'Fonte', 'Data'],
      allPw.slice(0, 500).map((p, i) => [String(i + 1), p.asset, String(p.username || '-'), p.value, p.source, fmtDate(p.date)]),
      [28, 110, 120, 120, 72, 65]);
    if (allPw.length > 500) text(`Mostrate 500 di ${allPw.length} password.`, { size: 8, color: [MUTED.r, MUTED.g, MUTED.b] });
  }

  // ===== SINTESI NUMERICA PER FONTE/TIPO =====
  const bySource = report.findings_by_source || [];
  if (bySource.length > 0) {
    sectionTitle('Sintesi numerica per fonte');
    drawTable(['Fonte', 'Tipo', 'Risultati'], bySource.map((s) => [displaySource(s.source), 'leak/exposure', String(s.count)]), [240, 170, 105]);
  }

  // ===== SURFACE FINDINGS — PER ASSET =====
  const sf = (report.surface_findings || []).filter((f) => String(f.severity || '').toLowerCase() !== 'failed');
  if (sf.length > 0) {
    sectionTitle('SurfaceScan360 - Findings per asset');
    const byAsset = new Map<string, typeof sf>();
    for (const f of sf) {
      const a = String(f.affected_asset || 'n/d');
      if (!byAsset.has(a)) byAsset.set(a, [] as any);
      byAsset.get(a)!.push(f);
    }
    Array.from(byAsset.entries())
      .sort((a, b) => b[1].length - a[1].length)
      .forEach(([asset, list]) => {
        const cnt = { critical: 0, high: 0, medium: 0, low: 0, info: 0 } as Record<string, number>;
        list.forEach((f) => { cnt[String(f.severity || 'info').toLowerCase()] = (cnt[String(f.severity || 'info').toLowerCase()] || 0) + 1; });
        subTitle(`${asset} - ${list.length} finding (Crit ${cnt.critical} · High ${cnt.high} · Med ${cnt.medium} · Low ${cnt.low})`);
        drawTable(['Severità', 'Tipo', 'Titolo', 'Data'],
          list.slice(0, 40).map((f) => [f.severity, f.finding_type, f.title, fmtDate(f.created_at)]),
          [70, 100, 280, 65]);
      });
  }

  // ===== RISK ASSESSMENT =====
  const ra = report.risk_assessment;
  if (ra) {
    sectionTitle('DTI - Risk Assessment');
    drawTable(['Elemento', 'Valutazione'], ra.items.map(([k2, v]) => [k2, v]), [320, 195]);
    const tcol = sevColor(ra.threat_score);
    text(`Threat Score complessivo: ${ra.threat_score}`, { size: 11, bold: true, color: tcol });
    const cnt = report.counters;
    if (cnt) text(`Basato su ${cnt.passwords_count} password in chiaro, ${cnt.surface_findings_count} findings SurfaceScan, ${cnt.enriched_hits_total} evidenze sensibili.`,
      { size: 9, color: [MUTED.r, MUTED.g, MUTED.b] });
  }

  // ===== RACCOMANDAZIONI OPERATIVE (include raccomandazioni AI gia' merge-ate) =====
  const recs = report.recommendations;
  if (recs) {
    sectionTitle('Raccomandazioni Operative');
    if ((recs.immediate || []).length > 0) { subTitle('Priorità IMMEDIATA (0-7 giorni)', [200, 50, 50]); bullets(recs.immediate, [200, 50, 50]); }
    if ((recs.d30 || []).length > 0) { subTitle('Priorità 30 giorni', [180, 120, 10]); bullets(recs.d30, [180, 120, 10]); }
    if ((recs.d90 || []).length > 0) { subTitle('Priorità 90 giorni', [37, 99, 235]); bullets(recs.d90, [37, 99, 235]); }
  }

  // ===== LEGENDA — NOMENCLATURA FONTI =====
  const legend = report.bucket_legend || [];
  if (legend.length > 0) {
    sectionTitle('Legenda - Nomenclatura fonti');
    text('Categorie di fonte dei finding e relativo significato operativo.', { size: 9, color: [MUTED.r, MUTED.g, MUTED.b] });
    drawTable(['Categoria', 'Significato'], legend.map((l) => [l.category, l.description]), [160, 355]);
  }

  // ===== EMAIL MONITORATE — FINDING IDENTITY (per selector individuale) =====
  sectionTitle('Email monitorate — Finding Identity');
  text(
    'Analisi per ogni indirizzo email monitorato nel perimetro DarkRisk360. ' +
    'I finding identity indicano esposizioni di credenziali o dati personali ' +
    'rilevate nei database di databreach e threat intelligence.',
    { size: 9, color: [MUTED.r, MUTED.g, MUTED.b] },
  );
  y += 4;

  const identityRows = report.identity_findings || [];

  if (identityRows.length === 0) {
    // Nessun selector email monitorato o nessun dato disponibile
    ensure(20);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(16, 133, 89);
    doc.text('Nessuna email individuale monitorata in perimetro oppure dati non ancora disponibili.', margin, y);
    y += 16;
  } else {
    // Tabella riepilogativa [Email | Stato | HIGH | MED | LOW | Totale]
    ensure(16);
    drawTable(
      ['Email monitorata', 'Stato', 'HIGH', 'MED', 'LOW', 'Totale finding'],
      identityRows.map((e) => [
        e.email,
        e.status === 'approved' ? 'Approvato' : e.status,
        e.high > 0 ? String(e.high) : '-',
        e.medium > 0 ? String(e.medium) : '-',
        e.low > 0 ? String(e.low) : '-',
        e.total > 0 ? String(e.total) : '0',
      ]),
      [185, 70, 45, 45, 45, 85],
    );
    y += 6;

    // Dettaglio per ogni email con finding
    for (const emailEntry of identityRows) {
      if (emailEntry.total === 0) {
        // Email senza finding — messaggio verde rassicurante
        ensure(14);
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8);
        doc.setTextColor(16, 133, 89);
        doc.text(ascii(`${emailEntry.email}  —  Nessun finding identity rilevato.`), margin + 4, y);
        y += 12;
        continue;
      }

      // Email con finding — header + dettaglio
      ensure(20);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(200, 50, 50);
      doc.text(ascii(`${emailEntry.email}  (${emailEntry.total} finding)`), margin, y);
      y += 12;

      drawTable(
        ['Sev.', 'Tipo', 'Titolo finding', 'Score', 'Prima vista'],
        emailEntry.findings.slice(0, 20).map((f) => [
          String(f.severity || 'info').toUpperCase().slice(0, 4),
          String(f.finding_type || '-').replace(/_/g, ' '),
          String(f.title || '-'),
          f.risk_score > 0 ? String(f.risk_score) : '-',
          fmtDate(f.first_seen_at),
        ]),
        [45, 100, 240, 50, 80],
      );
      if (emailEntry.total > 20) {
        text(`Mostrati 20 di ${emailEntry.total} finding per questa email.`, { size: 8, color: [MUTED.r, MUTED.g, MUTED.b] });
      }
      y += 4;
    }
  }

  // ===== GLOSSARIO TECNICO =====
  sectionTitle('Glossario tecnico');
  text('Definizioni semplificate dei termini tecnici usati in questo report.', { size: 9, color: [MUTED.r, MUTED.g, MUTED.b] });
  y += 4;
  for (const entry of REPORT_GLOSSARY) {
    ensure(28);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(DARK.r, DARK.g, DARK.b);
    doc.text(ascii(entry.term), margin, y);
    y += 12;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    const defLines = doc.splitTextToSize(ascii(entry.definition), w - margin * 2 - 10);
    defLines.forEach((line: string) => { ensure(10); doc.text(line, margin + 8, y); y += 10; });
    y += 4;
  }

  drawFooter();

  const filename = `DARKRISK360_DTI_ESTESO_${orgName.replace(/[^a-z0-9]+/gi, '_')}_${new Date(report.generated_at).toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}
