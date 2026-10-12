import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Flag, X, ExternalLink } from "lucide-react";
import type { HiTrackDashboardPayload, HiTrackMonitoredDevice } from "@/lib/hitrack/types";
import type { ManagedAsset } from "@/lib/api/managed-assets";

export type Availability = "up" | "warn" | "down" | "unknown";
export interface HiTrackMatch { device: HiTrackMonitoredDevice; mode: "manual" | "ip" | "name" }

const norm = (s?: string | null) => (s ?? "").trim().toLowerCase();

export function matchHiTrack(assets: ManagedAsset[], devices: HiTrackMonitoredDevice[]): Map<string, HiTrackMatch> {
  const out = new Map<string, HiTrackMatch>();
  if (!devices.length) return out;
  const byId = new Map(devices.map((d) => [d.id, d]));
  const byIp = new Map(devices.filter((d) => d.ipAddress).map((d) => [d.ipAddress!, d]));
  const byName = new Map(devices.map((d) => [norm(d.deviceName), d]));
  for (const a of assets) {
    if (a.hitrack_link_mode === "none") continue;
    if (a.hitrack_device_id && byId.has(a.hitrack_device_id)) { out.set(a.id, { device: byId.get(a.hitrack_device_id)!, mode: "manual" }); continue; }
    if (a.ip_address && byIp.has(a.ip_address)) { out.set(a.id, { device: byIp.get(a.ip_address)!, mode: "ip" }); continue; }
    const n = [a.name, a.internal_code, a.asset_number].map(norm).find((x) => x && byName.has(x));
    if (n) out.set(a.id, { device: byName.get(n)!, mode: "name" });
  }
  return out;
}

export function availabilityOf(d?: HiTrackMonitoredDevice): Availability {
  if (!d) return "unknown";
  if (d.statusType === "error") return "down";
  if (d.statusType === "warning") return "warn";
  if (d.statusType === "success") return "up";
  return "unknown";
}

const DOT: Record<Availability, string> = {
  up: "bg-cyber-green", warn: "bg-cyber-orange", down: "bg-cyber-red", unknown: "bg-muted-foreground/40",
};
export const AVAIL_LABEL: Record<Availability, string> = { up: "Up", warn: "Attenzione", down: "Down", unknown: "Sconosciuto" };

export function AvailabilityDot({ device }: { device?: HiTrackMonitoredDevice }) {
  const a = availabilityOf(device);
  const when = device?.lastStatusChangeAt ? ` · dal ${new Date(device.lastStatusChangeAt).toLocaleString("it-IT")}` : "";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs" title={`${AVAIL_LABEL[a]}${when}`}>
      <span className={`inline-block w-2.5 h-2.5 rounded-full ${DOT[a]}`} />{AVAIL_LABEL[a]}
    </span>
  );
}

export const FLAG_COLORS: Record<string, string> = {
  red: "text-cyber-red", orange: "text-cyber-orange", yellow: "text-yellow-500", green: "text-cyber-green", blue: "text-primary",
};
const FLAG_LABEL: Record<string, string> = { red: "Rosso", orange: "Arancio", yellow: "Giallo", green: "Verde", blue: "Blu" };

export function FlagButton({ color, note, disabled, onChange }: {
  color: string | null; note: string | null; disabled?: boolean; onChange: (color: string | null, note: string | null) => void;
}) {
  const [n, setN] = useState(note ?? "");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button aria-label="Flag" disabled={disabled} onClick={(e) => e.stopPropagation()} title={note ?? undefined}
          className="p-1 rounded hover:bg-muted disabled:opacity-50">
          <Flag className={`w-4 h-4 ${color ? `${FLAG_COLORS[color]} fill-current` : "text-muted-foreground/50"}`} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60 space-y-2" onClick={(e) => e.stopPropagation()}>
        <div className="flex gap-1">
          {Object.keys(FLAG_COLORS).map((c) => (
            <button key={c} aria-label={FLAG_LABEL[c]} onClick={() => onChange(c, n || null)}
              className={`p-1 rounded border ${color === c ? "border-foreground" : "border-transparent"}`}>
              <Flag className={`w-4 h-4 fill-current ${FLAG_COLORS[c]}`} />
            </button>
          ))}
        </div>
        <Input placeholder="Nota (facoltativa)" value={n} onChange={(e) => setN(e.target.value)} onBlur={() => color && onChange(color, n || null)} />
        {color && <Button size="sm" variant="ghost" onClick={() => { setN(""); onChange(null, null); }}>Togli flag</Button>}
      </PopoverContent>
    </Popover>
  );
}

