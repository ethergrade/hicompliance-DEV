import React, { useState, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Info } from 'lucide-react';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { HipatchCveAsset } from '@/lib/api/hipatch';

interface Vulnerability {
  id: string;
  description?: string;
  score: number;
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  assets?: HipatchCveAsset[];
}

interface VulnerabilitiesTableProps {
  vulnerabilities: Vulnerability[];
  pageSize?: number;
}

const severityColors = {
  Low: 'bg-green-500/20 text-green-500',
  Medium: 'bg-yellow-500/20 text-yellow-500',
  High: 'bg-red-500/20 text-red-500',
  Critical: 'bg-red-700/20 text-red-700',
};

const AssetsModal: React.FC<{ assets: HipatchCveAsset[]; title: string; open: boolean; onClose: () => void }> = ({ assets, title, open, onClose }) => (
  <Dialog open={open} onOpenChange={onClose}>
    <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Asset coinvolti — {title}</DialogTitle>
      </DialogHeader>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>IP</TableHead>
            <TableHead>MAC</TableHead>
            <TableHead>OS</TableHead>
            <TableHead>Last ping</TableHead>
            <TableHead>Last discovered</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {assets.map((a, i) => (
            <TableRow key={i}>
              <TableCell>
                <div className="font-medium">{a['data.name'] ?? '-'}</div>
                {a['data.host_name'] && a['data.host_name'] !== a['data.name'] && (
                  <div className="text-xs text-muted-foreground">{a['data.host_name']}</div>
                )}
              </TableCell>
              <TableCell>{a['data.asset_type'] ?? '-'}</TableCell>
              <TableCell>{a['data.ip'] ?? '-'}</TableCell>
              <TableCell>{a['data.mac'] ?? '-'}</TableCell>
              <TableCell>{a['data.os_full_name'] ?? '-'}</TableCell>
              <TableCell>{a['data.last_ping_time'] ?? '-'}</TableCell>
              <TableCell>{a['data.last_discovered_time'] ?? '-'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </DialogContent>
  </Dialog>
);

export const VulnerabilitiesTable: React.FC<VulnerabilitiesTableProps> = ({
  vulnerabilities,
  pageSize = 10,
}) => {
  const [page, setPage] = useState(0);
  const [modalVuln, setModalVuln] = useState<Vulnerability | null>(null);
  const [assetFilter, setAssetFilter] = useState<string>('all');

  // Build unique asset list from all CVEs that have assets
  const assetOptions = useMemo(() => {
    const map = new Map<string, string>();
    vulnerabilities.forEach(v =>
      (v.assets ?? []).forEach(a => {
        const id = a['data.id'];
        const name = a['data.name'] || a['data.ip'] || id;
        if (id && !map.has(id)) map.set(id, name);
      })
    );
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [vulnerabilities]);

  const filtered = useMemo(() =>
    assetFilter === 'all'
      ? vulnerabilities
      : vulnerabilities.filter(v => (v.assets ?? []).some(a => a['data.id'] === assetFilter)),
  [vulnerabilities, assetFilter]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const slice = filtered.slice(page * pageSize, (page + 1) * pageSize);

  const handleFilterChange = (val: string) => {
    setAssetFilter(val);
    setPage(0);
  };

  return (
    <div className="space-y-3">
      {assetOptions.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground shrink-0">Filtra per asset:</span>
          <Select value={assetFilter} onValueChange={handleFilterChange}>
            <SelectTrigger className="w-64 h-8 text-sm">
              <SelectValue placeholder="Tutti gli asset" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli asset</SelectItem>
              {assetOptions.map(([id, name]) => (
                <SelectItem key={id} value={id}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {assetFilter !== 'all' && (
            <span className="text-xs text-muted-foreground">{filtered.length} CVE</span>
          )}
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[50%]">Title</TableHead>
            <TableHead>EPSS Score</TableHead>
            <TableHead>Severity</TableHead>
            <TableHead>Assets</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {slice.map((vuln, index) => (
            <TableRow key={index}>
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  {vuln.id}
                  {vuln.description && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="w-4 h-4 text-muted-foreground cursor-help shrink-0" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>{vuln.description}</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </TableCell>
              <TableCell>{Number(vuln.score).toFixed(4)}</TableCell>
              <TableCell>
                <Badge className={cn("font-medium", severityColors[vuln.severity])}>
                  {vuln.severity}
                </Badge>
              </TableCell>
              <TableCell>
                {vuln.assets && vuln.assets.length > 0 ? (
                  <Button variant="outline" size="sm" onClick={() => setModalVuln(vuln)}>
                    {vuln.assets.length} asset
                  </Button>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {totalPages > 1 && (
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
      )}

      {modalVuln && (
        <AssetsModal
          open={!!modalVuln}
          assets={modalVuln.assets ?? []}
          title={modalVuln.id}
          onClose={() => setModalVuln(null)}
        />
      )}
    </div>
  );
};
