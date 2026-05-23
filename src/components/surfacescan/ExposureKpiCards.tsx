import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Globe, Network, Server, ShieldCheck, Workflow } from 'lucide-react';
import type { ExposureSummary } from '@/lib/surfacescan/exposureApi';
import { computeExposureRiskScore, severityBadgeClass } from '@/lib/surfacescan/exposureScoring';

interface ExposureKpiCardsProps {
  summary: ExposureSummary | null;
  loading?: boolean;
}

const placeholder = '...';

export const ExposureKpiCards: React.FC<ExposureKpiCardsProps> = ({ summary, loading = false }) => {
  const risk = computeExposureRiskScore({
    openPortsTotal: summary?.open_ports_total || 0,
    criticalExposures: summary?.critical_exposures || 0,
    findingsBySeverity: summary?.findings_by_severity,
  });

  const valueOrPlaceholder = (value: string | number) => (loading ? placeholder : value);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      <Card className="border-border">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Asset scansionati</p>
              <p className="text-2xl font-semibold">{valueOrPlaceholder(summary?.targets_total || 0)}</p>
              <p className="text-xs text-muted-foreground">Host con porte aperte: {valueOrPlaceholder(summary?.hosts_with_open_ports || 0)}</p>
            </div>
            <Globe className="w-5 h-5 text-primary" />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Porte aperte</p>
              <p className="text-2xl font-semibold">{valueOrPlaceholder(summary?.open_ports_total || 0)}</p>
              <p className="text-xs text-muted-foreground">Servizi web: {valueOrPlaceholder(summary?.web_services || 0)} • TLS: {valueOrPlaceholder(summary?.tls_services || 0)}</p>
            </div>
            <Network className="w-5 h-5 text-primary" />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Esposizioni critiche/alte</p>
              <p className="text-2xl font-semibold text-red-500">{valueOrPlaceholder(summary?.critical_exposures || 0)}</p>
              <p className="text-xs text-muted-foreground">SSL snapshot: {valueOrPlaceholder(summary?.ssl_snapshots || 0)}</p>
            </div>
            <AlertTriangle className="w-5 h-5 text-red-500" />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Exposure Risk Score</p>
              <div className="flex items-center gap-2">
                <p className="text-2xl font-semibold">{valueOrPlaceholder(risk.score)}</p>
                <Badge className={severityBadgeClass(risk.level === 'Critico' ? 'critical' : risk.level === 'Alto' ? 'high' : risk.level === 'Medio' ? 'medium' : 'low')}>
                  {risk.level}
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Severità: C {summary?.findings_by_severity?.critical || 0} · H {summary?.findings_by_severity?.high || 0} · M {summary?.findings_by_severity?.medium || 0}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Workflow className="w-3.5 h-3.5" />
                <span>Delta: +{summary?.diff?.new_open_ports?.length || 0} porte · +{summary?.diff?.new_technologies?.length || 0} tech</span>
              </div>
            </div>
            <Server className="w-5 h-5 text-primary" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ExposureKpiCards;
