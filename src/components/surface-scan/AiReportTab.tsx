import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, FileText, Download, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
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
  status?: 'pianificato' | 'completato';
}

interface AiReport {
  generated_at: string;
  organization: any;
  scan: any;
  assets_in_scope: any[];
  findings: any[];
  findings_by_severity: Record<string, number>;
  intel: any[];
  remediation_tasks?: RemediationTask[];
  kev_generation?: { created: number; total_kev: number; existing: number };
  ai: {
    executive_summary?: string;
    risk_score?: number;
    risk_level?: string;
    top_recommendations?: Array<{ priority: number; title: string; rationale: string; action: string; affected_assets?: string[]; severity?: string }>;
    correlations?: string[];
    compliance_notes?: string;
  } | null;
  ai_error?: string | null;
}

const sevColor = (s?: string) => {
  switch (s) {
    case 'critical': return 'bg-red-600 text-white';
    case 'high': return 'bg-orange-600 text-white';
    case 'medium': return 'bg-yellow-500 text-black';
    case 'low': return 'bg-blue-500 text-white';
    default: return 'bg-muted text-foreground';
  }
};

export const AiReportTab: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<AiReport | null>(null);

  const generate = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('surfacescan360-ai-report', { body: {} });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setReport((data as any).report as AiReport);
      toast.success('Report AI generato');
    } catch (e: any) {
      toast.error('Errore generazione report: ' + (e.message || 'unknown'));
    } finally {
      setLoading(false);
    }
  };

  const downloadPdf = () => {
    if (!report) return;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const margin = 40;
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    let y = margin;

    const newPage = () => { doc.addPage(); y = margin; };
    const ensure = (need: number) => { if (y + need > h - margin) newPage(); };
    const line = (txt: string, opts: { size?: number; bold?: boolean; color?: [number, number, number] } = {}) => {
      const size = opts.size ?? 10; doc.setFontSize(size);
      doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
      if (opts.color) doc.setTextColor(...opts.color); else doc.setTextColor(20, 20, 20);
      const lines = doc.splitTextToSize(txt, w - margin * 2);
      for (const l of lines) { ensure(size + 2); doc.text(l, margin, y); y += size + 4; }
    };
    const hr = () => { ensure(8); doc.setDrawColor(200); doc.line(margin, y, w - margin, y); y += 8; };

    // Header
    line('Report SurfaceScan360 - Sintesi AI', { size: 18, bold: true });
    line(`Generato: ${new Date(report.generated_at).toLocaleString('it-IT')}`, { size: 9, color: [120, 120, 120] });
    hr();

    // Anagrafica
    line('1. Anagrafica cliente', { size: 13, bold: true });
    const o = report.organization || {};
    [
      ['Ragione sociale', o.legal_name || o.name],
      ['P.IVA', o.vat_number], ['CF', o.fiscal_code],
      ['Sede legale', o.legal_address], ['Sede operativa', o.operational_address],
      ['PEC', o.pec], ['Email', o.email], ['Telefono', o.phone],
      ['Settore', o.business_sector], ['Classificazione NIS2', o.nis2_classification],
    ].forEach(([k, v]) => { if (v) line(`${k}: ${v}`); });
    hr();

    // Scope
    line('2. Asset in scope', { size: 13, bold: true });
    const s = report.scan || {};
    line(`Target: ${s.target} (${s.target_type}) - Profilo: ${s.scan_profile}`);
    line(`Hosting: ${s.hosting_context || 'n/d'} - Completato: ${s.completed_at ? new Date(s.completed_at).toLocaleString('it-IT') : 'n/d'}`);
    line(`Asset rilevati: ${report.assets_in_scope.length}`);
    report.assets_in_scope.slice(0, 60).forEach((a) => line(`  - [${a.asset_type}] ${a.asset_value}${a.hostname ? ' (' + a.hostname + ')' : ''}`, { size: 9 }));
    hr();

    // AI
    if (report.ai) {
      line('3. Executive summary (AI)', { size: 13, bold: true });
      if (report.ai.risk_score != null) line(`Risk score: ${report.ai.risk_score}/100 - Livello: ${report.ai.risk_level || 'n/d'}`, { bold: true });
      if (report.ai.executive_summary) line(report.ai.executive_summary);
      hr();

      line('4. Top 5 raccomandazioni (AI)', { size: 13, bold: true });
      (report.ai.top_recommendations || []).forEach((r) => {
        line(`#${r.priority} [${(r.severity || '').toUpperCase()}] ${r.title}`, { bold: true });
        if (r.rationale) line(`Razionale: ${r.rationale}`, { size: 9 });
        if (r.action) line(`Azione: ${r.action}`, { size: 9 });
        if (r.affected_assets?.length) line(`Asset: ${r.affected_assets.join(', ')}`, { size: 9, color: [100, 100, 100] });
        y += 4;
      });
      hr();

      if (report.ai.correlations?.length) {
        line('5. Correlazioni', { size: 13, bold: true });
        report.ai.correlations.forEach((c) => line(`- ${c}`));
        hr();
      }
      if (report.ai.compliance_notes) {
        line('6. Note di compliance', { size: 13, bold: true });
        line(report.ai.compliance_notes);
        hr();
      }
    } else if (report.ai_error) {
      line(`Sintesi AI non disponibile: ${report.ai_error}`, { color: [180, 0, 0] });
      hr();
    }

    // Findings
    line('7. Findings completi', { size: 13, bold: true });
    const sc = report.findings_by_severity || {};
    line(`Totale: ${report.findings.length} - Critici: ${sc.critical || 0}, Alti: ${sc.high || 0}, Medi: ${sc.medium || 0}, Bassi: ${sc.low || 0}, Info: ${sc.info || 0}`);
    y += 4;
    report.findings.slice(0, 120).forEach((f) => {
      line(`[${f.severity.toUpperCase()}] ${f.title}`, { bold: true, size: 10 });
      if (f.affected_asset || f.affected_url) line(`Asset: ${f.affected_asset || f.affected_url}`, { size: 9, color: [100, 100, 100] });
      if (f.cve?.length) line(`CVE: ${(f.cve || []).join(', ')}`, { size: 9 });
      if (f.remediation) line(`Remediation: ${f.remediation}`, { size: 9 });
      y += 2;
    });

    doc.save(`SurfaceScan360_Report_${(o.name || 'org').replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sparkles className="w-5 h-5" /> Report AI SurfaceScan360</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Genera un report con anagrafica cliente, asset in scope, findings e Top-5 raccomandazioni
            correlate da AI agent. Pronto per export PDF.
          </p>
          <div className="flex gap-2">
            <Button onClick={generate} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
              Genera report AI
            </Button>
            {report && (
              <Button variant="outline" onClick={downloadPdf}>
                <Download className="w-4 h-4 mr-2" /> Scarica PDF
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {report?.ai && (
        <>
          <Card>
            <CardHeader><CardTitle>Executive summary</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {report.ai.risk_score != null && (
                <div className="flex items-center gap-3">
                  <Badge className={sevColor(report.ai.risk_level?.toLowerCase())}>
                    {report.ai.risk_level} - {report.ai.risk_score}/100
                  </Badge>
                </div>
              )}
              <p className="text-sm whitespace-pre-wrap">{report.ai.executive_summary}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Top 5 raccomandazioni</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {(report.ai.top_recommendations || []).map((r, i) => (
                <div key={i} className="border-l-4 pl-3 py-2" style={{ borderColor: 'hsl(var(--primary))' }}>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline">#{r.priority}</Badge>
                    <Badge className={sevColor(r.severity)}>{r.severity}</Badge>
                    <span className="font-semibold">{r.title}</span>
                  </div>
                  <p className="text-sm"><b>Razionale:</b> {r.rationale}</p>
                  <p className="text-sm"><b>Azione:</b> {r.action}</p>
                  {r.affected_assets?.length ? <p className="text-xs text-muted-foreground">Asset: {r.affected_assets.join(', ')}</p> : null}
                </div>
              ))}
            </CardContent>
          </Card>

          {report.ai.correlations?.length ? (
            <Card>
              <CardHeader><CardTitle>Correlazioni</CardTitle></CardHeader>
              <CardContent>
                <ul className="text-sm list-disc pl-5 space-y-1">
                  {report.ai.correlations.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}

      {report?.ai_error && (
        <Card><CardContent className="pt-6 text-sm text-destructive">Sintesi AI non disponibile: {report.ai_error}</CardContent></Card>
      )}
    </div>
  );
};

export default AiReportTab;
