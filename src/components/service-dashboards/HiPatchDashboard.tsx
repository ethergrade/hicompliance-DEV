import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Info, AlertTriangle, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RiskScoreCard } from './RiskScoreCard';
import { VulnerabilitiesTable } from './VulnerabilitiesTable';
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

const ringForColor = (c: 'green' | 'yellow' | 'orange' | 'red') =>
  ({ green: '#10b981', yellow: '#eab308', orange: '#f59e0b', red: '#ef4444' }[c]);

// ─── Summary cards ────────────────────────────────────────────────────────────

const SeverityBadge: React.FC<{ label: string; count: number; color: string }> = ({ label, count, color }) => (
  <div className={`flex flex-col items-center justify-center rounded-lg p-3 ${color}`}>
    <span className="text-2xl font-bold">{count}</span>
    <span className="text-xs font-medium capitalize">{label}</span>
  </div>
);

// ─── Component ────────────────────────────────────────────────────────────────

export const HiPatchDashboard: React.FC = () => {
  const { data, isLoading, error } = useHipatchDashboard();

  const { summary, assets, cves, osPatchesPending, osPatchesInstalled, softwarePatchesPending, softwarePatchesInstalled } = data ?? {
    summary: null, assets: [], cves: [], osPatchesPending: [], osPatchesInstalled: [],
    softwarePatchesPending: [], softwarePatchesInstalled: [],
  };

  const [assetPage, setAssetPage] = useState(0);
  const assetPageSize = 10;
  const assetTotalPages = Math.ceil(assets.length / assetPageSize);
  const assetSlice = assets.slice(assetPage * assetPageSize, (assetPage + 1) * assetPageSize);

  // Map CVEs → VulnerabilitiesTable format
  const mappedCves = useMemo(() =>
    [...cves]
      .sort((a, b) => (SEVERITY_ORDER[b.severity?.toLowerCase()] ?? 0) - (SEVERITY_ORDER[a.severity?.toLowerCase()] ?? 0))
      .map((c) => ({
        id: c.problem_name,
        description: c.description,
        score: Number(c.epss_score) ?? 0,
        severity: normalizeSeverity(c.severity),
        assets: c.assets,
      })),
  [cves]);

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
  const avgRisk = summary?.avg_risk_score ?? 0;
  const maxRisk = summary?.max_risk_score ?? 0;
  const avgColor = riskScoreColor(avgRisk);
  const maxColor = riskScoreColor(maxRisk);
  const patchRiskPct = summary?.patch_risk_percent ?? 0;
  const patchRiskColor = riskScoreColor(patchRiskPct / 10);

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
                <p className="text-3xl font-bold">{summary.patch_risk_percent.toFixed(1)}%</p>
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
            level={riskScoreLabel(avgRisk)}
            levelColor={avgColor}
            score={Math.round(avgRisk * 10)}
            ringColor={ringForColor(avgColor)}
          />
          <RiskScoreCard
            title="Max CVSS Score"
            level={riskScoreLabel(maxRisk)}
            levelColor={maxColor}
            score={Math.round(maxRisk * 10)}
            ringColor={ringForColor(maxColor)}
          />
          <RiskScoreCard
            title="Patch Risk"
            level={riskScoreLabel(patchRiskPct / 10)}
            levelColor={patchRiskColor}
            score={Math.round(patchRiskPct)}
            ringColor={ringForColor(patchRiskColor)}
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
                : 'Nessuna CVE rilevata'}
            </p>
          </CardHeader>
          <CardContent>
            {mappedCves.length > 0 ? (
              <VulnerabilitiesTable vulnerabilities={mappedCves} />
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>OS</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Importance</TableHead>
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
                      <TableCell>{a['data.asset_type'] || '-'}</TableCell>
                      <TableCell>
                        {a['data.importance'] ? (
                          <Badge className={a['data.importance'].toLowerCase() === 'critical'
                            ? 'bg-red-500/20 text-red-500'
                            : 'bg-muted text-muted-foreground'}>
                            {a['data.importance']}
                          </Badge>
                        ) : '-'}
                      </TableCell>
                      <TableCell>{a['data.last_ping_time'] || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {assetTotalPages > 1 && (
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{assetPage * assetPageSize + 1}–{Math.min((assetPage + 1) * assetPageSize, assets.length)} di {assets.length}</span>
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
