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
import { useCveIntelBatch } from '@/hooks/useCveIntel';
import { useSurfaceScanDiscoveredAssets } from '@/hooks/useSurfaceScanDiscoveredAssets';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CveDetailDialog } from '@/components/surface-scan/CveDetailDialog';
import { CVE_REGEX, cweDescription, cweLink, findingSummary, getFindingTaxonomy, owaspDescription } from '@/lib/findingTaxonomy';

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
const severityItalian: Record<string, string> = {
  critical: 'Critico',
  high: 'Alto',
  medium: 'Medio',
  low: 'Basso',
  info: 'Info',
};
const severityBuckets: Array<SurfaceFindingRow['severity']> = ['critical', 'high', 'medium', 'low', 'info'];

interface GroupedAsset {
  assetKey: string;
  assetLabel: string;
  findings: SurfaceFindingRow[];
  maxSeverity: SurfaceFindingRow['severity'];
  lastUpdate: string;
  subAssets: string[];
  primaryIp: string | null;
  sourceBadge: string;
}

const normalizeHost = (value: string): string =>
  String(value || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '');

const extractAssetHost = (row: SurfaceFindingRow): string => {
  const urlCandidate = String(row.affected_url || '').trim();
  if (urlCandidate) {
    try {
      return normalizeHost(new URL(urlCandidate).hostname);
    } catch {
      // noop
    }
  }
  const assetCandidate = String(row.affected_asset || '').trim();
  if (assetCandidate) {
    if (/^https?:\/\//i.test(assetCandidate)) {
      try {
        return normalizeHost(new URL(assetCandidate).hostname);
      } catch {
        // noop
      }
    }
    return normalizeHost(assetCandidate);
  }
  if (row.ip) return String(row.ip).trim();
  return '';
};

const normalizeAsset = (row: SurfaceFindingRow): string => {
  const normalized = extractAssetHost(row);
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

const extractCvesFromText = (value: string): string[] =>
  ((value || '').match(CVE_REGEX) || []).map((cve) => cve.toUpperCase());

const findingCves = (row: SurfaceFindingRow): string[] => {
  const explicit = Array.isArray(row.cve) ? row.cve : [];
  const inferred = [
    ...extractCvesFromText(String(row.title || '')),
    ...extractCvesFromText(String(row.description || '')),
    ...extractCvesFromText(String(row.remediation || '')),
  ];
  return [...new Set([...explicit, ...inferred])];
};

const sourceFamily = (row: SurfaceFindingRow): string => {
  const provider = String(row.provider || '').toLowerCase();
  const module = String(row.module || '').toLowerCase();
  if (provider.includes('pentest')) return 'Pentest-Tools';
  if (provider.includes('shodan')) return 'Shodan';
  if (provider.includes('urlscan')) return 'urlscan';
  if (provider.includes('internal') || provider.includes('surface_scan') || module) return 'OSINT Intel';
  return 'Internal';
};

const confidenceFactor = (row: SurfaceFindingRow): number | null => {
  const raw = row.evidence && typeof row.evidence === 'object' ? (row.evidence as Record<string, any>).confidence_factor : null;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.max(0, Math.min(1, raw));
  }
  const parsed = Number(raw);
  if (Number.isFinite(parsed)) {
    return Math.max(0, Math.min(1, parsed));
  }
  return null;
};

const confidenceReasons = (row: SurfaceFindingRow): string[] => {
  const raw = row.evidence && typeof row.evidence === 'object' ? (row.evidence as Record<string, any>).confidence_reasons : null;
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => String(entry || '').trim()).filter(Boolean);
};

const owaspBadgeTone = (owasp?: string | null): string => {
  const key = String(owasp || '').toUpperCase();
  if (key.startsWith('A01') || key.startsWith('A03') || key.startsWith('A07')) {
    return 'bg-red-500/15 text-red-400 border-red-500/30';
  }
  if (key.startsWith('A02') || key.startsWith('A06')) {
    return 'bg-orange-500/15 text-orange-300 border-orange-500/30';
  }
  if (key.startsWith('A05')) {
    return 'bg-violet-500/20 text-violet-300 border-violet-500/30';
  }
  return 'bg-muted text-muted-foreground border-border';
};

