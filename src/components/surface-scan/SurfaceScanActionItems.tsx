import React, { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Loader2 } from 'lucide-react';
import { surfaceScan360Api } from '@/lib/api/surface-scan360';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import {
  isUnverifiedStorageBucketFinding,
  presentStorageBucketFinding,
} from '@/lib/surfacescan/storageFindingPresentation';

interface ActionItem {
  rank: number;
  title: string;
  detail: string;
  severity: string;
  asset: string;
  isKev: boolean;
  cvss: number | null;
}

const severityStyle: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  medium: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  low: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  info: 'bg-muted text-muted-foreground border-border',
};

export const SurfaceScanActionItems: React.FC = () => {
  const { organizationId, groupId } = useClientOrganization();
  const [items, setItems] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);

      const raw = await surfaceScan360Api.getFindings(organizationId, {
        status: 'open',
        severity: 'critical,high',
        per_page: 50,
      }, groupId).catch(() => []);

      // Sort client-side: cisa_kev DESC, cvss DESC, severity ASC
      const findings = [...(raw as any[])].sort((a, b) => {
        if (Boolean(b.cisa_kev) !== Boolean(a.cisa_kev)) return Boolean(b.cisa_kev) ? 1 : -1;
        const aScore = Number(a.cvss ?? -1);
        const bScore = Number(b.cvss ?? -1);
        if (bScore !== aScore) return bScore - aScore;
        const order: Record<string, number> = { critical: 0, high: 1 };
        return (order[a.severity] ?? 2) - (order[b.severity] ?? 2);
      });

      if (!cancelled) {
        const actionableFindings = findings
          .map((finding: any) => presentStorageBucketFinding(finding))
          .filter((finding: any) => !isUnverifiedStorageBucketFinding(finding));

        const ranked: ActionItem[] = actionableFindings.slice(0, 5).map((f: any, idx) => {
          const asset = String(f.affected_asset || '').replace(/^https?:\/\//, '').split('/')[0];
          const remediation = String(f.remediation || '').trim();
          const detail = remediation
            ? remediation.slice(0, 120) + (remediation.length > 120 ? '...' : '')
            : `Risolvere ${f.finding_type?.replace(/_/g, ' ') || 'vulnerabilità'} su ${asset}`;

          return {
            rank: idx + 1,
            title: String(f.title || f.finding_type || 'Vulnerabilità'),
            detail,
            severity: String(f.severity || 'high').toLowerCase(),
            asset,
            isKev: Boolean(f.cisa_kev),
            cvss: f.cvss != null ? Number(f.cvss) : null,
          };
        });
        setItems(ranked);
        setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [organizationId, groupId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Caricamento priorità...
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
        Nessuna vulnerabilità critica/alta aperta rilevata.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border divide-y divide-border">
      <div className="px-4 py-2.5 bg-muted/30">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Top {items.length} azioni prioritarie
        </p>
      </div>
      {items.map((item) => (
        <div key={item.rank} className="flex items-start gap-3 px-4 py-3">
          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-muted/50 flex items-center justify-center text-xs font-bold text-muted-foreground">
            {item.rank}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium">{item.title}</span>
              <Badge className={`text-[10px] ${severityStyle[item.severity] || severityStyle.info}`}>
                {item.severity.toUpperCase()}
              </Badge>
              {item.isKev && (
                <Badge className="text-[10px] bg-red-600/20 text-red-400 border-red-600/30">
                  CISA KEV
                </Badge>
              )}
              {item.cvss != null && (
                <Badge variant="outline" className="text-[10px] font-mono">
                  CVSS {item.cvss.toFixed(1)}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
              <p className="text-xs text-muted-foreground truncate">{item.detail}</p>
            </div>
            {item.asset && (
              <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                {item.asset}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default SurfaceScanActionItems;
