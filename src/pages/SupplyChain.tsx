import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useClientOrganization } from "@/hooks/useClientOrganization";
import { useUserRoles } from "@/hooks/useUserRoles";
import { isInnovatechDemo } from "@/data/innovatechSecurityDemo";
import { MoreHorizontal, Plus, Truck, AlertTriangle, Mail, CheckCircle2, Gauge, ShieldAlert } from "lucide-react";
import {
  ASSESSMENT_LABEL, CRITICALITY_LABEL, DISCLAIMER, PORTAL_LABEL, audit, riskBand, sb,
  type Assessment, type Supplier, type Criticality,
} from "@/features/supply-chain/api";
import { SupplierFormDialog } from "@/features/supply-chain/components/SupplierFormDialog";
import { InviteDialog } from "@/features/supply-chain/components/InviteDialog";
import { SupplierDetailSheet } from "@/features/supply-chain/components/SupplierDetailSheet";

type Rec = { id: string; supplier_id: string; gap_title: string; service_name: string | null; priority: string; rationale: string | null; commercial_status: string };

const COMMERCIAL_LABEL: Record<string, string> = { new: "Nuova", review: "Da valutare", contacted: "Contattato", not_relevant: "Non pertinente" };
const PRIORITY_LABEL: Record<string, string> = { high: "Alta", medium: "Media", low: "Bassa" };

