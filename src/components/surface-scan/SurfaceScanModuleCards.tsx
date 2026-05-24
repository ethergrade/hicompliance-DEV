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
import {
  classifySurfaceHostForScope,
  isIpWithinScopeRules,
  isIpv4,
  isIpv6,
  splitMonitoredScopeRules,
  type SurfaceMonitoredScopeRule,
} from '@/lib/surfaceScopeGuard';

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
  scan_job_id: string;
  module_key: string;
  module_label: string;
  status: 'queued' | 'running' | 'success' | 'skipped' | 'error' | 'timeout';
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  duration_ms: number | null;
  completed_at: string | null;
}

interface ObservationRow {
  scan_job_id: string;
  module: string;
  observation_type: string;
  value: Record<string, any>;
  created_at: string;
}

interface FindingRow {
  scan_job_id: string;
  module: string | null;
  finding_type: string | null;
  title: string | null;
  remediation: string | null;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  created_at: string;
}

interface ExposureOpenPortRow {
  scan_job_id: string;
  host: string;
  ip: string | null;
  port: number;
  protocol: string;
  service_name: string | null;
  service_product: string | null;
  service_version: string | null;
  exposure_level: string;
  is_web: boolean;
  is_tls: boolean;
}

type ModuleOutcomeStatus =
  | 'success_with_data'
  | 'success_no_data'
  | 'skipped_prerequisite'
  | 'error'
  | 'running'
  | 'queued';

const statusBadgeClass: Record<ModuleOutcomeStatus, string> = {
  success_with_data: 'bg-green-500/15 text-green-300 border-green-500/30',
  success_no_data: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  skipped_prerequisite: 'bg-slate-500/25 text-slate-300 border-slate-500/40',
  error: 'bg-red-500/20 text-red-300 border-red-500/30',
  running: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  queued: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
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

const riskLevelFromScore = (score: number): string => {
  if (score < 40) return 'critico';
  if (score < 60) return 'high';
  if (score < 80) return 'medium';
  return 'low';
};

const formatRiskLevel = (risk: string | null | undefined): string => {
  const key = String(risk || '').toLowerCase();
  if (key === 'low') return 'Basso';
  if (key === 'medium') return 'Medio';
  if (key === 'high') return 'Alto';
  if (key === 'critical' || key === 'critico') return 'Critico';
  return 'N/D';
};

const statusLabel = (status: ModuleOutcomeStatus): string => {
  if (status === 'success_with_data') return 'Completato';
  if (status === 'success_no_data') return 'Completato (nessun dato)';
  if (status === 'skipped_prerequisite') return 'Prerequisito mancante';
  if (status === 'error') return 'Errore';
  if (status === 'running') return 'In esecuzione';
  return 'In coda';
};

const outcomeFromJobStatus = (status: string): ModuleOutcomeStatus => {
  const key = String(status || '').trim().toLowerCase();
  if (key === 'running') return 'running';
  if (key === 'queued' || key === 'pending') return 'queued';
  if (key === 'failed' || key === 'error') return 'error';
  if (key === 'completed' || key === 'success' || key === 'partial') return 'success_with_data';
  return 'success_no_data';
};

const moduleReasonLabel = (reason: string): string => {
  const key = String(reason || '').toLowerCase();
  if (key.includes('missing_google_cloud_api_key')) return 'Prerequisito mancante: GOOGLE_API_KEY per Quality.';
  if (key.includes('feature_flag_disabled')) return 'Modulo disabilitato da feature flag.';
  if (key.includes('rdap')) return 'RDAP temporaneamente non disponibile per WHOIS.';
  if (key.includes('server_location_no_ip')) return 'Nessun IP in-scope geolocalizzabile disponibile.';
  if (key.includes('open_ports_no_data')) return 'Nessun dato porte disponibile da scan classica/exposure.';
  return 'Dato non disponibile per prerequisito o provider.';
};

const extractHostFromTarget = (rawTarget: string): string | null => {
  const raw = String(rawTarget || '').trim();
  if (!raw) return null;

  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    // continue
  }

  try {
    if (!raw.includes('://') && /[/:]/.test(raw)) {
      return new URL(`https://${raw}`).hostname.toLowerCase();
    }
  } catch {
    // continue
  }

  return raw.toLowerCase().replace(/\.$/, '');
};

