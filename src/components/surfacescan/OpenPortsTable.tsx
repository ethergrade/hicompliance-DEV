import React, { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { ExposureOpenPortRow } from '@/lib/surfacescan/exposureApi';
import { normalizeSeverity, severityBadgeClass, severityWeight } from '@/lib/surfacescan/exposureScoring';

interface OpenPortsTableProps {
  rows: ExposureOpenPortRow[];
  loading?: boolean;
}

const RISKY_PORTS = new Set([21, 23, 445, 3389, 5900, 6379, 9200, 9300, 11211, 27017, 3306, 5432, 1433, 1521]);

export const OpenPortsTable: React.FC<OpenPortsTableProps> = ({ rows, loading = false }) => {
  const [search, setSearch] = useState('');
  const [onlyRisky, setOnlyRisky] = useState(false);
  const [onlyWeb, setOnlyWeb] = useState(false);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return [...rows]
      .filter((row) => {
        if (onlyRisky && !RISKY_PORTS.has(Number(row.port || 0))) return false;
        if (onlyWeb && !row.is_web && !row.is_tls) return false;
        if (!query) return true;

        const blob = [
          row.host,
          row.ip || '',
          String(row.port),
          row.protocol,
          row.service_name || '',
          row.service_product || '',
          row.service_version || '',
          row.exposure_level,
        ]
          .join(' ')
          .toLowerCase();

        return blob.includes(query);
      })
      .sort((a, b) => {
        const sevDelta = severityWeight(normalizeSeverity(b.exposure_level)) - severityWeight(normalizeSeverity(a.exposure_level));
        if (sevDelta !== 0) return sevDelta;
        const hostDelta = String(a.host || '').localeCompare(String(b.host || ''));
        if (hostDelta !== 0) return hostDelta;
        return Number(a.port || 0) - Number(b.port || 0);
      });
  }, [rows, search, onlyRisky, onlyWeb]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <Input
          placeholder="Cerca host, IP, porta, servizio..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="md:max-w-xl"
        />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox checked={onlyRisky} onCheckedChange={(checked) => setOnlyRisky(Boolean(checked))} />
          Solo porte rischiose
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox checked={onlyWeb} onCheckedChange={(checked) => setOnlyWeb(Boolean(checked))} />
          Solo servizi web/TLS
        </label>
      </div>

      <div className="rounded-lg border border-border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Dominio/Subdominio</TableHead>
              <TableHead>IP correlato</TableHead>
              <TableHead>Porta</TableHead>
              <TableHead>Protocollo</TableHead>
              <TableHead>Servizio</TableHead>
              <TableHead>Versione</TableHead>
              <TableHead>Web/TLS</TableHead>
              <TableHead>Exposure</TableHead>
              <TableHead>Raccomandazione</TableHead>
              <TableHead>First seen</TableHead>
              <TableHead>Last seen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-6 text-muted-foreground">
                  Caricamento porte aperte...
                </TableCell>
              </TableRow>
            )}

            {!loading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-6 text-muted-foreground">
                  Nessuna porta aperta trovata con i filtri correnti.
                </TableCell>
              </TableRow>
            )}

            {!loading &&
              filtered.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.host}</TableCell>
                  <TableCell>{row.ip || '-'}</TableCell>
                  <TableCell>{row.port}</TableCell>
                  <TableCell>{row.protocol}</TableCell>
                  <TableCell>{row.service_name || row.service_product || '-'}</TableCell>
                  <TableCell>{row.service_version || '-'}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {row.is_web && <Badge variant="secondary">Web</Badge>}
                      {row.is_tls && <Badge variant="secondary">TLS</Badge>}
                      {!row.is_web && !row.is_tls && <span className="text-muted-foreground text-sm">-</span>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={severityBadgeClass(row.exposure_level)}>
                      {normalizeSeverity(row.exposure_level).toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[320px] text-sm text-muted-foreground">{row.remediation_hint || '-'}</TableCell>
                  <TableCell className="text-xs">{new Date(row.first_seen_at).toLocaleString('it-IT')}</TableCell>
                  <TableCell className="text-xs">{new Date(row.last_seen_at).toLocaleString('it-IT')}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default OpenPortsTable;
