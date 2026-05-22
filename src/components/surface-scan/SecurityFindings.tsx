import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Shield, Search, Download, ChevronRight, ChevronDown } from 'lucide-react';
import { useSurfaceScanFindings, type SurfaceFindingRow } from '@/hooks/useSurfaceScanFindings';

const severityOrder: Record<string, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

const severityStyle: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 border-red-300',
  high: 'bg-orange-100 text-orange-800 border-orange-300',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  low: 'bg-green-100 text-green-800 border-green-300',
  info: 'bg-blue-100 text-blue-800 border-blue-300',
};

interface GroupedAsset {
  assetKey: string;
  assetLabel: string;
  findings: SurfaceFindingRow[];
  maxSeverity: SurfaceFindingRow['severity'];
  lastUpdate: string;
  subAssets: string[];
}

const normalizeAsset = (row: SurfaceFindingRow): string => {
  const candidate = row.affected_asset || row.affected_url || row.ip || '';
  const normalized = String(candidate).trim();
  return normalized || 'Asset non specificato';
};

const normalizeSubAsset = (row: SurfaceFindingRow, assetLabel: string): string => {
  const parts = [row.affected_url || '', row.ip || '', row.port ? String(row.port) : '']
    .map((item) => item.trim())
    .filter(Boolean);

  if (parts.length === 0) return '-';

  const composed = parts.join(' | ');
  if (composed === assetLabel) return '-';
  return composed;
};

