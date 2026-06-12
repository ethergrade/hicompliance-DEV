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

interface SoftwarePatchAvailable {
  systemName: string;
  patchType: string;
  title: string;
  impact: string;
  status: string;
}

interface SoftwarePatchInstalled {
  systemName: string;
  product: string;     // title
  type: string;
  status: string;
  installedAt?: string;
}

interface SoftwarePatchesTableProps {
  patches: (SoftwarePatchAvailable | SoftwarePatchInstalled)[];
  type: 'available' | 'installed';
  pageSize?: number;
}

const statusColors: Record<string, string> = {
  APPROVED: 'bg-green-500/20 text-green-500',
  INSTALLED: 'bg-green-500/20 text-green-500',
  FAILED: 'bg-red-500/20 text-red-500',
  REJECTED: 'bg-red-400/20 text-red-400',
  PENDING: 'bg-yellow-500/20 text-yellow-500',
};

const capitalize = (s: string) =>
  s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '-';

const PatchCell: React.FC<{ type: string; title: string }> = ({ type, title }) => {
  const showType = type && type.toUpperCase() !== 'UNKNOWN' && type.trim() !== '';
  return (
    <div className="space-y-0.5">
      {showType && <div className="font-medium">{type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</div>}
      <div className={showType ? 'text-sm text-muted-foreground' : ''}>{title || '-'}</div>
    </div>
  );
};

export const SoftwarePatchesTable: React.FC<SoftwarePatchesTableProps> = ({ patches, type, pageSize = 10 }) => {
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

  if (type === 'available') {
    const rows = slice as SoftwarePatchAvailable[];
    return (
      <div className="space-y-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[15%]">System Name</TableHead>
              <TableHead className="w-[60%]">Patch</TableHead>
              <TableHead>Impact</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p, i) => (
              <TableRow key={i}>
                <TableCell>{p.systemName}</TableCell>
                <TableCell><PatchCell type={p.patchType} title={p.title} /></TableCell>
                <TableCell>{capitalize(p.impact)}</TableCell>
                <TableCell>
                  <Badge className={cn('font-medium', statusColors[p.status?.toUpperCase()] ?? 'bg-muted text-muted-foreground')}>
                    {capitalize(p.status)}
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

  const rows = slice as SoftwarePatchInstalled[];
  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[15%]">System Name</TableHead>
            <TableHead className="w-[55%]">Product</TableHead>
            <TableHead className="whitespace-nowrap">Type</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((p, i) => (
            <TableRow key={i}>
              <TableCell>{p.systemName}</TableCell>
              <TableCell>{p.product}</TableCell>
              <TableCell>{p.type}</TableCell>
              <TableCell>
                <Badge className={cn('font-medium', statusColors[p.status?.toUpperCase()] ?? 'bg-muted text-muted-foreground')}>
                  {capitalize(p.status)}
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
