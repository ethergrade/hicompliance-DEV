import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, X } from "lucide-react";
import { getErrorDetail } from "@/lib/api-client";
import { managedAssetsApi, type AssetCollection } from "@/lib/api/managed-assets";

type Action = "tag_add" | "tag_remove" | "group_add" | "group_remove" | "assignee" | "site";

/**
 * Modifica multipla: tag, gruppi, persona assegnataria e location sugli asset
 * selezionati. Le regole le applica il server in una chiamata: salta gli asset
 * che l'utente non può modificare e, su quelli del gestionale, persona e
 * location.
 */
export function BulkEditBar({ orgId, groupId, selectedIds, canWrite, assignees, sites, allTags, groups, onDone, onClear, notify }: {
  orgId: string; groupId: string | null; selectedIds: string[]; canWrite: boolean;
  assignees: string[]; sites: string[]; allTags: string[]; groups: AssetCollection[];
  onDone: () => Promise<void> | void; onClear: () => void;
  notify: (title: string, description: string, error?: boolean) => void;
}) {
  const [action, setAction] = useState<Action>(canWrite ? "tag_add" : "group_add");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  if (!selectedIds.length) return null;

  const apply = async () => {
    const v = value.trim();
    if (!v) return;
    setBusy(true);
    try {
      if (action === "group_add" || action === "group_remove") {
        await managedAssetsApi.updateCollectionAssets(orgId, groupId, v, action === "group_add" ? { add: selectedIds } : { remove: selectedIds });
        notify("Gruppo aggiornato", `${selectedIds.length} asset ${action === "group_add" ? "aggiunti" : "tolti"}`);
      } else {
        const r = await managedAssetsApi.bulk(orgId, groupId, {
          ids: selectedIds,
          ...(action === "tag_add" ? { addTags: [v] } : action === "tag_remove" ? { removeTags: [v] } : { [action]: v }),
        });
        notify("Modifica multipla completata", `${r.updated} asset aggiornati${r.skipped ? `, ${r.skipped} saltati (permessi o campi del gestionale)` : ""}`);
      }
      setValue("");
      await onDone();
      onClear();
    } catch (e) {
      notify("Errore", getErrorDetail(e), true);
    } finally { setBusy(false); }
  };

  const listId = "bulk-values";
  const options = action === "assignee" ? assignees : action === "site" ? sites : action.startsWith("tag") ? allTags : [];
  const isGroup = action === "group_add" || action === "group_remove";

  return (
    <div className="sticky top-16 z-20 flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-card p-3 shadow-sm">
      <span className="text-sm font-medium">{selectedIds.length} selezionati</span>
      <Select value={action} onValueChange={(v) => { setAction(v as Action); setValue(""); }}>
        <SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger>
        <SelectContent>
          {canWrite && <SelectItem value="tag_add">Aggiungi tag</SelectItem>}
          {canWrite && <SelectItem value="tag_remove">Rimuovi tag</SelectItem>}
          <SelectItem value="group_add" disabled={!groups.length}>Aggiungi a gruppo</SelectItem>
          <SelectItem value="group_remove" disabled={!groups.length}>Togli dal gruppo</SelectItem>
          {canWrite && <SelectItem value="assignee">Assegna a persona</SelectItem>}
          {canWrite && <SelectItem value="site">Imposta location</SelectItem>}
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
