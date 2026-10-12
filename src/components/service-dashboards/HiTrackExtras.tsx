import React, { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, FolderPlus, Tag, Trash2, X } from "lucide-react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { formatMillis, formatPercent } from "@/lib/hitrack/formatters";
import type { HiTrackDashboardPayload, HiTrackTrendWindow } from "@/lib/hitrack/types";
import { globalBreakdown, THRESHOLDS, worstHosts, type HostHealth } from "@/lib/hitrack/hostHealth";
import { hitrackOrganizeApi, type HiTrackGroup } from "@/lib/api/hitrack-organize";

const sevClass = { ok: "bg-green-500/15 text-green-400 border-green-500/20", warn: "bg-amber-500/15 text-amber-300 border-amber-500/20", crit: "bg-red-500/15 text-red-400 border-red-500/20" };
const scoreSev = (s: number) => (s < 50 ? "crit" : s < 80 ? "warn" : "ok") as keyof typeof sevClass;
const usageColor = (v: number) => (v > THRESHOLDS.usageCrit ? "hsl(0 72% 55%)" : v > THRESHOLDS.usageWarn ? "hsl(38 92% 55%)" : "hsl(152 60% 50%)");

/* ---------------- Sparkline ---------------- */
export const Sparkline: React.FC<{ values: number[]; onClick?: () => void }> = ({ values, onClick }) => {
  if (values.length < 2) return <span className="text-xs text-muted-foreground">Storico non disponibile</span>;
  const last = values[values.length - 1];
  const min = Math.min(...values), max = Math.max(...values);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${100 - Math.max(0, Math.min(100, v))}`).join(" ");
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-2 text-left" title={`Ultimo ${last.toFixed(1)}% · min ${min.toFixed(1)}% · max ${max.toFixed(1)}%`}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-10 w-28">
        <line x1="0" x2="100" y1={100 - THRESHOLDS.usageWarn} y2={100 - THRESHOLDS.usageWarn} stroke="currentColor" className="text-muted-foreground/30" strokeDasharray="3 3" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <polyline fill="none" stroke={usageColor(last)} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" points={pts} />
      </svg>
      <span className="text-[10px] leading-tight text-muted-foreground">
        <span className="block font-medium text-foreground">{last.toFixed(1)}%</span>
        {min.toFixed(0)}–{max.toFixed(0)}%
      </span>
    </button>
  );
};

/* ---------------- History dialog ---------------- */
export const TrendDialog: React.FC<{ open: boolean; onOpenChange: (o: boolean) => void; title: string; series: { name: string; values: number[] }[]; window: HiTrackTrendWindow }> = ({ open, onOpenChange, title, series, window }) => {
  const len = Math.max(0, ...series.map((s) => s.values.length));
  const rows = Array.from({ length: len }, (_, i) => { const r: Record<string, number | string> = { i: i + 1 }; series.forEach((s) => { if (s.values[i] !== undefined) r[s.name] = Number(s.values[i].toFixed(1)); }); return r; });
  const colors = ["hsl(199 89% 55%)", "hsl(152 60% 50%)", "hsl(280 60% 65%)", "hsl(38 92% 55%)"];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>{title} · finestra {window}</DialogTitle></DialogHeader>
        {len < 2 ? <p className="text-sm text-muted-foreground">Storico non disponibile.</p> : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="i" tick={{ fontSize: 11 }} label={{ value: "campione", position: "insideBottom", offset: -2, fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                <Tooltip />
                <ReferenceLine y={THRESHOLDS.usageWarn} stroke="hsl(38 92% 55%)" strokeDasharray="4 4" />
                <ReferenceLine y={THRESHOLDS.usageCrit} stroke="hsl(0 72% 55%)" strokeDasharray="4 4" />
                {series.map((s, i) => <Line key={s.name} type="monotone" dataKey={s.name} stroke={colors[i % colors.length]} dot={false} strokeWidth={2} />)}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="text-xs text-muted-foreground">Linee tratteggiate: attenzione {THRESHOLDS.usageWarn}%, critico {THRESHOLDS.usageCrit}%. Le serie sono quelle fornite da HiTrack per la finestra selezionata.</p>
      </DialogContent>
    </Dialog>
  );
};

/* ---------------- Health sheet ---------------- */
export const HealthSheet: React.FC<{ open: boolean; onOpenChange: (o: boolean) => void; data: HiTrackDashboardPayload; hosts: HostHealth[] }> = ({ open, onOpenChange, data, hosts }) => {
  const items = globalBreakdown(data);
  const worst = worstHosts(hosts);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader><SheetTitle>Perché Health Score {formatPercent(data.overview.healthScore)}</SheetTitle></SheetHeader>
        <div className="mt-4 space-y-3">
          <p className="text-sm font-medium">Composizione del punteggio</p>
          {items.map((it) => (
            <div key={it.label} className="rounded-lg border border-border p-3">
              <div className="flex justify-between text-sm"><span>{it.label}</span><span className="font-medium">{it.value >= 0 ? "+" : ""}{it.value.toFixed(1)} / {it.value < 0 ? "-" : ""}{it.max}</span></div>
              <Progress value={(Math.abs(it.value) / it.max) * 100} className="mt-2" />
              <p className="mt-1 text-xs text-muted-foreground">{it.detail}</p>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">Ricostruzione della formula HiTrack con i dati ricevuti; il valore ufficiale è quello calcolato dal servizio.</p>
        </div>
        <div className="mt-6 space-y-3">
          <p className="text-sm font-medium">I 5 host con più problemi</p>
          {worst.length === 0 && <p className="text-sm text-muted-foreground">Nessun host con problemi su RAM, disco o rete.</p>}
          {worst.map((h) => (
            <div key={h.device.id} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <div><p className="font-medium">{h.device.deviceName}</p><p className="text-xs text-muted-foreground">{h.device.ipAddress ?? "IP non disponibile"} · {h.device.type}</p></div>
                <Badge className={sevClass[scoreSev(h.score)]}>{h.score.toFixed(0)}/100</Badge>
              </div>
              <div className="mt-2 grid grid-cols-4 gap-2 text-xs">
                <span>Disponibilità {h.availability.toFixed(0)}</span>
                <span>RAM {h.ram === null ? "N/D" : h.ram.toFixed(0)}</span>
                <span>Disco {h.disk === null ? "N/D" : h.disk.toFixed(0)}</span>
                <span>Rete {h.network.toFixed(0)}</span>
              </div>
              <ul className="mt-2 space-y-1">{h.reasons.map((r, i) => <li key={i}><Badge className={sevClass[r.severity]}>{r.severity === "crit" ? "Critico" : "Attenzione"}</Badge> <span className="text-sm">{r.text}</span></li>)}</ul>
            </div>
          ))}
        </div>
        <div className="mt-6 rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">Soglie</p>
          <p>RAM e disco: attenzione oltre {THRESHOLDS.usageWarn}%, critico oltre {THRESHOLDS.usageCrit}%.</p>
          <p>Qualità rete (calcolata da packet loss e latenza): attenzione oltre {THRESHOLDS.lossWarn}% o {THRESHOLDS.rtdWarn} ms, critico oltre {THRESHOLDS.lossCrit}% o {THRESHOLDS.rtdCrit} ms. La banda in Mbps non è fornita da HiTrack.</p>
          <p>Punteggio host = media delle componenti disponibili; quelle senza dati non pesano.</p>
        </div>
      </SheetContent>
    </Sheet>
  );
};

/* ---------------- Sort helpers ---------------- */
export type SortDir = "asc" | "desc" | null;
export const SortHead: React.FC<{ label: string; active: boolean; dir: SortDir; onClick: () => void }> = ({ label, active, dir, onClick }) => (
  <button type="button" className="inline-flex items-center gap-1 font-medium hover:text-foreground" onClick={onClick}>
    {label}{!active || !dir ? <ArrowUpDown className="h-3 w-3 opacity-50" /> : dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
  </button>
);
const cycle = (d: SortDir): SortDir => (d === null ? "asc" : d === "asc" ? "desc" : null);

/* ---------------- Devices section ---------------- */
type ColKey = "name" | "ip" | "status" | "rtdWorst" | "rtdMedian" | "loss" | "os" | "score";
const PER = 10;

export const DevicesSection: React.FC<{ hosts: HostHealth[]; organizationId: string | null }> = ({ hosts, organizationId }) => {
  const [groups, setGroups] = useState<HiTrackGroup[]>([]);
  const [members, setMembers] = useState<{ group_id: string; device_key: string }[]>([]);
  const [tags, setTags] = useState<{ device_key: string; tag: string }[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<ColKey>("score");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [f, setF] = useState({ q: "", name: "", ip: "", os: "", status: "all", minLoss: "", maxScore: "", group: "all", tag: "all" });
  const [groupBy, setGroupBy] = useState(false);
  const [page, setPage] = useState(0);
  const [newGroup, setNewGroup] = useState("");
  const [newTag, setNewTag] = useState("");

  const reload = async () => {
    if (!organizationId) return;
    try {
      const g = await hitrackOrganizeApi.groups(organizationId);
      setGroups(g);
      setMembers(await hitrackOrganizeApi.members(g.map((x) => x.id)));
      setTags(await hitrackOrganizeApi.tags(organizationId));
    } catch (e) { toast.error((e as Error).message); }
  };
  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [organizationId]);

  const tagsOf = (k: string) => tags.filter((t) => t.device_key === k).map((t) => t.tag);
  const groupsOf = (k: string) => members.filter((m) => m.device_key === k).map((m) => m.group_id);
  const allTags = [...new Set(tags.map((t) => t.tag))].sort();
  const statuses = [...new Set(hosts.map((h) => h.device.status))];

  const val = (h: HostHealth, k: ColKey): string | number => {
    const d = h.device;
    switch (k) {
      case "name": return d.deviceName.toLowerCase();
      case "ip": return (d.ipAddress ?? "").split(".").map((p) => p.padStart(3, "0")).join(".");
      case "status": return d.status;
      case "rtdWorst": return d.rtdWorstMs ?? -1;
      case "rtdMedian": return d.rtdMedianMs ?? -1;
      case "loss": return d.packetLossPercent ?? -1;
      case "os": return `${d.osName ?? ""} ${d.osVersion ?? ""}`.toLowerCase();
      case "score": return h.score;
    }
  };

  const filtered = useMemo(() => {
    const inc = (a: string | null | undefined, b: string) => !b || (a ?? "").toLowerCase().includes(b.toLowerCase());
    let rows = hosts.filter((h) => {
      const d = h.device;
      if (f.q && ![d.deviceName, d.ipAddress, d.type, d.vendor, d.osName, ...tagsOf(d.id)].some((x) => inc(x, f.q))) return false;
      if (!inc(d.deviceName, f.name) || !inc(d.ipAddress, f.ip) || !inc(`${d.osName ?? ""} ${d.osVersion ?? ""}`, f.os)) return false;
      if (f.status !== "all" && d.status !== f.status) return false;
      if (f.minLoss && (d.packetLossPercent ?? 0) < Number(f.minLoss)) return false;
      if (f.maxScore && h.score > Number(f.maxScore)) return false;
      if (f.group !== "all" && !groupsOf(d.id).includes(f.group)) return false;
      if (f.tag !== "all" && !tagsOf(d.id).includes(f.tag)) return false;
      return true;
    });
    if (sortDir) {
      rows = [...rows].sort((a, b) => {
        const x = val(a, sortKey), y = val(b, sortKey);
        const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
        return sortDir === "asc" ? c : -c;
      });
    }
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hosts, f, sortKey, sortDir, tags, members]);

  const pages = Math.max(1, Math.ceil(filtered.length / PER));
  const cur = Math.min(page, pages - 1);
  const visible = filtered.slice(cur * PER, cur * PER + PER);
  useEffect(() => setPage(0), [f, sortKey, sortDir]);

  const clickSort = (k: ColKey) => { if (k !== sortKey) { setSortKey(k); setSortDir("asc"); } else setSortDir(cycle(sortDir)); };
  const head = (k: ColKey, label: string) => <SortHead label={label} active={sortKey === k} dir={sortDir} onClick={() => clickSort(k)} />;
  const toggle = (k: string) => setSelected((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const sel = [...selected];

  const act = async (fn: () => Promise<void>, ok: string) => { try { await fn(); toast.success(ok); await reload(); } catch (e) { toast.error((e as Error).message); } };

  const renderRow = (h: HostHealth) => {
    const d = h.device;
    return (
      <TableRow key={d.id}>
        <TableCell><Checkbox checked={selected.has(d.id)} onCheckedChange={() => toggle(d.id)} aria-label={`Seleziona ${d.deviceName}`} /></TableCell>
        <TableCell>
          <p className="font-medium">{d.deviceName}</p>
          <p className="text-xs text-muted-foreground">{d.type} · {d.vendor || "Vendor N/D"}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {groupsOf(d.id).map((g) => <Badge key={g} variant="secondary" className="text-[10px]">{groups.find((x) => x.id === g)?.name}</Badge>)}
            {tagsOf(d.id).map((t) => (
              <Badge key={t} variant="outline" className="gap-1 text-[10px]">#{t}
                {organizationId && <button type="button" aria-label={`Rimuovi tag ${t}`} onClick={() => act(() => hitrackOrganizeApi.removeTag(organizationId, d.id, t), "Tag rimosso")}><X className="h-2.5 w-2.5" /></button>}
              </Badge>
            ))}
          </div>
        </TableCell>
        <TableCell>{d.ipAddress || "Dato non disponibile"}</TableCell>
        <TableCell><Badge className={sevClass[d.statusType === "error" ? "crit" : d.statusType === "warning" ? "warn" : "ok"]}>{d.status}</Badge></TableCell>
        <TableCell><Badge className={sevClass[scoreSev(h.score)]} title={h.reasons.map((r) => r.text).join(" · ") || "Nessun problema"}>{h.score.toFixed(0)}</Badge></TableCell>
        <TableCell>{formatMillis(d.rtdWorstMs)}</TableCell>
        <TableCell>{formatMillis(d.rtdMedianMs)}</TableCell>
        <TableCell>{formatPercent(d.packetLossPercent)}</TableCell>
        <TableCell>{[d.osName, d.osVersion].filter(Boolean).join(" ") || "Dato non disponibile"}</TableCell>
      </TableRow>
    );
  };

  const sections = groupBy
    ? [...groups.map((g) => ({ id: g.id, name: g.name, rows: filtered.filter((h) => groupsOf(h.device.id).includes(g.id)) })), { id: "none", name: "Senza gruppo", rows: filtered.filter((h) => groupsOf(h.device.id).length === 0) }].filter((s) => s.rows.length)
    : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Cerca dispositivo, IP, tag…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} className="h-9 w-56" />
        <Button size="sm" variant={sortKey === "score" && sortDir === "desc" ? "default" : "outline"} onClick={() => { setSortKey("score"); setSortDir("desc"); }}>Dal migliore al peggiore</Button>
        <Button size="sm" variant={sortKey === "score" && sortDir === "asc" ? "default" : "outline"} onClick={() => { setSortKey("score"); setSortDir("asc"); }}>Dal peggiore al migliore</Button>
        <Select value={f.group} onValueChange={(v) => setF({ ...f, group: v })}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Gruppo" /></SelectTrigger>
          <SelectContent><SelectItem value="all">Tutti i gruppi</SelectItem>{groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={f.tag} onValueChange={(v) => setF({ ...f, tag: v })}>
          <SelectTrigger className="h-9 w-36"><SelectValue placeholder="Tag" /></SelectTrigger>
          <SelectContent><SelectItem value="all">Tutti i tag</SelectItem>{allTags.map((t) => <SelectItem key={t} value={t}>#{t}</SelectItem>)}</SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={groupBy} onCheckedChange={(v) => setGroupBy(!!v)} />Raggruppa per gruppo</label>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2">
        <Input placeholder="Nuovo gruppo" value={newGroup} onChange={(e) => setNewGroup(e.target.value)} className="h-8 w-40" />
        <Button size="sm" variant="outline" disabled={!newGroup.trim() || !organizationId} onClick={() => act(async () => { await hitrackOrganizeApi.createGroup(organizationId!, newGroup.trim()); setNewGroup(""); }, "Gruppo creato")}><FolderPlus className="mr-1 h-4 w-4" />Crea gruppo</Button>
        {f.group !== "all" && <Button size="sm" variant="ghost" onClick={() => act(async () => { await hitrackOrganizeApi.deleteGroup(f.group); setF({ ...f, group: "all" }); }, "Gruppo eliminato")}><Trash2 className="mr-1 h-4 w-4" />Elimina gruppo filtrato</Button>}
        <span className="mx-2 text-xs text-muted-foreground">{sel.length} selezionati</span>
        {groups.map((g) => (
          <Button key={g.id} size="sm" variant="secondary" disabled={!sel.length} onClick={() => act(async () => { await hitrackOrganizeApi.setMembers(g.id, sel, true); setSelected(new Set()); }, `Aggiunti a ${g.name}`)}>+ {g.name}</Button>
        ))}
        {f.group !== "all" && <Button size="sm" variant="outline" disabled={!sel.length} onClick={() => act(async () => { await hitrackOrganizeApi.setMembers(f.group, sel, false); setSelected(new Set()); }, "Rimossi dal gruppo")}>Togli dal gruppo</Button>}
        <Input placeholder="Tag" value={newTag} onChange={(e) => setNewTag(e.target.value)} className="h-8 w-28" />
        <Button size="sm" variant="outline" disabled={!sel.length || !newTag.trim() || !organizationId} onClick={() => act(async () => { await hitrackOrganizeApi.addTag(organizationId!, sel, newTag.trim()); setNewTag(""); setSelected(new Set()); }, "Tag aggiunto")}><Tag className="mr-1 h-4 w-4" />Aggiungi tag</Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table className="min-w-[1080px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"><Checkbox checked={visible.length > 0 && visible.every((h) => selected.has(h.device.id))} onCheckedChange={(v) => setSelected((s) => { const n = new Set(s); visible.forEach((h) => (v ? n.add(h.device.id) : n.delete(h.device.id))); return n; })} aria-label="Seleziona pagina" /></TableHead>
              <TableHead>{head("name", "Nome asset")}</TableHead>
              <TableHead>{head("ip", "IP")}</TableHead>
              <TableHead>{head("status", "Stato")}</TableHead>
              <TableHead>{head("score", "Salute")}</TableHead>
              <TableHead>{head("rtdWorst", "RTD peggiore")}</TableHead>
              <TableHead>{head("rtdMedian", "RTD mediana")}</TableHead>
              <TableHead>{head("loss", "Packet loss")}</TableHead>
              <TableHead>{head("os", "OS")}</TableHead>
            </TableRow>
            <TableRow>
              <TableHead />
              <TableHead><Input className="h-7" placeholder="Filtra" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></TableHead>
              <TableHead><Input className="h-7" placeholder="Filtra" value={f.ip} onChange={(e) => setF({ ...f, ip: e.target.value })} /></TableHead>
              <TableHead>
                <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v })}>
                  <SelectTrigger className="h-7"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="all">Tutti</SelectItem>{statuses.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </TableHead>
              <TableHead><Input className="h-7" type="number" placeholder="max" value={f.maxScore} onChange={(e) => setF({ ...f, maxScore: e.target.value })} /></TableHead>
              <TableHead /><TableHead />
              <TableHead><Input className="h-7" type="number" placeholder="min %" value={f.minLoss} onChange={(e) => setF({ ...f, minLoss: e.target.value })} /></TableHead>
              <TableHead><Input className="h-7" placeholder="Filtra" value={f.os} onChange={(e) => setF({ ...f, os: e.target.value })} /></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sections ? sections.map((s) => (
              <React.Fragment key={s.id}>
                <TableRow className="bg-muted/40"><TableCell colSpan={9} className="text-sm font-medium">{s.name} · {s.rows.length} host · salute media {(s.rows.reduce((a, h) => a + h.score, 0) / s.rows.length).toFixed(0)}</TableCell></TableRow>
                {s.rows.map(renderRow)}
              </React.Fragment>
            )) : visible.map(renderRow)}
            {filtered.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground">Nessun dispositivo corrisponde ai filtri.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      {!sections && filtered.length > PER && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{cur * PER + 1}–{Math.min(cur * PER + PER, filtered.length)} di {filtered.length}</p>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={cur === 0} onClick={() => setPage(cur - 1)}>Precedenti</Button>
            <span className="text-xs text-muted-foreground">{cur + 1} / {pages}</span>
            <Button size="sm" variant="outline" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Successivi</Button>
          </div>
        </div>
      )}
    </div>
  );
};

/* ---------------- Simple filter/sort for disk & RAM cards ---------------- */
export function useCardFilter<T>(rows: T[], name: (r: T) => string, usage: (r: T) => number | null) {
  const [q, setQ] = useState("");
  const [lvl, setLvl] = useState("all");
  const [sort, setSort] = useState("worst");
  const out = useMemo(() => {
    let r = rows.filter((x) => !q || name(x).toLowerCase().includes(q.toLowerCase()));
    r = r.filter((x) => { const u = usage(x) ?? 0; return lvl === "all" || (lvl === "crit" ? u > THRESHOLDS.usageCrit : lvl === "warn" ? u > THRESHOLDS.usageWarn && u <= THRESHOLDS.usageCrit : u <= THRESHOLDS.usageWarn); });
    const by = { worst: (a: T, b: T) => (usage(b) ?? 0) - (usage(a) ?? 0), best: (a: T, b: T) => (usage(a) ?? 0) - (usage(b) ?? 0), az: (a: T, b: T) => name(a).localeCompare(name(b)), za: (a: T, b: T) => name(b).localeCompare(name(a)) }[sort as "worst"];
    return [...r].sort(by);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, lvl, sort]);
  const controls = (
    <div className="flex flex-wrap gap-2">
      <Input className="h-8 w-40" placeholder="Filtra nome" value={q} onChange={(e) => setQ(e.target.value)} />
      <Select value={lvl} onValueChange={setLvl}>
        <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="all">Tutti</SelectItem><SelectItem value="crit">Critico</SelectItem><SelectItem value="warn">Attenzione</SelectItem><SelectItem value="ok">OK</SelectItem></SelectContent>
      </Select>
      <Select value={sort} onValueChange={setSort}>
        <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="worst">Dal peggiore al migliore</SelectItem><SelectItem value="best">Dal migliore al peggiore</SelectItem><SelectItem value="az">Nome A-Z</SelectItem><SelectItem value="za">Nome Z-A</SelectItem></SelectContent>
      </Select>
    </div>
  );
  return { rows: out, controls };
}
