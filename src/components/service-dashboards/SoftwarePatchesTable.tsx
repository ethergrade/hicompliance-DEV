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

interface SoftwarePatchAvailable {
  systemName: string;
  patch: string;
  description: string;
  impact: 'Critical' | 'High' | 'Medium' | 'Low';
  status: 'Rejected' | 'Pending' | 'Approved';
}

interface SoftwarePatchInstalled {
  systemName: string;
  product: string;
  type: string;
  status: 'Installed' | 'Failed';
}

interface SoftwarePatchesTableProps {
  patches: (SoftwarePatchAvailable | SoftwarePatchInstalled)[];
  type: 'available' | 'installed';
}

const impactColors = {
  Low: 'bg-green-500/20 text-green-500',
  Medium: 'bg-yellow-500/20 text-yellow-500',
  High: 'bg-orange-500/20 text-orange-500',
  Critical: 'bg-red-500/20 text-red-500',
};

const statusColors = {
  Installed: 'bg-green-500/20 text-green-500',
  Failed: 'bg-red-500/20 text-red-500',
  Rejected: 'bg-red-400/20 text-red-400',
  Pending: 'bg-yellow-500/20 text-yellow-500',
  Approved: 'bg-green-500/20 text-green-500',
};

export const SoftwarePatchesTable: React.FC<SoftwarePatchesTableProps> = ({ patches, type }) => {
  if (type === 'available') {
    const availablePatches = patches as SoftwarePatchAvailable[];
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[180px]">System Name</TableHead>
            <TableHead>Patch</TableHead>
            <TableHead>Impact</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {availablePatches.map((patch, index) => (
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
              <TableCell>{patch.impact}</TableCell>
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
  }

  const installedPatches = patches as SoftwarePatchInstalled[];
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[180px]">System Name</TableHead>
          <TableHead>Product</TableHead>
          <TableHead>Type</TableHead>
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
            <TableCell>{patch.product}</TableCell>
            <TableCell>{patch.type}</TableCell>
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
