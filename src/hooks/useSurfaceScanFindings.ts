import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import { useToast } from '@/hooks/use-toast';
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

  const fetchFindings = useCallback(async () => {
    if (clientLoading || !organizationId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('surface_findings' as any)
        .select(
          'id, provider, module, finding_type, title, description, severity, affected_asset, affected_url, ip, port, protocol, cve, cwe, cvss, epss, cisa_kev, remediation, evidence, attribution_confidence, status, created_at',
        )
        .eq('customer_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(1000);

      if (error) throw error;
      setFindings(
        ((data || []) as Record<string, any>[])
          .map((record) => mapRecord(record))
          .filter((record): record is SurfaceFindingRow => Boolean(record)),
      );
    } catch (error) {
      console.error('Error fetching surface findings:', error);
      toast({
        title: 'Errore',
        description: 'Impossibile caricare i security findings',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
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
        (payload: RealtimePostgresChangesPayload<Record<string, any>>) => {
          setFindings((prev) => {
            if (payload.eventType === 'DELETE') {
              const deletedId = String(payload.old?.id || '');
              if (!deletedId) return prev;
              return prev.filter((item) => item.id !== deletedId);
            }

            const nextRow = mapRecord(payload.new);
            if (!nextRow) return prev;
            const withoutCurrent = prev.filter((item) => item.id !== nextRow.id);
            return [nextRow, ...withoutCurrent].sort(
              (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
            );
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [organizationId, mapRecord]);

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
    refetch: fetchFindings,
  };
};
