import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Info, AlertTriangle, Loader2, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RiskScoreCard } from './RiskScoreCard';
import { CveIdButton, CveLink, VulnerabilitiesTable } from './VulnerabilitiesTable';
import { CveDetailDialog } from '@/components/surface-scan/CveDetailDialog';
import { severityColors } from './vulnerabilitySeverity';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { OsPatchesTable } from './OsPatchesTable';
import { SoftwarePatchesTable } from './SoftwarePatchesTable';
import { useHipatchDashboard } from '@/hooks/useHipatch';

// ─── Severity helpers ─────────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<string, number> = {
  critical: 4, high: 3, medium: 2, low: 1,
};

const normalizeSeverity = (s: string): 'Low' | 'Medium' | 'High' | 'Critical' => {
  const l = s?.toLowerCase() ?? '';
  if (l === 'critical') return 'Critical';
  if (l === 'high') return 'High';
  if (l === 'medium') return 'Medium';
  return 'Low';
};

const riskScoreColor = (score: number): 'green' | 'yellow' | 'orange' | 'red' => {
  if (score >= 9) return 'red';
  if (score >= 7) return 'orange';
  if (score >= 4) return 'yellow';
  return 'green';
};

const riskScoreLabel = (score: number): string => {
  if (score >= 9) return 'Critico';
  if (score >= 7) return 'Alto';
  if (score >= 4) return 'Moderato';
  return 'Basso';
};

const ringForColor = (c: 'green' | 'yellow' | 'orange' | 'red' | 'neutral') =>
  ({ green: '#10b981', yellow: '#eab308', orange: '#f59e0b', red: '#ef4444', neutral: '#64748b' }[c]);

/**
 * Il backend distingue "zero" da "non lo so": restituisce null sui punteggi
 * quando mancano i dati (un tenant senza run, o con run ma senza i CSV degli
 * asset). Mostrare 0 renderebbe quei casi come "rischio Basso", verde — cioe'
 * un'affermazione falsa proprio dove non abbiamo il dato.
 */
const NOT_AVAILABLE = 'n/d';

const scoreCardProps = (
  value: number | null | undefined,
  /** Porta il valore sulla scala 0-10 usata da riskScoreColor/Label. */
  toScale: (v: number) => number,
  /** Porta il valore sulla scala 0-100 dell'anello. */
  toRing: (v: number) => number,
) => {
  if (value == null) {
    return {
      level: NOT_AVAILABLE,
      levelColor: 'neutral' as const,
      score: 0,
      ringColor: ringForColor('neutral'),
    };
  }
  const color = riskScoreColor(toScale(value));
  return {
    level: riskScoreLabel(toScale(value)),
    levelColor: color,
    score: Math.round(toRing(value)),
    ringColor: ringForColor(color),
  };
};

// ─── Summary cards ────────────────────────────────────────────────────────────

const SeverityBadge: React.FC<{ label: string; count: number; color: string }> = ({ label, count, color }) => (
  <div className={`flex flex-col items-center justify-center rounded-lg p-3 ${color}`}>
    <span className="text-2xl font-bold">{count}</span>
    <span className="text-xs font-medium capitalize">{label}</span>
  </div>
);

type MappedCve = {
  id: string;
  description?: string;
  score: number;
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  assets?: import('@/lib/api/hipatch').HipatchCveAsset[];
};

// ─── Component ────────────────────────────────────────────────────────────────

