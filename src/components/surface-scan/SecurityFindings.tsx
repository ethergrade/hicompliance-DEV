import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import {
  Search,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Shield,
  Clock,
  CheckCircle,
  XCircle,
  Download,
  Eye,
  Calendar,
  Loader2,
  Lightbulb,
  GitBranch,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import { useExternalCveFindings, type ExternalCveFinding } from '@/hooks/usePentestTools';
import type { ShodanAsset } from '@/hooks/useShodanScan';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { getFindingTaxonomy, OWASP_TOP_10, cweLink, CVE_REGEX } from '@/lib/findingTaxonomy';
import { useCveIntelBatch } from '@/hooks/useCveIntel';
import { CveDetailDialog } from './CveDetailDialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface SecurityFindingsProps {
  shodanAssets?: ShodanAsset[];
  scanRunning?: boolean;
  dumpedHosts?: Array<{ host: string; from: string | null }>;
}

interface SecurityFinding {
  id: string;
  ip: string;
  source: string;
  hostname: string;
  assetType: string;
  operatingSystem: string;
  lastUpdated: string;
  highestSeverity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  totalFindings: number;
  epssScore: number;
  vulnerabilities: Vulnerability[];
}

interface Vulnerability {
  id: string;
  cveId: string;
  cveList: string[];
  cvssScore: number | null;
  cvssVector: string;
  epssScore: number | null;
  epssPercentile: number | null;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: string;
  cwe: string | null;
  owasp: string | null;
  discoveredDate: string;
  lastModified: string;
  remediationStatus: 'open' | 'in_progress' | 'resolved' | 'false_positive';
  patchAvailable: boolean;
  remediationText: string | null;
  exploitAvailable: boolean;
  affectedService: string;
  source: string;
}

interface SurfaceDbFinding {
  id: string;
  provider: string | null;
  module: string | null;
  finding_type: string;
  title: string;
  description: string | null;
  severity: string;
  affected_asset: string | null;
  affected_url: string | null;
  ip: string | null;
  port: number | null;
  protocol: string | null;
  cve: string[] | null;
  cvss: number | null;
  epss: number | null;
  cisa_kev: boolean | null;
  remediation: string | null;
  evidence: unknown;
  attribution_confidence: string | null;
  status: string;
  created_at: string;
}

const severityRank: Record<SecurityFinding['highestSeverity'], number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

const normalizeSeverity = (severity?: string | null): SecurityFinding['highestSeverity'] => {
  if (severity === 'critical' || severity === 'high' || severity === 'medium' || severity === 'low') return severity;
  return 'info';
};

const normalizeStatus = (status?: string | null): Vulnerability['remediationStatus'] => {
  if (status === 'resolved' || status === 'in_progress' || status === 'false_positive') return status;
  return 'open';
};

const epssToDisplay = (value?: number | null) => {
  if (value == null || Number.isNaN(value)) return null;
  return value <= 1 ? value * 10 : value;
};

const pickHighestSeverity = (items: Vulnerability[]): SecurityFinding['highestSeverity'] => {
  return items.reduce<SecurityFinding['highestSeverity']>((highest, item) => (
    severityRank[item.severity] > severityRank[highest] ? item.severity : highest
  ), 'info');
};

const getCvssVector = (evidence: unknown) => {
  if (evidence && typeof evidence === 'object' && 'cvss_vector' in evidence) {
    const value = (evidence as { cvss_vector?: unknown }).cvss_vector;
    return typeof value === 'string' ? value : '—';
  }
  return '—';
};

