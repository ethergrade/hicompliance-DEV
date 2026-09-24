import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { ArrowLeft, Archive, CheckCircle2, FileDown, Loader2, Pencil, Plus, RefreshCw, Send, Trash2, Undo2 } from 'lucide-react';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import { useUserRoles } from '@/hooks/useUserRoles';
import { useBiaServices, useBiaSources, contactName } from '@/hooks/useBia';
import { biaApi, BiaConflictError } from '@/lib/api/bia';
import { ServiceFormDialog } from '@/components/bia/ServiceFormDialog';
import { exportBiaPdf } from '@/lib/bia/exportBiaPdf';
import {
  CLASS_BADGE, CLASS_LABEL, CONF_LABEL, COST_FIELDS, COVERAGE_CLASS, COVERAGE_LABEL, OPERATIONAL_OPTIONS, REGULATORY_OPTIONS,
  REPUTATIONAL_OPTIONS, STATUS_LABEL, SUBMIT_ERROR_LABEL, WARNING_LABEL, formatMinutes, formatMoney, parseMoney,
} from '@/lib/bia/formatters';
import { DEFAULT_HORIZONS, remediationValue } from '@/lib/bia/calculations';
import type { BiaAssessment, BiaImpactValue, CoverageState } from '@/types/bia';

const EDITABLE = ['economic_level', 'operational_score', 'regulatory_score', 'regulatory_source', 'reputational_score', 'dependency_spof',
  'dependency_workaround', 'no_dependency_reason', 'mtpd_minutes', 'rto_target_minutes', 'rpo_target_minutes', 'degraded_mode',
  'minimum_capacity_percent', 'recovery_rank', 'annual_frequency', 'annual_frequency_source', 'assumptions'] as const;
type Form = Pick<BiaAssessment, typeof EDITABLE[number]>;

const emptyImpact = (h: number): BiaImpactValue => ({
  horizon_minutes: h, lost_contribution_margin: '0', idle_labor_cost: '0', extra_operating_cost: '0', recovery_response_cost: '0',
  contractual_penalties: '0', regulatory_legal_cost: '0', customer_reputation_cost: '0', other_cost: '0', manual_total: null,
  source_notes: '', confidence: 'low', override_reason: null,
});

function MoneyInput({ value, onChange, disabled, label }: { value: string | null | undefined; onChange: (v: string | null) => void; disabled?: boolean; label: string }) {
  const [txt, setTxt] = useState(value == null ? '' : Number(value).toLocaleString('it-IT'));
  const [err, setErr] = useState(false);
  useEffect(() => { setTxt(value == null ? '' : Number(value).toLocaleString('it-IT')); }, [value]);
  return (
    <Input aria-label={label} inputMode="decimal" className={`min-w-[140px] ${err ? 'border-destructive' : ''}`} value={txt} disabled={disabled}
      onChange={(e) => setTxt(e.target.value)}
      onBlur={() => { try { const v = parseMoney(txt); setErr(false); onChange(v); } catch { setErr(true); } }} aria-invalid={err} />
  );
}

function MinutesInput({ value, onChange, disabled, label }: { value: number | null; onChange: (v: number | null) => void; disabled?: boolean; label: string }) {
  const [unit, setUnit] = useState<'min' | 'h' | 'g'>(value != null && value % 1440 === 0 && value > 0 ? 'g' : value != null && value % 60 === 0 && value > 0 ? 'h' : value != null && value > 0 ? 'min' : 'h');
  const mult = unit === 'g' ? 1440 : unit === 'h' ? 60 : 1;
  return (
    <div className="flex gap-1">
      <Input aria-label={label} inputMode="decimal" className="min-w-[90px]" disabled={disabled} value={value == null ? '' : String(value / mult)}
        onChange={(e) => { const t = e.target.value.replace(',', '.'); if (t === '') return onChange(null); const n = Number(t); if (!Number.isNaN(n) && n >= 0) onChange(Math.round(n * mult)); }} />
      <Select value={unit} onValueChange={(u) => setUnit(u as 'min' | 'h' | 'g')} disabled={disabled}>
        <SelectTrigger className="w-20" aria-label={`Unità ${label}`}><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="min">min</SelectItem><SelectItem value="h">ore</SelectItem><SelectItem value="g">giorni</SelectItem></SelectContent>
      </Select>
    </div>
  );
}

