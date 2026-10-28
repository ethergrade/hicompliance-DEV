import React, { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronLeft, ChevronRight, Download, Search } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DEFAULT_OS_PATCH_FILTERS, filterOsPatches, osPatchSeverities, type OsPatchFilters } from '@/lib/hipatch/hipatchFilters';
import { exportOsPatchesXlsx } from '@/lib/hipatch/exportHipatchXlsx';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

interface OsPatchPending {
  systemName: string;
  patch: string;       // type (bold) + name (below)
  patchType: string;
  kbNumber: string;
  severity: string;
}

interface OsPatchInstalled {
  systemName: string;
  patch: string;
  patchType: string;
  kbNumber: string;
  status: string;
  installedAt?: string;
}

interface OsPatchesTableProps {
  patches: (OsPatchPending | OsPatchInstalled)[];
  type: 'pending' | 'installed';
  pageSize?: number;
  /** Data del run, per il nome del file esportato. */
  runDate?: string | null;
}

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

const severityColors: Record<string, string> = {
  CRITICAL: 'bg-red-500/20 text-red-500',
  IMPORTANT: 'bg-yellow-500/20 text-yellow-500',
  OPTIONAL: 'bg-blue-500/20 text-blue-500',
};

const statusColors: Record<string, string> = {
  INSTALLED: 'bg-green-500/20 text-green-500',
  FAILED: 'bg-red-500/20 text-red-500',
};

const PatchCell: React.FC<{ type: string; name: string }> = ({ type, name }) => {
  const showType = type && type.toUpperCase() !== 'UNKNOWN' && type.trim() !== '';
  return (
    <div className="space-y-0.5">
      {showType && <div className="font-medium">{type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</div>}
      <div className={showType ? 'text-sm text-muted-foreground' : ''}>{name || '-'}</div>
    </div>
  );
};

export const OsPatchesTable: React.FC<OsPatchesTableProps> = ({ patches, type, pageSize = 10, runDate }) => {
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState<OsPatchFilters>(DEFAULT_OS_PATCH_FILTERS);
  const severities = useMemo(() => (type === 'pending' ? osPatchSeverities(patches as OsPatchPending[]) : []), [patches, type]);
  const filtered = useMemo(() => filterOsPatches(patches, filters), [patches, filters]);
  const filtering = filters.query.trim() !== '' || filters.severity !== 'all';
  const totalPages = Math.ceil(filtered.length / pageSize);
  const slice = filtered.slice(page * pageSize, (page + 1) * pageSize);

  const set = (patch: Partial<OsPatchFilters>) => {
    setFilters(f => ({ ...f, ...patch }));
    setPage(0);
  };

  // Ricerca per KB, sistema o patch; severity ed export solo sulle patch in
  // attesa, che sono quelle da pianificare.
  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-72">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filters.query}
          onChange={(e) => set({ query: e.target.value })}
          placeholder="Cerca KB, sistema o patch…"
          className="h-8 pl-8 text-sm"
        />
      </div>
      {severities.length > 0 && (
        <Select value={filters.severity} onValueChange={(v) => set({ severity: v })}>
          <SelectTrigger className="w-40 h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte le severity</SelectItem>
            {severities.map((s) => <SelectItem key={s} value={s}>{titleCase(s)}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      {filtering && <span className="text-xs text-muted-foreground">{filtered.length} di {patches.length}</span>}
      {type === 'pending' && (
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-2 sm:ml-auto"
          disabled={filtered.length === 0}
          title="Le patch che vedi, con un foglio raggruppato per KB"
          onClick={() => exportOsPatchesXlsx(filtered as OsPatchPending[], { runDate, filtered: filtering })}
        >
          <Download className="h-4 w-4" /> Esporta Excel
        </Button>
      )}
    </div>
  );

  const empty = filtered.length === 0 && (
    <TableRow>
      <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">Nessuna patch corrisponde ai filtri.</TableCell>
    </TableRow>
  );

  const controls = totalPages > 1 && (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span>{page * pageSize + 1}–{Math.min((page + 1) * pageSize, filtered.length)} di {filtered.length}</span>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setPage(p => p - 1)} disabled={page === 0}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="px-2">{page + 1} / {totalPages}</span>
        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setPage(p => p + 1)} disabled={page === totalPages - 1}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  if (type === 'pending') {
    const rows = slice as OsPatchPending[];
    return (
      <div className="space-y-3">
        {toolbar}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[15%]">System Name</TableHead>
              <TableHead className="w-[60%]">Patch</TableHead>
              <TableHead>KB Number</TableHead>
              <TableHead>Severity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {empty}
            {rows.map((p, i) => (
              <TableRow key={i}>
                <TableCell>{p.systemName}</TableCell>
                <TableCell><PatchCell type={p.patchType} name={p.patch} /></TableCell>
                <TableCell>{p.kbNumber || '-'}</TableCell>
                <TableCell>
                  <Badge className={cn('font-medium', severityColors[p.severity?.toUpperCase()] ?? 'bg-muted text-muted-foreground')}>
                    {p.severity ? titleCase(p.severity) : '-'}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {controls}
      </div>
    );
  }

  const rows = slice as OsPatchInstalled[];
  return (
    <div className="space-y-3">
      {toolbar}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[15%]">System Name</TableHead>
            <TableHead className="w-[60%]">Patch</TableHead>
            <TableHead className="whitespace-nowrap">KB Number</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {empty}
          {rows.map((p, i) => (
            <TableRow key={i}>
              <TableCell>{p.systemName}</TableCell>
              <TableCell><PatchCell type={p.patchType} name={p.patch} /></TableCell>
              <TableCell>{p.kbNumber || '-'}</TableCell>
              <TableCell>
                <Badge className={cn('font-medium', statusColors[p.status?.toUpperCase()] ?? 'bg-muted text-muted-foreground')}>
                  {p.status ? p.status.charAt(0).toUpperCase() + p.status.slice(1).toLowerCase() : '-'}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {controls}
    </div>
  );
};