const SecurityFindings: React.FC<SecurityFindingsProps> = ({ shodanAssets = [], scanRunning = false, dumpedHosts = [] }) => {
  const { organizationId } = useClientOrganization();
  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [epssRangeFilter, setEpssRangeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [owaspFilter, setOwaspFilter] = useState('all');
  const [kevOnly, setKevOnly] = useState(false);
  const [onlyCve, setOnlyCve] = useState(false);
  const [modalCve, setModalCve] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const { data: surfaceFindings = [], isLoading: surfaceFindingsLoading } = useQuery<SurfaceDbFinding[]>({
    queryKey: ['surface-security-findings', organizationId],
    enabled: !!organizationId,
    refetchInterval: scanRunning ? 5000 : 15000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('surface_findings' as never)
        .select('id, provider, module, finding_type, title, description, severity, affected_asset, affected_url, ip, port, protocol, cve, cvss, epss, cisa_kev, remediation, evidence, attribution_confidence, status, created_at')
        .eq('organization_id', organizationId!)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as SurfaceDbFinding[];
    },
  });

  const { data: externalFindings = [], isLoading: externalFindingsLoading } = useExternalCveFindings();

  const realFindings = useMemo<SecurityFinding[]>(() => {
    const rows = new Map<string, SecurityFinding>();

    const ensureRow = (key: string, base: Omit<SecurityFinding, 'vulnerabilities' | 'highestSeverity' | 'totalFindings' | 'epssScore'>) => {
      const normalizedKey = key.toLowerCase();
      if (!rows.has(normalizedKey)) {
        rows.set(normalizedKey, {
          ...base,
          highestSeverity: 'info',
          totalFindings: 0,
          epssScore: 0,
          vulnerabilities: [],
        });
      }
      return rows.get(normalizedKey)!;
    };

    const pushVulnerability = (row: SecurityFinding, vulnerability: Vulnerability) => {
      row.vulnerabilities.push(vulnerability);
      row.totalFindings = row.vulnerabilities.length;
      row.highestSeverity = pickHighestSeverity(row.vulnerabilities);
      const epssValues = row.vulnerabilities
        .map((v) => v.epssScore)
        .filter((v): v is number => v != null && !Number.isNaN(v));
      row.epssScore = epssValues.length ? Math.max(...epssValues) : 0;
    };

    for (const finding of surfaceFindings) {
      const target = finding.affected_url || finding.affected_asset || finding.ip || 'Target SurfaceScan';
      const source = 'OSINT Intel';
      const row = ensureRow(`surface-${target}`, {
        id: `surface-${target}`,
        ip: finding.ip || '—',
        source,
        hostname: target,
        assetType: finding.module || finding.finding_type,
        operatingSystem: finding.protocol || (finding.port ? `Porta ${finding.port}` : 'OSINT'),
        lastUpdated: finding.created_at,
      });
      const cveList = Array.isArray(finding.cve) ? finding.cve.filter(Boolean) : [];
      const tax = getFindingTaxonomy(finding.finding_type);
      pushVulnerability(row, {
        id: finding.id,
        cveId: cveList.length ? cveList.join(', ') : finding.finding_type,
        cveList,
        cvssScore: finding.cvss ?? tax?.baseScore ?? null,
        cvssVector: getCvssVector(finding.evidence),
        epssScore: epssToDisplay(finding.epss),
        epssPercentile: null,
        description: finding.description || finding.title,
        severity: normalizeSeverity(finding.severity ?? tax?.severity),
        category: finding.module || finding.finding_type,
        cwe: tax?.cwe ?? null,
        owasp: tax?.owasp ?? null,
        discoveredDate: finding.created_at,
        lastModified: finding.created_at,
        remediationStatus: normalizeStatus(finding.status),
        patchAvailable: Boolean(finding.remediation),
        remediationText: finding.remediation ?? null,
        exploitAvailable: Boolean(finding.cisa_kev),
        affectedService: finding.port ? `${finding.protocol || 'tcp'}:${finding.port}` : source,
        source,
      });
    }

    for (const finding of externalFindings as ExternalCveFinding[]) {
      const target = finding.affected_url || finding.ip || finding.target;
      const row = ensureRow(`external-${target}`, {
        id: `external-${target}`,
        ip: finding.ip || '—',
        source: 'Validazione CVE',
        hostname: target,
        assetType: finding.service || finding.scan_job_id,
        operatingSystem: finding.port ? `Porta ${finding.port}` : 'Validazione CVE attiva',
        lastUpdated: finding.created_at,
      });
      const cveList = Array.isArray(finding.cve) ? finding.cve.filter(Boolean) : [];
      pushVulnerability(row, {
        id: finding.id,
        cveId: cveList.length ? cveList.join(', ') : finding.name,
        cveList,
        cvssScore: finding.cvssv3 ?? finding.cvss,
        cvssVector: finding.raw_finding?.cvss_vector || '—',
        epssScore: epssToDisplay(finding.epss_score),
        epssPercentile: null,
        description: finding.recommendation || finding.name,
        severity: normalizeSeverity(finding.severity),
        category: finding.confidence,
        cwe: null,
        owasp: null,
        discoveredDate: finding.created_at,
        lastModified: finding.created_at,
        remediationStatus: normalizeStatus(finding.status),
        patchAvailable: Boolean(finding.recommendation),
        remediationText: finding.recommendation ?? null,
        exploitAvailable: Boolean(finding.in_cisa_catalog),
        affectedService: finding.service || (finding.port ? `Porta ${finding.port}` : 'Validazione CVE'),
        source: 'Validazione CVE',
      });
    }

    for (const asset of shodanAssets) {
      for (const cve of asset.cves || []) {
        const row = ensureRow(`shodan-${asset.ip}`, {
          id: `shodan-${asset.ip}`,
          ip: asset.ip,
          source: 'Attack Surface',
          hostname: asset.hostname || asset.ip,
          assetType: asset.services?.[0] || 'Asset esposto',
          operatingSystem: asset.os || asset.org || 'Fingerprint asset',
          lastUpdated: asset.last_update || new Date().toISOString(),
        });
        pushVulnerability(row, {
          id: `${asset.ip}-${cve.id}`,
          cveId: cve.id,
          cveList: [cve.id],
          cvssScore: null,
          cvssVector: '—',
          epssScore: null,
          epssPercentile: null,
          description: cve.description,
          severity: normalizeSeverity(cve.severity),
          category: 'CVE Esposta',
          cwe: null,
          owasp: null,
          discoveredDate: asset.last_update || new Date().toISOString(),
          lastModified: asset.last_update || new Date().toISOString(),
          remediationStatus: 'open',
          patchAvailable: false,
          remediationText: null,
          exploitAvailable: false,
          affectedService: asset.services?.join(', ') || 'Servizio esposto',
          source: 'Attack Surface',
        });
      }
    }

    return Array.from(rows.values()).sort((a, b) => {
      const severityDiff = severityRank[b.highestSeverity] - severityRank[a.highestSeverity];
      if (severityDiff !== 0) return severityDiff;
      return new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime();
    });
  }, [externalFindings, shodanAssets, surfaceFindings]);

  // Collect all CVE IDs and enrich with NVD/EPSS/KEV cache
  const allCveIds = useMemo(() => {
    const set = new Set<string>();
    for (const f of realFindings) {
      for (const v of f.vulnerabilities) {
        for (const c of v.cveList || []) {
          const matches = String(c).match(CVE_REGEX);
          if (matches) matches.forEach((m) => set.add(m.toUpperCase()));
        }
      }
    }
    return Array.from(set);
  }, [realFindings]);

  const { data: intelMap = {} } = useCveIntelBatch(allCveIds);

  // Re-enrich findings with real intel data (EPSS, CWE, KEV)
  const enrichedFindings = useMemo(() => {
    return realFindings.map((f) => {
      let maxEpss = f.epssScore;
      let anyKev = false;
      const vulns = f.vulnerabilities.map((v) => {
        const cves = (v.cveList || []).map((c) => c.toUpperCase());
        let epss = v.epssScore;
        let cwe = v.cwe;
        let kev = false;
        for (const c of cves) {
          const intel = intelMap[c];
          if (intel) {
            if (intel.epss_score != null) {
              const score = intel.epss_score * 10;
              if (epss == null || score > epss) epss = score;
            }
            if (!cwe && intel.cwe_ids?.length) cwe = intel.cwe_ids[0];
            if (intel.cisa_kev) kev = true;
          }
        }
        if (epss != null && (maxEpss == null || epss > maxEpss)) maxEpss = epss;
        if (kev) anyKev = true;
        return { ...v, epssScore: epss, cwe, exploitAvailable: v.exploitAvailable || kev };
      });
      return { ...f, vulnerabilities: vulns, epssScore: maxEpss ?? 0, kev: anyKev };
    });
  }, [realFindings, intelMap]);

  const filteredFindings = useMemo(() => {
    return enrichedFindings.filter(finding => {
      const term = searchTerm.toLowerCase();
      const matchesSearch = searchTerm === '' ||
        finding.ip.toLowerCase().includes(term) ||
        finding.source.toLowerCase().includes(term) ||
        finding.hostname.toLowerCase().includes(term) ||
        finding.vulnerabilities.some(vuln =>
          vuln.cveId.toLowerCase().includes(term) ||
          vuln.description.toLowerCase().includes(term) ||
          vuln.source.toLowerCase().includes(term) ||
          (vuln.cwe || '').toLowerCase().includes(term) ||
          (vuln.owasp || '').toLowerCase().includes(term)
        );

      const matchesSeverity = severityFilter === 'all' || finding.highestSeverity === severityFilter;
      const matchesEpss = epssRangeFilter === 'all' ||
        (epssRangeFilter === 'high' && finding.epssScore >= 7) ||
        (epssRangeFilter === 'medium' && finding.epssScore >= 4 && finding.epssScore < 7) ||
        (epssRangeFilter === 'low' && finding.epssScore < 4);
      const matchesStatus = statusFilter === 'all' ||
        finding.vulnerabilities.some(vuln => vuln.remediationStatus === statusFilter);
      const matchesOwasp = owaspFilter === 'all' ||
        finding.vulnerabilities.some(v => v.owasp === owaspFilter);
      const matchesKev = !kevOnly || (finding as any).kev;
      const matchesOnlyCve = !onlyCve || finding.vulnerabilities.some(v => (v.cveList || []).length > 0);

      return matchesSearch && matchesSeverity && matchesEpss && matchesStatus && matchesOwasp && matchesKev && matchesOnlyCve;
    });
  }, [enrichedFindings, searchTerm, severityFilter, epssRangeFilter, statusFilter, owaspFilter, kevOnly, onlyCve]);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, severityFilter, epssRangeFilter, statusFilter, owaspFilter, kevOnly, onlyCve, enrichedFindings.length]);

  const totalPages = Math.ceil(filteredFindings.length / itemsPerPage);
  const paginatedFindings = filteredFindings.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-200';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'resolved': return 'bg-green-100 text-green-800 border-green-200';
      case 'in_progress': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'open': return 'bg-red-100 text-red-800 border-red-200';
      case 'false_positive': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'resolved': return <CheckCircle className="w-4 h-4" />;
      case 'in_progress': return <Clock className="w-4 h-4" />;
      case 'open': return <XCircle className="w-4 h-4" />;
      case 'false_positive': return <Eye className="w-4 h-4" />;
      default: return <AlertTriangle className="w-4 h-4" />;
    }
  };

  const toggleRowExpansion = (findingId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(findingId)) {
      newExpanded.delete(findingId);
    } else {
      newExpanded.add(findingId);
    }
    setExpandedRows(newExpanded);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('it-IT', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const loading = surfaceFindingsLoading || externalFindingsLoading;
  const summary = {
    critical: enrichedFindings.filter(f => f.highestSeverity === 'critical').length,
    high: enrichedFindings.filter(f => f.highestSeverity === 'high').length,
    medium: enrichedFindings.filter(f => f.highestSeverity === 'medium').length,
    low: enrichedFindings.filter(f => f.highestSeverity === 'low' || f.highestSeverity === 'info').length,
    kev: enrichedFindings.filter(f => (f as any).kev).length,
  };

  return (
    <Card className="border-border">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-red-500" />
              Security Findings & Vulnerabilità
              {scanRunning && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Findings reali rilevati dai nostri motori di Attack Surface Intelligence, OSINT e validazione attiva delle vulnerabilità sugli asset monitorati
            </p>
          </div>
          <Button variant="outline" className="flex items-center gap-2" disabled={enrichedFindings.length === 0}>
            <Download className="w-4 h-4" />
            Esporta Report
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 p-4 bg-muted/20 rounded-lg">
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{summary.critical}</div>
            <div className="text-sm text-muted-foreground">Critiche</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">{summary.high}</div>
            <div className="text-sm text-muted-foreground">Alta</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-600">{summary.medium}</div>
            <div className="text-sm text-muted-foreground">Media</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{summary.low}</div>
            <div className="text-sm text-muted-foreground">Bassa/Info</div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4 mb-6 p-4 bg-muted/10 rounded-lg">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Cerca per target, IP, CVE, CWE, OWASP, fonte o descrizione..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Severità" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte le severità</SelectItem>
              <SelectItem value="critical">Critica</SelectItem>
              <SelectItem value="high">Alta</SelectItem>
              <SelectItem value="medium">Media</SelectItem>
              <SelectItem value="low">Bassa</SelectItem>
              <SelectItem value="info">Info</SelectItem>
            </SelectContent>
          </Select>
          <Select value={epssRangeFilter} onValueChange={setEpssRangeFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="EPSS Score" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli EPSS</SelectItem>
              <SelectItem value="high">Alto ≥ 7.0</SelectItem>
              <SelectItem value="medium">Medio 4.0-6.9</SelectItem>
              <SelectItem value="low">Basso &lt; 4.0</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Stato" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli stati</SelectItem>
              <SelectItem value="open">Aperte</SelectItem>
              <SelectItem value="in_progress">In Corso</SelectItem>
              <SelectItem value="resolved">Risolte</SelectItem>
              <SelectItem value="false_positive">Falsi Positivi</SelectItem>
            </SelectContent>
          </Select>
          <Select value={owaspFilter} onValueChange={setOwaspFilter}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="OWASP Top 10" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli OWASP</SelectItem>
              {Object.entries(OWASP_TOP_10).map(([code, label]) => (
                <SelectItem key={code} value={code}>{code} — {label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 px-2">
            <Switch id="kev-only" checked={kevOnly} onCheckedChange={setKevOnly} />
            <Label htmlFor="kev-only" className="text-xs">Solo CISA KEV</Label>
          </div>
          <div className="flex items-center gap-2 px-2">
            <Switch id="cve-only" checked={onlyCve} onCheckedChange={setOnlyCve} />
            <Label htmlFor="cve-only" className="text-xs">Solo con CVE</Label>
          </div>
        </div>

        {kevOnly === false && summary.kev > 0 && (
          <div className="mb-4 p-3 rounded-lg border border-red-300/40 bg-red-50/30 text-sm text-red-700 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            <strong>{summary.kev}</strong> asset hanno CVE nel catalogo CISA KEV (sfruttate attivamente)
          </div>
        )}

        {loading && enrichedFindings.length === 0 ? (
          <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border p-8 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Caricamento findings reali...
          </div>
        ) : filteredFindings.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {scanRunning
              ? 'Scansione in corso: i findings reali compariranno appena i motori di intelligence restituiscono risultati.'
              : 'Nessun finding reale disponibile per gli asset monitorati.'}
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Asset</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead>Fonte</TableHead>
                  <TableHead>Severità Max</TableHead>
                  <TableHead className="text-center">Findings</TableHead>
                  <TableHead className="text-center">EPSS Score</TableHead>
                  <TableHead>Ultimo Aggiornamento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedFindings.map((finding) => (
                  <React.Fragment key={finding.id}>
                    <TableRow className="hover:bg-muted/20">
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleRowExpansion(finding.id)}
                          className="p-1"
                        >
                          {expandedRows.has(finding.id) ?
                            <ChevronDown className="w-4 h-4" /> :
                            <ChevronRight className="w-4 h-4" />
                          }
                        </Button>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium break-all">{finding.hostname}</div>
                          <div className="text-sm text-muted-foreground">{finding.assetType}</div>
                          <div className="text-xs text-muted-foreground">{finding.operatingSystem}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <code className="px-2 py-1 bg-muted rounded text-sm">{finding.ip}</code>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{finding.source}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={getSeverityColor(finding.highestSeverity)}>
                          {finding.highestSeverity.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="font-mono">
                          {finding.totalFindings}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant="outline"
                          className={`font-mono ${
                            finding.epssScore >= 7 ? 'border-red-300 text-red-700' :
                            finding.epssScore >= 4 ? 'border-orange-300 text-orange-700' :
                            'border-green-300 text-green-700'
                          }`}
                        >
                          {finding.epssScore ? finding.epssScore.toFixed(1) : '—'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Calendar className="w-4 h-4" />
                          {formatDate(finding.lastUpdated)}
                        </div>
                      </TableCell>
                    </TableRow>

                    {expandedRows.has(finding.id) && (
                      <TableRow>
                        <TableCell colSpan={8}>
                          <div className="p-4 bg-muted/10 rounded-lg">
                            <h4 className="font-semibold mb-3">Dettagli Findings</h4>
                            <div className="space-y-4">
                              {[...finding.vulnerabilities]
                                 .sort((a, b) => {
                                   const aHas = typeof a.cvssScore === 'number' && !isNaN(a.cvssScore as number);
                                   const bHas = typeof b.cvssScore === 'number' && !isNaN(b.cvssScore as number);
                                   if (aHas && bHas) return (b.cvssScore as number) - (a.cvssScore as number);
                                   if (aHas) return -1;
                                   if (bHas) return 1;
                                   return (severityRank[normalizeSeverity(b.severity)] ?? 0) - (severityRank[normalizeSeverity(a.severity)] ?? 0);
                                 })
                                .map((vuln) => (
                                <div key={vuln.id} className="border border-border rounded-lg p-4 bg-background">
                                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                    <div>
                                      <div className="flex flex-wrap items-center gap-2 mb-2">
                                        {(vuln.cveList && vuln.cveList.length > 0) ? (
                                          vuln.cveList.map((c) => (
                                            <button
                                              key={c}
                                              type="button"
                                              onClick={() => setModalCve(c.toUpperCase())}
                                              className="inline-flex"
                                            >
                                              <Badge className={`${getSeverityColor(vuln.severity)} cursor-pointer hover:opacity-80`}>
                                                {c}
                                              </Badge>
                                            </button>
                                          ))
                                        ) : (
                                          <Badge className={getSeverityColor(vuln.severity)}>{vuln.cveId}</Badge>
                                        )}
                                        {vuln.cwe && (
                                          <a href={cweLink(vuln.cwe)} target="_blank" rel="noopener noreferrer">
                                            <Badge variant="secondary" className="cursor-pointer hover:opacity-80">{vuln.cwe}</Badge>
                                          </a>
                                        )}
                                        {vuln.owasp && (
                                          <Badge variant="outline" className="border-primary/30 text-primary">
                                            {vuln.owasp}
                                          </Badge>
                                        )}
                                        <Badge className={getStatusColor(vuln.remediationStatus)} variant="outline">
                                          <div className="flex items-center gap-1">
                                            {getStatusIcon(vuln.remediationStatus)}
                                            {vuln.remediationStatus.replace('_', ' ').toUpperCase()}
                                          </div>
                                        </Badge>
                                        <Badge variant="secondary">{vuln.source}</Badge>
                                      </div>
                                      <p className="text-sm mb-3">{vuln.description}</p>
                                      <div className="space-y-1 text-xs text-muted-foreground">
                                        <div><strong>Servizio:</strong> {vuln.affectedService}</div>
                                        <div><strong>Categoria:</strong> {vuln.category}</div>
                                        <div><strong>Rilevato:</strong> {formatDate(vuln.discoveredDate)}</div>
                                      </div>
                                    </div>


                                    <div className="space-y-3">
                                      <div className="flex items-center justify-between p-3 bg-muted/20 rounded-lg">
                                        <div>
                                          <div className="text-sm font-medium">CVSS Score</div>
                                          <div className="text-2xl font-bold text-red-600">{vuln.cvssScore ?? '—'}</div>
                                        </div>
                                        <div>
                                          <div className="text-sm font-medium">EPSS Score</div>
                                          <div className="text-2xl font-bold text-orange-600">{vuln.epssScore != null ? vuln.epssScore.toFixed(1) : '—'}</div>
                                          <div className="text-xs text-muted-foreground">
                                            {vuln.epssPercentile != null ? `${vuln.epssPercentile}° percentile` : 'Dato non disponibile'}
                                          </div>
                                        </div>
                                      </div>

                                      <div className="flex flex-wrap gap-2">
                                        {vuln.patchAvailable && (() => {
                                          const isPatch = vuln.cveList && vuln.cveList.length > 0;
                                          const label = isPatch ? 'Patch CVE Disponibile' : 'Mitigazione Suggerita';
                                          const Icon = isPatch ? CheckCircle : Lightbulb;
                                          const cls = isPatch
                                            ? 'text-green-700 border-green-400 bg-green-50/40'
                                            : 'text-green-700/80 border-green-300/60';
                                          const badge = (
                                            <Badge variant="outline" className={`${cls} cursor-help`}>
                                              <Icon className="w-3 h-3 mr-1" />
                                              {label}
                                            </Badge>
                                          );
                                          return vuln.remediationText ? (
                                            <TooltipProvider delayDuration={150}>
                                              <Tooltip>
                                                <TooltipTrigger asChild>{badge}</TooltipTrigger>
                                                <TooltipContent className="max-w-sm text-xs leading-relaxed">
                                                  {vuln.remediationText}
                                                </TooltipContent>
                                              </Tooltip>
                                            </TooltipProvider>
                                          ) : badge;
                                        })()}
                                        {vuln.exploitAvailable && (
                                          <Badge variant="outline" className="text-red-700 border-red-300">
                                            <AlertTriangle className="w-3 h-3 mr-1" />
                                            KEV/Exploit Signal
                                          </Badge>
                                        )}
                                      </div>

                                      {vuln.remediationText && (
                                        <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3">
                                          <div className="flex items-center gap-2 mb-1 text-xs font-semibold text-green-700">
                                            <Lightbulb className="w-3.5 h-3.5" />
                                            Remediation consigliata
                                          </div>
                                          <div className="text-xs leading-relaxed whitespace-pre-wrap text-foreground/90">
                                            {vuln.remediationText}
                                          </div>
                                        </div>
                                      )}

                                      <div className="text-xs text-muted-foreground">
                                        <strong>CVSS Vector:</strong>
                                        <code className="block mt-1 p-1 bg-muted rounded text-xs break-all">{vuln.cvssVector}</code>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-6 flex justify-center">
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                  />
                </PaginationItem>

                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
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
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        )}

        <div className="mt-4 text-sm text-muted-foreground text-center">
          Visualizzati {paginatedFindings.length} di {filteredFindings.length} findings reali
          {filteredFindings.length !== enrichedFindings.length && ` (${enrichedFindings.length} totali)`}
        </div>
      </CardContent>

      <CveDetailDialog
        cveId={modalCve}
        open={!!modalCve}
        onOpenChange={(o) => !o && setModalCve(null)}
      />
    </Card>
  );
};

export default SecurityFindings;
