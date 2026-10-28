import React, { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw, Link2, Unlink, Search } from "lucide-react";
import { getErrorDetail } from "@/lib/api-client";
import { haloAdminApi, haloSyncRunning, type HaloClientOption, type HaloLink } from "@/lib/api/managed-assets";

/**
 * Super-admin: collegamento del cliente al suo cliente Halo e sync degli asset.
 * La sync gira in coda sul server: mentre è in corso si rilegge lo stato ogni
 * pochi secondi e alla fine si ricarica il registro.
 */
export function HaloLinkPanel({ orgId, onSynced, notify }: {
  orgId: string;
  onSynced: () => void;
  notify: (title: string, description: string, error?: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const key = ["asset-management", "halo-link", orgId];
  const linkQ = useQuery({
    queryKey: key,
    queryFn: () => haloAdminApi.link(orgId),
    refetchInterval: (q) => (haloSyncRunning(q.state.data as HaloLink | null | undefined) ? 3000 : false),
  });
  const link = linkQ.data ?? null;
  const running = haloSyncRunning(link);

  // Fine della sync: il registro va riletto
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !running) onSynced();
    wasRunning.current = running;
  }, [running, onSynced]);

  const [search, setSearch] = useState("");
  const [results, setResults] = useState<HaloClientOption[] | null>(null);
  const [busy, setBusy] = useState<"search" | "link" | "sync" | "unlink" | null>(null);

  const run = async (what: NonNullable<typeof busy>, fn: () => Promise<void>) => {
    setBusy(what);
    try { await fn(); } catch (e) { notify("Errore", getErrorDetail(e), true); } finally { setBusy(null); }
  };
  const put = (l: HaloLink | null) => { queryClient.setQueryData(key, l); };

  const doSearch = () => run("search", async () => setResults(await haloAdminApi.clients(search.trim())));
  const doLink = (c: HaloClientOption) => run("link", async () => {
    put(await haloAdminApi.setLink(orgId, c.id));
    setResults(null); setSearch("");
    notify("Cliente collegato", `${c.name}: prima sincronizzazione avviata`);
  });
  const doSync = () => run("sync", async () => put(await haloAdminApi.sync(orgId)));
  const doUnlink = () => {
    if (!window.confirm("Scollegare il cliente da Halo? Gli asset importati restano nel registro, sbloccati.")) return;
    void run("unlink", async () => { await haloAdminApi.unlink(orgId); put(null); onSynced(); });
  };

  const counts = link?.lastSyncCounts;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="text-base">Halo · Asset Management</CardTitle></CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            Gli asset del registro arrivano da Halo in sola lettura, ogni notte e quando lanci la sincronizzazione.
            Nel registro il cliente li vede come "Gestionale", con i campi sincronizzati bloccati.
          </p>
          {linkQ.isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : link ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span>Collegato a <strong>{link.haloClientName ?? link.haloClientId}</strong></span>
                <Badge variant="outline">ID Halo {link.haloClientId}</Badge>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {running ? <Badge variant="secondary"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Sincronizzazione in corso</Badge>
                  : link.lastSyncStatus === "ok" ? <Badge variant="outline" className="border-cyber-green text-cyber-green">Ultima sincronizzazione riuscita</Badge>
                  : link.lastSyncStatus === "error" ? <Badge variant="destructive">Ultima sincronizzazione non riuscita</Badge>
                  : link.lastSyncStatus === "running" ? <Badge variant="destructive">Sincronizzazione interrotta</Badge>
                  : <Badge variant="secondary">Mai sincronizzato</Badge>}
                {link.lastSyncAt && !running && <span className="text-xs text-muted-foreground">{new Date(link.lastSyncAt).toLocaleString("it-IT")}</span>}
              </div>
              {link.lastSyncMessage && !running && <p>{link.lastSyncMessage}</p>}
              {counts && !running && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {([["Letti", counts.read], ["Nuovi", counts.created], ["Aggiornati", counts.updated], ["Invariati", counts.unchanged], ["Non più in Halo", counts.removed]] as const).map(([l, v]) => (
                    <div key={l} className="rounded-md border p-2"><p className="text-xs text-muted-foreground">{l}</p><p className="font-semibold">{v}</p></div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={doSync} disabled={running || !!busy}>
                  {busy === "sync" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}Sincronizza ora
                </Button>
                <Button size="sm" variant="outline" onClick={doUnlink} disabled={running || !!busy}><Unlink className="w-4 h-4 mr-1" />Scollega</Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Halo limita le chiamate: per un cliente con molti asset la sincronizzazione può richiedere qualche minuto.
                Gli asset spariti da Halo non si cancellano: restano segnati come "Non più nel gestionale" e si possono eliminare a mano.
              </p>
            </div>
          ) : <p>Il cliente non è collegato a Halo: gli asset si gestiscono solo a mano o da Excel.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">{link ? "Cambia cliente Halo" : "Collega un cliente Halo"}</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex gap-2">
            <Input placeholder="Nome del cliente in Halo" value={search} maxLength={100}
              onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doSearch()} />
            <Button variant="outline" onClick={doSearch} disabled={!!busy}>
              {busy === "search" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Search className="w-4 h-4 mr-1" />}Cerca
            </Button>
          </div>
          {results && (results.length ? (
            <ul className="divide-y rounded-md border">
              {results.map((c) => {
                const current = c.id === link?.haloClientId;
                const altrove = !!c.linkedTenantId && c.linkedTenantId !== orgId;
                return (
                  <li key={c.id} className="flex items-center justify-between gap-2 p-2">
                    <span>{c.name} <span className="text-xs text-muted-foreground">#{c.id}</span></span>
                    {current ? <Badge variant="outline">Collegato</Badge>
                      : altrove ? <span className="text-xs text-muted-foreground">Già collegato a un altro cliente</span>
                      : <Button size="sm" variant="outline" disabled={!!busy || running} onClick={() => doLink(c)}><Link2 className="w-4 h-4 mr-1" />Collega</Button>}
                  </li>
                );
              })}
            </ul>
          ) : <p className="text-muted-foreground">Nessun cliente Halo trovato.</p>)}
          {link && <p className="text-xs text-muted-foreground">Cambiando cliente, gli asset del cliente precedente risulteranno "Non più nel gestionale" alla prossima sincronizzazione.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
