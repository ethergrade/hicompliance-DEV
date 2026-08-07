import React, { useMemo, useState } from "react";
import {
  Activity,
  Database,
  Monitor,
  RefreshCw,
  Server,
  ShieldAlert,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useHiTrackDashboard, useHiTrackSyncNow } from "@/hooks/useHiTrackDashboard";
import {
  classifyUsageStatus,
  formatFreshness,
  formatGiB,
  formatMillis,
  formatPercent,
  pickTrend,
} from "@/lib/hitrack/formatters";
import type { HiTrackTrendWindow } from "@/lib/hitrack/types";

const statusBadgeClassName: Record<string, string> = {
  success: "bg-green-500/15 text-green-400 border-green-500/20",
  warning: "bg-amber-500/15 text-amber-300 border-amber-500/20",
  error: "bg-red-500/15 text-red-400 border-red-500/20",
  muted: "bg-muted text-muted-foreground border-border",
};

const usageBarClassName: Record<string, string> = {
  success: "bg-green-500",
  warning: "bg-amber-500",
  error: "bg-red-500",
  muted: "bg-muted",
};

const PER_PAGINA = 10;

/**
 * Le righe di dischi e RAM arrivano già ordinate per criticità dal backend.
 * Qui si mostra una pagina per volta: su un impianto grande sono decine di
 * schede, e una colonna lunga quanto tre schermate non si legge.
 */
function usePagina<T>(righe: T[]) {
  const [pagina, setPagina] = useState(0);

  const pagine = Math.max(1, Math.ceil(righe.length / PER_PAGINA));
  // Un sync può accorciare l'elenco sotto i piedi: senza questo si resterebbe su
  // una pagina che non esiste più, cioè su un pannello vuoto.
  const corrente = Math.min(pagina, pagine - 1);
  const da = corrente * PER_PAGINA;

  return {
    pagina: corrente,
    pagine,
    totale: righe.length,
    da,
    visibili: righe.slice(da, da + PER_PAGINA),
    vai: setPagina,
  };
}

const Paginatore: React.FC<{ stato: ReturnType<typeof usePagina<unknown>> }> = ({ stato }) => {
  if (stato.totale <= PER_PAGINA) return null;

  return (
    <div className="flex items-center justify-between pt-1">
      <p className="text-xs text-muted-foreground">
        {stato.da + 1}–{Math.min(stato.da + PER_PAGINA, stato.totale)} di {stato.totale}
      </p>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={stato.pagina === 0}
          onClick={() => stato.vai(stato.pagina - 1)}
        >
          Precedenti
        </Button>
        <span className="text-xs text-muted-foreground">
          {stato.pagina + 1} / {stato.pagine}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={stato.pagina >= stato.pagine - 1}
          onClick={() => stato.vai(stato.pagina + 1)}
        >
          Successivi
        </Button>
      </div>
    </div>
  );
};

const Sparkline: React.FC<{ values: number[] }> = ({ values }) => {
  const normalized = values.length > 0 ? values : [0];
  const max = Math.max(...normalized, 1);
  const points = normalized.map((value, index) => {
    const x = normalized.length === 1 ? 0 : (index / (normalized.length - 1)) * 100;
    const y = 100 - (value / max) * 100;
    return `${x},${y}`;
  });

  return (
    <svg viewBox="0 0 100 100" className="h-10 w-28 text-emerald-400">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points.join(" ")}
      />
    </svg>
  );
};

