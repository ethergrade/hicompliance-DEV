import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, X } from "lucide-react";
import { managedAssetsApi, type AssetGroup, type ManagedAsset } from "@/lib/api/managed-assets";

type Action = "tag_add" | "tag_remove" | "group_add" | "group_remove" | "assignee" | "site";

/** Modifica multipla: tag, gruppi, persona assegnataria e location sugli asset selezionati. */
export function BulkEditBar({ selected, assignees, sites, allTags, groups, canEdit, onDone, onClear, notify }: {
  selected: ManagedAsset[]; assignees: string[]; sites: string[]; allTags: string[]; groups: AssetGroup[];
  canEdit: (a: ManagedAsset) => boolean; onDone: () => Promise<void> | void; onClear: () => void;
  notify: (title: string, description: string, error?: boolean) => void;
}) {
  const [action, setAction] = useState<Action>("tag_add");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  if (!selected.length) return null;

  const apply = async () => {
    const v = value.trim();
    if (!v) return;
    setBusy(true);
    let ok = 0, skipped = 0;
    try {
      if (action === "group_add" || action === "group_remove") {
        for (const a of selected) { await managedAssetsApi.setMembership(v, a.id, action === "group_add"); ok++; }
      } else {
        for (const a of selected) {
          const halo = a.source === "halo";
          // Assegnatario e sito di asset Halo sono campi sincronizzati: non si toccano.
          if (!canEdit(a) || (halo && (action === "assignee" || action === "site"))) { skipped++; continue; }
          const tags = a.tags ?? [];
          const p: Partial<ManagedAsset> =
            action === "tag_add" ? { tags: [...new Set([...tags, v])] }
            : action === "tag_remove" ? { tags: tags.filter((t) => t !== v) }
            : action === "assignee" ? { assignee: v, date_of_assign: a.assignee === v ? a.date_of_assign : new Date().toISOString().slice(0, 10) }
            : { site: v };
          await managedAssetsApi.update(a.id, { ...a, ...p });
          ok++;
        }
      }
      notify("Modifica multipla completata", `${ok} asset aggiornati${skipped ? `, ${skipped} saltati (permessi o campi sincronizzati da Halo)` : ""}`);
      setValue("");
      await onDone();
      onClear();
    } catch (e) {
      notify("Errore", `${(e as Error).message} (${ok} aggiornati prima dell'errore)`, true);
      await onDone();
    } finally { setBusy(false); }
  };

  const listId = "bulk-values";
  const options = action === "assignee" ? assignees : action === "site" ? sites : action.startsWith("tag") ? allTags : [];
  const isGroup = action === "group_add" || action === "group_remove";

  return (
    <div className="sticky top-16 z-20 flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-card p-3 shadow-sm">
      <span className="text-sm font-medium">{selected.length} selezionati</span>
      <Select value={action} onValueChange={(v) => { setAction(v as Action); setValue(""); }}>
        <SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="tag_add">Aggiungi tag</SelectItem>
          <SelectItem value="tag_remove">Rimuovi tag</SelectItem>
          <SelectItem value="group_add" disabled={!groups.length}>Aggiungi a gruppo</SelectItem>
          <SelectItem value="group_remove" disabled={!groups.length}>Togli dal gruppo</SelectItem>
          <SelectItem value="assignee">Assegna a persona</SelectItem>
          <SelectItem value="site">Imposta location</SelectItem>
        </SelectContent>
      </Select>
      {isGroup ? (
        <Select value={value} onValueChange={setValue}>
          <SelectTrigger className="h-9 w-48"><SelectValue placeholder="Scegli gruppo" /></SelectTrigger>
          <SelectContent>{groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent>
        </Select>
      ) : (
        <>
          <Input list={listId} className="h-9 w-56" value={value} onChange={(e) => setValue(e.target.value)}
            placeholder={action === "assignee" ? "Persona o reparto" : action === "site" ? "Location / sito" : "Tag"}
            onKeyDown={(e) => e.key === "Enter" && apply()} />
          <datalist id={listId}>{options.map((o) => <option key={o} value={o} />)}</datalist>
        </>
      )}
      <Button size="sm" onClick={apply} disabled={busy || !value.trim()}>{busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Applica</Button>
      <Button size="sm" variant="ghost" onClick={onClear}><X className="mr-1 h-4 w-4" />Deseleziona</Button>
    </div>
  );
}
