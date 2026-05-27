import React, { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { ExposureTechnologyRow } from '@/lib/surfacescan/exposureApi';

interface TechnologiesTableProps {
  rows: ExposureTechnologyRow[];
  loading?: boolean;
}

export const TechnologiesTable: React.FC<TechnologiesTableProps> = ({ rows, loading = false }) => {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => {
      const blob = [
        row.url,
        row.host,
        row.technology_name,
        row.technology_version || '',
        row.category || '',
      ]
        .join(' ')
        .toLowerCase();
      return blob.includes(query);
    });
  }, [rows, search]);

  return (
    <div className="space-y-3">
      <Input
        placeholder="Cerca tecnologia, host, categoria..."
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        className="md:max-w-xl"
      />

      <div className="rounded-lg border border-border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>URL</TableHead>
              <TableHead>Host</TableHead>
              <TableHead>Tecnologia</TableHead>
              <TableHead>Versione</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Confidence</TableHead>
              <TableHead>Porta</TableHead>
              <TableHead>Source</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-6 text-muted-foreground">
                  Caricamento tecnologie...
                </TableCell>
              </TableRow>
            )}

            {!loading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-6 text-muted-foreground">
                  Nessuna tecnologia rilevata.
                </TableCell>
              </TableRow>
            )}

            {!loading &&
              filtered.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="max-w-[340px] truncate">{row.url}</TableCell>
                  <TableCell>{row.host}</TableCell>
                  <TableCell className="font-medium">{row.technology_name}</TableCell>
                  <TableCell>{row.technology_version || '-'}</TableCell>
                  <TableCell>{row.category || 'Unknown'}</TableCell>
                  <TableCell>
                    {row.confidence != null ? `${Number(row.confidence).toFixed(0)}%` : '-'}
                  </TableCell>
                  <TableCell>{row.port || '-'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">pentest_tools_website_recon</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default TechnologiesTable;

