import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Info } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface OsPatchPending {
  systemName: string;
  patch: string;
  description: string;
  kbNumber: string;
  severity: 'Important' | 'Critical' | 'Moderate' | 'Low';
}

interface OsPatchInstalled {
  systemName: string;
  patch: string;
  description: string;
  kbNumber: string;
  status: 'Installed' | 'Failed';
}

interface OsPatchesTableProps {
  patches: (OsPatchPending | OsPatchInstalled)[];
  type: 'pending' | 'installed';
}

const severityColors = {
  Low: 'bg-green-500/20 text-green-500',
  Moderate: 'bg-yellow-500/20 text-yellow-500',
  Important: 'bg-orange-500/20 text-orange-500',
  Critical: 'bg-red-500/20 text-red-500',
};

const statusColors = {
  Installed: 'bg-green-500/20 text-green-500',
  Failed: 'bg-red-500/20 text-red-500',
};

export const OsPatchesTable: React.FC<OsPatchesTableProps> = ({ patches, type }) => {
  if (type === 'pending') {
    const pendingPatches = patches as OsPatchPending[];
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[180px]">System Name</TableHead>
            <TableHead>Patch</TableHead>
            <TableHead>KB Number</TableHead>
            <TableHead>Severity</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pendingPatches.map((patch, index) => (
            <TableRow key={index}>
              <TableCell>
                <div className="flex items-center gap-2">
                  {patch.systemName}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Sistema: {patch.systemName}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </TableCell>
              <TableCell>
                <div className="space-y-1">
                  <div className="font-medium">{patch.patch}</div>
                  <div className="text-sm text-muted-foreground">{patch.description}</div>
                </div>
              </TableCell>
              <TableCell>{patch.kbNumber}</TableCell>
              <TableCell>
                <Badge className={cn("font-medium", severityColors[patch.severity])}>
                  {patch.severity}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  const installedPatches = patches as OsPatchInstalled[];
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[180px]">System Name</TableHead>
          <TableHead>Patch</TableHead>
          <TableHead>KB Number</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {installedPatches.map((patch, index) => (
          <TableRow key={index}>
            <TableCell>
              <div className="flex items-center gap-2">
                {patch.systemName}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Sistema: {patch.systemName}</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </TableCell>
            <TableCell>
              <div className="space-y-1">
                <div className="font-medium">{patch.patch}</div>
                <div className="text-sm text-muted-foreground">{patch.description}</div>
              </div>
            </TableCell>
            <TableCell>{patch.kbNumber}</TableCell>
            <TableCell>
              <Badge className={cn("font-medium", statusColors[patch.status])}>
                {patch.status}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};
