import jsPDF from 'jspdf';

interface RemediationTask {
  id: string;
  task: string;
  category: string;
  start_date: string;
  end_date: string;
  progress: number;
  priority: string;
  assignee?: string | null;
  source?: string | null;
  source_ref?: string | null;
}

export interface SurfaceScan360Report {
  generated_at: string;
  organization: any;
  scan: any;
  assets_in_scope: any[];
  findings: any[];
  findings_by_severity: Record<string, number>;
  intel: any[];
  observations?: any[];
  remediation_tasks?: RemediationTask[];
  kev_generation?: { created: number; total_kev: number; existing: number };
  ai: {
    executive_summary?: string;
    risk_score?: number;
    risk_level?: string;
    top_recommendations?: Array<{
      priority: number;
      title: string;
      rationale: string;
      action: string;
      affected_assets?: string[];
      severity?: string;
    }>;
    correlations?: string[];
    compliance_notes?: string;
  } | null;
  ai_error?: string | null;
}

const BRAND = { r: 59, g: 130, b: 246 }; // primary blue
const DARK = { r: 17, g: 24, b: 39 };
const MUTED = { r: 110, g: 118, b: 130 };
const LIGHT = { r: 235, g: 240, b: 248 };

const sevColor = (s?: string): [number, number, number] => {
  switch ((s || '').toLowerCase()) {
    case 'critical': return [220, 38, 38];
    case 'high': return [234, 88, 12];
    case 'medium': return [202, 138, 4];
    case 'low': return [37, 99, 235];
    case 'info': return [100, 116, 139];
    default: return [120, 120, 120];
  }
};

