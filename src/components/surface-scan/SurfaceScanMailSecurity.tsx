import React, { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { surfaceScan360Api } from '@/lib/api/surface-scan360';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import { buildMailSecurityRows, type MailSecRow } from '@/lib/surfacescan/mailSecurity';

const StatusIcon: React.FC<{ val: boolean | null }> = ({ val }) => {
  if (val === null) return <span className="text-muted-foreground text-xs">—</span>;
  return val
    ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
    : <XCircle className="w-4 h-4 text-red-400" />;
};

export const SurfaceScanMailSecurity: React.FC = () => {
  const { organizationId, groupId } = useClientOrganization();
  const [rows, setRows] = useState<MailSecRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);

      const [obsRaw, allJobsRaw] = await Promise.allSettled([
        surfaceScan360Api.getObservations(organizationId, {
          module: 'mail_config,connectsecure',
          observation_type: 'mail_config_summary,mail_security_summary',
        }, groupId),
        surfaceScan360Api.listJobs(organizationId, { per_page: 500 }, groupId),
      ]);

      const obs = (obsRaw.status === 'fulfilled' ? obsRaw.value : []) as any[];
      if (obs.length === 0) {
        if (!cancelled) { setRows([]); setLoading(false); }
        return;
      }

      const allJobs = (allJobsRaw.status === 'fulfilled' ? allJobsRaw.value : []) as any[];
      const built = buildMailSecurityRows(obs, allJobs);

      if (!cancelled) {
        setRows(built);
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
        Caricamento sicurezza email...
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
        Dati sicurezza email non ancora importati — avvia una scansione ASM o SurfaceScan per popolare SPF, DMARC e MX.
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
            <TableHead className="text-center">MX</TableHead>
            <TableHead>Rischio Email Spoofing</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.domain}>
              <TableCell>
                <div className="font-mono text-sm">{row.domain}</div>
                <div className="text-[11px] text-muted-foreground">{row.sourceLabel}</div>
              </TableCell>
              <TableCell className="text-center">
                <div className="flex flex-col items-center gap-1">
                  <StatusIcon val={row.spf} />
                  {row.spfRecord && (
                    <span className="max-w-[260px] whitespace-normal break-all text-left font-mono text-[11px] leading-snug text-muted-foreground" title={row.spfRecord}>
                      {row.spfRecord}
                    </span>
                  )}
                  {row.spfDnsLookups !== null && (
                    <span className="text-[10px] text-muted-foreground">DNS lookup: {row.spfDnsLookups}</span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-center">
                <div className="flex flex-col items-center gap-1">
                  <StatusIcon val={row.dmarc} />
                  {row.dmarcRecord && (
                    <span className="max-w-[260px] whitespace-normal break-all text-left font-mono text-[11px] leading-snug text-muted-foreground" title={row.dmarcRecord}>
                      {row.dmarcRecord}
                    </span>
                  )}
                  {row.dmarcLocation && (
                    <span className="text-[10px] text-muted-foreground">{row.dmarcLocation}</span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-center">
                {row.dkim === null
                  ? <span className="text-xs text-muted-foreground">N/D</span>
                  : row.dkimCount > 0
                  ? <span className="text-xs text-emerald-400">{row.dkimCount} sel.</span>
                  : <XCircle className="w-4 h-4 text-red-400 mx-auto" />}
              </TableCell>
              <TableCell className="text-center">
                <span className="text-xs text-muted-foreground">{row.mxCount}</span>
              </TableCell>
              <TableCell>
                <Badge className={`text-[10px] ${riskBadge[row.spoofingRisk]}`}>
                  {row.spoofingRisk.charAt(0).toUpperCase() + row.spoofingRisk.slice(1)}
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