const OWASP_TOP10_LINKS: Record<string, string> = {
  'A01:2021': 'https://owasp.org/Top10/2021/A01_2021-Broken_Access_Control/',
  'A02:2021': 'https://owasp.org/Top10/2021/A02_2021-Cryptographic_Failures/',
  'A03:2021': 'https://owasp.org/Top10/2021/A03_2021-Injection/',
  'A04:2021': 'https://owasp.org/Top10/2021/A04_2021-Insecure_Design/',
  'A05:2021': 'https://owasp.org/Top10/2021/A05_2021-Security_Misconfiguration/',
  'A06:2021': 'https://owasp.org/Top10/2021/A06_2021-Vulnerable_and_Outdated_Components/',
  'A07:2021': 'https://owasp.org/Top10/2021/A07_2021-Identification_and_Authentication_Failures/',
  'A08:2021': 'https://owasp.org/Top10/2021/A08_2021-Software_and_Data_Integrity_Failures/',
  'A09:2021': 'https://owasp.org/Top10/2021/A09_2021-Security_Logging_and_Monitoring_Failures/',
  'A10:2021': 'https://owasp.org/Top10/2021/A10_2021-Server-Side_Request_Forgery_%28SSRF%29/',
};

const owaspLink = (owasp?: string | null): string | null => {
  if (!owasp) return null;
  return OWASP_TOP10_LINKS[String(owasp).toUpperCase()] || null;
};

const findingTechnicalContext = (
  row: SurfaceFindingRow,
  taxonomy: ReturnType<typeof getFindingTaxonomy>,
  inferredCvss: number | null | undefined,
  rowCves: string[],
): string => {
  const owasp = taxonomy?.owasp;
  const owaspText = owasp ? `${owasp}${taxonomy?.owaspLabel ? ` (${taxonomy.owaspLabel})` : ''}` : 'non mappato';
  if (row.finding_type === 'missing_hsts') {
    const score = inferredCvss != null ? Number(inferredCvss).toFixed(1) : String(taxonomy?.baseScore ?? '6.5');
    return `Debolezza di configurazione mappata in OWASP ${owaspText}. CVSS tipico: ${score}. ` +
      `Non esiste un CVE univoco per la sola assenza di HSTS ed EPSS non è applicabile senza CVE. ` +
      `Rischio: downgrade HTTPS→HTTP e attacchi SSL stripping / Man-in-the-Middle.`;
  }

  if (rowCves.length > 0) {
    const cvss = inferredCvss != null ? Number(inferredCvss).toFixed(1) : 'n/d';
    return `Finding con CVE associate (${rowCves.slice(0, 3).join(', ')}${rowCves.length > 3 ? '…' : ''}) ` +
      `e mappatura OWASP ${owaspText}. CVSS: ${cvss}.`;
  }

  const baseline = taxonomy?.baseScore != null ? taxonomy.baseScore.toFixed(1) : 'n/d';
  return `Debolezza configurativa senza CVE specifico, mappata OWASP ${owaspText}. ` +
    `CVSS baseline stimato: ${baseline}. EPSS non disponibile senza CVE.`;
};

const cvssTooltipText = (
  rowCves: string[],
  displayCvss: number | null,
  cvssIsBaseline: boolean,
): string => {
  if (displayCvss == null) return 'CVSS non disponibile per questo finding.';
  if (cvssIsBaseline) {
    return `CVSS ${displayCvss.toFixed(1)} stimato come baseline configurativa: non legato a un CVE specifico.`;
  }
  if (rowCves.length > 0) {
    return `CVSS ${displayCvss.toFixed(1)} derivato da CVE associate o da intel provider.`;
  }
  return `CVSS ${displayCvss.toFixed(1)} derivato dal finding.`;
};

