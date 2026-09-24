import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import {
  Activity, AlertTriangle, Building2, CheckCircle2, Clock, Euro, Lightbulb, Plus, ShieldCheck, Search, Wand2,
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ScatterChart, Scatter, ZAxis, Cell,
} from 'recharts';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import { useUserRoles } from '@/hooks/useUserRoles';
import { useBiaDashboard, useBiaServices, useBiaSources, contactName, type ServiceRow } from '@/hooks/useBia';
import { biaApi, biaQueryKeys } from '@/lib/api/bia';
import { ServiceFormDialog } from '@/components/bia/ServiceFormDialog';
import {
  CLASS_BADGE, CLASS_LABEL, COVERAGE_CLASS, COVERAGE_LABEL, STATUS_LABEL, formatMinutes, formatMoney,
} from '@/lib/bia/formatters';
import { businessPriorityIndex } from '@/lib/bia/calculations';
import type { BusinessService } from '@/types/bia';

const CLASS_COLOR: Record<string, string> = {
  low: 'hsl(var(--success))', medium: 'hsl(var(--warning))', high: 'hsl(var(--caution))', critical: 'hsl(var(--destructive))',
};

function Kpi({ icon: Icon, label, value, hint }: { icon: typeof Activity; label: string; value: string | number; hint?: string }) {
  return (
    <Card><CardContent className="p-4">
      <Icon className="w-4 h-4 text-muted-foreground mb-2" aria-hidden />
      <div className="text-2xl font-bold text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>}
    </CardContent></Card>
  );
}

