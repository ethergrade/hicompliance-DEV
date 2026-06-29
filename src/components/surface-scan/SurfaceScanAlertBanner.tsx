import React, { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle2, ShieldAlert, TrendingDown } from 'lucide-react';
import { surfaceScan360Api } from '@/lib/api/surface-scan360';
import { useClientOrganization } from '@/hooks/useClientOrganization';

interface Alert {
  type: 'cert_expiry' | 'cisa_kev' | 'score_drop' | 'critical_port';
  label: string;
  detail: string;
  level: 'critical' | 'warning' | 'info';
}

export const SurfaceScanAlertBanner: React.FC = () => {
  const { organizationId, groupId } = useClientOrganization();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      const found: Alert[] = [];

      const [certFindings, kevFindings, recentJobs] = await Promise.allSettled([
        surfaceScan360Api.getFindings(organizationId, {
          finding_type: 'ssl_certificate_expired,ssl_certificate_expiring_15d,ssl_certificate_expiring_30d',
          status: 'open',
          per_page: 5,
        }, groupId),
        surfaceScan360Api.getCisaKev(organizationId, { status: 'open' }, groupId),
        surfaceScan360Api.listJobs(organizationId, { status: 'completed', per_page: 2 }, groupId),
      ]);

      // 1. SSL cert expiry
      const certs = (certFindings.status === 'fulfilled' ? certFindings.value : []) as any[];
      if (certs.length > 0) {
        const expired = certs.filter((f: any) => f.finding_type === 'ssl_certificate_expired');
        const expiring15 = certs.filter((f: any) => f.finding_type === 'ssl_certificate_expiring_15d');
        const expiring30 = certs.filter((f: any) => f.finding_type === 'ssl_certificate_expiring_30d');
        if (expired.length > 0) {
          found.push({ type: 'cert_expiry', label: `${expired.length} cert scadut${expired.length > 1 ? 'i' : 'o'}`, detail: expired[0].affected_asset || 'certificato SSL scaduto', level: 'critical' });
        } else if (expiring15.length > 0) {
          found.push({ type: 'cert_expiry', label: 'Cert scade in <15gg', detail: expiring15[0].affected_asset || 'certificato in scadenza imminente', level: 'critical' });
        } else if (expiring30.length > 0) {
          found.push({ type: 'cert_expiry', label: 'Cert scade in <30gg', detail: expiring30[0].affected_asset || 'certificato in scadenza', level: 'warning' });
        }
      }

      // 2. CISA KEV
      const kevs = (kevFindings.status === 'fulfilled' ? kevFindings.value : []) as any[];
      if (kevs.length > 0) {
        found.push({ type: 'cisa_kev', label: `${kevs.length} CVE CISA KEV`, detail: `${kevs[0].title || 'CVE attivamente sfruttata'} su ${kevs[0].affected_asset || '-'}`, level: 'critical' });
      }

      // 3. Score drop — compare last 2 completed jobs' posture score
      const jobs = (recentJobs.status === 'fulfilled' ? recentJobs.value : []) as any[];
      if (jobs.length === 2) {
        const latest = Number(jobs[0]?.posture_score ?? jobs[0]?.summary?.overall_score ?? 0);
        const prev = Number(jobs[1]?.posture_score ?? jobs[1]?.summary?.overall_score ?? 0);
        const drop = prev - latest;
        if (drop > 10) {
          found.push({ type: 'score_drop', label: `Score -${drop.toFixed(0)}pt`, detail: `Punteggio sceso da ${prev.toFixed(0)} a ${latest.toFixed(0)} rispetto alla settimana scorsa`, level: 'warning' });
        }
      }

      if (!cancelled) {
        setAlerts(found);
        setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [organizationId, groupId]);

  if (loading || alerts.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-2.5 text-sm text-emerald-400">
        <CheckCircle2 className="w-4 h-4 shrink-0" />
        {loading ? 'Controllo avvisi in corso...' : 'Nessun allarme critico rilevato questa settimana.'}
      </div>
    );
  }

  const levelColors = {
    critical: 'border-red-500/40 bg-red-500/8 text-red-400',
    warning: 'border-amber-500/40 bg-amber-500/8 text-amber-400',
    info: 'border-blue-500/40 bg-blue-500/8 text-blue-400',
  };

  const levelBadge = {
    critical: 'bg-red-500/20 text-red-400 border-red-500/30',
    warning: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    info: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  };

  const hasCritical = alerts.some((a) => a.level === 'critical');

  return (
    <div className={`rounded-lg border px-4 py-3 space-y-2 ${hasCritical ? levelColors.critical : levelColors.warning}`}>
      <div className="flex items-center gap-2">
        {hasCritical
          ? <ShieldAlert className="w-4 h-4 shrink-0 text-red-400" />
          : <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />}
        <span className="text-sm font-medium">
          {hasCritical ? 'Allarme — richiede attenzione immediata' : 'Avviso — azione consigliata'}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {alerts.map((alert, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <Badge className={`text-[11px] ${levelBadge[alert.level]}`}>
              {alert.level === 'critical' ? '🔴' : '🟡'} {alert.label}
            </Badge>
            <span className="text-xs text-muted-foreground truncate max-w-xs">{alert.detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SurfaceScanAlertBanner;
