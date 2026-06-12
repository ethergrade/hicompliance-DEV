import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
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
}

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

export const OsPatchesTable: React.FC<OsPatchesTableProps> = ({ patches, type, pageSize = 10 }) => {
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(patches.length / pageSize);
  const slice = patches.slice(page * pageSize, (page + 1) * pageSize);

  const controls = totalPages > 1 && (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span>{page * pageSize + 1}–{Math.min((page + 1) * pageSize, patches.length)} di {patches.length}</span>
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
            {rows.map((p, i) => (
              <TableRow key={i}>
                <TableCell>{p.systemName}</TableCell>
                <TableCell><PatchCell type={p.patchType} name={p.patch} /></TableCell>
                <TableCell>{p.kbNumber || '-'}</TableCell>
                <TableCell>
                  <Badge className={cn('font-medium', severityColors[p.severity?.toUpperCase()] ?? 'bg-muted text-muted-foreground')}>
                    {p.severity ? p.severity.charAt(0).toUpperCase() + p.severity.slice(1).toLowerCase() : '-'}
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