export default function BusinessImpactAnalysis() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { selectedOrganization } = useClientOrganization();
  const { isSuperAdmin, isSales } = useUserRoles();
  const { data: rows = [], isLoading, orgId, error } = useBiaServices();
  const { data: dash } = useBiaDashboard();
  const { data: sources } = useBiaSources();
  const contacts = sources?.contacts.data ?? [];

  const [view, setView] = useState<'ops' | 'exec'>('ops');
  const [newOpen, setNewOpen] = useState(false);
  const [prefill, setPrefill] = useState<Partial<BusinessService> | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [ignored, setIgnored] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [fClass, setFClass] = useState('all');
  const [fStatus, setFStatus] = useState('all');
  const [fSvc, setFSvc] = useState('active');

  const canEdit = !isSales || isSuperAdmin;
  const refresh = () => qc.invalidateQueries({ queryKey: ['bia'] });

  const filtered = useMemo(() => rows.filter((r) => {
    if (fSvc !== 'all' && r.service.status !== fSvc) return false;
    if (fClass !== 'all' && r.current?.criticality_class !== fClass) return false;
    if (fStatus === 'none' && r.current) return false;
    if (fStatus === 'stale' && !(r.approved?.review_due_at && r.approved.review_due_at < new Date().toISOString().slice(0, 10))) return false;
    if (!['all', 'none', 'stale'].includes(fStatus) && r.current?.status !== fStatus) return false;
    const q = search.trim().toLowerCase();
    return !q || r.service.name.toLowerCase().includes(q) || r.service.code.toLowerCase().includes(q);
  }), [rows, search, fClass, fStatus, fSvc]);

  const createService = async (values: Partial<BusinessService>) => {
    const svc = await biaApi.createService(orgId, values);
    await biaApi.createDraft(orgId, svc.id);
    await refresh();
    toast.success(`Servizio ${svc.code} creato`);
    navigate(`/business-impact-analysis/services/${svc.id}`);
  };

  // Suggerimenti: asset critici e rischi che non sono ancora collegati. Non si trasformano automaticamente in servizi.
  const suggestions = useMemo(() => {
    const linkedRefs = new Set(rows.map((r) => r.service.source_ref).filter(Boolean));
    const infra = (sources?.infra.data ?? []).map((a) => ({
      key: `critical_infrastructure:${a.id}`, source: 'Infrastruttura critica', label: a.component_name || a.asset_id,
      reason: `Criticità ${a.criticality ?? 'n/d'}${a.rto_hours ? `, RTO dichiarato ${a.rto_hours} h` : ''}`, updated: a.updated_at,
    }));
    const irp = (sources?.irp.data ?? []).filter((a) => Number(a.rischio_residuo) >= 50).map((a) => ({
      key: `asset_irp:${a.id}`, source: 'Asset IRP', label: `${a.categoria ?? ''} ${a.tecnologia ?? ''}`.trim() || a.area,
      reason: `Rischio residuo ${Math.round(Number(a.rischio_residuo))}`, updated: a.updated_at,
    }));
    return [...infra, ...irp].filter((s) => !linkedRefs.has(s.key) && !ignored.includes(s.key));
  }, [sources, rows, ignored]);

  // Assessment: indicatori BIA (domande legacy 2, 3, 51 per ordine; mapping_mode = legacy_numeric)
  const assessmentSignals = useMemo(() => {
    const resp = sources?.responses.data ?? [];
    const find = (n: number) => resp.find((r) => r.assessment_questions?.order_index === n);
    return [
      { code: 'BC_BIA_PERFORMED', n: 2, label: 'BIA eseguita e aggiornata' },
      { code: 'BC_INTERRUPTION_SEVERITY_CRITERIA', n: 3, label: 'Criteri di gravità delle interruzioni' },
      { code: 'IR_FINANCIAL_LOSS_EVALUATED', n: 51, label: 'Valutazione della perdita finanziaria' },
    ].map((q) => ({ ...q, status: find(q.n)?.status ?? null }));
  }, [sources]);

  const actions = [
    dash?.stale ? { t: `${dash.stale} BIA scadute da rivedere`, tone: 'destructive' } : null,
    dash?.drafts ? { t: `${dash.drafts} bozze da completare`, tone: 'muted' } : null,
    dash?.in_review ? { t: `${dash.in_review} BIA in attesa di approvazione`, tone: 'muted' } : null,
    dash?.rto_not_covered ? { t: `${dash.rto_not_covered} servizi con RTO non coperto`, tone: 'destructive' } : null,
    dash?.rpo_not_covered ? { t: `${dash.rpo_not_covered} servizi con backup incompatibile con l'RPO`, tone: 'destructive' } : null,
    dash?.no_owner ? { t: `${dash.no_owner} servizi senza business owner`, tone: 'warning' } : null,
    dash?.low_confidence ? { t: `${dash.low_confidence} stime economiche a bassa confidenza`, tone: 'warning' } : null,
    dash?.review_due_30d ? { t: `${dash.review_due_30d} revisioni in scadenza nei prossimi 30 giorni`, tone: 'warning' } : null,
  ].filter(Boolean) as { t: string; tone: string }[];

  const total = dash?.services_total ?? 0;
  const failedSources = sources ? Object.entries(sources).filter(([, v]) => !v.ok).map(([k]) => k) : [];

  // Vista executive
  const currents = rows.filter((r) => r.service.status === 'active' && r.current);
  const topByCost = [...currents].sort((a, b) => Number(b.current!.result.potential_downtime_cost_24h ?? -1) - Number(a.current!.result.potential_downtime_cost_24h ?? -1)).slice(0, 5);
  const scatter = currents.filter((r) => r.current!.business_impact_score !== null).map((r) => ({
    name: r.service.name, x: Number(r.current!.result.resilience_score ?? 0), y: Number(r.current!.business_impact_score),
    z: Number(r.current!.result.potential_downtime_cost_24h ?? 0), cls: r.current!.criticality_class ?? 'low',
  }));
  const curve = (dash?.curve ?? []).map((p) => ({ h: formatMinutes(p.horizon_minutes), total: Number(p.total), services: p.services }));
  const gaps = currents.flatMap((r) => {
    const rec = r.current!.result.recovery;
    const out: { svc: string; t: string; score: number }[] = [];
    if (rec?.rto === 'not_covered') out.push({ svc: r.service.name, t: `RTO scoperto di ${formatMinutes(rec.rto_gap_minutes)}`, score: Number(r.current!.business_impact_score ?? 0) + 20 });
    if (rec?.rpo === 'not_covered') out.push({ svc: r.service.name, t: `RPO scoperto di ${formatMinutes(rec.rpo_gap_minutes)}`, score: Number(r.current!.business_impact_score ?? 0) + 10 });
    if (rec?.rto === 'unknown') out.push({ svc: r.service.name, t: 'Capacità di ripristino sconosciuta', score: Number(r.current!.business_impact_score ?? 0) });
    return out;
  }).sort((a, b) => b.score - a.score).slice(0, 3);
  const priority = currents.map((r) => ({ r, bpi: businessPriorityIndex(r.current!.business_impact_score, r.current!.result.technical_residual_risk ?? null) }))
    .filter((x) => x.bpi !== null).sort((a, b) => (b.bpi ?? 0) - (a.bpi ?? 0)).slice(0, 3);

  const coverageCell = (r: ServiceRow) => {
    const rec = r.current?.result.recovery;
    if (!rec) return <span className="text-muted-foreground text-xs">—</span>;
    return <span className={`text-xs ${COVERAGE_CLASS[rec.rto]}`}>{COVERAGE_LABEL[rec.rto]}</span>;
  };

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-foreground">Business Impact Analysis</h1>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" />{selectedOrganization?.name ?? '—'}
              {dash?.generated_at && <span>· aggiornato {new Date(dash.generated_at).toLocaleString('it-IT')}</span>}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Tabs value={view} onValueChange={(v) => setView(v as 'ops' | 'exec')}>
              <TabsList><TabsTrigger value="ops">Vista operativa</TabsTrigger><TabsTrigger value="exec">Vista executive</TabsTrigger></TabsList>
            </Tabs>
            {canEdit && <>
              <Button variant="outline" onClick={() => setSuggestOpen(true)}><Wand2 className="w-4 h-4 mr-1" />Importa suggerimenti</Button>
              <Button onClick={() => { setPrefill(null); setNewOpen(true); }}><Plus className="w-4 h-4 mr-1" />Nuovo servizio</Button>
            </>}
          </div>
        </div>

        {failedSources.length > 0 && (
          <div role="status" className="text-xs rounded-md border border-warning/40 bg-warning/10 p-3 text-foreground">
            Alcune fonti non sono state caricate ({failedSources.join(', ')}). Il resto del modulo funziona normalmente.
          </div>
        )}
        {error && <div role="alert" className="text-sm text-destructive">Errore nel caricamento: {(error as Error).message}</div>}

        {view === 'ops' ? (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Kpi icon={Activity} label="Servizi business" value={total} hint={`${rows.filter((r) => r.service.status === 'active').length} attivi`} />
              <Kpi icon={CheckCircle2} label="BIA approvate" value={`${dash?.approved ?? 0} / ${total}`} hint={`${dash?.in_review ?? 0} in revisione · ${dash?.drafts ?? 0} bozze`} />
              <Kpi icon={AlertTriangle} label="Servizi critici" value={dash?.critical ?? 0} hint={`${dash?.rto_not_covered ?? 0} con RTO non coperto`} />
              <Kpi icon={Euro} label="Costo potenziale di fermo a 24 ore" value={formatMoney(dash?.cost_24h_total)} hint={`Stima da validare · copertura ${dash?.cost_24h_coverage ?? 0} su ${total}`} />
            </div>

            <div className="grid lg:grid-cols-3 gap-4">
              <Card className="lg:col-span-2">
                <CardHeader className="pb-2"><CardTitle className="text-sm">Azioni richieste</CardTitle></CardHeader>
                <CardContent className="pt-0">
                  {actions.length === 0 ? <p className="text-sm text-muted-foreground">Nessuna azione aperta.</p> : (
                    <ul className="space-y-1.5">{actions.map((a) => (
                      <li key={a.t} className="flex items-center gap-2 text-sm">
                        <AlertTriangle className={`w-3.5 h-3.5 shrink-0 ${a.tone === 'destructive' ? 'text-destructive' : a.tone === 'warning' ? 'text-warning' : 'text-muted-foreground'}`} aria-hidden />{a.t}
                      </li>))}</ul>
                  )}
                  {dash && (
                    <p className="text-xs text-muted-foreground mt-3">Remediation collegate: {dash.remediation_linked} · budget {formatMoney(dash.remediation_budget)}</p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Segnali dall'Assessment</CardTitle></CardHeader>
                <CardContent className="pt-0 space-y-2">
                  {assessmentSignals.map((s) => (
                    <div key={s.code} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate">{s.label}</span>
                      <Badge variant="outline" className="text-[10px] shrink-0">{s.status === 'completed' ? 'Completato' : s.status === 'planned_in_progress' ? 'In corso' : s.status === 'not_applicable' ? 'N/A' : s.status ? 'Non iniziato' : 'Nessuna risposta'}</Badge>
                    </div>
                  ))}
                  <p className="text-[11px] text-muted-foreground">Contesto di maturità, non genera cifre economiche. Mappatura temporanea per numero di domanda (legacy).</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Registro servizi</CardTitle></CardHeader>
              <CardContent className="pt-0 space-y-3">
                <div className="flex flex-wrap gap-2">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" aria-hidden />
                    <Input aria-label="Cerca servizio" placeholder="Cerca per nome o codice" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
                  </div>
                  <Select value={fClass} onValueChange={setFClass}><SelectTrigger className="w-40" aria-label="Criticità"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="all">Tutte le criticità</SelectItem>{Object.entries(CLASS_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select>
                  <Select value={fStatus} onValueChange={setFStatus}><SelectTrigger className="w-44" aria-label="Stato BIA"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="all">Tutti gli stati BIA</SelectItem>{Object.entries(STATUS_LABEL).filter(([k]) => k !== 'superseded').map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                      <SelectItem value="stale">Revisione scaduta</SelectItem><SelectItem value="none">Senza BIA</SelectItem></SelectContent></Select>
                  <Select value={fSvc} onValueChange={setFSvc}><SelectTrigger className="w-36" aria-label="Stato servizio"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="active">Attivi</SelectItem><SelectItem value="archived">Archiviati</SelectItem><SelectItem value="all">Tutti</SelectItem></SelectContent></Select>
                </div>

                {isLoading ? <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
                  : rows.length === 0 ? (
                    <div className="text-center py-10 space-y-3">
                      <Lightbulb className="w-8 h-8 mx-auto text-muted-foreground" aria-hidden />
                      <p className="font-medium">Nessun servizio di business censito</p>
                      <p className="text-sm text-muted-foreground max-w-md mx-auto">Parti dai servizi che mantengono operativo il business (es. Gestione ordini, Produzione). Puoi usare gli asset già presenti come suggerimento.</p>
                      {canEdit && <div className="flex justify-center gap-2"><Button variant="outline" onClick={() => setSuggestOpen(true)}>Vedi suggerimenti</Button><Button onClick={() => setNewOpen(true)}>Nuovo servizio</Button></div>}
                    </div>
                  ) : (
                    <>
                      <div className="hidden md:block overflow-x-auto">
                        <Table>
                          <TableHeader><TableRow>
                            <TableHead>Servizio</TableHead><TableHead>Owner</TableHead><TableHead>Score</TableHead><TableHead>Classe</TableHead>
                            <TableHead>Costo 24 h</TableHead><TableHead>RTO</TableHead><TableHead>Copertura recovery</TableHead><TableHead>Stato BIA</TableHead><TableHead>Revisione</TableHead>
                          </TableRow></TableHeader>
                          <TableBody>
                            {filtered.map((r) => (
                              <TableRow key={r.service.id} className="cursor-pointer" onClick={() => navigate(`/business-impact-analysis/services/${r.service.id}`)}>
                                <TableCell><div className="font-medium">{r.service.name}</div><div className="text-[11px] text-muted-foreground">{r.service.code}{r.service.status === 'archived' ? ' · archiviato' : ''}</div></TableCell>
                                <TableCell className="text-sm">{contactName(contacts, r.service.business_owner_contact_id) ?? <span className="text-warning text-xs">Da assegnare</span>}</TableCell>
                                <TableCell className="font-semibold">{r.current?.business_impact_score != null ? Number(r.current.business_impact_score).toFixed(1) : '—'}</TableCell>
                                <TableCell>{r.current?.criticality_class ? <Badge variant="outline" className={CLASS_BADGE[r.current.criticality_class]}>{CLASS_LABEL[r.current.criticality_class]}</Badge> : '—'}</TableCell>
                                <TableCell className="text-sm">{formatMoney(r.current?.result.potential_downtime_cost_24h)}</TableCell>
                                <TableCell className="text-sm">{formatMinutes(r.current?.rto_target_minutes)}</TableCell>
                                <TableCell>{coverageCell(r)}</TableCell>
                                <TableCell><Badge variant="secondary">{r.current ? STATUS_LABEL[r.current.status] : 'Senza BIA'}</Badge></TableCell>
                                <TableCell className="text-xs">{r.approved?.review_due_at ? new Date(r.approved.review_due_at).toLocaleDateString('it-IT') : '—'}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      <div className="md:hidden space-y-2">
                        {filtered.map((r) => (
                          <Card key={r.service.id}><CardContent className="p-3 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0"><div className="font-medium truncate">{r.service.name}</div><div className="text-[11px] text-muted-foreground">{contactName(contacts, r.service.business_owner_contact_id) ?? 'Owner da assegnare'}</div></div>
                              {r.current?.criticality_class && <Badge variant="outline" className={CLASS_BADGE[r.current.criticality_class]}>{CLASS_LABEL[r.current.criticality_class]}</Badge>}
                            </div>
                            <div className="grid grid-cols-2 gap-1 text-xs">
                              <span>Costo 24 h: {formatMoney(r.current?.result.potential_downtime_cost_24h)}</span>
                              <span>RTO: {formatMinutes(r.current?.rto_target_minutes)}</span>
                              <span>{r.current ? STATUS_LABEL[r.current.status] : 'Senza BIA'}</span>
                              {coverageCell(r)}
                            </div>
                            <Button size="sm" className="w-full min-h-[44px]" onClick={() => navigate(`/business-impact-analysis/services/${r.service.id}`)}>Apri</Button>
                          </CardContent></Card>
                        ))}
                      </div>
                      {filtered.length === 0 && <p className="text-sm text-muted-foreground">Nessun servizio corrisponde ai filtri.</p>}
                    </>
                  )}
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
              <Kpi icon={ShieldCheck} label="Business Resilience Score" value={dash?.resilience_avg != null ? `${dash.resilience_avg}/100` : '—'} hint="Media copertura recovery" />
              <Kpi icon={Euro} label="Costo potenziale di fermo a 24 ore" value={formatMoney(dash?.cost_24h_total)} hint={`Stima · ${dash?.cost_24h_coverage ?? 0}/${total} servizi`} />
              <Kpi icon={CheckCircle2} label="Servizi critici protetti" value={`${dash?.critical_protected ?? 0} / ${dash?.critical_total ?? 0}`} hint="RTO e RPO coperti" />
              <Kpi icon={AlertTriangle} label="Rischio residuo tecnico (max)" value={dash?.residual_risk_max != null ? `${dash.residual_risk_max}/100` : '—'} hint="Separato dal Business Impact Score" />
              <Kpi icon={Activity} label="BIA approvate" value={`${dash?.approved ?? 0} / ${total}`} />
              <Kpi icon={Clock} label="Revisioni scadute" value={dash?.stale ?? 0} hint={`${dash?.review_due_30d ?? 0} in scadenza a 30 gg`} />
            </div>
            <div className="grid lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Top 5 servizi per costo di fermo a 24 ore</CardTitle></CardHeader>
                <CardContent className="pt-0 space-y-2">
                  {topByCost.length === 0 && <p className="text-sm text-muted-foreground">Nessuna stima economica disponibile.</p>}
                  {topByCost.map((r) => (
                    <div key={r.service.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate min-w-0">{r.service.name}</span>
                      <span className="flex items-center gap-2 shrink-0">{r.current!.criticality_class && <Badge variant="outline" className={CLASS_BADGE[r.current!.criticality_class]}>{CLASS_LABEL[r.current!.criticality_class]}</Badge>}<b>{formatMoney(r.current!.result.potential_downtime_cost_24h)}</b></span>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Curva aggregata dell'impatto economico (stima)</CardTitle></CardHeader>
                <CardContent className="pt-0">
                  {curve.length === 0 ? <p className="text-sm text-muted-foreground">Nessun dato.</p> : (
                    <>
                      <div className="h-52" aria-hidden><ResponsiveContainer><LineChart data={curve}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="h" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                        <YAxis tickFormatter={(v) => `${Math.round(v / 1000)}k`} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                        <Tooltip formatter={(v: number) => formatMoney(v)} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                        <Line type="monotone" dataKey="total" stroke="hsl(var(--primary))" strokeWidth={2} />
                      </LineChart></ResponsiveContainer></div>
                      <ul className="sr-only">{curve.map((p) => <li key={p.h}>{p.h}: {formatMoney(p.total)} ({p.services} servizi)</li>)}</ul>
                    </>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Impatto business vs copertura recovery</CardTitle></CardHeader>
                <CardContent className="pt-0">
                  {scatter.length === 0 ? <p className="text-sm text-muted-foreground">Nessun servizio con punteggio.</p> : (
                    <div className="h-60"><ResponsiveContainer><ScatterChart margin={{ left: 0, right: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" dataKey="x" name="Copertura recovery" domain={[0, 100]} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis type="number" dataKey="y" name="Business Impact Score" domain={[0, 100]} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                      <ZAxis type="number" dataKey="z" range={[60, 400]} />
                      <Tooltip content={({ payload }) => payload?.[0] ? (
                        <div className="rounded border border-border bg-card p-2 text-xs">{payload[0].payload.name}<br />Impatto {payload[0].payload.y} · copertura {payload[0].payload.x}<br />{formatMoney(payload[0].payload.z)}</div>) : null} />
                      <Scatter data={scatter}>{scatter.map((p, i) => <Cell key={i} fill={CLASS_COLOR[p.cls]} />)}</Scatter>
                    </ScatterChart></ResponsiveContainer></div>
                  )}
                  <p className="text-[11px] text-muted-foreground">In alto a sinistra: servizi ad alto impatto con copertura bassa. Dimensione = costo a 24 ore.</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Top 3 gap di resilienza e priorità</CardTitle></CardHeader>
                <CardContent className="pt-0 space-y-3">
                  <div className="space-y-1.5">{gaps.length === 0 ? <p className="text-sm text-muted-foreground">Nessun gap rilevato.</p> : gaps.map((g, i) => (
                    <div key={i} className="text-sm flex justify-between gap-2"><span className="truncate">{g.svc}</span><span className="text-destructive text-xs shrink-0">{g.t}</span></div>))}</div>
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">Priorità qualitativa (impatto × rischio tecnico)</div>
                    {priority.length === 0 ? <p className="text-xs text-muted-foreground">Collega rischi ai servizi per calcolare la priorità.</p> : priority.map((p) => (
                      <div key={p.r.service.id} className="text-sm flex justify-between"><span className="truncate">{p.r.service.name}</span><b>{p.bpi}</b></div>))}
                  </div>
                </CardContent>
              </Card>
            </div>
            <p className="text-[11px] text-muted-foreground">Tutti i valori economici sono stime dichiarate dai responsabili, con fonte e confidenza nel dettaglio di ciascun servizio. La perdita annua attesa compare solo dove è documentata una frequenza.</p>
          </>
        )}
      </div>

      <ServiceFormDialog open={newOpen} onOpenChange={setNewOpen} contacts={contacts} initial={prefill} onSubmit={createService} />

      <Sheet open={suggestOpen} onOpenChange={setSuggestOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Suggerimenti dalle fonti esistenti</SheetTitle>
            <SheetDescription>Gli asset non diventano servizi in automatico: scegli tu quali servizi di business creare.</SheetDescription>
          </SheetHeader>
          <div className="space-y-2 mt-4">
            {suggestions.length === 0 && <p className="text-sm text-muted-foreground">Nessun suggerimento disponibile.</p>}
            {suggestions.map((s) => (
              <Card key={s.key}><CardContent className="p-3 space-y-2">
                <div className="flex justify-between gap-2"><span className="font-medium text-sm">{s.label}</span><Badge variant="outline" className="text-[10px]">{s.source}</Badge></div>
                <p className="text-xs text-muted-foreground">{s.reason}{s.updated ? ` · agg. ${new Date(s.updated).toLocaleDateString('it-IT')}` : ''}</p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => { setPrefill({ name: `Servizio supportato da ${s.label}`, source: 'suggested', source_ref: s.key }); setSuggestOpen(false); setNewOpen(true); }}>Crea servizio</Button>
                  <Button size="sm" variant="ghost" onClick={() => setIgnored((x) => [...x, s.key])}>Ignora</Button>
                </div>
              </CardContent></Card>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </DashboardLayout>
  );
}
