import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
import { Checkbox } from "@/components/ui/checkbox";
import { useClientOrganization } from "@/hooks/useClientOrganization";
import { usePermissions } from "@/hooks/usePermissions";
import { useModuleAccess } from "@/hooks/useModuleAccess";
import { getErrorDetail } from "@/lib/api-client";
import {
  managedAssetsApi, ASSET_COLUMNS, SYNCED_FIELDS, nearestExpiry, daysUntil, availabilityOf, assetDisplayName, isSyncedFromGestionale,
  type ManagedAsset, type AssetPatch, type AssetLookups, type AssetCollection, type LookupKind, type Availability,
} from "@/lib/api/managed-assets";
import { AvailabilityDot, FlagButton, TagInput, HiTrackPanel, AVAIL_LABEL } from "@/components/asset-management/AssetExtras";
import { BulkEditBar } from "@/components/asset-management/BulkEditBar";
import { ASSET_TABLE_COLUMNS, ResizableAssetHeader } from "@/components/asset-management/ResizableAssetHeader";
import { Plus, Upload, Download, Trash2, Loader2, Check, X, Eye } from "lucide-react";

const PAGE = 15;
type Field = keyof ManagedAsset | "pin" | "puk";
const DATE_FIELDS = new Set<Field>(["date_of_assign", "start_contract_date", "end_contract_date", "warranty_start_date", "warranty_expiration", "ddt_date"]);
const NUM_FIELDS = new Set<Field>(["asset_cost", "warranty_cost"]);
const LOOKUP_FIELD: Partial<Record<Field, LookupKind>> = {
  asset_type: "asset_type", status: "status", purchase_type: "purchase_type", supplier: "supplier", assignee: "assignee",
};
const LOOKUP_LABEL: Record<LookupKind, string> = {
  asset_type: "Tipo asset", status: "Stato", purchase_type: "Tipo acquisto", supplier: "Fornitori", assignee: "Assegnatari",
};
const EMPTY_LOOKUPS: AssetLookups = { asset_type: [], status: [], purchase_type: [], supplier: [], assignee: [] };
const SECTIONS: [string, Field[]][] = [
  ["Identificazione", ["internal_code", "asset_number", "asset_type", "model", "name", "serial_number", "status", "status_cliente", "pin", "puk"]],
  ["Assegnazione", ["assignee", "date_of_assign", "site", "ip_address"]],
  ["Acquisto e contratto", ["purchase_type", "supplier", "contract_number", "start_contract_date", "end_contract_date", "asset_cost"]],
  ["Garanzia", ["warranty_type", "warranty_cost", "warranty_start_date", "warranty_expiration"]],
  ["Documento di trasporto", ["ddt_number", "ddt_date"]],
  ["Note", ["note"]],
];
const label = (f: Field) => ASSET_COLUMNS.find((c) => c[0] === f)?.[1] ?? (f === "ip_address" ? "Indirizzo IP" : f);
const required = (f: Field) => !!ASSET_COLUMNS.find((c) => c[0] === f)?.[2];
const eur = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const notify = (title: string, description: string, error?: boolean) => (error ? toast.error(title, { description }) : toast.success(title, { description }));

const expiryBadge = (d: number | null, lead: number) => {
  if (d === null) return null;
  if (d < 0) return <Badge variant="destructive">Scaduto</Badge>;
  if (d <= 30) return <Badge variant="destructive">{d} gg</Badge>;
  if (d <= lead) return <Badge variant="outline" className="border-cyber-orange text-cyber-orange">{d} gg</Badge>;
  return null;
};

