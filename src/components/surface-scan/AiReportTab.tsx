import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, FileText, Download, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import { generateSurfaceScan360Pdf } from '@/lib/surfaceScan360PdfReport';
import { generateSurfaceScan360Docx } from '@/lib/surfaceScan360DocxReport';
import { redactInternalSourceNames } from '@/lib/surfaceSourceLabels';

interface AiReport {
  generated_at: string;
  organization: any;
  scan: any;
  assets_in_scope: any[];
  findings: any[];
  findings_by_severity: Record<string, number>;
  exposure_score?: {
    posture_score: number;
    risk_level: string;
    risk_points: number;
    vulnerability_summary?: {
      confirmed?: number;
      candidate?: number;
      unknown?: number;
      explanation?: string;
    };
  };
  scope_guard_summary?: {
    in_scope?: number;
    excluded_by_scope?: number;
    excluded_shared_noise?: number;
    excluded_reasons?: Record<string, number>;
  };
  cve_catalog?: Array<{
    cve_id: string;
    description?: string | null;
    cvss?: number | null;
    cvss_severity?: string | null;
    epss?: number | null;
    epss_percentile?: number | null;
    cisa_kev?: boolean;
    affected_assets?: string[];
    match_status?: 'confirmed' | 'candidate' | null;
    service_context?: Array<Record<string, unknown>>;
  }>;
  intel: any[];
  observations?: any[];
  subdomain_dumps?: any[];
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
  switch ((s || '').toLowerCase()) {
    case 'critical':
    case 'critico': return 'bg-red-600 text-white';
    case 'high':
    case 'alto': return 'bg-orange-600 text-white';
    case 'medium':
    case 'medio': return 'bg-yellow-500 text-black';
    case 'low':
    case 'basso': return 'bg-blue-500 text-white';
    default: return 'bg-muted text-foreground';
  }
};

const PAGE_SIZE = 20;

const redactReportWords = (value: string) => redactInternalSourceNames(value, 'Motore exposure');