export const HiTrackDashboard: React.FC = () => {
  const { data, isLoading, isFetching } = useHiTrackDashboard();
  const syncMutation = useHiTrackSyncNow();
  const [trendWindow, setTrendWindow] = useState<HiTrackTrendWindow>("24h");
  const paginaDischi = usePagina(data.logicalDisks);
  const paginaRam = usePagina(data.ramMonitoring);

  const onlineRatio = useMemo(() => {
    if (data.overview.monitoredDevices === 0) return 0;
    return (data.overview.onlineDevices / data.overview.monitoredDevices) * 100;
  }, [data.overview.monitoredDevices, data.overview.onlineDevices]);

  // Il blocco «Supabase non configurato» che stava qui è caduto con la
  // migrazione: i dati arrivano dal backend, non c'è più niente da configurare
  // nel browser.

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card className="border-border">
          <CardContent className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <Monitor className="h-4 w-4" />
              </div>
              <Badge variant="outline">{data.overview.managedDevices} managed</Badge>
            </div>
            <p className="text-sm text-muted-foreground">Dispositivi monitorati</p>
            <p className="mt-2 text-3xl font-bold">{data.overview.monitoredDevices}</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="rounded-lg bg-green-500/10 p-2 text-green-400">
                <Server className="h-4 w-4" />
              </div>
              <Badge className={statusBadgeClassName.success}>online</Badge>
            </div>
            <p className="text-sm text-muted-foreground">Disponibilità runtime</p>
            <p className="mt-2 text-3xl font-bold">{formatPercent(onlineRatio)}</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="rounded-lg bg-amber-500/10 p-2 text-amber-300">
                <Activity className="h-4 w-4" />
              </div>
              <Badge variant="outline">{data.overview.openAlerts} open</Badge>
            </div>
            <p className="text-sm text-muted-foreground">Health Score</p>
            <p className="mt-2 text-3xl font-bold">
              {formatPercent(data.overview.healthScore)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="rounded-lg bg-cyan-500/10 p-2 text-cyan-300">
                <Database className="h-4 w-4" />
              </div>
              <Badge variant="outline">
                {formatFreshness(data.overview.freshnessSeconds)}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">Data Coverage</p>
            <p className="mt-2 text-3xl font-bold">
              {formatPercent(data.overview.dataCoveragePercent)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg">Monitoring Overview</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Ultimo aggiornamento {formatFreshness(data.overview.freshnessSeconds)} fa
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => syncMutation.mutate(undefined)}
              disabled={syncMutation.isPending || isLoading}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${syncMutation.isPending || isFetching ? "animate-spin" : ""}`}
              />
              Sincronizza ora
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-border p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium">Collector coverage</p>
              <Badge variant="outline">{data.collectors.length} collector</Badge>
            </div>
            <div className="space-y-3">
              {data.collectors.map((collector) => (
                <div key={collector.id} className="rounded-lg border border-border p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{collector.collectorName}</p>
                      {/* L'identificativo dell'agent e la regola di matching sono
                          dettagli della piattaforma di raccolta: al cliente non
                          servono e dicono da chi arriva il dato. Restano visibili
                          in configurazione, dove servono davvero. */}
                      <p className="text-xs text-muted-foreground">
                        Copertura dati {formatPercent(collector.dataCoveragePercent)}
                      </p>
                    </div>
                    <Badge
                      className={
                        statusBadgeClassName[
                          collector.collectorStatus === "ONLINE" ? "success" : "warning"
                        ]
                      }
                    >
                      {collector.collectorStatus}
                    </Badge>
                  </div>
                  <Progress value={collector.dataCoveragePercent} />
                </div>
              ))}
              {data.collectors.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Nessun collector configurato per questo cliente.
                </p>
              )}
            </div>
          </div>
          <div className="rounded-xl border border-border p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium">Coverage reale</p>
              <Badge variant="outline">{formatPercent(data.overview.dataCoveragePercent)}</Badge>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span>RTD su managed device</span>
                <span>
                  {data.dataCoverage.monitoredDevicesWithRtd}/{data.dataCoverage.managedDevices}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>RAM verificata</span>
                <span>{formatPercent(data.dataCoverage.ramCoveragePercent)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Dischi verificati</span>
                <span>{formatPercent(data.dataCoverage.diskCoveragePercent)}</span>
              </div>
              <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                {data.dataCoverage.note || "Dato non disponibile"}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-lg">Monitored Devices</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Device</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>RTD Worst</TableHead>
                <TableHead>RTD Median</TableHead>
                <TableHead>Packet Loss</TableHead>
                <TableHead>OS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.monitoredDevices.map((device) => (
                <TableRow key={device.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{device.deviceName}</p>
                      <p className="text-xs text-muted-foreground">
                        {device.type} · {device.vendor || "Vendor N/D"}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>{device.ipAddress || "Dato non disponibile"}</TableCell>
                  <TableCell>
                    <Badge className={statusBadgeClassName[device.statusType]}>
                      {device.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatMillis(device.rtdWorstMs)}</TableCell>
                  <TableCell>{formatMillis(device.rtdMedianMs)}</TableCell>
                  <TableCell>{formatPercent(device.packetLossPercent)}</TableCell>
                  <TableCell>
                    {[device.osName, device.osVersion].filter(Boolean).join(" ") ||
                      "Dato non disponibile"}
                  </TableCell>
                </TableRow>
              ))}
              {data.monitoredDevices.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                    Nessun dispositivo gestito disponibile.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Logical Disks & Disk Space</CardTitle>
              <div className="flex gap-2">
                {(["24h", "7d", "30d"] as HiTrackTrendWindow[]).map((window) => (
                  <Button
                    key={window}
                    size="sm"
                    variant={trendWindow === window ? "default" : "outline"}
                    onClick={() => setTrendWindow(window)}
                  >
                    {window}
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.logicalDisks.length === 0 && (
              <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                Nessun dato sui dischi per questa rete. Compaiono qui i dispositivi
                che espongono capacità e occupazione in modo leggibile.
              </div>
            )}
            {paginaDischi.visibili.map((disk) => {
              const usageState = classifyUsageStatus(disk.usagePercent);
              return (
                <div key={disk.id} className="rounded-xl border border-border p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      {/* Il datastore è il soggetto della riga; il dispositivo da
                          cui è misurato e l'id interno di vCenter restano sotto. */}
                      <p className="font-medium">{disk.diskLabel}</p>
                      <p className="text-xs text-muted-foreground">
                        {disk.deviceName}
                        {disk.dimensionKey ? ` · ${disk.dimensionKey}` : ""} ·{" "}
                        {disk.collectorName}
                      </p>
                    </div>
                    <Badge className={statusBadgeClassName[usageState]}>
                      {formatPercent(disk.usagePercent)}
                    </Badge>
                  </div>
                  <div className="mb-3 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground">Size</p>
                      <p>{formatGiB(disk.sizeGiB)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Free Space</p>
                      <p>{formatGiB(disk.freeSpaceGiB)}</p>
                    </div>
                  </div>
                  <Progress
                    value={disk.usagePercent ?? 0}
                    indicatorClassName={usageBarClassName[usageState]}
                  />
                  <div className="mt-3 flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      {disk.ipAddress || "IP non disponibile"}
                    </p>
                    <Sparkline values={pickTrend(disk, trendWindow)} />
                  </div>
                </div>
              );
            })}
            <Paginatore stato={paginaDischi} />
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">RAM Monitoring</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.ramMonitoring.length === 0 && (
              <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                Nessun dato sulla memoria per questa rete. Compaiono qui i dispositivi
                che espongono memoria totale e utilizzo.
              </div>
            )}
            {paginaRam.visibili.map((ram) => {
              const usageState = classifyUsageStatus(ram.usagePercent);
              return (
                <div key={ram.id} className="rounded-xl border border-border p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      {/* Su un vCenter ogni riga è un host ESXi: senza il suo nome
                          le schede sarebbero tutte intitolate «Vcenter». */}
                      <p className="font-medium">
                        {ram.dimensionLabel || ram.deviceName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {ram.dimensionLabel ? `${ram.deviceName} · ` : ""}
                        {ram.collectorName} · {ram.ipAddress || "IP non disponibile"}
                      </p>
                    </div>
                    <Badge className={statusBadgeClassName[usageState]}>
                      {formatPercent(ram.usagePercent)}
                    </Badge>
                  </div>
                  <div className="mb-3 grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground">Totale</p>
                      <p>{formatGiB(ram.totalRamGiB)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Usata</p>
                      <p>{formatGiB(ram.usedRamGiB)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Libera</p>
                      <p>{formatGiB(ram.freeRamGiB)}</p>
                    </div>
                  </div>
                  <Progress
                    value={ram.usagePercent ?? 0}
                    indicatorClassName={usageBarClassName[usageState]}
                  />
                  <div className="mt-3 flex items-center justify-between">
                    <Badge className={statusBadgeClassName[ram.statusType]}>
                      {ram.status}
                    </Badge>
                    <Sparkline values={pickTrend(ram, trendWindow)} />
                  </div>
                </div>
              );
            })}
            <Paginatore stato={paginaRam} />
          </CardContent>
        </Card>
      </div>

      {data.overview.openAlerts > 0 && (
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="flex items-start gap-3 p-4">
            <ShieldAlert className="mt-0.5 h-5 w-5 text-amber-300" />
            <div>
              <p className="font-medium">Alert aperti</p>
              <p className="text-sm text-muted-foreground">
                Gli alert aperti sulla rete monitorata entrano nel calcolo dell'Health
                Score e restano a peso finché non vengono chiusi.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
