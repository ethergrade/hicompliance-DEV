import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Database, Download, ExternalLink, Globe2, Loader2, PlayCircle, Radar, RefreshCcw, Route, ShieldAlert, Target, TerminalSquare } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from 'recharts';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useClientContext } from '@/contexts/ClientContext';
import { useToast } from '@/hooks/use-toast';
import { useUserRoles } from '@/hooks/useUserRoles';
import { adaptNucleiScan360JobToSurfaceReport } from '@/lib/nucleiScan360SurfaceReportAdapter';
import { generateSurfaceScan360Docx } from '@/lib/surfaceScan360DocxReport';
import { generateSurfaceScan360Pdf } from '@/lib/surfaceScan360PdfReport';
import { cn } from '@/lib/utils';
import {
  nucleiScan360Api,
  type NucleiJob,
  type NucleiProfile,
  type NmapProfile,
  type NucleiFinding,
  type NmapOpenPort,
  type CveMatch,
  type TechnologyFingerprint,
  type NiktoFinding,
  type ScannableTarget,
  type UnifiedVerdict,
} from '@/lib/api/nuclei-scan360';

type NucleiResult = {
  target_url?: string;
  resolved_target_url?: string;
  profile?: NucleiProfile;
  findings?: NucleiFinding[];
  warnings?: string[];
  duration_ms?: number;
  nuclei_version?: string;
  templates_loaded_count?: number;
  templates_executed_count?: number;
  debug_summary?: Record<string, unknown>;
};

type ParsedFinding = NucleiFinding & {
  id: string;
  label: string;
  severityKey: string;
  category: string;
  asset: string;
  evidence: string;
};

type ParsedNucleiResult = {
  findings: ParsedFinding[];
  riskScore: number;
  executiveTone: 'quiet' | 'watch' | 'hot';
  severityRows: Array<{ severity: string; count: number; fill: string }>;
  typeRows: Array<{ type: string; count: number; fill: string }>;
  categoryRows: Array<{ category: string; count: number }>;
  assetRows: Array<{ asset: string; count: number; severities: Record<string, number> }>;
  templateRows: Array<{ template_id: string; name: string; severity: string; count: number; category: string }>;
  warnings: string[];
  stats: {
    requests: string;
    errors: string;
    matched: string;
    percent: string;
    clustered: string;
    completed: string;
  };
};

const PROFILE_LABELS: Record<NucleiProfile, string> = {
  baseline_headers: 'Baseline headers + TLS',
  exposure_medium: 'Exposure medium',
  web_vuln_safe: 'Web vuln safe',
  web_cve_recent: 'CVE recenti',
  web_cve_2026: 'CVE 2026',
  web_cve_2025: 'CVE 2025',
  web_cve_2024: 'CVE 2024',
  web_cve_2023: 'CVE 2023',
  web_cve_2022: 'CVE 2022',
  web_vuln_authorized: 'Web vuln authorized',
};

const PROFILE_DESCRIPTIONS: Record<NucleiProfile, string> = {
  baseline_headers: 'Solo header di sicurezza e TLS basic. Profilo rapido per smoke test.',
  exposure_medium: 'Exposure, misconfiguration, file disclosure, panel e tecnologie con template non distruttivi.',
  web_vuln_safe: 'Vulnerabilità HTTP non distruttive low/medium/high/critical.',
  web_cve_recent: 'Template CVE HTTP 2022-2026, profilo LAB consigliato per validazione CVE.',
  web_cve_2026: 'Solo template CVE HTTP pubblicati nel 2026.',
  web_cve_2025: 'Solo template CVE HTTP pubblicati nel 2025.',
  web_cve_2024: 'Solo template CVE HTTP pubblicati nel 2024.',
  web_cve_2023: 'Solo template CVE HTTP pubblicati nel 2023.',
  web_cve_2022: 'Solo template CVE HTTP pubblicati nel 2022.',
  web_vuln_authorized: 'DAST/fuzz a bassa aggressività. Richiede autorizzazione esplicita.',
};

const isCveProfile = (value: NucleiProfile) => value === 'web_vuln_safe' || value.startsWith('web_cve_');

const NMAP_PROFILE_LABELS: Record<NmapProfile, string> = {
  web_top: 'Web top ports',
  tcp_top_100: 'TCP top 100',
  service_light: 'Service light',
  custom_tcp: 'Custom TCP',
};

const NMAP_PROFILE_DESCRIPTIONS: Record<NmapProfile, string> = {
  web_top: 'Porte web comuni senza script NSE.',
  tcp_top_100: 'Top 100 TCP, utile per IP pubblici.',
  service_light: 'Porte web con rilevamento servizio leggero.',
  custom_tcp: 'Riservato a chiamate API con porte esplicite.',
};

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'];
const SEVERITY_WEIGHTS: Record<string, number> = {
  critical: 40,
  high: 25,
  medium: 12,
  low: 5,
  info: 1,
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'hsl(var(--destructive))',
  high: 'hsl(var(--destructive) / 0.82)',
  medium: 'hsl(38 92% 50%)',
  low: 'hsl(47 95% 55%)',
  info: 'hsl(var(--primary))',
};

const TYPE_COLORS = [
  'hsl(var(--primary))',
  'hsl(173 80% 42%)',
  'hsl(260 65% 60%)',
  'hsl(38 92% 50%)',
  'hsl(var(--muted-foreground))',
];

const severityChartConfig = {
  count: { label: 'Finding', color: 'hsl(var(--primary))' },
} satisfies ChartConfig;

const typeChartConfig = {
  count: { label: 'Finding' },
} satisfies ChartConfig;

const severityClass = (severity?: string | null) => {
  switch (String(severity || '').toLowerCase()) {
    case 'critical': return 'bg-red-600 text-white';
    case 'high': return 'bg-red-500 text-white';
    case 'medium': return 'bg-amber-500 text-white';
    case 'low': return 'bg-yellow-400 text-slate-950';
    default: return 'bg-slate-600 text-white';
  }
};

const statusClass = (status?: string | null) => {
  switch (String(status || '').toLowerCase()) {
    case 'completed': return 'bg-green-600 text-white';
    case 'running': return 'bg-primary text-primary-foreground';
    case 'failed':
    case 'timeout': return 'bg-destructive text-destructive-foreground';
    case 'queued': return 'bg-amber-500 text-white';
    default: return 'bg-muted text-muted-foreground';
  }
};

const stageClass = (stage?: string | null) => {
  switch (String(stage || '').toLowerCase()) {
    case 'completed': return 'bg-green-600 text-white';
    case 'nmap_running':
    case 'nikto_running':
    case 'nuclei_running': return 'bg-primary text-primary-foreground';
    case 'waiting_nuclei': return 'bg-sky-600 text-white';
    case 'failed':
    case 'timeout': return 'bg-destructive text-destructive-foreground';
    case 'queued': return 'bg-amber-500 text-white';
    default: return 'bg-muted text-muted-foreground';
  }
};

const verdictClass = (level?: string | null) => {
  switch (String(level || '').toLowerCase()) {
    case 'critical': return 'bg-red-600 text-white';
    case 'elevated': return 'bg-orange-500 text-white';
    case 'watch': return 'bg-amber-500 text-white';
    case 'informational': return 'bg-sky-600 text-white';
    case 'clean': return 'bg-green-600 text-white';
    default: return 'bg-muted text-muted-foreground';
  }
};

const formatCountdown = (value?: string | null) => {
  if (!value) return '—';
  const ms = new Date(value).getTime() - Date.now();
  if (!Number.isFinite(ms)) return '—';
  if (ms <= 0) return 'pronto';
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.ceil((ms % 60000) / 1000);
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('it-IT', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(new Date(value));
  } catch { return '—'; }
};

const formatScore = (value?: number | null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(1).replace(/\.0$/, '') : '—';
};

const formatPercent = (value?: number | null) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '—';
  return `${Math.round(parsed * 1000) / 10}%`;
};

const formatEngineValue = (value: unknown) => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'si' : 'no';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '—';
  return String(value);
};

const nvdDetailUrl = (cveId: string) => `https://nvd.nist.gov/vuln/detail/${encodeURIComponent(cveId)}`;