export default function AssetManagement() {
  const { organizationId, groupId, selectedOrganization } = useClientOrganization();
  const { hasCapability, bypass } = usePermissions();
  const { isServiceActive } = useModuleAccess();
  const queryClient = useQueryClient();
  const canWrite = bypass || hasCapability("assetmanagement.edit");

  const key = (what: string) => ["asset-management", what, organizationId, groupId];
  const enabled = !!organizationId;
  const assetsQ = useQuery({ queryKey: key("assets"), queryFn: () => managedAssetsApi.list(organizationId!, groupId), enabled });
  const lookupsQ = useQuery({ queryKey: key("lookups"), queryFn: () => managedAssetsApi.lookups(organizationId!, groupId), enabled });
  const groupsQ = useQuery({ queryKey: key("collections"), queryFn: () => managedAssetsApi.collections(organizationId!, groupId), enabled });
  const expiryQ = useQuery({ queryKey: key("expiry"), queryFn: () => managedAssetsApi.expiry(organizationId!, groupId), enabled });

  const assets = useMemo(() => assetsQ.data ?? [], [assetsQ.data]);
  const lookups = lookupsQ.data ?? EMPTY_LOOKUPS;
  const groups = useMemo(() => groupsQ.data ?? [], [groupsQ.data]);
  const leadDays = expiryQ.data?.leadDays ?? 180;

  const [search, setSearch] = useState("");
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const tableWidth = 88 + ASSET_TABLE_COLUMNS.reduce((total, column) => total + (columnWidths[column.key] ?? column.width), 0);
  const [groupBy, setGroupBy] = useState<"none" | "asset_type" | "status" | "assignee">("none");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<ManagedAsset | "new" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"import" | "export" | null>(null);
  const [availFilter, setAvailFilter] = useState<"all" | Availability>("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [flagOnly, setFlagOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Cambio cliente: selezione, pagina e scheda aperta erano dell'altro
  useEffect(() => { setSelectedIds(new Set()); setPage(0); setEditing(null); }, [organizationId]);

  const putAsset = (a: ManagedAsset) => {
    queryClient.setQueryData<ManagedAsset[]>(key("assets"), (list = []) =>
      list.some((x) => x.id === a.id) ? list.map((x) => (x.id === a.id ? a : x)) : [...list, a]);
    // La scheda aperta segue l'asset salvato; quella di un asset nuovo passa a quello appena creato
    setEditing((e) => (e === "new" || e?.id === a.id ? a : e));
  };
  const reload = (what: string) => queryClient.invalidateQueries({ queryKey: key(what) });

  const patchAsset = async (a: ManagedAsset, p: AssetPatch) => {
    try { putAsset(await managedAssetsApi.update(organizationId!, groupId, a.id, p)); }
    catch (e) { notify("Errore", getErrorDetail(e), true); }
  };

  const allTags = useMemo(() => [...new Set(assets.flatMap((a) => a.tags ?? []))].sort(), [assets]);
  const hasHiTrack = useMemo(() => assets.some((a) => a.hitrack), [assets]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const inGroup = groupFilter === "all" ? null : new Set(groups.find((g) => g.id === groupFilter)?.assetIds ?? []);
    return assets
      .filter((a) => !q || ASSET_COLUMNS.some(([f]) => f !== "pin" && f !== "puk" && String(a[f as keyof ManagedAsset] ?? "").toLowerCase().includes(q)) || (a.ip_address ?? "").includes(q))
      .filter((a) => Object.entries(colFilters).every(([f, v]) => !v || String(a[f as keyof ManagedAsset] ?? "").toLowerCase().includes(v.toLowerCase())))
      .filter((a) => availFilter === "all" || (a.hitrack && availabilityOf(a.hitrack) === availFilter))
      .filter((a) => !inGroup || inGroup.has(a.id))
      .filter((a) => tagFilter === "all" || (a.tags ?? []).includes(tagFilter))
      .filter((a) => !flagOnly || !!a.flag_color)
      .sort((x, y) => {
        const ex = nearestExpiry(x), ey = nearestExpiry(y);
        const sx = ex !== null && ex <= leadDays ? ex : 1e9, sy = ey !== null && ey <= leadDays ? ey : 1e9;
        return sx - sy || Number(!!y.flag_color) - Number(!!x.flag_color) || x.internal_code.localeCompare(y.internal_code);
      });
  }, [assets, search, colFilters, availFilter, groupFilter, tagFilter, flagOnly, groups, leadDays]);

  const stats = useMemo(() => ({
    total: assets.length,
    assigned: assets.filter((a) => a.status === "Assigned").length,
    available: assets.filter((a) => a.status === "Available" || a.status === "New").length,
    attention: assets.filter((a) => ["To be repaired", "To be disposed of", "Stolen"].includes(a.status ?? "")).length,
    value: assets.reduce((s, a) => s + (a.asset_cost_nd ? 0 : Number(a.asset_cost ?? 0)), 0),
    expiring: assets.filter((a) => { const d = nearestExpiry(a); return d !== null && d <= leadDays; }).length,
  }), [assets, leadDays]);

  const buckets = useMemo(() => {
    if (groupBy === "none") return null;
    const m = new Map<string, number>();
    filtered.forEach((a) => m.set(String(a[groupBy] ?? "—"), (m.get(String(a[groupBy] ?? "—")) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [filtered, groupBy]);

  const pageRows = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));

  const exportXlsx = async () => {
    setBusy("export");
    try {
      const blob = await managedAssetsApi.exportXlsx(organizationId!, groupId);
      const url = URL.createObjectURL(blob);
      const link = Object.assign(document.createElement("a"), {
        href: url, download: `Asset_${selectedOrganization?.name ?? "cliente"}_${new Date().toISOString().slice(0, 10)}.xlsx`,
      });
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) { notify("Export non riuscito", getErrorDetail(e), true); }
    finally { setBusy(null); }
  };

  const importXlsx = async (file: File) => {
    setBusy("import");
    try {
      const r = await managedAssetsApi.importXlsx(organizationId!, groupId, file);
      const righe = r.errors.slice(0, 3).map((e) => `riga ${e.row}: ${e.message}`).join(" · ");
      notify(
        "Import completato",
        `${r.created} creati, ${r.updated} aggiornati${r.skipped ? `, ${r.skipped} saltati` : ""}${righe ? ` — ${righe}` : ""}`,
        r.skipped > 0 && r.created + r.updated === 0,
      );
      reload("assets"); reload("lookups");
    } catch (e) { notify("Import fallito", getErrorDetail(e), true); }
    finally { setBusy(null); }
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
            {canWrite && <Button onClick={() => setEditing("new")}><Plus className="w-4 h-4 mr-1" />Nuovo asset</Button>}
            {canWrite && (
              <Button variant="outline" disabled={!!busy} onClick={() => fileRef.current?.click()}>
                {busy === "import" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}Importa Excel
              </Button>
            )}
            <Button variant="outline" disabled={!!busy} onClick={exportXlsx}>
              {busy === "export" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}Esporta Excel
            </Button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importXlsx(f); e.target.value = ""; }} />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {[["Totale", stats.total], ["Assegnati", stats.assigned], ["Disponibili", stats.available], ["Da riparare/dismettere", stats.attention], ["Valore totale", eur(stats.value)], [`Scadenze ≤${leadDays} gg`, stats.expiring]].map(([l, v]) => (
            <Card key={l as string}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{l}</p><p className="text-xl font-semibold">{v}</p></CardContent></Card>
          ))}
        </div>

        <Tabs defaultValue="registro">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="registro">Registro</TabsTrigger>
            <TabsTrigger value="scadenze">Scadenze</TabsTrigger>
            <TabsTrigger value="gruppi">Gruppi</TabsTrigger>
            <TabsTrigger value="liste">Liste</TabsTrigger>
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
              {hasHiTrack && (
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
              orgId={organizationId} groupId={groupId} selectedIds={[...selectedIds]} canWrite={canWrite}
              assignees={[...new Set([...lookups.assignee, ...assets.map((a) => a.assignee).filter((x): x is string => !!x)])].sort()}
              sites={[...new Set(assets.map((a) => a.site).filter((x): x is string => !!x))].sort()}
              allTags={allTags} groups={groups}
              onDone={async () => { await Promise.all([reload("assets"), reload("collections")]); }}
              onClear={() => setSelectedIds(new Set())}
              notify={notify}
            />
            <Card><CardContent className="p-0 overflow-x-auto">
              {assetsQ.isLoading ? <div className="p-10 flex justify-center"><Loader2 className="animate-spin" /></div> : (
                <Table className="table-fixed [&_td]:overflow-hidden [&_td]:px-3 [&_td]:py-3 [&_td]:break-words" style={{ width: tableWidth, minWidth: tableWidth }}>
                  <colgroup>
                    <col style={{ width: 44 }} /><col style={{ width: 44 }} />
                    {ASSET_TABLE_COLUMNS.map((column) => <col key={column.key} style={{ width: columnWidths[column.key] ?? column.width }} />)}
                  </colgroup>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="w-11 px-3 pt-4 align-top">
                        <Checkbox aria-label="Seleziona tutti i filtrati"
                          checked={filtered.length > 0 && filtered.every((a) => selectedIds.has(a.id))}
                          onCheckedChange={(v) => setSelectedIds((s) => { const n = new Set(s); filtered.forEach((a) => (v ? n.add(a.id) : n.delete(a.id))); return n; })} />
                      </TableHead>
                      <TableHead className="w-11" />
                      {ASSET_TABLE_COLUMNS.map((column) => (
                        <ResizableAssetHeader key={column.key} title={column.title}
                          width={columnWidths[column.key] ?? column.width} defaultWidth={column.width}
                          filter={colFilters[column.key] ?? ""}
                          onFilter={"unfiltered" in column ? undefined : (value) => { setColFilters((p) => ({ ...p, [column.key]: value })); setPage(0); }}
                          onResize={(width) => setColumnWidths((previous) => ({ ...previous, [column.key]: width }))}
                        />
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((a) => (
                      <TableRow key={a.id} data-state={selectedIds.has(a.id) ? "selected" : undefined}>
                        <TableCell><Checkbox aria-label={`Seleziona ${assetDisplayName(a)}`} checked={selectedIds.has(a.id)} onCheckedChange={() => setSelectedIds((s) => { const n = new Set(s); if (n.has(a.id)) n.delete(a.id); else n.add(a.id); return n; })} /></TableCell>
                        <TableCell><FlagButton key={`${a.id}-${a.flag_note ?? ""}`} color={a.flag_color} note={a.flag_note} disabled={!a.can_edit} onChange={(c, n) => patchAsset(a, { flag_color: c, flag_note: n })} /></TableCell>
                        <TableCell>
                          <Button variant="link" className="h-auto max-w-full justify-start whitespace-normal p-0 text-left font-medium" onClick={() => setEditing(a)}>{assetDisplayName(a)}</Button>
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
                        <TableCell>{a.hitrack ? <AvailabilityDot match={a.hitrack} /> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                        <TableCell>{expiryBadge(nearestExpiry(a), leadDays)}</TableCell>
                        <TableCell className="space-x-1 whitespace-nowrap">
                          {a.source !== "halo" ? <Badge variant="secondary">Manuale</Badge>
                            : a.halo_removed_at ? <Badge variant="outline" title="Non c'è più nel gestionale: si può modificare ed eliminare">Non più nel gestionale</Badge>
                            : <Badge>Gestionale</Badge>}
                          {a.hitrack && <Badge variant="outline">HiTrack</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                    {!pageRows.length && <TableRow><TableCell colSpan={14} className="text-center text-muted-foreground py-8">{assets.length ? "Nessun asset corrisponde ai filtri." : "Nessun asset. Aggiungine uno o importa un Excel."}</TableCell></TableRow>}
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

          <TabsContent value="scadenze">
            <ExpiryTab orgId={organizationId} groupId={groupId} assets={assets} leadDays={leadDays} canWrite={canWrite} onOpen={setEditing} onSaved={() => reload("expiry")} />
          </TabsContent>
          <TabsContent value="gruppi"><GroupsTab orgId={organizationId} groupId={groupId} groups={groups} onChange={() => reload("collections")} /></TabsContent>
          <TabsContent value="liste">
            <LookupsTab orgId={organizationId} groupId={groupId} lookups={lookups} canWrite={canWrite}
              onChange={(l) => queryClient.setQueryData(key("lookups"), l)} />
          </TabsContent>
        </Tabs>
      </div>

      <AssetSheet
        orgId={organizationId} groupId={groupId}
        asset={editing} lookups={lookups} onClose={() => setEditing(null)}
        allTags={allTags} hitrackActive={isServiceActive("hitrack")}
        groups={groups} onGroupsChange={() => reload("collections")}
        onSaved={putAsset}
        onDeleted={(id) => {
          queryClient.setQueryData<ManagedAsset[]>(key("assets"), (list = []) => list.filter((x) => x.id !== id));
          setEditing(null);
        }}
      />
    </DashboardLayout>
  );
}

/**
 * La scheda di un asset. Le modifiche partono da sole dopo un attimo, solo i
 * campi cambiati. Un asset nuovo si crea con il pulsante: il server vuole
 * almeno nome, asset number, seriale o modello.
 */
function AssetSheet({ orgId, groupId, asset, lookups, onClose, onSaved, onDeleted, allTags, hitrackActive, groups, onGroupsChange }: {
  orgId: string; groupId: string | null;
  asset: ManagedAsset | "new" | null; lookups: AssetLookups;
  allTags: string[]; hitrackActive: boolean;
  groups: AssetCollection[]; onGroupsChange: () => void;
  onClose: () => void; onSaved: (a: ManagedAsset) => void; onDeleted: (id: string) => void;
}) {
  const isNew = asset === "new";
  const current = isNew ? null : asset;
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [secrets, setSecrets] = useState<{ pin: string | null; puk: string | null } | null>(null);
  const pending = useRef<AssetPatch>({});
  const t = useRef<ReturnType<typeof setTimeout>>();

  const devicesQ = useQuery({
    queryKey: ["asset-management", "hitrack-devices", orgId, groupId],
    queryFn: () => managedAssetsApi.hitrackDevices(orgId, groupId),
    enabled: !!current,
    staleTime: 5 * 60_000,
  });

  const flush = async () => {
    clearTimeout(t.current);
    const p = pending.current;
    if (!current || !Object.keys(p).length) return;
    pending.current = {};
    setStatus("saving");
    try {
      const a = await managedAssetsApi.update(orgId, groupId, current.id, p);
      onSaved(a); setStatus("saved"); setError(null);
      // Cambiando l'assegnatario la data la mette il server
      if ("assignee" in p && !("date_of_assign" in p)) setForm((f) => ({ ...f, date_of_assign: a.date_of_assign }));
      if ("pin" in p || "puk" in p) setSecrets((s) => (s ? { pin: "pin" in p ? p.pin ?? null : s.pin, puk: "puk" in p ? p.puk ?? null : s.puk } : s));
    }
    catch (e) { setStatus("error"); setError(getErrorDetail(e)); }
  };

  // Un'altra scheda: si salva quel che resta della precedente e si riparte
  const id = isNew ? "new" : current?.id;
  useEffect(() => {
    setForm(isNew ? { status: "New", asset_cost_nd: false, tags: [] } : { ...(current ?? {}) });
    setStatus("idle"); setError(null); setSecrets(null); pending.current = {};
    return () => { void flush(); };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!asset) return null;
  const readOnly = !isNew && !current?.can_edit;
  const halo = !!current && isSyncedFromGestionale(current);
  const locked = (f: Field) => readOnly || f === "internal_code" || (halo && SYNCED_FIELDS.has(f));

  const setMany = (p: AssetPatch) => {
    setForm((f) => ({ ...f, ...p }));
    if (isNew) return;
    pending.current = { ...pending.current, ...p };
    setStatus("idle");
    clearTimeout(t.current);
    t.current = setTimeout(flush, 1200);
  };
  const set = (f: Field, v: unknown) => setMany({ [f]: v } as AssetPatch);

  const create = async () => {
    setStatus("saving");
    try {
      const a = await managedAssetsApi.create(orgId, groupId, form as AssetPatch);
      onSaved(a); setStatus("saved"); setError(null);
    } catch (e) { setStatus("error"); setError(getErrorDetail(e)); }
  };

  const reveal = async () => {
    if (!current) return;
    try { setSecrets(await managedAssetsApi.secrets(orgId, groupId, current.id)); }
    catch (e) { toast.error("PIN/PUK non disponibili", { description: getErrorDetail(e) }); }
  };

  const link = async (mode: "manual" | "none" | "auto", deviceId?: string) => {
    if (!current) return;
    try { onSaved(await managedAssetsApi.hitrackLink(orgId, groupId, current.id, mode, deviceId)); }
    catch (e) { toast.error("Collegamento non riuscito", { description: getErrorDetail(e) }); }
  };

  const toggleGroup = async (g: AssetCollection, on: boolean) => {
    if (!current) return;
    try { await managedAssetsApi.updateCollectionAssets(orgId, groupId, g.id, on ? { remove: [current.id] } : { add: [current.id] }); onGroupsChange(); }
    catch (e) { toast.error("Errore", { description: getErrorDetail(e) }); }
  };

  const remove = async () => {
    if (!current || !window.confirm(`Eliminare l'asset ${current.internal_code}?`)) return;
    try { await managedAssetsApi.remove(orgId, groupId, current.id); onDeleted(current.id); }
    catch (e) { toast.error("Eliminazione non riuscita", { description: getErrorDetail(e) }); }
  };

  const field = (f: Field) => {
    const lk = LOOKUP_FIELD[f];
    const lab = <Label className="text-xs">{label(f)}{required(f) && " *"}</Label>;
    const value = form[f];
    if (f === "internal_code" && isNew) return null;
    if (f === "note") return <div key={f} className="col-span-2 space-y-1">{lab}<Textarea disabled={readOnly} value={(value as string) ?? ""} onChange={(e) => set("note", e.target.value)} /></div>;
    if (lk && !locked(f)) {
      // Un valore che non è più nella lista resta selezionabile per l'asset che lo ha
      const options = value && !lookups[lk].includes(value as string) ? [value as string, ...lookups[lk]] : lookups[lk];
      return (
        <div key={f} className="space-y-1">{lab}
          <Select value={(value as string) ?? ""} onValueChange={(v) => set(f, v)}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>{options.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      );
    }
    if (f === "asset_cost") return (
      <div key={f} className="space-y-1">{lab}
        <div className="flex gap-2 items-center">
          <Input type="number" min={0} step="0.01" disabled={readOnly || !!form.asset_cost_nd} value={(value as string | number) ?? ""} onChange={(e) => set("asset_cost", e.target.value === "" ? null : Number(e.target.value))} />
          <label className="flex items-center gap-1 text-xs"><Switch disabled={readOnly} checked={!!form.asset_cost_nd} onCheckedChange={(c) => set("asset_cost_nd", c)} />N/D</label>
        </div>
      </div>
    );
    if (f === "pin" || f === "puk") {
      const presente = !!current?.[f === "pin" ? "has_pin" : "has_puk"];
      const mostrato = secrets?.[f] ?? null;
      return (
        <div key={f} className="space-y-1">{lab}
          {/* Mai type="password": Chrome prenderebbe la scheda per un login e ci
              scriverebbe email e password salvate (Status Cliente e PIN), che
              l'autosalvataggio poi registra. Si maschera con il CSS. */}
          <Input
            disabled={readOnly} autoComplete="off" data-1p-ignore data-lpignore="true" data-form-type="other"
            type="text" inputMode="numeric"
            style={secrets ? undefined : ({ WebkitTextSecurity: "disc" } as React.CSSProperties)}
            placeholder={presente && !secrets ? "•••• impostato" : ""}
            value={(value as string | undefined) ?? mostrato ?? ""}
            onChange={(e) => set(f, e.target.value || null)}
          />
        </div>
      );
    }
    return (
      <div key={f} className="space-y-1">{lab}
        <Input
          disabled={locked(f)}
          type={DATE_FIELDS.has(f) ? "date" : NUM_FIELDS.has(f) ? "number" : "text"}
          value={(value as string | number | null) ?? ""}
          onChange={(e) => set(f, NUM_FIELDS.has(f) ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value || null)}
        />
      </div>
    );
  };

  const members = current ? groups.filter((g) => g.assetIds.includes(current.id)).map((g) => g.id) : [];

  return (
    <Sheet open onOpenChange={(o) => { if (!o) { void flush(); onClose(); } }}>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader>
          <div className="flex items-center justify-between gap-2">
            <SheetTitle>{isNew ? "Nuovo asset" : `Asset ${current?.internal_code}`}</SheetTitle>
            {status === "saving" && <Badge variant="outline"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Salvataggio…</Badge>}
            {status === "saved" && <Badge variant="outline"><Check className="w-3 h-3 mr-1" />Salvato</Badge>}
            {status === "error" && <Badge variant="destructive">Non salvato</Badge>}
          </div>
          <SheetDescription>
            {isNew ? "Il codice interno lo assegna il sistema alla creazione."
              : readOnly ? "Sola lettura: puoi modificare solo gli asset creati da te."
              : halo ? "Arriva dal gestionale: i campi sincronizzati sono in sola lettura."
              : current?.halo_removed_at ? "Non è più nel gestionale: ora si modifica come un asset manuale."
              : "Le modifiche vengono salvate automaticamente."}
          </SheetDescription>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </SheetHeader>
        <div className="h-[calc(100vh-9rem)] overflow-y-auto px-2 py-1 mt-3 space-y-5">
          {SECTIONS.map(([title, fields]) => (
            <div key={title} className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
                {title === "Identificazione" && !readOnly && !secrets && (current?.has_pin || current?.has_puk) && (
                  <Button variant="ghost" size="sm" onClick={reveal}><Eye className="w-3 h-3 mr-1" />Mostra PIN/PUK</Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">{fields.map(field)}</div>
            </div>
          ))}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tag{current ? ", gruppi e flag" : ""}</p>
            <TagInput value={(form.tags as string[]) ?? []} suggestions={allTags} disabled={readOnly} onChange={(v) => set("tags", v)} />
            {current && groups.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {groups.map((g) => {
                  const on = members.includes(g.id);
                  return <Button key={g.id} size="sm" variant={on ? "default" : "outline"} onClick={() => toggleGroup(g, on)}>{g.name}</Button>;
                })}
              </div>
            )}
            {current && (
              <div className="flex items-center gap-2 text-sm">
                <FlagButton key={current.id} color={(form.flag_color as string) ?? null} note={(form.flag_note as string) ?? null} disabled={readOnly}
                  onChange={(c, n) => setMany({ flag_color: c, flag_note: n })} />
                {form.flag_color ? ((form.flag_note as string) || "Flag attivo") : <span className="text-muted-foreground">Nessun flag</span>}
              </div>
            )}
          </div>
          {current && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">HiTrack</p>
              <HiTrackPanel asset={current} devices={devicesQ.data ?? []} hitrackActive={hitrackActive} disabled={readOnly} onLink={link} />
            </div>
          )}
          {isNew ? (
            <Button onClick={create} disabled={status === "saving"}>
              {status === "saving" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}Crea asset
            </Button>
          ) : current?.can_delete && (
            <Button variant="destructive" size="sm" onClick={remove}><Trash2 className="w-4 h-4 mr-1" />Elimina asset</Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ExpiryTab({ orgId, groupId, assets, leadDays, canWrite, onOpen, onSaved }: {
  orgId: string; groupId: string | null; assets: ManagedAsset[]; leadDays: number; canWrite: boolean;
  onOpen: (a: ManagedAsset) => void; onSaved: () => void;
}) {
  const [lead, setLead] = useState(leadDays);
  useEffect(() => setLead(leadDays), [leadDays]);
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState("");
  const save = async () => {
    if (lead === leadDays || lead < 1) return;
    try { await managedAssetsApi.saveExpiry(orgId, groupId, { leadDays: lead }); onSaved(); }
    catch (e) { toast.error("Errore", { description: getErrorDetail(e) }); }
  };
  const end = to || new Date(Date.now() + leadDays * 86400000).toISOString().slice(0, 10);
  const rows = assets.flatMap((a) => [
    a.end_contract_date && { a, kind: "Fine contratto", date: a.end_contract_date },
    a.warranty_expiration && { a, kind: "Fine garanzia", date: a.warranty_expiration },
  ].filter(Boolean) as { a: ManagedAsset; kind: string; date: string }[])
    .filter((r) => r.date >= from && r.date <= end)
    .sort((x, y) => x.date.localeCompare(y.date));

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Preavviso</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Anticipo (giorni)</Label>
            <Input type="number" min={1} max={730} disabled={!canWrite} value={lead} onChange={(e) => setLead(Number(e.target.value) || 0)} onBlur={save} />
          </div>
          <p className="text-xs text-muted-foreground">Gli asset con contratto o garanzia in scadenza entro questo anticipo sono evidenziati nel registro. L'invio del report via email non è ancora attivo.</p>
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
                  <TableCell className="font-mono">{r.a.internal_code} {assetDisplayName(r.a)}</TableCell>
                  <TableCell>{r.a.asset_type}</TableCell>
                  <TableCell>{r.kind}</TableCell>
                  <TableCell>{new Date(r.date).toLocaleDateString("it-IT")}</TableCell>
                  <TableCell>{expiryBadge(daysUntil(r.date), leadDays) ?? daysUntil(r.date)}</TableCell>
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

function LookupsTab({ orgId, groupId, lookups, canWrite, onChange }: {
  orgId: string; groupId: string | null; lookups: AssetLookups; canWrite: boolean; onChange: (l: AssetLookups) => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const run = async (fn: () => Promise<AssetLookups>) => {
    try { onChange(await fn()); } catch (e) { toast.error("Errore", { description: getErrorDetail(e) }); }
  };
  return (
    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
      {(Object.keys(LOOKUP_LABEL) as LookupKind[]).map((k) => (
        <Card key={k}>
          <CardHeader><CardTitle className="text-base">{LOOKUP_LABEL[k]}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {lookups[k].map((v) => (
                <Badge key={v} variant="secondary" className="gap-1">{v}
                  {canWrite && <button aria-label={`Rimuovi ${v}`} onClick={() => run(() => managedAssetsApi.removeLookup(orgId, groupId, k, v))}><X className="w-3 h-3" /></button>}
                </Badge>
              ))}
              {!lookups[k].length && <span className="text-sm text-muted-foreground">Nessun valore.</span>}
            </div>
            {canWrite && (
              <form className="flex gap-2" onSubmit={(e) => {
                e.preventDefault(); const v = draft[k]?.trim(); if (!v) return;
                run(async () => { const l = await managedAssetsApi.addLookup(orgId, groupId, k, v); setDraft((d) => ({ ...d, [k]: "" })); return l; });
              }}>
                <Input value={draft[k] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))} placeholder="Nuovo valore" maxLength={255} />
                <Button type="submit" size="icon" aria-label="Aggiungi"><Plus className="w-4 h-4" /></Button>
              </form>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function GroupsTab({ orgId, groupId, groups, onChange }: {
  orgId: string; groupId: string | null; groups: AssetCollection[]; onChange: () => void;
}) {
  const [name, setName] = useState("");
  const run = async (fn: () => Promise<unknown>) => {
    try { await fn(); onChange(); } catch (e) { toast.error("Errore", { description: getErrorDetail(e) }); }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">I miei gruppi</CardTitle>
        <p className="text-sm text-muted-foreground">I gruppi sono personali: li vedi solo tu. Aggiungi gli asset dalla scheda o selezionandoli nel registro.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <form className="flex gap-2 max-w-md" onSubmit={(e) => { e.preventDefault(); const n = name.trim(); if (n) run(async () => { await managedAssetsApi.createCollection(orgId, groupId, n); setName(""); }); }}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome nuovo gruppo" maxLength={80} />
          <Button type="submit"><Plus className="w-4 h-4 mr-1" />Crea</Button>
        </form>
        {groups.map((g) => (
          <div key={g.id} className="flex items-center gap-2 max-w-md">
            <Input defaultValue={g.name} maxLength={80} onBlur={(e) => { const n = e.target.value.trim(); if (n && n !== g.name) run(() => managedAssetsApi.renameCollection(orgId, groupId, g.id, n)); }} />
            <Badge variant="secondary">{g.assetIds.length} asset</Badge>
            <Button variant="ghost" size="icon" aria-label={`Elimina ${g.name}`} onClick={() => run(() => managedAssetsApi.deleteCollection(orgId, groupId, g.id))}><Trash2 className="w-4 h-4" /></Button>
          </div>
        ))}
        {!groups.length && <p className="text-sm text-muted-foreground">Nessun gruppo creato.</p>}
      </CardContent>
    </Card>
  );
}