export function TagInput({ value, suggestions, disabled, onChange }: {
  value: string[]; suggestions: string[]; disabled?: boolean; onChange: (v: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const add = (t: string) => { const x = t.trim(); if (x && !value.includes(x)) onChange([...value, x]); setDraft(""); };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {value.map((t) => (
          <Badge key={t} variant="secondary" className="gap-1">{t}
            {!disabled && <button aria-label={`Rimuovi ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}><X className="w-3 h-3" /></button>}
          </Badge>
        ))}
      </div>
      {!disabled && (
        <>
          <Input list="asset-tag-suggestions" placeholder="Aggiungi tag e premi Invio" value={draft}
            onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(draft); } }} />
          <datalist id="asset-tag-suggestions">{suggestions.filter((s) => !value.includes(s)).map((s) => <option key={s} value={s} />)}</datalist>
        </>
      )}
    </div>
  );
}

export function HiTrackPanel({ match, data, asset, disabled, onLink }: {
  match?: HiTrackMatch; data: HiTrackDashboardPayload; asset: ManagedAsset; disabled?: boolean;
  onLink: (deviceId: string | null, mode: string | null) => void;
}) {
  const devices = data.monitoredDevices;
  if (!devices.length) return <p className="text-xs text-muted-foreground">Nessun dato HiTrack disponibile per questo cliente.</p>;
  const d = match?.device;
  const disks = d ? data.logicalDisks.filter((x) => x.deviceName === d.deviceName || (d.ipAddress && x.ipAddress === d.ipAddress)) : [];
  const ram = d ? data.ramMonitoring.filter((x) => x.deviceName === d.deviceName || (d.ipAddress && x.ipAddress === d.ipAddress)) : [];
  const row = (l: string, v: React.ReactNode) => (
    <div className="flex justify-between gap-2 text-sm"><span className="text-muted-foreground">{l}</span><span className="text-right">{v ?? "—"}</span></div>
  );
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs">Dispositivo HiTrack</Label>
        <Select disabled={disabled} value={d?.id ?? "__none"} onValueChange={(v) => onLink(v === "__none" ? null : v, v === "__none" ? "none" : "manual")}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">Non collegato</SelectItem>
            {devices.map((x) => <SelectItem key={x.id} value={x.id}>{x.deviceName}{x.ipAddress ? ` (${x.ipAddress})` : ""}</SelectItem>)}
          </SelectContent>
        </Select>
        {match && match.mode !== "manual" && (
          <p className="text-xs text-muted-foreground">
            Trovato in automatico per {match.mode === "ip" ? "indirizzo IP" : "nome"}.{" "}
            {!disabled && <button className="underline" onClick={() => onLink(d!.id, "manual")}>Conferma</button>}
          </p>
        )}
        {asset.hitrack_link_mode === "none" && !disabled && (
          <button className="text-xs underline text-muted-foreground" onClick={() => onLink(null, null)}>Riattiva collegamento automatico</button>
        )}
      </div>
      {d && (
        <div className="rounded-md border p-3 space-y-1.5">
          {row("Disponibilità", <AvailabilityDot device={d} />)}
          {row("Tipo", d.type)}
          {row("IP", d.ipAddress)}
          {row("Stato", d.status)}
          {row("Latenza peggiore / mediana", d.rtdWorstMs != null ? `${d.rtdWorstMs} / ${d.rtdMedianMs ?? "—"} ms` : null)}
          {row("Perdita pacchetti", d.packetLossPercent != null ? `${d.packetLossPercent}%` : null)}
          {row("Sede", d.location)}
          {row("Marca / modello", [d.vendor, d.model].filter(Boolean).join(" ") || null)}
          {row("Sistema operativo", [d.osName, d.osVersion].filter(Boolean).join(" ") || null)}
          {row("Ultimo cambio di stato", d.lastStatusChangeAt ? new Date(d.lastStatusChangeAt).toLocaleString("it-IT") : null)}
          {ram.map((r) => row(`RAM ${r.dimensionLabel ?? ""}`, r.usagePercent != null ? `${r.usagePercent}% di ${r.totalRamGiB ?? "?"} GiB` : null))}
          {disks.map((k) => row(`Disco ${k.diskLabel}`, k.usagePercent != null ? `${k.usagePercent}% (${k.freeSpaceGiB ?? "?"} GiB liberi)` : null))}
          <Button asChild variant="outline" size="sm" className="mt-2">
            <Link to="/dashboard/service/hitrack"><ExternalLink className="w-3 h-3 mr-1" />Apri in HiTrack</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
