import React, { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Loader2, XCircle, AlertCircle } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useClientOrganization } from '@/hooks/useClientOrganization';

interface MailSecRow {
  domain: string;
  spf: boolean | null;
  dmarc: boolean | null;
  dkimCount: number;
  spoofingRisk: 'alto' | 'medio' | 'basso';
}

const StatusIcon: React.FC<{ val: boolean | null }> = ({ val }) => {
  if (val === null) return <span className="text-muted-foreground text-xs">—</span>;
  return val
    ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
    : <XCircle className="w-4 h-4 text-red-400" />;
};

export const SurfaceScanMailSecurity: React.FC = () => {
  const { organizationId } = useClientOrganization();
  const [rows, setRows] = useState<MailSecRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);

      // Fetch mail_config observations for this org
      const { data: obs } = await supabase
        .from('surface_observations')
        .select('value, title, scan_job_id, created_at')
        .eq('organization_id', organizationId)
        .eq('module', 'mail_config')
        .order('created_at', { ascending: false })
        .limit(30);

      if (!obs || obs.length === 0) {
        if (!cancelled) { setRows([]); setLoading(false); }
        return;
      }

      // Get target domains from scan jobs
      const jobIds = [...new Set(obs.map((o: any) => String(o.scan_job_id || '')).filter(Boolean))];
      const { data: jobs } = jobIds.length > 0
        ? await supabase
            .from('surface_scan_jobs')
            .select('id, normalized_target')
            .in('id', jobIds)
        : { data: [] };

      const jobDomainMap = new Map<string, string>(
        (jobs || []).map((j: any) => [String(j.id), String(j.normalized_target || '')])
      );

      // Dedupe by domain (take most recent per domain)
      const domainMap = new Map<string, MailSecRow>();

      for (const o of obs as any[]) {
        const domain = jobDomainMap.get(String(o.scan_job_id || '')) || String(o.title || '').split(':')[0].trim();
        if (!domain) continue;
        if (domainMap.has(domain)) continue;

        const val = (o.value || {}) as Record<string, any>;
        const spf = Array.isArray(val.spf_records) ? val.spf_records.length > 0 : null;
        const dmarc = Array.isArray(val.dmarc_records) ? val.dmarc_records.length > 0 : null;
        const dkimCount = Array.isArray(val.dkim_selectors_found) ? val.dkim_selectors_found.length : 0;

        let spoofingRisk: MailSecRow['spoofingRisk'] = 'basso';
        if (!spf && !dmarc) spoofingRisk = 'alto';
        else if (!spf || !dmarc) spoofingRisk = 'medio';

        domainMap.set(domain, { domain, spf, dmarc, dkimCount, spoofingRisk });
      }

      if (!cancelled) {
        setRows(Array.from(domainMap.values()).sort((a, b) => {
          const riskOrder = { alto: 0, medio: 1, basso: 2 };
          return riskOrder[a.spoofingRisk] - riskOrder[b.spoofingRisk];
        }));
        setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [organizationId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Caricamento sicurezza email...
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
        Dati sicurezza email non disponibili — eseguire una scansione per popolare i record DNS.
      </div>
    );
  }

  const riskBadge: Record<string, string> = {
    alto: 'bg-red-500/20 text-red-400 border-red-500/30',
    medio: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    basso: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  };

  return (
    <div className="rounded-lg border border-border overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Dominio</TableHead>
            <TableHead className="text-center">SPF</TableHead>
            <TableHead className="text-center">DMARC</TableHead>
            <TableHead className="text-center">DKIM</TableHead>
            <TableHead>Rischio Email Spoofing</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.domain}>
              <TableCell className="font-mono text-sm">{row.domain}</TableCell>
              <TableCell className="text-center"><StatusIcon val={row.spf} /></TableCell>
              <TableCell className="text-center"><StatusIcon val={row.dmarc} /></TableCell>
              <TableCell className="text-center">
                {row.dkimCount > 0
                  ? <span className="text-xs text-emerald-400">{row.dkimCount} sel.</span>
                  : <XCircle className="w-4 h-4 text-red-400 mx-auto" />}
              </TableCell>
              <TableCell>
                <Badge className={`text-[10px] ${riskBadge[row.spoofingRisk]}`}>
                  {row.spoofingRisk === 'alto' ? '🔴' : row.spoofingRisk === 'medio' ? '🟡' : '🟢'} {row.spoofingRisk.charAt(0).toUpperCase() + row.spoofingRisk.slice(1)}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default SurfaceScanMailSecurity;
