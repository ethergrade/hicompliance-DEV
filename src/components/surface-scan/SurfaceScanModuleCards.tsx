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
import { publicSourceLabel } from '@/lib/surfaceSourceLabels';

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
  error_message?: string | null;
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
  error_message?: string | null;
  normalized?: Record<string, any> | null;
  raw?: Record<string, unknown> | null;
  source?: string | null;
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
  affected_asset?: string | null;
  affected_url?: string | null;
  ip?: string | null;
  evidence?: Record<string, any> | null;
  status?: string | null;
  created_at: string;
}

interface ExposureOpenPortRow {
  scan_job_id: string;
  host: string;
  ip: string | null;
  port: number;
  protocol: string;
  state?: string | null;
  service_name: string | null;
  service_product: string | null;
  service_version: string | null;
  exposure_level: string;
  is_web: boolean;
  is_tls: boolean;
  source?: string | null;
  raw?: Record<string, unknown> | null;
  remediation_hint?: string | null;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
}

interface SurfaceAssetRow {
  scan_job_id: string;
  asset_type: string;
  asset_value: string;
  hostname: string | null;
  root_domain: string | null;
  ip: string | null;
  source: string | null;
  confidence?: string | null;
  raw?: Record<string, unknown> | null;
}

interface ConfiguredScopeTarget {
  key: string;
  label: string;
  type: 'domain' | 'ip' | 'range' | 'cidr' | 'other';
}

