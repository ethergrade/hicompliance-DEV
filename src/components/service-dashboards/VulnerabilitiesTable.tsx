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

interface Vulnerability {
  id: string;
  remediation: string;
  score: number;
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
}

interface VulnerabilitiesTableProps {
  vulnerabilities: Vulnerability[];
}

const severityColors = {
  Low: 'bg-green-500/20 text-green-500',
  Medium: 'bg-yellow-500/20 text-yellow-500',
  High: 'bg-red-500/20 text-red-500',
  Critical: 'bg-red-700/20 text-red-700',
};

export const VulnerabilitiesTable: React.FC<VulnerabilitiesTableProps> = ({
  vulnerabilities,
}) => {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[40%]">Title</TableHead>
          <TableHead>Remediation</TableHead>
          <TableHead>Score</TableHead>
          <TableHead>Severity</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {vulnerabilities.map((vuln, index) => (
          <TableRow key={index}>
            <TableCell className="font-medium">
              <div className="flex items-center gap-2">
                {vuln.id}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Dettagli su {vuln.id}</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </TableCell>
            <TableCell className="text-muted-foreground">{vuln.remediation}</TableCell>
            <TableCell>{vuln.score.toFixed(2)}</TableCell>
            <TableCell>
              <Badge className={cn("font-medium", severityColors[vuln.severity])}>
                {vuln.severity}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};