export default function SupplyChain() {
  const { organizationId, selectedOrganization } = useClientOrganization();
  const enabled = isInnovatechDemo(selectedOrganization?.name);
  const { isSuperAdmin, isSales } = useUserRoles();
  const canSeeCommercial = isSuperAdmin || isSales;
  const qc = useQueryClient();
  const { toast } = useToast();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [inviteFor, setInviteFor] = useState<Supplier | null>(null);
  const [detail, setDetail] = useState<Supplier | null>(null);
  const [q, setQ] = useState("");
  const [fCrit, setFCrit] = useState("all");
  const [fPortal, setFPortal] = useState("all");
  const [fAss, setFAss] = useState("all");
  const [fScore, setFScore] = useState("all");

  const { data, isLoading } = useQuery({
    queryKey: ["supply-chain", organizationId, canSeeCommercial],
    enabled: enabled && !!organizationId,
    queryFn: async () => {
      const { data: suppliers, error } = await sb.from("supplier_directory").select("*")
        .eq("organization_id", organizationId).is("archived_at", null).order("supplier_name");
      if (error) throw error;
      const ids = (suppliers ?? []).map((s: Supplier) => s.id);
      const [ass, gaps, recs, logs] = await Promise.all([
        ids.length ? sb.from("supplier_assessments").select("*").in("supplier_id", ids).order("created_at", { ascending: false }) : { data: [] },
        sb.rpc("sc_org_gaps", { _org: organizationId }),
        canSeeCommercial && ids.length ? sb.from("supply_chain_recommendations").select("*").in("supplier_id", ids) : { data: [] },
        sb.from("supply_chain_audit_log").select("*").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(8),
      ]);
      const latest: Record<string, Assessment> = {};
      for (const a of (ass.data ?? []) as Assessment[]) if (!latest[a.supplier_id]) latest[a.supplier_id] = a;
      const lastScore: Record<string, number | null> = {};
      for (const a of (ass.data ?? []) as Assessment[]) if (a.status === "submitted" && lastScore[a.supplier_id] === undefined) lastScore[a.supplier_id] = a.score;
      return { suppliers: (suppliers ?? []) as Supplier[], latest, lastScore, assessments: (ass.data ?? []) as Assessment[], gaps: gaps.data ?? [], recs: (recs.data ?? []) as Rec[], logs: logs.data ?? [] };
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["supply-chain", organizationId] });

  const suppliers = data?.suppliers ?? [];
  const byId = useMemo(() => Object.fromEntries(suppliers.map((s) => [s.id, s])), [suppliers]);

  const filtered = suppliers.filter((s) => {
    const a = data?.latest[s.id];
    const sc = data?.lastScore[s.id];
    if (q && !`${s.supplier_name} ${s.category ?? ""} ${s.contact_name ?? ""} ${s.email ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (fCrit !== "all" && s.criticality !== fCrit) return false;
    if (fPortal !== "all" && s.status !== fPortal) return false;
    if (fAss !== "all" && (a?.status ?? "none") !== fAss) return false;
    if (fScore !== "all") {
      if (sc == null) return false;
      if (fScore === "good" && sc < 80) return false;
      if (fScore === "mid" && (sc < 60 || sc >= 80)) return false;
      if (fScore === "low" && (sc < 40 || sc >= 60)) return false;
      if (fScore === "critical" && sc >= 40) return false;
    }
    return true;
  });

  const setStatus = async (s: Supplier, status: string, action: string, extra: Record<string, unknown> = {}) => {
    const { error } = await sb.from("supplier_directory").update({ status, ...extra }).eq("id", s.id);
    if (error) return toast({ title: "Operazione non riuscita", description: error.message, variant: "destructive" });
    await audit(s.organization_id, s.id, action);
    toast({ title: "Aggiornato" });
    refresh();
  };

  const reopen = async (s: Supplier) => {
    const { error } = await sb.rpc("sc_reopen_assessment", { _supplier: s.id });
    if (error) return toast({ title: "Operazione non riuscita", description: error.message, variant: "destructive" });
    toast({ title: "Assessment riaperto" });
    refresh();
  };

  const updateRec = async (r: Rec, commercial_status: string) => {
    const { error } = await sb.from("supply_chain_recommendations").update({ commercial_status }).eq("id", r.id);
    if (error) return toast({ title: "Errore", description: error.message, variant: "destructive" });
    refresh();
  };

  if (!enabled) {
    return (
      <DashboardLayout>
        <div className="p-8">
          <Card><CardContent className="p-10 text-center space-y-2">
            <Truck className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="font-medium">Modulo non disponibile per questa organizzazione</p>
          </CardContent></Card>
        </div>
      </DashboardLayout>
    );
  }

  const submitted = Object.values(data?.lastScore ?? {}).filter((x) => x != null) as number[];
  const avg = submitted.length ? Math.round(submitted.reduce((a, b) => a + b, 0) / submitted.length) : null;
  const kpis = [
    { label: "Fornitori totali", value: suppliers.length, icon: Truck },
    { label: "Fornitori critici", value: suppliers.filter((s) => s.criticality === "critical").length, icon: AlertTriangle },
    { label: "Inviti in attesa", value: suppliers.filter((s) => s.status === "invited").length, icon: Mail },
    { label: "Assessment completati", value: `${submitted.length} / ${suppliers.length}`, icon: CheckCircle2 },
    { label: "Conformità light media", value: avg == null ? "—" : `${avg}%`, icon: Gauge },
    { label: "Rischio alto o critico", value: submitted.filter((x) => x < 60).length, icon: ShieldAlert },
  ];

  const critDist = (["critical", "high", "medium", "low"] as Criticality[]).map((c) => ({ label: CRITICALITY_LABEL[c], n: suppliers.filter((s) => s.criticality === c).length }));
  const assDist = Object.entries(ASSESSMENT_LABEL).map(([k, l]) => ({ label: l, n: suppliers.filter((s) => data?.latest[s.id]?.status === k).length }));
  const lowest = suppliers.filter((s) => data?.lastScore[s.id] != null).sort((a, b) => (data!.lastScore[a.id]! - data!.lastScore[b.id]!)).slice(0, 5);
  const gapFreq = Object.entries((data?.gaps ?? []).reduce((acc: Record<string, number>, g: { gap_title: string }) => { acc[g.gap_title] = (acc[g.gap_title] ?? 0) + 1; return acc; }, {}))
    .sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 6);

  const Bars = ({ items }: { items: { label: string; n: number }[] }) => {
    const max = Math.max(1, ...items.map((i) => i.n));
    return <div className="space-y-2">{items.map((i) => (
      <div key={i.label} className="flex items-center gap-2 text-sm">
        <span className="w-36 shrink-0 truncate text-muted-foreground">{i.label}</span>
        <div className="flex-1 h-2 rounded bg-muted overflow-hidden"><div className="h-full bg-primary" style={{ width: `${(i.n / max) * 100}%` }} /></div>
        <span className="w-6 text-right">{i.n}</span>
      </div>))}</div>;
  };

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-6 min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">Supply Chain</h1>
              <Badge variant="secondary">Demo InnovaTech</Badge>
            </div>
            <p className="text-sm text-muted-foreground">Mappa i fornitori, raccogli la loro postura cyber e monitora il rischio di terza parte</p>
          </div>
          <Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="h-4 w-4 mr-1" />Nuovo fornitore</Button>
        </div>

        <Tabs defaultValue="dashboard">
          <TabsList className="flex flex-wrap h-auto gap-1 p-1">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="suppliers">Fornitori</TabsTrigger>
            <TabsTrigger value="assessments">Assessment</TabsTrigger>
            {canSeeCommercial && <TabsTrigger value="opps">Opportunità</TabsTrigger>}
          </TabsList>

          <TabsContent value="dashboard" className="space-y-4">
            {isLoading ? <Skeleton className="h-40" /> : (
              <>
                <div className="grid gap-3 grid-cols-2 lg:grid-cols-6">
                  {kpis.map((k) => (
                    <Card key={k.label}><CardContent className="p-4">
                      <k.icon className="h-4 w-4 text-muted-foreground" />
                      <p className="text-2xl font-bold mt-2">{k.value}</p>
                      <p className="text-xs text-muted-foreground">{k.label}</p>
                    </CardContent></Card>
                  ))}
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <Card><CardHeader><CardTitle className="text-sm">Distribuzione per criticità</CardTitle></CardHeader><CardContent><Bars items={critDist} /></CardContent></Card>
                  <Card><CardHeader><CardTitle className="text-sm">Stato assessment</CardTitle></CardHeader><CardContent><Bars items={assDist} /></CardContent></Card>
                  <Card><CardHeader><CardTitle className="text-sm">Fornitori con score più basso</CardTitle></CardHeader><CardContent className="space-y-2">
                    {lowest.length === 0 ? <p className="text-sm text-muted-foreground">Nessun assessment completato.</p> : lowest.map((s) => {
                      const b = riskBand(data!.lastScore[s.id]);
                      return <button key={s.id} className="w-full flex items-center justify-between text-sm hover:bg-muted/50 rounded px-2 py-1" onClick={() => setDetail(s)}>
                        <span className="truncate">{s.supplier_name}</span>
                        <span className="flex items-center gap-2"><span className="font-semibold">{data!.lastScore[s.id]}</span><Badge variant="outline" className={b.tone}>{b.label}</Badge></span>
                      </button>;
                    })}
                  </CardContent></Card>
                  <Card><CardHeader><CardTitle className="text-sm">Gap più frequenti</CardTitle></CardHeader><CardContent>
                    {gapFreq.length === 0 ? <p className="text-sm text-muted-foreground">Nessun gap rilevato.</p> : <Bars items={gapFreq.map(([l, n]) => ({ label: l, n: n as number }))} />}
                  </CardContent></Card>
                  <Card><CardHeader><CardTitle className="text-sm">Attività recenti</CardTitle></CardHeader><CardContent className="space-y-1">
                    {(data?.logs ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Nessuna attività.</p> :
                      data!.logs.map((l: { id: string; action: string; supplier_id: string; created_at: string }) => (
                        <div key={l.id} className="flex justify-between text-sm">
                          <span className="truncate">{byId[l.supplier_id]?.supplier_name ?? "—"} · {l.action.replace(/_/g, " ")}</span>
                          <span className="text-xs text-muted-foreground shrink-0 ml-2">{new Date(l.created_at).toLocaleDateString("it-IT")}</span>
                        </div>))}
                  </CardContent></Card>
                  {canSeeCommercial && (
                    <Card><CardHeader><CardTitle className="text-sm">Opportunità commerciali</CardTitle></CardHeader><CardContent>
                      <Bars items={Object.entries((data?.recs ?? []).reduce((acc: Record<string, number>, r) => { const k = r.service_name ?? "—"; acc[k] = (acc[k] ?? 0) + 1; return acc; }, {})).map(([label, n]) => ({ label, n: n as number }))} />
                    </CardContent></Card>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{DISCLAIMER}</p>
              </>
            )}
          </TabsContent>

          <TabsContent value="suppliers" className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Input placeholder="Cerca fornitore, referente, email…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
              <Select value={fCrit} onValueChange={setFCrit}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent>
                <SelectItem value="all">Tutte le criticità</SelectItem>{Object.entries(CRITICALITY_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select>
              <Select value={fPortal} onValueChange={setFPortal}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent>
                <SelectItem value="all">Tutti gli inviti</SelectItem>{["draft", "invited", "active", "suspended"].map((k) => <SelectItem key={k} value={k}>{PORTAL_LABEL[k as keyof typeof PORTAL_LABEL]}</SelectItem>)}</SelectContent></Select>
              <Select value={fAss} onValueChange={setFAss}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent>
                <SelectItem value="all">Tutti gli assessment</SelectItem>{Object.entries(ASSESSMENT_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select>
              <Select value={fScore} onValueChange={setFScore}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent>
                <SelectItem value="all">Tutti gli score</SelectItem><SelectItem value="good">80–100</SelectItem><SelectItem value="mid">60–79</SelectItem><SelectItem value="low">40–59</SelectItem><SelectItem value="critical">0–39</SelectItem></SelectContent></Select>
            </div>
            <Card><div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Fornitore</TableHead><TableHead>Servizio</TableHead><TableHead>Criticità</TableHead><TableHead>Referente</TableHead>
                  <TableHead>Portale</TableHead><TableHead>Assessment</TableHead><TableHead>Score</TableHead><TableHead>Aggiornato</TableHead><TableHead />
                </TableRow></TableHeader>
                <TableBody>
                  {isLoading ? <TableRow><TableCell colSpan={9}><Skeleton className="h-8" /></TableCell></TableRow> :
                    filtered.length === 0 ? <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Nessun fornitore</TableCell></TableRow> :
                    filtered.map((s) => {
                      const a = data?.latest[s.id]; const sc = data?.lastScore[s.id]; const b = riskBand(sc);
                      return (
                        <TableRow key={s.id} className="cursor-pointer" onClick={() => setDetail(s)}>
                          <TableCell className="font-medium">{s.supplier_name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{s.category ?? "—"}</TableCell>
                          <TableCell><Badge variant={s.criticality === "critical" || s.criticality === "high" ? "destructive" : "secondary"}>{CRITICALITY_LABEL[s.criticality]}</Badge></TableCell>
                          <TableCell className="text-sm"><div>{s.contact_name ?? "—"}</div><div className="text-xs text-muted-foreground">{s.email}</div></TableCell>
                          <TableCell><Badge variant="outline">{PORTAL_LABEL[s.status]}</Badge></TableCell>
                          <TableCell className="text-sm">{a ? ASSESSMENT_LABEL[a.status] : "—"}</TableCell>
                          <TableCell>{sc != null ? <Badge variant="outline" className={b.tone}>{sc}</Badge> : "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{new Date(s.updated_at).toLocaleDateString("it-IT")}</TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild><Button size="icon" variant="ghost"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setDetail(s)}>Apri dettaglio</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => { setEditing(s); setFormOpen(true); }}>Modifica anagrafica</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setInviteFor(s)}>{s.status === "draft" ? "Invita fornitore" : "Reinvia invito"}</DropdownMenuItem>
                                {s.status === "suspended"
                                  ? <DropdownMenuItem onClick={() => setStatus(s, "active", "supplier_reactivated")}>Riattiva accesso</DropdownMenuItem>
                                  : s.status !== "draft" && <DropdownMenuItem onClick={() => setStatus(s, "suspended", "supplier_suspended")}>Sospendi accesso</DropdownMenuItem>}
                                <DropdownMenuItem onClick={() => reopen(s)}>Riapri assessment</DropdownMenuItem>
                                <DropdownMenuItem className="text-destructive" onClick={() => setStatus(s, "archived", "supplier_archived", { archived_at: new Date().toISOString(), portal_enabled: false })}>Archivia fornitore</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </div></Card>
          </TabsContent>

          <TabsContent value="assessments">
            <Card><div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Fornitore</TableHead><TableHead>Scadenza</TableHead><TableHead>Avanzamento</TableHead><TableHead>Score</TableHead>
                  <TableHead>Stato</TableHead><TableHead>Avviato</TableHead><TableHead>Completato</TableHead><TableHead />
                </TableRow></TableHeader>
                <TableBody>
                  {(data?.assessments ?? []).length === 0 ? <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nessun assessment</TableCell></TableRow> :
                    data!.assessments.map((a) => {
                      const s = byId[a.supplier_id]; const b = riskBand(a.score);
                      return (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium">{s?.supplier_name}</TableCell>
                          <TableCell className="text-sm">{a.due_at ? new Date(a.due_at).toLocaleDateString("it-IT") : "—"}</TableCell>
                          <TableCell className="w-40"><div className="flex items-center gap-2"><Progress value={a.progress_percent} className="h-2" /><span className="text-xs">{a.progress_percent}%</span></div></TableCell>
                          <TableCell>{a.score != null ? <Badge variant="outline" className={b.tone}>{a.score} · {b.label}</Badge> : "—"}</TableCell>
                          <TableCell className="text-sm">{ASSESSMENT_LABEL[a.status]}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{a.started_at ? new Date(a.started_at).toLocaleDateString("it-IT") : "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{a.submitted_at ? new Date(a.submitted_at).toLocaleDateString("it-IT") : "—"}</TableCell>
                          <TableCell>{s && <Button size="sm" variant="outline" onClick={() => setDetail(s)}>Risposte e gap</Button>}</TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </div></Card>
          </TabsContent>

          {canSeeCommercial && (
            <TabsContent value="opps">
              <Card><div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Fornitore</TableHead><TableHead>Gap rilevato</TableHead><TableHead>Servizio suggerito</TableHead>
                    <TableHead>Priorità</TableHead><TableHead>Motivazione</TableHead><TableHead>Stato</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {(data?.recs ?? []).length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nessuna opportunità</TableCell></TableRow> :
                      data!.recs.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">{byId[r.supplier_id]?.supplier_name}</TableCell>
                          <TableCell className="text-sm">{r.gap_title}</TableCell>
                          <TableCell><Badge>{r.service_name}</Badge></TableCell>
                          <TableCell><Badge variant={r.priority === "high" ? "destructive" : "secondary"}>{PRIORITY_LABEL[r.priority]}</Badge></TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-xs">{r.rationale}</TableCell>
                          <TableCell>
                            <Select value={r.commercial_status} onValueChange={(v) => updateRec(r, v)}>
                              <SelectTrigger className="w-36 h-8"><SelectValue /></SelectTrigger>
                              <SelectContent>{Object.entries(COMMERCIAL_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                            </Select>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div></Card>
            </TabsContent>
          )}
        </Tabs>
      </div>

      {organizationId && <SupplierFormDialog open={formOpen} onOpenChange={setFormOpen} organizationId={organizationId} supplier={editing} onSaved={refresh} />}
      <InviteDialog open={!!inviteFor} onOpenChange={(o) => !o && setInviteFor(null)} supplier={inviteFor} onDone={refresh} />
      <SupplierDetailSheet open={!!detail} onOpenChange={(o) => !o && setDetail(null)} supplier={detail} />
    </DashboardLayout>
  );
}
