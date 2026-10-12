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
import { useHiTrackDashboard } from "@/hooks/useHiTrackDashboard";
import { useUserRoles } from "@/hooks/useUserRoles";
import { supabase } from "@/integrations/supabase/client";
import type { HiTrackDashboardPayload } from "@/lib/hitrack/types";
import type { AssetGroup } from "@/lib/api/managed-assets";
import {
  matchHiTrack, availabilityOf, AvailabilityDot, FlagButton, TagInput, HiTrackPanel, AVAIL_LABEL,
  type HiTrackMatch, type Availability,
} from "@/components/asset-management/AssetExtras";
import { Plus, Upload, Download, RefreshCw, Trash2, Link2, Loader2, Check, X, Eye, EyeOff } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { BulkEditBar } from "@/components/asset-management/BulkEditBar";

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
  ["Assegnazione", ["assignee", "date_of_assign", "site", "ip_address"]],
  ["Acquisto e contratto", ["purchase_type", "supplier", "contract_number", "start_contract_date", "end_contract_date", "asset_cost"]],
  ["Garanzia", ["warranty_type", "warranty_cost", "warranty_start_date", "warranty_expiration"]],
  ["Documento di trasporto", ["ddt_number", "ddt_date"]],
  ["Note", ["note"]],
];
const label = (f: keyof ManagedAsset) => ASSET_COLUMNS.find((c) => c[0] === f)?.[1] ?? (f === "ip_address" ? "Indirizzo IP" : f);
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
  const [groups, setGroups] = useState<AssetGroup[]>([]);
  const [members, setMembers] = useState<{ group_id: string; asset_id: string }[]>([]);
  const [availFilter, setAvailFilter] = useState<"all" | Availability>("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [flagOnly, setFlagOnly] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { isSuperAdmin, isSales } = useUserRoles();
  const { data: hitrack } = useHiTrackDashboard();
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null)); }, []);
  const canEdit = useCallback((a: ManagedAsset) => isSuperAdmin || isSales || a.created_by === userId || a.source === "halo", [isSuperAdmin, isSales, userId]);
  const matches = useMemo(() => matchHiTrack(assets, hitrack.monitoredDevices), [assets, hitrack.monitoredDevices]);
  const allTags = useMemo(() => [...new Set(assets.flatMap((a) => a.tags ?? []))].sort(), [assets]);
  const loadGroups = useCallback(async () => {
    if (!organizationId) return;
    const g = await managedAssetsApi.groups(organizationId);
    setGroups(g); setMembers(await managedAssetsApi.groupMembers(g.map((x) => x.id)));
  }, [organizationId]);
  useEffect(() => { loadGroups().catch(() => {}); }, [loadGroups]);
  const patchAsset = async (a: ManagedAsset, p: Partial<ManagedAsset>) => {
    const next = { ...a, ...p };
    setAssets((list) => list.map((x) => (x.id === a.id ? next : x)));
    try { await managedAssetsApi.update(a.id, next); } catch (e) { toast({ title: "Errore", description: (e as Error).message, variant: "destructive" }); }
  };

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
      .filter((a) => availFilter === "all" || (matches.has(a.id) && availabilityOf(matches.get(a.id)!.device) === availFilter))
      .filter((a) => groupFilter === "all" || members.some((m) => m.group_id === groupFilter && m.asset_id === a.id))
      .filter((a) => tagFilter === "all" || (a.tags ?? []).includes(tagFilter))
      .filter((a) => !flagOnly || !!a.flag_color)
      .sort((x, y) => {
        const ex = nearestExpiry(x), ey = nearestExpiry(y);
        const sx = ex !== null && ex <= 180 ? ex : 1e9, sy = ey !== null && ey <= 180 ? ey : 1e9;
        return sx - sy || Number(!!y.flag_color) - Number(!!x.flag_color) || x.internal_code.localeCompare(y.internal_code);
      });
  }, [assets, search, colFilters, availFilter, groupFilter, tagFilter, flagOnly, matches, members]);

  const stats = useMemo(() => ({
    total: assets.length,
    assigned: assets.filter((a) => a.status === "Assigned").length,
    available: assets.filter((a) => a.status === "Available" || a.status === "New").length,
    attention: assets.filter((a) => ["To be repaired", "To be disposed of", "Stolen"].includes(a.status ?? "")).length,
    value: assets.reduce((s, a) => s + (a.asset_cost_nd ? 0 : Number(a.asset_cost ?? 0)), 0),
    expiring: assets.filter((a) => { const d = nearestExpiry(a); return d !== null && d <= 180; }).length,
  }), [assets]);

  const buckets = useMemo(() => {
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
            <TabsTrigger value="gruppi">Gruppi</TabsTrigger>
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
              {matches.size > 0 && (
                <Select value={availFilter} onValueChange={(v) => { setAvailFilter(v as typeof availFilter); setPage(0); }}>
                  <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Ogni disponibilità</SelectItem>
                    {(["up", "warn", "down", "unknown"] as Availability[]).map((k) => <SelectItem key={k} value={k}>{AVAIL_LABEL[k]}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              {groups.length > 0 && (
                <Select value={groupFilter} onValueChange={(v) => { setGroupFilter(v); setPage(0); }}>
                  <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tutti i gruppi</SelectItem>
                    {groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              {allTags.length > 0 && (
                <Select value={tagFilter} onValueChange={(v) => { setTagFilter(v); setPage(0); }}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tutti i tag</SelectItem>
                    {allTags.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              <label className="flex items-center gap-2 text-sm"><Switch checked={flagOnly} onCheckedChange={(c) => { setFlagOnly(c); setPage(0); }} />Solo con flag</label>
              {Object.values(colFilters).some(Boolean) && <Button variant="ghost" size="sm" onClick={() => setColFilters({})}>Azzera filtri</Button>}
              <span className="text-xs text-muted-foreground">{filtered.length} su {assets.length}</span>
            </div>
            {buckets && (
              <div className="flex flex-wrap gap-2">
                {buckets.map(([g, n]) => (
                  <Button key={g} size="sm" variant={colFilters[groupBy] === g ? "default" : "outline"} onClick={() => { setColFilters((p) => ({ ...p, [groupBy]: p[groupBy] === g ? "" : g })); setPage(0); }}>
                    {g} <Badge variant="secondary" className="ml-2">{n}</Badge>
                  </Button>
                ))}
              </div>
            )}
            <BulkEditBar
              selected={assets.filter((a) => selectedIds.has(a.id))}
              assignees={[...new Set([...lookups.assignee, ...assets.map((a) => a.assignee).filter((x): x is string => !!x)])].sort()}
              sites={[...new Set(assets.map((a) => a.site).filter((x): x is string => !!x))].sort()}
              allTags={allTags} groups={groups} canEdit={canEdit}
              onDone={async () => { await Promise.all([load(), loadGroups()]); }}
              onClear={() => setSelectedIds(new Set())}
              notify={(title, description, error) => toast({ title, description, variant: error ? "destructive" : undefined })}
            />
            <Card><CardContent className="p-0 overflow-x-auto">
              {loading ? <div className="p-10 flex justify-center"><Loader2 className="animate-spin" /></div> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8 align-top">
                        <Checkbox aria-label="Seleziona tutti i filtrati" className="mt-1"
                          checked={filtered.length > 0 && filtered.every((a) => selectedIds.has(a.id))}
                          onCheckedChange={(v) => setSelectedIds((s) => { const n = new Set(s); filtered.forEach((a) => (v ? n.add(a.id) : n.delete(a.id))); return n; })} />
                      </TableHead>
                      <TableHead className="w-8" />
                      <TableHead className="align-top min-w-[140px]">
                        <div>Nome</div>
                        <Input className="h-7 mt-1 text-xs" value={colFilters.name ?? ""} onChange={(e) => { setColFilters((p) => ({ ...p, name: e.target.value })); setPage(0); }} />
                      </TableHead>
                      {(["internal_code", "asset_type", "model", "serial_number", "status", "assignee", "site", "supplier"] as (keyof ManagedAsset)[]).map((f) => (
                        <TableHead key={f} className="align-top min-w-[110px]">
                          <div>{label(f)}</div>
                          <Input className="h-7 mt-1 text-xs" value={colFilters[f] ?? ""} onChange={(e) => { setColFilters((p) => ({ ...p, [f]: e.target.value })); setPage(0); }} />
                        </TableHead>
                      ))}
                      <TableHead>Disponibilità</TableHead>
                      <TableHead>Scadenza</TableHead>
                      <TableHead>Origine</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((a) => (
                      <TableRow key={a.id} data-state={selectedIds.has(a.id) ? "selected" : undefined}>
                        <TableCell><Checkbox aria-label={`Seleziona ${a.name ?? a.internal_code}`} checked={selectedIds.has(a.id)} onCheckedChange={() => setSelectedIds((s) => { const n = new Set(s); n.has(a.id) ? n.delete(a.id) : n.add(a.id); return n; })} /></TableCell>
                        <TableCell><FlagButton color={a.flag_color} note={a.flag_note} disabled={!canEdit(a)} onChange={(c, n) => patchAsset(a, { flag_color: c, flag_note: n })} /></TableCell>
                        <TableCell>
                          <button className="text-left font-medium text-primary hover:underline" onClick={() => setEditing(a)}>{a.name || a.model || `Asset ${a.internal_code}`}</button>
                          {(a.tags ?? []).length > 0 && <div className="flex flex-wrap gap-1 mt-1">{a.tags.map((t) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}</div>}
                        </TableCell>
                        <TableCell className="font-mono">{a.internal_code}</TableCell>
                        <TableCell>{a.asset_type}</TableCell>
                        <TableCell>{a.model}</TableCell>
                        <TableCell className="font-mono text-xs">{a.serial_number}</TableCell>
                        <TableCell>{a.status && <Badge variant="outline">{a.status}</Badge>}</TableCell>
                        <TableCell>{a.assignee}</TableCell>
                        <TableCell>{a.site}</TableCell>
                        <TableCell>{a.supplier}</TableCell>
                        <TableCell>{matches.has(a.id) ? <AvailabilityDot device={matches.get(a.id)!.device} /> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                        <TableCell>{expiryBadge(nearestExpiry(a))}</TableCell>
                        <TableCell className="space-x-1 whitespace-nowrap">
                          <Badge variant={a.source === "halo" ? "default" : "secondary"}>{a.source === "halo" ? "Halo" : "Manuale"}</Badge>
                          {matches.has(a.id) && <Badge variant="outline">HiTrack</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                    {!pageRows.length && <TableRow><TableCell colSpan={14} className="text-center text-muted-foreground py-8">Nessun asset. Aggiungine uno o importa un Excel.</TableCell></TableRow>}
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
          <TabsContent value="gruppi"><GroupsTab orgId={organizationId} groups={groups} members={members} onChange={loadGroups} /></TabsContent>
          <TabsContent value="liste"><LookupsTab orgId={organizationId} lookups={lookups} onChange={load} /></TabsContent>
          <TabsContent value="halo"><HaloTab orgId={organizationId} onSynced={load} /></TabsContent>
        </Tabs>
      </div>

      <AssetSheet
        asset={editing} lookups={lookups} onClose={() => setEditing(null)}
        readOnly={!!editing && !canEdit(editing)} allTags={allTags} hitrack={hitrack}
        match={editing ? matches.get(editing.id) : undefined}
        groups={groups} members={members} onMembersChange={loadGroups}
        onSaved={(a) => setAssets((p) => p.map((x) => (x.id === a.id ? a : x)))}
        onDeleted={(id) => { setAssets((p) => p.filter((x) => x.id !== id)); setEditing(null); }}
      />
    </DashboardLayout>
  );
}

function AssetSheet({ asset, lookups, onClose, onSaved, onDeleted, readOnly, allTags, hitrack, match, groups, members, onMembersChange }: {
  asset: ManagedAsset | null; lookups: Record<LookupKind, string[]>;
  readOnly: boolean; allTags: string[]; hitrack: HiTrackDashboardPayload; match?: HiTrackMatch;
  groups: AssetGroup[]; members: { group_id: string; asset_id: string }[]; onMembersChange: () => void;
  onClose: () => void; onSaved: (a: ManagedAsset) => void; onDeleted: (id: string) => void;
}) {
  const [form, setForm] = useState<ManagedAsset | null>(asset);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [showSecret, setShowSecret] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => { setForm(asset); setStatus("idle"); setShowSecret(false); }, [asset?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const formRef = useRef(form); formRef.current = form;
  const setMany = (p: Partial<ManagedAsset>) => {
    if (!formRef.current) return;
    const next = { ...formRef.current, ...p } as ManagedAsset;
    formRef.current = next;
    setForm(next); setStatus("idle");
    clearTimeout(t.current);
    t.current = setTimeout(async () => {
      setStatus("saving");
      try { onSaved(await managedAssetsApi.update(next.id, next)); setStatus("saved"); } catch { setStatus("error"); }
    }, 1500);
  };
  const set = (f: keyof ManagedAsset, v: unknown) => setMany({ [f]: v } as Partial<ManagedAsset>);

  if (!form) return null;
  const locked = (f: keyof ManagedAsset) => readOnly || f === "internal_code" || (form.source === "halo" && HALO_LOCKED.has(f));

  const field = (f: keyof ManagedAsset) => {
    const lk = LOOKUP_FIELD[f];
    const lab = <Label className="text-xs">{label(f)}{required(f) && " *"}</Label>;
    if (f === "note") return <div key={f} className="col-span-2 space-y-1">{lab}<Textarea disabled={readOnly} value={form.note ?? ""} onChange={(e) => set("note", e.target.value)} /></div>;
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
          <Input type="number" disabled={readOnly || form.asset_cost_nd} value={form.asset_cost ?? ""} onChange={(e) => set("asset_cost", e.target.value === "" ? null : Number(e.target.value))} />
          <label className="flex items-center gap-1 text-xs"><Switch disabled={readOnly} checked={form.asset_cost_nd} onCheckedChange={(c) => set("asset_cost_nd", c)} />N/D</label>
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
            {readOnly ? "Sola lettura: puoi modificare solo gli asset creati da te." : form.source === "halo" ? "Importato da HaloPSA: i campi sincronizzati sono in sola lettura." : "Le modifiche vengono salvate automaticamente."}
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
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tag, gruppi e flag</p>
            <TagInput value={form.tags ?? []} suggestions={allTags} disabled={readOnly} onChange={(v) => set("tags", v)} />
            {groups.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {groups.map((g) => {
                  const on = members.some((m) => m.group_id === g.id && m.asset_id === form.id);
                  return (
                    <Button key={g.id} size="sm" variant={on ? "default" : "outline"}
                      onClick={async () => { await managedAssetsApi.setMembership(g.id, form.id, !on); onMembersChange(); }}>{g.name}</Button>
                  );
                })}
              </div>
            )}
            <div className="flex items-center gap-2 text-sm">
              <FlagButton color={form.flag_color} note={form.flag_note} disabled={readOnly}
                onChange={(c, n) => setMany({ flag_color: c, flag_note: n })} />
              {form.flag_color ? (form.flag_note || "Flag attivo") : <span className="text-muted-foreground">Nessun flag</span>}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">HiTrack</p>
            <HiTrackPanel match={match} data={hitrack} asset={form} disabled={readOnly}
              onLink={(id, mode) => setMany({ hitrack_device_id: id, hitrack_link_mode: mode })} />
          </div>
          {!readOnly && <Button variant="destructive" size="sm" onClick={async () => { await managedAssetsApi.remove(form.id); onDeleted(form.id); }}>
            <Trash2 className="w-4 h-4 mr-1" />Elimina asset
          </Button>}
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

function GroupsTab({ orgId, groups, members, onChange }: {
  orgId: string; groups: AssetGroup[]; members: { group_id: string; asset_id: string }[]; onChange: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const run = async (fn: () => Promise<void>) => {
    try { await fn(); onChange(); } catch (e) { toast({ title: "Errore", description: (e as Error).message, variant: "destructive" }); }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">I miei gruppi</CardTitle>
        <p className="text-sm text-muted-foreground">I gruppi sono personali: li vedi solo tu. Aggiungi gli asset ai gruppi dalla scheda asset.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <form className="flex gap-2 max-w-md" onSubmit={(e) => { e.preventDefault(); const n = name.trim(); if (n) run(async () => { await managedAssetsApi.createGroup(orgId, n); setName(""); }); }}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome nuovo gruppo" />
          <Button type="submit"><Plus className="w-4 h-4 mr-1" />Crea</Button>
        </form>
        {groups.map((g) => (
          <div key={g.id} className="flex items-center gap-2 max-w-md">
            <Input defaultValue={g.name} onBlur={(e) => { const n = e.target.value.trim(); if (n && n !== g.name) run(() => managedAssetsApi.renameGroup(g.id, n)); }} />
            <Badge variant="secondary">{members.filter((m) => m.group_id === g.id).length} asset</Badge>
            <Button variant="ghost" size="icon" aria-label={`Elimina ${g.name}`} onClick={() => run(() => managedAssetsApi.deleteGroup(g.id))}><Trash2 className="w-4 h-4" /></Button>
          </div>
        ))}
        {!groups.length && <p className="text-sm text-muted-foreground">Nessun gruppo creato.</p>}
      </CardContent>
    </Card>
  );
}
