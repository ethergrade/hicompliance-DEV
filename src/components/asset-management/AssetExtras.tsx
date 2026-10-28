import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Flag, X, ExternalLink } from "lucide-react";
import {
  availabilityOf,
  type AssetHiTrackMatch,
  type Availability,
  type HiTrackDeviceOption,
  type ManagedAsset,
} from "@/lib/api/managed-assets";

const DOT: Record<Availability, string> = {
  up: "bg-cyber-green", warn: "bg-cyber-orange", down: "bg-cyber-red", unknown: "bg-muted-foreground/40",
};
export const AVAIL_LABEL: Record<Availability, string> = { up: "Up", warn: "Attenzione", down: "Down", unknown: "Sconosciuto" };

export function AvailabilityDot({ match }: { match?: AssetHiTrackMatch | null }) {
  const a = availabilityOf(match);
  const when = match?.lastStatusChangeAt ? ` · dal ${new Date(match.lastStatusChangeAt).toLocaleString("it-IT")}` : "";
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
        <Input placeholder="Nota (facoltativa)" value={n} maxLength={500} onChange={(e) => setN(e.target.value)} onBlur={() => color && onChange(color, n || null)} />
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
          <Input list="asset-tag-suggestions" placeholder="Aggiungi tag e premi Invio" value={draft} maxLength={40}
            onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(draft); } }} />
          <datalist id="asset-tag-suggestions">{suggestions.filter((s) => !value.includes(s)).map((s) => <option key={s} value={s} />)}</datalist>
        </>
      )}
    </div>
  );
}

/**
 * Il device HiTrack dell'asset: il server lo trova (a mano, per IP, per nome) e
 * ne manda lo stato attuale. Qui si conferma, si cambia o si toglie il
 * collegamento.
 */
export function HiTrackPanel({ asset, devices, hitrackActive, disabled, onLink }: {
  asset: ManagedAsset; devices: HiTrackDeviceOption[]; hitrackActive: boolean; disabled?: boolean;
  onLink: (mode: "manual" | "none" | "auto", deviceId?: string) => void;
}) {
  if (!devices.length) return <p className="text-xs text-muted-foreground">Nessun dispositivo monitorato per questo cliente.</p>;
  const m = asset.hitrack;
  const row = (l: string, v: React.ReactNode) => (
    <div className="flex justify-between gap-2 text-sm"><span className="text-muted-foreground">{l}</span><span className="text-right">{v ?? "—"}</span></div>
  );
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs">Dispositivo monitorato</Label>
        <Select disabled={disabled} value={m?.deviceId ?? "__none"} onValueChange={(v) => (v === "__none" ? onLink("none") : onLink("manual", v))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">Non collegato</SelectItem>
            {devices.map((x) => <SelectItem key={x.id} value={x.id}>{x.name}{x.ipAddress ? ` (${x.ipAddress})` : ""}</SelectItem>)}
          </SelectContent>
        </Select>
        {m && m.mode !== "manual" && (
          <p className="text-xs text-muted-foreground">
            Trovato in automatico per {m.mode === "ip" ? "indirizzo IP" : "nome"}.{" "}
            {!disabled && <button className="underline" onClick={() => onLink("manual", m.deviceId)}>Conferma</button>}
          </p>
        )}
        {asset.hitrack_link_mode && !disabled && (
          <button className="text-xs underline text-muted-foreground" onClick={() => onLink("auto")}>Riattiva il collegamento automatico</button>
        )}
      </div>
      {m && (
        <div className="rounded-md border p-3 space-y-1.5">
          {row("Disponibilità", <AvailabilityDot match={m} />)}
          {row("Tipo", m.type)}
          {row("IP", m.ipAddress)}
          {row("Sede", m.location)}
          {row("Marca / modello", [m.vendor, m.model].filter(Boolean).join(" ") || null)}
          {row("Sistema operativo", m.osName)}
          {row("Ultimo cambio di stato", m.lastStatusChangeAt ? new Date(m.lastStatusChangeAt).toLocaleString("it-IT") : null)}
          {hitrackActive && (
            <Button asChild variant="outline" size="sm" className="mt-2">
              <Link to="/dashboard/service/hitrack"><ExternalLink className="w-3 h-3 mr-1" />Apri in HiTrack</Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