const SecurityFindings: React.FC = () => {
  const { findings, loading, counts } = useSurfaceScanFindings();
  const { hostMeta } = useSurfaceScanDiscoveredAssets();
  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [openAssets, setOpenAssets] = useState<Record<string, boolean>>({});
  const [selectedCveId, setSelectedCveId] = useState<string | null>(null);

  const itemsPerPage = 15;

  const allCves = useMemo(
    () =>
      [...new Set(findings.flatMap((row) => findingCves(row)).map((cve) => cve.toUpperCase()))]
        .slice(0, 500),
    [findings],
  );
  const { data: cveIntelMap } = useCveIntelBatch(allCves);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return findings
      .filter((row) => {
        const taxonomy = getFindingTaxonomy(row.finding_type);
        const cweCandidates = [
          ...(row.cwe || []),
          ...(taxonomy?.cwe ? [taxonomy.cwe] : []),
        ];
        const owaspCandidates = [
          ...(taxonomy?.owasp ? [taxonomy.owasp] : []),
          ...(taxonomy?.owaspLabel ? [taxonomy.owaspLabel] : []),
        ];
        const matchesTerm =
          !term ||
          row.title.toLowerCase().includes(term) ||
          (row.finding_type || '').toLowerCase().includes(term) ||
          (row.affected_asset || '').toLowerCase().includes(term) ||
          (row.affected_url || '').toLowerCase().includes(term) ||
          (row.ip || '').toLowerCase().includes(term) ||
          (row.provider || '').toLowerCase().includes(term) ||
          (row.module || '').toLowerCase().includes(term) ||
          (row.cve || []).some((cve) => cve.toLowerCase().includes(term)) ||
          cweCandidates.some((cwe) => String(cwe || '').toLowerCase().includes(term)) ||
          owaspCandidates.some((owasp) => String(owasp || '').toLowerCase().includes(term));

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
        const primaryIp = sortedRows.find((entry) => entry.ip)?.ip || hostMeta[assetLabel]?.ips?.[0] || null;
        const sourceBadge = hostMeta[assetLabel]?.fromScope
          ? 'Scope'
          : hostMeta[assetLabel]?.fromDump
            ? 'Dump/OSINT'
            : hostMeta[assetLabel]?.fromReverseDns
              ? 'Reverse'
              : 'Scan';

        const subAssets = [...new Set(sortedRows.map((row) => normalizeSubAsset(row, assetLabel)).filter((v) => v !== '-'))];

        return {
          assetKey,
          assetLabel,
          findings: sortedRows,
          maxSeverity,
          lastUpdate,
          subAssets,
          primaryIp,
          sourceBadge,
        };
      })
      .sort((a, b) => {
        const sevDiff = (severityOrder[b.maxSeverity] || 0) - (severityOrder[a.maxSeverity] || 0);
        if (sevDiff !== 0) return sevDiff;
        return a.assetLabel.localeCompare(b.assetLabel, 'it', { sensitivity: 'base' });
      });
  }, [filtered, hostMeta]);

  const unattributedSignals = useMemo(
    () =>
      filtered.filter(
        (row) => row.finding_type === 'shodan_cve_signal_unattributed' || row.attribution_confidence === 'low',
      ),
    [filtered],
  );

  const totalPages = Math.max(1, Math.ceil(groupedAssets.length / itemsPerPage));
  const paginatedAssets = groupedAssets.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const toggleAsset = (assetKey: string) => {
    setOpenAssets((prev) => ({ ...prev, [assetKey]: !prev[assetKey] }));
  };

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, severityFilter, statusFilter]);

  return (
    <>
    <Card className="border-border">
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-red-500" />
              Security Findings & Vulnerabilita
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Finding reali da Shodan, OSINT/WebCheck e Pentest-Tools con severity, CVE/CVSS/EPSS, CWE/OWASP e remediation
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

        {unattributedSignals.length > 0 && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
            <p className="text-sm font-medium">Segnali CVE non attribuiti: {unattributedSignals.length}</p>
            <p className="text-xs text-muted-foreground">
              Questi segnali provengono da IP condivisi/hosting multi-tenant: visibili separatamente, non forzati sul dominio.
            </p>
          </div>
        )}

        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              className="pl-9"
              placeholder="Cerca per titolo, CVE/CWE/OWASP, asset, modulo, provider..."
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
                <TableHead>IP Dominio</TableHead>
                <TableHead>Origine</TableHead>
                <TableHead>Sub Asset</TableHead>
                <TableHead>Tot. Finding</TableHead>
                <TableHead>Severity Max</TableHead>
                <TableHead>Ultimo Finding</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                    Caricamento findings...
                  </TableCell>
                </TableRow>
              )}

              {!loading && paginatedAssets.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
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
                        <TableCell className="text-sm">{assetGroup.primaryIp || '-'}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{assetGroup.sourceBadge}</Badge>
                        </TableCell>
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
                          <TableCell colSpan={8} className="bg-muted/10 p-0">
                            <div className="p-3">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Severity</TableHead>
                                    <TableHead>Titolo</TableHead>
                                    <TableHead>Sub Asset</TableHead>
                                    <TableHead>
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <span className="cursor-help underline decoration-dotted underline-offset-2">
                                              OWASP
                                            </span>
                                          </TooltipTrigger>
                                          <TooltipContent className="max-w-xs text-xs">
                                            Categoria OWASP Top 10 associata al finding (quando disponibile).
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    </TableHead>
                                    <TableHead>CVE</TableHead>
                                    <TableHead>
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <span className="cursor-help underline decoration-dotted underline-offset-2">
                                              CVSS
                                            </span>
                                          </TooltipTrigger>
                                          <TooltipContent className="max-w-xs text-xs">
                                            Punteggio di severità. Se non c&apos;è CVE, può essere mostrata una baseline configurativa.
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    </TableHead>
                                    <TableHead>EPSS</TableHead>
                                    <TableHead>CISA KEV</TableHead>
                                    <TableHead>Confidence</TableHead>
                                    <TableHead>Source</TableHead>
                                    <TableHead>Remediation</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {severityBuckets.map((bucketSeverity) => {
                                    const bucketRows = assetGroup.findings.filter((row) => row.severity === bucketSeverity);
                                    if (bucketRows.length === 0) return null;
                                    return (
                                      <React.Fragment key={`${assetGroup.assetKey}-${bucketSeverity}`}>
                                        <TableRow>
                                          <TableCell colSpan={11} className="bg-muted/30 py-2">
                                            <div className="flex items-center gap-2 text-xs font-medium">
                                              <Badge className={severityStyle[bucketSeverity] || severityStyle.info}>
                                                {severityItalian[bucketSeverity]}
                                              </Badge>
                                              <span>{bucketRows.length} finding</span>
                                            </div>
                                          </TableCell>
                                        </TableRow>
                                        {bucketRows.map((row) => (
                                          <TableRow key={row.id}>
                                            {(() => {
                                              const rowCves = findingCves(row);
                                              const rowIntel = rowCves
                                                .map((cve) => cveIntelMap?.[cve.toUpperCase()])
                                                .filter(Boolean);
                                              const inferredCvss =
                                                row.cvss ??
                                                rowIntel
                                                  .map((intel) => Number(intel?.cvss_v3_score ?? NaN))
                                                  .filter((score) => Number.isFinite(score))
                                                  .sort((a, b) => b - a)[0];
                                              const inferredEpss =
                                                row.epss ??
                                                rowIntel
                                                  .map((intel) => Number(intel?.epss_score ?? NaN))
                                                  .filter((score) => Number.isFinite(score))
                                                  .sort((a, b) => b - a)[0];
                                              const inferredKev = row.cisa_kev || rowIntel.some((intel) => Boolean(intel?.cisa_kev));
                                              const taxonomy = getFindingTaxonomy(row.finding_type);
                                              const cwes = [...new Set([...(row.cwe || []), ...(taxonomy?.cwe ? [taxonomy.cwe] : [])])];
                                              const owasp = taxonomy?.owasp || null;
                                              const owaspHref = owaspLink(owasp);
                                              const techContext = findingTechnicalContext(row, taxonomy, inferredCvss, rowCves);
                                              const displayCvss = inferredCvss ?? taxonomy?.baseScore ?? null;
                                              const cvssIsBaseline = inferredCvss == null && taxonomy?.baseScore != null && rowCves.length === 0;
                                              const cvssHint = cvssTooltipText(rowCves, displayCvss, cvssIsBaseline);
                                              return (
                                                <>
                                                  <TableCell>
                                                    <Badge className={severityStyle[row.severity] || severityStyle.info}>
                                                      {row.severity.toUpperCase()}
                                                    </Badge>
                                                  </TableCell>
                                                  <TableCell className="min-w-64">
                                                    <div className="font-medium">{row.title}</div>
                                                    <div className="flex flex-wrap gap-1 mt-1">
                                                      <Badge variant="outline" className="text-[10px] font-mono">
                                                        {row.finding_type || 'n/a'}
                                                      </Badge>
                                                      {cwes.map((cwe) => {
                                                        const tooltip = cweDescription(cwe);
                                                        return (
                                                          <TooltipProvider key={`${row.id}-${cwe}`}>
                                                            <Tooltip>
                                                              <TooltipTrigger asChild>
                                                                <a href={cweLink(cwe)} target="_blank" rel="noopener noreferrer">
                                                                  <Badge variant="secondary" className="text-[10px] font-mono">
                                                                    {cwe}
                                                                  </Badge>
                                                                </a>
                                                              </TooltipTrigger>
                                                              {tooltip && (
                                                                <TooltipContent className="max-w-xs text-xs">
                                                                  {tooltip}
                                                                </TooltipContent>
                                                              )}
                                                            </Tooltip>
                                                          </TooltipProvider>
                                                        );
                                                      })}
                                                      <Badge variant={row.status === 'open' ? 'destructive' : 'secondary'} className="text-[10px]">
                                                        {(row.status || 'open').toUpperCase()}
                                                      </Badge>
                                                      <Badge variant="outline" className="text-[10px]">
                                                        {sourceFamily(row)}
                                                      </Badge>
                                                    </div>
                                                    <div className="text-xs text-muted-foreground mt-2">
                                                      {row.description || findingSummary(row.finding_type) || 'Nessuna sintesi disponibile'}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground mt-1">
                                                      {techContext}
                                                    </div>
                                                  </TableCell>
                                                  <TableCell className="min-w-44">
                                                    {normalizeSubAsset(row, assetGroup.assetLabel)}
                                                  </TableCell>
                                                  <TableCell className="min-w-32">
                                                    {owasp ? (
                                                      <div className="space-y-1">
                                                        <TooltipProvider>
                                                          <Tooltip>
                                                            <TooltipTrigger asChild>
                                                              {owaspHref ? (
                                                                <a href={owaspHref} target="_blank" rel="noopener noreferrer">
                                                                  <Badge className={`text-[10px] ${owaspBadgeTone(owasp)} cursor-help`}>
                                                                    {owasp}
                                                                  </Badge>
                                                                </a>
                                                              ) : (
                                                                <Badge className={`text-[10px] ${owaspBadgeTone(owasp)} cursor-help`}>
                                                                  {owasp}
                                                                </Badge>
                                                              )}
                                                            </TooltipTrigger>
                                                            <TooltipContent className="max-w-xs text-xs">
                                                              {owaspDescription(owasp) || owasp}
                                                            </TooltipContent>
                                                          </Tooltip>
                                                        </TooltipProvider>
                                                        {taxonomy?.owaspLabel && (
                                                          <div className="text-[10px] text-muted-foreground">
                                                            {taxonomy.owaspLabel}
                                                          </div>
                                                        )}
                                                      </div>
                                                    ) : (
                                                      <span className="text-xs text-muted-foreground">-</span>
                                                    )}
                                                  </TableCell>
                                                  <TableCell className="min-w-32">
                                                    {rowCves.length > 0 ? (
                                                      <div className="flex flex-wrap gap-1">
                                                        {rowCves.slice(0, 3).map((cve) => (
                                                          <Button
                                                            key={`${row.id}-${cve}`}
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-6 px-2 text-[10px] font-mono"
                                                            onClick={() => setSelectedCveId(String(cve))}
                                                          >
                                                            {cve}
                                                          </Button>
                                                        ))}
                                                        {rowCves.length > 3 && (
                                                          <Badge variant="secondary" className="text-[10px]">
                                                            +{rowCves.length - 3}
                                                          </Badge>
                                                        )}
                                                      </div>
                                                    ) : (
                                                      <div className="text-xs font-mono">-</div>
                                                    )}
                                                  </TableCell>
                                                  <TableCell>
                                                    {displayCvss != null ? (
                                                      <TooltipProvider>
                                                        <Tooltip>
                                                          <TooltipTrigger asChild>
                                                            <div className="inline-flex items-center gap-1">
                                                              <span>{displayCvss.toFixed(1)}</span>
                                                              {cvssIsBaseline && (
                                                                <Badge variant="outline" className="text-[10px] h-5 px-1">
                                                                  baseline
                                                                </Badge>
                                                              )}
                                                            </div>
                                                          </TooltipTrigger>
                                                          <TooltipContent className="max-w-xs text-xs">
                                                            {cvssHint}
                                                          </TooltipContent>
                                                        </Tooltip>
                                                      </TooltipProvider>
                                                    ) : (
                                                      '-'
                                                    )}
                                                  </TableCell>
                                                  <TableCell>
                                                    {inferredEpss != null ? `${(Number(inferredEpss) * 100).toFixed(2)}%` : '-'}
                                                  </TableCell>
                                                  <TableCell>{inferredKev ? 'Yes' : 'No'}</TableCell>
                                                  <TableCell>
                                                    {(() => {
                                                      const factor = confidenceFactor(row);
                                                      const reasons = confidenceReasons(row);
                                                      const label = row.attribution_confidence || '-';
                                                      if (factor == null) {
                                                        return <span>{label}</span>;
                                                      }
                                                      const value = `${label} · ${factor.toFixed(2)}`;
                                                      if (reasons.length === 0) {
                                                        return <span>{value}</span>;
                                                      }
                                                      return (
                                                        <TooltipProvider>
                                                          <Tooltip>
                                                            <TooltipTrigger asChild>
                                                              <span className="cursor-help underline decoration-dotted underline-offset-2">{value}</span>
                                                            </TooltipTrigger>
                                                            <TooltipContent className="max-w-xs text-xs">
                                                              {reasons.join(' | ')}
                                                            </TooltipContent>
                                                          </Tooltip>
                                                        </TooltipProvider>
                                                      );
                                                    })()}
                                                  </TableCell>
                                                  <TableCell className="min-w-32">
                                                    {(row.provider || 'surface_scan_engine')} / {(row.module || '-')}
                                                  </TableCell>
                                                  <TableCell className="min-w-72 text-xs text-muted-foreground">
                                                    {row.remediation || '-'}
                                                  </TableCell>
                                                </>
                                              );
                                            })()}
                                          </TableRow>
                                        ))}
                                      </React.Fragment>
                                    );
                                  })}
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
    <CveDetailDialog
      cveId={selectedCveId}
      open={Boolean(selectedCveId)}
      onOpenChange={(open) => {
        if (!open) setSelectedCveId(null);
      }}
    />
    </>
  );
};

export default SecurityFindings;
