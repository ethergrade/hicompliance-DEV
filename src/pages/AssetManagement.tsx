import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useClientOrganization } from "@/hooks/useClientOrganization";
import {
  managedAssetsApi, ASSET_COLUMNS, nearestExpiry, daysUntil,
  type ManagedAsset, type LookupKind,
} from "@/lib/api/managed-assets";
import { Plus, Upload, Download, RefreshCw, Trash2, Link2, Loader2, Check, X, Eye, EyeOff } from "lucide-react";

const PAGE = 15;
const DATE_FIELDS = new Set(["date_of_assign", "start_contract_date", "end_contract_date", "warranty_start_date", "warranty_expiration", "ddt_date"]);
const NUM_FIELDS = new Set(["asset_cost", "warranty_cost"]);
const HALO_LOCKED = new Set(["asset_number", "asset_type", "model", "name", "serial_number", "status", "status_cliente", "assignee", "site", "supplier"]);
const LOOKUP_FIELD: Partial<Record<keyof ManagedAsset, LookupKind>> = {
  asset_type: "asset_type", status: "status", purchase_type: "purchase_type", supplier: "supplier", assignee: "assignee",
};
const LOOKUP_LABEL: Record<LookupKind, string> = {
  asset_type: "Tipo asset", status: "Stato", purchase_type: "Tipo acquisto", supplier: "Fornitori", assignee: "Assegnatari",
};
const SECTIONS: [string, (keyof ManagedAsset)[]][] = [
  ["Identificazione", ["internal_code", "asset_number", "asset_type", "model", "name", "serial_number", "status", "status_cliente", "pin", "puk"]],
  ["Assegnazione", ["assignee", "date_of_assign", "site"]],
  ["Acquisto e contratto", ["purchase_type", "supplier", "contract_number", "start_contract_date", "end_contract_date", "asset_cost"]],
  ["Garanzia", ["warranty_type", "warranty_cost", "warranty_start_date", "warranty_expiration"]],
  ["Documento di trasporto", ["ddt_number", "ddt_date"]],
  ["Note", ["note"]],
];
const label = (f: keyof ManagedAsset) => ASSET_COLUMNS.find((c) => c[0] === f)?.[1] ?? f;
const required = (f: keyof ManagedAsset) => !!ASSET_COLUMNS.find((c) => c[0] === f)?.[2];
const eur = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

const expiryBadge = (d: number | null) => {
  if (d === null) return null;
  if (d < 0) return <Badge variant="destructive">Scaduto</Badge>;
  if (d <= 30) return <Badge variant="destructive">{d} gg</Badge>;
  if (d <= 180) return <Badge variant="outline" className="border-cyber-orange text-cyber-orange">{d} gg</Badge>;
  return null;
};

