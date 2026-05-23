import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import { useToast } from '@/hooks/use-toast';
import {
  classifySurfaceHostForScope,
  isIpWithinScopeRules,
  isIpv4,
  isIpv6,
  splitMonitoredScopeRules,
  type SurfaceMonitoredScopeRule,
} from '@/lib/surfaceScopeGuard';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

export interface SurfaceFindingRow {
  id: string;
  provider: string | null;
  module: string | null;
  finding_type: string;
  title: string;
  description: string | null;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  affected_asset: string | null;
  affected_url: string | null;
  ip: string | null;
  port: number | null;
  protocol: string | null;
  cve: string[] | null;
  cwe: string[] | null;
  cvss: number | null;
  epss: number | null;
  cisa_kev: boolean | null;
  remediation: string | null;
  evidence: Record<string, any> | null;
  attribution_confidence: string | null;
  status: string | null;
  created_at: string;
}

export const useSurfaceScanFindings = () => {
  const [findings, setFindings] = useState<SurfaceFindingRow[]>([]);
  const [scopeRules, setScopeRules] = useState<SurfaceMonitoredScopeRule[]>([]);
  const [loading, setLoading] = useState(false);
  const { organizationId, isLoading: clientLoading } = useClientOrganization();
  const { toast } = useToast();

  const mapRecord = useCallback((record: Record<string, any> | null): SurfaceFindingRow | null => {
    if (!record || !record.id) return null;
    return {
      id: String(record.id),
      provider: record.provider ?? null,
      module: record.module ?? null,
      finding_type: String(record.finding_type || ''),
      title: String(record.title || ''),
      description: record.description ?? null,
      severity: (record.severity || 'info') as SurfaceFindingRow['severity'],
      affected_asset: record.affected_asset ?? null,
      affected_url: record.affected_url ?? null,
      ip: record.ip ? String(record.ip) : null,
      port: record.port ?? null,
      protocol: record.protocol ?? null,
      cve: Array.isArray(record.cve) ? record.cve : null,
      cwe: Array.isArray(record.cwe) ? record.cwe : null,
      cvss: record.cvss ?? null,
      epss: record.epss ?? null,
      cisa_kev: record.cisa_kev ?? null,
      remediation: record.remediation ?? null,
      evidence: record.evidence && typeof record.evidence === 'object' ? (record.evidence as Record<string, any>) : null,
      attribution_confidence: record.attribution_confidence ?? null,
      status: record.status ?? null,
      created_at: String(record.created_at || new Date().toISOString()),
    };
  }, []);

  const extractHostFromRow = (row: SurfaceFindingRow): string => {
    const urlCandidate = String(row.affected_url || '').trim();
    if (urlCandidate) {
      try {
        return new URL(urlCandidate).hostname.toLowerCase();
      } catch {
        return '';
      }
    }
    const asset = String(row.affected_asset || '').trim().toLowerCase();
    if (!asset || isIpv4(asset) || isIpv6(asset)) return '';
    return asset
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '')
      .replace(/\.$/, '');
  };

  const shouldHideFindingByScope = (
    row: SurfaceFindingRow,
    monitoredRules: SurfaceMonitoredScopeRule[],
  ): boolean => {
    const backendExcluded = Boolean(row?.evidence?._scope_excluded);
    if (backendExcluded) return true;

    const { scopeDomains, ipScopeRules } = splitMonitoredScopeRules(monitoredRules);
    const ipCandidate = String(row.ip || row.evidence?.ip || '').trim().toLowerCase();
    if (ipCandidate && (isIpv4(ipCandidate) || isIpv6(ipCandidate))) {
      if (!isIpWithinScopeRules(ipCandidate, ipScopeRules)) return true;
    }

    const hostCandidate = extractHostFromRow(row);
    if (hostCandidate) {
      const classification = classifySurfaceHostForScope(hostCandidate, scopeDomains);
      if (classification.blocked) return true;
    }
    return false;
  };

  const fetchFindings = useCallback(async (options?: { background?: boolean }) => {
    if (clientLoading || !organizationId) return;
    const background = Boolean(options?.background);
    if (!background) setLoading(true);
    try {
      const [findingsRes, scopeRulesRes] = await Promise.all([
        supabase
          .from('surface_findings' as any)
          .select(
            'id, provider, module, finding_type, title, description, severity, affected_asset, affected_url, ip, port, protocol, cve, cwe, cvss, epss, cisa_kev, remediation, evidence, attribution_confidence, status, created_at',
          )
          .eq('customer_id', organizationId)
          .order('created_at', { ascending: false })
          .limit(1000),
        supabase
          .from('surface_scan_monitored_ips' as any)
          .select('entry_type, input_value, ip_start, ip_end')
          .eq('organization_id', organizationId),
      ]);

      if (findingsRes.error) throw findingsRes.error;
      if (scopeRulesRes.error) throw scopeRulesRes.error;

      const rules = (scopeRulesRes.data || []) as SurfaceMonitoredScopeRule[];
      setScopeRules(rules);

      const normalizedRows = ((findingsRes.data || []) as Record<string, any>[])
        .map((record) => mapRecord(record))
        .filter((record): record is SurfaceFindingRow => Boolean(record));

      setFindings(normalizedRows.filter((row) => !shouldHideFindingByScope(row, rules)));
    } catch (error) {
      console.error('Error fetching surface findings:', error);
      if (!background) {
        toast({
          title: 'Errore',
          description: 'Impossibile caricare i security findings',
          variant: 'destructive',
        });
      }
    } finally {
      if (!background) setLoading(false);
    }
  }, [clientLoading, organizationId, mapRecord, toast]);

  useEffect(() => {
    if (!clientLoading && organizationId) {
      fetchFindings();
    }
  }, [clientLoading, organizationId, fetchFindings]);

  useEffect(() => {
    if (!organizationId) return;

    const channel = supabase
      .channel(`surface-findings-${organizationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'surface_findings',
          filter: `customer_id=eq.${organizationId}`,
        },
        (_payload: RealtimePostgresChangesPayload<Record<string, any>>) => {
          void fetchFindings({ background: true });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [organizationId, fetchFindings]);

  const counts = useMemo(() => {
    const bySeverity = findings.reduce(
      (acc, row) => {
        acc[row.severity] = (acc[row.severity] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      total: findings.length,
      critical: bySeverity.critical || 0,
      high: bySeverity.high || 0,
      medium: bySeverity.medium || 0,
      low: bySeverity.low || 0,
      info: bySeverity.info || 0,
    };
  }, [findings]);

  return {
    findings,
    loading,
    counts,
    scopeRules,
    refetch: fetchFindings,
  };
};