const chunk = <T,>(items: T[], size = 50): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
};

const isNonEmptyObject = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') return false;
  return Object.keys(value as Record<string, unknown>).length > 0;
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
  const [latestScopeJobs, setLatestScopeJobs] = useState<LatestScanRow[]>([]);
  const [moduleResults, setModuleResults] = useState<ModuleResultRow[]>([]);
  const [observations, setObservations] = useState<ObservationRow[]>([]);
  const [riskFindings, setRiskFindings] = useState<FindingRow[]>([]);
  const [exposureOpenPorts, setExposureOpenPorts] = useState<ExposureOpenPortRow[]>([]);
  const [subdomainSearch, setSubdomainSearch] = useState('');
  const [subdomainPage, setSubdomainPage] = useState(1);
  const [rawExpanded, setRawExpanded] = useState(false);

  useEffect(() => {
    if (!organizationId) return;

    const fetchRowsByJobIds = async <T,>(
      table: string,
      select: string,
      jobIds: string[],
      opts?: { orderBy?: string; ascending?: boolean; limit?: number },
    ): Promise<T[]> => {
      const all: T[] = [];
      for (const group of chunk(jobIds, 40)) {
        let query: any = supabase.from(table as any).select(select).in('scan_job_id', group);
        if (opts?.orderBy) {
          query = query.order(opts.orderBy, { ascending: Boolean(opts.ascending) });
        }
        if (opts?.limit) {
          query = query.limit(opts.limit);
        }
        const { data, error } = await query;
        if (error) throw error;
        all.push(...((data || []) as T[]));
      }
      return all;
    };

    const fetchData = async () => {
      setLoading(true);
      try {
        const [scopeRes, jobsRes] = await Promise.all([
          supabase
            .from('surface_scan_monitored_ips' as any)
            .select('entry_type, input_value, ip_start, ip_end')
            .eq('organization_id', organizationId),
          supabase
            .from('surface_scan_jobs' as any)
            .select('id, raw_target, normalized_target, scan_profile, status, created_at, completed_at, summary')
            .eq('customer_id', organizationId)
            .in('status', ['completed', 'partial'])
            .order('created_at', { ascending: false })
            .limit(500),
        ]);

        if (scopeRes.error) throw scopeRes.error;
        if (jobsRes.error) throw jobsRes.error;

        const scopeRules = (scopeRes.data || []) as SurfaceMonitoredScopeRule[];
        const { scopeDomains, ipScopeRules } = splitMonitoredScopeRules(scopeRules);
        const jobs = (jobsRes.data || []) as LatestScanRow[];

        const latestByTarget = new Map<string, LatestScanRow>();
        for (const job of jobs) {
          const targetRaw = String(job.normalized_target || job.raw_target || '').trim();
          if (!targetRaw) continue;
          const host = extractHostFromTarget(targetRaw);
          if (host) {
            if (isIpv4(host) || isIpv6(host)) {
              if (!isIpWithinScopeRules(host, ipScopeRules)) continue;
            } else {
              const classification = classifySurfaceHostForScope(host, scopeDomains);
              if (classification.blocked) continue;
            }
          }

          const key = String(targetRaw).toLowerCase();
          const existing = latestByTarget.get(key);
          const currentTs = existing ? Date.parse(existing.created_at) : 0;
          const incomingTs = Date.parse(job.created_at);
          if (!existing || incomingTs >= currentTs) {
            latestByTarget.set(key, job);
          }
        }

        const scopeJobs = Array.from(latestByTarget.values()).sort(
          (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
        );

        setLatestScopeJobs(scopeJobs);
        setLatestScan(scopeJobs[0] || null);

        if (scopeJobs.length === 0) {
          setModuleResults([]);
          setObservations([]);
          setRiskFindings([]);
          setExposureOpenPorts([]);
          return;
        }

        const jobIds = scopeJobs.map((job) => String(job.id));

        const [moduleRows, observationRows, findingRows, exposureRows] = await Promise.all([
          fetchRowsByJobIds<ModuleResultRow>(
            'surface_scan_module_results',
            'scan_job_id, module_key, module_label, status, severity, duration_ms, completed_at',
            jobIds,
            { orderBy: 'completed_at', ascending: false },
          ),
          fetchRowsByJobIds<ObservationRow>(
            'surface_observations',
            'scan_job_id, module, observation_type, value, created_at',
            jobIds,
            { orderBy: 'created_at', ascending: false },
          ),
          fetchRowsByJobIds<FindingRow>(
            'surface_findings',
            'scan_job_id, module, finding_type, title, remediation, severity, created_at',
            jobIds,
            { orderBy: 'created_at', ascending: false },
          ),
          fetchRowsByJobIds<ExposureOpenPortRow>(
            'surface_open_ports',
            'scan_job_id, host, ip, port, protocol, service_name, service_product, service_version, exposure_level, is_web, is_tls',
            jobIds,
            { orderBy: 'last_seen_at', ascending: false },
          ),
        ]);

        const prioritizedFindings = findingRows
          .filter((entry) => ['critical', 'high'].includes(String(entry.severity || '').toLowerCase()))
          .sort((a, b) => (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0));

        setModuleResults(moduleRows);
        setObservations(observationRows);
        setRiskFindings(prioritizedFindings);
        setExposureOpenPorts(exposureRows);
      } catch (error) {
        console.error('Error loading SurfaceScan module cards:', error);
        setLatestScan(null);
        setLatestScopeJobs([]);
        setModuleResults([]);
        setObservations([]);
        setRiskFindings([]);
        setExposureOpenPorts([]);
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

  const qualityRows = useMemo(
    () => observations.filter((row) => row.module === 'quality' && row.observation_type.startsWith('quality_summary')),
    [observations],
  );

  const qualityCategories = useMemo(() => {
    const samples = qualityRows
      .map((row) => row.value?.categories || {})
      .filter((entry) => entry && typeof entry === 'object') as Array<Record<string, number>>;
    if (samples.length === 0) return {} as Record<string, number>;

    const avg = (key: string) => {
      const vals = samples
        .map((entry) => Number(entry[key]))
        .filter((entry) => Number.isFinite(entry));
      if (vals.length === 0) return 0;
      return Math.round(vals.reduce((acc, value) => acc + value, 0) / vals.length);
    };

    return {
      performance: avg('performance'),
      accessibility: avg('accessibility'),
      best_practices: avg('best_practices'),
      seo: avg('seo'),
    };
  }, [qualityRows]);

  const qualityFailedAudits = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ id: string; title: string }> = [];

    for (const row of qualityRows) {
      const failed = Array.isArray(row.value?.failed_audits) ? row.value.failed_audits : [];
      for (const audit of failed) {
        const id = String(audit?.id || audit?.title || '').trim();
        const title = String(audit?.title || audit?.id || '').trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push({ id, title: title || id });
      }
    }

    return out.slice(0, 6);
  }, [qualityRows]);

  const latestWhois = useMemo(() => {
    const whoisRows = observations
      .filter((row) => row.module === 'whois' && row.observation_type === 'whois_rdap')
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    return whoisRows[0]?.value || {};
  }, [observations]);

  const whoisCoverage = useMemo(
    () => observations.filter((row) => row.module === 'whois' && row.observation_type === 'whois_rdap').length,
    [observations],
  );

  const whoisUnavailableCount = useMemo(
    () => observations.filter((row) => row.module === 'whois' && row.observation_type === 'rdap_unavailable').length,
    [observations],
  );

  const latestServerLocation = useMemo(() => {
    const rows = observations
      .filter((row) => row.module === 'server_location' && row.observation_type === 'server_location')
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    return rows[0]?.value || {};
  }, [observations]);

  const serverLocationCoverage = useMemo(
    () => observations.filter((row) => row.module === 'server_location' && row.observation_type === 'server_location').length,
    [observations],
  );

  const openPortRows = useMemo(() => {
    const merged = new Map<string, any>();

    const observedRows = observations
      .filter((row) => row.module === 'open_ports' && row.observation_type === 'open_ports_summary')
      .flatMap((row) => (Array.isArray(row.value?.openPorts) ? row.value.openPorts : []));

    for (const entry of observedRows) {
      const ip = String(entry?.ip || entry?.target || '').trim();
      const port = Number(entry?.port || 0);
      const protocol = String(entry?.protocol || 'tcp').toLowerCase();
      if (!ip || !Number.isFinite(port) || port <= 0) continue;
      const key = `${ip}|${port}|${protocol}`;
      if (!merged.has(key)) {
        merged.set(key, {
          ip,
          port,
          protocol,
          service: entry?.service || null,
          product: entry?.product || null,
          source: entry?.source || 'scan_engine',
        });
      }
    }

    for (const row of exposureOpenPorts) {
      const ip = String(row.ip || row.host || '').trim();
      const port = Number(row.port || 0);
      const protocol = String(row.protocol || 'tcp').toLowerCase();
      if (!ip || !Number.isFinite(port) || port <= 0) continue;
      const key = `${ip}|${port}|${protocol}`;
      if (!merged.has(key)) {
        merged.set(key, {
          ip,
          port,
          protocol,
          service: row.service_name || null,
          product: row.service_product || row.service_version || null,
          source: 'exposure_pipeline',
        });
      }
    }

    return Array.from(merged.values()).sort((a, b) => {
      const sevDelta = severityRank[severityForPort(b.port)] - severityRank[severityForPort(a.port)];
      if (sevDelta !== 0) return sevDelta;
      return Number(a.port || 0) - Number(b.port || 0);
    });
  }, [observations, exposureOpenPorts]);

  const moduleOutcomes = useMemo(() => {
    const outcomes: Record<string, ModuleOutcomeStatus> = {};
    const moduleObs = new Map<string, ObservationRow[]>();
    const moduleRes = new Map<string, ModuleResultRow[]>();

    for (const row of observations) {
      if (!moduleObs.has(row.module)) moduleObs.set(row.module, []);
      moduleObs.get(row.module)!.push(row);
    }
    for (const row of moduleResults) {
      if (!moduleRes.has(row.module_key)) moduleRes.set(row.module_key, []);
      moduleRes.get(row.module_key)!.push(row);
    }

    for (const moduleKey of moduleOrder) {
      const rows = moduleRes.get(moduleKey) || [];
      const obs = moduleObs.get(moduleKey) || [];
      const hasError = rows.some((entry) => ['error', 'timeout'].includes(entry.status));
      const hasRunning = rows.some((entry) => entry.status === 'running');
      const hasQueued = rows.some((entry) => entry.status === 'queued');
      const hasSuccess = rows.some((entry) => entry.status === 'success');
      const hasSkipped = rows.some((entry) => entry.status === 'skipped');

      const hasData = (() => {
        if (moduleKey === 'open_ports') {
          return openPortRows.length > 0;
        }
        if (moduleKey === 'quality') {
          return Number(qualityCategories.performance || 0) > 0
            || Number(qualityCategories.accessibility || 0) > 0
            || Number(qualityCategories.best_practices || 0) > 0
            || Number(qualityCategories.seo || 0) > 0;
        }
        if (moduleKey === 'whois') {
          return Boolean(latestWhois?.registrar || latestWhois?.expires || latestWhois?.days_to_expiry != null);
        }
        if (moduleKey === 'server_location') {
          return Boolean(latestServerLocation?.city || latestServerLocation?.country || latestServerLocation?.ip);
        }
        return obs.some((entry) => {
          if (['module_skipped', 'module_error', 'module_timeout', 'rdap_unavailable'].includes(entry.observation_type)) {
            return false;
          }
          return isNonEmptyObject(entry.value);
        });
      })();

      if (hasError) {
        outcomes[moduleKey] = 'error';
        continue;
      }
      if (hasRunning) {
        outcomes[moduleKey] = 'running';
        continue;
      }
      if (hasQueued) {
        outcomes[moduleKey] = 'queued';
        continue;
      }

      const hasPrereqSkip = obs.some((entry) => {
        if (entry.observation_type !== 'module_skipped') return false;
        const reason = String(entry.value?.reason || '').toLowerCase();
        return reason.includes('missing_google_cloud_api_key') || reason.includes('feature_flag_disabled');
      });
      const hasRdapUnavailable = moduleKey === 'whois'
        && obs.some((entry) => entry.observation_type === 'rdap_unavailable');
      const hasServerLocationNoIp = moduleKey === 'server_location'
        && !hasData
        && hasSuccess
        && obs.length === 0;
      const hasOpenPortsNoData = moduleKey === 'open_ports'
        && !hasData
        && hasSuccess;

      if (hasPrereqSkip || hasRdapUnavailable || hasServerLocationNoIp || hasOpenPortsNoData || (hasSkipped && !hasData)) {
        outcomes[moduleKey] = 'skipped_prerequisite';
        continue;
      }

      if (hasSuccess && hasData) {
        outcomes[moduleKey] = 'success_with_data';
      } else if (hasSuccess && !hasData) {
        outcomes[moduleKey] = 'success_no_data';
      } else if (hasSkipped) {
        outcomes[moduleKey] = 'skipped_prerequisite';
      } else {
        outcomes[moduleKey] = 'success_no_data';
      }
    }

    return outcomes;
  }, [moduleResults, observations, openPortRows, qualityCategories, latestWhois, latestServerLocation]);

  const moduleSkipReasons = useMemo(() => {
    const out: Record<string, string> = {};
    for (const row of observations) {
      if (row.observation_type === 'module_skipped') {
        const reason = String(row.value?.reason || '').trim().toLowerCase();
        if (reason && !out[row.module]) out[row.module] = reason;
      }
      if (row.module === 'whois' && row.observation_type === 'rdap_unavailable' && !out[row.module]) {
        out[row.module] = 'rdap_unavailable';
      }
    }
    if (!out.server_location && moduleOutcomes.server_location === 'skipped_prerequisite' && serverLocationCoverage === 0) {
      out.server_location = 'server_location_no_ip';
    }
    if (!out.open_ports && moduleOutcomes.open_ports === 'skipped_prerequisite' && openPortRows.length === 0) {
      out.open_ports = 'open_ports_no_data';
    }
    return out;
  }, [observations, moduleOutcomes, serverLocationCoverage, openPortRows.length]);

  const scoreSummary = useMemo(() => {
    const scores = latestScopeJobs
      .map((entry) => Number(entry.summary?.overall_score))
      .filter((entry) => Number.isFinite(entry));
    if (scores.length === 0) {
      return {
        overallScore: 0,
        riskLevel: 'unknown',
      };
    }
    const avgScore = Math.round(scores.reduce((acc, value) => acc + value, 0) / scores.length);
    return {
      overallScore: avgScore,
      riskLevel: riskLevelFromScore(avgScore),
    };
  }, [latestScopeJobs]);

  const passesValue = (observationByModule.passes?.value || {}) as Record<string, any>;
  const passItems = Array.isArray(passesValue?.passes) ? passesValue.passes : [];

  const httpSecurity = (observationByModule.http_security?.value || {}) as Record<string, any>;
  const httpChecks = (httpSecurity.checks || {}) as Record<string, boolean>;
  const dnssec = (observationByModule.dnssec?.value || {}) as Record<string, any>;
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
  const ssl = (observationByModule.ssl_certificate?.value || {}) as Record<string, any>;
  const tls = (observationByModule.tls_summary?.value || {}) as Record<string, any>;
  const serverInfo = (observationByModule.server_info?.value || {}) as Record<string, any>;
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

  const handleAddScope = async (subdomainValue: string) => {
    try {
      if (onAddSubdomainToScope) await onAddSubdomainToScope(subdomainValue);
    } catch (error) {
      console.error('Error adding subdomain to scope:', error);
    }
  };

  const handleScanSubdomain = async (subdomainValue: string) => {
    try {
      if (onScanSubdomain) await onScanSubdomain(subdomainValue);
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
          <p className="text-sm text-muted-foreground">Nessuna scansione in-scope completata disponibile.</p>
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
            Dettaglio Scope Scansioni
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Ultimo target in-scope: <span className="font-medium text-foreground">{latestScan.raw_target || latestScan.normalized_target}</span>
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Scope targets</p>
              <p className="text-sm font-medium">{latestScopeJobs.length}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Stato ultimo job</p>
                <Badge className={statusBadgeClass[outcomeFromJobStatus(latestScan.status)]}>
                  {String(latestScan.status || '').toLowerCase() === 'completed'
                    ? 'Completato'
                    : String(latestScan.status || 'N/D')}
                </Badge>
              </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Profilo ultimo job</p>
              <p className="text-sm font-medium">{latestScan.scan_profile}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Overall score scope</p>
              <Badge className={scoreTone(scoreSummary.overallScore)}>{scoreSummary.overallScore}/100</Badge>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Livello rischio scope</p>
              <Badge className={scoreTone(scoreSummary.overallScore)}>{formatRiskLevel(scoreSummary.riskLevel)}</Badge>
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
                {riskFindings.slice(0, 8).map((finding, index) => (
                  <div key={`${finding.finding_type}-${index}`} className="rounded-md border border-border/70 p-2 text-sm">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={severityBadgeClass[finding.severity]}>{finding.severity}</Badge>
                      <span className="font-medium">{finding.title || finding.finding_type || 'Finding'}</span>
                    </div>
                    {finding.remediation && (
                      <p className="text-xs text-muted-foreground mt-1">{finding.remediation}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            <div className="rounded-lg border border-border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-medium">Passes</div>
                <Badge className={statusBadgeClass[moduleOutcomes.passes || 'success_no_data']}>
                  {statusLabel(moduleOutcomes.passes || 'success_no_data')}
                </Badge>
              </div>
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
                <Badge className={statusBadgeClass[moduleOutcomes.http_security || 'success_no_data']}>
                  {statusLabel(moduleOutcomes.http_security || 'success_no_data')}
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
                <Badge className={statusBadgeClass[moduleOutcomes.dnssec || 'success_no_data']}>
                  {statusLabel(moduleOutcomes.dnssec || 'success_no_data')}
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
                <Badge className={statusBadgeClass[moduleOutcomes.quality || 'success_no_data']}>
                  {statusLabel(moduleOutcomes.quality || 'success_no_data')}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground">Coverage: {qualityRows.length} target</div>
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
                  {qualityFailedAudits.slice(0, 3).map((audit) => (
                    <p key={audit.id} className="text-xs text-muted-foreground truncate">• {audit.title}</p>
                  ))}
                </div>
              )}
              {moduleOutcomes.quality === 'skipped_prerequisite' && (
                <p className="text-xs text-amber-300">{moduleReasonLabel(moduleSkipReasons.quality || '')}</p>
              )}
            </div>

            <div className="rounded-lg border border-border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-medium flex items-center gap-2"><Cable className="w-4 h-4" />Open Ports</div>
                <Badge className={statusBadgeClass[moduleOutcomes.open_ports || 'success_no_data']}>
                  {statusLabel(moduleOutcomes.open_ports || 'success_no_data')}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">Porte aperte: {openPortRows.length}</p>
              <div className="space-y-1.5 max-h-40 overflow-auto pr-1">
                {openPortRows.slice(0, 8).map((entry: any, idx: number) => (
                  <div key={`${entry?.ip || 'ip'}-${entry?.port || idx}`} className="rounded border border-border/70 p-2 text-xs space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{entry?.ip || '-'}:{entry?.port}</span>
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
              {moduleOutcomes.open_ports === 'skipped_prerequisite' && (
                <p className="text-xs text-amber-300">{moduleReasonLabel(moduleSkipReasons.open_ports || '')}</p>
              )}
            </div>

            <div className="rounded-lg border border-border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-medium">Threats</div>
                <Badge className={statusBadgeClass[moduleOutcomes.threats || 'success_no_data']}>
                  {statusLabel(moduleOutcomes.threats || 'success_no_data')}
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
                <Badge className={statusBadgeClass[moduleOutcomes.whois || 'success_no_data']}>
                  {statusLabel(moduleOutcomes.whois || 'success_no_data')}
                </Badge>
              </div>
              <div className="text-xs space-y-1">
                <div className="flex justify-between"><span>Coverage</span><span>{whoisCoverage} target</span></div>
                <div className="flex justify-between"><span>RDAP unavailable</span><span>{whoisUnavailableCount}</span></div>
                <div className="flex justify-between"><span>Registrar</span><span>{latestWhois.registrar || '-'}</span></div>
                <div className="flex justify-between"><span>Scadenza</span><span>{latestWhois.days_to_expiry != null ? `${latestWhois.days_to_expiry} giorni` : '-'}</span></div>
                <div className="flex justify-between"><span>DNSSEC (RDAP)</span><span>{latestWhois.dnssec || '-'}</span></div>
              </div>
              {moduleOutcomes.whois === 'skipped_prerequisite' && (
                <p className="text-xs text-amber-300">{moduleReasonLabel(moduleSkipReasons.whois || '')}</p>
              )}
            </div>

            <div className="rounded-lg border border-border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-medium flex items-center gap-2"><Lock className="w-4 h-4" />SSL/TLS</div>
                <Badge className={statusBadgeClass[moduleOutcomes.ssl_certificate || 'success_no_data']}>
                  {statusLabel(moduleOutcomes.ssl_certificate || 'success_no_data')}
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
                <Badge className={statusBadgeClass[moduleOutcomes.server_info || 'success_no_data']}>
                  {statusLabel(moduleOutcomes.server_info || 'success_no_data')}
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
                <Badge className={statusBadgeClass[moduleOutcomes.server_location || 'success_no_data']}>
                  {statusLabel(moduleOutcomes.server_location || 'success_no_data')}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground">Coverage: {serverLocationCoverage} target</div>
              <div className="text-xs text-muted-foreground">
                {latestServerLocation.city || '-'}, {latestServerLocation.countryCode || latestServerLocation.country || '-'}
              </div>
              {moduleOutcomes.server_location === 'skipped_prerequisite' && (
                <p className="text-xs text-amber-300">{moduleReasonLabel(moduleSkipReasons.server_location || '')}</p>
              )}
            </div>

            <div className="rounded-lg border border-border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-medium flex items-center gap-2"><MailCheck className="w-4 h-4" />Mail Config</div>
                <Badge className={statusBadgeClass[moduleOutcomes.mail_config || 'success_no_data']}>
                  {statusLabel(moduleOutcomes.mail_config || 'success_no_data')}
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
                <Badge className={statusBadgeClass[moduleOutcomes.redirects || moduleOutcomes.redirect_chain || 'success_no_data']}>
                  {statusLabel(moduleOutcomes.redirects || moduleOutcomes.redirect_chain || 'success_no_data')}
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
                      scope_jobs_total: latestScopeJobs.length,
                      module_outcomes: moduleOutcomes,
                      quality_categories: qualityCategories,
                      open_ports_count: openPortRows.length,
                      whois_coverage: whoisCoverage,
                      server_location_coverage: serverLocationCoverage,
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
              {moduleOrder.map((moduleKey) => {
                const status = moduleOutcomes[moduleKey] || 'success_no_data';
                return (
                  <Badge key={moduleKey} variant="outline" className={statusBadgeClass[status]}>
                    {moduleKey}: {statusLabel(status)}
                  </Badge>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
};

export default SurfaceScanModuleCards;