const normalizeManualTargetToken = (value: string): string => {
  const cleaned = String(value || '').trim().replace(/^[`'"]+/, '').replace(/[`'"]+$/, '').trim();
  return /^[`'".,;\s]+$/.test(cleaned) ? '' : cleaned;
};

const isJobActive = (job?: NucleiJob | null) =>
  Boolean(job && ['queued', 'running'].includes(String(job.status || '').toLowerCase()));

const runTimestampKey = (value?: string | null) => {
  const ms = new Date(value || '').getTime();
  if (!Number.isFinite(ms)) return 'unknown';
  return new Date(Math.floor(ms / 1000) * 1000).toISOString();
};

type NucleiRunGroup = {
  key: string;
  created_at: string | null;
  profile: string;
  nmap_profile: string;
  jobs: NucleiJob[];
  completed: number;
  active: number;
  failed: number;
  targetCount: number;
};

const groupJobsByRun = (rows: NucleiJob[]): NucleiRunGroup[] => {
  const groups = new Map<string, NucleiRunGroup>();
  rows.forEach((job) => {
    const createdKey = runTimestampKey(job.created_at);
    const key = `${createdKey}|${job.profile || 'profile'}|${job.nmap_profile || 'nmap'}`;
    const group = groups.get(key) || {
      key,
      created_at: job.created_at || null,
      profile: job.profile || 'web_cve_recent',
      nmap_profile: job.nmap_profile || 'service_light',
      jobs: [],
      completed: 0,
      active: 0,
      failed: 0,
      targetCount: 0,
    };
    group.jobs.push(job);
    group.completed = group.jobs.filter((j) => j.status === 'completed').length;
    group.active = group.jobs.filter((j) => ['queued', 'running'].includes(String(j.status || '').toLowerCase())).length;
    group.failed = group.jobs.filter((j) => ['failed', 'timeout', 'cancelled'].includes(String(j.status || '').toLowerCase())).length;
    group.targetCount = new Set(group.jobs.map((j) => j.normalized_target_url || j.target_url || j.target_input || j.id)).size;
    groups.set(key, group);
  });
  return Array.from(groups.values()).sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
};

const stripTechnologyFields = <T extends Record<string, unknown>>(value: T) => {
  const { raw_technology_result: _a, technology_count: _b, ...rest } = value as any;
  return rest;
};

const clampNumber = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
};

const clampNumberInput = (value: unknown, fallback: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(0, Math.round(parsed)));
};

const safeLower = (value: unknown) => String(value || '').trim().toLowerCase();

const extractAsset = (matchedAt?: string | null) => {
  const raw = String(matchedAt || '').trim();
  if (!raw) return 'unknown';
  try { return new URL(raw).hostname || raw; }
  catch { return raw.replace(/^https?:\/\//, '').split('/')[0] || raw; }
};

const classifyFinding = (finding: NucleiFinding) => {
  const tags = (finding.tags || []).map(safeLower);
  if (tags.includes('cve')) return 'CVE';
  if (tags.includes('ssl') || tags.includes('tls')) return 'TLS/SSL';
  if (tags.includes('misconfig') || tags.includes('misconfiguration')) return 'Misconfiguration';
  if (tags.includes('exposure') || tags.includes('exposures')) return 'Exposure';
  if (tags.includes('tech') || tags.includes('technology')) return 'Technology';
  if (tags.includes('panel')) return 'Exposed panel';
  if (tags.includes('vuln')) return 'Vulnerability';
  return finding.type ? String(finding.type).toUpperCase() : 'Other';
};

const countBy = <T,>(items: T[], getKey: (item: T) => string) => {
  const out = new Map<string, number>();
  for (const item of items) {
    const key = getKey(item) || 'unknown';
    out.set(key, (out.get(key) || 0) + 1);
  }
  return Array.from(out.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
};

const parseNucleiResult = (findings: NucleiFinding[]): ParsedNucleiResult => {
  const parsedFindings: ParsedFinding[] = findings.map((finding, index) => {
    const severityKey = safeLower(finding.severity) || 'info';
    const templateId = String(finding.template_id || `finding-${index + 1}`);
    return {
      ...finding,
      id: `${templateId}-${index}`,
      label: String(finding.name || templateId),
      severityKey,
      category: classifyFinding(finding),
      asset: extractAsset(finding.matched_at),
      evidence: (finding.extracted_results || []).join('\n'),
    };
  });

  const severityRows = SEVERITY_ORDER.map((severity) => ({
    severity,
    count: parsedFindings.filter((f) => f.severityKey === severity).length,
    fill: SEVERITY_COLORS[severity],
  })).filter((row) => row.count > 0);

  const typeRows = countBy(parsedFindings, (f) => String(f.type || 'unknown')).map((row, index) => ({
    type: row.key,
    count: row.count,
    fill: TYPE_COLORS[index % TYPE_COLORS.length],
  }));

  const categoryRows = countBy(parsedFindings, (f) => f.category).slice(0, 8).map((row) => ({ category: row.key, count: row.count }));

  const assetRows = countBy(parsedFindings, (f) => f.asset).slice(0, 8).map((row) => ({
    asset: row.key,
    count: row.count,
    severities: parsedFindings
      .filter((f) => f.asset === row.key)
      .reduce<Record<string, number>>((acc, f) => {
        acc[f.severityKey] = (acc[f.severityKey] || 0) + 1;
        return acc;
      }, {}),
  }));

  const templateRows = countBy(parsedFindings, (f) => String(f.template_id || 'unknown')).slice(0, 10).map((row) => {
    const sample = parsedFindings.find((f) => f.template_id === row.key);
    return {
      template_id: row.key,
      name: sample?.label || row.key,
      severity: sample?.severityKey || 'info',
      count: row.count,
      category: sample?.category || 'Other',
    };
  });

  const riskScore = Math.min(100, parsedFindings.reduce((score, f) => score + (SEVERITY_WEIGHTS[f.severityKey] || 1), 0));

  return {
    findings: parsedFindings.sort((a, b) => {
      const d = SEVERITY_ORDER.indexOf(a.severityKey) - SEVERITY_ORDER.indexOf(b.severityKey);
      return d || a.category.localeCompare(b.category) || a.label.localeCompare(b.label);
    }),
    riskScore,
    executiveTone: riskScore >= 50 ? 'hot' : riskScore >= 15 ? 'watch' : 'quiet',
    severityRows,
    typeRows,
    categoryRows,
    assetRows,
    templateRows,
    warnings: [],
    stats: { requests: '—', errors: '0', matched: String(parsedFindings.length || '0'), percent: '—', clustered: '—', completed: '—' },
  };
};

const engineStatusMeta = (
  engine: 'nmap' | 'httpx' | 'nikto' | 'nuclei' | 'report',
  job?: NucleiJob | null,
): { label: string; progress: number; className: string; detail: string } => {
  if (!job) return { label: 'In attesa', progress: 0, className: 'bg-muted text-muted-foreground', detail: 'Nessun job selezionato' };
  const stage = String(job.stage || job.status || '').toLowerCase();
  const done = { label: 'Completato', progress: 100, className: 'bg-green-600 text-white' };
  const running = { label: 'In corso', progress: 65, className: 'bg-primary text-primary-foreground' };
  const queued = { label: 'In coda', progress: 25, className: 'bg-amber-500 text-white' };
  const failed = { label: 'Errore', progress: 100, className: 'bg-destructive text-destructive-foreground' };
  if (['failed', 'timeout', 'cancelled'].includes(stage)) return { ...failed, detail: job.last_error || 'Stage interrotto' };

  if (engine === 'nmap') {
    if (job.nmap_status === 'completed' || ['nikto_running', 'waiting_nuclei', 'nuclei_running', 'completed'].includes(stage))
      return { ...done, detail: `${job.open_port_count ?? 0} porte · ${job.nmap_version || 'nmap'}` };
    if (stage === 'nmap_running') return { ...running, detail: 'Nmap + service detection' };
    return { ...queued, detail: 'Primo motore della pipeline' };
  }
  if (engine === 'httpx') {
    if (job.fingerprint_status || ['nikto_running', 'waiting_nuclei', 'nuclei_running', 'completed'].includes(stage))
      return { ...done, detail: `${job.technology_count ?? 0} tecnologie · ${job.fingerprint_status || 'done'}` };
    if (stage === 'nmap_running') return { ...running, detail: 'Safe HTTP fingerprint' };
    return { ...queued, detail: 'Dopo rilevamento porte web' };
  }
  if (engine === 'nikto') {
    if (job.nikto_status && !['queued', 'running'].includes(String(job.nikto_status).toLowerCase()))
      return { ...done, detail: `${job.nikto_findings_count ?? 0} finding · ${job.nikto_version || 'Nikto'}` };
    if (stage === 'nikto_running') return { ...running, detail: 'Nikto safe LAB sui target web' };
    if (['waiting_nuclei', 'nuclei_running', 'completed'].includes(stage))
      return { ...done, detail: `${job.nikto_findings_count ?? 0} finding` };
    return { ...queued, detail: 'Dopo Nmap/httpx' };
  }
  if (engine === 'nuclei') {
    if (stage === 'completed') return { ...done, detail: `${job.findings_count ?? 0} finding · ${job.templates_executed_count ?? 0} template` };
    if (stage === 'nuclei_running') return { ...running, detail: 'Template CVE/exposure in esecuzione' };
    if (stage === 'waiting_nuclei') return { ...queued, progress: 50, detail: `Finestra safe: ${formatCountdown(job.next_run_at)}` };
    return { ...queued, detail: 'Parte dopo Nikto e attesa persistita' };
  }
  if (stage === 'completed') return { ...done, detail: `Verdetto ${job.unified_verdict?.level || 'calcolato'} · PDF/DOCX pronti` };
  return { ...queued, detail: 'Pronto quando i motori finiscono' };
};

const NucleiScan360: React.FC = () => {
  const { isSuperAdmin, loading: rolesLoading } = useUserRoles();
  const { selectedOrganization, organizations, isLoadingClients } = useClientContext();
  const { toast } = useToast();

  const groupId = selectedOrganization?.group_id ?? null;

  const [targetUrl, setTargetUrl] = useState('');
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [includeSurfaceAssets, setIncludeSurfaceAssets] = useState(true);
  const [scannableTargets, setScannableTargets] = useState<ScannableTarget[]>([]);
  const [selectedTargetUrls, setSelectedTargetUrls] = useState<string[]>([]);
  const [targetsLoading, setTargetsLoading] = useState(false);
  const [nmapProfile, setNmapProfile] = useState<NmapProfile>('service_light');
  const [profile, setProfile] = useState<NucleiProfile>('web_cve_recent');
  const [authorizedScan, setAuthorizedScan] = useState(false);
  const [timeoutSeconds, setTimeoutSeconds] = useState(150);
  const [rateLimit, setRateLimit] = useState(3);
  const [maxFindings, setMaxFindings] = useState(50);
  const [loading, setLoading] = useState(false);
  const [queueLoading, setQueueLoading] = useState(false);
  const [processingQueue, setProcessingQueue] = useState(false);
  const [smokeLoading, setSmokeLoading] = useState(false);
  const [jobs, setJobs] = useState<NucleiJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [selectedJob, setSelectedJob] = useState<NucleiJob | null>(null);
  const [openPorts, setOpenPorts] = useState<NmapOpenPort[]>([]);
  const [technologies, setTechnologies] = useState<TechnologyFingerprint[]>([]);
  const [niktoFindings, setNiktoFindings] = useState<NiktoFinding[]>([]);
  const [cveMatches, setCveMatches] = useState<CveMatch[]>([]);
  const [nucleiFindings, setNucleiFindings] = useState<NucleiFinding[]>([]);
  const [rawResult, setRawResult] = useState('');
  const [reportExporting, setReportExporting] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const analysis = useMemo(() => parseNucleiResult(nucleiFindings), [nucleiFindings]);
  const findings = analysis.findings;

  const selectedOrganizationName = useMemo(
    () => organizations.find((o) => o.id === selectedOrgId)?.name || selectedOrganization?.name || 'Cliente non selezionato',
    [organizations, selectedOrgId, selectedOrganization?.name],
  );

  const selectedTargetSet = useMemo(() => new Set(selectedTargetUrls), [selectedTargetUrls]);
  const runGroups = useMemo(() => groupJobsByRun(jobs), [jobs]);

  const confirmedCveMatches = useMemo(() => cveMatches.filter((m) => (m.match_status || 'confirmed') === 'confirmed'), [cveMatches]);
  const potentialCveMatches = useMemo(() => cveMatches.filter((m) => m.match_status === 'potential'), [cveMatches]);
  const unifiedVerdict: UnifiedVerdict | null = selectedJob?.unified_verdict || null;

  useEffect(() => {
    if (!selectedOrgId && selectedOrganization?.id) setSelectedOrgId(selectedOrganization.id);
    else if (!selectedOrgId && organizations[0]?.id) setSelectedOrgId(organizations[0].id);
  }, [organizations, selectedOrgId, selectedOrganization?.id]);

  const refreshJobs = useCallback(async () => {
    if (!isSuperAdmin) return;
    setQueueLoading(true);
    try {
      const res = await nucleiScan360Api.listJobs(undefined, groupId);
      setJobs(res.data || []);
      setLastError(null);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Coda NucleiScan360 non disponibile';
      setLastError(msg);
      toast({ title: 'Coda NucleiScan360 non disponibile', description: msg, variant: 'destructive' });
    } finally {
      setQueueLoading(false);
    }
  }, [isSuperAdmin, groupId, toast]);

  const fetchScannableTargets = useCallback(async () => {
    if (!isSuperAdmin) return;
    setTargetsLoading(true);
    try {
      const res = await nucleiScan360Api.getTargets({ limit: 80 }, groupId);
      const targets = res.targets || [];
      setScannableTargets(targets);
      if (includeSurfaceAssets) setSelectedTargetUrls(targets.slice(0, 25).map((t) => t.target_url));
      setLastError(null);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Target repository non disponibile';
      setLastError(msg);
      setScannableTargets([]);
      toast({ title: 'Target repository non disponibile', description: msg, variant: 'destructive' });
    } finally {
      setTargetsLoading(false);
    }
  }, [isSuperAdmin, groupId, includeSurfaceAssets, toast]);

  useEffect(() => {
    if (isSuperAdmin) {
      refreshJobs();
      fetchScannableTargets();
    }
  }, [isSuperAdmin, fetchScannableTargets, refreshJobs]);

  const targetList = useMemo(
    () => Array.from(new Set([
      ...targetUrl.split(/[\n,;]+/).map(normalizeManualTargetToken).filter(Boolean),
      ...selectedTargetUrls,
    ])),
    [selectedTargetUrls, targetUrl],
  );

  const toggleTargetSelection = (targetUrlValue: string, checked: boolean) => {
    setSelectedTargetUrls((current) => {
      const next = new Set(current);
      if (checked) next.add(targetUrlValue);
      else next.delete(targetUrlValue);
      return Array.from(next);
    });
  };

  const openJob = useCallback(async (job: NucleiJob) => {
    setSelectedJobId(job.id);
    setSelectedJob(job);
    setOpenPorts([]);
    setTechnologies([]);
    setNiktoFindings([]);
    setCveMatches([]);
    setNucleiFindings([]);
    setQueueLoading(true);
    try {
      const detail = await nucleiScan360Api.getJobDetail(job.id, groupId);
      setSelectedJob(detail.job);
      setOpenPorts(detail.open_ports || []);
      setTechnologies(detail.technologies || []);
      setNiktoFindings(detail.nikto_findings || []);
      setCveMatches(detail.cve_matches || []);
      setNucleiFindings(detail.findings || []);
      setRawResult(JSON.stringify(detail, null, 2));
      setLastError(null);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Apertura job fallita';
      setLastError(msg);
      toast({ title: 'Apertura job fallita', description: msg, variant: 'destructive' });
    } finally {
      setQueueLoading(false);
    }
  }, [groupId, toast]);

  const fetchJobDetail = async (job: NucleiJob) => {
    const detail = await nucleiScan360Api.getJobDetail(job.id, groupId);
    return {
      job: detail.job,
      open_ports: detail.open_ports || [],
      cve_matches: detail.cve_matches || [],
      nikto_findings: detail.nikto_findings || [],
      nuclei_findings: detail.findings || [],
    };
  };

  useEffect(() => {
    if (!isSuperAdmin) return;
    const hasActive = jobs.some((j) => isJobActive(j)) || isJobActive(selectedJob);
    if (!hasActive) return;
    const timer = window.setInterval(async () => {
      await refreshJobs();
      if (selectedJobId) {
        const latest = jobs.find((j) => j.id === selectedJobId);
        if (latest) await openJob(latest);
      }
    }, 15000);
    return () => window.clearInterval(timer);
  }, [isSuperAdmin, jobs, refreshJobs, selectedJob, selectedJobId, openJob]);

  const startLabScan = async () => {
    const safeTimeout = clampNumber(timeoutSeconds, profile === 'baseline_headers' ? 45 : isCveProfile(profile) ? 150 : 120, 15, 180);
    const safeRate = clampNumber(rateLimit, profile === 'web_vuln_authorized' ? 2 : isCveProfile(profile) ? 3 : 5, 1, profile === 'web_vuln_authorized' ? 2 : 10);
    const safeMax = clampNumber(maxFindings, isCveProfile(profile) ? 50 : 25, 1, 200);
    if (safeTimeout !== timeoutSeconds) setTimeoutSeconds(safeTimeout);
    if (safeRate !== rateLimit) setRateLimit(safeRate);
    if (safeMax !== maxFindings) setMaxFindings(safeMax);

    setLoading(true);
    try {
      const data = await nucleiScan360Api.batchCreateJobs({
        targets: targetList.length > 0 ? targetList : undefined,
        include_surface_assets: includeSurfaceAssets && selectedTargetUrls.length === 0,
        include_discovered_targets: includeSurfaceAssets,
        surface_asset_limit: 25,
        profile,
        nmap_profile: nmapProfile,
        authorized_scan: authorizedScan,
        timeout_seconds: safeTimeout,
        rate_limit: safeRate,
        max_findings: safeMax,
      }, groupId);

      toast({
        title: 'LAB Scan360 avviato',
        description: `${data.queued_count || 0} target in pipeline. Duplicati saltati: ${data.skipped_duplicates || 0}.`,
      });

      if (Array.isArray(data.jobs) && data.jobs.length > 0) {
        setJobs(data.jobs);
        const firstJob = data.jobs.find((j) => isJobActive(j)) || data.jobs[0];
        if (firstJob) await openJob(firstJob);
      }
      await refreshJobs();
      setLastError(null);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'LAB Scan360 start errore';
      setLastError(msg);
      toast({ title: 'LAB Scan360 start errore', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const processNextJob = async () => {
    setProcessingQueue(true);
    try {
      const data = await nucleiScan360Api.processQueue({ limit: 1 }, groupId);
      const processed = data.processed?.[0];
      toast({
        title: processed ? `Job ${processed.stage || processed.status}` : 'Nessun job in coda',
        description: data.remaining_hint > 0 ? `${data.remaining_hint} job rimanenti in coda.` : 'La coda è vuota.',
      });
      await refreshJobs();
      if (selectedJobId) {
        const latest = jobs.find((j) => j.id === selectedJobId);
        if (latest) await openJob(latest);
      }
      setLastError(null);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Processamento coda fallito';
      setLastError(msg);
      toast({ title: 'Processamento coda fallito', description: msg, variant: 'destructive' });
    } finally {
      setProcessingQueue(false);
    }
  };

  const runSmokeTest = async () => {
    setSmokeLoading(true);
    try {
      const data = await nucleiScan360Api.smokeTest({ include_discovered_targets: true }, groupId);
      setRawResult(JSON.stringify(data, null, 2));
      toast({
        title: data.ok ? 'Smoke test OK' : 'Smoke test con warning',
        description: `check=${data.checks?.filter((c) => c.ok).length || 0}/${data.checks?.length || 0} · ${data.duration_ms}ms`,
        variant: data.ok ? 'default' : 'destructive',
      });
      setLastError(null);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Smoke test fallito';
      setLastError(msg);
      toast({ title: 'Smoke test fallito', description: msg, variant: 'destructive' });
    } finally {
      setSmokeLoading(false);
    }
  };

  const buildSelectedSurfaceReport = () => {
    if (!selectedJob) return null;
    return adaptNucleiScan360JobToSurfaceReport({
      organizationId: selectedOrgId || selectedJob.organization_id,
      organizationName: selectedOrganizationName,
      job: selectedJob,
      openPorts,
      technologies: [],
      niktoFindings,
      cveMatches,
      nucleiFindings: findings,
      nucleiResult: null,
    });
  };

  const downloadSelectedJobJsonReport = () => {
    if (!selectedJob) return;
    const payload = {
      report_type: 'nuclei_scan360_lab_job',
      generated_at: new Date().toISOString(),
      organization: { id: selectedOrgId || selectedJob.organization_id, name: selectedOrganizationName },
      job: stripTechnologyFields(selectedJob as unknown as Record<string, unknown>),
      unified_verdict: selectedJob.unified_verdict || null,
      open_ports: openPorts,
      nikto_findings: niktoFindings,
      cve_matches: cveMatches,
      nuclei_findings: findings,
      interpretation: {
        confirmed_cve_count: confirmedCveMatches.length,
        potential_cve_count: potentialCveMatches.length,
        nikto_finding_count: niktoFindings.length,
        open_port_count: openPorts.length,
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `NUCLEI_SCAN360_${selectedJob.target_host || selectedJob.target_input || 'job'}_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    toast({ title: 'Report esportato', description: 'Report JSON NUCLEI-SCAN360 generato.' });
  };

  const downloadSelectedJobPdfReport = () => {
    const report = buildSelectedSurfaceReport();
    if (!report) return;
    setReportExporting('pdf');
    try {
      generateSurfaceScan360Pdf(report);
      toast({ title: 'Report PDF generato' });
    } catch (error) {
      toast({ title: 'Export PDF fallito', description: error instanceof Error ? error.message : 'Errore', variant: 'destructive' });
    } finally {
      setReportExporting(null);
    }
  };

  const downloadSelectedJobDocxReport = async () => {
    const report = buildSelectedSurfaceReport();
    if (!report) return;
    setReportExporting('docx');
    try {
      await generateSurfaceScan360Docx(report);
      toast({ title: 'Report DOCX generato' });
    } catch (error) {
      toast({ title: 'Export DOCX fallito', description: error instanceof Error ? error.message : 'Errore', variant: 'destructive' });
    } finally {
      setReportExporting(null);
    }
  };

  const buildRunReportData = async (group: NucleiRunGroup) => {
    const details = await Promise.all(group.jobs.map(fetchJobDetail));
    const runJobs = details.map((d) => stripTechnologyFields(d.job as unknown as Record<string, unknown>));
    const representative: any = {
      ...runJobs[0],
      id: group.key,
      target_input: `Run ${formatDateTime(group.created_at)} (${group.targetCount} target)`,
      target_url: `run:${group.key}`,
      status: group.failed > 0 ? 'completed' : group.active > 0 ? 'running' : 'completed',
      stage: group.active > 0 ? 'running' : 'completed',
      created_at: group.created_at || runJobs[0]?.created_at,
      completed_at: runJobs.map((j: any) => j.completed_at).filter(Boolean).sort().at(-1) || null,
    };
    const openPortsAll = details.flatMap((d) => d.open_ports);
    const niktoAll = details.flatMap((d) => d.nikto_findings);
    const cveAll = details.flatMap((d) => d.cve_matches);
    const nucleiFindingsAll = details.flatMap((d) => d.nuclei_findings);
    return {
      details,
      runJobs,
      report: adaptNucleiScan360JobToSurfaceReport({
        organizationId: selectedOrgId,
        organizationName: selectedOrganizationName,
        job: representative,
        runJobs,
        openPorts: openPortsAll,
        technologies: [],
        niktoFindings: niktoAll,
        cveMatches: cveAll,
        nucleiFindings: nucleiFindingsAll,
        nucleiResult: null,
      }),
      json: {
        report_type: 'nuclei_scan360_lab_run',
        generated_at: new Date().toISOString(),
        organization: { id: selectedOrgId, name: selectedOrganizationName },
        run: { key: group.key, created_at: group.created_at, target_count: group.targetCount, job_count: group.jobs.length, completed: group.completed, active: group.active, failed: group.failed },
        jobs: runJobs,
        open_ports: openPortsAll,
        nikto_findings: niktoAll,
        cve_matches: cveAll,
        nuclei_findings: nucleiFindingsAll,
      },
    };
  };

  const downloadRunJsonReport = async (group: NucleiRunGroup) => {
    setReportExporting(`json:${group.key}`);
    try {
      const data = await buildRunReportData(group);
      const blob = new Blob([JSON.stringify(data.json, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `NUCLEI_SCAN360_RUN_${runTimestampKey(group.created_at).replace(/[:.]/g, '-')}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast({ title: 'Report run esportato' });
    } catch (error) {
      toast({ title: 'Export run JSON fallito', description: error instanceof Error ? error.message : 'Errore', variant: 'destructive' });
    } finally {
      setReportExporting(null);
    }
  };

  const downloadRunPdfReport = async (group: NucleiRunGroup) => {
    setReportExporting(`pdf:${group.key}`);
    try {
      const data = await buildRunReportData(group);
      generateSurfaceScan360Pdf(data.report);
      toast({ title: 'Report run PDF generato' });
    } catch (error) {
      toast({ title: 'Export run PDF fallito', description: error instanceof Error ? error.message : 'Errore', variant: 'destructive' });
    } finally {
      setReportExporting(null);
    }
  };

  const downloadRunDocxReport = async (group: NucleiRunGroup) => {
    setReportExporting(`docx:${group.key}`);
    try {
      const data = await buildRunReportData(group);
      await generateSurfaceScan360Docx(data.report);
      toast({ title: 'Report run DOCX generato' });
    } catch (error) {
      toast({ title: 'Export run DOCX fallito', description: error instanceof Error ? error.message : 'Errore', variant: 'destructive' });
    } finally {
      setReportExporting(null);
    }
  };

  const renderCveRows = (matches: CveMatch[], emptyLabel: string) => (
    matches.length === 0 ? (
      <TableRow>
        <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">{emptyLabel}</TableCell>
      </TableRow>
    ) : matches.map((match) => (
      <TableRow key={`${match.id || match.cve_id}-${match.match_status || 'confirmed'}-${match.asset_host || match.cpe || ''}`}>
        <TableCell>
          <div className="flex flex-col gap-1">
            <a href={nvdDetailUrl(match.cve_id)} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-1 font-medium text-primary hover:underline">
              {match.cve_id}
              <ExternalLink className="h-3 w-3" />
            </a>
            <div className="flex flex-wrap gap-1">
              <Badge variant={match.match_status === 'potential' ? 'outline' : 'secondary'}>
                {match.match_status === 'potential' ? 'potential' : 'confirmed'}
              </Badge>
              {match.confidence && <Badge variant="outline">{match.confidence}</Badge>}
              {match.source && <Badge variant="outline">{match.source}</Badge>}
            </div>
          </div>
        </TableCell>
        <TableCell className="max-w-[220px]">
          <div className="flex flex-col gap-1">
            <span className="truncate font-mono text-xs">{match.asset_host || match.matched_at || '—'}</span>
            {match.cpe && <span className="line-clamp-2 font-mono text-[11px] text-muted-foreground">{match.cpe}</span>}
          </div>
        </TableCell>
        <TableCell>
          <div className="flex flex-col gap-1">
            <Badge className={severityClass(match.severity)}>{match.severity || 'info'}</Badge>
            {match.nvd_status && <span className="text-xs text-muted-foreground">{match.nvd_status}</span>}
          </div>
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">
          <div className="flex flex-col gap-1">
            <span>CVSS {formatScore(match.cvss_score)}{match.cvss_version ? ` v${match.cvss_version}` : ''}</span>
            <span>EPSS {formatPercent(match.epss_score)}{match.kev_known_exploited ? ' · KEV' : ''}</span>
          </div>
        </TableCell>
        <TableCell className="max-w-[320px]">
          <div className="line-clamp-3 text-xs text-muted-foreground">{match.description || '—'}</div>
        </TableCell>
      </TableRow>
    ))
  );

  const renderTechnologyRows = () => (
    technologies.length === 0 ? (
      <TableRow>
        <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
          Nessuna tecnologia rilevata da httpx/Wappalyzer per questo job.
        </TableCell>
      </TableRow>
    ) : technologies.map((tech) => {
      const evidence = tech.evidence || {};
      const evidenceLine = [
        (evidence as any).status_code ? `HTTP ${(evidence as any).status_code}` : '',
        (evidence as any).webserver ? `server ${(evidence as any).webserver}` : '',
        (evidence as any).title ? `title ${String((evidence as any).title).slice(0, 64)}` : '',
      ].filter(Boolean).join(' · ');
      return (
        <TableRow key={`${tech.id || tech.name}-${tech.url || tech.port}`}>
          <TableCell>
            <div className="flex flex-col gap-1">
              <span className="font-medium">{tech.name || '—'}</span>
              <span className="text-xs text-muted-foreground">{tech.version || 'versione non rilevata'}</span>
            </div>
          </TableCell>
          <TableCell>
            <div className="flex flex-wrap gap-1">
              {tech.source && <Badge variant="outline">{tech.source}</Badge>}
              {tech.confidence && <Badge variant={tech.confidence === 'medium' ? 'secondary' : 'outline'}>{tech.confidence}</Badge>}
            </div>
          </TableCell>
          <TableCell className="max-w-[240px]">
            <div className="flex flex-col gap-1">
              <span className="truncate font-mono text-xs">{tech.url || tech.asset_host || '—'}</span>
              {tech.port && <span className="text-xs text-muted-foreground">porta {tech.port}</span>}
            </div>
          </TableCell>
          <TableCell className="max-w-[260px]">
            {(tech.cpe_candidates || []).length === 0 ? (
              <span className="text-xs text-muted-foreground">CPE non generato senza versione concreta</span>
            ) : tech.cpe_candidates?.map((cpe) => (
              <span key={cpe} className="line-clamp-2 font-mono text-[11px] text-muted-foreground">{cpe}</span>
            ))}
          </TableCell>
          <TableCell className="max-w-[260px]">
            <div className="line-clamp-3 text-xs text-muted-foreground">{evidenceLine || '—'}</div>
          </TableCell>
        </TableRow>
      );
    })
  );

  const renderNiktoRows = () => (
    niktoFindings.length === 0 ? (
      <TableRow>
        <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
          Nessun finding Nikto salvato per questo job.
        </TableCell>
      </TableRow>
    ) : niktoFindings.map((finding) => (
      <TableRow key={`${finding.id || finding.nikto_id}-${finding.target_url || finding.uri}`}>
        <TableCell>
          <div className="flex flex-col gap-1">
            <Badge className={severityClass(finding.severity)}>{finding.severity || 'info'}</Badge>
            {finding.nikto_id && <span className="font-mono text-xs text-muted-foreground">{finding.nikto_id}</span>}
          </div>
        </TableCell>
        <TableCell>
          <div className="flex flex-col gap-1">
            <span className="font-medium">{finding.category || 'web_exposure'}</span>
            <span className="text-xs text-muted-foreground">{finding.method || 'GET'} · {finding.tls ? 'TLS' : 'HTTP'}</span>
          </div>
        </TableCell>
        <TableCell className="max-w-[260px]">
          <div className="flex flex-col gap-1">
            <span className="truncate font-mono text-xs">{finding.target_url || finding.asset_host || '—'}</span>
            <span className="truncate font-mono text-xs text-muted-foreground">{finding.uri || '/'}</span>
          </div>
        </TableCell>
        <TableCell className="max-w-[380px]">
          <div className="line-clamp-3 text-xs text-muted-foreground">{finding.message || '—'}</div>
        </TableCell>
        <TableCell className="max-w-[240px]">
          {(finding.references || []).length === 0 ? (
            <span className="text-xs text-muted-foreground">—</span>
          ) : finding.references?.slice(0, 3).map((ref) => (
            <span key={ref} className="truncate font-mono text-[11px] text-muted-foreground block">{ref}</span>
          ))}
        </TableCell>
      </TableRow>
    ))
  );

  if (rolesLoading || isLoadingClients) {
    return (
      <DashboardLayout>
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!isSuperAdmin) {
    return (
      <DashboardLayout>
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Accesso riservato</AlertTitle>
          <AlertDescription>NUCLEI-SCAN360 è disponibile solo ai super admin.</AlertDescription>
        </Alert>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        <div className="overflow-hidden rounded-2xl border bg-gradient-to-br from-card via-muted/20 to-background p-6 shadow-lg">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-primary/10 p-3 text-primary ring-1 ring-primary/20">
                <Radar className="h-6 w-6" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-3xl font-bold tracking-tight text-foreground">NUCLEI-SCAN360</h1>
                  <Badge variant="outline">Super Admin Lab</Badge>
                </div>
                <p className="text-muted-foreground">LAB multi-engine con Nmap/httpx, Nikto e Nuclei, reportizzato nel formato SurfaceScan360.</p>
              </div>
            </div>
            <div>
              <Badge className={cn('px-3 py-1 text-sm', analysis.executiveTone === 'hot' ? 'bg-destructive text-destructive-foreground' : analysis.executiveTone === 'watch' ? 'bg-amber-500 text-white' : 'bg-primary text-primary-foreground')}>
                Risk signal {analysis.riskScore}/100
              </Badge>
            </div>
          </div>
        </div>

        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Uso controllato</AlertTitle>
          <AlertDescription>
            I profili pubblici escludono tag DoS, bruteforce, intrusive e destructive. Il profilo DAST/fuzz richiede `authorized_scan=true`.
          </AlertDescription>
        </Alert>

        <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
          <Card className="border-primary/20 bg-card/95">
            <CardHeader>
              <CardTitle>Accoda scansioni</CardTitle>
              <CardDescription>Seleziona un cliente, aggiungi target manuali e pesca domini da SurfaceScan360.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label>Cliente</Label>
                <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {organizations.map((org) => (
                      <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Ogni job viene salvato e correlato a questo cliente.</p>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="target_url">Target manuali</Label>
                <Textarea
                  id="target_url"
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  className="min-h-20"
                  placeholder="hisolution.it, etruriaretail.it, 203.0.113.10 oppure 203.0.113.0/28"
                />
                <p className="text-xs text-muted-foreground">Puoi separare più IP, domini, CIDR pubblici o URL con virgole o nuove righe.</p>
              </div>

              <div className="flex items-start gap-3 rounded-lg border p-3">
                <Checkbox
                  id="include_surface_assets"
                  checked={includeSurfaceAssets}
                  onCheckedChange={(checked) => {
                    const enabled = checked === true;
                    setIncludeSurfaceAssets(enabled);
                    setSelectedTargetUrls(enabled ? scannableTargets.slice(0, 25).map((t) => t.target_url) : []);
                  }}
                />
                <div className="flex flex-col gap-1">
                  <Label htmlFor="include_surface_assets">Includi target già noti</Label>
                  <p className="text-xs text-muted-foreground">Da anagrafica, SurfaceScan360 e DarkRisk quando presenti.</p>
                </div>
              </div>

              <Card className="bg-muted/20">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-sm">Target recuperati</CardTitle>
                      <CardDescription className="text-xs">
                        {selectedTargetUrls.length} selezionati su {scannableTargets.length} disponibili.
                      </CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={fetchScannableTargets} disabled={targetsLoading}>
                      {targetsLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                      Get
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="flex max-h-72 flex-col gap-2 overflow-auto">
                  {targetsLoading ? (
                    <div className="flex items-center gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Recupero IP, domini e CIDR cliente...
                    </div>
                  ) : scannableTargets.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                      Nessun IP, dominio o CIDR scansionabile trovato. Inserisci un target manuale o verifica SurfaceScan360/DarkRisk.
                    </div>
                  ) : scannableTargets.map((target) => (
                    <label key={target.target_url} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-muted/40">
                      <Checkbox
                        checked={selectedTargetSet.has(target.target_url)}
                        onCheckedChange={(checked) => toggleTargetSelection(target.target_url, checked === true)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Globe2 className="h-4 w-4 text-primary" />
                          <span className="truncate font-mono text-xs">{target.host}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          <Badge variant="outline">{target.kind}</Badge>
                          <Badge variant="secondary">{target.source}</Badge>
                          <Badge variant={target.confidence === 'high' ? 'default' : 'outline'}>{target.confidence}</Badge>
                        </div>
                      </div>
                    </label>
                  ))}
                </CardContent>
              </Card>

              <div className="flex flex-col gap-2">
                <Label>Profilo Nmap</Label>
                <Select value={nmapProfile} onValueChange={(v) => setNmapProfile(v as NmapProfile)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(NMAP_PROFILE_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{NMAP_PROFILE_DESCRIPTIONS[nmapProfile]}</p>
              </div>

              <div className="flex flex-col gap-2">
                <Label>Profilo Nuclei</Label>
                <Select value={profile} onValueChange={(v) => setProfile(v as NucleiProfile)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PROFILE_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{PROFILE_DESCRIPTIONS[profile]}</p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="timeout_seconds">Timeout</Label>
                  <Input id="timeout_seconds" type="number" min={15} max={180} value={timeoutSeconds}
                    onChange={(e) => setTimeoutSeconds(clampNumberInput(e.target.value, timeoutSeconds, 180))}
                    onBlur={() => setTimeoutSeconds((v) => clampNumber(v, 180, 15, 180))}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="rate_limit">Rate</Label>
                  <Input id="rate_limit" type="number" min={1} max={10} value={rateLimit}
                    onChange={(e) => setRateLimit(Number(e.target.value))}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="max_findings">Max</Label>
                  <Input id="max_findings" type="number" min={1} max={200} value={maxFindings}
                    onChange={(e) => setMaxFindings(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-lg border p-3">
                <Checkbox id="authorized_scan" checked={authorizedScan} onCheckedChange={(c) => setAuthorizedScan(c === true)} />
                <div className="flex flex-col gap-1">
                  <Label htmlFor="authorized_scan">Target autorizzato</Label>
                  <p className="text-xs text-muted-foreground">Necessario solo per `web_vuln_authorized`; mantiene rate limit massimo 2.</p>
                </div>
              </div>

              <Button className="w-full" onClick={startLabScan} disabled={loading || (!targetList.length && !includeSurfaceAssets)}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}
                Avvia LAB Scan360
              </Button>
              <Button className="w-full" variant="secondary" onClick={processNextJob} disabled={processingQueue}>
                {processingQueue ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
                Processa prossimo stage
              </Button>
              <Button className="w-full" variant="outline" onClick={runSmokeTest} disabled={smokeLoading}>
                {smokeLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TerminalSquare className="mr-2 h-4 w-4" />}
                Smoke test Nuclei
              </Button>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-6">
            <div className="grid gap-4 md:grid-cols-4">
              <Card className="bg-gradient-to-br from-card to-muted/20">
                <CardHeader className="pb-2">
                  <CardDescription>Versione</CardDescription>
                  <CardTitle>{selectedJob?.nuclei_version || '—'}</CardTitle>
                </CardHeader>
              </Card>
              <Card className="bg-gradient-to-br from-card to-muted/20">
                <CardHeader className="pb-2">
                  <CardDescription>Template</CardDescription>
                  <CardTitle>{selectedJob?.templates_executed_count ?? '—'}</CardTitle>
                </CardHeader>
              </Card>
              <Card className="bg-gradient-to-br from-card to-muted/20">
                <CardHeader className="pb-2">
                  <CardDescription>Finding</CardDescription>
                  <CardTitle>{findings.length}</CardTitle>
                </CardHeader>
              </Card>
              <Card className="bg-gradient-to-br from-card to-muted/20">
                <CardHeader className="pb-2">
                  <CardDescription>Durata</CardDescription>
                  <CardTitle>{selectedJob?.duration_ms ? `${Math.round(selectedJob.duration_ms / 1000)}s` : '—'}</CardTitle>
                </CardHeader>
              </Card>
            </div>

            <Card className="border-primary/20">
              <CardHeader>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <CardTitle>Coda NUCLEI-SCAN360</CardTitle>
                    <CardDescription>Job LAB Nmap/httpx/Nikto/Nuclei per tutti i clienti.</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={refreshJobs} disabled={queueLoading}>
                    {queueLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                    Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Stato</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead>Profilo</TableHead>
                      <TableHead className="text-right">Finding</TableHead>
                      <TableHead>Tempi</TableHead>
                      <TableHead className="text-right">Azioni</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runGroups.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                          Nessun job LAB. Inserisci IP, dominio o CIDR e avvia LAB Scan360.
                        </TableCell>
                      </TableRow>
                    ) : runGroups.map((group) => (
                      <React.Fragment key={group.key}>
                        <TableRow className="bg-muted/50 hover:bg-muted/50">
                          <TableCell colSpan={6}>
                            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                              <div className="flex flex-col gap-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge variant="secondary">Run {formatDateTime(group.created_at)}</Badge>
                                  <Badge variant="outline">{group.targetCount} target</Badge>
                                  <Badge className={group.active > 0 ? 'bg-amber-500 text-white' : group.failed > 0 ? 'bg-destructive text-destructive-foreground' : 'bg-emerald-600 text-white'}>
                                    {group.completed}/{group.jobs.length} completati
                                  </Badge>
                                  {group.active > 0 && <Badge variant="outline">{group.active} in coda/esecuzione</Badge>}
                                  {group.failed > 0 && <Badge variant="destructive">{group.failed} errori</Badge>}
                                </div>
                                <span className="text-xs text-muted-foreground">
                                  {PROFILE_LABELS[group.profile as NucleiProfile] || group.profile} · Nmap {NMAP_PROFILE_LABELS[group.nmap_profile as NmapProfile] || group.nmap_profile}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Button variant="default" size="sm" onClick={() => downloadRunPdfReport(group)} disabled={reportExporting !== null || group.active > 0}>
                                  {reportExporting === `pdf:${group.key}` ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                                  PDF run
                                </Button>
                                <Button variant="secondary" size="sm" onClick={() => downloadRunDocxReport(group)} disabled={reportExporting !== null || group.active > 0}>
                                  {reportExporting === `docx:${group.key}` ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                                  DOCX
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => downloadRunJsonReport(group)} disabled={reportExporting !== null}>
                                  {reportExporting === `json:${group.key}` ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                                  JSON
                                </Button>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                        {group.jobs.map((job) => (
                          <TableRow key={job.id} className={cn(selectedJobId === job.id && 'bg-muted/40')}>
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                <Badge className={stageClass(job.stage || job.status)}>{job.stage || job.status}</Badge>
                                <Badge className={statusClass(job.status)}>{job.status}</Badge>
                                {job.stage === 'waiting_nuclei' && <span className="text-xs text-muted-foreground">Nuclei tra {formatCountdown(job.next_run_at)}</span>}
                              </div>
                            </TableCell>
                            <TableCell className="max-w-[280px]">
                              <div className="flex flex-col gap-1">
                                <span className="truncate font-mono text-xs">{job.target_url}</span>
                                {job.nmap_target && <span className="truncate text-xs text-muted-foreground">nmap: {job.nmap_target}</span>}
                                {job.resolved_target_url && job.resolved_target_url !== job.target_url && (
                                  <span className="truncate text-xs text-muted-foreground">→ {job.resolved_target_url}</span>
                                )}
                                {job.last_error && <span className="line-clamp-2 text-xs text-destructive">{job.last_error}</span>}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                <Badge variant="outline">{PROFILE_LABELS[job.profile] || job.profile}</Badge>
                                <span className="text-xs text-muted-foreground">Nmap {NMAP_PROFILE_LABELS[job.nmap_profile || 'service_light']}</span>
                                <span className="text-xs text-muted-foreground">rate {job.rate_limit || '—'} · timeout {job.timeout_seconds || '—'}s</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex flex-col items-end gap-1">
                                <span className="font-semibold">{job.findings_count ?? 0}</span>
                                <span className="text-xs text-muted-foreground">{job.open_port_count ?? 0} porte · {job.nikto_findings_count ?? 0} nikto · {job.templates_executed_count ?? 0} template</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                                <span>creato {formatDateTime(job.created_at)}</span>
                                <span>fine {formatDateTime(job.completed_at)}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button variant="outline" size="sm" onClick={() => openJob(job)} disabled={queueLoading}>Apri</Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </React.Fragment>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {selectedJob && (
              <Card className="border-primary/20">
                <CardHeader>
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <CardTitle>Pipeline detail</CardTitle>
                      <CardDescription>
                        {selectedJob.target_input || selectedJob.target_url} · stage {selectedJob.stage || selectedJob.status}
                        {selectedJob.stage === 'waiting_nuclei' ? ` · Nuclei tra ${formatCountdown(selectedJob.next_run_at)}` : ''}
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="default" size="sm" onClick={downloadSelectedJobPdfReport} disabled={reportExporting !== null}>
                        {reportExporting === 'pdf' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                        Report PDF
                      </Button>
                      <Button variant="secondary" size="sm" onClick={downloadSelectedJobDocxReport} disabled={reportExporting !== null}>
                        {reportExporting === 'docx' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                        DOCX
                      </Button>
                      <Button variant="outline" size="sm" onClick={downloadSelectedJobJsonReport}>
                        <Download className="mr-2 h-4 w-4" />
                        JSON
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-4 xl:grid-cols-2">
                  <Card className="xl:col-span-2">
                    <CardHeader>
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <CardTitle className="text-base">Verdetto unico</CardTitle>
                          <CardDescription>Sintesi multi-engine: Nmap/httpx, Nikto, Nuclei e NVD.</CardDescription>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className={verdictClass(unifiedVerdict?.level)}>{unifiedVerdict?.level || 'non calcolato'}</Badge>
                          <Badge variant="outline">score {formatScore(unifiedVerdict?.score)}</Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="grid gap-3 md:grid-cols-5">
                      {(['nmap', 'httpx', 'nikto', 'nuclei', 'report'] as const).map((engine) => {
                        const meta = engineStatusMeta(engine, selectedJob);
                        return (
                          <div key={engine} className="rounded-lg border p-3">
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <span className="text-sm font-medium">{engine === 'httpx' ? 'httpx tech' : engine === 'report' ? 'Report' : engine.charAt(0).toUpperCase() + engine.slice(1)}</span>
                              <Badge className={meta.className}>{meta.label}</Badge>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-muted">
                              <div className="h-full bg-primary transition-all" style={{ width: `${meta.progress}%` }} />
                            </div>
                            <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{meta.detail}</p>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>

                  <Card className="xl:col-span-2">
                    <CardContent className="pt-6">
                      <div className="rounded-lg border p-3">
                        <h3 className="mb-2 text-sm font-medium">Motivazioni</h3>
                        <div className="flex flex-col gap-2">
                          {(unifiedVerdict?.reasons || ['Verdetto non ancora disponibile: completa Nmap, Nikto e Nuclei.']).map((reason) => (
                            <div key={reason} className="text-sm text-muted-foreground">{reason}</div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Nmap open ports</CardTitle>
                      <CardDescription>
                        {selectedJob.nmap_version || 'versione nmap non ancora disponibile'} · durata {selectedJob.nmap_duration_ms ? `${Math.round(selectedJob.nmap_duration_ms / 1000)}s` : '—'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Porta</TableHead>
                            <TableHead>Servizio</TableHead>
                            <TableHead>Host</TableHead>
                            <TableHead>URL</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {openPorts.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">Nessuna porta aperta salvata per questo job.</TableCell>
                            </TableRow>
                          ) : openPorts.map((port) => (
                            <TableRow key={`${port.host || port.hostname}-${port.port}-${port.service}`}>
                              <TableCell><Badge variant="outline">{port.protocol || 'tcp'}/{port.port}</Badge></TableCell>
                              <TableCell>
                                <div className="flex flex-col gap-1">
                                  <span className="font-medium">{port.service || 'unknown'}</span>
                                  <span className="text-xs text-muted-foreground">{[port.product, port.version].filter(Boolean).join(' ') || '—'}</span>
                                </div>
                              </TableCell>
                              <TableCell className="max-w-[180px] truncate font-mono text-xs">{port.hostname || port.host || '—'}</TableCell>
                              <TableCell className="max-w-[220px] truncate font-mono text-xs">{port.url_candidates?.[0] || '—'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>

                  <Card className="xl:col-span-2">
                    <CardHeader>
                      <CardTitle className="text-base">Tecnologie rilevate</CardTitle>
                      <CardDescription>
                        httpx/Wappalyzer · {selectedJob.fingerprint_status || 'non avviato'} · {technologies.length} tecnologie
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Tecnologia</TableHead>
                            <TableHead>Fonte</TableHead>
                            <TableHead>URL/porta</TableHead>
                            <TableHead>CPE candidato</TableHead>
                            <TableHead>Evidenza</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>{renderTechnologyRows()}</TableBody>
                      </Table>
                    </CardContent>
                  </Card>

                  <Card className="xl:col-span-2">
                    <CardHeader>
                      <CardTitle className="text-base">Nikto</CardTitle>
                      <CardDescription>
                        {selectedJob.nikto_version || 'versione Nikto non ancora disponibile'} · {selectedJob.nikto_status || 'non avviato'} · {niktoFindings.length} finding
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Sev</TableHead>
                            <TableHead>Categoria</TableHead>
                            <TableHead>URL/URI</TableHead>
                            <TableHead>Evidenza</TableHead>
                            <TableHead>Reference</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>{renderNiktoRows()}</TableBody>
                      </Table>
                    </CardContent>
                  </Card>

                  <Card className="xl:col-span-2">
                    <CardHeader>
                      <CardTitle className="text-base">CVE intelligence</CardTitle>
                      <CardDescription>
                        {confirmedCveMatches.length} confermate da Nuclei · {potentialCveMatches.length} potenziali da NVD/CPE.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-5">
                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <h3 className="text-sm font-medium">Confermate da Nuclei</h3>
                          <Badge variant="secondary">{confirmedCveMatches.length}</Badge>
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>CVE</TableHead>
                              <TableHead>Asset/CPE</TableHead>
                              <TableHead>Sev</TableHead>
                              <TableHead>Score</TableHead>
                              <TableHead>Descrizione NVD</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>{renderCveRows(confirmedCveMatches, 'Nessuna CVE confermata dai template Nuclei per questo job.')}</TableBody>
                        </Table>
                      </div>
                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <h3 className="text-sm font-medium">Potenziali da CPE/NVD e Tech/NVD</h3>
                          <Badge variant="outline">{potentialCveMatches.length}</Badge>
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>CVE</TableHead>
                              <TableHead>Asset/CPE</TableHead>
                              <TableHead>Sev</TableHead>
                              <TableHead>Score</TableHead>
                              <TableHead>Descrizione NVD</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>{renderCveRows(potentialCveMatches, 'Nessuna CVE potenziale da CPE Nmap/NVD o tecnologia versionata per questo job.')}</TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                </CardContent>
              </Card>
            )}

            {findings.length > 0 && (
              <Card className="border-primary/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    Executive parser
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-5">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-xl border bg-muted/20 p-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Target className="h-4 w-4" />
                        Asset colpiti
                      </div>
                      <p className="mt-2 text-2xl font-semibold">{analysis.assetRows.length}</p>
                      <p className="text-xs text-muted-foreground">host unici con match Nuclei</p>
                    </div>
                    <div className="rounded-xl border bg-muted/20 p-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Route className="h-4 w-4" />
                        Finding totali
                      </div>
                      <p className="mt-2 text-2xl font-semibold">{findings.length}</p>
                      <p className="text-xs text-muted-foreground">da template Nuclei</p>
                    </div>
                    <div className="rounded-xl border bg-muted/20 p-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        Risk score
                      </div>
                      <p className="mt-2 text-2xl font-semibold">{analysis.riskScore}/100</p>
                      <p className="text-xs text-muted-foreground">{analysis.executiveTone}</p>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Finding per severità</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {analysis.severityRows.length > 0 ? (
                          <ChartContainer config={severityChartConfig} className="h-[230px] w-full">
                            <BarChart data={analysis.severityRows} margin={{ left: 0, right: 16, top: 8, bottom: 0 }}>
                              <CartesianGrid vertical={false} />
                              <XAxis dataKey="severity" tickLine={false} axisLine={false} />
                              <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                              <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                              <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                                {analysis.severityRows.map((row) => <Cell key={row.severity} fill={row.fill} />)}
                              </Bar>
                            </BarChart>
                          </ChartContainer>
                        ) : (
                          <div className="flex h-[230px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">Nessun finding da graficare</div>
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Protocol/type mix</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {analysis.typeRows.length > 0 ? (
                          <ChartContainer config={typeChartConfig} className="h-[230px] w-full">
                            <PieChart>
                              <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                              <Pie data={analysis.typeRows} dataKey="count" nameKey="type" innerRadius={52} outerRadius={86} paddingAngle={3}>
                                {analysis.typeRows.map((row) => <Cell key={row.type} fill={row.fill} />)}
                              </Pie>
                            </PieChart>
                          </ChartContainer>
                        ) : (
                          <div className="flex h-[230px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">Nessun tipo rilevato</div>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-2">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Asset impattati</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Asset</TableHead>
                              <TableHead className="text-right">Finding</TableHead>
                              <TableHead>Severità</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {analysis.assetRows.length === 0 ? (
                              <TableRow><TableCell colSpan={3} className="py-6 text-center text-muted-foreground">Nessun asset con finding.</TableCell></TableRow>
                            ) : analysis.assetRows.map((row) => (
                              <TableRow key={row.asset}>
                                <TableCell className="max-w-[260px] truncate font-mono text-xs">{row.asset}</TableCell>
                                <TableCell className="text-right font-medium">{row.count}</TableCell>
                                <TableCell>
                                  <div className="flex flex-wrap gap-1">
                                    {SEVERITY_ORDER.filter((s) => row.severities[s]).map((s) => (
                                      <Badge key={s} className={severityClass(s)}>{s}: {row.severities[s]}</Badge>
                                    ))}
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Categorie e template</CardTitle>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-4">
                        <div className="flex flex-wrap gap-2">
                          {analysis.categoryRows.length === 0 ? (
                            <Badge variant="outline">nessuna categoria</Badge>
                          ) : analysis.categoryRows.map((row) => (
                            <Badge key={row.category} variant="secondary">{row.category}: {row.count}</Badge>
                          ))}
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Template</TableHead>
                              <TableHead>Categoria</TableHead>
                              <TableHead className="text-right">Match</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {analysis.templateRows.length === 0 ? (
                              <TableRow><TableCell colSpan={3} className="py-6 text-center text-muted-foreground">Nessun template con match.</TableCell></TableRow>
                            ) : analysis.templateRows.map((row) => (
                              <TableRow key={row.template_id}>
                                <TableCell>
                                  <div className="flex flex-col gap-1">
                                    <span className="font-medium">{row.name}</span>
                                    <span className="font-mono text-xs text-muted-foreground">{row.template_id}</span>
                                  </div>
                                </TableCell>
                                <TableCell><Badge variant="outline">{row.category}</Badge></TableCell>
                                <TableCell className="text-right"><Badge className={severityClass(row.severity)}>{row.count}</Badge></TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Finding detail</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Severità</TableHead>
                            <TableHead>Finding</TableHead>
                            <TableHead>Asset</TableHead>
                            <TableHead>Categoria</TableHead>
                            <TableHead>Evidenza</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {findings.length === 0 ? (
                            <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Nessun finding.</TableCell></TableRow>
                          ) : findings.map((finding) => (
                            <TableRow key={finding.id}>
                              <TableCell><Badge className={severityClass(finding.severityKey)}>{finding.severityKey}</Badge></TableCell>
                              <TableCell className="max-w-[320px]">
                                <div className="flex flex-col gap-1">
                                  <span className="font-medium">{finding.label}</span>
                                  <span className="font-mono text-xs text-muted-foreground">{finding.template_id}</span>
                                </div>
                              </TableCell>
                              <TableCell className="max-w-[240px] truncate font-mono text-xs">{finding.matched_at || finding.asset}</TableCell>
                              <TableCell><Badge variant="outline">{finding.category}</Badge></TableCell>
                              <TableCell className="max-w-[320px]">
                                <pre className="max-h-24 overflow-auto rounded bg-muted p-2 text-xs">{finding.evidence || '—'}</pre>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </CardContent>
              </Card>
            )}

            {lastError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Errore ultima operazione</AlertTitle>
                <AlertDescription>{lastError}</AlertDescription>
              </Alert>
            )}

            <Card>
              <CardHeader>
                <CardTitle>JSON debug</CardTitle>
                <CardDescription>Output normalizzato, utile per validare l'MVP.</CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  className="min-h-[280px] font-mono text-xs"
                  value={rawResult}
                  readOnly
                  placeholder="Apri un job o avvia una scansione per vedere il JSON completo."
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default NucleiScan360;