function ScaleSelect({ value, options, onChange, disabled, label }: { value: number | null; options: { v: number; l: string }[]; onChange: (v: number | null) => void; disabled?: boolean; label: string }) {
  return (
    <Select value={value == null ? 'null' : String(value)} onValueChange={(x) => onChange(x === 'null' ? null : Number(x))} disabled={disabled}>
      <SelectTrigger aria-label={label}><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="null">Non valutato</SelectItem>
        {options.map((o) => <SelectItem key={o.v} value={String(o.v)}>{o.l}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

const Cov = ({ s }: { s: CoverageState | undefined }) => s ? <span className={`text-sm font-medium ${COVERAGE_CLASS[s]}`}>{COVERAGE_LABEL[s]}</span> : <span>—</span>;

export default function BusinessImpactServiceDetail() {
  const { serviceId = '', biaId: routeBiaId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { selectedOrganization } = useClientOrganization();
  const { isSuperAdmin, isSales, isAdmin } = useUserRoles();
  const { data: rows = [], isLoading, orgId } = useBiaServices();
  const { data: sources } = useBiaSources();
  const contacts = sources?.contacts.data ?? [];
  const row = rows.find((r) => r.service.id === serviceId);
  const service = row?.service;
  const bia = (routeBiaId ? row?.versions.find((v) => v.id === routeBiaId) : row?.current) ?? null;
  const editable = !!bia && bia.status === 'draft' && (!isSales || isSuperAdmin);
  const canApprove = isAdmin || isSuperAdmin;

  const [form, setForm] = useState<Form | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error' | 'conflict'>('idle');
  const [submitErrors, setSubmitErrors] = useState<string[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);
  const [changesText, setChangesText] = useState('');
  const [busy, setBusy] = useState(false);
  const biaRef = useRef<BiaAssessment | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  biaRef.current = bia;

  useEffect(() => {
    if (!bia) { setForm(null); return; }
    setForm(Object.fromEntries(EDITABLE.map((k) => [k, bia[k]])) as Form);
    setSaveState('idle'); setSubmitErrors([]);
  }, [bia?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: ['bia'] }), [qc]);

  const impactsQ = useQuery({ queryKey: ['bia', 'impacts', bia?.id], enabled: !!bia, queryFn: () => biaApi.impacts(bia!.id) });
  const depsQ = useQuery({ queryKey: ['bia', 'deps', orgId], enabled: !!orgId, queryFn: () => biaApi.dependencies(orgId) });
  const assetsQ = useQuery({ queryKey: ['bia', 'assets', serviceId], enabled: !!serviceId, queryFn: () => biaApi.assetLinks(serviceId) });
  const risksQ = useQuery({ queryKey: ['bia', 'risks', serviceId], enabled: !!serviceId, queryFn: () => biaApi.riskLinks(serviceId) });
  const remQ = useQuery({ queryKey: ['bia', 'rem', serviceId], enabled: !!serviceId, queryFn: () => biaApi.remediationLinks(serviceId) });
  const auditQ = useQuery({ queryKey: ['bia', 'audit', serviceId, row?.versions.length], enabled: !!row && !!orgId, queryFn: () => biaApi.auditEvents(orgId, [serviceId, ...(row?.versions.map((v) => v.id) ?? [])]) });

  const recompute = useCallback(async () => {
    const b = biaRef.current; if (!b) return;
    await biaApi.compute(b.id); await refresh();
  }, [refresh]);

  const persist = useCallback(async (next: Form) => {
    const b = biaRef.current; if (!b) return;
    setSaveState('saving');
    try {
      const patch: Partial<BiaAssessment> = {};
      EDITABLE.forEach((k) => { if (next[k] !== b[k]) (patch as any)[k] = next[k]; });
      if (next.annual_frequency != null && !next.annual_frequency_source?.trim()) { setSaveState('error'); toast.error('Indica la fonte della frequenza annua'); return; }
      if (Object.keys(patch).length) {
        const saved = await biaApi.updateDraft(b, patch);
        biaRef.current = saved;
        qc.setQueryData(['bia', 'services', orgId], (old: typeof rows | undefined) => old?.map((r) => r.service.id !== saved.business_service_id ? r : {
          ...r, versions: r.versions.map((v) => v.id === saved.id ? saved : v), current: r.current?.id === saved.id ? saved : r.current,
        }));
      }
      await recompute();
      setSaveState('saved');
    } catch (e) {
      if (e instanceof BiaConflictError) { setSaveState('conflict'); } else { setSaveState('error'); toast.error((e as Error).message); }
    }
  }, [orgId, qc, recompute]);

  const update = (patch: Partial<Form>) => {
    if (!form || !editable) return;
    const next = { ...form, ...patch };
    setForm(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => persist(next), 1500);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // ---- Impatti ----
  const [impacts, setImpacts] = useState<BiaImpactValue[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [customH, setCustomH] = useState<number | null>(null);
  useEffect(() => {
    const saved = impactsQ.data ?? [];
    const hs = Array.from(new Set([...DEFAULT_HORIZONS, ...saved.map((s) => s.horizon_minutes)])).sort((a, b) => a - b);
    setImpacts(hs.map((h) => saved.find((s) => s.horizon_minutes === h) ?? emptyImpact(h)));
  }, [impactsQ.data]);

  const saveImpact = async (v: BiaImpactValue) => {
    if (!bia || !editable) return;
    if (v.manual_total != null && !v.override_reason?.trim()) { toast.error('Il totale manuale richiede una motivazione'); return; }
    setSaveState('saving');
    try {
      const saved = await biaApi.upsertImpact(bia.id, v);
      if (v.manual_total != null && impactsQ.data?.find((x) => x.horizon_minutes === v.horizon_minutes)?.manual_total !== v.manual_total) {
        await biaApi.audit(orgId, 'bia_assessment', bia.id, 'override', { calculated_total: saved.calculated_total }, { manual_total: v.manual_total }, v.override_reason ?? undefined);
      }
      await qc.invalidateQueries({ queryKey: ['bia', 'impacts', bia.id] });
      await recompute();
      setSaveState('saved');
    } catch (e) { setSaveState('error'); toast.error((e as Error).message); }
  };
  const patchImpact = (h: number, patch: Partial<BiaImpactValue>, save = true) => {
    const next = impacts.map((x) => x.horizon_minutes === h ? { ...x, ...patch } : x);
    setImpacts(next);
    const item = next.find((x) => x.horizon_minutes === h)!;
    if (save) saveImpact(item);
  };
  const componentsTotal = (v: BiaImpactValue) => COST_FIELDS.reduce((a, f) => a + Number(v[f.key] ?? 0), 0);

  // ---- Workflow ----
  const doSubmit = async () => {
    if (!bia) return;
    if (timer.current) { clearTimeout(timer.current); timer.current = null; if (form) await persist(form); }
    setBusy(true);
    try {
      const r = await biaApi.submit(bia.id);
      if (!r.ok) { setSubmitErrors(r.errors ?? []); toast.error('Completa i dati obbligatori prima dell\'invio'); }
      else { setSubmitErrors([]); toast.success('BIA inviata in revisione'); await refresh(); }
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const doApprove = async () => {
    if (!bia) return; setBusy(true);
    try { await biaApi.approve(bia.id); toast.success('BIA approvata'); await refresh(); }
    catch (e) { toast.error((e as Error).message.replace('separation_of_duties: ', '')); } finally { setBusy(false); }
  };
  const doRequestChanges = async () => {
    if (!bia || !changesText.trim()) return; setBusy(true);
    try { await biaApi.requestChanges(bia.id, changesText.trim()); setChangesOpen(false); setChangesText(''); toast.success('Modifiche richieste'); await refresh(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const doRevision = async () => {
    if (!bia) return; setBusy(true);
    try { await biaApi.cloneRevision(bia.id, 'Revisione periodica'); toast.success('Nuova bozza creata'); await refresh(); navigate(`/business-impact-analysis/services/${serviceId}`); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const startBia = async () => { setBusy(true); try { await biaApi.createDraft(orgId, serviceId); await refresh(); } finally { setBusy(false); } };

  // ---- Dipendenze / collegamenti ----
  const deps = depsQ.data ?? [];
  const nameOf = (id: string) => rows.find((r) => r.service.id === id)?.service.name ?? 'Servizio';
  const dependsOn = deps.filter((d) => d.service_id === serviceId);
  const dependents = deps.filter((d) => d.depends_on_service_id === serviceId);
  const cycle = useMemo(() => {
    const seen = new Set<string>(); const stack = [...dependsOn.map((d) => d.depends_on_service_id)];
    while (stack.length) { const id = stack.pop()!; if (id === serviceId) return true; if (seen.has(id)) continue; seen.add(id); deps.filter((d) => d.service_id === id).forEach((d) => stack.push(d.depends_on_service_id)); }
    return false;
  }, [deps, dependsOn, serviceId]);
  const [newDep, setNewDep] = useState({ id: '', strength: 'medium', spof: false, workaround: false });
  const addDep = async () => {
    if (!newDep.id) return;
    try { await biaApi.addDependency(orgId, { service_id: serviceId, depends_on_service_id: newDep.id, dependency_strength: newDep.strength as any, single_point_of_failure: newDep.spof, workaround_available: newDep.workaround }); setNewDep({ id: '', strength: 'medium', spof: false, workaround: false }); await qc.invalidateQueries({ queryKey: ['bia', 'deps'] }); await recompute(); }
    catch (e) { toast.error((e as Error).message); }
  };

  const infra = sources?.infra.data ?? [];
  const riskSrc = sources?.risks.data ?? [];
  const irpSrc = sources?.irp.data ?? [];
  const tasks = (sources?.tasks.data ?? []).filter((t) => !t.is_deleted);
  const [assetPick, setAssetPick] = useState('');
  const [riskPick, setRiskPick] = useState('');
  const [remPick, setRemPick] = useState('');
  const [newTask, setNewTask] = useState({ task: '', budget: '' });
  const linkedAssetIds = new Set((assetsQ.data ?? []).map((a) => a.source_id));
  const suggestedRisks = riskSrc.filter((r) => infra.some((a) => linkedAssetIds.has(a.id) && (a.component_name ?? '').toLowerCase() === (r.asset_name ?? '').toLowerCase()));

  const addAsset = async () => {
    const a = infra.find((x) => x.id === assetPick); if (!a) return;
    try { await biaApi.addAssetLink(orgId, { business_service_id: serviceId, source_type: 'critical_infrastructure', source_id: a.id, source_label: `${a.component_name ?? ''} (${a.asset_id})`, role: 'primary' }); setAssetPick(''); await qc.invalidateQueries({ queryKey: ['bia', 'assets'] }); await recompute(); }
    catch (e) { toast.error((e as Error).message); }
  };
  const addRisk = async (key = riskPick) => {
    const [type, id] = key.split(':'); if (!id) return;
    const label = type === 'risk_analysis' ? riskSrc.find((r) => r.id === id)?.asset_name : (() => { const a = irpSrc.find((r) => r.id === id); return a ? `${a.categoria ?? ''} ${a.tecnologia ?? ''}`.trim() : ''; })();
    try { await biaApi.addRiskLink(orgId, { business_service_id: serviceId, source_type: type as any, source_id: id, source_label: label ?? null }); setRiskPick(''); await qc.invalidateQueries({ queryKey: ['bia', 'risks'] }); await recompute(); }
    catch (e) { toast.error((e as Error).message); }
  };
  const addRem = async () => {
    if (!remPick) return;
    try { await biaApi.addRemediationLink(orgId, { business_service_id: serviceId, bia_assessment_id: bia?.id ?? null, remediation_task_id: remPick }); setRemPick(''); await qc.invalidateQueries({ queryKey: ['bia'] }); }
    catch (e) { toast.error((e as Error).message); }
  };
  const createTask = async () => {
    if (!newTask.task.trim()) return;
    try { await biaApi.createRemediationFromBia(orgId, serviceId, bia?.id ?? null, newTask.task.trim(), newTask.budget ? Number(parseMoney(newTask.budget)) : null); setNewTask({ task: '', budget: '' }); await qc.invalidateQueries({ queryKey: ['bia'] }); toast.success('Remediation creata e collegata'); }
    catch (e) { toast.error((e as Error).message); }
  };

  const exportPdf = () => {
    if (!service || !bia) return;
    exportBiaPdf({
      organizationName: selectedOrganization?.name ?? '', service, bia, impacts: impactsQ.data ?? [],
      ownerName: contactName(contacts, service.business_owner_contact_id),
      dependsOn: dependsOn.map((dep) => ({ dep, name: nameOf(dep.depends_on_service_id) })),
      dependents: dependents.map((dep) => ({ dep, name: nameOf(dep.service_id) })),
      assets: (assetsQ.data ?? []).map((a) => a.source_label ?? a.source_id),
      risks: (risksQ.data ?? []).map((r) => `${r.source_label ?? r.source_id} (${r.normalized_residual_risk ?? '-'})`),
      remediations: (remQ.data ?? []).map((l) => { const t = tasks.find((x) => x.id === l.remediation_task_id); return { task: t?.task ?? 'Task', budget: t?.budget ?? '', progress: t?.progress ?? 0 }; }),
    });
    biaApi.audit(orgId, 'bia_assessment', bia.id, 'export', null, { status: bia.status });
  };

  if (isLoading) return <DashboardLayout><div className="p-6 space-y-3"><Skeleton className="h-10 w-64" /><Skeleton className="h-64 w-full" /></div></DashboardLayout>;
  if (!service) return <DashboardLayout><div className="p-6 space-y-3"><p>Servizio non trovato per l'azienda selezionata.</p><Button asChild variant="outline"><Link to="/business-impact-analysis">Torna al registro</Link></Button></div></DashboardLayout>;

  const r = bia?.result ?? {};
  const rec = r.recovery;

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-4 max-w-[1600px] mx-auto pb-24 md:pb-6">
        <Button variant="ghost" size="sm" asChild><Link to="/business-impact-analysis"><ArrowLeft className="w-4 h-4 mr-1" />Registro servizi</Link></Button>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl md:text-2xl font-bold text-foreground">{service.name}</h1>
              {bia?.criticality_class && <Badge variant="outline" className={CLASS_BADGE[bia.criticality_class]}>{CLASS_LABEL[bia.criticality_class]} · {Number(bia.business_impact_score).toFixed(1)}</Badge>}
              {bia && <Badge variant="secondary">v{bia.version} · {STATUS_LABEL[bia.status]}</Badge>}
              {service.status === 'archived' && <Badge variant="outline">Archiviato</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">{service.code} · Owner: {contactName(contacts, service.business_owner_contact_id) ?? 'da assegnare'}
              {bia?.review_due_at && ` · Revisione entro ${new Date(bia.review_due_at).toLocaleDateString('it-IT')}`}</p>
            {editable && <p aria-live="polite" className={`text-xs ${saveState === 'error' || saveState === 'conflict' ? 'text-destructive' : 'text-muted-foreground'}`}>
              {saveState === 'saving' ? 'Salvando…' : saveState === 'saved' ? 'Salvato' : saveState === 'error' ? 'Errore: modifiche non salvate' : saveState === 'conflict' ? 'Un altro utente ha modificato questa bozza.' : 'Bozza · salvataggio automatico'}
              {saveState === 'conflict' && <Button variant="link" size="sm" className="h-auto p-0 ml-1" onClick={() => { refresh(); setSaveState('idle'); }}>Ricarica</Button>}
            </p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {(!isSales || isSuperAdmin) && <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}><Pencil className="w-4 h-4 mr-1" />Servizio</Button>}
            {!bia && (!isSales || isSuperAdmin) && <Button size="sm" onClick={startBia} disabled={busy}>Avvia BIA</Button>}
            {bia?.status === 'draft' && editable && <Button size="sm" onClick={doSubmit} disabled={busy}>{busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}Invia in revisione</Button>}
            {bia?.status === 'in_review' && canApprove && <>
              <Button variant="outline" size="sm" onClick={() => setChangesOpen(true)}><Undo2 className="w-4 h-4 mr-1" />Richiedi modifiche</Button>
              <Button size="sm" onClick={doApprove} disabled={busy}><CheckCircle2 className="w-4 h-4 mr-1" />Approva</Button>
            </>}
            {(bia?.status === 'approved' || bia?.status === 'superseded') && (!isSales || isSuperAdmin) && !row?.versions.some((v) => v.status === 'draft' || v.status === 'in_review') &&
              <Button variant="outline" size="sm" onClick={doRevision} disabled={busy}><RefreshCw className="w-4 h-4 mr-1" />Avvia revisione</Button>}
            {bia && <Button variant="outline" size="sm" onClick={exportPdf}><FileDown className="w-4 h-4 mr-1" />Esporta{bia.status === 'approved' || bia.status === 'superseded' ? '' : ' bozza'}</Button>}
            {service.status === 'active' && (!isSales || isSuperAdmin) && <Button variant="ghost" size="sm" onClick={async () => { if (confirm('Archiviare il servizio? Le versioni restano consultabili.')) { await biaApi.archiveService(orgId, serviceId); await refresh(); } }}><Archive className="w-4 h-4 mr-1" />Archivia</Button>}
          </div>
        </div>

        {bia?.status === 'superseded' && <div className="text-sm rounded-md border border-border p-3">Stai consultando una versione sostituita. <Link className="underline" to={`/business-impact-analysis/services/${serviceId}`}>Apri la versione corrente</Link></div>}
        {bia?.status === 'in_review' && <div className="text-sm rounded-md border border-border p-3 bg-muted/30">In revisione: i dati sono bloccati finché un approvatore non approva o richiede modifiche.</div>}
        {bia?.review_comment && bia.status === 'draft' && <div role="status" className="text-sm rounded-md border border-warning/40 bg-warning/10 p-3">Modifiche richieste: {bia.review_comment}</div>}
        {submitErrors.length > 0 && (
          <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
            <b>Prima dell'invio completa:</b>
            <ul className="list-disc ml-5 mt-1">{submitErrors.map((e) => <li key={e}>{SUBMIT_ERROR_LABEL[e] ?? e}</li>)}</ul>
          </div>
        )}
        {(r.warnings ?? []).length > 0 && <div className="text-xs rounded-md border border-warning/40 bg-warning/10 p-3 space-y-1">{r.warnings!.map((w) => <div key={w}>{WARNING_LABEL[w] ?? w}</div>)}</div>}

        {!bia ? (
          <Card><CardContent className="p-6 text-sm text-muted-foreground">Nessuna BIA per questo servizio. Avvia la prima bozza per stimare impatti e obiettivi di ripristino.</CardContent></Card>
        ) : form && (
          <Tabs defaultValue="summary">
            <div className="overflow-x-auto"><TabsList>
              <TabsTrigger value="summary">Sintesi</TabsTrigger><TabsTrigger value="impacts">Impatti</TabsTrigger><TabsTrigger value="recovery">Recovery</TabsTrigger>
              <TabsTrigger value="deps">Dipendenze</TabsTrigger><TabsTrigger value="risks">Rischi e remediation</TabsTrigger><TabsTrigger value="history">Storico</TabsTrigger>
            </TabsList></div>

            {/* SINTESI */}
            <TabsContent value="summary" className="space-y-4">
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
                <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Business Impact Score</div>
                  <div className="text-2xl font-bold">{r.business_impact_score != null ? `${r.business_impact_score}/100` : '—'}</div>
                  <div className="text-[11px] text-muted-foreground">{r.business_impact_score == null ? 'Completa le cinque dimensioni' : `Classe ${CLASS_LABEL[r.criticality_class!]}`}</div></CardContent></Card>
                <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Costo potenziale di fermo a 24 ore</div>
                  <div className="text-2xl font-bold">{formatMoney(r.potential_downtime_cost_24h)}</div><div className="text-[11px] text-muted-foreground">Stima da validare</div></CardContent></Card>
                <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">MTPD · RTO · RPO</div>
                  <div className="text-lg font-bold">{formatMinutes(bia.mtpd_minutes)} · {formatMinutes(bia.rto_target_minutes)} · {formatMinutes(bia.rpo_target_minutes)}</div>
                  <div className="text-[11px]">RTO: <Cov s={rec?.rto} /></div></CardContent></Card>
                <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Copertura dati · confidenza</div>
                  <div className="text-2xl font-bold">{r.data_coverage_percent ?? 0}%</div><div className="text-[11px] text-muted-foreground">Confidenza {r.confidence ? CONF_LABEL[r.confidence] : '—'}</div></CardContent></Card>
              </div>
              <div className="grid lg:grid-cols-2 gap-4">
                <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Dimensioni (normalizzate 0-100, pesi V1)</CardTitle></CardHeader><CardContent className="pt-0 space-y-2">
                  {([['economic', 'Economico', 40], ['operational', 'Operativo', 25], ['regulatory', 'Normativo', 15], ['reputational', 'Reputazionale', 10], ['dependency', 'Dipendenza interna', 10]] as const).map(([k, l, w]) => {
                    const v = r.normalized?.[k]; return (
                      <div key={k} className="text-sm">
                        <div className="flex justify-between"><span>{l} <span className="text-muted-foreground text-xs">({w}%)</span></span><b>{v == null ? 'Non valutato' : v}</b></div>
                        <div className="h-1.5 rounded bg-muted mt-1"><div className="h-1.5 rounded bg-primary" style={{ width: `${v ?? 0}%` }} /></div>
                      </div>);
                  })}
                </CardContent></Card>
                <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Curva dei costi e rischio</CardTitle></CardHeader><CardContent className="pt-0 space-y-2 text-sm">
                  {(r.curve ?? []).map((p) => <div key={p.horizon_minutes} className="flex justify-between"><span>{formatMinutes(p.horizon_minutes)}</span><span>{formatMoney(p.total)} <span className="text-xs text-muted-foreground">· {CONF_LABEL[p.confidence]}{p.manual_override ? ' · override' : ''}</span></span></div>)}
                  {(r.curve ?? []).length === 0 && <p className="text-muted-foreground">Nessun orizzonte compilato.</p>}
                  <div className="border-t border-border pt-2 flex justify-between"><span>Rischio tecnico residuo (max)</span><b>{r.technical_residual_risk ?? '—'}</b></div>
                  <div className="flex justify-between"><span>Indice di priorità business</span><b>{r.business_priority_index ?? '—'}</b></div>
                  <div className="flex justify-between"><span>Perdita annua attesa</span><b>{r.expected_annual_loss_status === 'calculated' ? formatMoney(r.expected_annual_loss) : 'Non calcolata: manca la frequenza'}</b></div>
                </CardContent></Card>
              </div>
            </TabsContent>

            {/* IMPATTI */}
            <TabsContent value="impacts" className="space-y-4">
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Curva economica per durata del fermo</CardTitle></CardHeader><CardContent className="pt-0 space-y-3">
                <p className="text-xs text-muted-foreground">Inserisci il costo totale o apri "Dettaglia" per il breakdown. Usa il margine perso, non il fatturato. Ogni cifra richiede una fonte.</p>
                {impacts.map((v) => {
                  const calc = componentsTotal(v);
                  return (
                    <div key={v.horizon_minutes} className="rounded-md border border-border p-3 space-y-2">
                      <div className="grid md:grid-cols-[80px_1fr_1fr_140px_auto] gap-2 items-end">
                        <div className="font-semibold text-sm">{formatMinutes(v.horizon_minutes)}</div>
                        <div className="space-y-1"><Label className="text-xs">Totale (manuale)</Label>
                          <MoneyInput label={`Totale ${formatMinutes(v.horizon_minutes)}`} disabled={!editable} value={v.manual_total ?? null}
                            onChange={(x) => patchImpact(v.horizon_minutes, { manual_total: x, override_reason: x == null ? null : (v.override_reason || (calc === 0 ? 'Stima complessiva del responsabile' : '')) }, x == null || calc === 0 || !!v.override_reason)} />
                          <div className="text-[11px] text-muted-foreground">Da breakdown: {formatMoney(calc)}{v.effective_total != null ? ` · effettivo ${formatMoney(v.effective_total)}` : ''}</div>
                        </div>
                        <div className="space-y-1"><Label className="text-xs">Fonte / nota *</Label>
                          <Input disabled={!editable} value={v.source_notes} maxLength={500} placeholder="es. Stima CFO settembre 2026" onChange={(e) => patchImpact(v.horizon_minutes, { source_notes: e.target.value }, false)} onBlur={() => saveImpact(v)} /></div>
                        <div className="space-y-1"><Label className="text-xs">Confidenza</Label>
                          <Select disabled={!editable} value={v.confidence} onValueChange={(c) => patchImpact(v.horizon_minutes, { confidence: c as any })}>
                            <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(CONF_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select></div>
                        <div className="flex gap-1">
                          <Button variant="outline" size="sm" onClick={() => setExpanded(expanded === v.horizon_minutes ? null : v.horizon_minutes)}>Dettaglia</Button>
                          {editable && v.id && !DEFAULT_HORIZONS.includes(v.horizon_minutes) && <Button variant="ghost" size="icon" aria-label="Rimuovi orizzonte" onClick={async () => { await biaApi.deleteImpact(v.id!); await qc.invalidateQueries({ queryKey: ['bia', 'impacts'] }); await recompute(); }}><Trash2 className="w-4 h-4" /></Button>}
                        </div>
                      </div>
                      {v.manual_total != null && calc > 0 && (
                        <div className="space-y-1"><Label className="text-xs">Motivazione dell'override *</Label>
                          <Input disabled={!editable} value={v.override_reason ?? ''} maxLength={300} onChange={(e) => patchImpact(v.horizon_minutes, { override_reason: e.target.value }, false)} onBlur={() => saveImpact(v)} />
                          <p className="text-[11px] text-muted-foreground">Differenza rispetto al breakdown: {calc ? `${Math.round(((Number(v.manual_total) - calc) / calc) * 100)}%` : '—'}</p></div>
                      )}
                      {expanded === v.horizon_minutes && (
                        <div className="grid sm:grid-cols-2 gap-2 pt-2 border-t border-border">
                          {COST_FIELDS.map((f) => (
                            <div key={f.key} className="space-y-1"><Label className="text-xs">{f.label}</Label>
                              <MoneyInput label={f.label} disabled={!editable} value={v[f.key] as string} onChange={(x) => patchImpact(v.horizon_minutes, { [f.key]: x ?? '0' } as Partial<BiaImpactValue>)} /></div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                {editable && <div className="flex gap-2 items-end">
                  <div className="space-y-1"><Label className="text-xs">Orizzonte personalizzato</Label><MinutesInput label="Orizzonte personalizzato" value={customH} onChange={setCustomH} /></div>
                  <Button variant="outline" size="sm" onClick={() => { if (customH && !impacts.some((x) => x.horizon_minutes === customH)) { setImpacts([...impacts, emptyImpact(customH)].sort((a, b) => a.horizon_minutes - b.horizon_minutes)); setCustomH(null); } }}><Plus className="w-4 h-4 mr-1" />Aggiungi</Button>
                </div>}
              </CardContent></Card>

              <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Impatti non economici</CardTitle></CardHeader><CardContent className="pt-0 grid md:grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Impatto operativo</Label><ScaleSelect label="Impatto operativo" value={form.operational_score} options={OPERATIONAL_OPTIONS} disabled={!editable} onChange={(x) => update({ operational_score: x })} /></div>
                <div className="space-y-1"><Label>Impatto reputazionale</Label><ScaleSelect label="Impatto reputazionale" value={form.reputational_score} options={REPUTATIONAL_OPTIONS} disabled={!editable} onChange={(x) => update({ reputational_score: x })} /></div>
                <div className="space-y-1"><Label>Impatto normativo</Label><ScaleSelect label="Impatto normativo" value={form.regulatory_score} options={REGULATORY_OPTIONS} disabled={!editable} onChange={(x) => update({ regulatory_score: x })} /></div>
                <div className="space-y-1"><Label>Fonte normativa (requisito, contratto, policy)</Label><Input disabled={!editable} value={form.regulatory_source ?? ''} maxLength={300} onChange={(e) => update({ regulatory_source: e.target.value })} />
                  {sources?.profile.data?.[0]?.nis2_classification && sources.profile.data[0].nis2_classification !== 'none' && <p className="text-[11px] text-muted-foreground">Azienda NIS2 ({sources.profile.data[0].nis2_classification}): verifica gli obblighi di notifica. Nessun parere legale automatico.</p>}</div>
                {r.potential_downtime_cost_24h == null && (
                  <div className="space-y-1 md:col-span-2"><Label>Livello economico (se non hai il costo a 24 ore)</Label>
                    <ScaleSelect label="Livello economico" value={form.economic_level} disabled={!editable} onChange={(x) => update({ economic_level: x })}
                      options={[{ v: 0, l: 'Nessun costo' }, { v: 1, l: 'Meno di 10.000 EUR' }, { v: 2, l: '10.000 - 50.000 EUR' }, { v: 3, l: '50.000 - 100.000 EUR' }, { v: 4, l: 'Almeno 100.000 EUR' }]} /></div>
                )}
                <div className="space-y-1 md:col-span-2"><Label>Assunzioni economiche e operative *</Label><Textarea disabled={!editable} value={form.assumptions ?? ''} maxLength={3000} onChange={(e) => update({ assumptions: e.target.value })} /></div>
                <div className="grid sm:grid-cols-2 gap-3 md:col-span-2">
                  <div className="space-y-1"><Label>Frequenza annua dell'evento (facoltativa)</Label><Input inputMode="decimal" disabled={!editable} value={form.annual_frequency ?? ''} placeholder="es. 0,2 = una volta ogni 5 anni"
                    onChange={(e) => { const t = e.target.value.replace(',', '.'); update({ annual_frequency: t === '' ? null : Math.max(0, Number(t)) || 0 }); }} /></div>
                  <div className="space-y-1"><Label>Fonte della frequenza {form.annual_frequency != null && '*'}</Label><Input disabled={!editable} value={form.annual_frequency_source ?? ''} maxLength={300} onChange={(e) => update({ annual_frequency_source: e.target.value })} /></div>
                </div>
                {sources?.profile.data?.[0] && <p className="text-[11px] text-muted-foreground md:col-span-2">Contesto aziendale: settore {sources.profile.data[0].business_sector ?? 'n/d'}. Il fatturato non viene usato per calcolare i costi.</p>}
              </CardContent></Card>
            </TabsContent>

            {/* RECOVERY */}
            <TabsContent value="recovery" className="space-y-4">
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Obiettivi di ripristino</CardTitle></CardHeader><CardContent className="pt-0 grid md:grid-cols-3 gap-3">
                <div className="space-y-1"><Label>MTPD (tempo massimo tollerabile) *</Label><MinutesInput label="MTPD" value={form.mtpd_minutes} disabled={!editable} onChange={(x) => update({ mtpd_minutes: x })} /></div>
                <div className="space-y-1"><Label>RTO target *</Label><MinutesInput label="RTO" value={form.rto_target_minutes} disabled={!editable} onChange={(x) => update({ rto_target_minutes: x })} />
                  {form.rto_target_minutes != null && form.mtpd_minutes != null && form.rto_target_minutes >= form.mtpd_minutes && <p className="text-xs text-destructive">L'RTO deve essere minore dell'MTPD</p>}
                  {rec?.suggested_rto_upper_bound_minutes && <p className="text-[11px] text-muted-foreground">Suggerimento: RTO entro {formatMinutes(rec.suggested_rto_upper_bound_minutes)} ({rec.suggestion_rule}). Da confermare.</p>}</div>
                <div className="space-y-1"><Label>RPO target (perdita dati tollerabile)</Label><MinutesInput label="RPO" value={form.rpo_target_minutes} disabled={!editable} onChange={(x) => update({ rpo_target_minutes: x })} /></div>
                <div className="space-y-1 md:col-span-2"><Label>Modalità degradata / workaround</Label><Textarea disabled={!editable} value={form.degraded_mode ?? ''} maxLength={1000} onChange={(e) => update({ degraded_mode: e.target.value })} /></div>
                <div className="grid gap-3">
                  <div className="space-y-1"><Label>Capacità minima accettabile (%)</Label><Input inputMode="decimal" disabled={!editable} value={form.minimum_capacity_percent ?? ''} onChange={(e) => update({ minimum_capacity_percent: e.target.value === '' ? null : Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} /></div>
                  <div className="space-y-1"><Label>Ordine di recovery</Label><Input inputMode="numeric" disabled={!editable} value={form.recovery_rank ?? ''} onChange={(e) => update({ recovery_rank: e.target.value === '' ? null : Math.max(1, parseInt(e.target.value) || 1) })} /></div>
                </div>
              </CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Capacità corrente dagli asset collegati</CardTitle></CardHeader><CardContent className="pt-0 grid sm:grid-cols-2 lg:grid-cols-5 gap-3 text-sm">
                <div><div className="text-xs text-muted-foreground">RTO</div><Cov s={rec?.rto} /><div className="text-[11px] text-muted-foreground">Dichiarato {formatMinutes(rec?.current_recovery_minutes)}{rec?.rto_gap_minutes ? ` · gap ${formatMinutes(rec.rto_gap_minutes)}` : ''}</div></div>
                <div><div className="text-xs text-muted-foreground">RPO / backup</div><Cov s={rec?.rpo} /><div className="text-[11px] text-muted-foreground">Backup ogni {formatMinutes(rec?.current_backup_interval_minutes)}{rec?.rpo_gap_minutes ? ` · gap ${formatMinutes(rec.rpo_gap_minutes)}` : ''}</div></div>
                <div><div className="text-xs text-muted-foreground">Test di ripristino</div><Cov s={rec?.backup_test} /><div className="text-[11px] text-muted-foreground">{rec?.last_test_date ? new Date(rec.last_test_date).toLocaleDateString('it-IT') : 'nessuna data'}</div></div>
                <div><div className="text-xs text-muted-foreground">Runbook</div><Cov s={rec?.runbook} /></div>
                <div><div className="text-xs text-muted-foreground">Owner</div><Cov s={rec?.owner} /></div>
                <p className="text-[11px] text-muted-foreground sm:col-span-2 lg:col-span-5">I dati tecnici non modificano i target: generano gap. Resilience score {r.resilience_score ?? '—'}/100. Collega gli asset nella scheda Dipendenze.</p>
              </CardContent></Card>
            </TabsContent>

            {/* DIPENDENZE */}
            <TabsContent value="deps" className="space-y-4">
              {cycle && <div role="status" className="text-xs rounded-md border border-warning/40 bg-warning/10 p-3">Rilevato un ciclo di dipendenze che include questo servizio. Verifica che rappresenti una relazione reale.</div>}
              <div className="grid lg:grid-cols-2 gap-4">
                <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Dipende da (servizi interni)</CardTitle></CardHeader><CardContent className="pt-0 space-y-2">
                  {dependsOn.map((d) => <div key={d.id} className="flex items-center justify-between text-sm gap-2">
                    <span className="truncate">{nameOf(d.depends_on_service_id)} <span className="text-xs text-muted-foreground">· {CLASS_LABEL[d.dependency_strength]}{d.single_point_of_failure ? ' · SPOF' : ''}{d.workaround_available ? ' · workaround' : ''}</span></span>
                    {editable && <Button variant="ghost" size="icon" aria-label="Rimuovi" onClick={async () => { await biaApi.removeDependency(orgId, d); await qc.invalidateQueries({ queryKey: ['bia', 'deps'] }); await recompute(); }}><Trash2 className="w-4 h-4" /></Button>}</div>)}
                  {dependsOn.length === 0 && <p className="text-sm text-muted-foreground">Nessuna dipendenza.</p>}
                  {editable && <div className="grid sm:grid-cols-2 gap-2 pt-2 border-t border-border">
                    <Select value={newDep.id} onValueChange={(x) => setNewDep({ ...newDep, id: x })}><SelectTrigger aria-label="Servizio"><SelectValue placeholder="Servizio" /></SelectTrigger>
                      <SelectContent>{rows.filter((x) => x.service.id !== serviceId && x.service.status === 'active' && !dependsOn.some((d) => d.depends_on_service_id === x.service.id)).map((x) => <SelectItem key={x.service.id} value={x.service.id}>{x.service.name}</SelectItem>)}</SelectContent></Select>
                    <Select value={newDep.strength} onValueChange={(x) => setNewDep({ ...newDep, strength: x })}><SelectTrigger aria-label="Intensità"><SelectValue /></SelectTrigger>
                      <SelectContent>{Object.entries(CLASS_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select>
                    <label className="flex items-center gap-2 text-sm"><Switch checked={newDep.spof} onCheckedChange={(c) => setNewDep({ ...newDep, spof: c })} />Single point of failure</label>
                    <label className="flex items-center gap-2 text-sm"><Switch checked={newDep.workaround} onCheckedChange={(c) => setNewDep({ ...newDep, workaround: c })} />Workaround disponibile</label>
                    <Button size="sm" onClick={addDep} disabled={!newDep.id}>Aggiungi dipendenza</Button>
                  </div>}
                </CardContent></Card>
                <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Servizi che dipendono da questo</CardTitle></CardHeader><CardContent className="pt-0 space-y-3">
                  {dependents.map((d) => <div key={d.id} className="text-sm">{nameOf(d.service_id)} <span className="text-xs text-muted-foreground">· {CLASS_LABEL[d.dependency_strength]}</span></div>)}
                  {dependents.length === 0 && <p className="text-sm text-muted-foreground">Nessun servizio dipendente.</p>}
                  <div className="border-t border-border pt-3 space-y-2">
                    <label className="flex items-center gap-2 text-sm"><Switch disabled={!editable} checked={form.dependency_spof} onCheckedChange={(c) => update({ dependency_spof: c })} />Questo servizio è un single point of failure</label>
                    <label className="flex items-center gap-2 text-sm"><Switch disabled={!editable} checked={form.dependency_workaround} onCheckedChange={(c) => update({ dependency_workaround: c })} />Esiste un'alternativa tecnica o manuale</label>
                    <p className="text-[11px] text-muted-foreground">Punteggio dipendenza: {r.normalized?.dependency ?? 0} ({r.normalized?.dependents ?? 0} servizi dipendenti)</p>
                  </div>
                </CardContent></Card>
                <Card className="lg:col-span-2"><CardHeader className="pb-2"><CardTitle className="text-sm">Asset tecnici collegati (infrastruttura critica)</CardTitle></CardHeader><CardContent className="pt-0 space-y-2">
                  {(assetsQ.data ?? []).map((a) => {
                    const src = infra.find((x) => x.id === a.source_id);
                    return <div key={a.id} className="flex items-center justify-between text-sm gap-2">
                      <span className="truncate">{a.source_label ?? a.source_id} {!src && <Badge variant="outline" className="text-[10px] ml-1">Fonte non disponibile</Badge>}
                        {src && <span className="text-xs text-muted-foreground"> · RTO {src.rto_hours ?? '?'} h · RPO {src.rpo_hours ?? '?'} h · backup {src.backup_frequency || 'n/d'}</span>}</span>
                      {(!isSales || isSuperAdmin) && <Button variant="ghost" size="icon" aria-label="Scollega asset" onClick={async () => { await biaApi.removeAssetLink(orgId, a); await qc.invalidateQueries({ queryKey: ['bia', 'assets'] }); await recompute(); }}><Trash2 className="w-4 h-4" /></Button>}
                    </div>;
                  })}
                  {(!isSales || isSuperAdmin) && <div className="flex gap-2 pt-2">
                    <Select value={assetPick} onValueChange={setAssetPick}><SelectTrigger className="max-w-md" aria-label="Asset"><SelectValue placeholder={infra.length ? 'Seleziona asset' : 'Nessun asset in infrastruttura critica'} /></SelectTrigger>
                      <SelectContent>{infra.filter((a) => !linkedAssetIds.has(a.id)).map((a) => <SelectItem key={a.id} value={a.id}>{a.component_name || a.asset_id} ({a.asset_id})</SelectItem>)}</SelectContent></Select>
                    <Button size="sm" onClick={addAsset} disabled={!assetPick}>Collega</Button></div>}
                  <div className="space-y-1 pt-2"><Label className="text-xs">Motivazione se non ci sono dipendenze</Label><Input disabled={!editable} value={form.no_dependency_reason ?? ''} maxLength={300} onChange={(e) => update({ no_dependency_reason: e.target.value })} /></div>
                </CardContent></Card>
              </div>
            </TabsContent>

            {/* RISCHI E REMEDIATION */}
            <TabsContent value="risks" className="space-y-4">
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Rischi collegati</CardTitle></CardHeader><CardContent className="pt-0 space-y-2">
                {(risksQ.data ?? []).map((l) => <div key={l.id} className="flex items-center justify-between text-sm gap-2">
                  <span className="truncate">{l.source_label ?? l.source_id} <span className="text-xs text-muted-foreground">· {l.source_type === 'risk_analysis' ? 'Analisi rischi (100 - score)' : 'Asset IRP (rischio residuo)'} · rischio {l.normalized_residual_risk ?? '—'}{l.source_updated_at ? ` · agg. ${new Date(l.source_updated_at).toLocaleDateString('it-IT')}` : ''}</span></span>
                  {(!isSales || isSuperAdmin) && <Button variant="ghost" size="icon" aria-label="Scollega rischio" onClick={async () => { await biaApi.removeRiskLink(orgId, l); await qc.invalidateQueries({ queryKey: ['bia', 'risks'] }); await recompute(); }}><Trash2 className="w-4 h-4" /></Button>}</div>)}
                {suggestedRisks.filter((s) => !(risksQ.data ?? []).some((l) => l.source_id === s.id)).map((s) => (
                  <div key={s.id} className="flex items-center justify-between text-sm gap-2 rounded border border-dashed border-border p-2">
                    <span>Suggerito (asset comune): {s.asset_name}</span><Button size="sm" variant="outline" onClick={() => addRisk(`risk_analysis:${s.id}`)}>Conferma</Button></div>))}
                {(!isSales || isSuperAdmin) && <div className="flex gap-2 pt-2">
                  <Select value={riskPick} onValueChange={setRiskPick}><SelectTrigger className="max-w-md" aria-label="Rischio"><SelectValue placeholder="Seleziona rischio" /></SelectTrigger>
                    <SelectContent>
                      {riskSrc.map((x) => <SelectItem key={x.id} value={`risk_analysis:${x.id}`}>Analisi rischi · {x.asset_name}</SelectItem>)}
                      {irpSrc.map((x) => <SelectItem key={x.id} value={`asset_irp:${x.id}`}>Asset IRP · {`${x.categoria ?? ''} ${x.tecnologia ?? ''}`.trim()} ({Math.round(Number(x.rischio_residuo))})</SelectItem>)}
                    </SelectContent></Select>
                  <Button size="sm" onClick={() => addRisk()} disabled={!riskPick}>Collega</Button></div>}
              </CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Remediation collegate · {r.expected_annual_loss_status === 'calculated' ? 'Priorità economica' : 'Priorità qualitativa'}</CardTitle></CardHeader><CardContent className="pt-0 space-y-3">
                <div className="overflow-x-auto"><Table><TableHeader><TableRow>
                  <TableHead>Task</TableHead><TableHead>Priorità</TableHead><TableHead>Budget</TableHead><TableHead>Progresso</TableHead><TableHead>Riduzione rischio</TableHead><TableHead>Beneficio / ROI / payback</TableHead><TableHead />
                </TableRow></TableHeader><TableBody>
                  {(remQ.data ?? []).map((l) => {
                    const t = tasks.find((x) => x.id === l.remediation_task_id);
                    const val = remediationValue({ baselineEal: r.expected_annual_loss ? Number(r.expected_annual_loss) : null, reductionPercent: l.estimated_risk_reduction_percent, implementationCost: t?.budget != null ? Number(t.budget) : null, recurringAnnualCost: l.recurring_annual_cost, usefulLifeYears: l.useful_life_years });
                    return <TableRow key={l.id}>
                      <TableCell className="text-sm">{t?.task ?? 'Task non disponibile'}{t?.source === 'bia' && <Badge variant="outline" className="ml-1 text-[10px]">da BIA</Badge>}</TableCell>
                      <TableCell className="text-sm">{t?.priority ?? '—'}</TableCell>
                      <TableCell className="text-sm">{formatMoney(t?.budget)}</TableCell>
                      <TableCell className="text-sm">{t?.progress ?? 0}%</TableCell>
                      <TableCell className="min-w-[180px]">
                        <div className="flex gap-1"><Input aria-label="Riduzione %" inputMode="decimal" className="w-16" defaultValue={l.estimated_risk_reduction_percent ?? ''} disabled={isSales && !isSuperAdmin}
                          onBlur={async (e) => { const v = e.target.value === '' ? null : Math.min(100, Math.max(0, Number(e.target.value))); if (v != null && !l.reduction_source) { toast.error('Indica prima la motivazione della riduzione'); return; } await biaApi.updateRemediationLink(l.id, { estimated_risk_reduction_percent: v }); qc.invalidateQueries({ queryKey: ['bia', 'rem'] }); }} />
                          <Input aria-label="Motivazione riduzione" placeholder="motivazione" defaultValue={l.reduction_source ?? ''} disabled={isSales && !isSuperAdmin}
                            onBlur={async (e) => { await biaApi.updateRemediationLink(l.id, { reduction_source: e.target.value || null }); qc.invalidateQueries({ queryKey: ['bia', 'rem'] }); }} /></div>
                      </TableCell>
                      <TableCell className="text-xs">{val.annualBenefit == null ? 'Non calcolabile (serve frequenza e riduzione)' : `${formatMoney(val.annualBenefit)}/anno · ROI ${val.roiPercent == null ? 'n/c' : `${Math.round(val.roiPercent)}%`} · payback ${val.paybackMonths == null ? 'n/c' : `${val.paybackMonths.toFixed(1)} mesi`}`}</TableCell>
                      <TableCell className="whitespace-nowrap"><Button variant="link" size="sm" asChild><Link to="/remediation">Apri</Link></Button>
                        {(!isSales || isSuperAdmin) && <Button variant="ghost" size="icon" aria-label="Scollega remediation" onClick={async () => { await biaApi.removeRemediationLink(orgId, l); qc.invalidateQueries({ queryKey: ['bia'] }); }}><Trash2 className="w-4 h-4" /></Button>}</TableCell>
                    </TableRow>;
                  })}
                </TableBody></Table></div>
                {(remQ.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nessuna remediation collegata.</p>}
                {(!isSales || isSuperAdmin) && <div className="grid md:grid-cols-2 gap-3 pt-2 border-t border-border">
                  <div className="flex gap-2"><Select value={remPick} onValueChange={setRemPick}><SelectTrigger aria-label="Remediation esistente"><SelectValue placeholder="Collega remediation esistente" /></SelectTrigger>
                    <SelectContent>{tasks.filter((t) => !(remQ.data ?? []).some((l) => l.remediation_task_id === t.id)).map((t) => <SelectItem key={t.id} value={t.id}>{t.task}</SelectItem>)}</SelectContent></Select>
                    <Button size="sm" onClick={addRem} disabled={!remPick}>Collega</Button></div>
                  <div className="flex gap-2"><Input placeholder="Nuova remediation" value={newTask.task} maxLength={200} onChange={(e) => setNewTask({ ...newTask, task: e.target.value })} />
                    <Input placeholder="Budget" inputMode="decimal" className="w-32" value={newTask.budget} onChange={(e) => setNewTask({ ...newTask, budget: e.target.value })} />
                    <Button size="sm" onClick={createTask} disabled={!newTask.task.trim()}>Crea</Button></div>
                </div>}
              </CardContent></Card>
            </TabsContent>

            {/* STORICO */}
            <TabsContent value="history" className="space-y-4">
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Versioni</CardTitle></CardHeader><CardContent className="pt-0 overflow-x-auto">
                <Table><TableHeader><TableRow><TableHead>Versione</TableHead><TableHead>Stato</TableHead><TableHead>Data</TableHead><TableHead>Score</TableHead><TableHead>Costo 24 h</TableHead><TableHead>RTO</TableHead><TableHead>Motivo</TableHead><TableHead /></TableRow></TableHeader>
                  <TableBody>{row!.versions.map((v) => (
                    <TableRow key={v.id} className={v.id === bia.id ? 'bg-muted/40' : ''}>
                      <TableCell>v{v.version}</TableCell><TableCell>{STATUS_LABEL[v.status]}</TableCell>
                      <TableCell className="text-xs">{new Date(v.approved_at ?? v.created_at).toLocaleDateString('it-IT')}</TableCell>
                      <TableCell>{v.business_impact_score ?? '—'}</TableCell><TableCell className="text-sm">{formatMoney(v.result?.potential_downtime_cost_24h)}</TableCell>
                      <TableCell className="text-sm">{formatMinutes(v.rto_target_minutes)}</TableCell><TableCell className="text-xs">{v.review_comment ?? ''}</TableCell>
                      <TableCell>{v.id !== bia.id && <Button size="sm" variant="link" asChild><Link to={`/business-impact-analysis/services/${serviceId}/bia/${v.id}`}>Apri</Link></Button>}</TableCell>
                    </TableRow>))}</TableBody></Table>
              </CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Registro attività</CardTitle></CardHeader><CardContent className="pt-0 space-y-1">
                {(auditQ.data ?? []).map((e) => <div key={e.id} className="text-xs flex gap-2"><span className="text-muted-foreground shrink-0">{new Date(e.created_at).toLocaleString('it-IT')}</span><span>{e.event_type}{e.reason ? ` · ${e.reason}` : ''}</span></div>)}
                {(auditQ.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nessun evento.</p>}
              </CardContent></Card>
            </TabsContent>
          </Tabs>
        )}

        {editable && <div className="md:hidden fixed bottom-0 inset-x-0 p-3 bg-background border-t border-border z-20"><Button className="w-full min-h-[44px]" onClick={doSubmit} disabled={busy}>Invia in revisione</Button></div>}
      </div>

      <ServiceFormDialog open={editOpen} onOpenChange={setEditOpen} contacts={contacts} initial={service} submitLabel="Salva"
        onSubmit={async (v) => { const { id: _i, code: _c, organization_id: _o, created_at: _ca, updated_at: _u, ...rest } = v as any; await biaApi.updateService(serviceId, rest); await refresh(); await recompute(); }} />
      <Dialog open={changesOpen} onOpenChange={setChangesOpen}>
        <DialogContent><DialogHeader><DialogTitle>Richiedi modifiche</DialogTitle></DialogHeader>
          <Textarea value={changesText} maxLength={1000} onChange={(e) => setChangesText(e.target.value)} placeholder="Cosa va corretto?" />
          <DialogFooter><Button variant="outline" onClick={() => setChangesOpen(false)}>Annulla</Button><Button onClick={doRequestChanges} disabled={!changesText.trim() || busy}>Invia</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
