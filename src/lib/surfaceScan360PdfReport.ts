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
  monitored_scope?: any[];
  subdomain_dumps?: any[];
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

const BRAND = { r: 59, g: 130, b: 246 };
const DARK = { r: 17, g: 24, b: 39 };
const MUTED = { r: 110, g: 118, b: 130 };
const LIGHT_BG = { r: 243, g: 246, b: 251 };
const BORDER = { r: 215, g: 222, b: 232 };

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

// Etichette neutre (no vendor names)
const PROVIDER_LABELS: Record<string, string> = {
  shodan: 'Banner & servizi esposti (scan passivo)',
  urlscan: 'Scansioni web pubbliche storiche',
  hosting_context: 'Footprint hosting & multi-tenancy',
  ct_log: 'Certificate Transparency log',
  dnssec: 'Stato DNSSEC',
  tech_stack: 'Tecnologie applicative rilevate',
  mail_security: 'Postura sicurezza email (SPF/DKIM/DMARC)',
  security_headers: 'Security headers HTTP',
};
const providerLabel = (p: string) => PROVIDER_LABELS[p] || p.replace(/_/g, ' ');

const normalizeHost = (value: string): string => String(value || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
const depthFromRoot = (host: string, rootDomain: string): number => {
  const h = normalizeHost(host);
  const root = normalizeHost(rootDomain);
  if (!h || !root || h === root || !h.endsWith(`.${root}`)) return 0;
  return h.slice(0, -(root.length + 1)).split('.').filter(Boolean).length;
};

const isJunkSummary = (s: any): boolean => {
  if (!s) return true;
  if (typeof s === 'object') {
    const keys = Object.keys(s);
    if (keys.length === 1 && (keys[0] === 'reason' || keys[0] === 'error')) return true;
    if (keys.length === 0) return true;
  }
  return false;
};

const summarizeIntel = (provider: string, target: string, summary: any): string => {
  if (summary == null) return 'Nessun dato';
  if (typeof summary === 'string') return summary;
  if (provider === 'urlscan' && Array.isArray(summary.recent)) {
    if (summary.recent.length === 0) return `Nessuna scansione pubblica nota per ${target}`;
    const r = summary.recent[0];
    const d = r.date ? new Date(r.date).toLocaleDateString('it-IT') : 'n/d';
    return `${summary.total} scansion${summary.total === 1 ? 'e' : 'i'} pubblic${summary.total === 1 ? 'a' : 'he'} - ultima ${d} - server: ${r.server || 'n/d'} - IP: ${r.ip || 'n/d'}`;
  }
  if (provider === 'hosting_context') {
    const out: string[] = [];
    if (summary.resolved_ips?.length) out.push(`IP risolti: ${summary.resolved_ips.join(', ')}`);
    if (summary.co_hosted_count != null) out.push(`co-hosted: ${summary.co_hosted_count}`);
    if (summary.multi_tenant != null) out.push(`multi-tenant: ${summary.multi_tenant ? 'sì' : 'no'}`);
    if (summary.cdn_score != null) out.push(`CDN score: ${summary.cdn_score}`);
    if (summary.type) out.push(`tipo: ${summary.type}`);
    return out.join(' · ') || 'n/d';
  }
  if (provider === 'shodan') {
    if (summary.reason === 'not_found') return `Nessun banner/porta pubblicamente esposta per ${target}`;
    const ports = summary.ports || summary.open_ports;
    const banners = summary.banners || [];
    const parts: string[] = [];
    if (ports?.length) parts.push(`porte aperte: ${ports.join(', ')}`);
    if (banners.length) parts.push(`banner: ${banners.length}`);
    if (summary.org) parts.push(`org: ${summary.org}`);
    if (summary.asn) parts.push(`ASN: ${summary.asn}`);
    return parts.join(' · ') || JSON.stringify(summary).slice(0, 200);
  }
  // generic
  const compact = JSON.stringify(summary);
  return compact.length > 240 ? compact.slice(0, 240) + '…' : compact;
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
  const newPage = () => { drawFooter(); doc.addPage(); pageNum += 1; y = margin; };
  const ensure = (need: number) => { if (y + need > h - margin - 24) newPage(); };

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
    for (const l of lines) { ensure(size + 4); doc.text(l, x, y); y += size + 4; }
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
    for (let i = 1; i < lines.length; i++) { ensure(12); doc.text(lines[i], margin + 110, y); y += 12; }
  };

  const severityBadge = (sev: string, atX?: number) => {
    const [r, g, b] = sevColor(sev);
    const label = (sev || 'info').toUpperCase();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    const tw = doc.getTextWidth(label) + 10;
    const x0 = atX ?? margin;
    doc.setFillColor(r, g, b);
    doc.roundedRect(x0, y - 9, tw, 12, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text(label, x0 + 5, y);
    return tw;
  };

  // ===== TABLE HELPER =====
  const drawTable = (
    headers: string[],
    rows: string[][],
    columnWidths: number[],
    rowHeight = 16
  ) => {
    const totalW = columnWidths.reduce((s, w) => s + w, 0);
    // Header
    ensure(rowHeight + 6);
    doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
    doc.rect(margin, y, totalW, rowHeight, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    let cx = margin;
    headers.forEach((hd, i) => {
      doc.text(hd, cx + 4, y + 11);
      cx += columnWidths[i];
    });
    y += rowHeight;
    // Rows
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(DARK.r, DARK.g, DARK.b);
    rows.forEach((row, idx) => {
      // compute needed height (max wrapped lines across cols)
      let maxLines = 1;
      const wrapped: string[][] = [];
      row.forEach((cell, i) => {
        const lines = doc.splitTextToSize(cell || '', columnWidths[i] - 8);
        wrapped.push(lines);
        if (lines.length > maxLines) maxLines = lines.length;
      });
      const rh = Math.max(rowHeight, maxLines * 10 + 6);
      ensure(rh);
      if (idx % 2 === 0) {
        doc.setFillColor(LIGHT_BG.r, LIGHT_BG.g, LIGHT_BG.b);
        doc.rect(margin, y, totalW, rh, 'F');
      }
      // border
      doc.setDrawColor(BORDER.r, BORDER.g, BORDER.b);
      doc.line(margin, y + rh, margin + totalW, y + rh);
      let cx2 = margin;
      wrapped.forEach((lines, i) => {
        let ty = y + 11;
        lines.forEach((ln: string) => {
          doc.text(ln, cx2 + 4, ty);
          ty += 10;
        });
        cx2 += columnWidths[i];
      });
      y += rh;
    });
    // outer border
    doc.setDrawColor(BORDER.r, BORDER.g, BORDER.b);
    doc.rect(margin, y - (rows.length * rowHeight + rowHeight), totalW, 1, 'S');
    y += 6;
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
  doc.text(`Generato: ${new Date(report.generated_at).toLocaleString('it-IT')}`, margin, 140);
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
  const anagRows: Array<[string, any]> = [
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
  anagRows.forEach(([k, v]) => { if (v) kv(k, String(v)); });

  // ===== 2 SCOPE — TABELLA REGOLE MONITORATE =====
  sectionTitle(2, 'Scope della scansione');
  const s = report.scan || {};
  kv('Target principale', `${s.target || 'n/d'} (${s.target_type || 'n/d'})`);
  kv('Profilo', s.scan_profile || 'n/d');
  kv('Hosting', s.hosting_context || 'n/d');
  kv('Completata', s.completed_at ? new Date(s.completed_at).toLocaleString('it-IT') : 'n/d');
  y += 6;

  const monitored = report.monitored_scope || [];
  if (monitored.length > 0) {
    text(`Asset oggetto della scansione (${monitored.length})`, { bold: true, size: 10, color: [BRAND.r, BRAND.g, BRAND.b] });
    y += 2;
    const scopeRows = monitored.map((m: any) => {
      const value = m.entry_type === 'range'
        ? `${m.ip_start} - ${m.ip_end}`
        : m.input_value;
      const origine = m.discovered_via === 'subdomain_dump'
        ? `da sottodominio (${m.discovered_from || 'n/d'})`
        : (m.discovered_via || 'manuale');
      return [m.entry_type || 'n/d', value, origine];
    });
    drawTable(['Tipo', 'Valore', 'Origine'], scopeRows, [80, 290, 145]);
  } else {
    text('Nessuna regola di scope configurata.', { color: [MUTED.r, MUTED.g, MUTED.b], size: 9 });
  }

  // ===== 3 SOTTODOMINI CON PROFONDITÀ =====
  sectionTitle(3, 'Sottodomini rilevati');
  const allHostnames = new Set<string>();
  const dumpSubdomains: Array<{ host: string; ip?: string | null; root: string; depth: number; evidence: string }> = [];
  (report.subdomain_dumps || []).forEach((dump: any) => {
    ((dump.results || []) as any[]).forEach((r: any) => {
      const host = normalizeHost(r.subdomain);
      if (!host) return;
      allHostnames.add(host);
      dumpSubdomains.push({
        host,
        ip: r.ip,
        root: dump.root_domain,
        depth: depthFromRoot(host, dump.root_domain),
        evidence: [r.ip, r.country, r.asn_name].filter(Boolean).join(' · ') || `rilevato ${dump.created_at ? new Date(dump.created_at).toLocaleString('it-IT') : ''}`,
      });
    });
  });
  (report.assets_in_scope || []).forEach((a: any) => {
    if (a.hostname) allHostnames.add(a.hostname.toLowerCase());
    if (a.asset_type === 'domain' || a.asset_type === 'subdomain') allHostnames.add(String(a.asset_value).toLowerCase());
  });
  monitored.forEach((m: any) => {
    if (m.entry_type === 'domain') allHostnames.add(String(m.input_value).toLowerCase());
  });
  // anche da intel target
  (report.intel || []).forEach((i: any) => {
    if (i.target && /[a-z]/i.test(i.target) && !/^\d+\.\d+\.\d+\.\d+$/.test(i.target)) {
      allHostnames.add(String(i.target).toLowerCase());
    }
  });

  // Raggruppa: root = ultimi 2 label, subdomain = profondità = label_count - 2
  const subdomainGroups: Record<string, Array<{ host: string; depth: number }>> = {};
  Array.from(allHostnames).forEach((host) => {
    const labels = host.split('.').filter(Boolean);
    if (labels.length < 2) return;
    const root = labels.slice(-2).join('.');
    const depth = Math.max(0, labels.length - 2);
    (subdomainGroups[root] ||= []).push({ host, depth });
  });

  const hasSubs = Object.values(subdomainGroups).some((arr) => arr.some((x) => x.depth > 0));
  if (!hasSubs) {
    text('Nessun sottodominio rilevato in questo snapshot. Esegui un dump sottodomini per arricchire lo scope.', { color: [MUTED.r, MUTED.g, MUTED.b], size: 9 });
  } else if (dumpSubdomains.length > 0) {
    text(`Evidenze dirette da discovery sottodomini (${dumpSubdomains.length})`, { bold: true, size: 10, color: [BRAND.r, BRAND.g, BRAND.b] });
    drawTable(['Profondità', 'Sottodominio', 'Root', 'Evidenza'], dumpSubdomains.map((x) => [`L${x.depth}`, x.host, x.root, x.evidence]), [65, 190, 110, 150]);
  } else {
    Object.entries(subdomainGroups).forEach(([root, list]) => {
      list.sort((a, b) => a.depth - b.depth || a.host.localeCompare(b.host));
      const subs = list.filter((x) => x.depth > 0);
      if (subs.length === 0) return;
      text(`${root}  —  ${subs.length} sottodomin${subs.length === 1 ? 'io' : 'i'}`, { bold: true, size: 11, color: [BRAND.r, BRAND.g, BRAND.b] });
      const rows = subs.map((x) => [`L${x.depth}`, x.host, x.depth >= 3 ? 'profondo' : x.depth === 2 ? 'medio' : 'diretto']);
      drawTable(['Profondità', 'Sottodominio', 'Livello'], rows, [70, 320, 125]);
    });
  }

  // ===== 4 PORTE APERTE — da Shodan observations + intel =====
  sectionTitle(4, 'Porte aperte e servizi esposti');
  const portMap: Record<string, { ports: Set<number>; banners: string[] }> = {};
  const addPort = (host: string, p: number, banner?: string) => {
    if (!host || !Number.isFinite(p)) return;
    portMap[host] ||= { ports: new Set(), banners: [] };
    portMap[host].ports.add(p);
    if (banner) portMap[host].banners.push(banner);
  };
  (report.observations || []).forEach((obs: any) => {
    const v = obs.value || {};
    const host = v.ip || v.host || v.hostname || (obs.title || '').split(' ').pop();
    // Shodan: value.ports = [22,80] o value.data = [{port, product}]
    if (Array.isArray(v.ports)) v.ports.forEach((p: number) => addPort(host, Number(p)));
    if (Array.isArray(v.data)) v.data.forEach((d: any) => addPort(host, Number(d.port), d.product || d._shodan?.module));
    if (Array.isArray(v.open_ports)) v.open_ports.forEach((p: number) => addPort(host, Number(p)));
  });
  (report.intel || []).forEach((i: any) => {
    const v = i.summary || {};
    if (Array.isArray(v.ports)) v.ports.forEach((p: number) => addPort(i.target, Number(p)));
    if (Array.isArray(v.data)) v.data.forEach((d: any) => addPort(i.target, Number(d.port), d.product));
  });

  const portEntries = Object.entries(portMap);
  if (portEntries.length === 0) {
    text('Nessuna porta esposta rilevata negli IP analizzati durante la scansione passiva (host non presenti nei database di banner pubblici).', { color: [MUTED.r, MUTED.g, MUTED.b], size: 9 });
  } else {
    const rows = portEntries.map(([host, info]) => [
      host,
      Array.from(info.ports).sort((a, b) => a - b).join(', '),
      info.banners.slice(0, 3).join(' / ') || '—',
    ]);
    drawTable(['Host / IP', 'Porte', 'Servizi rilevati'], rows, [170, 130, 215]);
  }

  // ===== 5 ENRICHMENT OSINT — etichette neutre, no junk =====
  sectionTitle(5, 'Enrichment OSINT & Web Check');
  const intel = (report.intel || []).filter((i: any) => !isJunkSummary(i.summary));
  const observations = report.observations || [];

  // Aggiungi dai key observations (DNSSEC, tech, mail) per arricchire OSINT
  const obsAsIntel = observations
    .filter((ob: any) => ['dnssec','tech_stack','mail_security','security_headers','ct_log'].includes(ob.module))
    .map((ob: any) => ({ provider: ob.module, target: ob.value?.domain || ob.value?.url || s.target || 'n/d', summary: ob.value }));
  const allIntel = [...intel, ...obsAsIntel];

  if (allIntel.length === 0) {
    text('Nessun dato di enrichment disponibile.', { color: [MUTED.r, MUTED.g, MUTED.b], size: 9 });
  } else {
    const byProvider: Record<string, any[]> = {};
    allIntel.forEach((i: any) => { (byProvider[i.provider || 'altro'] ||= []).push(i); });
    Object.entries(byProvider).forEach(([prov, list]) => {
      const rows = list.slice(0, 20).map((i: any) => [
        i.target || 'n/d',
        summarizeIntel(prov, i.target, i.summary),
      ]);
      text(`${providerLabel(prov)} (${list.length})`, { bold: true, size: 11, color: [BRAND.r, BRAND.g, BRAND.b] });
      y += 2;
      drawTable(['Target', 'Risultato'], rows, [180, 335]);
      if (list.length > 20) text(`… e altri ${list.length - 20} risultati`, { size: 8, color: [MUTED.r, MUTED.g, MUTED.b], indent: 4 });
      y += 4;
    });
  }

  // ===== 6 CVE & FINDINGS — per asset =====
  sectionTitle(6, 'CVE e vulnerabilità');
  const allFindings = report.findings || [];
  const sc = report.findings_by_severity || {};
  text(
    `Totale findings: ${allFindings.length}  ·  Critici: ${sc.critical || 0}  ·  Alti: ${sc.high || 0}  ·  Medi: ${sc.medium || 0}  ·  Bassi: ${sc.low || 0}  ·  Info: ${sc.info || 0}`,
    { bold: true, size: 10 }
  );
  y += 6;

  // Raggruppa per asset
  const byAsset: Record<string, any[]> = {};
  allFindings.forEach((f: any) => {
    const k = f.affected_asset || f.affected_url || s.target || 'n/d';
    (byAsset[k] ||= []).push(f);
  });
  const assetEntries = Object.entries(byAsset).sort((a, b) => b[1].length - a[1].length);

  if (assetEntries.length === 0) {
    text('Nessun finding rilevato.', { color: [MUTED.r, MUTED.g, MUTED.b], size: 9 });
  } else {
    // Tabella riepilogo per asset
    const sumRows = assetEntries.map(([asset, list]) => {
      const cnt = { critical: 0, high: 0, medium: 0, low: 0, info: 0 } as Record<string, number>;
      list.forEach((f) => { cnt[f.severity] = (cnt[f.severity] || 0) + 1; });
      return [
        asset,
        String(list.length),
        String(cnt.critical || 0),
        String(cnt.high || 0),
        String(cnt.medium || 0),
        String(cnt.low || 0),
        String(cnt.info || 0),
      ];
    });
    text('Riepilogo findings per asset', { bold: true, size: 10, color: [BRAND.r, BRAND.g, BRAND.b] });
    y += 2;
    drawTable(['Asset', 'Tot', 'Crit', 'High', 'Med', 'Low', 'Info'], sumRows, [225, 40, 50, 50, 50, 50, 50]);

    // Dettaglio per asset
    y += 6;
    assetEntries.forEach(([asset, list]) => {
      ensure(40);
      text(asset, { bold: true, size: 11, color: [BRAND.r, BRAND.g, BRAND.b] });
      list.sort((a, b) => {
        const r = { critical: 5, high: 4, medium: 3, low: 2, info: 1 } as Record<string, number>;
        return (r[b.severity] || 0) - (r[a.severity] || 0);
      }).slice(0, 30).forEach((f: any) => {
        ensure(28);
        const badgeW = severityBadge(f.severity);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(DARK.r, DARK.g, DARK.b);
        const titleLines = doc.splitTextToSize(f.title || '(senza titolo)', w - margin * 2 - badgeW - 10);
        doc.text(titleLines[0], margin + badgeW + 6, y);
        y += 12;
        for (let i = 1; i < titleLines.length; i++) { ensure(12); doc.text(titleLines[i], margin + badgeW + 6, y); y += 12; }
        if (Array.isArray(f.cve) && f.cve.length) text(`CVE: ${f.cve.join(', ')}${f.cvss ? '  ·  CVSS ' + f.cvss : ''}`, { size: 9, color: [MUTED.r, MUTED.g, MUTED.b] });
        if (f.remediation) text(`Remediation: ${f.remediation}`, { size: 9 });
        y += 3;
      });
      if (list.length > 30) text(`… e altri ${list.length - 30} findings`, { size: 8, color: [MUTED.r, MUTED.g, MUTED.b], indent: 4 });
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
      sectionTitle(8, 'Priorità operative AI (Top 5)');
      report.ai.top_recommendations.forEach((r) => {
        ensure(40);
        const badgeW = severityBadge(r.severity || 'info');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(DARK.r, DARK.g, DARK.b);
        doc.text(`#${r.priority}  ${r.title}`, margin + badgeW + 6, y);
        y += 14;
        if (r.rationale) text(`Razionale: ${r.rationale}`, { size: 9 });
        if (r.action) text(`Indicazione: ${r.action}`, { size: 9, bold: true });
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

  drawFooter();
  const filename = `SurfaceScan360_${(o.name || 'report').replace(/\s+/g, '_')}_${new Date()
    .toISOString()
    .slice(0, 10)}.pdf`;
  doc.save(filename);
}
