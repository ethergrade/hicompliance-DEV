import React, { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle2, ShieldAlert, TrendingDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useClientOrganization } from '@/hooks/useClientOrganization';

interface Alert {
  type: 'cert_expiry' | 'cisa_kev' | 'score_drop' | 'critical_port';
  label: string;
  detail: string;
  level: 'critical' | 'warning' | 'info';
}

export const SurfaceScanAlertBanner: React.FC = () => {
  const { organizationId } = useClientOrganization();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      const found: Alert[] = [];

      // 1. SSL cert expiry findings (active, open)
      const { data: certFindings } = await supabase
        .from('surface_findings')
        .select('finding_type, title, affected_asset')
        .eq('organization_id', organizationId)
        .eq('status', 'open')
        .in('finding_type', ['ssl_certificate_expired', 'ssl_certificate_expiring_15d', 'ssl_certificate_expiring_30d'])
        .order('finding_type', { ascending: true })
        .limit(5);

      if (certFindings && certFindings.length > 0) {
        const expired = certFindings.filter((f: any) => f.finding_type === 'ssl_certificate_expired');
        const expiring15 = certFindings.filter((f: any) => f.finding_type === 'ssl_certificate_expiring_15d');
        const expiring30 = certFindings.filter((f: any) => f.finding_type === 'ssl_certificate_expiring_30d');

        if (expired.length > 0) {
          found.push({
            type: 'cert_expiry',
            label: `${expired.length} cert scadut${expired.length > 1 ? 'i' : 'o'}`,
            detail: expired[0].affected_asset || 'certificato SSL scaduto',
            level: 'critical',
          });
        } else if (expiring15.length > 0) {
          found.push({
            type: 'cert_expiry',
            label: `Cert scade in <15gg`,
            detail: expiring15[0].affected_asset || 'certificato in scadenza imminente',
            level: 'critical',
          });
        } else if (expiring30.length > 0) {
          found.push({
            type: 'cert_expiry',
            label: `Cert scade in <30gg`,
            detail: expiring30[0].affected_asset || 'certificato in scadenza',
            level: 'warning',
          });
        }
      }

      // 2. CISA KEV matches — findings with CVE in CISA KEV catalog
      const { data: kevFindings } = await supabase
        .from('surface_findings')
        .select('id, title, affected_asset, cve')
        .eq('organization_id', organizationId)
        .eq('status', 'open')
        .eq('cisa_kev', true)
        .limit(5);

      if (kevFindings && kevFindings.length > 0) {
        found.push({
          type: 'cisa_kev',
          label: `${kevFindings.length} CVE CISA KEV`,
          detail: `${kevFindings[0].title || 'CVE attivamente sfruttata'} su ${kevFindings[0].affected_asset || '-'}`,
          level: 'critical',
        });
      }

      // 3. Score drop — compare last 2 scan history entries
      const { data: history } = await supabase
        .from('surface_scan_history')
        .select('avg_score, created_at')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(2);

      if (history && history.length === 2) {
        const latest = Number(history[0].avg_score ?? 0);
        const prev = Number(history[1].avg_score ?? 0);
        const drop = prev - latest;
        if (drop > 10) {
          found.push({
            type: 'score_drop',
            label: `Score -${drop.toFixed(0)}pt`,
            detail: `Punteggio sceso da ${prev.toFixed(0)} a ${latest.toFixed(0)} rispetto alla settimana scorsa`,
            level: 'warning',
          });
        }
      }

      if (!cancelled) {
        setAlerts(found);
        setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [organizationId]);

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