interface ScopeTargetRow {
  id: string;
  targetKey: string;
  label: string;
  status: string;
  liveStatus: string;
  liveJobId: string | null;
  liveCreatedAt: string | null;
  liveErrorMessage: string | null;
  snapshotSource: 'live' | 'last_good';
  profile: string;
  score: number | null;
  riskLevel: string;
  completedAt: string | null;
  jobId: string | null;
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
  'connectsecure',
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

const toLabelValue = (value: unknown): string | null => {
  const text = String(value || '').trim();
  if (!text || text === '-' || text.toLowerCase() === 'null' || text.toLowerCase() === 'undefined') return null;
  return text;
};

const extractFindingTargets = (finding: FindingRow): string[] => {
  const targets = new Set<string>();

  const add = (value: unknown) => {
    const parsed = toLabelValue(value);
    if (parsed) targets.add(parsed);
  };

  add(finding.ip);
  add(finding.affected_asset);
  add(finding.affected_url);

  const evidence = finding.evidence;
  if (evidence && typeof evidence === 'object') {
    add((evidence as any).ip);
    add((evidence as any).target);
    add((evidence as any).host);
    add((evidence as any).asset);
    add((evidence as any).domain);

    const ips = (evidence as any).ips;
    if (Array.isArray(ips)) {
      ips.forEach((entry) => add(entry));
    }
  }

  return Array.from(targets).slice(0, 6);
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

const firstText = (...values: unknown[]): string => {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return '';
};

const formatModuleDiagnostic = (moduleKey: string, rawMessage: string): string => {
  const message = rawMessage.trim();
  const lowered = message.toLowerCase();
  const moduleLabel = moduleKey === 'http_security' ? 'HTTP Security' : 'Modulo';

  if (!message) {
    return `${moduleLabel}: errore non classificato. Il prossimo rerun riprovera il controllo e aggiornera il dettaglio.`;
  }
  if (/module timeout|timeout|timed out|aborted|deadline/i.test(message)) {
    return `${moduleLabel}: timeout durante il controllo. Il target non ha risposto entro il tempo massimo; non significa che gli header siano tutti assenti.`;
  }
  if (/no route to host|network is unreachable|host unreachable/i.test(lowered)) {
    return `${moduleLabel}: host non raggiungibile dalla rete di scansione al momento del test. Verificare DNS/IP e raggiungibilita pubblica del servizio web.`;
  }
  if (/dns|enotfound|resolve|name or service not known/i.test(lowered)) {
    return `${moduleLabel}: risoluzione DNS non riuscita durante la scansione. Il controllo viene considerato non valutabile finche il target non risolve.`;
  }
  if (/certificate|tls|ssl|handshake/i.test(lowered)) {
    return `${moduleLabel}: errore TLS/certificato durante il fetch del target. Verificare certificato, SNI e catena TLS.`;
  }
  if (/connection refused|connect error|connection reset|connection closed/i.test(lowered)) {
    return `${moduleLabel}: connessione rifiutata o chiusa dal target durante il fetch HTTP/HTTPS.`;
  }
  if (/fetch failed|sending request|client error/i.test(lowered)) {
    return `${moduleLabel}: richiesta HTTP/HTTPS non completata. Dettaglio tecnico: ${message.slice(0, 220)}`;
  }
  return `${moduleLabel}: ${message.slice(0, 260)}`;
};

const outcomeFromJobStatus = (status: string): ModuleOutcomeStatus => {
  const key = String(status || '').trim().toLowerCase();
  if (key === 'running' || key === 'waiting') return 'running';
  if (key === 'retry') return 'queued';
  if (key === 'queued' || key === 'pending') return 'queued';
  if (key === 'not_scanned') return 'queued';
  if (key === 'not_existing') return 'error';
  if (key === 'failed' || key === 'error') return 'error';
  if (key === 'completed' || key === 'success' || key === 'partial') return 'success_with_data';
  return 'success_no_data';
};

const scanStatusLabel = (status: string): string => {
  const key = String(status || '').trim().toLowerCase();
  if (key === 'completed' || key === 'success' || key === 'partial') return 'Completato';
  if (key === 'running') return 'In esecuzione';
  if (key === 'waiting') return 'In attesa motore';
  if (key === 'retry') return 'Recovery retry';
  if (key === 'queued' || key === 'pending') return 'In coda';
  if (key === 'not_existing') return 'NON ESISTENTE';
  if (key === 'failed' || key === 'error') return 'Fallito';
  if (key === 'not_scanned') return 'Da avviare';
  return 'N/D';
};

const FAILED_LIVE_STATUSES = new Set(['failed', 'error', 'stopped', 'aborted', 'timed out']);

const isNonExistingTargetError = (message: string | null | undefined): boolean => {
  const lowered = String(message || '').trim().toLowerCase();
  if (!lowered) return false;
  return [
    'nxdomain',
    'enotfound',
    'name or service not known',
    'no such host',
    'could not resolve',
    'cannot resolve',
    'dns resolution failed',
    'host not found',
    'domain not found',
    'target not resolvable',
    'not resolvable',
    'non risolto',
    'dominio non risolto',
    'ip non raggiungibile',
  ].some((token) => lowered.includes(token));
};

const effectiveScopeStatus = (row: ScopeTargetRow): string => {
  const live = String(row.liveStatus || row.status || '').toLowerCase();
  if (FAILED_LIVE_STATUSES.has(live) && isNonExistingTargetError(row.liveErrorMessage)) {
    return 'not_existing';
  }
  if (FAILED_LIVE_STATUSES.has(live) && row.snapshotSource === 'last_good') {
    return 'partial';
  }
  return live || 'not_scanned';
};

const scopeLiveReasonLabel = (row: ScopeTargetRow): string => {
  if (effectiveScopeStatus(row) === 'not_existing') return 'target non esistente (DNS/IP non risolto)';
  const live = String(row.liveStatus || '').toLowerCase();
  if (live === 'not_scanned') return 'pending scan';
  if (live === 'queued' || live === 'pending') return 'pending scan';
  if (live === 'running' || live === 'waiting') return 'motore in attesa';
  if (live === 'retry') return 'recovered retry';
  if (FAILED_LIVE_STATUSES.has(live)) return row.snapshotSource === 'last_good' ? 'last good snapshot' : 'failed';
  if (row.snapshotSource === 'last_good') return 'last good snapshot';
  return 'completed';
};

const moduleReasonLabel = (reason: string): string => {
  const key = String(reason || '').toLowerCase();
  if (key.includes('missing_google_cloud_api_key')) return 'Prerequisito mancante: GOOGLE_API_KEY per Quality.';
  if (key.includes('feature_flag_disabled')) return 'Modulo disabilitato da feature flag.';
  if (key.includes('job_toggle_disabled')) return 'Controllo non richiesto per questa scansione.';
  if (key.includes('missing_service_url')) return 'Prerequisito tecnico non configurato.';
  if (key.includes('missing_shared_secret')) return 'Credenziale tecnica non configurata.';
  if (key.includes('target_not_domain')) return 'Controllo applicabile solo a domini, sottodomini o URL.';
  if (key.includes('missing_root_domain')) return 'Target senza dominio registrabile: WHOIS applicabile solo a domini.';
  if (key.includes('rdap')) return 'RDAP temporaneamente non disponibile per WHOIS.';
  if (key.includes('server_location_no_ip')) return 'Nessun IP in-scope geolocalizzabile disponibile.';
  if (key.includes('open_ports_no_data')) return 'Nessun dato porte disponibile da scan classica/exposure.';
  return 'Dato non disponibile per prerequisito o motore.';
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

const scopeTargetKeyFromTarget = (rawTarget: string): string => {
  const host = extractHostFromTarget(rawTarget);
  if (host) return host;
  return String(rawTarget || '').trim().toLowerCase();
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

const hasArrayItems = (value: unknown): boolean =>
  Array.isArray(value) && value.some((entry) => String(entry ?? '').trim() !== '');

const hasOwnValue = (value: Record<string, any>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value || {}, key)
  && value[key] !== null
  && value[key] !== undefined
  && String(value[key]).trim() !== '';

const hasKnownBoolean = (value: Record<string, any>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value || {}, key) && typeof value[key] === 'boolean';

const hasPositiveNumber = (value: unknown): boolean => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
};

const hasAnyPositiveNumber = (...values: unknown[]): boolean => values.some(hasPositiveNumber);

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

const defaultServiceLabelForPort = (port: number): string => {
  if (port === 80) return 'HTTP';
  if (port === 443) return 'HTTPS';
  if (port === 22) return 'SSH';
  if (port === 25) return 'SMTP';
  if (port === 53) return 'DNS';
  if (port === 110) return 'POP3';
  if (port === 143) return 'IMAP';
  if (port === 465) return 'SMTPS';
  if (port === 587) return 'SMTP Submission';
  if (port === 993) return 'IMAPS';
  if (port === 995) return 'POP3S';
  if (port === 3306) return 'MySQL';
  if (port === 5432) return 'PostgreSQL';
  if (port === 3389) return 'RDP';
  if (port === 5900) return 'VNC';
  return '';
};

const openPortServiceLabel = (entry: Record<string, unknown>): string =>
  firstText(
    entry?.service,
    entry?.service_name,
    entry?.serviceName,
    entry?.service_product,
    entry?.product,
    entry?.service_version,
    defaultServiceLabelForPort(Number(entry?.port || 0)),
  ) || 'Servizio non classificato';

const compactHeaderName = (value: string): string =>
  String(value || '')
    .replace(/_/g, '-')
    .replace(/\b\w/g, (char) => char.toUpperCase());

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
  const [latestLiveScopeJobs, setLatestLiveScopeJobs] = useState<Record<string, LatestScanRow>>({});
  const [configuredScopeTargets, setConfiguredScopeTargets] = useState<ConfiguredScopeTarget[]>([]);
  const [moduleResults, setModuleResults] = useState<ModuleResultRow[]>([]);
  const [observations, setObservations] = useState<ObservationRow[]>([]);
  const [riskFindings, setRiskFindings] = useState<FindingRow[]>([]);
  const [exposureOpenPorts, setExposureOpenPorts] = useState<ExposureOpenPortRow[]>([]);
  const [surfaceAssets, setSurfaceAssets] = useState<SurfaceAssetRow[]>([]);
  const [subdomainSearch, setSubdomainSearch] = useState('');
  const [subdomainPage, setSubdomainPage] = useState(1);
  const [rawExpanded, setRawExpanded] = useState(false);
  const [connectsecureHeadersExpanded, setConnectsecureHeadersExpanded] = useState(false);
  const [scopeTargetSearch, setScopeTargetSearch] = useState('');
  const [selectedScopeTargetKey, setSelectedScopeTargetKey] = useState('');

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
        const scopeFilter = `customer_id.eq.${organizationId},organization_id.eq.${organizationId}`;
        const [scopeRes, jobsRes] = await Promise.all([
          supabase
            .from('surface_scan_monitored_ips' as any)
            .select('entry_type, input_value, ip_start, ip_end')
            .eq('organization_id', organizationId),
          supabase
            .from('surface_scan_jobs' as any)
            .select('id, raw_target, normalized_target, scan_profile, status, created_at, completed_at, error_message, summary')
            .or(scopeFilter)
            .in('status', ['completed', 'partial', 'queued', 'pending', 'running', 'failed'])
            .order('created_at', { ascending: false })
            .limit(500),
        ]);

        if (scopeRes.error) throw scopeRes.error;
        if (jobsRes.error) throw jobsRes.error;

        const scopeRules = (scopeRes.data || []) as SurfaceMonitoredScopeRule[];
        const { scopeDomains, ipScopeRules } = splitMonitoredScopeRules(scopeRules);
        const jobs = (jobsRes.data || []) as LatestScanRow[];

        const configuredTargetsMap = new Map<string, ConfiguredScopeTarget>();
        for (const rule of scopeRules) {
          const entryType = String(rule.entry_type || '').toLowerCase();
          const inputValue = String(rule.input_value || '').trim();
          if (!inputValue) continue;
          if (entryType === 'domain') {
            const normalized = inputValue.toLowerCase();
            configuredTargetsMap.set(`domain|${normalized}`, {
              key: `domain|${normalized}`,
              label: normalized,
              type: 'domain',
            });
            continue;
          }
          if (entryType === 'single') {
            configuredTargetsMap.set(`ip|${inputValue}`, {
              key: `ip|${inputValue}`,
              label: inputValue,
              type: 'ip',
            });
            continue;
          }
          if (entryType === 'range') {
            configuredTargetsMap.set(`range|${inputValue}`, {
              key: `range|${inputValue}`,
              label: inputValue,
              type: 'range',
            });
            continue;
          }
          if (entryType === 'cidr') {
            configuredTargetsMap.set(`cidr|${inputValue}`, {
              key: `cidr|${inputValue}`,
              label: inputValue,
              type: 'cidr',
            });
            continue;
          }
        }
        setConfiguredScopeTargets(Array.from(configuredTargetsMap.values()));

        const groupedByTarget = new Map<string, LatestScanRow[]>();
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

          const key = scopeTargetKeyFromTarget(targetRaw);
          if (!groupedByTarget.has(key)) groupedByTarget.set(key, []);
          groupedByTarget.get(key)!.push(job);
        }

        const liveByTarget: Record<string, LatestScanRow> = {};
        const selectedByTarget = new Map<string, LatestScanRow>();

        for (const [targetKey, targetJobs] of groupedByTarget.entries()) {
          const sorted = [...targetJobs].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
          const liveJob = sorted[0];
          if (liveJob) liveByTarget[targetKey] = liveJob;

          const completedWithScore = sorted.find((entry) => {
            const status = String(entry.status || '').toLowerCase();
            if (!['completed', 'partial', 'success'].includes(status)) return false;
            const score = Number(entry.summary?.overall_score);
            return Number.isFinite(score);
          });
          const completedAny = sorted.find((entry) => ['completed', 'partial', 'success'].includes(String(entry.status || '').toLowerCase()));
          selectedByTarget.set(targetKey, completedWithScore || completedAny || liveJob);
        }

        const scopeJobs = Array.from(selectedByTarget.values()).sort(
          (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
        );

        setLatestLiveScopeJobs(liveByTarget);
        setLatestScopeJobs(scopeJobs);
        const latestLive = Object.values(liveByTarget).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
        setLatestScan(latestLive || scopeJobs[0] || null);

        if (scopeJobs.length === 0) {
          setLatestLiveScopeJobs({});
          setModuleResults([]);
          setObservations([]);
          setRiskFindings([]);
          setExposureOpenPorts([]);
          setSurfaceAssets([]);
          return;
        }

        const jobIds = scopeJobs.map((job) => String(job.id));

        const [moduleRows, observationRows, findingRows, exposureRows, assetRows] = await Promise.all([
          fetchRowsByJobIds<ModuleResultRow>(
            'surface_scan_module_results',
            'scan_job_id, module_key, module_label, status, severity, duration_ms, completed_at, error_message, normalized, raw, source',
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
            'scan_job_id, module, finding_type, title, remediation, severity, affected_asset, affected_url, ip, evidence, status, created_at',
            jobIds,
            { orderBy: 'created_at', ascending: false },
          ),
          fetchRowsByJobIds<ExposureOpenPortRow>(
            'surface_open_ports',
            'scan_job_id, host, ip, port, protocol, state, service_name, service_product, service_version, exposure_level, is_web, is_tls, source, raw, remediation_hint, first_seen_at, last_seen_at',
            jobIds,
            { orderBy: 'last_seen_at', ascending: false },
          ),
          fetchRowsByJobIds<SurfaceAssetRow>(
            'surface_assets',
            'scan_job_id, asset_type, asset_value, hostname, root_domain, ip, source, confidence, raw',
            jobIds,
            { orderBy: 'last_seen', ascending: false },
          ),
        ]);

        const prioritizedFindings = findingRows
          .filter((entry) => !['resolved', 'suppressed', 'false_positive', 'accepted_risk'].includes(String(entry.status || '').toLowerCase()))
          .filter((entry) => ['critical', 'high'].includes(String(entry.severity || '').toLowerCase()))
          .sort((a, b) => (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0));

        setModuleResults(moduleRows);
        setObservations(observationRows);
        setRiskFindings(prioritizedFindings);
        setExposureOpenPorts(exposureRows);
        setSurfaceAssets(assetRows);
      } catch (error) {
        console.error('Error loading SurfaceScan module cards:', error);
        setLatestScan(null);
        setLatestScopeJobs([]);
        setLatestLiveScopeJobs({});
        setConfiguredScopeTargets([]);
        setModuleResults([]);
        setObservations([]);
        setRiskFindings([]);
        setExposureOpenPorts([]);
        setSurfaceAssets([]);
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, [organizationId]);

  const scopeTargetRows = useMemo<ScopeTargetRow[]>(() => {
    const scannedRows = latestScopeJobs.map((job) => {
      const rawLabel = String(job.raw_target || job.normalized_target || '-').trim();
      const canonicalLabel = extractHostFromTarget(rawLabel) || rawLabel;
      const targetKey = scopeTargetKeyFromTarget(canonicalLabel);
      const liveJob = latestLiveScopeJobs[targetKey];
      const score = Number(job.summary?.overall_score);
      const hasScore = Number.isFinite(score);
      const riskFromSummary = String(job.summary?.risk_level || '').toLowerCase();
      const computedRisk = hasScore ? riskLevelFromScore(score) : 'unknown';
      const riskLevel = riskFromSummary || computedRisk;
      return {
        id: job.id,
        targetKey,
        label: canonicalLabel,
        status: String(liveJob?.status || job.status || '').toLowerCase() || 'n/d',
        liveStatus: String(liveJob?.status || job.status || '').toLowerCase() || 'n/d',
        liveJobId: liveJob?.id ? String(liveJob.id) : String(job.id),
        liveCreatedAt: liveJob?.created_at || job.created_at || null,
        snapshotSource: liveJob?.id && String(liveJob.id) !== String(job.id) ? 'last_good' : 'live',
        profile: String(liveJob?.scan_profile || job.scan_profile || '-'),
        score: hasScore ? Math.round(score) : null,
        riskLevel,
        completedAt: job.completed_at,
        liveErrorMessage: String(liveJob?.error_message || job.error_message || '').trim() || null,
        jobId: job.id,
      };
    });
    const scannedByLabel = new Map(
      scannedRows.map((entry) => [entry.targetKey, entry] as const),
    );

    if (configuredScopeTargets.length === 0) return scannedRows;

    const configuredRows = configuredScopeTargets.map((target) => {
      const targetKey = scopeTargetKeyFromTarget(String(target.label || ''));
      const scanned = scannedByLabel.get(targetKey);
      if (scanned) {
        return scanned;
      }
      return {
        id: target.key,
        targetKey,
        label: target.label,
        status: 'not_scanned',
        liveStatus: 'not_scanned',
        liveJobId: null,
        liveCreatedAt: null,
        liveErrorMessage: null,
        snapshotSource: 'live',
        profile: target.type === 'domain' ? 'domain_exposure' : target.type === 'ip' ? 'ip_exposure' : 'scope_rule',
        score: null,
        riskLevel: 'unknown',
        completedAt: null,
        jobId: null,
      };
    });

    return configuredRows.sort((a, b) => a.label.localeCompare(b.label));
  }, [latestScopeJobs, latestLiveScopeJobs, configuredScopeTargets]);

  useEffect(() => {
    if (scopeTargetRows.length === 0) {
      setSelectedScopeTargetKey('');
      return;
    }
    setSelectedScopeTargetKey((prev) => {
      if (prev && scopeTargetRows.some((row) => row.targetKey === prev)) return prev;
      const preferred = scopeTargetRows.find((row) => row.jobId) || scopeTargetRows[0];
      return preferred.targetKey;
    });
  }, [scopeTargetRows]);

  const selectedScopeTargetRow = useMemo<ScopeTargetRow | null>(() => {
    if (scopeTargetRows.length === 0) return null;
    return scopeTargetRows.find((row) => row.targetKey === selectedScopeTargetKey) || scopeTargetRows[0];
  }, [scopeTargetRows, selectedScopeTargetKey]);

  const selectedScopeJobId = selectedScopeTargetRow?.jobId || null;

  const selectedModuleResults = useMemo(
    () => (selectedScopeJobId ? moduleResults.filter((row) => String(row.scan_job_id) === selectedScopeJobId) : []),
    [moduleResults, selectedScopeJobId],
  );

  const selectedObservations = useMemo(
    () => (selectedScopeJobId ? observations.filter((row) => String(row.scan_job_id) === selectedScopeJobId) : []),
    [observations, selectedScopeJobId],
  );

  const selectedRiskFindings = useMemo(
    () => (selectedScopeJobId ? riskFindings.filter((row) => String(row.scan_job_id) === selectedScopeJobId) : []),
    [riskFindings, selectedScopeJobId],
  );

  const selectedExposureOpenPorts = useMemo(() => {
    const directRows = selectedScopeJobId
      ? exposureOpenPorts.filter((row) => String(row.scan_job_id) === selectedScopeJobId)
      : [];
    if (directRows.length > 0) return directRows;

    const selectedTargetKey = selectedScopeTargetRow?.targetKey || scopeTargetKeyFromTarget(selectedScopeTargetRow?.label || '');
    if (!selectedTargetKey) return [];

    return exposureOpenPorts.filter((row) => {
      const raw = row.raw && typeof row.raw === 'object' ? row.raw as Record<string, unknown> : {};
      const candidates = [
        row.host,
        (raw as any).scope_target_host,
        (raw as any).root_domain,
        (raw as any).target,
      ]
        .map((entry) => scopeTargetKeyFromTarget(String(entry || '')))
        .filter(Boolean);
      return candidates.includes(selectedTargetKey);
    });
  }, [exposureOpenPorts, selectedScopeJobId, selectedScopeTargetRow?.label, selectedScopeTargetRow?.targetKey]);

  const selectedSurfaceAssets = useMemo(
    () => (selectedScopeJobId ? surfaceAssets.filter((row) => String(row.scan_job_id) === selectedScopeJobId) : []),
    [surfaceAssets, selectedScopeJobId],
  );

  const observationByModule = useMemo(() => {
    const map: Record<string, ObservationRow | undefined> = {};
    for (const row of selectedObservations) {
      if (!map[row.module]) map[row.module] = row;
    }
    return map;
  }, [selectedObservations]);

  const qualityRows = useMemo(
    () => selectedObservations.filter((row) => row.module === 'quality' && row.observation_type.startsWith('quality_summary')),
    [selectedObservations],
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
    const whoisRows = selectedObservations
      .filter((row) => row.module === 'whois' && row.observation_type === 'whois_rdap')
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    return whoisRows[0]?.value || {};
  }, [selectedObservations]);