const normalizeHost = (value?: string) => String(value || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
const getSubdomainDepth = (host: string, root: string) => {
  const h = normalizeHost(host);
  const r = normalizeHost(root);
  if (!h || !r || h === r || !h.endsWith(`.${r}`)) return 0;
  return h.slice(0, -(r.length + 1)).split('.').filter(Boolean).length;
};

function Paginator({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between text-xs mt-3">
      <span className="text-muted-foreground">Pagina {page + 1} di {totalPages}</span>
      <div className="flex gap-1">
        <Button variant="outline" size="sm" disabled={page === 0} onClick={() => onChange(page - 1)}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => onChange(page + 1)}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

export const AiReportTab: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<AiReport | null>(null);
  const [assetPage, setAssetPage] = useState(0);
  const [findingPage, setFindingPage] = useState(0);
  const [cvePage, setCvePage] = useState(0);
  const [intelPage, setIntelPage] = useState(0);
  const [obsPage, setObsPage] = useState(0);
  const { organizationId } = useClientOrganization();

  const generate = async () => {
    if (!organizationId) {
      toast.error('Seleziona prima un cliente');
      return;
    }
    setLoading(true);
    setAssetPage(0); setFindingPage(0); setCvePage(0); setIntelPage(0); setObsPage(0);
    try {
      const { data, error } = await supabase.functions.invoke('surfacescan360-ai-report', {
        body: { organization_id: organizationId },
      });
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

  const assets = report?.assets_in_scope ?? [];
  const findings = report?.findings ?? [];
  const cveCatalog = report?.cve_catalog ?? [];
  const intel = report?.intel ?? [];
  const observations = report?.observations ?? [];
  const subdomainEvidence = useMemo(() => (report?.subdomain_dumps ?? []).flatMap((dump: any) =>
    ((dump.results ?? []) as any[]).map((r: any) => ({
      host: r.subdomain,
      ip: r.ip,
      root: dump.root_domain,
      depth: getSubdomainDepth(r.subdomain, dump.root_domain),
      discoveredAt: dump.created_at,
      meta: [r.country, r.asn_name].filter(Boolean).join(' · '),
    }))
  ), [report?.subdomain_dumps]);

  const assetPages = Math.max(1, Math.ceil(assets.length / PAGE_SIZE));
  const findingPages = Math.max(1, Math.ceil(findings.length / PAGE_SIZE));
  const cvePages = Math.max(1, Math.ceil(cveCatalog.length / PAGE_SIZE));
  const intelPages = Math.max(1, Math.ceil(intel.length / PAGE_SIZE));
  const obsPages = Math.max(1, Math.ceil(observations.length / PAGE_SIZE));

  const assetsSlice = useMemo(() => assets.slice(assetPage * PAGE_SIZE, (assetPage + 1) * PAGE_SIZE), [assets, assetPage]);
  const findingsSlice = useMemo(() => findings.slice(findingPage * PAGE_SIZE, (findingPage + 1) * PAGE_SIZE), [findings, findingPage]);
  const cveSlice = useMemo(() => cveCatalog.slice(cvePage * PAGE_SIZE, (cvePage + 1) * PAGE_SIZE), [cveCatalog, cvePage]);
  const intelSlice = useMemo(() => intel.slice(intelPage * PAGE_SIZE, (intelPage + 1) * PAGE_SIZE), [intel, intelPage]);
  const observationsSlice = useMemo(() => observations.slice(obsPage * PAGE_SIZE, (obsPage + 1) * PAGE_SIZE), [observations, obsPage]);

  const downloadPdf = () => {
    if (!report) return;
    generateSurfaceScan360Pdf(report as any);
  };

  const downloadDocx = async () => {
    if (!report) return;
    try {
      await generateSurfaceScan360Docx(report as any);
    } catch (error) {
      console.error('Error exporting SurfaceScan report DOCX:', error);
      toast.error('Export DOCX non riuscito');
    }
  };

  const o = report?.organization || {};
  const s = report?.scan || {};

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sparkles className="w-5 h-5" /> Report AI SurfaceScan360</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Genera un report completo con anagrafica cliente, scope, sottodomini, findings e top-10
            raccomandazioni consulenziali. Tutte le sezioni sono paginate per una lettura ordinata e pronte per export PDF e DOCX.
          </p>
          <div className="flex gap-2">
            <Button onClick={generate} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
              Genera report AI
            </Button>
            {report && (
              <>
                <Button variant="outline" onClick={downloadPdf}>
                  <Download className="w-4 h-4 mr-2" /> Scarica PDF
                </Button>
                <Button variant="outline" onClick={() => void downloadDocx()}>
                  <Download className="w-4 h-4 mr-2" /> Scarica DOCX
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {report && (
        <>
          {/* Anagrafica */}
          <Card>
            <CardHeader><CardTitle>1. Anagrafica cliente</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {[
                ['Ragione sociale', o.legal_name || o.name],
                ['P.IVA', o.vat_number], ['Codice fiscale', o.fiscal_code],
                ['Sede legale', o.legal_address], ['Sede operativa', o.operational_address],
                ['PEC', o.pec], ['Email', o.email], ['Telefono', o.phone],
                ['Settore', o.business_sector], ['Classificazione NIS2', o.nis2_classification],
              ].map(([k, v]) => v ? (
                <div key={k as string} className="flex flex-col">
                  <span className="text-xs text-muted-foreground">{k}</span>
                  <span className="font-medium">{v as string}</span>
                </div>
              ) : null)}
            </CardContent>
          </Card>

          {/* Scan */}
          <Card>
            <CardHeader><CardTitle>2. Dettagli scansione</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div><span className="text-xs text-muted-foreground block">Target</span><span className="font-medium">{s.target}</span></div>
              <div><span className="text-xs text-muted-foreground block">Tipo target</span><span className="font-medium">{s.target_type}</span></div>
              <div><span className="text-xs text-muted-foreground block">Profilo</span><span className="font-medium">{s.scan_profile}</span></div>
              <div><span className="text-xs text-muted-foreground block">Hosting</span><span className="font-medium">{s.hosting_context || 'n/d'}</span></div>
              <div><span className="text-xs text-muted-foreground block">Avviata</span><span className="font-medium">{s.started_at ? new Date(s.started_at).toLocaleString('it-IT') : 'n/d'}</span></div>
              <div><span className="text-xs text-muted-foreground block">Completata</span><span className="font-medium">{s.completed_at ? new Date(s.completed_at).toLocaleString('it-IT') : 'n/d'}</span></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>3. Scope Guard</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div className="rounded-lg border border-border p-3">
                <div className="text-xs text-muted-foreground">Elementi in scope</div>
                <div className="text-xl font-semibold">{Number(report.scope_guard_summary?.in_scope || 0)}</div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="text-xs text-muted-foreground">Esclusi per scope</div>
                <div className="text-xl font-semibold">{Number(report.scope_guard_summary?.excluded_by_scope || 0)}</div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="text-xs text-muted-foreground">Esclusi shared/noise</div>
                <div className="text-xl font-semibold">{Number(report.scope_guard_summary?.excluded_shared_noise || 0)}</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>4. Evidenze sottodomini ({subdomainEvidence.length})</CardTitle></CardHeader>
            <CardContent>
              {subdomainEvidence.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nessuna evidenza di sottodominio disponibile per questo cliente.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-muted-foreground border-b border-border">
                      <tr>
                        <th className="text-left py-2 pr-3">Sottodominio</th>
                        <th className="text-left py-2 pr-3">IP</th>
                        <th className="text-left py-2 pr-3">Root</th>
                        <th className="text-left py-2 pr-3">Profondità</th>
                        <th className="text-left py-2">Evidenza</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subdomainEvidence.map((item, i) => (
                        <tr key={`${item.host}-${i}`} className="border-b border-border/40">
                          <td className="py-2 pr-3 font-medium break-all">{item.host}</td>
                          <td className="py-2 pr-3"><Badge variant="outline">{item.ip || '—'}</Badge></td>
                          <td className="py-2 pr-3 text-muted-foreground">{item.root}</td>
                          <td className="py-2 pr-3"><Badge className={sevColor(item.depth >= 2 ? 'medium' : 'low')}>L{item.depth}</Badge></td>
                          <td className="py-2 text-xs text-muted-foreground">{item.meta || (item.discoveredAt ? new Date(item.discoveredAt).toLocaleString('it-IT') : '—')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* AI summary */}
          {report.ai && (
            <Card>
              <CardHeader><CardTitle>4. Executive summary (AI)</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {report.ai.risk_score != null && (
                  <Badge className={sevColor(report.ai.risk_level)}>
                    Postura {report.ai.risk_score}/100 · Rischio {report.ai.risk_level}
                  </Badge>
                )}
                {report.exposure_score && (
                  <p className="text-xs text-muted-foreground">
                    100 = postura ottima · {report.exposure_score.risk_points} punti rischio.{' '}
                    {report.exposure_score.vulnerability_summary?.explanation}
                  </p>
                )}
                <p className="text-sm whitespace-pre-wrap">{redactReportWords(String(report.ai.executive_summary || ''))}</p>
              </CardContent>
            </Card>
          )}

          {report.ai?.top_recommendations?.length ? (
            <Card>
              <CardHeader><CardTitle>5. Top 10 raccomandazioni</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {report.ai.top_recommendations.map((r, i) => (
                  <div key={i} className="border-l-4 pl-3 py-2" style={{ borderColor: 'hsl(var(--primary))' }}>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge variant="outline">#{r.priority}</Badge>
                      <Badge className={sevColor(r.severity)}>{r.severity}</Badge>
                      <span className="font-semibold">{redactReportWords(String(r.title || ''))}</span>
                    </div>
                    <p className="text-sm"><b>Razionale:</b> {redactReportWords(String(r.rationale || ''))}</p>
                    <p className="text-sm"><b>Azione:</b> {redactReportWords(String(r.action || ''))}</p>
                    {r.affected_assets?.length ? <p className="text-xs text-muted-foreground">Asset: {r.affected_assets.join(', ')}</p> : null}
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {report.ai?.correlations?.length ? (
            <Card>
              <CardHeader><CardTitle>6. Correlazioni</CardTitle></CardHeader>
              <CardContent>
                <ul className="text-sm list-disc pl-5 space-y-1">
                  {report.ai.correlations.map((c, i) => <li key={i}>{redactReportWords(String(c || ''))}</li>)}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {report.ai?.compliance_notes ? (
            <Card>
              <CardHeader><CardTitle>7. Note di compliance</CardTitle></CardHeader>
              <CardContent><p className="text-sm whitespace-pre-wrap">{redactReportWords(String(report.ai.compliance_notes || ''))}</p></CardContent>
            </Card>
          ) : null}

          {/* Asset in scope - paginati */}
          <Card>
            <CardHeader><CardTitle>8. Asset in scope ({assets.length})</CardTitle></CardHeader>
            <CardContent>
              <ul className="text-sm space-y-1">
                {assetsSlice.map((a, i) => (
                  <li key={i} className="flex items-start gap-2 border-b border-border/40 py-1">
                    <Badge variant="outline" className="text-xs shrink-0">{a.asset_type}</Badge>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{a.asset_value}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.hostname || '—'}{a.ip ? ` · ${a.ip}` : ''}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              <Paginator page={assetPage} totalPages={assetPages} onChange={setAssetPage} />
            </CardContent>
          </Card>

          {/* Findings - paginati */}
          <Card>
            <CardHeader>
              <CardTitle>9. Findings ({findings.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2 mb-3 text-xs">
                {Object.entries(report.findings_by_severity || {}).map(([sev, n]) => (
                  <Badge key={sev} className={sevColor(sev)}>{sev}: {n}</Badge>
                ))}
              </div>
              <ul className="space-y-2">
                {findingsSlice.map((f, i) => (
                  <li key={i} className="border-l-4 pl-3 py-2 border-border">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={sevColor(f.severity)}>{f.severity}</Badge>
                      <span className="font-semibold text-sm">{redactReportWords(String(f.title || ''))}</span>
                    </div>
                    {(f.affected_asset || f.affected_url) && (
                      <p className="text-xs text-muted-foreground mt-1">Asset: {f.affected_asset || f.affected_url}</p>
                    )}
                    {f.cve?.length ? <p className="text-xs">CVE: {f.cve.join(', ')}</p> : null}
                    {f.remediation && <p className="text-xs"><b>Remediation:</b> {redactReportWords(String(f.remediation || ''))}</p>}
                  </li>
                ))}
              </ul>
              <Paginator page={findingPage} totalPages={findingPages} onChange={setFindingPage} />
            </CardContent>
          </Card>

          {cveCatalog.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>10. Catalogo CVE ({cveCatalog.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {cveSlice.map((row) => (
                    <li key={row.cve_id} className="border-l-4 pl-3 py-2 border-border">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary">{row.cve_id}</Badge>
                        <Badge variant="outline">CVSS: {row.cvss ?? '-'}</Badge>
                        <Badge variant="outline">EPSS: {row.epss != null ? `${(Number(row.epss) * 100).toFixed(2)}%` : '-'}</Badge>
                        {row.cisa_kev ? <Badge className="bg-red-600 text-white">CISA KEV</Badge> : null}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{redactReportWords(String(row.description || 'Descrizione non disponibile.'))}</p>
                      {row.affected_assets?.length ? (
                        <p className="text-xs mt-1"><b>Asset:</b> {row.affected_assets.slice(0, 5).join(', ')}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <Paginator page={cvePage} totalPages={cvePages} onChange={setCvePage} />
              </CardContent>
            </Card>
          )}

          {/* Evidenze esterne - paginati */}
          {intel.length > 0 && (
            <Card>
              <CardHeader><CardTitle>11. Evidenze esterne ({intel.length})</CardTitle></CardHeader>
              <CardContent>
                <ul className="text-sm space-y-2">
                  {intelSlice.map((it, i) => (
                    <li key={i} className="border-b border-border/40 pb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs">{it.category || 'Evidenza'}</Badge>
                        <span className="font-medium text-sm truncate">{it.target}</span>
                      </div>
                      {(it.summary_text || it.summary) && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-3">
                          {redactReportWords(String(it.summary_text || (typeof it.summary === 'string' ? it.summary : JSON.stringify(it.summary).slice(0, 400))))}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
                <Paginator page={intelPage} totalPages={intelPages} onChange={setIntelPage} />
              </CardContent>
            </Card>
          )}

          {/* Observations - paginate */}
          {observations.length > 0 && (
            <Card>
              <CardHeader><CardTitle>12. Osservazioni ({observations.length})</CardTitle></CardHeader>
              <CardContent>
                <ul className="text-sm space-y-1">
                  {observationsSlice.map((ob, i) => (
                    <li key={i} className="flex items-start gap-2 border-b border-border/40 py-1">
                      <Badge variant="outline" className="text-xs shrink-0">{ob.module}</Badge>
                      <span className="flex-1 min-w-0 truncate">{ob.title}</span>
                      <Badge className={sevColor(ob.severity)}>{ob.severity}</Badge>
                    </li>
                  ))}
                </ul>
                <Paginator page={obsPage} totalPages={obsPages} onChange={setObsPage} />
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

export default AiReportTab;