export const HiPatchDashboard: React.FC = () => {
  const { data, isLoading, error } = useHipatchDashboard();

  const { summary, assets, cves, osPatchesPending, osPatchesInstalled, softwarePatchesPending, softwarePatchesInstalled } = data ?? {
    summary: null, assets: [], cves: [], osPatchesPending: [], osPatchesInstalled: [],
    softwarePatchesPending: [], softwarePatchesInstalled: [],
  };

  const [assetPage, setAssetPage] = useState(0);
  const [assetQuery, setAssetQuery] = useState('');
  const [assetCvesOpen, setAssetCvesOpen] = useState<{ name: string; cves: MappedCve[] } | null>(null);
  const [detailCve, setDetailCve] = useState<string | null>(null);
  const assetPageSize = 10;

  // Map CVEs → VulnerabilitiesTable format
  const mappedCves: MappedCve[] = useMemo(() =>
    [...cves]
      .sort((a, b) => (SEVERITY_ORDER[b.severity?.toLowerCase()] ?? 0) - (SEVERITY_ORDER[a.severity?.toLowerCase()] ?? 0))
      .map((c) => ({
        id: c.problem_name,
        description: c.description,
        score: Number(c.epss_score) || 0,
        severity: normalizeSeverity(c.severity),
        assets: c.assets,
      })),
  [cves]);

  // Le CVE di ogni asset, ricavate dagli asset di ogni CVE: la tabella asset
  // mostra quante ne ha e la peggiore, e da lì si apre l'elenco. Gli asset più
  // esposti salgono in cima.
  const cvesByAsset = useMemo(() => {
    const map = new Map<string, MappedCve[]>();
    for (const cve of mappedCves) {
      for (const asset of cve.assets ?? []) {
        const id = asset['data.id'];
        if (!id) continue;
        if (!map.has(id)) map.set(id, []);
        map.get(id)!.push(cve);
      }
    }
    return map;
  }, [mappedCves]);

  const sortedAssets = useMemo(() => {
    const worst = (a: typeof assets[number]) => {
      const list = cvesByAsset.get(a['data.id'] ?? '') ?? [];
      return [SEVERITY_ORDER[list[0]?.severity.toLowerCase() ?? ''] ?? 0, list.length] as const;
    };
    // Gli "other_asset" (IP senza hostname né OS) vanno in fondo: sono la
    // maggioranza su alcuni clienti e coprirebbero i dispositivi veri.
    const unrecognized = (a: typeof assets[number]) => (a['data.asset_type'] === 'other_asset' ? 1 : 0);
    return [...assets].sort((a, b) => {
      const [sa, na] = worst(a);
      const [sb, nb] = worst(b);
      return unrecognized(a) - unrecognized(b) || sb - sa || nb - na;
    });
  }, [assets, cvesByAsset]);

  // Ricerca per nome, hostname o IP: su clienti con migliaia di asset
  // (Panapesca ne ha oltre seimila) sfogliare le pagine non basta.
  const filteredAssets = useMemo(() => {
    const q = assetQuery.trim().toLowerCase();
    if (!q) return sortedAssets;
    return sortedAssets.filter((a) =>
      [a['data.name'], a['data.host_name'], a['data.ip']].some((v) => (v ?? '').toLowerCase().includes(q)),
    );
  }, [sortedAssets, assetQuery]);

  const assetTotalPages = Math.ceil(filteredAssets.length / assetPageSize);
  const assetSlice = filteredAssets.slice(assetPage * assetPageSize, (assetPage + 1) * assetPageSize);

  // Map OS patches → OsPatchesTable format
  const mappedOsPending = useMemo(() =>
    osPatchesPending.map((p) => ({
      systemName: p.device_name ?? '-',
      patch: p.name ?? '',
      patchType: p.type ?? '',
      kbNumber: p.kbNumber ?? '',
      severity: p.severity ?? '',
    })),
  [osPatchesPending]);

  const mappedOsInstalled = useMemo(() =>
    [...osPatchesInstalled]
      .sort((a, b) => {
        if (a.status?.toUpperCase() === 'FAILED' && b.status?.toUpperCase() !== 'FAILED') return -1;
        if (a.status?.toUpperCase() !== 'FAILED' && b.status?.toUpperCase() === 'FAILED') return 1;
        return (b.installedAt ?? '').localeCompare(a.installedAt ?? '');
      })
      .map((p) => ({
        systemName: p.device_name ?? '-',
        patch: p.name ?? '',
        patchType: p.type ?? '',
        kbNumber: p.kbNumber ?? '',
        status: p.status ?? '',
        installedAt: p.installedAt,
      })),
  [osPatchesInstalled]);

  // Map Software patches → SoftwarePatchesTable format
  const mappedSwPending = useMemo(() =>
    [...softwarePatchesPending]
      .sort((a, b) => {
        if (a.impact?.toUpperCase() === 'CRITICAL' && b.impact?.toUpperCase() !== 'CRITICAL') return -1;
        if (a.impact?.toUpperCase() !== 'CRITICAL' && b.impact?.toUpperCase() === 'CRITICAL') return 1;
        return 0;
      })
      .map((p) => ({
        systemName: p.device_name ?? '-',
        patchType: p.type ?? '',
        title: p.title ?? '',
        impact: p.impact ?? '',
        status: p.status ?? '',
      })),
  [softwarePatchesPending]);

  const mappedSwInstalled = useMemo(() =>
    [...softwarePatchesInstalled]
      .sort((a, b) => {
        if (a.status?.toUpperCase() === 'FAILED' && b.status?.toUpperCase() !== 'FAILED') return -1;
        if (a.status?.toUpperCase() !== 'FAILED' && b.status?.toUpperCase() === 'FAILED') return 1;
        return (b.installedAt ?? '').localeCompare(a.installedAt ?? '');
      })
      .map((p) => ({
        systemName: p.device_name ?? '-',
        product: p.title ?? '-',
        type: p.type ?? '-',
        status: p.status ?? '',
        installedAt: p.installedAt,
      })),
  [softwarePatchesInstalled]);

  // Risk score values from summary
  const avgRisk = summary?.avg_risk_score ?? null;
  const maxRisk = summary?.max_risk_score ?? null;
  const patchRiskPct = summary?.patch_risk_percent ?? null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Caricamento dati HiPatch...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
        <AlertTriangle className="w-5 h-5" />
        <span>Dati HiPatch non disponibili</span>
      </div>
    );
  }

  return (
    <div className="space-y-8">

      {/* Summary KPI strip */}
      {summary && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Riepilogo</h2>
            {summary.last_updated && (
              <span className="text-xs text-muted-foreground">
                Ultimo aggiornamento: {(() => {
                  const iso = summary.last_updated.replace('_', 'T').replace(/-(\d{2})-(\d{2})$/, ':$1:$2');
                  const d = new Date(iso + 'Z');
                  return isNaN(d.getTime()) ? summary.last_updated.replace('_', ' ') : d.toLocaleString('it-IT', { timeZone: 'Europe/Rome' });
                })()}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-border">
              <CardContent className="pt-6 text-center">
                <p className="text-3xl font-bold">{summary.total_assets}</p>
                <p className="text-sm text-muted-foreground mt-1">Asset monitorati</p>
                {(summary.unrecognized_assets ?? 0) > 0 && (
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    + {summary.unrecognized_assets} non riconosciuti
                  </p>
                )}
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardContent className="pt-6 text-center">
                <p className="text-3xl font-bold">{summary.total_cves}</p>
                <p className="text-sm text-muted-foreground mt-1">CVE rilevate</p>
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardContent className="pt-6 text-center">
                <p className="text-3xl font-bold">{summary.pending_os_patches}</p>
                <p className="text-sm text-muted-foreground mt-1">Patch OS in attesa</p>
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardContent className="pt-6 text-center">
                <p className="text-3xl font-bold">
                  {patchRiskPct == null ? NOT_AVAILABLE : `${patchRiskPct.toFixed(1)}%`}
                </p>
                <p className="text-sm text-muted-foreground mt-1">Patch Risk</p>
              </CardContent>
            </Card>
          </div>

          {/* CVE by severity */}
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-lg">CVE per severità</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-5 gap-3">
                <SeverityBadge label="Critical" count={summary.cve_by_severity.critical} color="bg-red-500/10 text-red-500" />
                <SeverityBadge label="High" count={summary.cve_by_severity.high} color="bg-orange-500/10 text-orange-500" />
                <SeverityBadge label="Medium" count={summary.cve_by_severity.medium} color="bg-yellow-500/10 text-yellow-500" />
                <SeverityBadge label="Low" count={summary.cve_by_severity.low} color="bg-green-500/10 text-green-500" />
                <SeverityBadge label="Info" count={summary.cve_by_severity.info} color="bg-muted/50 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {/* Risk Scores */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Risk Score</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <RiskScoreCard
            title="Avg CVSS Score"
            {...scoreCardProps(avgRisk, (v) => v, (v) => v * 10)}
          />
          <RiskScoreCard
            title="Max CVSS Score"
            {...scoreCardProps(maxRisk, (v) => v, (v) => v * 10)}
          />
          <RiskScoreCard
            title="Patch Risk"
            {...scoreCardProps(patchRiskPct, (v) => v / 10, (v) => v)}
          />
        </div>
      </section>

      {/* CVE / Vulnerabilities */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">CVE rilevate</h2>
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-lg">
              Vulnerabilità
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {mappedCves.length > 0
                ? (() => {
                    const affectedIds = new Set(mappedCves.flatMap(c => (c.assets ?? []).map(a => a['data.id'])));
                    const devicePart = affectedIds.size > 0 ? ` su ${affectedIds.size} device` : '';
                    return `${mappedCves.length} CVE${devicePart} — ordinate per severità`;
                  })()
                : data?.cvesFailed
                  ? 'Elenco delle CVE non disponibile'
                  : 'Nessuna CVE rilevata'}
            </p>
          </CardHeader>
          <CardContent>
            {mappedCves.length > 0 ? (
              <VulnerabilitiesTable vulnerabilities={mappedCves} />
            ) : data?.cvesFailed ? (
              <div className="text-center py-8 text-sm text-destructive">
                <AlertTriangle className="w-10 h-10 mx-auto mb-2 opacity-60" />
                Non è stato possibile caricare l'elenco delle CVE. Riprova più tardi.
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <Info className="w-10 h-10 mx-auto mb-2 opacity-30" />
                Nessun dato disponibile
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Assets monitorati */}
      {assets.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-2xl font-bold">Asset monitorati</h2>
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-lg">Asset</CardTitle>
              <p className="text-sm text-muted-foreground">{assets.length} asset rilevati</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative w-full max-w-sm">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={assetQuery}
                    onChange={(e) => { setAssetQuery(e.target.value); setAssetPage(0); }}
                    placeholder="Cerca per nome o IP…"
                    className="pl-8"
                  />
                </div>
                {assetQuery.trim() !== '' && (
                  <span className="text-sm text-muted-foreground">
                    {filteredAssets.length} di {assets.length}
                  </span>
                )}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>OS</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Importance</TableHead>
                    <TableHead>CVE</TableHead>
                    <TableHead>Last ping</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assetSlice.map((a, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <div className="font-medium">{a['data.name'] || a['data.ip'] || '-'}</div>
                        {a['data.host_name'] && a['data.host_name'] !== a['data.name'] && (
                          <div className="text-xs text-muted-foreground">{a['data.host_name']}</div>
                        )}
                      </TableCell>
                      <TableCell>{a['data.ip'] || '-'}</TableCell>
                      <TableCell>{a['data.os_full_name'] || a['data.os_name'] || '-'}</TableCell>
                      <TableCell>{a['data.asset_type'] === 'other_asset' ? 'non riconosciuto' : a['data.asset_type'] || '-'}</TableCell>
                      <TableCell>
                        {a['data.importance'] ? (
                          <Badge className={a['data.importance'].toLowerCase() === 'critical'
                            ? 'bg-red-500/20 text-red-500'
                            : 'bg-muted text-muted-foreground'}>
                            {a['data.importance']}
                          </Badge>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const list = cvesByAsset.get(a['data.id'] ?? '') ?? [];
                          if (list.length === 0) return <span className="text-muted-foreground">-</span>;
                          return (
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-2"
                              onClick={() => setAssetCvesOpen({ name: a['data.name'] || a['data.ip'] || '-', cves: list })}
                            >
                              {list.length} CVE
                              <Badge className={cn('font-medium', severityColors[list[0].severity])}>{list[0].severity}</Badge>
                            </Button>
                          );
                        })()}
                      </TableCell>
                      <TableCell>{a['data.last_ping_time'] || '-'}</TableCell>
                    </TableRow>
                  ))}
                  {filteredAssets.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                        Nessun asset corrisponde alla ricerca.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              {assetTotalPages > 1 && (
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{assetPage * assetPageSize + 1}–{Math.min((assetPage + 1) * assetPageSize, filteredAssets.length)} di {filteredAssets.length}</span>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setAssetPage(p => p - 1)} disabled={assetPage === 0}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="px-2">{assetPage + 1} / {assetTotalPages}</span>
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setAssetPage(p => p + 1)} disabled={assetPage === assetTotalPages - 1}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      <Dialog open={!!assetCvesOpen} onOpenChange={(open) => !open && setAssetCvesOpen(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>CVE dell'asset — {assetCvesOpen?.name}</DialogTitle>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>CVE</TableHead>
                <TableHead>EPSS Score</TableHead>
                <TableHead>Severity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assetCvesOpen?.cves.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <CveIdButton id={v.id} onOpen={setDetailCve} />
                      <CveLink id={v.id} />
                    </div>
                    {v.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{v.description}</p>}
                  </TableCell>
                  <TableCell>{Number(v.score).toFixed(4)}</TableCell>
                  <TableCell>
                    <Badge className={cn('font-medium', severityColors[v.severity])}>{v.severity}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>

      <CveDetailDialog cveId={detailCve} open={!!detailCve} onOpenChange={(open) => !open && setDetailCve(null)} />

      {/* OS Patches */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">OS Patches</h2>
        <Card className="border-border">
          <CardContent className="space-y-8 pt-6">
            <div>
              <h4 className="text-sm text-muted-foreground mb-4">Patch in attesa ({mappedOsPending.length})</h4>
              {mappedOsPending.length > 0
                ? <OsPatchesTable patches={mappedOsPending} type="pending" />
                : <p className="text-sm text-muted-foreground text-center py-4">Nessuna patch in attesa</p>}
            </div>
            <div>
              <h4 className="text-sm text-muted-foreground mb-4">Patch installate ({mappedOsInstalled.length})</h4>
              {mappedOsInstalled.length > 0
                ? <OsPatchesTable patches={mappedOsInstalled} type="installed" />
                : <p className="text-sm text-muted-foreground text-center py-4">Nessuna patch installata</p>}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Software Patches */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Software Patches</h2>
        <Card className="border-border">
          <CardContent className="space-y-8 pt-6">
            <div>
              <h4 className="text-sm text-muted-foreground mb-4">Patch disponibili ({mappedSwPending.length})</h4>
              {mappedSwPending.length > 0
                ? <SoftwarePatchesTable patches={mappedSwPending} type="available" />
                : <p className="text-sm text-muted-foreground text-center py-4">Nessuna patch software disponibile</p>}
            </div>
            <div>
              <h4 className="text-sm text-muted-foreground mb-4">Patch installate ({mappedSwInstalled.length})</h4>
              {mappedSwInstalled.length > 0
                ? <SoftwarePatchesTable patches={mappedSwInstalled} type="installed" />
                : <p className="text-sm text-muted-foreground text-center py-4">Nessuna patch software installata</p>}
            </div>
          </CardContent>
        </Card>
      </section>

    </div>
  );
};