export function generateSurfaceScan360Pdf(report: SurfaceScan360Report): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 40;
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  let y = margin;
  let pageNum = 1;

  const drawFooter = () => {
    doc.setFontSize(8);
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    doc.setFont('helvetica', 'normal');
    doc.text(`HiCompliance · SurfaceScan360`, margin, h - 18);
    doc.text(`Pagina ${pageNum}`, w - margin, h - 18, { align: 'right' });
  };

  const newPage = () => {
    drawFooter();
    doc.addPage();
    pageNum += 1;
    y = margin;
  };

  const ensure = (need: number) => {
    if (y + need > h - margin - 24) newPage();
  };

  const text = (
    txt: string,
    opts: { size?: number; bold?: boolean; color?: [number, number, number]; indent?: number } = {}
  ) => {
    const size = opts.size ?? 10;
    doc.setFontSize(size);
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    const c = opts.color ?? [DARK.r, DARK.g, DARK.b];
    doc.setTextColor(c[0], c[1], c[2]);
    const x = margin + (opts.indent ?? 0);
    const lines = doc.splitTextToSize(txt, w - margin * 2 - (opts.indent ?? 0));
    for (const l of lines) {
      ensure(size + 4);
      doc.text(l, x, y);
      y += size + 4;
    }
  };

  const sectionTitle = (n: number, title: string) => {
    ensure(36);
    y += 6;
    doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
    doc.rect(margin, y - 2, 4, 18, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(DARK.r, DARK.g, DARK.b);
    doc.text(`${n}. ${title}`, margin + 12, y + 12);
    y += 24;
  };

  const kv = (k: string, v: string) => {
    ensure(14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    doc.text(`${k}:`, margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(DARK.r, DARK.g, DARK.b);
    const lines = doc.splitTextToSize(String(v), w - margin * 2 - 120);
    doc.text(lines[0] || '', margin + 110, y);
    y += 12;
    for (let i = 1; i < lines.length; i++) {
      ensure(12);
      doc.text(lines[i], margin + 110, y);
      y += 12;
    }
  };

  const hr = () => {
    ensure(10);
    doc.setDrawColor(220);
    doc.line(margin, y, w - margin, y);
    y += 10;
  };

  const severityBadge = (sev: string) => {
    const [r, g, b] = sevColor(sev);
    const label = (sev || 'info').toUpperCase();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    const tw = doc.getTextWidth(label) + 10;
    doc.setFillColor(r, g, b);
    doc.roundedRect(margin, y - 9, tw, 12, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text(label, margin + 5, y);
    return tw;
  };

  // ===== COVER =====
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, w, 180, 'F');
  doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
  doc.rect(0, 175, w, 5, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('HICOMPLIANCE · SURFACESCAN360', margin, 50);
  doc.setFontSize(24);
  doc.text('Report Attack Surface', margin, 90);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  const o = report.organization || {};
  doc.text(o.legal_name || o.name || 'Cliente', margin, 115);
  doc.setFontSize(10);
  doc.setTextColor(180, 200, 230);
  doc.text(
    `Generato: ${new Date(report.generated_at).toLocaleString('it-IT')}`,
    margin,
    140
  );
  if (report.ai?.risk_score != null) {
    const score = report.ai.risk_score;
    const level = report.ai.risk_level || '';
    const label = `Risk Score ${score}/100 · ${level}`;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    const tw = doc.getTextWidth(label) + 20;
    doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
    doc.roundedRect(w - margin - tw, 130, tw, 22, 4, 4, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text(label, w - margin - tw + 10, 145);
  }
  y = 210;

  // ===== 1 ANAGRAFICA =====
  sectionTitle(1, 'Anagrafica cliente');
  const rows: Array<[string, any]> = [
    ['Ragione sociale', o.legal_name || o.name],
    ['P.IVA', o.vat_number],
    ['Codice fiscale', o.fiscal_code],
    ['Sede legale', o.legal_address],
    ['Sede operativa', o.operational_address],
    ['PEC', o.pec],
    ['Email', o.email],
    ['Telefono', o.phone],
    ['Settore', o.business_sector],
    ['Classificazione NIS2', o.nis2_classification],
  ];
  rows.forEach(([k, v]) => { if (v) kv(k, String(v)); });

  // ===== 2 SCOPE =====
  sectionTitle(2, 'Scope della scansione');
  const s = report.scan || {};
  kv('Target', `${s.target || 'n/d'} (${s.target_type || 'n/d'})`);
  kv('Profilo', s.scan_profile || 'n/d');
  kv('Hosting', s.hosting_context || 'n/d');
  kv('Completata', s.completed_at ? new Date(s.completed_at).toLocaleString('it-IT') : 'n/d');
  kv('Asset totali rilevati', String((report.assets_in_scope || []).length));

  // ===== 3 DOMINI / IP / SOTTODOMINI =====
  sectionTitle(3, 'Domini, IP e asset in scope');
  const assets = report.assets_in_scope || [];
  const grouped: Record<string, any[]> = {};
  assets.forEach((a: any) => {
    const t = a.asset_type || 'altro';
    (grouped[t] ||= []).push(a);
  });
  const order = ['domain', 'subdomain', 'ip', 'url', 'service'];
  const keys = [...order.filter((k) => grouped[k]), ...Object.keys(grouped).filter((k) => !order.includes(k))];
  if (keys.length === 0) {
    text('Nessun asset rilevato.', { color: [MUTED.r, MUTED.g, MUTED.b] });
  }
  keys.forEach((k) => {
    const list = grouped[k];
    text(`${k.toUpperCase()} (${list.length})`, { bold: true, size: 11, color: [BRAND.r, BRAND.g, BRAND.b] });
    list.slice(0, 80).forEach((a) => {
      const extra = [a.hostname, a.ip].filter((v) => v && v !== a.asset_value).join(' · ');
      text(`• ${a.asset_value}${extra ? '  (' + extra + ')' : ''}`, { size: 9, indent: 8 });
    });
    if (list.length > 80) text(`… e altri ${list.length - 80}`, { size: 8, color: [MUTED.r, MUTED.g, MUTED.b], indent: 8 });
    y += 4;
  });

  // ===== 4 PORTE APERTE =====
  sectionTitle(4, 'Porte aperte rilevate');
  const portMap: Record<string, Set<number>> = {};
  (report.observations || []).forEach((obs: any) => {
    const m = String(obs.title || obs.value || '').match(/port[s]?\s*[:#]?\s*(\d+(?:\s*,\s*\d+)*)/i);
    if (m) {
      const host = obs.value?.host || obs.title?.split(' ')[0] || 'n/d';
      portMap[host] ||= new Set();
      m[1].split(',').map((p) => parseInt(p.trim(), 10)).filter(Boolean).forEach((p) => portMap[host].add(p));
    }
  });
  (report.findings || []).forEach((f: any) => {
    const m = String(f.title || '').match(/port\s+(\d+)/i);
    if (m) {
      const host = f.affected_asset || f.affected_url || 'n/d';
      portMap[host] ||= new Set();
      portMap[host].add(parseInt(m[1], 10));
    }
  });
  const portEntries = Object.entries(portMap);
  if (portEntries.length === 0) {
    text('Nessuna porta aperta rilevata o dato non disponibile in questo snapshot.', {
      color: [MUTED.r, MUTED.g, MUTED.b],
      size: 9,
    });
  } else {
    portEntries.forEach(([host, ports]) => {
      const list = Array.from(ports).sort((a, b) => a - b).join(', ');
      text(`• ${host} → ${list}`, { size: 9 });
    });
  }

  // ===== 5 ENRICHMENT / WEB CHECK =====
  sectionTitle(5, 'Enrichment OSINT & Web Check');
  const intel = report.intel || [];
  if (intel.length === 0) {
    text('Nessun dato di enrichment disponibile.', { color: [MUTED.r, MUTED.g, MUTED.b], size: 9 });
  } else {
    const byProvider: Record<string, any[]> = {};
    intel.forEach((i: any) => { (byProvider[i.provider || 'altro'] ||= []).push(i); });
    Object.entries(byProvider).forEach(([prov, list]) => {
      text(`${prov.toUpperCase()} (${list.length})`, { bold: true, size: 11, color: [BRAND.r, BRAND.g, BRAND.b] });
      list.slice(0, 30).forEach((i: any) => {
        const summary = typeof i.summary === 'string' ? i.summary : JSON.stringify(i.summary || {}).slice(0, 240);
        text(`• [${i.target || 'n/d'}] ${summary}`, { size: 9, indent: 8 });
      });
      y += 4;
    });
  }

  // ===== 6 CVE & FINDINGS =====
  sectionTitle(6, 'CVE e vulnerabilità');
  const sc = report.findings_by_severity || {};
  text(
    `Totale findings: ${(report.findings || []).length}  ·  Critici: ${sc.critical || 0}  ·  Alti: ${sc.high || 0}  ·  Medi: ${sc.medium || 0}  ·  Bassi: ${sc.low || 0}  ·  Info: ${sc.info || 0}`,
    { bold: true, size: 10 }
  );
  y += 4;
  const cveFindings = (report.findings || []).filter((f: any) => Array.isArray(f.cve) && f.cve.length > 0);
  if (cveFindings.length > 0) {
    text('CVE rilevate:', { bold: true, size: 10, color: [BRAND.r, BRAND.g, BRAND.b] });
    cveFindings.slice(0, 80).forEach((f: any) => {
      ensure(36);
      const badgeW = severityBadge(f.severity);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(DARK.r, DARK.g, DARK.b);
      doc.text(f.title || '(senza titolo)', margin + badgeW + 6, y);
      y += 12;
      text(`CVE: ${f.cve.join(', ')}${f.cvss ? '  ·  CVSS ' + f.cvss : ''}`, { size: 9, color: [MUTED.r, MUTED.g, MUTED.b] });
      if (f.affected_asset || f.affected_url) text(`Asset: ${f.affected_asset || f.affected_url}`, { size: 9, color: [MUTED.r, MUTED.g, MUTED.b] });
      if (f.remediation) text(`Remediation: ${f.remediation}`, { size: 9 });
      y += 4;
    });
  } else {
    text('Nessuna CVE rilevata.', { color: [MUTED.r, MUTED.g, MUTED.b], size: 9 });
  }

  // Altri findings senza CVE
  const otherFindings = (report.findings || []).filter((f: any) => !Array.isArray(f.cve) || f.cve.length === 0).slice(0, 60);
  if (otherFindings.length > 0) {
    y += 4;
    text('Altri findings significativi:', { bold: true, size: 10, color: [BRAND.r, BRAND.g, BRAND.b] });
    otherFindings.forEach((f: any) => {
      ensure(30);
      const badgeW = severityBadge(f.severity);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(DARK.r, DARK.g, DARK.b);
      const titleLines = doc.splitTextToSize(f.title || '(senza titolo)', w - margin * 2 - badgeW - 10);
      doc.text(titleLines[0], margin + badgeW + 6, y);
      y += 12;
      for (let i = 1; i < titleLines.length; i++) { ensure(12); doc.text(titleLines[i], margin + badgeW + 6, y); y += 12; }
      if (f.affected_asset || f.affected_url) text(`Asset: ${f.affected_asset || f.affected_url}`, { size: 9, color: [MUTED.r, MUTED.g, MUTED.b] });
      if (f.remediation) text(`Remediation: ${f.remediation}`, { size: 9 });
      y += 4;
    });
  }

  // ===== 7 AI EXECUTIVE SUMMARY =====
  if (report.ai) {
    sectionTitle(7, 'Executive summary (AI CISO)');
    if (report.ai.risk_score != null) {
      text(`Risk score: ${report.ai.risk_score}/100  ·  Livello: ${report.ai.risk_level || 'n/d'}`, { bold: true });
    }
    if (report.ai.executive_summary) text(report.ai.executive_summary);

    if (report.ai.top_recommendations?.length) {
      y += 6;
      sectionTitle(8, 'Remediation Recommendation (Top 5 AI)');
      report.ai.top_recommendations.forEach((r) => {
        ensure(40);
        const badgeW = severityBadge(r.severity || 'info');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(DARK.r, DARK.g, DARK.b);
        doc.text(`#${r.priority}  ${r.title}`, margin + badgeW + 6, y);
        y += 14;
        if (r.rationale) text(`Razionale: ${r.rationale}`, { size: 9 });
        if (r.action) text(`Azione: ${r.action}`, { size: 9, bold: true });
        if (r.affected_assets?.length) text(`Asset: ${r.affected_assets.join(', ')}`, { size: 8, color: [MUTED.r, MUTED.g, MUTED.b] });
        y += 6;
      });
    }

    if (report.ai.correlations?.length) {
      sectionTitle(9, 'Correlazioni');
      report.ai.correlations.forEach((c) => text(`• ${c}`, { size: 9 }));
    }

    if (report.ai.compliance_notes) {
      sectionTitle(10, 'Note di compliance');
      text(report.ai.compliance_notes);
    }
  } else if (report.ai_error) {
    sectionTitle(7, 'Sintesi AI non disponibile');
    text(report.ai_error, { color: [180, 0, 0], size: 9 });
  }

  // ===== 11 REMEDIATION TASKS =====
  const tasks = report.remediation_tasks || [];
  if (tasks.length > 0) {
    sectionTitle(11, 'Azioni di remediation pianificate / completate');
    if (report.kev_generation && report.kev_generation.total_kev > 0) {
      text(
        `CISA KEV: ${report.kev_generation.total_kev} CVE rilevate · ${report.kev_generation.created} nuove azioni auto-generate · ${report.kev_generation.existing} già presenti.`,
        { size: 9, color: [MUTED.r, MUTED.g, MUTED.b] }
      );
      y += 4;
    }
    const byCat: Record<string, RemediationTask[]> = {};
    tasks.forEach((t) => { (byCat[t.category] ||= []).push(t); });
    Object.keys(byCat).sort().forEach((cat) => {
      const list = byCat[cat];
      const done = list.filter((t) => (t.progress ?? 0) >= 100).length;
      text(`${cat}  (${done}/${list.length} completate)`, { bold: true, size: 11, color: [BRAND.r, BRAND.g, BRAND.b] });
      list.forEach((t) => {
        const status = (t.progress ?? 0) >= 100 ? 'COMPLETATA' : 'PIANIFICATA';
        text(`• [${status}] [${(t.priority || '').toUpperCase()}] ${t.task}`, { size: 9, indent: 8 });
        text(
          `   ${t.start_date} → ${t.end_date} · progress ${t.progress ?? 0}%${t.assignee ? ' · ' + t.assignee : ''}${t.source === 'cisa_kev' ? ' · sorgente: CISA KEV ' + (t.source_ref || '') : ''}`,
          { size: 8, color: [MUTED.r, MUTED.g, MUTED.b], indent: 8 }
        );
      });
      y += 4;
    });
  }

  drawFooter();
  const filename = `SurfaceScan360_${(o.name || 'report').replace(/\s+/g, '_')}_${new Date()
    .toISOString()
    .slice(0, 10)}.pdf`;
  doc.save(filename);
}
