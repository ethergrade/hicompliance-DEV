import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertTriangle,
  Cable,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Globe2,
  Loader2,
  Lock,
  MailCheck,
  MapPin,
  Network,
  Radar,
  Search,
  Server,
  Shield,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import { useSurfaceScanDiscoveredAssets } from '@/hooks/useSurfaceScanDiscoveredAssets';

interface SurfaceScanModuleCardsProps {
  isAdminView?: boolean;
  subdomains?: string[];
  onAddSubdomainToScope?: (subdomain: string) => Promise<void> | void;
  onScanSubdomain?: (subdomain: string) => Promise<void> | void;
}

interface LatestScanRow {
  id: string;
  raw_target: string;
  normalized_target: string;
  scan_profile: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  summary: Record<string, any> | null;
}

interface ModuleResultRow {
  module_key: string;
  module_label: string;
  status: 'queued' | 'running' | 'success' | 'skipped' | 'error' | 'timeout';
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  duration_ms: number | null;
  completed_at: string | null;
}

interface ObservationRow {
  module: string;
  observation_type: string;
  value: Record<string, any>;
  created_at: string;
}

interface FindingRow {
  module: string | null;
  finding_type: string | null;
  title: string | null;
  remediation: string | null;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  created_at: string;
}

const statusBadgeClass: Record<string, string> = {
  success: 'bg-green-500/15 text-green-300 border-green-500/30',
  running: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  queued: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  skipped: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  timeout: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  error: 'bg-red-500/20 text-red-300 border-red-500/30',
};

const severityBadgeClass: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-300 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  medium: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  low: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  info: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
};

const moduleOrder = [
  'passes',
  'http_security',
  'headers',
  'redirects',
  'redirect_chain',
  'open_ports',
  'ssl_certificate',
  'tls_summary',
  'server_info',
  'server_location',
  'tech_stack',
  'dnssec',
  'whois',
  'mail_config',
  'quality',
  'threats',
  'dns_blocklists',
];

const headerRules: Array<{ key: string; label: string; remediation: string }> = [
  {
    key: 'contentSecurityPolicy',
    label: 'Content-Security-Policy',
    remediation:
      'Definire una Content-Security-Policy per ridurre rischio XSS e data injection (partire da Report-Only).',
  },
  {
    key: 'strictTransportSecurity',
    label: 'Strict-Transport-Security',
    remediation:
      'Abilitare HSTS con max-age adeguato e includeSubDomains dopo validazione HTTPS su tutti i sottodomini.',
  },
  {
    key: 'xContentTypeOptions',
    label: 'X-Content-Type-Options',
    remediation: 'Impostare X-Content-Type-Options: nosniff per limitare MIME sniffing.',
  },
  {
    key: 'xFrameOptions',
    label: 'X-Frame-Options / frame-ancestors',
    remediation: 'Impostare X-Frame-Options o CSP frame-ancestors per prevenire clickjacking.',
  },
  {
    key: 'referrerPolicy',
    label: 'Referrer-Policy',
    remediation: 'Impostare una Referrer-Policy restrittiva (es. strict-origin-when-cross-origin).',
  },
  {
    key: 'permissionsPolicy',
    label: 'Permissions-Policy',
    remediation: 'Definire una Permissions-Policy minima per ridurre superfici browser inutili.',
  },
  {
    key: 'crossOriginOpenerPolicy',
    label: 'COOP',
    remediation: 'Valutare COOP per isolamento contesto finestra.',
  },
  {
    key: 'crossOriginResourcePolicy',
    label: 'CORP',
    remediation: 'Valutare CORP per controllare uso cross-origin delle risorse.',
  },
  {
    key: 'crossOriginEmbedderPolicy',
    label: 'COEP',
    remediation: 'Valutare COEP in combinazione con COOP/CORP dove applicabile.',
  },
];

const SENSITIVE_SUBDOMAIN_REGEX = /(staging|dev|test|backup|vpn|cpanel|webmail|autodiscover|mail)/i;