  const whoisCoverage = useMemo(
    () => selectedObservations.filter((row) => row.module === 'whois' && row.observation_type === 'whois_rdap').length,
    [selectedObservations],
  );

  const whoisUnavailableCount = useMemo(
    () => selectedObservations.filter((row) => row.module === 'whois' && row.observation_type === 'rdap_unavailable').length,
    [selectedObservations],
  );

  const latestServerLocation = useMemo(() => {
    const rows = selectedObservations
      .filter((row) => row.module === 'server_location' && row.observation_type === 'server_location')
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    return rows[0]?.value || {};
  }, [selectedObservations]);

  const serverLocationCoverage = useMemo(
    () => selectedObservations.filter((row) => row.module === 'server_location' && row.observation_type === 'server_location').length,
    [selectedObservations],
  );

  const openPortRows = useMemo(() => {
    const merged = new Map<string, any>();

    const observedRows = selectedObservations
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
          host: String(entry?.host || entry?.hostname || entry?.target || ip).trim() || ip,
          ip,
          port,
          protocol,
          service: entry?.service || null,
          product: entry?.product || null,
          source: entry?.source || 'scan_engine',
          exposure_level: entry?.exposure_level || severityForPort(port),
          is_web: Boolean(entry?.is_web) || [80, 443, 8080, 8443].includes(port),
          is_tls: Boolean(entry?.is_tls) || [443, 8443, 993, 995, 465].includes(port),
          raw: entry,
        });
      }
    }

    for (const row of selectedExposureOpenPorts) {
      const ip = String(row.ip || row.host || '').trim();
      const port = Number(row.port || 0);
      const protocol = String(row.protocol || 'tcp').toLowerCase();
      if (!ip || !Number.isFinite(port) || port <= 0) continue;
      const key = `${ip}|${port}|${protocol}`;
      if (!merged.has(key)) {
        merged.set(key, {
          host: row.host || ip,
          ip,
          port,
          protocol,
          service: row.service_name || null,
          product: row.service_product || row.service_version || null,
          source: row.source || row.raw?.source || 'exposure_pipeline',
          exposure_level: row.exposure_level || severityForPort(port),
          is_web: Boolean(row.is_web),
          is_tls: Boolean(row.is_tls),
          raw: row.raw || null,
        });
      }
    }

    return Array.from(merged.values()).sort((a, b) => {
      const sevDelta = severityRank[severityForPort(b.port)] - severityRank[severityForPort(a.port)];
      if (sevDelta !== 0) return sevDelta;
      return Number(a.port || 0) - Number(b.port || 0);
    });
  }, [selectedObservations, selectedExposureOpenPorts]);

  const connectsecureSummary = useMemo(() => {
    const bfsObs = selectedObservations
      .filter(r => r.module === 'connectsecure' && r.observation_type === 'bfs_scan_summary')
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    const emailObs = selectedObservations
      .filter(r => r.module === 'connectsecure' && r.observation_type === 'discovered_emails')
      .flatMap(r => [...(r.value?.emails || []), ...(r.value?.guessed || [])]);
    const employeeObs = selectedObservations
      .filter(r => r.module === 'connectsecure' && r.observation_type === 'osint_employees')
      .flatMap(r => r.value?.employees || []);
    const bfs = bfsObs[0]?.value || {};
    return {
      domainsScanned:  Number(bfs.domains_scanned || 0),
      maxDepth:        Number(bfs.max_depth_reached || 0),
      totalVisited:    Number(bfs.total_visited || 0),
      emailsFound:     emailObs.length,
      employeesFound:  employeeObs.length,
      hasBfs:          bfsObs.length > 0,
    };
  }, [selectedObservations]);

  const connectsecureOverview = useMemo(() => {
    const moduleRow = selectedModuleResults.find((row) => row.module_key === 'connectsecure');
    const moduleNormalized = (moduleRow?.normalized || {}) as Record<string, unknown>;
    const sourceMatchesConnectSecure = (value: unknown) =>
      String(value || '').toLowerCase().includes('connectsecure');
    const isConnectSecureScan = String(selectedScopeTargetRow?.profile || '').toLowerCase().includes('connectsecure');

    const csAssets = selectedSurfaceAssets.filter((row) => sourceMatchesConnectSecure(row.source));
    const subdomainSet = new Set<string>();
    const ipSet = new Set<string>();

    for (const asset of csAssets) {
      const type = String(asset.asset_type || '').toLowerCase();
      if (type.includes('subdomain')) {
        const value = String(asset.hostname || asset.asset_value || '').trim().toLowerCase();
        if (value) subdomainSet.add(value);
      }
      if (type.includes('ipv4') || type.includes('ipv6') || type === 'ip') {
        const value = String(asset.ip || asset.asset_value || '').trim();
        if (value) ipSet.add(value);
      }
    }

    const portsFromSource = openPortRows.filter((entry) => {
      const source = String(entry?.source || entry?.raw?.source || entry?.raw?.provider || '').toLowerCase();
      return source.includes('connectsecure');
    });
    const ports = portsFromSource.length > 0 || !isConnectSecureScan ? portsFromSource : openPortRows;

    for (const portRow of ports as Array<Record<string, unknown>>) {
      const ip = String(portRow?.ip || '').trim();
      if (ip) ipSet.add(ip);
    }

    const headerObs = selectedObservations.find((row) =>
      row.module === 'connectsecure' && row.observation_type === 'http_server_banner'
    );
    const headersValue = (headerObs?.value?.headers || {}) as Record<string, unknown>;
    const headerEntries = Object.entries(headersValue)
      .map(([name, value]) => ({
        name: compactHeaderName(name),
        value: Array.isArray(value) ? value.join(', ') : String(value || '').trim(),
      }))
      .filter((entry) => entry.name && entry.value)
      .sort((a, b) => a.name.localeCompare(b.name));

    const domainsFromBfs = Number(connectsecureSummary.domainsScanned || 0);
    const normalizedAssets = Number(moduleNormalized.assets || 0);
    const normalizedPorts = Number(moduleNormalized.ports || 0);
    const normalizedFindings = Number(moduleNormalized.findings || 0);
    const normalizedObservations = Number(moduleNormalized.observations || 0);
    const hasNormalizedData = hasAnyPositiveNumber(
      normalizedAssets,
      normalizedPorts,
      normalizedFindings,
      normalizedObservations,
      domainsFromBfs,
      connectsecureSummary.emailsFound,
      connectsecureSummary.employeesFound,
    );

    return {
      hasData: Boolean(hasNormalizedData || csAssets.length || ports.length || headerEntries.length),
      moduleRow,
      targetIps: Array.from(ipSet).sort(),
      subdomains: Array.from(subdomainSet).sort(),
      ports,
      headerEntries,
      server: String(headerObs?.value?.server || '').trim(),
      assetsCount: normalizedAssets || csAssets.length,
      portsCount: Math.max(normalizedPorts || 0, ports.length),
      subdomainsCount: Math.max(subdomainSet.size, domainsFromBfs || 0),
      observationsCount: normalizedObservations,
      findingsCount: normalizedFindings,
    };
  }, [
    selectedModuleResults,
    selectedScopeTargetRow?.profile,
    selectedSurfaceAssets,
    openPortRows,
    selectedObservations,
    connectsecureSummary,
  ]);

  const moduleOutcomes = useMemo(() => {
    const outcomes: Record<string, ModuleOutcomeStatus> = {};
    const moduleObs = new Map<string, ObservationRow[]>();
    const moduleRes = new Map<string, ModuleResultRow[]>();

    for (const row of selectedObservations) {
      if (!moduleObs.has(row.module)) moduleObs.set(row.module, []);
      moduleObs.get(row.module)!.push(row);
    }
    for (const row of selectedModuleResults) {
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
        return reason.includes('missing_google_cloud_api_key')
          || reason.includes('feature_flag_disabled')
          || reason.includes('missing_root_domain');
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

      if (hasPrereqSkip) {
        outcomes[moduleKey] = 'skipped_prerequisite';
        continue;
      }

      if (hasSuccess && hasData) {
        outcomes[moduleKey] = 'success_with_data';
      } else if (hasSuccess && !hasData) {
        outcomes[moduleKey] = 'success_no_data';
      } else if (hasRdapUnavailable || hasServerLocationNoIp || hasOpenPortsNoData) {
        outcomes[moduleKey] = 'success_no_data';
      } else if (hasSkipped) {
        outcomes[moduleKey] = 'success_no_data';
      } else {
        outcomes[moduleKey] = 'success_no_data';
      }
    }

    return outcomes;
  }, [selectedModuleResults, selectedObservations, openPortRows, qualityCategories, latestWhois, latestServerLocation]);

  const moduleSkipReasons = useMemo(() => {
    const out: Record<string, string> = {};
    for (const row of selectedObservations) {
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
  }, [selectedObservations, moduleOutcomes, serverLocationCoverage, openPortRows.length]);

  const moduleDiagnostics = useMemo(() => {
    const out: Record<string, string> = {};
    for (const row of selectedModuleResults) {
      const status = String(row.status || '').toLowerCase();
      if (!['error', 'timeout'].includes(status)) continue;
      const message = firstText(
        row.error_message,
        row.normalized?.error,
        row.normalized?.message,
        row.raw?.error,
        row.raw?.message,
      );
      if (!out[row.module_key]) {
        out[row.module_key] = formatModuleDiagnostic(row.module_key, message);
      }
    }

    for (const row of selectedObservations) {
      if (!['module_error', 'module_timeout'].includes(row.observation_type)) continue;
      const message = firstText(row.value?.error, row.value?.message, row.value?.reason);
      if (!out[row.module]) {
        out[row.module] = formatModuleDiagnostic(row.module, message);
      }
    }
    return out;
  }, [selectedModuleResults, selectedObservations]);

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

  const filteredScopeTargetRows = useMemo(() => {
    const term = scopeTargetSearch.trim().toLowerCase();
    if (!term) return scopeTargetRows;
    return scopeTargetRows.filter((entry) => {
      const text = `${entry.label} ${entry.profile} ${entry.status}`.toLowerCase();
      return text.includes(term);
    });
  }, [scopeTargetRows, scopeTargetSearch]);

  const scopeStatusCounters = useMemo(() => {
    const counters = {
      scanned: 0,
      running: 0,
      queued: 0,
      notScanned: 0,
      errors: 0,
    };

    for (const row of scopeTargetRows) {
      const status = effectiveScopeStatus(row);
      if (status === 'not_scanned') {
        counters.notScanned += 1;
        continue;
      }

      counters.scanned += 1;
      if (status === 'running' || status === 'waiting') counters.running += 1;
      else if (status === 'queued' || status === 'pending' || status === 'retry') counters.queued += 1;
      else if (status === 'failed' || status === 'error' || status === 'not_existing') counters.errors += 1;
    }

    return counters;
  }, [scopeTargetRows]);

  const passesValue = (observationByModule.passes?.value || {}) as Record<string, any>;
  const passItems = Array.isArray(passesValue?.passes) ? passesValue.passes : [];

  const dnsLookupSummary = useMemo(() => {
    const row = selectedObservations.find((entry) =>
      entry.module === 'dns_lookup' && entry.observation_type === 'dns_lookup_summary'
    );
    return (row?.value || {}) as Record<string, any>;
  }, [selectedObservations]);

  const dnsLookupFindings = useMemo(() => {
    const row = selectedObservations.find((entry) =>
      entry.module === 'dns_lookup' && entry.observation_type === 'dns_lookup_findings'
    );
    const findings = row?.value?.findings;
    return Array.isArray(findings) ? findings as Array<Record<string, any>> : [];
  }, [selectedObservations]);

  const httpHeaderScannerSummary = useMemo(() => {
    const row = selectedObservations.find((entry) =>
      entry.module === 'http_security' && entry.observation_type === 'http_headers_scanner_summary'
    );
    return (row?.value || {}) as Record<string, any>;
  }, [selectedObservations]);

  const httpHeaderScannerFindings = useMemo(() => {
    const row = selectedObservations.find((entry) =>
      entry.module === 'headers' && entry.observation_type === 'http_headers_scanner_findings'
    );
    const findings = row?.value?.findings;
    return Array.isArray(findings) ? findings as Array<Record<string, any>> : [];
  }, [selectedObservations]);

  const httpSecurity = (Object.keys(httpHeaderScannerSummary).length > 0
    ? httpHeaderScannerSummary
    : (observationByModule.http_security?.value || {})) as Record<string, any>;
  const httpChecks = (httpSecurity.checks || {}) as Record<string, boolean>;
  const httpHeaderSummary = (httpSecurity.summary || {}) as Record<string, any>;
  const httpHeaderTopMissing = useMemo(() => {
    if (httpHeaderScannerFindings.length === 0) return null;
    const missing = httpHeaderScannerFindings.filter((entry) => String(entry?.status || '').toLowerCase() === 'missing');
    if (missing.length === 0) return null;
    const counts = new Map<string, number>();
    for (const entry of missing) {
      const header = String(entry?.header || entry?.rule_id || '').trim();
      if (!header) continue;
      counts.set(header, (counts.get(header) || 0) + 1);
    }
    const ranked = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    if (ranked.length === 0) return null;
    return { header: ranked[0][0], count: ranked[0][1] };
  }, [httpHeaderScannerFindings]);
  const httpSecurityOutcome = moduleOutcomes.http_security || 'success_no_data';
  const httpSecurityDiagnostic = moduleDiagnostics.http_security;
  const httpSecurityEvaluated = httpSecurityOutcome === 'success_with_data';
  const dnssec = (observationByModule.dnssec?.value || {}) as Record<string, any>;
  const dnsLookupOutcome = moduleOutcomes.dns || 'success_no_data';
  const dnsLookupDiagnostic = moduleDiagnostics.dns;
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
  const hasModuleRuntimeState = (moduleKey: string): boolean => {
    const outcome = moduleOutcomes[moduleKey] || 'success_no_data';
    return outcome === 'error' || outcome === 'running' || outcome === 'queued';
  };
  const moduleHasEvaluatedData = (moduleKey: string): boolean =>
    (moduleOutcomes[moduleKey] || 'success_no_data') === 'success_with_data';
  const shouldShowModuleCard = (moduleKey: string, hasData: boolean): boolean =>
    hasData || hasModuleRuntimeState(moduleKey);

  const httpSecurityHasData = Boolean(
    httpSecurityDiagnostic
    || (
      moduleHasEvaluatedData('http_security')
      && (
        hasPositiveNumber(httpSecurity.score)
        || hasOwnValue(httpSecurity, 'statusCode')
        || hasOwnValue(httpSecurity, 'status_code')
        || Boolean(toLabelValue(httpSecurity.grade))
        || Object.values(httpChecks).some((entry) => typeof entry === 'boolean')
        || hasAnyPositiveNumber(httpHeaderSummary.ok, httpHeaderSummary.weak, httpHeaderSummary.missing)
        || httpHeaderScannerFindings.length > 0
      )
    )
  );
  const dnsSummary = (dnsLookupSummary?.summary || {}) as Record<string, any>;
  const dnsSummaryHasData = Boolean(
    hasPositiveNumber(dnsLookupSummary.score)
    || Boolean(toLabelValue(dnsLookupSummary.grade))
    || dnsLookupFindings.length > 0
    || Object.values(dnsSummary).some((entry) => hasPositiveNumber(entry))
  );
  const dnsPostureHasData = Boolean(
    dnsLookupDiagnostic
    || dnsSummaryHasData
  );
  const dnssecHasData = Boolean(
    moduleHasEvaluatedData('dnssec')
    && (
      hasKnownBoolean(dnssec, 'dnskey_present')
      || hasKnownBoolean(dnssec, 'ds_present')
      || hasKnownBoolean(dnssec, 'rrsig_present')
      || hasArrayItems(dnssec.records?.dnskey)
      || hasArrayItems(dnssec.records?.ds)
    )
  );
  const qualityHasData = qualityRows.length > 0
    || qualityFailedAudits.length > 0
    || hasAnyPositiveNumber(
      qualityCategories.performance,
      qualityCategories.accessibility,
      qualityCategories.best_practices,
      qualityCategories.seo,
    );
  const openPortsHasData = openPortRows.length > 0;
  const threatsHasData = Boolean(
    (moduleHasEvaluatedData('threats') && isNonEmptyObject(threats))
    || (moduleHasEvaluatedData('dns_blocklists') && isNonEmptyObject(blocklists))
  );
  const whoisHasData = Boolean(
    whoisCoverage > 0
    && (
      toLabelValue(latestWhois?.registrar)
      || toLabelValue(latestWhois?.expires)
      || latestWhois?.days_to_expiry != null
      || toLabelValue(latestWhois?.dnssec)
    )
  );
  const sslTlsHasData = Boolean(
    (moduleHasEvaluatedData('ssl_certificate') || moduleHasEvaluatedData('tls_summary'))
    && (
      hasKnownBoolean(ssl, 'trusted')
      || hasOwnValue(ssl, 'expiresInDays')
      || hasKnownBoolean(tls, 'tls12Supported')
      || hasKnownBoolean(tls, 'tls13Supported')
      || hasKnownBoolean(tls, 'tls10Supported')
      || hasKnownBoolean(tls, 'tls11Supported')
    )
  );
  const serverInfoHasData = Boolean(
    toLabelValue(serverInfo.asn)
    || toLabelValue(serverInfo.organization)
    || toLabelValue(serverInfo.org)
    || hasArrayItems(serverInfo.ports)
  );
  const serverLocationHasData = Boolean(
    serverLocationCoverage > 0
    && (
      toLabelValue(latestServerLocation?.city)
      || toLabelValue(latestServerLocation?.country)
      || toLabelValue(latestServerLocation?.countryCode)
      || toLabelValue(latestServerLocation?.ip)
    )
  );
  const mailConfigHasData = Boolean(
    hasArrayItems(mailConfig.mx_records)
    || hasArrayItems(mailConfig.spf_records)
    || hasArrayItems(mailConfig.dmarc_records)
    || hasArrayItems(mailConfig.dkim_selectors_found)
    || hasArrayItems(mailConfig.bimi_records)
    || (
      moduleHasEvaluatedData('mail_config')
      && (
        hasKnownBoolean(mailConfig, 'has_spf')
        || hasKnownBoolean(mailConfig, 'has_dmarc')
        || hasKnownBoolean(mailConfig, 'spf_valid')
        || hasKnownBoolean(mailConfig, 'dmarc_valid')
      )
    )
  );
  const redirectsHasData = Boolean(
    (moduleHasEvaluatedData('redirects') || moduleHasEvaluatedData('redirect_chain'))
    && (
      hasPositiveNumber(redirects.hopCount)
      || hasKnownBoolean(redirects, 'redirectsToHttps')
      || hasKnownBoolean(redirects, 'externalRedirect')
    )
  );
  const passesHasData = passItems.length > 0;
  const connectsecureHasData = connectsecureOverview.hasData;

  const showPassesCard = shouldShowModuleCard('passes', passesHasData);
  const showConnectsecureCard = shouldShowModuleCard('connectsecure', connectsecureHasData);
  const showHttpSecurityCard = shouldShowModuleCard('http_security', httpSecurityHasData);
  const showDnsPostureCard = dnsPostureHasData || hasModuleRuntimeState('dns');
  const showDnssecCard = shouldShowModuleCard('dnssec', dnssecHasData);
  const showQualityCard = shouldShowModuleCard('quality', qualityHasData);
  const showOpenPortsCard = shouldShowModuleCard('open_ports', openPortsHasData);
  const showThreatsCard = shouldShowModuleCard('threats', threatsHasData);
  const showWhoisCard = shouldShowModuleCard('whois', whoisHasData);
  const showSslTlsCard = shouldShowModuleCard('ssl_certificate', sslTlsHasData);
  const showServerInfoCard = shouldShowModuleCard('server_info', serverInfoHasData);
  const showServerLocationCard = shouldShowModuleCard('server_location', serverLocationHasData);
  const showMailConfigCard = shouldShowModuleCard('mail_config', mailConfigHasData);
  const showRedirectsCard = shouldShowModuleCard('redirects', redirectsHasData)
    || shouldShowModuleCard('redirect_chain', redirectsHasData);

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

  if (!latestScan?.id && configuredScopeTargets.length === 0) {
    return (
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radar className="w-5 h-5 text-primary" />
            SurfaceScan Modules
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Nessuna regola in scope o scansione disponibile.</p>
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
            Vista unificata dei target in scope con stato automatico scansioni, senza interventi manuali.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Scope targets</p>
              <p className="text-sm font-medium">{scopeTargetRows.length}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Scansionati</p>
              <p className="text-sm font-medium">{scopeStatusCounters.scanned}</p>
              </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">In corso / In coda</p>
              <p className="text-sm font-medium">
                {scopeStatusCounters.running} / {scopeStatusCounters.queued}
              </p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Da avviare</p>
              <p className="text-sm font-medium">{scopeStatusCounters.notScanned}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Score medio scope</p>
              <Badge className={scoreTone(scoreSummary.overallScore)}>{scoreSummary.overallScore}/100</Badge>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Ultimo aggiornamento scope</p>
              <p className="text-xs text-foreground">
                {latestScan?.completed_at ? new Date(latestScan.completed_at).toLocaleString('it-IT') : '-'}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-border/80 bg-card/40 p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Panoramica Completa Target In Scope</p>
                <p className="text-xs text-muted-foreground">
                  Tutti i domini/IP in-scope con ultimo stato scansione, profilo e rischio.
                </p>
              </div>
              <Badge variant="secondary">{filteredScopeTargetRows.length} target visibili</Badge>
            </div>

            <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-xs text-muted-foreground">Target attivo per i controlli modulo</p>
                  <p className="text-sm font-semibold text-foreground break-all">{selectedScopeTargetRow?.label || '-'}</p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Badge variant="outline">{selectedScopeTargetRow?.profile || 'n/d'}</Badge>
                  {selectedScopeTargetRow?.status === 'not_scanned' ? (
                    <Badge variant="outline">Non scansionato</Badge>
                  ) : (
                    <Badge className={statusBadgeClass[outcomeFromJobStatus(selectedScopeTargetRow ? effectiveScopeStatus(selectedScopeTargetRow) : 'not_scanned')]}>
                      {scanStatusLabel(selectedScopeTargetRow ? effectiveScopeStatus(selectedScopeTargetRow) : 'not_scanned')}
                    </Badge>
                  )}
                  {selectedScopeTargetRow?.snapshotSource === 'last_good' && (
                    <Badge variant="secondary">Dati da ultimo snapshot valido</Badge>
                  )}
                </div>
              </div>
            </div>

            <div className="relative max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={scopeTargetSearch}
                onChange={(event) => setScopeTargetSearch(event.target.value)}
                placeholder="Cerca target in scope..."
                className="pl-9"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredScopeTargetRows.map((entry) => {
                const isSelected = selectedScopeTargetKey === entry.targetKey;
                return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setSelectedScopeTargetKey(entry.targetKey)}
                  className={`rounded-lg border p-3 space-y-2 text-left transition-colors ${
                    isSelected
                      ? 'border-primary/70 bg-primary/10 ring-1 ring-primary/30'
                      : 'border-border/70 bg-background/30 hover:bg-muted/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium break-all leading-tight">{entry.label}</p>
                    {entry.status === 'not_scanned' ? (
                      <Badge variant="outline">Non scansionato</Badge>
                    ) : (
                      <Badge className={statusBadgeClass[outcomeFromJobStatus(effectiveScopeStatus(entry))]}>
                        {scanStatusLabel(effectiveScopeStatus(entry))}
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">{entry.profile}</Badge>
                    {entry.score != null ? (
                      <Badge className={scoreTone(entry.score)}>{entry.score}/100</Badge>
                    ) : (
                      <Badge variant="outline">Score N/D</Badge>
                    )}
                    <Badge variant="outline">{formatRiskLevel(entry.riskLevel)}</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Live: {entry.liveCreatedAt ? new Date(entry.liveCreatedAt).toLocaleString('it-IT') : '-'}
                    {entry.snapshotSource === 'last_good' && entry.completedAt
                      ? ` · Snapshot dati: ${new Date(entry.completedAt).toLocaleString('it-IT')}`
                      : ''}
                  </p>
                  <p className="text-[11px] text-muted-foreground/90">
                    Stato: {scopeLiveReasonLabel(entry)}
                  </p>
                </button>
              );
              })}
            </div>

            {filteredScopeTargetRows.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Nessun target trovato con questo filtro.
              </p>
            )}
          </div>

          {selectedRiskFindings.length > 0 && (
            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-400" />
                <p className="text-sm font-medium">Risk findings prioritari (critical/high) · target attivo</p>
              </div>
              <div className="space-y-2">
                {selectedRiskFindings.slice(0, 8).map((finding, index) => {
                  const targets = extractFindingTargets(finding);
                  return (
                    <div key={`${finding.finding_type}-${index}`} className="rounded-md border border-border/70 p-2 text-sm">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={severityBadgeClass[finding.severity]}>{finding.severity}</Badge>
                        {(finding.finding_type === 'ssl_wildcard_certificate' || (finding.evidence as any)?.is_wildcard === true) && (
                          <Badge className="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30">Wildcard</Badge>
                        )}
                        <span className="font-medium">{finding.title || finding.finding_type || 'Finding'}</span>
                      </div>
                      {targets.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {targets.map((target) => (
                            <Badge key={`${finding.finding_type}-${index}-${target}`} variant="outline" className="text-[10px]">
                              {target}
                            </Badge>
                          ))}
                        </div>
                      )}
                      {finding.remediation && (
                        <p className="text-xs text-muted-foreground mt-1">{finding.remediation}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            <div hidden={!showPassesCard} className="rounded-lg border border-border p-3 space-y-3">
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
                  const source = publicSourceLabel(item?.sourceModule || 'module', 'Motore exposure');
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
                        <TooltipContent className="max-w-xs text-xs">Origine: {source}</TooltipContent>
                      </Tooltip>
                    </div>
                  );
                })}
                {passItems.length === 0 && <p className="text-xs text-muted-foreground">Nessun controllo disponibile.</p>}
              </div>
            </div>

            <div hidden={!showConnectsecureCard} className="rounded-lg border border-border p-3 space-y-4 md:col-span-2 xl:col-span-3">
              <div className="flex items-center justify-between">
                <div className="font-medium flex items-center gap-2"><Globe2 className="w-4 h-4 text-blue-400" />Servizi esposti esterni</div>
                <Badge className={statusBadgeClass[moduleOutcomes.connectsecure || 'success_no_data']}>
                  {statusLabel(moduleOutcomes.connectsecure || 'success_no_data')}
                </Badge>
              </div>
              {connectsecureOverview.hasData ? (
                <div className="space-y-4 text-xs">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                    <div className="rounded-md border border-border/70 p-2">
                      <div className="text-muted-foreground">Target IPs</div>
                      <div className="text-lg font-semibold">{connectsecureOverview.targetIps.length}</div>
                    </div>
                    <div className="rounded-md border border-border/70 p-2">
                      <div className="text-muted-foreground">Open Port/Protocol</div>
                      <div className="text-lg font-semibold">{connectsecureOverview.portsCount}</div>
                    </div>
                    <div className="rounded-md border border-border/70 p-2">
                      <div className="text-muted-foreground">Subdomains</div>
                      <div className="text-lg font-semibold">{connectsecureOverview.subdomainsCount}</div>
                    </div>
                    <div className="rounded-md border border-border/70 p-2">
                      <div className="text-muted-foreground">RAW Headers</div>
                      <div className="text-lg font-semibold">{connectsecureOverview.headerEntries.length}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <div className="rounded-md border border-border/70 p-3 space-y-2">
                      <div className="flex items-center gap-2 font-medium">
                        <MapPin className="w-3.5 h-3.5 text-blue-400" />
                        Target IP Addresses
                        <Badge variant="secondary" className="text-[10px]">{connectsecureOverview.targetIps.length}</Badge>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {connectsecureOverview.targetIps.slice(0, 8).map((ip) => (
                          <Badge key={ip} variant="outline" className="font-mono text-[11px]">
                            {ip}
                          </Badge>
                        ))}
                        {connectsecureOverview.targetIps.length === 0 && (
                          <span className="text-muted-foreground">Nessun IP target salvato.</span>
                        )}
                      </div>
                    </div>

                    <div className="rounded-md border border-border/70 p-3 space-y-2">
                      <div className="flex items-center gap-2 font-medium">
                        <Cable className="w-3.5 h-3.5 text-emerald-400" />
                        Open Port/Protocol
                        <Badge variant="secondary" className="text-[10px]">{connectsecureOverview.ports.length}</Badge>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {connectsecureOverview.ports.slice(0, 12).map((entry: Record<string, unknown>, idx: number) => {
                          const serviceLabel = openPortServiceLabel(entry);
                          const severity = severityForPort(Number(entry?.port || 0));
                          return (
                            <Badge
                              key={`${entry?.ip || entry?.host || 'port'}-${entry?.port || idx}-${entry?.protocol || 'tcp'}`}
                              variant="outline"
                              className={`text-[11px] ${severityBadgeClass[severity] || severityBadgeClass.info}`}
                            >
                              {entry?.port} - {serviceLabel}
                            </Badge>
                          );
                        })}
                        {connectsecureOverview.ports.length === 0 && (
                          <span className="text-muted-foreground">Nessuna porta aperta ricevuta dallo scanner esterno.</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {connectsecureOverview.headerEntries.length > 0 && (
                    <div className="rounded-md border border-border/70 p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 font-medium">
                          <Server className="w-3.5 h-3.5 text-sky-400" />
                          RAW Headers
                          <Badge variant="secondary" className="text-[10px]">{connectsecureOverview.headerEntries.length}</Badge>
                          {connectsecureOverview.server && (
                            <Badge variant="outline" className="text-[10px]">Server {connectsecureOverview.server}</Badge>
                          )}
                        </div>
                        {connectsecureOverview.headerEntries.length > 8 && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[11px]"
                            onClick={() => setConnectsecureHeadersExpanded((prev) => !prev)}
                          >
                            {connectsecureHeadersExpanded ? 'Riduci' : 'Mostra tutti'}
                          </Button>
                        )}
                      </div>
                      <div className="divide-y divide-border/60 rounded border border-border/50 overflow-hidden">
                        {(connectsecureHeadersExpanded
                          ? connectsecureOverview.headerEntries
                          : connectsecureOverview.headerEntries.slice(0, 8)
                        ).map((entry) => (
                          <div key={entry.name} className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-1 px-2 py-1.5">
                            <div className="font-medium text-muted-foreground">{entry.name}</div>
                            <div className="font-mono text-[11px] break-all">{entry.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {connectsecureOverview.subdomains.length > 0 && (
                    <div className="rounded-md border border-border/70 p-3 space-y-2">
                      <div className="flex items-center gap-2 font-medium">
                        <Network className="w-3.5 h-3.5 text-violet-400" />
                        Subdomains
                        <Badge variant="secondary" className="text-[10px]">{connectsecureOverview.subdomains.length}</Badge>
                      </div>
                      <div className="flex flex-wrap gap-1.5 max-h-44 overflow-auto pr-1">
                        {connectsecureOverview.subdomains.map((domain) => (
                          <Badge key={domain} variant="outline" className="text-[10px]">
                            {domain}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 text-muted-foreground">
                    <Badge variant="outline" className="text-[11px]">Assets {connectsecureOverview.assetsCount}</Badge>
                    <Badge variant="outline" className="text-[11px]">Findings {connectsecureOverview.findingsCount}</Badge>
                    <Badge variant="outline" className="text-[11px]">Observations {connectsecureOverview.observationsCount}</Badge>
                    {connectsecureSummary.hasBfs && (
                      <Badge variant="outline" className="text-[11px]">BFS depth {connectsecureSummary.maxDepth}</Badge>
                    )}
                    {connectsecureSummary.emailsFound > 0 && (
                      <Badge variant="outline" className="text-[11px]">{connectsecureSummary.emailsFound} email</Badge>
                    )}
                    {connectsecureSummary.employeesFound > 0 && (
                      <Badge variant="outline" className="text-[11px]">{connectsecureSummary.employeesFound} dipendenti</Badge>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Scanner esterno non configurato o non ancora eseguito per il target attivo.</p>
              )}
            </div>

            <div hidden={!showHttpSecurityCard} className="rounded-lg border border-border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-medium flex items-center gap-2"><Shield className="w-4 h-4" />HTTP Security</div>
                <Badge className={statusBadgeClass[httpSecurityOutcome]}>
                  {statusLabel(httpSecurityOutcome)}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground">Score: {toPercent(httpSecurity.score)} / 100</span>
                <Badge variant="outline">Grade {String(httpSecurity.grade || '-')}</Badge>
                <Badge variant="outline">HTTP {httpSecurity.statusCode ?? '-'}</Badge>
                <Badge variant="outline">OK {Number(httpHeaderSummary.ok || 0)}</Badge>
                <Badge variant="outline">Weak {Number(httpHeaderSummary.weak || 0)}</Badge>
                <Badge variant="outline">Missing {Number(httpHeaderSummary.missing || 0)}</Badge>
              </div>
              {httpHeaderTopMissing && (
                <div className="rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-100">
                  Most missing header: <span className="font-semibold">{httpHeaderTopMissing.header}</span> ({httpHeaderTopMissing.count})
                </div>
              )}
              {httpSecurityDiagnostic && (
                <div className="rounded-md border border-red-500/25 bg-red-500/10 p-2 text-xs text-red-100">
                  <div className="font-medium text-red-200">Motivo errore</div>
                  <p className="mt-1 leading-relaxed">{httpSecurityDiagnostic}</p>
                </div>
              )}
              {!httpSecurityDiagnostic && !httpSecurityEvaluated && (
                <div className="rounded-md border border-amber-500/25 bg-amber-500/10 p-2 text-xs text-amber-100">
                  Controllo HTTP Security non ancora valutato per questo target: lo stato verra aggiornato dal prossimo ciclo di scansione.
                </div>
              )}
              <div className="space-y-1.5 max-h-44 overflow-auto pr-1">
                {headerRules.map((rule) => {
                  const ok = Boolean(httpChecks[rule.key]);
                  return (
                    <Tooltip key={rule.key}>
                      <TooltipTrigger asChild>
                        <div className="flex items-center justify-between gap-2 text-xs cursor-help">
                          <span className="truncate">{rule.label}</span>
                          {!httpSecurityEvaluated ? (
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                          ) : ok ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 text-red-400" />
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs text-xs">
                        {!httpSecurityEvaluated
                          ? 'Controllo non valutabile finche il target HTTP/HTTPS non risponde correttamente.'
                          : rule.remediation}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
              {httpHeaderScannerFindings.length > 0 && (
                <div className="space-y-1 pt-1 border-t border-border/60">
                  <div className="text-[11px] font-medium text-muted-foreground">Detailed header findings</div>
                  <div className="max-h-28 overflow-auto pr-1 space-y-1">
                    {httpHeaderScannerFindings
                      .filter((entry) => String(entry?.status || '').toLowerCase() !== 'ok')
                      .slice(0, 6)
                      .map((entry, idx) => {
                        const severity = String(entry?.severity || 'low').toLowerCase();
                        return (
                          <div key={`${entry?.rule_id || entry?.header || 'hdr'}-${idx}`} className="flex items-start justify-between gap-2 text-[11px]">
                            <div className="min-w-0">
                              <p className="truncate font-medium">{String(entry?.header || entry?.rule_id || 'Header')}</p>
                              <p className="text-muted-foreground line-clamp-2">{String(entry?.note || entry?.recommendation || '-')}</p>
                            </div>
                            <Badge className={severityBadgeClass[severity] || severityBadgeClass.low}>
                              {String(entry?.status || 'weak')}
                            </Badge>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>

            <div hidden={!showDnsPostureCard} className="rounded-lg border border-border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-medium">DNS Posture</div>
                <Badge className={statusBadgeClass[dnsLookupOutcome]}>
                  {statusLabel(dnsLookupOutcome)}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground">Score: {toPercent(Number(dnsLookupSummary.score || 0))} / 100</span>
                <Badge variant="outline">Grade {String(dnsLookupSummary.grade || '-')}</Badge>
                <Badge variant="outline">SPF {dnsLookupSummary?.summary?.hasSpf ? 'OK' : 'Missing'}</Badge>
                <Badge variant="outline">DMARC {dnsLookupSummary?.summary?.hasDmarc ? 'OK' : 'Missing'}</Badge>
                <Badge variant="outline">CAA {dnsLookupSummary?.summary?.hasCaa ? 'OK' : 'Missing'}</Badge>
                <Badge variant="outline">DNSSEC {dnsLookupSummary?.summary?.hasDnssecDelegation ? 'OK' : 'Missing'}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded border border-border/70 p-2">
                  <div className="text-muted-foreground">High/Critical</div>
                  <div className="font-medium">{Number(dnsLookupSummary?.summary?.high || 0) + Number(dnsLookupSummary?.summary?.critical || 0)}</div>
                </div>
                <div className="rounded border border-border/70 p-2">
                  <div className="text-muted-foreground">Medium</div>
                  <div className="font-medium">{Number(dnsLookupSummary?.summary?.medium || 0)}</div>
                </div>
                <div className="rounded border border-border/70 p-2">
                  <div className="text-muted-foreground">Low</div>
                  <div className="font-medium">{Number(dnsLookupSummary?.summary?.low || 0)}</div>
                </div>
                <div className="rounded border border-border/70 p-2">
                  <div className="text-muted-foreground">Info</div>
                  <div className="font-medium">{Number(dnsLookupSummary?.summary?.info || 0)}</div>
                </div>
              </div>
              {dnsLookupDiagnostic && (
                <div className="rounded-md border border-red-500/25 bg-red-500/10 p-2 text-xs text-red-100">
                  <div className="font-medium text-red-200">Motivo errore</div>
                  <p className="mt-1 leading-relaxed">{dnsLookupDiagnostic}</p>
                </div>
              )}
              <div className="space-y-1 max-h-28 overflow-auto pr-1">
                {dnsLookupFindings
                  .filter((entry) => {
                    const status = String(entry?.status || '').toLowerCase();
                    return status !== 'pass' && status !== 'info';
                  })
                  .slice(0, 4)
                  .map((entry, idx) => (
                    <div key={`${entry?.id || 'dns-f'}-${idx}`} className="text-[11px] rounded border border-border/60 p-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">{String(entry?.title || entry?.id || 'Finding')}</span>
                        <Badge className={severityBadgeClass[String(entry?.severity || 'low').toLowerCase()] || severityBadgeClass.low}>
                          {String(entry?.status || 'warn')}
                        </Badge>
                      </div>
                    </div>
                  ))}
                {dnsLookupFindings.length === 0 && (
                  <p className="text-xs text-muted-foreground">Nessun finding DNS aggiuntivo disponibile.</p>
                )}
              </div>
            </div>

            <div hidden={!showDnssecCard} className="rounded-lg border border-border p-3 space-y-3">
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

            <div hidden={!showQualityCard} className="rounded-lg border border-border p-3 space-y-3">
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

            <div hidden={!showOpenPortsCard} className="rounded-lg border border-border p-3 space-y-3">
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
                      <span className="font-medium">{entry?.ip || entry?.host || '-'}:{entry?.port}</span>
                      <Badge className={severityBadgeClass[severityForPort(Number(entry?.port || 0))] || severityBadgeClass.low}>
                        {severityForPort(Number(entry?.port || 0)).toUpperCase()}
                      </Badge>
                    </div>
                    <div className="text-muted-foreground">{openPortServiceLabel(entry)}</div>
                    <div className="text-muted-foreground">Origine: {publicSourceLabel(entry?.source || entry?.raw?.source, 'Motore exposure')}</div>
                  </div>
                ))}
                {openPortRows.length === 0 && <p className="text-xs text-muted-foreground">Nessuna porta aperta disponibile.</p>}
              </div>
              {moduleOutcomes.open_ports === 'skipped_prerequisite' && (
                <p className="text-xs text-amber-300">{moduleReasonLabel(moduleSkipReasons.open_ports || '')}</p>
              )}
            </div>

            <div hidden={!showThreatsCard} className="rounded-lg border border-border p-3 space-y-3">
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

            <div hidden={!showWhoisCard} className="rounded-lg border border-border p-3 space-y-3">
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
                <div className="flex justify-between"><span>Origine</span><span>{publicSourceLabel(latestWhois.source, 'Evidenza')}</span></div>
              </div>
              {whoisUnavailableCount > 0 && moduleOutcomes.whois !== 'skipped_prerequisite' && (
                <p className="text-xs text-amber-300">RDAP temporaneamente non disponibile per WHOIS.</p>
              )}
              {moduleOutcomes.whois === 'skipped_prerequisite' && (
                <p className="text-xs text-amber-300">{moduleReasonLabel(moduleSkipReasons.whois || '')}</p>
              )}
            </div>

            <div hidden={!showSslTlsCard} className="rounded-lg border border-border p-3 space-y-3">
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

            <div hidden={!showServerInfoCard} className="rounded-lg border border-border p-3 space-y-3">
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

            <div hidden={!showServerLocationCard} className="rounded-lg border border-border p-3 space-y-3">
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
              {serverLocationCoverage === 0 && moduleOutcomes.server_location !== 'skipped_prerequisite' && (
                <p className="text-xs text-amber-300">Nessun IP in-scope geolocalizzabile disponibile.</p>
              )}
              {moduleOutcomes.server_location === 'skipped_prerequisite' && (
                <p className="text-xs text-amber-300">{moduleReasonLabel(moduleSkipReasons.server_location || '')}</p>
              )}
            </div>

            <div hidden={!showMailConfigCard} className="rounded-lg border border-border p-3 space-y-3">
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

            <div hidden={!showRedirectsCard} className="rounded-lg border border-border p-3 space-y-3">
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
                      selected_target: selectedScopeTargetRow,
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

          {selectedModuleResults.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {moduleOrder
                .filter((moduleKey) => (moduleOutcomes[moduleKey] || 'success_no_data') !== 'success_no_data')
                .map((moduleKey) => {
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