const SecurityFindings: React.FC = () => {
  const { findings, loading, counts } = useSurfaceScanFindings();
  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [openAssets, setOpenAssets] = useState<Record<string, boolean>>({});

  const itemsPerPage = 15;

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return findings
      .filter((row) => {
        const matchesTerm =
          !term ||
          row.title.toLowerCase().includes(term) ||
          (row.finding_type || '').toLowerCase().includes(term) ||
          (row.affected_asset || '').toLowerCase().includes(term) ||
          (row.affected_url || '').toLowerCase().includes(term) ||
          (row.ip || '').toLowerCase().includes(term) ||
          (row.provider || '').toLowerCase().includes(term) ||
          (row.module || '').toLowerCase().includes(term) ||
          (row.cve || []).some((cve) => cve.toLowerCase().includes(term));

        const matchesSeverity = severityFilter === 'all' || row.severity === severityFilter;
        const matchesStatus = statusFilter === 'all' || row.status === statusFilter;
        return matchesTerm && matchesSeverity && matchesStatus;
      })
      .sort((a, b) => {
        const sevDiff = (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
        if (sevDiff !== 0) return sevDiff;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [findings, searchTerm, severityFilter, statusFilter]);

  const groupedAssets = useMemo<GroupedAsset[]>(() => {
    const grouped = new Map<string, SurfaceFindingRow[]>();

    for (const row of filtered) {
      const assetLabel = normalizeAsset(row);
      const key = assetLabel.toLowerCase();
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(row);
    }

    return [...grouped.entries()]
      .map(([assetKey, rows]) => {
        const sortedRows = [...rows].sort((a, b) => {
          const sevDiff = (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
          if (sevDiff !== 0) return sevDiff;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });

        const maxSeverity = sortedRows[0]?.severity || 'info';
        const lastUpdate = sortedRows[0]?.created_at || new Date(0).toISOString();
        const assetLabel = normalizeAsset(sortedRows[0]);

        const subAssets = [...new Set(sortedRows.map((row) => normalizeSubAsset(row, assetLabel)).filter((v) => v !== '-'))];

        return {
          assetKey,
          assetLabel,
          findings: sortedRows,
          maxSeverity,
          lastUpdate,
          subAssets,
        };
      })
      .sort((a, b) => a.assetLabel.localeCompare(b.assetLabel, 'it', { sensitivity: 'base' }));
  }, [filtered]);

  const totalPages = Math.max(1, Math.ceil(groupedAssets.length / itemsPerPage));
  const paginatedAssets = groupedAssets.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const toggleAsset = (assetKey: string) => {
    setOpenAssets((prev) => ({ ...prev, [assetKey]: !prev[assetKey] }));
  };

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, severityFilter, statusFilter]);

  return (
    <Card className="border-border">
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-red-500" />
              Security Findings & Vulnerabilita
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Finding normalizzati da SurfaceScan360 con severity, CVE/CVSS/EPSS, fonte e remediation
            </p>
          </div>
          <Button variant="outline" disabled>
            <Download className="w-4 h-4 mr-2" />
            Export PDF
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-3 bg-muted/20 rounded-lg">
          <div className="text-center">
            <div className="text-xl font-bold">{counts.total}</div>
            <div className="text-xs text-muted-foreground">Totali</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-red-600">{counts.critical}</div>
            <div className="text-xs text-muted-foreground">Critical</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-orange-600">{counts.high}</div>
            <div className="text-xs text-muted-foreground">High</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-yellow-600">{counts.medium}</div>
            <div className="text-xs text-muted-foreground">Medium</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-green-600">{counts.low}</div>
            <div className="text-xs text-muted-foreground">Low</div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              className="pl-9"
              placeholder="Cerca per titolo, CVE, asset, modulo, provider..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger className="w-full md:w-40">
              <SelectValue placeholder="Severity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="info">Info</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full md:w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In progress</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="false_positive">False positive</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-lg border border-border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14"></TableHead>
                <TableHead>Affected Asset</TableHead>
                <TableHead>Sub Asset</TableHead>
                <TableHead>Tot. Finding</TableHead>
                <TableHead>Severity Max</TableHead>
                <TableHead>Ultimo Finding</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                    Caricamento findings...
                  </TableCell>
                </TableRow>
              )}

              {!loading && paginatedAssets.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                    Nessun finding disponibile
                  </TableCell>
                </TableRow>
              )}

              {!loading &&
                paginatedAssets.map((assetGroup) => {
                  const isOpen = Boolean(openAssets[assetGroup.assetKey]);

                  return (
                    <React.Fragment key={assetGroup.assetKey}>
                      <TableRow className="cursor-pointer" onClick={() => toggleAsset(assetGroup.assetKey)}>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </Button>
                        </TableCell>
                        <TableCell className="font-medium">{assetGroup.assetLabel}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {assetGroup.subAssets.length > 0 ? assetGroup.subAssets.slice(0, 2).join(' • ') : '-'}
                          {assetGroup.subAssets.length > 2 ? ' ...' : ''}
                        </TableCell>
                        <TableCell>{assetGroup.findings.length}</TableCell>
                        <TableCell>
                          <Badge className={severityStyle[assetGroup.maxSeverity] || severityStyle.info}>
                            {assetGroup.maxSeverity.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell>{new Date(assetGroup.lastUpdate).toLocaleString('it-IT')}</TableCell>
                      </TableRow>

                      {isOpen && (
                        <TableRow>
                          <TableCell colSpan={6} className="bg-muted/10 p-0">
                            <div className="p-3">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Severity</TableHead>
                                    <TableHead>Titolo</TableHead>
                                    <TableHead>Sub Asset</TableHead>
                                    <TableHead>CVE</TableHead>
                                    <TableHead>CVSS</TableHead>
                                    <TableHead>EPSS</TableHead>
                                    <TableHead>CISA KEV</TableHead>
                                    <TableHead>Confidence</TableHead>
                                    <TableHead>Source</TableHead>
                                    <TableHead>Remediation</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {assetGroup.findings.map((row) => (
                                    <TableRow key={row.id}>
                                      <TableCell>
                                        <Badge className={severityStyle[row.severity] || severityStyle.info}>
                                          {row.severity.toUpperCase()}
                                        </Badge>
                                      </TableCell>
                                      <TableCell className="min-w-64">
                                        <div className="font-medium">{row.title}</div>
                                        <div className="text-xs text-muted-foreground">
                                          {(row.module || 'n/a')} • {(row.finding_type || 'n/a')}
                                        </div>
                                      </TableCell>
                                      <TableCell className="min-w-44">
                                        {normalizeSubAsset(row, assetGroup.assetLabel)}
                                      </TableCell>
                                      <TableCell className="min-w-32">
                                        <div className="text-xs font-mono">{(row.cve || []).join(', ') || '-'}</div>
                                      </TableCell>
                                      <TableCell>{row.cvss ?? '-'}</TableCell>
                                      <TableCell>{row.epss ?? '-'}</TableCell>
                                      <TableCell>{row.cisa_kev ? 'Yes' : 'No'}</TableCell>
                                      <TableCell>{row.attribution_confidence || '-'}</TableCell>
                                      <TableCell className="min-w-32">
                                        {(row.provider || 'surface_scan_engine')} / {(row.module || '-')}
                                      </TableCell>
                                      <TableCell className="min-w-72 text-xs text-muted-foreground">
                                        {row.remediation || '-'}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })}
            </TableBody>
          </Table>
        </div>

        {totalPages > 1 && (
          <div className="flex justify-center">
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                    className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                  />
                </PaginationItem>
                {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
                  <PaginationItem key={page}>
                    <PaginationLink
                      onClick={() => setCurrentPage(page)}
                      isActive={currentPage === page}
                      className="cursor-pointer"
                    >
                      {page}
                    </PaginationLink>
                  </PaginationItem>
                ))}
                <PaginationItem>
                  <PaginationNext
                    onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                    className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SecurityFindings;