const toPercent = (value: unknown): number => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
};

const scoreTone = (score: number): string => {
  if (score >= 85) return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
  if (score >= 70) return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
  if (score >= 50) return 'bg-orange-500/20 text-orange-300 border-orange-500/30';
  return 'bg-red-500/20 text-red-300 border-red-500/30';
};

const formatRiskLevel = (risk: string | null | undefined): string => {
  const key = String(risk || '').toLowerCase();
  if (key === 'low') return 'Basso';
  if (key === 'medium') return 'Medio';
  if (key === 'high') return 'Alto';
  if (key === 'critical') return 'Critico';
  return 'N/D';
};

const statusLabel = (status: string): string => {
  const key = String(status || '').toLowerCase();
  if (key === 'success' || key === 'completed') return 'Completato';
  if (key === 'running') return 'In esecuzione';
  if (key === 'queued') return 'In coda';
  if (key === 'timeout') return 'Timeout';
  if (key === 'error' || key === 'failed') return 'Errore';
  if (key === 'skipped') return 'Skipped';
  return 'N/D';
};

const severityRank: Record<string, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

const severityForPort = (port: number): 'critical' | 'high' | 'medium' | 'low' | 'info' => {
  if ([3389, 5900, 6379, 9200, 9300, 27017, 11211].includes(port)) return 'critical';
  if ([21, 23, 445, 3306, 5432, 1521, 5060].includes(port)) return 'high';
  if ([22, 25, 8080, 8443, 9443, 8000, 9000, 9090, 8081].includes(port)) return 'medium';
  if ([80, 443, 587, 993, 995, 53, 110, 143, 465].includes(port)) return 'info';
  return 'low';
};

