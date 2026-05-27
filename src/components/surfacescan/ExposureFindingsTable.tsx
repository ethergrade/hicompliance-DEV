import React, { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { ExposureFindingRow } from '@/lib/surfacescan/exposureApi';
import { normalizeSeverity, severityBadgeClass, severityWeight } from '@/lib/surfacescan/exposureScoring';

interface ExposureFindingsTableProps {
  rows: ExposureFindingRow[];
  loading?: boolean;
}

export const ExposureFindingsTable: React.FC<ExposureFindingsTableProps> = ({ rows, loading = false }) => {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return [...rows]
      .filter((row) => {
        if (!query) return true;

        const blob = [
          row.title,
          row.finding_type,
          row.affected_host || '',
          row.affected_url || '',
          row.description || '',
          row.recommendation || '',
          ...(row.cve_ids || []),
        ]
          .join(' ')
          .toLowerCase();

        return blob.includes(query);
      })
      .sort((a, b) => {
        const sevDelta = severityWeight(normalizeSeverity(b.severity)) - severityWeight(normalizeSeverity(a.severity));
        if (sevDelta !== 0) return sevDelta;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [rows, search]);

  return (
    <div className="space-y-3">
      <Input
        placeholder="Cerca finding, host, CVE..."
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        className="md:max-w-xl"
      />

      <div className="rounded-lg border border-border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Severity</TableHead>
              <TableHead>Titolo</TableHead>
              <TableHead>Host</TableHead>
              <TableHead>Porta</TableHead>
              <TableHead>CVE</TableHead>
              <TableHead>Evidenza</TableHead>
              <TableHead>Remediation</TableHead>
              <TableHead>Stato</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-6 text-muted-foreground">
                  Caricamento findings...
                </TableCell>
              </TableRow>
            )}

            {!loading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-6 text-muted-foreground">
                  Nessun finding exposure disponibile.
                </TableCell>
              </TableRow>
            )}

            {!loading &&
              filtered.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Badge className={severityBadgeClass(row.severity)}>
                      {normalizeSeverity(row.severity).toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium max-w-[300px] truncate">{row.title}</TableCell>
                  <TableCell>{row.affected_host || row.affected_url || '-'}</TableCell>
                  <TableCell>{row.affected_port || '-'}</TableCell>
                  <TableCell className="max-w-[260px] text-xs">
                    {Array.isArray(row.cve_ids) && row.cve_ids.length > 0 ? row.cve_ids.join(', ') : '-'}
                  </TableCell>
                  <TableCell className="max-w-[280px] text-xs text-muted-foreground">{row.evidence || '-'}</TableCell>
                  <TableCell className="max-w-[320px] text-sm text-muted-foreground">{row.recommendation || '-'}</TableCell>
                  <TableCell>{row.status}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default ExposureFindingsTable;

