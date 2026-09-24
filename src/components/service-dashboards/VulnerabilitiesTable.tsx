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
  const [sevFilter, setSevFilter] = useState<string>('all');
  const [groupBy, setGroupBy] = useState<'none' | 'asset'>('none');
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

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
    vulnerabilities
      .filter(v => assetFilter === 'all' || (v.assets ?? []).some(a => a['data.id'] === assetFilter))
      .filter(v => sevFilter === 'all' || v.severity === sevFilter),
  [vulnerabilities, assetFilter, sevFilter]);

  const groups = useMemo(() => {
    if (groupBy !== 'asset') return [];
    const map = new Map<string, { id: string; name: string; ip: string; vulns: Vulnerability[] }>();
    filtered.forEach(v => (v.assets ?? []).forEach(a => {
      const id = a['data.id'];
      if (assetFilter !== 'all' && id !== assetFilter) return;
      if (!map.has(id)) map.set(id, { id, name: a['data.name'] || a['data.ip'] || id, ip: a['data.ip'], vulns: [] });
      map.get(id)!.vulns.push(v);
    }));
    return Array.from(map.values())
      .map(g => ({ ...g, maxEpss: Math.max(...g.vulns.map(v => v.score)), crit: g.vulns.filter(v => v.severity === 'Critical').length }))
      .sort((a, b) => b.maxEpss - a.maxEpss);
  }, [filtered, groupBy, assetFilter]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const slice = filtered.slice(page * pageSize, (page + 1) * pageSize);

  const groupPages = Math.ceil(groups.length / pageSize);
  const groupSlice = groups.slice(page * pageSize, (page + 1) * pageSize);
  const effPages = groupBy === 'asset' ? groupPages : totalPages;
  const effTotal = groupBy === 'asset' ? groups.length : filtered.length;

  const handleFilterChange = (val: string) => {
    setAssetFilter(val);
    setPage(0);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground shrink-0">Raggruppa:</span>
        <Select value={groupBy} onValueChange={(v) => { setGroupBy(v as 'none' | 'asset'); setPage(0); }}>
          <SelectTrigger className="w-40 h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Per CVE</SelectItem>
            <SelectItem value="asset">Per asset</SelectItem>
          </SelectContent>
        </Select>
        {assetOptions.length > 0 && (
          <Select value={assetFilter} onValueChange={handleFilterChange}>
            <SelectTrigger className="w-56 h-8 text-sm"><SelectValue placeholder="Tutti gli asset" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli asset</SelectItem>
              {assetOptions.map(([id, name]) => (
                <SelectItem key={id} value={id}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={sevFilter} onValueChange={(v) => { setSevFilter(v); setPage(0); }}>
          <SelectTrigger className="w-40 h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte le severità</SelectItem>
            <SelectItem value="Critical">Critical</SelectItem>
            <SelectItem value="High">High</SelectItem>
            <SelectItem value="Medium">Medium</SelectItem>
            <SelectItem value="Low">Low</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{filtered.length} CVE{groupBy === 'asset' ? ` su ${groups.length} asset` : ''}</span>
      </div>

      {groupBy === 'asset' ? (
        <div className="space-y-2">
          {groupSlice.map(g => {
            const open = !!openGroups[g.id];
            return (
              <div key={g.id} className="rounded-lg border border-border">
                <button type="button" onClick={() => setOpenGroups(o => ({ ...o, [g.id]: !o[g.id] }))}
                  className="w-full flex items-center justify-between gap-3 p-3 text-left hover:bg-muted/30">
                  <div className="flex items-center gap-2 min-w-0">
                    <ChevronRight className={cn('h-4 w-4 shrink-0 transition-transform', open && 'rotate-90')} />
                    <span className="font-medium truncate">{g.name}</span>
                    <span className="text-xs text-muted-foreground">{g.ip}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 text-xs">
                    {g.crit > 0 && <Badge className={severityColors.Critical}>{g.crit} Critical</Badge>}
                    <Badge variant="outline">{g.vulns.length} CVE</Badge>
                    <span className="text-muted-foreground">EPSS max {g.maxEpss.toFixed(4)}</span>
                  </div>
                </button>
                {open && (
                  <Table>
                    <TableBody>
                      {[...g.vulns].sort((a, b) => b.score - a.score).map(v => (
                        <TableRow key={v.id}>
                          <TableCell className="font-medium w-[40%]">{v.id}</TableCell>
                          <TableCell className="text-muted-foreground text-xs">{v.description}</TableCell>
                          <TableCell>{v.score.toFixed(4)}</TableCell>
                          <TableCell><Badge className={cn('font-medium', severityColors[v.severity])}>{v.severity}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            );
          })}
          {groupSlice.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Nessuna CVE associata ad asset</p>}
        </div>
      ) : (
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
      )}

      {effPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{page * pageSize + 1}–{Math.min((page + 1) * pageSize, effTotal)} di {effTotal}</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setPage(p => p - 1)} disabled={page === 0}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2">{page + 1} / {effPages}</span>
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setPage(p => p + 1)} disabled={page >= effPages - 1}>
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