export const SurfaceScanModuleCards: React.FC<SurfaceScanModuleCardsProps> = ({
  isAdminView = false,
  subdomains,
  onAddSubdomainToScope,
  onScanSubdomain,
}) => {
  const { organizationId } = useClientOrganization();
  const { subdomains: discoveredSubdomains } = useSurfaceScanDiscoveredAssets();
  const [loading, setLoading] = useState(false);
  const [latestScan, setLatestScan] = useState<LatestScanRow | null>(null);
  const [moduleResults, setModuleResults] = useState<ModuleResultRow[]>([]);
  const [observations, setObservations] = useState<ObservationRow[]>([]);
  const [riskFindings, setRiskFindings] = useState<FindingRow[]>([]);
  const [subdomainSearch, setSubdomainSearch] = useState('');
  const [subdomainPage, setSubdomainPage] = useState(1);
  const [rawExpanded, setRawExpanded] = useState(false);

  useEffect(() => {
    if (!organizationId) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const latestJobRes = await supabase
          .from('surface_scan_jobs' as any)
          .select('id, raw_target, normalized_target, scan_profile, status, created_at, completed_at, summary')
          .eq('customer_id', organizationId)
          .eq('status', 'completed')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestJobRes.error) throw latestJobRes.error;
        const job = (latestJobRes.data || null) as LatestScanRow | null;
        setLatestScan(job);

        if (!job?.id) {
          setModuleResults([]);
          setObservations([]);
          setRiskFindings([]);
          return;
        }

        const [moduleRes, obsRes, findingsRes] = await Promise.all([
          supabase
            .from('surface_scan_module_results' as any)
            .select('module_key, module_label, status, severity, duration_ms, completed_at')
            .eq('scan_job_id', job.id)
            .in('module_key', moduleOrder),
          supabase
            .from('surface_observations' as any)
            .select('module, observation_type, value, created_at')
            .eq('scan_job_id', job.id)
            .in('module', moduleOrder)
            .order('created_at', { ascending: false })
            .limit(200),
          supabase
            .from('surface_findings' as any)
            .select('module, finding_type, title, remediation, severity, created_at')
            .eq('scan_job_id', job.id)
            .in('severity', ['critical', 'high'])
            .order('created_at', { ascending: false })
            .limit(40),
        ]);

        if (moduleRes.error) throw moduleRes.error;
        if (obsRes.error) throw obsRes.error;
        if (findingsRes.error) throw findingsRes.error;

        setModuleResults((moduleRes.data || []) as ModuleResultRow[]);
        setObservations((obsRes.data || []) as ObservationRow[]);
        setRiskFindings(((findingsRes.data || []) as FindingRow[]).sort(
          (a, b) => (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0),
        ));
      } catch (error) {
        console.error('Error loading SurfaceScan module cards:', error);
        setLatestScan(null);
        setModuleResults([]);
        setObservations([]);
        setRiskFindings([]);
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, [organizationId]);

  const observationByModule = useMemo(() => {
    const map: Record<string, ObservationRow | undefined> = {};
    for (const row of observations) {
      if (!map[row.module]) map[row.module] = row;
    }
    return map;
  }, [observations]);

  const moduleByKey = useMemo(() => {
    const map: Record<string, ModuleResultRow | undefined> = {};
    for (const row of moduleResults) map[row.module_key] = row;
    return map;
  }, [moduleResults]);

  const scoreBreakdown = useMemo(() => {
    return (latestScan?.summary?.score_breakdown || null) as Record<string, any> | null;
  }, [latestScan?.summary]);

  const overallScore = toPercent(scoreBreakdown?.overallScore ?? latestScan?.summary?.overall_score ?? 0);
  const riskLevel = String(scoreBreakdown?.riskLevel || latestScan?.summary?.risk_level || '').toLowerCase();

  const passesValue = (observationByModule.passes?.value || {}) as Record<string, any>;
  const passItems = Array.isArray(passesValue?.passes) ? passesValue.passes : [];

  const httpSecurity = (observationByModule.http_security?.value || {}) as Record<string, any>;
  const httpChecks = (httpSecurity.checks || {}) as Record<string, boolean>;
  const dnssec = (observationByModule.dnssec?.value || {}) as Record<string, any>;
  const quality = (observationByModule.quality?.value || {}) as Record<string, any>;
  const qualityCategories = (quality.categories || {}) as Record<string, number>;
  const qualityFailedAudits = Array.isArray(quality.failed_audits) ? quality.failed_audits : [];
  const openPorts = (observationByModule.open_ports?.value || {}) as Record<string, any>;
  const openPortRows = Array.isArray(openPorts.openPorts) ? openPorts.openPorts : [];
  const threats = (observationByModule.threats?.value || {}) as Record<string, any>;
  const iocFreshList = (threats?.ioc_fresh_list || threats?.intelguard || {}) as Record<string, any>;
  const iocLeaseMinutes = Number(iocFreshList?.lease_minutes || 0);
  const iocLastRefreshedAt = String(iocFreshList?.last_refreshed_at || '').trim();
  const iocFreshBadge = useMemo(() => {
    if (!iocLeaseMinutes || !iocLastRefreshedAt) {
      return {
        label: 'N/D',
        className: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
      };
    }
    const refreshedTs = Date.parse(iocLastRefreshedAt);
    if (!Number.isFinite(refreshedTs)) {
      return {
        label: 'N/D',
        className: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
      };
    }
    const leaseMs = iocLeaseMinutes * 60 * 1000;
    const stale = Date.now() - refreshedTs > leaseMs;
    return stale
      ? {
        label: 'Stale',
        className: 'bg-red-500/20 text-red-300 border-red-500/30',
      }
      : {
        label: 'Fresh',
        className: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      };
  }, [iocLeaseMinutes, iocLastRefreshedAt]);
  const iocLastRefreshedLabel = useMemo(() => {
    if (!iocLastRefreshedAt) return '-';
    const refreshedTs = Date.parse(iocLastRefreshedAt);
    if (!Number.isFinite(refreshedTs)) return '-';
    return new Date(refreshedTs).toLocaleString('it-IT');
  }, [iocLastRefreshedAt]);
  const blocklists = (observationByModule.dns_blocklists?.value || {}) as Record<string, any>;
  const whois = (observationByModule.whois?.value || {}) as Record<string, any>;
  const ssl = (observationByModule.ssl_certificate?.value || {}) as Record<string, any>;
  const tls = (observationByModule.tls_summary?.value || {}) as Record<string, any>;
  const serverInfo = (observationByModule.server_info?.value || {}) as Record<string, any>;
  const serverLocation = (observationByModule.server_location?.value || {}) as Record<string, any>;
  const redirects = ((observationByModule.redirects?.value || observationByModule.redirect_chain?.value) || {}) as Record<string, any>;
  const mailConfig = (observationByModule.mail_config?.value || {}) as Record<string, any>;

  const allSubdomains = useMemo(() => {
    const list = (subdomains && subdomains.length > 0 ? subdomains : discoveredSubdomains) || [];
    return [...new Set(list.map((entry) => String(entry || '').trim().toLowerCase()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }, [subdomains, discoveredSubdomains]);

  const filteredSubdomains = useMemo(() => {
    const term = subdomainSearch.trim().toLowerCase();
    if (!term) return allSubdomains;
    return allSubdomains.filter((entry) => entry.includes(term));
  }, [allSubdomains, subdomainSearch]);

  const subdomainsPerPage = 8;
  const subdomainTotalPages = Math.max(1, Math.ceil(filteredSubdomains.length / subdomainsPerPage));
  const pagedSubdomains = filteredSubdomains.slice(
    (subdomainPage - 1) * subdomainsPerPage,
    subdomainPage * subdomainsPerPage,
  );

  useEffect(() => {
    setSubdomainPage(1);
  }, [subdomainSearch, allSubdomains.length]);

  const exportSubdomainsCsv = () => {
    const header = 'subdomain,sensitive_keyword\n';
    const rows = filteredSubdomains.map((entry) => {
      const sensitive = SENSITIVE_SUBDOMAIN_REGEX.test(entry) ? 'yes' : 'no';
      return `${entry},${sensitive}`;
    });
    const blob = new Blob([header, ...rows].join('\n'), { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `surfacescan-subdomains-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const handleAddScope = async (subdomain: string) => {
    try {
      if (onAddSubdomainToScope) await onAddSubdomainToScope(subdomain);
    } catch (error) {
      console.error('Error adding subdomain to scope:', error);
    }
  };

  const handleScanSubdomain = async (subdomain: string) => {
    try {
      if (onScanSubdomain) await onScanSubdomain(subdomain);
    } catch (error) {
      console.error('Error queueing subdomain scan:', error);
    }
  };

  if (loading) {
    return (
      <Card className="border-border">
        <CardContent className="py-8">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Caricamento moduli SurfaceScan360...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!latestScan?.id) {
    return (
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radar className="w-5 h-5 text-primary" />
            SurfaceScan Modules
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Nessuna scansione completata disponibile.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider>
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Radar className="w-5 h-5 text-primary" />
            Dettaglio Ultima Scansione
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Target: <span className="font-medium text-foreground">{latestScan.raw_target || latestScan.normalized_target}</span>
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Stato</p>
              <Badge className={statusBadgeClass[moduleByKey.passes?.status || 'success']}>
                {statusLabel(latestScan.status)}
              </Badge>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Profilo</p>
              <p className="text-sm font-medium">{latestScan.scan_profile}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Overall score</p>
              <Badge className={scoreTone(overallScore)}>{overallScore}/100</Badge>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Livello rischio</p>
              <Badge className={scoreTone(overallScore)}>{formatRiskLevel(riskLevel)}</Badge>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Creata</p>
              <p className="text-xs text-foreground">{new Date(latestScan.created_at).toLocaleString('it-IT')}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Completata</p>
              <p className="text-xs text-foreground">
                {latestScan.completed_at ? new Date(latestScan.completed_at).toLocaleString('it-IT') : '-'}
              </p>
            </div>
          </div>

          {riskFindings.length > 0 && (
            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-400" />
                <p className="text-sm font-medium">Risk findings prioritari (critical/high)</p>
              </div>
              <div className="space-y-2">
                {riskFindings.slice(0, 6).map((finding, index) => (
                  <div key={`${finding.finding_type}-${index}`} className="rounded-md border border-border/70 p-2 text-sm">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={severityBadgeClass[finding.severity]}>{finding.severity}</Badge>
                      <span className="font-medium">{finding.title || finding.finding_type || 'Finding'}</span>
                      {finding.module ? <span className="text-xs text-muted-foreground">({finding.module})</span> : null}
                    </div>
                    {finding.remediation ? (
                      <p className="text-xs text-muted-foreground mt-1">Remediation: {finding.remediation}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            <div className="rounded-lg border border-border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-medium flex items-center gap-2"><ShieldCheck className="w-4 h-4" />Passes</div>
                <Badge className={statusBadgeClass[moduleByKey.passes?.status || 'skipped']}>
                  {statusLabel(moduleByKey.passes?.status || 'skipped')}
                </Badge>
              </div>
              <p className="text-sm">
                {passesValue.passedCount ?? 0}/{passesValue.totalCount ?? 0} controlli superati
              </p>
              <div className="space-y-1.5 max-h-40 overflow-auto pr-1">
                {passItems.map((item: any) => {
                  const passed = Boolean(item?.passed);
                  const label = String(item?.label || item?.key || 'check');
                  const source = String(item?.sourceModule || 'module');
                  return (
                    <div key={String(item?.key || label)} className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        {passed ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <XCircle className="w-3.5 h-3.5 text-amber-400" />}
                        <span className="truncate">{label}</span>
                      </div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="outline" className="text-[10px]">{source}</Badge>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs text-xs">Source module: {source}</TooltipContent>
                      </Tooltip>
                    </div>
                  );
                })}
                {passItems.length === 0 && <p className="text-xs text-muted-foreground">Nessun controllo disponibile.</p>}
              </div>
            </div>

            <div className="rounded-lg border border-border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-medium flex items-center gap-2"><Shield className="w-4 h-4" />HTTP Security</div>
                <Badge className={statusBadgeClass[moduleByKey.http_security?.status || 'skipped']}>
                  {statusLabel(moduleByKey.http_security?.status || 'skipped')}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground">Score: {toPercent(httpSecurity.score)} / 100 · HTTP {httpSecurity.statusCode ?? '-'}</div>
              <div className="space-y-1.5 max-h-44 overflow-auto pr-1">
                {headerRules.map((rule) => {
                  const ok = Boolean(httpChecks[rule.key]);
                  return (
                    <Tooltip key={rule.key}>
                      <TooltipTrigger asChild>
                        <div className="flex items-center justify-between gap-2 text-xs cursor-help">
                          <span className="truncate">{rule.label}</span>
                          {ok ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <XCircle className="w-3.5 h-3.5 text-red-400" />}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs text-xs">{rule.remediation}</TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>

            <div className="rounded-lg border border-border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-medium">DNSSEC</div>
                <Badge className={statusBadgeClass[moduleByKey.dnssec?.status || 'skipped']}>
                  {statusLabel(moduleByKey.dnssec?.status || 'skipped')}
                </Badge>
              </div>
              <div className="text-xs space-y-1">
                <div className="flex justify-between"><span>DNSKEY</span><span>{dnssec.dnskey_present ? 'Presente' : 'Assente'}</span></div>
                <div className="flex justify-between"><span>DS</span><span>{dnssec.ds_present ? 'Presente' : 'Assente'}</span></div>
                <div className="flex justify-between"><span>RRSIG</span><span>{dnssec.rrsig_present ? 'Presente' : 'Assente'}</span></div>
              </div>
              <p className="text-xs text-muted-foreground">Abilitare DNSSEC presso registrar/provider DNS e verificare DS in parent zone.</p>
            </div>

            <div className="rounded-lg border border-border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-medium">Quality Summary</div>
                <Badge className={statusBadgeClass[moduleByKey.quality?.status || 'skipped']}>
                  {statusLabel(moduleByKey.quality?.status || 'skipped')}
                </Badge>
              </div>
              <div className="space-y-2 text-xs">
                {[
                  ['Performance', toPercent(qualityCategories.performance)],
                  ['Accessibility', toPercent(qualityCategories.accessibility)],
                  ['Best Practices', toPercent(qualityCategories.best_practices)],
                  ['SEO', toPercent(qualityCategories.seo)],
                ].map(([label, value]) => (
                  <div key={String(label)} className="space-y-1">
                    <div className="flex items-center justify-between"><span>{label}</span><span>{value}%</span></div>
                    <Progress value={Number(value)} className="h-2" />
                  </div>
                ))}
              </div>
              {qualityFailedAudits.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium">Top audit falliti</p>
                  {qualityFailedAudits.slice(0, 3).map((audit: any, idx: number) => (
                    <p key={`${audit?.id || 'audit'}-${idx}`} className="text-xs text-muted-foreground truncate">• {audit?.title || audit?.id}</p>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-medium flex items-center gap-2"><Cable className="w-4 h-4" />Open Ports</div>
                <Badge className={statusBadgeClass[moduleByKey.open_ports?.status || 'skipped']}>
                  {statusLabel(moduleByKey.open_ports?.status || 'skipped')}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">Porte aperte: {openPortRows.length}</p>
              <div className="space-y-1.5 max-h-40 overflow-auto pr-1">
                {openPortRows.slice(0, 8).map((entry: any, idx: number) => (
                  <div key={`${entry?.ip || 'ip'}-${entry?.port || idx}`} className="rounded border border-border/70 p-2 text-xs space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{entry?.ip || entry?.target || '-'}:{entry?.port}</span>
                      <Badge className={severityBadgeClass[severityForPort(Number(entry?.port || 0))] || severityBadgeClass.low}>
                        {severityForPort(Number(entry?.port || 0)).toUpperCase()}
                      </Badge>
                    </div>
                    <div className="text-muted-foreground">{entry?.service || entry?.product || 'Servizio non classificato'}</div>
                    <div className="text-muted-foreground">Source: {entry?.source || '-'}</div>
                  </div>
                ))}
                {openPortRows.length === 0 && <p className="text-xs text-muted-foreground">Nessuna porta aperta disponibile.</p>}
              </div>
            </div>

            <div className="rounded-lg border border-border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-medium">Threats</div>
                <Badge className={statusBadgeClass[moduleByKey.threats?.status || 'skipped']}>
                  {statusLabel(moduleByKey.threats?.status || 'skipped')}
                </Badge>
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between"><span>Safe Browsing</span><Badge variant="outline">{threats?.safe_browsing?.unsafe ? 'Unsafe' : 'Safe'}</Badge></div>
                <div className="flex justify-between"><span>URLHaus</span><Badge variant="outline">{threats?.urlhaus?.listed ? 'Listed' : 'Not listed'}</Badge></div>
                <div className="flex justify-between"><span>PhishTank</span><Badge variant="outline">{threats?.phishtank?.verified ? 'Phishing found' : 'No phishing'}</Badge></div>
                <div className="flex justify-between"><span>IOC Fresh List</span><Badge variant="outline">{iocFreshList?.matched ? `Match (${Number(iocFreshList?.matched_count || 0)})` : 'No match'}</Badge></div>
                <div className="flex justify-between"><span>Stato feed</span><Badge className={iocFreshBadge.className}>{iocFreshBadge.label}</Badge></div>
                <div className="flex justify-between"><span>Lease</span><Badge variant="outline">{iocLeaseMinutes ? `${iocLeaseMinutes} min` : '-'}</Badge></div>
                <div className="flex justify-between"><span>Ultimo refresh</span><Badge variant="outline">{iocLastRefreshedLabel}</Badge></div>
                <div className="flex justify-between"><span>DNS Blocklist</span><Badge variant="outline">{Number(blocklists?.listed_count || 0) > 0 ? `Listed (${blocklists?.listed_count})` : 'Clean'}</Badge></div>
              </div>
            </div>

            <div className="rounded-lg border border-border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-medium flex items-center gap-2"><Globe2 className="w-4 h-4" />Domain WHOIS</div>
                <Badge className={statusBadgeClass[moduleByKey.whois?.status || 'skipped']}>
                  {statusLabel(moduleByKey.whois?.status || 'skipped')}
                </Badge>
              </div>
              <div className="text-xs space-y-1">
                <div className="flex justify-between"><span>Registrar</span><span>{whois.registrar || '-'}</span></div>
                <div className="flex justify-between"><span>Scadenza</span><span>{whois.days_to_expiry != null ? `${whois.days_to_expiry} giorni` : '-'}</span></div>
                <div className="flex justify-between"><span>DNSSEC (RDAP)</span><span>{whois.dnssec || '-'}</span></div>
              </div>
            </div>

            <div className="rounded-lg border border-border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-medium flex items-center gap-2"><Lock className="w-4 h-4" />SSL/TLS</div>
                <Badge className={statusBadgeClass[moduleByKey.ssl_certificate?.status || 'skipped']}>
                  {statusLabel(moduleByKey.ssl_certificate?.status || 'skipped')}
                </Badge>
              </div>
              <div className="text-xs space-y-1">
                <div className="flex justify-between"><span>Trusted</span><span>{ssl.trusted === true ? 'Sì' : ssl.trusted === false ? 'No' : '-'}</span></div>
                <div className="flex justify-between"><span>Scadenza cert</span><span>{ssl.expiresInDays != null ? `${ssl.expiresInDays} giorni` : '-'}</span></div>
                <div className="flex justify-between"><span>TLS 1.2+</span><span>{tls.tls12Supported || tls.tls13Supported ? 'Sì' : 'No'}</span></div>
              </div>
            </div>

            <div className="rounded-lg border border-border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-medium flex items-center gap-2"><Server className="w-4 h-4" />Server Info</div>
                <Badge className={statusBadgeClass[moduleByKey.server_info?.status || 'skipped']}>
                  {statusLabel(moduleByKey.server_info?.status || 'skipped')}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                ASN: {serverInfo.asn || '-'} · Org: {serverInfo.organization || '-'}
              </div>
              <div className="text-xs text-muted-foreground">
                Porte note: {Array.isArray(serverInfo.ports) ? serverInfo.ports.length : 0}
              </div>
            </div>

            <div className="rounded-lg border border-border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-medium flex items-center gap-2"><MapPin className="w-4 h-4" />Server Location</div>
                <Badge className={statusBadgeClass[moduleByKey.server_location?.status || 'skipped']}>
                  {statusLabel(moduleByKey.server_location?.status || 'skipped')}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                {serverLocation.city || '-'}, {serverLocation.countryCode || serverLocation.country || '-'}
              </div>
            </div>

            <div className="rounded-lg border border-border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-medium flex items-center gap-2"><MailCheck className="w-4 h-4" />Mail Config</div>
                <Badge className={statusBadgeClass[moduleByKey.mail_config?.status || 'skipped']}>
                  {statusLabel(moduleByKey.mail_config?.status || 'skipped')}
                </Badge>
              </div>
              <div className="text-xs space-y-1">
                <div className="flex justify-between"><span>SPF</span><span>{Array.isArray(mailConfig.spf_records) && mailConfig.spf_records.length > 0 ? 'Presente' : 'Assente'}</span></div>
                <div className="flex justify-between"><span>DMARC</span><span>{Array.isArray(mailConfig.dmarc_records) && mailConfig.dmarc_records.length > 0 ? 'Presente' : 'Assente'}</span></div>
                <div className="flex justify-between"><span>DKIM selectors</span><span>{Array.isArray(mailConfig.dkim_selectors_found) ? mailConfig.dkim_selectors_found.length : 0}</span></div>
              </div>
            </div>

            <div className="rounded-lg border border-border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-medium flex items-center gap-2"><Network className="w-4 h-4" />Redirect Chain</div>
                <Badge className={statusBadgeClass[moduleByKey.redirects?.status || moduleByKey.redirect_chain?.status || 'skipped']}>
                  {statusLabel(moduleByKey.redirects?.status || moduleByKey.redirect_chain?.status || 'skipped')}
                </Badge>
              </div>
              <div className="text-xs space-y-1">
                <div className="flex justify-between"><span>Hop count</span><span>{redirects.hopCount ?? '-'}</span></div>
                <div className="flex justify-between"><span>HTTP→HTTPS</span><span>{redirects.redirectsToHttps ? 'Sì' : 'No'}</span></div>
                <div className="flex justify-between"><span>External redirect</span><span>{redirects.externalRedirect ? 'Sì' : 'No'}</span></div>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Subdomains</p>
                <p className="text-xs text-muted-foreground">Base domain scope · paginazione · filtro rapido</p>
              </div>
              <Button size="sm" variant="outline" onClick={exportSubdomainsCsv} disabled={filteredSubdomains.length === 0}>
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
            </div>
            <div className="relative">
              <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={subdomainSearch}
                onChange={(event) => setSubdomainSearch(event.target.value)}
                placeholder="Cerca subdomain..."
                className="pl-10"
              />
            </div>
            <div className="space-y-2">
              {pagedSubdomains.map((entry) => (
                <div key={entry} className="rounded-md border border-border p-2 text-xs">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium truncate">{entry}</span>
                      {SENSITIVE_SUBDOMAIN_REGEX.test(entry) ? (
                        <Badge variant="destructive" className="text-[10px]">sensitive keyword</Badge>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => void handleAddScope(entry)}>
                        Add to scope
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => void handleScanSubdomain(entry)}>
                        Scan selected
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              {pagedSubdomains.length === 0 && (
                <p className="text-xs text-muted-foreground">Nessun subdomain disponibile.</p>
              )}
            </div>
            {subdomainTotalPages > 1 && (
              <div className="flex items-center justify-end gap-2">
                <Button
                  size="icon"
                  variant="outline"
                  className="h-7 w-7"
                  disabled={subdomainPage <= 1}
                  onClick={() => setSubdomainPage((prev) => Math.max(prev - 1, 1))}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-xs text-muted-foreground">{subdomainPage}/{subdomainTotalPages}</span>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-7 w-7"
                  disabled={subdomainPage >= subdomainTotalPages}
                  onClick={() => setSubdomainPage((prev) => Math.min(prev + 1, subdomainTotalPages))}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>

          {isAdminView && (
            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Raw Data (admin)</p>
                <Button size="sm" variant="outline" onClick={() => setRawExpanded((prev) => !prev)}>
                  {rawExpanded ? 'Nascondi' : 'Mostra'}
                </Button>
              </div>
              {rawExpanded && (
                <pre className="text-[11px] leading-5 rounded-md border border-border bg-muted/20 p-3 overflow-auto max-h-64">
                  {JSON.stringify(
                    {
                      latest_scan: latestScan,
                      score_breakdown: scoreBreakdown,
                      modules: moduleResults,
                      observations,
                    },
                    null,
                    2,
                  )}
                </pre>
              )}
            </div>
          )}

          {moduleResults.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {moduleResults.map((row) => (
                <Badge key={row.module_key} variant="outline" className={severityBadgeClass[row.severity || 'info']}>
                  {row.module_label}: {row.severity}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
};

export default SurfaceScanModuleCards;