export default function AssetManagement() {
  const { organizationId, selectedOrganization } = useClientOrganization();
  const { toast } = useToast();
  const [assets, setAssets] = useState<ManagedAsset[]>([]);
  const [lookups, setLookups] = useState<Record<LookupKind, string[]>>({ asset_type: [], status: [], purchase_type: [], supplier: [], assignee: [] });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const [groupBy, setGroupBy] = useState<"none" | "asset_type" | "status" | "assignee">("none");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<ManagedAsset | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const [a, l] = await Promise.all([managedAssetsApi.list(organizationId), managedAssetsApi.lookups(organizationId)]);
      setAssets(a); setLookups(l);
    } catch (e) {
      toast({ title: "Errore", description: (e as Error).message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [organizationId, toast]);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return assets
      .filter((a) => !q || ASSET_COLUMNS.some(([f]) => f !== "pin" && f !== "puk" && String(a[f] ?? "").toLowerCase().includes(q)))
      .filter((a) => Object.entries(colFilters).every(([f, v]) => !v || String(a[f as keyof ManagedAsset] ?? "").toLowerCase().includes(v.toLowerCase())))
      .sort((x, y) => {
        const ex = nearestExpiry(x), ey = nearestExpiry(y);
        const sx = ex !== null && ex <= 180 ? ex : 1e9, sy = ey !== null && ey <= 180 ? ey : 1e9;
        return sx - sy || x.internal_code.localeCompare(y.internal_code);
      });
  }, [assets, search, colFilters]);

  const stats = useMemo(() => ({
    total: assets.length,
    assigned: assets.filter((a) => a.status === "Assigned").length,
    available: assets.filter((a) => a.status === "Available" || a.status === "New").length,
    attention: assets.filter((a) => ["To be repaired", "To be disposed of", "Stolen"].includes(a.status ?? "")).length,
    value: assets.reduce((s, a) => s + (a.asset_cost_nd ? 0 : Number(a.asset_cost ?? 0)), 0),
    expiring: assets.filter((a) => { const d = nearestExpiry(a); return d !== null && d <= 180; }).length,
  }), [assets]);

  const groups = useMemo(() => {
    if (groupBy === "none") return null;
    const m = new Map<string, number>();
    filtered.forEach((a) => m.set(String(a[groupBy] ?? "—"), (m.get(String(a[groupBy] ?? "—")) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [filtered, groupBy]);

  const pageRows = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));

  const newAsset = async () => {
    if (!organizationId) return;
    try {
      const a = await managedAssetsApi.create(organizationId, { status: "New" });
      setAssets((p) => [...p, a]); setEditing(a);
    } catch (e) { toast({ title: "Errore", description: (e as Error).message, variant: "destructive" }); }
  };

  const exportXlsx = () => {
    const rows = filtered.map((a) => Object.fromEntries(ASSET_COLUMNS.map(([f, h]) => [h, f === "asset_cost" && a.asset_cost_nd ? "N/D" : a[f] ?? ""])));
    const ws = XLSX.utils.json_to_sheet(rows, { header: ASSET_COLUMNS.map((c) => c[1]) });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Asset");
    XLSX.writeFile(wb, `Asset_${selectedOrganization?.name ?? "cliente"}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const importXlsx = async (file: File) => {
    if (!organizationId) return;
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: null });
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
      const rows = raw.map((r) => {
        const out: Record<string, unknown> = {};
        Object.entries(r).forEach(([h, v]) => {
          const col = ASSET_COLUMNS.find((c) => norm(c[1]) === norm(h));
          if (!col || v === null || v === "") return;
          const f = col[0];
          if (DATE_FIELDS.has(f)) out[f] = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
          else if (f === "asset_cost" && String(v).toUpperCase() === "N/D") out.asset_cost_nd = true;
          else if (NUM_FIELDS.has(f)) out[f] = Number(String(v).replace(",", ".")) || null;
          else out[f] = f === "internal_code" ? String(v).padStart(3, "0") : String(v);
        });
        return out as Partial<ManagedAsset>;
      }).filter((r) => Object.keys(r).length);
      await managedAssetsApi.bulkInsert(organizationId, rows);
      toast({ title: "Import completato", description: `${rows.length} asset importati` });
      load();
    } catch (e) { toast({ title: "Import fallito", description: (e as Error).message, variant: "destructive" }); }
  };

  if (!organizationId) return <DashboardLayout><p className="p-6 text-muted-foreground">Seleziona un cliente.</p></DashboardLayout>;

  return (
    <DashboardLayout>
      <div className="space-y-6 min-w-0">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Asset Management</h1>
            <p className="text-sm text-muted-foreground">Registro asset di {selectedOrganization?.name}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={newAsset}><Plus className="w-4 h-4 mr-1" />Nuovo asset</Button>
            <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload className="w-4 h-4 mr-1" />Importa Excel</Button>
            <Button variant="outline" onClick={exportXlsx}><Download className="w-4 h-4 mr-1" />Esporta Excel</Button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importXlsx(f); e.target.value = ""; }} />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {[["Totale", stats.total], ["Assegnati", stats.assigned], ["Disponibili", stats.available], ["Da riparare/dismettere", stats.attention], ["Valore totale", eur(stats.value)], ["Scadenze ≤180 gg", stats.expiring]].map(([l, v]) => (
            <Card key={l as string}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{l}</p><p className="text-xl font-semibold">{v}</p></CardContent></Card>
          ))}
        </div>

        <Tabs defaultValue="registro">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="registro">Registro</TabsTrigger>
            <TabsTrigger value="scadenze">Scadenze</TabsTrigger>
            <TabsTrigger value="liste">Liste</TabsTrigger>
            <TabsTrigger value="halo">Collegamento HaloPSA</TabsTrigger>
          </TabsList>

          <TabsContent value="registro" className="space-y-3">
            <div className="flex flex-wrap gap-2 items-center">
              <Input placeholder="Cerca in tutti i campi…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} className="max-w-xs" />
              <Select value={groupBy} onValueChange={(v) => setGroupBy(v as typeof groupBy)}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nessun raggruppamento</SelectItem>
                  <SelectItem value="asset_type">Per tipo</SelectItem>
                  <SelectItem value="status">Per stato</SelectItem>
                  <SelectItem value="assignee">Per assegnatario</SelectItem>
                </SelectContent>
              </Select>
              {Object.values(colFilters).some(Boolean) && <Button variant="ghost" size="sm" onClick={() => setColFilters({})}>Azzera filtri</Button>}
              <span className="text-xs text-muted-foreground">{filtered.length} su {assets.length}</span>
            </div>
            {groups && (
              <div className="flex flex-wrap gap-2">
                {groups.map(([g, n]) => (
                  <Button key={g} size="sm" variant={colFilters[groupBy] === g ? "default" : "outline"} onClick={() => { setColFilters((p) => ({ ...p, [groupBy]: p[groupBy] === g ? "" : g })); setPage(0); }}>
                    {g} <Badge variant="secondary" className="ml-2">{n}</Badge>
                  </Button>
                ))}
              </div>
            )}
            <Card><CardContent className="p-0 overflow-x-auto">
              {loading ? <div className="p-10 flex justify-center"><Loader2 className="animate-spin" /></div> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      {(["internal_code", "asset_type", "model", "serial_number", "status", "assignee", "site", "supplier"] as (keyof ManagedAsset)[]).map((f) => (
                        <TableHead key={f} className="align-top min-w-[110px]">
                          <div>{label(f)}</div>
                          <Input className="h-7 mt-1 text-xs" value={colFilters[f] ?? ""} onChange={(e) => { setColFilters((p) => ({ ...p, [f]: e.target.value })); setPage(0); }} />
                        </TableHead>
                      ))}
                      <TableHead>Scadenza</TableHead>
                      <TableHead>Origine</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((a) => (
                      <TableRow key={a.id} className="cursor-pointer" onClick={() => setEditing(a)}>
                        <TableCell className="font-mono">{a.internal_code}</TableCell>
                        <TableCell>{a.asset_type}</TableCell>
                        <TableCell>{a.model}</TableCell>
                        <TableCell className="font-mono text-xs">{a.serial_number}</TableCell>
                        <TableCell>{a.status && <Badge variant="outline">{a.status}</Badge>}</TableCell>
                        <TableCell>{a.assignee}</TableCell>
                        <TableCell>{a.site}</TableCell>
                        <TableCell>{a.supplier}</TableCell>
                        <TableCell>{expiryBadge(nearestExpiry(a))}</TableCell>
                        <TableCell><Badge variant={a.source === "halo" ? "default" : "secondary"}>{a.source === "halo" ? "Halo" : "Manuale"}</Badge></TableCell>
                      </TableRow>
                    ))}
                    {!pageRows.length && <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">Nessun asset. Aggiungine uno o importa un Excel.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              )}
            </CardContent></Card>
            <div className="flex justify-end items-center gap-2 text-sm">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Indietro</Button>
              <span>{page + 1} / {pages}</span>
              <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Avanti</Button>
            </div>
          </TabsContent>

          <TabsContent value="scadenze"><ExpiryTab orgId={organizationId} assets={assets} onOpen={setEditing} /></TabsContent>
          <TabsContent value="liste"><LookupsTab orgId={organizationId} lookups={lookups} onChange={load} /></TabsContent>
          <TabsContent value="halo"><HaloTab orgId={organizationId} onSynced={load} /></TabsContent>
        </Tabs>
      </div>

      <AssetSheet
        asset={editing} lookups={lookups} onClose={() => setEditing(null)}
        onSaved={(a) => setAssets((p) => p.map((x) => (x.id === a.id ? a : x)))}
        onDeleted={(id) => { setAssets((p) => p.filter((x) => x.id !== id)); setEditing(null); }}
      />
    </DashboardLayout>
  );
}

function AssetSheet({ asset, lookups, onClose, onSaved, onDeleted }: {
  asset: ManagedAsset | null; lookups: Record<LookupKind, string[]>;
  onClose: () => void; onSaved: (a: ManagedAsset) => void; onDeleted: (id: string) => void;
}) {
  const [form, setForm] = useState<ManagedAsset | null>(asset);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [showSecret, setShowSecret] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => { setForm(asset); setStatus("idle"); setShowSecret(false); }, [asset?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (f: keyof ManagedAsset, v: unknown) => {
    if (!form) return;
    const next = { ...form, [f]: v } as ManagedAsset;
    setForm(next); setStatus("idle");
    clearTimeout(t.current);
    t.current = setTimeout(async () => {
      setStatus("saving");
      try { onSaved(await managedAssetsApi.update(next.id, next)); setStatus("saved"); } catch { setStatus("error"); }
    }, 1500);
  };

  if (!form) return null;
  const locked = (f: keyof ManagedAsset) => f === "internal_code" || (form.source === "halo" && HALO_LOCKED.has(f));

  const field = (f: keyof ManagedAsset) => {
    const lk = LOOKUP_FIELD[f];
    const lab = <Label className="text-xs">{label(f)}{required(f) && " *"}</Label>;
    if (f === "note") return <div key={f} className="col-span-2 space-y-1">{lab}<Textarea value={form.note ?? ""} onChange={(e) => set("note", e.target.value)} /></div>;
    if (lk && !locked(f)) return (
      <div key={f} className="space-y-1">{lab}
        <Select value={(form[f] as string) ?? ""} onValueChange={(v) => set(f, v)}>
          <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>{lookups[lk].map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
        </Select>
      </div>
    );
    if (f === "asset_cost") return (
      <div key={f} className="space-y-1">{lab}
        <div className="flex gap-2 items-center">
          <Input type="number" disabled={form.asset_cost_nd} value={form.asset_cost ?? ""} onChange={(e) => set("asset_cost", e.target.value === "" ? null : Number(e.target.value))} />
          <label className="flex items-center gap-1 text-xs"><Switch checked={form.asset_cost_nd} onCheckedChange={(c) => set("asset_cost_nd", c)} />N/D</label>
        </div>
      </div>
    );
    const secret = f === "pin" || f === "puk";
    return (
      <div key={f} className="space-y-1">{lab}
        <Input
          disabled={locked(f)}
          type={DATE_FIELDS.has(f) ? "date" : NUM_FIELDS.has(f) || secret ? (secret && !showSecret ? "password" : "number") : "text"}
          value={(form[f] as string | number | null) ?? ""}
          onChange={(e) => set(f, NUM_FIELDS.has(f) ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value || null)}
        />
      </div>
    );
  };

  return (
    <Sheet open={!!asset} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader>
          <div className="flex items-center justify-between gap-2">
            <SheetTitle>Asset {form.internal_code}</SheetTitle>
            {status === "saving" && <Badge variant="outline"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Salvando…</Badge>}
            {status === "saved" && <Badge variant="outline"><Check className="w-3 h-3 mr-1" />Salvato</Badge>}
            {status === "error" && <Badge variant="destructive">Errore</Badge>}
          </div>
          <SheetDescription>
            {form.source === "halo" ? "Importato da HaloPSA: i campi sincronizzati sono in sola lettura." : "Le modifiche vengono salvate automaticamente."}
          </SheetDescription>
        </SheetHeader>
        <div className="h-[calc(100vh-9rem)] overflow-y-auto pr-2 mt-4 space-y-5">
          {SECTIONS.map(([title, fields]) => (
            <div key={title} className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
                {title === "Identificazione" && (
                  <Button variant="ghost" size="sm" onClick={() => setShowSecret(!showSecret)}>
                    {showSecret ? <EyeOff className="w-3 h-3 mr-1" /> : <Eye className="w-3 h-3 mr-1" />}PIN/PUK
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">{fields.map(field)}</div>
            </div>
          ))}
          <Button variant="destructive" size="sm" onClick={async () => { await managedAssetsApi.remove(form.id); onDeleted(form.id); }}>
            <Trash2 className="w-4 h-4 mr-1" />Elimina asset
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ExpiryTab({ orgId, assets, onOpen }: { orgId: string; assets: ManagedAsset[]; onOpen: (a: ManagedAsset) => void }) {
  const [s, setS] = useState({ lead_days: 180, recipients: "", enabled: false });
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState("");
  const t = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    managedAssetsApi.expirySettings(orgId).then((d) => d && setS({ lead_days: d.lead_days, recipients: (d.recipients ?? []).join(", "), enabled: d.enabled }));
  }, [orgId]);
  const update = (p: Partial<typeof s>) => {
    const n = { ...s, ...p }; setS(n);
    clearTimeout(t.current);
    t.current = setTimeout(() => managedAssetsApi.saveExpirySettings(orgId, {
      lead_days: n.lead_days, enabled: n.enabled, recipients: n.recipients.split(/[,;\s]+/).filter(Boolean),
    }), 1500);
  };
  const end = to || new Date(Date.now() + s.lead_days * 86400000).toISOString().slice(0, 10);
  const rows = assets.flatMap((a) => [
    a.end_contract_date && { a, kind: "Fine contratto", date: a.end_contract_date },
    a.warranty_expiration && { a, kind: "Fine garanzia", date: a.warranty_expiration },
  ].filter(Boolean) as { a: ManagedAsset; kind: string; date: string }[])
    .filter((r) => r.date >= from && r.date <= end)
    .sort((x, y) => x.date.localeCompare(y.date));

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Report settimanale</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1"><Label className="text-xs">Anticipo (giorni)</Label><Input type="number" value={s.lead_days} onChange={(e) => update({ lead_days: Number(e.target.value) || 0 })} /></div>
          <div className="space-y-1"><Label className="text-xs">Destinatari email</Label><Textarea value={s.recipients} onChange={(e) => update({ recipients: e.target.value })} placeholder="nome@azienda.it, …" /></div>
          <label className="flex items-center gap-2 text-sm"><Switch checked={s.enabled} onCheckedChange={(c) => update({ enabled: c })} />Invio settimanale attivo</label>
          <p className="text-xs text-muted-foreground">L'invio email partirà quando sarà configurato il dominio mittente. Nel frattempo il report è consultabile qui.</p>
        </CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader className="flex-row flex-wrap items-center gap-2 space-y-0">
          <CardTitle className="text-base mr-auto">Scadenze ({rows.length})</CardTitle>
          <Label className="text-xs">Dal</Label><Input type="date" className="w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Label className="text-xs">Al</Label><Input type="date" className="w-40" value={end} onChange={(e) => setTo(e.target.value)} />
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Asset</TableHead><TableHead>Tipo</TableHead><TableHead>Scadenza</TableHead><TableHead>Data</TableHead><TableHead>Giorni</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={i} className="cursor-pointer" onClick={() => onOpen(r.a)}>
                  <TableCell className="font-mono">{r.a.internal_code} {r.a.model}</TableCell>
                  <TableCell>{r.a.asset_type}</TableCell>
                  <TableCell>{r.kind}</TableCell>
                  <TableCell>{new Date(r.date).toLocaleDateString("it-IT")}</TableCell>
                  <TableCell>{expiryBadge(daysUntil(r.date)) ?? daysUntil(r.date)}</TableCell>
                </TableRow>
              ))}
              {!rows.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Nessuna scadenza nel periodo.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function LookupsTab({ orgId, lookups, onChange }: { orgId: string; lookups: Record<LookupKind, string[]>; onChange: () => void }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  return (
    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
      {(Object.keys(LOOKUP_LABEL) as LookupKind[]).map((k) => (
        <Card key={k}>
          <CardHeader><CardTitle className="text-base">{LOOKUP_LABEL[k]}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {lookups[k].map((v) => (
                <Badge key={v} variant="secondary" className="gap-1">{v}
                  <button aria-label={`Rimuovi ${v}`} onClick={async () => { await managedAssetsApi.removeLookup(orgId, k, v); onChange(); }}><X className="w-3 h-3" /></button>
                </Badge>
              ))}
            </div>
            <form className="flex gap-2" onSubmit={async (e) => {
              e.preventDefault(); const v = draft[k]?.trim(); if (!v) return;
              await managedAssetsApi.addLookup(orgId, k, v); setDraft((d) => ({ ...d, [k]: "" })); onChange();
            }}>
              <Input value={draft[k] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))} placeholder="Nuovo valore" />
              <Button type="submit" size="icon" aria-label="Aggiungi"><Plus className="w-4 h-4" /></Button>
            </form>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function HaloTab({ orgId, onSynced }: { orgId: string; onSynced: () => void }) {
  const { toast } = useToast();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [link, setLink] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [assetNumberField, setAssetNumberField] = useState("");
  useEffect(() => { managedAssetsApi.haloLink(orgId).then((l) => { setLink(l); setAssetNumberField(l?.field_mapping?.asset_number ?? ""); }); }, [orgId]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); } catch (e) { toast({ title: "HaloPSA", description: (e as Error).message, variant: "destructive" }); }
    finally { setBusy(null); }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Link2 className="w-4 h-4" />Cliente Halo collegato</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {link?.halo_client_id
            ? <p className="text-sm">{link.halo_client_name} <span className="text-muted-foreground">(ID {link.halo_client_id})</span></p>
            : <p className="text-sm text-muted-foreground">Nessun collegamento: questo cliente usa la gestione asset manuale.</p>}
          <div className="flex gap-2">
            <Input placeholder="Cerca cliente in Halo" value={search} onChange={(e) => setSearch(e.target.value)} />
            <Button variant="outline" disabled={!!busy} onClick={() => run("clients", async () => setClients((await managedAssetsApi.halo("clients", orgId, search)).clients ?? []))}>
              {busy === "clients" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Cerca"}
            </Button>
          </div>
          {clients.map((c) => (
            <div key={c.id} className="flex items-center justify-between border rounded-md px-3 py-2 text-sm">
              <span>{c.name} <span className="text-muted-foreground">#{c.id}</span></span>
              <Button size="sm" onClick={() => run("link", async () => {
                await managedAssetsApi.saveHaloLink(orgId, { halo_client_id: c.id, halo_client_name: c.name });
                setLink({ ...link, halo_client_id: c.id, halo_client_name: c.name }); setClients([]);
              })}>Collega</Button>
            </div>
          ))}
          <div className="space-y-1">
            <Label className="text-xs">Campo Halo per "Asset Number" (custom field)</Label>
            <Input value={assetNumberField} placeholder="CFASAssetNumber" onChange={(e) => setAssetNumberField(e.target.value)}
              onBlur={() => managedAssetsApi.saveHaloLink(orgId, { field_mapping: { ...(link?.field_mapping ?? {}), asset_number: assetNumberField || undefined } })} />
          </div>
          {link?.halo_client_id && (
            <Button variant="ghost" size="sm" onClick={() => run("unlink", async () => { await managedAssetsApi.saveHaloLink(orgId, { halo_client_id: null, halo_client_name: null }); setLink({ ...link, halo_client_id: null }); })}>
              Scollega
            </Button>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Sincronizzazione</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Lettura da Halo verso HiConsole. Gli asset aggiunti a mano restano invariati.</p>
          {link?.last_sync_at && <p className="text-sm">Ultima: {new Date(link.last_sync_at).toLocaleString("it-IT")} — {link.last_sync_message}</p>}
          <div className="flex gap-2">
            <Button variant="outline" disabled={!!busy} onClick={() => run("test", async () => { await managedAssetsApi.halo("test"); toast({ title: "Connessione Halo riuscita" }); })}>
              {busy === "test" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Test connessione"}
            </Button>
            <Button disabled={!!busy || !link?.halo_client_id} onClick={() => run("sync", async () => {
              const r = await managedAssetsApi.halo("sync", orgId);
              toast({ title: "Sincronizzazione completata", description: `${r.total} asset` });
              setLink(await managedAssetsApi.haloLink(orgId)); onSynced();
            })}>
              {busy === "sync" ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}Sincronizza ora
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
