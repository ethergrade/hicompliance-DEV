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
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabase } from '@/integrations/supabase/client';
import { adaptNucleiScan360JobToSurfaceReport } from '@/lib/nucleiScan360SurfaceReportAdapter';
import { generateSurfaceScan360Docx } from '@/lib/surfaceScan360DocxReport';
import { generateSurfaceScan360Pdf } from '@/lib/surfaceScan360PdfReport';
import { cn } from '@/lib/utils';

type NucleiProfile =
  | 'baseline_headers'
  | 'exposure_medium'
  | 'web_vuln_safe'
  | 'web_cve_recent'
  | 'web_cve_2026'
  | 'web_cve_2025'
  | 'web_cve_2024'
  | 'web_cve_2023'
  | 'web_cve_2022'
  | 'web_vuln_authorized';
type NmapProfile = 'web_top' | 'tcp_top_100' | 'service_light' | 'custom_tcp';

type NucleiFinding = {
  template_id?: string;
  name?: string | null;
  severity?: string | null;
  type?: string | null;
  matched_at?: string | null;
  matcher_name?: string | null;
  extracted_results?: string[];
  tags?: string[];
  cve_ids?: string[];
};

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
  template_paths?: string[];
  nuclei_command_sanitized?: string;
  debug_summary?: Record<string, unknown>;
};

type NucleiJob = {
  id: string;
  organization_id: string;
  source?: string | null;
  target_url: string;
  normalized_target_url?: string | null;
  resolved_target_url?: string | null;
  target_host?: string | null;
  target_input?: string | null;
  target_kind?: string | null;
  nmap_target?: string | null;
  nmap_profile?: NmapProfile | null;
  stage?: 'queued' | 'nmap_running' | 'nikto_running' | 'waiting_nuclei' | 'nuclei_running' | 'completed' | 'failed' | 'timeout' | 'cancelled' | null;
  next_run_at?: string | null;
  nmap_status?: string | null;
  nmap_started_at?: string | null;
  nmap_completed_at?: string | null;
  nmap_duration_ms?: number | null;
  nmap_version?: string | null;
  open_port_count?: number | null;
  fingerprint_status?: string | null;
  fingerprint_duration_ms?: number | null;
  technology_count?: number | null;
  nmap_warnings?: string[] | null;
  raw_nmap_result?: Record<string, unknown> | null;
  raw_technology_result?: Record<string, unknown> | null;
  nikto_status?: string | null;
  nikto_started_at?: string | null;
  nikto_completed_at?: string | null;
  nikto_duration_ms?: number | null;
  nikto_version?: string | null;
  nikto_findings_count?: number | null;
  raw_nikto_result?: Record<string, unknown> | null;
  unified_verdict?: UnifiedVerdict | null;
  profile: NucleiProfile;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'timeout' | 'cancelled';
  attempt_count?: number | null;
  last_error?: string | null;
  timeout_seconds?: number | null;
  rate_limit?: number | null;
  max_findings?: number | null;
  authorized_scan?: boolean | null;
  duration_ms?: number | null;
  nuclei_version?: string | null;
  templates_loaded_count?: number | null;
  templates_executed_count?: number | null;
  findings_count?: number | null;
  warnings?: string[] | null;
  summary?: Record<string, unknown> | null;
  raw_result?: NucleiResult | null;
  created_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
};

type NmapOpenPort = {
  id?: string;
  host?: string | null;
  hostname?: string | null;
  protocol?: string | null;
  port?: number | null;
  state?: string | null;
  service?: string | null;
  product?: string | null;
  version?: string | null;
  extrainfo?: string | null;
  cpe?: string[];
  url_candidates?: string[];
};

type TechnologyFingerprint = {
  id?: string;
  port_id?: string | null;
  url?: string | null;
  asset_host?: string | null;
  port?: number | null;
  name?: string | null;
  version?: string | null;
  source?: string | null;
  confidence?: 'high' | 'medium' | 'low' | null;
  category?: string | null;
  evidence?: Record<string, unknown> | null;
  cpe_candidates?: string[];
};

type NiktoFinding = {
  id?: string;
  target_url?: string | null;
  asset_host?: string | null;
  port?: number | null;
  tls?: boolean | null;
  severity?: 'critical' | 'high' | 'medium' | 'low' | 'info' | string | null;
  category?: string | null;
  nikto_id?: string | null;
  method?: string | null;
  uri?: string | null;
  message?: string | null;
  references?: string[];
  raw_finding?: Record<string, unknown> | null;
};

type UnifiedVerdict = {
  level?: 'clean' | 'informational' | 'watch' | 'elevated' | 'critical' | string;
  score?: number;
  reasons?: string[];
  generated_at?: string;
  engines?: {
    nmap?: Record<string, unknown>;
    httpx?: Record<string, unknown>;
    nikto?: Record<string, unknown>;
    nuclei?: Record<string, unknown>;
    nvd?: Record<string, unknown>;
  };
  semantics?: Record<string, unknown>;
};

type CveMatch = {
  id?: string;
  cve_id: string;
  severity?: string | null;
  asset_host?: string | null;
  template_id?: string | null;
  matched_at?: string | null;
  cvss_score?: number | null;
  cvss_vector?: string | null;
  cvss_version?: string | null;
  epss_score?: number | null;
  epss_percentile?: number | null;
  kev_known_exploited?: boolean | null;
  match_status?: 'confirmed' | 'potential' | null;
  confidence?: 'high' | 'medium' | 'low' | null;
  source?: string | null;
  cpe?: string | null;
  description?: string | null;
  nvd_status?: string | null;
  published_at?: string | null;
  last_modified_at?: string | null;
};

type ScannableTarget = {
  target_url: string;
  value: string;
  host: string;
  kind: 'domain' | 'subdomain' | 'url';
  source: string;
  label: string;
  confidence: 'high' | 'medium' | 'low';
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
    case 'critical':
      return 'bg-red-600 text-white';
    case 'high':
      return 'bg-red-500 text-white';
    case 'medium':
      return 'bg-amber-500 text-white';
    case 'low':
      return 'bg-yellow-400 text-slate-950';
    default:
      return 'bg-slate-600 text-white';
  }
};

const statusClass = (status?: string | null) => {
  switch (String(status || '').toLowerCase()) {
    case 'completed':
      return 'bg-green-600 text-white';
    case 'running':
      return 'bg-primary text-primary-foreground';
    case 'failed':
    case 'timeout':
      return 'bg-destructive text-destructive-foreground';
    case 'queued':
      return 'bg-amber-500 text-white';
    default:
      return 'bg-muted text-muted-foreground';
  }
};

const stageClass = (stage?: string | null) => {
  switch (String(stage || '').toLowerCase()) {
    case 'completed':
      return 'bg-green-600 text-white';
    case 'nmap_running':
    case 'nikto_running':
    case 'nuclei_running':
      return 'bg-primary text-primary-foreground';
    case 'waiting_nuclei':
      return 'bg-sky-600 text-white';
    case 'failed':
    case 'timeout':
      return 'bg-destructive text-destructive-foreground';
    case 'queued':
      return 'bg-amber-500 text-white';
    default:
      return 'bg-muted text-muted-foreground';
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
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return '—';
  }
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

const verdictClass = (level?: string | null) => {
  switch (String(level || '').toLowerCase()) {
    case 'critical':
      return 'bg-red-600 text-white';
    case 'elevated':
      return 'bg-orange-500 text-white';
    case 'watch':
      return 'bg-amber-500 text-white';
    case 'informational':
      return 'bg-sky-600 text-white';
    case 'clean':
      return 'bg-green-600 text-white';
    default:
      return 'bg-muted text-muted-foreground';
  }
};

const formatEngineValue = (value: unknown) => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'si' : 'no';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '—';
  return String(value);
};

const nvdDetailUrl = (cveId: string) => `https://nvd.nist.gov/vuln/detail/${encodeURIComponent(cveId)}`;

const normalizeManualTargetToken = (value: string): string => {
  const cleaned = String(value || '')
    .trim()
    .replace(/^[`'"]+/, '')
    .replace(/[`'"]+$/, '')
    .trim();
  return /^[`'".,;\s]+$/.test(cleaned) ? '' : cleaned;
};

const isJobActive = (job?: NucleiJob | null) =>
  Boolean(job && ['queued', 'running'].includes(String(job.status || '').toLowerCase()));

const engineStatusMeta = (
  engine: 'nmap' | 'httpx' | 'nikto' | 'nuclei' | 'report',
  job?: NucleiJob | null,
): { label: string; progress: number; className: string; detail: string } => {
  if (!job) {
    return { label: 'In attesa', progress: 0, className: 'bg-muted text-muted-foreground', detail: 'Nessun job selezionato' };
  }
  const stage = String(job.stage || job.status || '').toLowerCase();
  const done = { label: 'Completato', progress: 100, className: 'bg-green-600 text-white' };
  const running = { label: 'In corso', progress: 65, className: 'bg-primary text-primary-foreground' };
  const queued = { label: 'In coda', progress: 25, className: 'bg-amber-500 text-white' };
  const failed = { label: 'Errore', progress: 100, className: 'bg-destructive text-destructive-foreground' };
  if (['failed', 'timeout', 'cancelled'].includes(stage)) {
    return { ...failed, detail: job.last_error || 'Stage interrotto' };
  }

  if (engine === 'nmap') {
    if (job.nmap_status === 'completed' || ['nikto_running', 'waiting_nuclei', 'nuclei_running', 'completed'].includes(stage)) {
      return { ...done, detail: `${job.open_port_count ?? 0} porte · ${job.nmap_version || 'nmap'}` };
    }
    if (stage === 'nmap_running') return { ...running, detail: 'Nmap + service detection' };
    return { ...queued, detail: 'Primo motore della pipeline' };
  }

  if (engine === 'httpx') {
    if (job.fingerprint_status || ['nikto_running', 'waiting_nuclei', 'nuclei_running', 'completed'].includes(stage)) {
      return { ...done, detail: `${job.technology_count ?? 0} tecnologie · ${job.fingerprint_status || 'done'}` };
    }
    if (stage === 'nmap_running') return { ...running, detail: 'Safe HTTP fingerprint' };
    return { ...queued, detail: 'Dopo rilevamento porte web' };
  }

  if (engine === 'nikto') {
    if (job.nikto_status && !['queued', 'running'].includes(String(job.nikto_status).toLowerCase())) {
      return { ...done, detail: `${job.nikto_findings_count ?? 0} finding · ${job.nikto_version || 'Nikto'}` };
    }
    if (stage === 'nikto_running') return { ...running, detail: 'Nikto safe LAB sui target web' };
    if (['waiting_nuclei', 'nuclei_running', 'completed'].includes(stage)) {
      return { ...done, detail: `${job.nikto_findings_count ?? 0} finding` };
    }
    return { ...queued, detail: 'Dopo Nmap/httpx' };
  }

  if (engine === 'nuclei') {
    if (stage === 'completed') return { ...done, detail: `${job.findings_count ?? 0} finding · ${job.templates_executed_count ?? 0} template` };
    if (stage === 'nuclei_running') return { ...running, detail: 'Template CVE/exposure in esecuzione' };
    if (stage === 'waiting_nuclei') return { ...queued, progress: 50, detail: `Finestra safe: ${formatCountdown(job.next_run_at)}` };
    return { ...queued, detail: 'Parte dopo Nikto e attesa persistita' };
  }

  if (stage === 'completed') {
    return { ...done, detail: `Verdetto ${job.unified_verdict?.level || 'calcolato'} · PDF/DOCX pronti` };
  }
  return { ...queued, detail: 'Pronto quando i motori finiscono' };
};

const clampNumber = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
};

const extractInvokeErrorMessage = async (error: unknown, fallback = 'Errore funzione Supabase') => {
  const diagnostic = (error as NucleiFunctionError)?.diagnostic;
  if (diagnostic) return formatDiagnosticMessage(diagnostic);
  const maybeError = error as { message?: string; context?: Response };
  if (maybeError?.context instanceof Response) {
    try {
      const payload = await maybeError.context.clone().json();
      return String(payload?.error || payload?.message || maybeError.message || fallback);
    } catch {
      try {
        const text = await maybeError.context.clone().text();
        if (text.trim()) return text.slice(0, 500);
      } catch {
        // ignore
      }
    }
  }
  return error instanceof Error ? error.message : String(error || fallback);
};

type NucleiAction =
  | 'direct_scan'
  | 'enqueue'
  | 'start_lab_scan'
  | 'list'
  | 'get'
  | 'retrieve_targets'
  | 'process_queue'
  | 'smoke_test';

type NucleiFunctionBody = {
  action: NucleiAction;
  organization_id?: string;
  job_id?: string;
  target_url?: string;
  targets?: string[];
  nmap_profile?: NmapProfile;
  include_discovered_targets?: boolean;
  surface_asset_limit?: number;
  target_limit?: number;
  profile?: NucleiProfile;
  timeout_seconds?: number;
  rate_limit?: number;
  max_findings?: number;
  authorized_scan?: boolean;
  limit?: number;
  request_id?: string;
};

type NucleiInvokeDiagnostic = {
  phase: string;
  endpoint: string;
  request_id: string;
  action: NucleiAction;
  status: number | null;
  retry_count: number;
  message: string;
  payload?: unknown;
};

type NucleiFunctionError = Error & {
  diagnostic?: NucleiInvokeDiagnostic;
};

const NUCLEI_SCAN360_PRIMARY_ENDPOINT = `${SUPABASE_URL}/functions/v1/nuclei-scan360`;
const NUCLEI_SCAN360_GATEWAY_ENDPOINT = `${SUPABASE_URL}/functions/v1/scan360-job-gateway`;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getResponseStatus = (error: unknown) => {
  const context = (error as { context?: Response })?.context;
  return context instanceof Response ? context.status : 0;
};

const createNucleiRequestId = (action: NucleiAction) =>
  `scan360-${action}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

const formatDiagnosticMessage = (diagnostic: NucleiInvokeDiagnostic) =>
  [
    `fase=${diagnostic.phase}`,
    `request_id=${diagnostic.request_id}`,
    `status=${diagnostic.status ?? 'network'}`,
    `retry=${diagnostic.retry_count}`,
    diagnostic.message,
  ].filter(Boolean).join(' · ');

const createNucleiFunctionError = (diagnostic: NucleiInvokeDiagnostic): NucleiFunctionError => {
  const error = new Error(formatDiagnosticMessage(diagnostic)) as NucleiFunctionError;
  error.diagnostic = diagnostic;
  return error;
};

const isTransientFunctionError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || '');
  const status = getResponseStatus(error);
  return status >= 500 || /failed to send|fetch|network|non-2xx|timeout/i.test(message);
};

async function directFetchNucleiScan360<T>(body: NucleiFunctionBody, endpoint = NUCLEI_SCAN360_PRIMARY_ENDPOINT): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token || SUPABASE_PUBLISHABLE_KEY;
  const requestId = body.request_id || createNucleiRequestId(body.action);
  const tracedBody = { ...body, request_id: requestId };
  const requestIdHeader = endpoint === NUCLEI_SCAN360_GATEWAY_ENDPOINT
    ? 'x-scan360-request-id'
    : 'x-nuclei-scan360-request-id';
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        [requestIdHeader]: requestId,
      },
      body: JSON.stringify(tracedBody),
    });
  } catch (error) {
    throw createNucleiFunctionError({
      phase: 'network',
      endpoint,
      request_id: requestId,
      action: body.action,
      status: null,
      retry_count: 0,
      message: error instanceof Error ? error.message : String(error || 'fetch_failed'),
    });
  }

  const text = await response.text();
  let payload: unknown = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw createNucleiFunctionError({
      phase: 'malformed_json',
      endpoint,
      request_id: requestId,
      action: body.action,
      status: response.status,
      retry_count: 0,
      message: text.trim() || `NucleiScan360 HTTP ${response.status}`,
      payload: text.slice(0, 500),
    });
  }
  if (!response.ok) {
    const errorPayload = payload as { error?: string; message?: string; phase?: string; request_id?: string };
    throw createNucleiFunctionError({
      phase: errorPayload.phase || body.action,
      endpoint,
      request_id: String(errorPayload.request_id || requestId),
      action: body.action,
      status: response.status,
      retry_count: 0,
      message: errorPayload.error || errorPayload.message || `NucleiScan360 HTTP ${response.status}`,
      payload,
    });
  }
  return payload as T;
}

async function invokeNucleiScan360<T>(body: NucleiFunctionBody, retries = 2): Promise<T> {
  let lastError: unknown;
  const requestId = body.request_id || createNucleiRequestId(body.action);
  const tracedBody = { ...body, request_id: requestId };
  const endpoint = NUCLEI_SCAN360_PRIMARY_ENDPOINT;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const { data, error } = await supabase.functions.invoke('nuclei-scan360', {
        body: tracedBody,
        headers: {
          'x-nuclei-scan360-request-id': requestId,
        },
      });
      if (!error) return data as T;
      lastError = error;
      if (!isTransientFunctionError(error)) {
        const status = getResponseStatus(error);
        throw createNucleiFunctionError({
          phase: body.action,
          endpoint,
          request_id: requestId,
          action: body.action,
          status: status || null,
          retry_count: attempt,
          message: await extractInvokeErrorMessage(error, 'NucleiScan360 errore'),
        });
      }
    } catch (error) {
      lastError = error;
      if (!isTransientFunctionError(error)) throw error;
    }

    if (attempt < retries) {
      await wait(650 * (attempt + 1));
    }
  }

  try {
    return await directFetchNucleiScan360<T>(tracedBody);
  } catch (error) {
    const diagnostic = (error as NucleiFunctionError).diagnostic;
    if (diagnostic?.phase === 'network') {
      try {
        return await directFetchNucleiScan360<T>(tracedBody, NUCLEI_SCAN360_GATEWAY_ENDPOINT);
      } catch (gatewayError) {
        throw gatewayError;
      }
    }
    if (isTransientFunctionError(error)) {
      await wait(1200);
      return await directFetchNucleiScan360<T>(tracedBody);
    }
    if ((error as NucleiFunctionError).diagnostic) throw error;
    const status = getResponseStatus(lastError);
    throw createNucleiFunctionError({
      phase: body.action,
      endpoint,
      request_id: requestId,
      action: body.action,
      status: status || null,
      retry_count: retries,
      message: lastError instanceof Error ? lastError.message : String(lastError || error || 'NucleiScan360 request failed'),
    });
  }
}

const safeLower = (value: unknown) => String(value || '').trim().toLowerCase();

const extractAsset = (matchedAt?: string | null) => {
  const raw = String(matchedAt || '').trim();
  if (!raw) return 'unknown';
  try {
    return new URL(raw).hostname || raw;
  } catch {
    return raw.replace(/^https?:\/\//, '').split('/')[0] || raw;
  }
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

const parseNucleiResult = (result: NucleiResult | null): ParsedNucleiResult => {
  const parsedFindings: ParsedFinding[] = (result?.findings || []).map((finding, index) => {
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
    count: parsedFindings.filter((finding) => finding.severityKey === severity).length,
    fill: SEVERITY_COLORS[severity],
  })).filter((row) => row.count > 0);

  const typeRows = countBy(parsedFindings, (finding) => String(finding.type || 'unknown')).map((row, index) => ({
    type: row.key,
    count: row.count,
    fill: TYPE_COLORS[index % TYPE_COLORS.length],
  }));

  const categoryRows = countBy(parsedFindings, (finding) => finding.category)
    .slice(0, 8)
    .map((row) => ({ category: row.key, count: row.count }));

  const assetRows = countBy(parsedFindings, (finding) => finding.asset).slice(0, 8).map((row) => ({
    asset: row.key,
    count: row.count,
    severities: parsedFindings
      .filter((finding) => finding.asset === row.key)
      .reduce<Record<string, number>>((acc, finding) => {
        acc[finding.severityKey] = (acc[finding.severityKey] || 0) + 1;
        return acc;
      }, {}),
  }));

  const templateRows = countBy(parsedFindings, (finding) => String(finding.template_id || 'unknown')).slice(0, 10).map((row) => {
    const sample = parsedFindings.find((finding) => finding.template_id === row.key);
    return {
      template_id: row.key,
      name: sample?.label || row.key,
      severity: sample?.severityKey || 'info',
      count: row.count,
      category: sample?.category || 'Other',
    };
  });

  const riskScore = Math.min(100, parsedFindings.reduce((score, finding) => score + (SEVERITY_WEIGHTS[finding.severityKey] || 1), 0));
  const statsLast = (result?.debug_summary?.stats_last || {}) as Record<string, unknown>;
  return {
    findings: parsedFindings.sort((a, b) => {
      const severityDelta = SEVERITY_ORDER.indexOf(a.severityKey) - SEVERITY_ORDER.indexOf(b.severityKey);
      return severityDelta || a.category.localeCompare(b.category) || a.label.localeCompare(b.label);
    }),
    riskScore,
    executiveTone: riskScore >= 50 ? 'hot' : riskScore >= 15 ? 'watch' : 'quiet',
    severityRows,
    typeRows,
    categoryRows,
    assetRows,
    templateRows,
    warnings: result?.warnings || [],
    stats: {
      requests: String(statsLast.requests || '—'),
      errors: String(statsLast.errors || '0'),
      matched: String(statsLast.matched || parsedFindings.length || '0'),
      percent: String(statsLast.percent || '—'),
      clustered: String(result?.debug_summary?.templates_clustered || '—'),
      completed: String(result?.debug_summary?.scan_completed || '—'),
    },
  };
};

const NucleiScan360: React.FC = () => {
  const { isSuperAdmin, loading: rolesLoading } = useUserRoles();
  const { selectedOrganization, organizations, isLoadingClients } = useClientContext();
  const { toast } = useToast();
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
  const [result, setResult] = useState<NucleiResult | null>(null);
  const [rawResult, setRawResult] = useState('');
  const [lastDiagnostic, setLastDiagnostic] = useState<NucleiInvokeDiagnostic | null>(null);
  const [reportExporting, setReportExporting] = useState<'pdf' | 'docx' | null>(null);

  const analysis = useMemo(() => parseNucleiResult(result), [result]);
  const findings = analysis.findings;
  const selectedOrganizationName = useMemo(
    () => organizations.find((organization) => organization.id === selectedOrgId)?.name || selectedOrganization?.name || 'Cliente non selezionato',
    [organizations, selectedOrgId, selectedOrganization?.name],
  );

  const selectedTargetSet = useMemo(() => new Set(selectedTargetUrls), [selectedTargetUrls]);
  const confirmedCveMatches = useMemo(
    () => cveMatches.filter((match) => (match.match_status || 'confirmed') === 'confirmed'),
    [cveMatches],
  );
  const potentialCveMatches = useMemo(
    () => cveMatches.filter((match) => match.match_status === 'potential'),
    [cveMatches],
  );
  const unifiedVerdict = selectedJob?.unified_verdict || null;

  const recordDiagnostic = useCallback((error: unknown, fallback: string) => {
    const diagnostic = (error as NucleiFunctionError)?.diagnostic || {
      phase: 'unknown',
      endpoint: NUCLEI_SCAN360_PRIMARY_ENDPOINT,
      request_id: 'not_available',
      action: 'direct_scan' as NucleiAction,
      status: getResponseStatus(error) || null,
      retry_count: 0,
      message: error instanceof Error ? error.message : String(error || fallback),
    };
    setLastDiagnostic(diagnostic);
    setRawResult(JSON.stringify({ ok: false, diagnostic }, null, 2));
    return diagnostic;
  }, []);

  const fetchScannableTargets = useCallback(async (organizationId = selectedOrgId) => {
    if (!organizationId || !isSuperAdmin) return;
    setTargetsLoading(true);
    try {
      const data = await invokeNucleiScan360<{
        ok?: boolean;
        error?: string;
        targets?: ScannableTarget[];
      }>({
        action: 'retrieve_targets',
        organization_id: organizationId,
        target_limit: 80,
      });
      if (!data?.ok) throw new Error(data?.error || 'Impossibile recuperare i target');
      const nextTargets = (data.targets || []) as ScannableTarget[];
      setScannableTargets(nextTargets);
      if (includeSurfaceAssets) {
        setSelectedTargetUrls(nextTargets.slice(0, 25).map((target) => target.target_url));
      }
    } catch (error) {
      recordDiagnostic(error, 'Target repository non disponibile');
      const message = await extractInvokeErrorMessage(error, 'Target repository non disponibile');
      setScannableTargets([]);
      toast({
        title: 'Target repository non disponibile',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setTargetsLoading(false);
    }
  }, [includeSurfaceAssets, isSuperAdmin, recordDiagnostic, selectedOrgId, toast]);

  useEffect(() => {
    if (!selectedOrgId && selectedOrganization?.id) {
      setSelectedOrgId(selectedOrganization.id);
    } else if (!selectedOrgId && organizations[0]?.id) {
      setSelectedOrgId(organizations[0].id);
    }
  }, [organizations, selectedOrgId, selectedOrganization?.id]);

  const refreshJobs = useCallback(async (organizationId = selectedOrgId) => {
    if (!organizationId || !isSuperAdmin) return;
    setQueueLoading(true);
    try {
      const data = await invokeNucleiScan360<{
        ok?: boolean;
        error?: string;
        jobs?: NucleiJob[];
      }>({
        action: 'list',
        organization_id: organizationId,
        limit: 30,
      });
      if (!data?.ok) throw new Error(data?.error || 'Impossibile leggere la coda NucleiScan360');
      setJobs((data.jobs || []) as NucleiJob[]);
    } catch (error) {
      recordDiagnostic(error, 'Coda NucleiScan360 non disponibile');
      const message = await extractInvokeErrorMessage(error, 'Coda NucleiScan360 non disponibile');
      toast({
        title: 'Coda NucleiScan360 non disponibile',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setQueueLoading(false);
    }
  }, [isSuperAdmin, recordDiagnostic, selectedOrgId, toast]);

  useEffect(() => {
    if (selectedOrgId && isSuperAdmin) {
      refreshJobs(selectedOrgId);
      fetchScannableTargets(selectedOrgId);
    }
  }, [fetchScannableTargets, isSuperAdmin, refreshJobs, selectedOrgId]);

  const targetList = useMemo(
    () => Array.from(new Set([
      ...targetUrl
      .split(/[\n,;]+/)
      .map(normalizeManualTargetToken)
      .filter(Boolean),
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

  const startLabScan = async () => {
    if (!selectedOrgId) {
      toast({
        title: 'Seleziona un cliente',
        description: 'Il LAB Scan360 salva ogni job su un cliente esistente.',
        variant: 'destructive',
      });
      return;
    }
    const safeTimeoutSeconds = clampNumber(timeoutSeconds, profile === 'baseline_headers' ? 45 : isCveProfile(profile) ? 150 : 120, 15, 180);
    const safeRateLimit = clampNumber(rateLimit, profile === 'web_vuln_authorized' ? 2 : isCveProfile(profile) ? 3 : 5, 1, profile === 'web_vuln_authorized' ? 2 : 10);
    const safeMaxFindings = clampNumber(maxFindings, isCveProfile(profile) ? 50 : 25, 1, 200);
    if (safeTimeoutSeconds !== timeoutSeconds) setTimeoutSeconds(safeTimeoutSeconds);
    if (safeRateLimit !== rateLimit) setRateLimit(safeRateLimit);
    if (safeMaxFindings !== maxFindings) setMaxFindings(safeMaxFindings);

    setLoading(true);
    try {
      const data = await invokeNucleiScan360<{
        ok?: boolean;
        error?: string;
        queued_count?: number;
        skipped_duplicates?: number;
        processed_count?: number;
        jobs?: NucleiJob[];
      }>({
        action: 'start_lab_scan',
        organization_id: selectedOrgId,
        targets: targetList,
        nmap_profile: nmapProfile,
        include_discovered_targets: includeSurfaceAssets && selectedTargetUrls.length === 0,
        surface_asset_limit: 25,
        profile,
        timeout_seconds: safeTimeoutSeconds,
        rate_limit: safeRateLimit,
        max_findings: safeMaxFindings,
        authorized_scan: authorizedScan,
      });

      if (!data?.ok) throw new Error(data?.error || 'NucleiScan360 enqueue failed');

      toast({
        title: 'LAB Scan360 avviato',
        description: `${data.queued_count || 0} target in pipeline Nmap/httpx/Nikto/Nuclei per ${selectedOrganizationName}. Kickstart: ${data.processed_count || 0} stage. Duplicati saltati: ${data.skipped_duplicates || 0}.`,
      });
      if (Array.isArray(data.jobs)) {
        setJobs(data.jobs as NucleiJob[]);
        const firstJob = (data.jobs as NucleiJob[]).find((job) => isJobActive(job)) || (data.jobs as NucleiJob[])[0];
        if (firstJob) await openJob(firstJob);
      }
      await refreshJobs(selectedOrgId);
    } catch (error) {
      recordDiagnostic(error, 'LAB Scan360 start errore');
      const message = await extractInvokeErrorMessage(error, 'LAB Scan360 start errore');
      toast({
        title: 'LAB Scan360 start errore',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const openJob = async (job: NucleiJob) => {
    setSelectedJobId(job.id);
    setSelectedJob(job);
    setOpenPorts([]);
    setTechnologies([]);
    setNiktoFindings([]);
    setCveMatches([]);

    setQueueLoading(true);
    try {
      const data = await invokeNucleiScan360<{
        ok?: boolean;
        error?: string;
        job?: NucleiJob & { raw_result?: NucleiResult | null };
        open_ports?: NmapOpenPort[];
        cve_matches?: CveMatch[];
        technologies?: TechnologyFingerprint[];
        nikto_findings?: NiktoFinding[];
      }>({
        action: 'get',
        job_id: job.id,
      });
      if (!data?.ok) throw new Error(data?.error || 'Impossibile aprire job NucleiScan360');
      setSelectedJob((data.job || job) as NucleiJob);
      setOpenPorts((data.open_ports || []) as NmapOpenPort[]);
      setTechnologies((data.technologies || []) as TechnologyFingerprint[]);
      setNiktoFindings((data.nikto_findings || []) as NiktoFinding[]);
      setCveMatches((data.cve_matches || []) as CveMatch[]);
      const nextResult = (data.job?.raw_result || null) as NucleiResult | null;
      setResult(nextResult);
      setRawResult(JSON.stringify({
        job: data.job,
        open_ports: data.open_ports || [],
        technologies: data.technologies || [],
        nikto_findings: data.nikto_findings || [],
        cve_matches: data.cve_matches || [],
        nuclei_result: nextResult,
      }, null, 2));
    } catch (error) {
      recordDiagnostic(error, 'Apertura job fallita');
      const message = await extractInvokeErrorMessage(error, 'Apertura job fallita');
      toast({
        title: 'Apertura job fallita',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setQueueLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedOrgId || !isSuperAdmin) return;
    const hasActiveJobs = jobs.some((job) => isJobActive(job)) || isJobActive(selectedJob);
    if (!hasActiveJobs) return;

    const timer = window.setInterval(async () => {
      await refreshJobs(selectedOrgId);
      if (selectedJobId) {
        const latestSelectedJob = jobs.find((job) => job.id === selectedJobId);
        if (latestSelectedJob) await openJob(latestSelectedJob);
      }
    }, 15000);

    return () => window.clearInterval(timer);
  }, [isSuperAdmin, jobs, refreshJobs, selectedJob, selectedJobId, selectedOrgId]);

  const processNextJob = async () => {
    if (!selectedOrgId) return;
    setProcessingQueue(true);
    try {
      const data = await invokeNucleiScan360<{
        ok?: boolean;
        error?: string;
        processed?: Array<{
          status?: string;
          error?: string;
          job_id?: string;
          result?: NucleiResult;
          nmap_result?: Record<string, unknown>;
          nikto_result?: Record<string, unknown>;
          stage?: string;
        }>;
      }>({
        action: 'process_queue',
        organization_id: selectedOrgId,
        limit: 1,
      });
      if (!data?.ok) throw new Error(data?.error || 'NucleiScan360 queue failed');

      const processed = data.processed?.[0];
      if (processed?.result) {
        setResult(processed.result as NucleiResult);
        setRawResult(JSON.stringify(processed.result, null, 2));
        setSelectedJobId(processed.job_id || '');
      } else if (processed?.nmap_result) {
        setRawResult(JSON.stringify(processed.nmap_result, null, 2));
        setSelectedJobId(processed.job_id || '');
      } else if (processed?.nikto_result) {
        setRawResult(JSON.stringify(processed.nikto_result, null, 2));
        setSelectedJobId(processed.job_id || '');
      }
      toast({
        title: processed ? `Job ${processed.stage || processed.status}` : 'Nessun job in coda',
        description: processed?.error || (processed?.result
          ? `${(processed.result.findings || []).length} finding salvati in Supabase.`
          : processed?.nmap_result
            ? `${processed.nmap_result.open_port_count || 0} porte aperte salvate. Nikto è il prossimo stage.`
            : processed?.nikto_result
              ? `${processed.nikto_result.findings_count || 0} finding Nikto salvati. Nuclei partirà dopo la finestra di attesa.`
            : 'La coda è vuota.'),
        variant: processed?.status === 'failed' || processed?.status === 'timeout' ? 'destructive' : 'default',
      });
      await refreshJobs(selectedOrgId);
    } catch (error) {
      recordDiagnostic(error, 'Processamento coda fallito');
      const message = await extractInvokeErrorMessage(error, 'Processamento coda fallito');
      toast({
        title: 'Processamento coda fallito',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setProcessingQueue(false);
    }
  };

  const runSmokeTest = async () => {
    if (!selectedOrgId) return;
    setSmokeLoading(true);
    try {
      const data = await invokeNucleiScan360<{
        ok?: boolean;
        error?: string;
        request_id?: string;
        checks?: Array<{ name: string; ok: boolean; message?: string; duration_ms?: number; details?: Record<string, unknown> }>;
        warnings?: string[];
        duration_ms?: number;
      }>({
        action: 'smoke_test',
        organization_id: selectedOrgId,
        target_limit: 25,
      }, 1);

      setLastDiagnostic(null);
      setRawResult(JSON.stringify(data, null, 2));
      toast({
        title: data.ok ? 'Smoke test OK' : 'Smoke test con warning',
        description: `request_id=${data.request_id || '—'} · check=${data.checks?.filter((check) => check.ok).length || 0}/${data.checks?.length || 0}`,
        variant: data.ok ? 'default' : 'destructive',
      });
    } catch (error) {
      recordDiagnostic(error, 'Smoke test fallito');
      const message = await extractInvokeErrorMessage(error, 'Smoke test fallito');
      toast({
        title: 'Smoke test fallito',
        description: message,
        variant: 'destructive',
      });
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
      technologies,
      niktoFindings,
      cveMatches,
      nucleiFindings: findings,
      nucleiResult: result,
    });
  };

  const downloadSelectedJobJsonReport = () => {
    if (!selectedJob) return;
    const payload = {
      report_type: 'nuclei_scan360_lab_job',
      generated_at: new Date().toISOString(),
      organization: {
        id: selectedOrgId || selectedJob.organization_id,
        name: selectedOrganizationName,
      },
      job: selectedJob,
      unified_verdict: selectedJob.unified_verdict || null,
      open_ports: openPorts,
      technologies,
      nikto_findings: niktoFindings,
      cve_matches: cveMatches,
      nuclei_findings: findings,
      nuclei_result: result,
      interpretation: {
        confirmed_cve_count: confirmedCveMatches.length,
        potential_cve_count: potentialCveMatches.length,
        nikto_finding_count: niktoFindings.length,
        technology_count: technologies.length,
        open_port_count: openPorts.length,
        note: '0 CVE indica nessun match confermato/potenziale nella pipeline Nmap/httpx/NVD/Nuclei, non assenza assoluta di vulnerabilita.',
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
    toast({
      title: 'Report esportato',
      description: 'Report JSON NUCLEI-SCAN360 generato dal job selezionato.',
    });
  };

  const downloadSelectedJobPdfReport = () => {
    const report = buildSelectedSurfaceReport();
    if (!report) return;
    setReportExporting('pdf');
    try {
      generateSurfaceScan360Pdf(report);
      toast({
        title: 'Report PDF generato',
        description: 'Template SurfaceScan360 con evidenze Nmap/httpx, Nikto, Nuclei e verdetto unico.',
      });
    } catch (error) {
      toast({
        title: 'Export PDF fallito',
        description: error instanceof Error ? error.message : 'Impossibile generare il report PDF.',
        variant: 'destructive',
      });
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
      toast({
        title: 'Report DOCX generato',
        description: 'Documento editabile SurfaceScan360 con pipeline LAB multi-engine.',
      });
    } catch (error) {
      toast({
        title: 'Export DOCX fallito',
        description: error instanceof Error ? error.message : 'Impossibile generare il report DOCX.',
        variant: 'destructive',
      });
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
            <a
              href={nvdDetailUrl(match.cve_id)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-fit items-center gap-1 font-medium text-primary hover:underline"
            >
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
          Nessuna tecnologia rilevata da httpx/Wappalyzer per questo job. Versione non rilevata non significa tecnologia assente.
        </TableCell>
      </TableRow>
    ) : technologies.map((technology) => {
      const evidence = technology.evidence || {};
      const evidenceLine = [
        evidence.status_code ? `HTTP ${evidence.status_code}` : '',
        evidence.webserver ? `server ${evidence.webserver}` : '',
        evidence.title ? `title ${String(evidence.title).slice(0, 64)}` : '',
      ].filter(Boolean).join(' · ');
      return (
        <TableRow key={`${technology.id || technology.name}-${technology.url || technology.port}`}>
          <TableCell>
            <div className="flex flex-col gap-1">
              <span className="font-medium">{technology.name || '—'}</span>
              <span className="text-xs text-muted-foreground">{technology.version || 'versione non rilevata'}</span>
            </div>
          </TableCell>
          <TableCell>
            <div className="flex flex-wrap gap-1">
              {technology.source && <Badge variant="outline">{technology.source}</Badge>}
              {technology.confidence && <Badge variant={technology.confidence === 'medium' ? 'secondary' : 'outline'}>{technology.confidence}</Badge>}
            </div>
          </TableCell>
          <TableCell className="max-w-[240px]">
            <div className="flex flex-col gap-1">
              <span className="truncate font-mono text-xs">{technology.url || technology.asset_host || '—'}</span>
              {technology.port && <span className="text-xs text-muted-foreground">porta {technology.port}</span>}
            </div>
          </TableCell>
          <TableCell className="max-w-[260px]">
            <div className="flex flex-col gap-1">
              {(technology.cpe_candidates || []).length === 0 ? (
                <span className="text-xs text-muted-foreground">CPE non generato senza versione concreta</span>
              ) : technology.cpe_candidates?.map((cpe) => (
                <span key={cpe} className="line-clamp-2 font-mono text-[11px] text-muted-foreground">{cpe}</span>
              ))}
            </div>
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
          Nessun finding Nikto salvato per questo job. Nikto segnala configurazioni e superfici sospette; Nuclei conferma CVE tecniche.
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
          <div className="flex flex-col gap-1">
            {(finding.references || []).length === 0 ? (
              <span className="text-xs text-muted-foreground">—</span>
            ) : finding.references?.slice(0, 3).map((reference) => (
              <span key={reference} className="truncate font-mono text-[11px] text-muted-foreground">{reference}</span>
            ))}
          </div>
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
                <p className="text-muted-foreground">LAB multi-engine con Nmap/httpx, Nikto e Nuclei su Cloudflare Container, reportizzato nel formato SurfaceScan360.</p>
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
                    {organizations.map((organization) => (
                      <SelectItem key={organization.id} value={organization.id}>
                        {organization.name}
                      </SelectItem>
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
                  onChange={(event) => setTargetUrl(event.target.value)}
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
                    setSelectedTargetUrls(enabled ? scannableTargets.slice(0, 25).map((target) => target.target_url) : []);
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
                    <Button variant="outline" size="sm" onClick={() => fetchScannableTargets()} disabled={targetsLoading || !selectedOrgId}>
                      {targetsLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                      Get
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="flex max-h-72 flex-col gap-2 overflow-auto">
                  {targetsLoading ? (
                    <div className="flex items-center gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Recupero domini e sottodomini cliente…
                    </div>
                  ) : scannableTargets.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                      Nessun dominio scansionabile trovato. Inserisci un target manuale o verifica SurfaceScan360/DarkRisk.
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
                <Select value={nmapProfile} onValueChange={(value) => setNmapProfile(value as NmapProfile)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(NMAP_PROFILE_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{NMAP_PROFILE_DESCRIPTIONS[nmapProfile]}</p>
              </div>

              <div className="flex flex-col gap-2">
                <Label>Profilo Nuclei</Label>
                <Select value={profile} onValueChange={(value) => setProfile(value as NucleiProfile)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PROFILE_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{PROFILE_DESCRIPTIONS[profile]}</p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="timeout_seconds">Timeout</Label>
                  <Input
                    id="timeout_seconds"
                    type="number"
                    min={15}
                    max={180}
                    value={timeoutSeconds}
                    onChange={(event) => setTimeoutSeconds(Number(event.target.value))}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="rate_limit">Rate</Label>
                  <Input
                    id="rate_limit"
                    type="number"
                    min={1}
                    max={10}
                    value={rateLimit}
                    onChange={(event) => setRateLimit(Number(event.target.value))}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="max_findings">Max</Label>
                  <Input
                    id="max_findings"
                    type="number"
                    min={1}
                    max={100}
                    value={maxFindings}
                    onChange={(event) => setMaxFindings(Number(event.target.value))}
                  />
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-lg border p-3">
                <Checkbox
                  id="authorized_scan"
                  checked={authorizedScan}
                  onCheckedChange={(checked) => setAuthorizedScan(checked === true)}
                />
                <div className="flex flex-col gap-1">
                  <Label htmlFor="authorized_scan">Target autorizzato</Label>
                  <p className="text-xs text-muted-foreground">Necessario solo per `web_vuln_authorized`; mantiene rate limit massimo 2.</p>
                </div>
              </div>

              <Button className="w-full" onClick={startLabScan} disabled={loading || !selectedOrgId || (!targetList.length && !includeSurfaceAssets)}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}
                Avvia LAB Scan360
              </Button>

              <Button className="w-full" variant="secondary" onClick={processNextJob} disabled={processingQueue || !selectedOrgId}>
                {processingQueue ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
                Processa prossimo stage
              </Button>
              <Button className="w-full" variant="outline" onClick={runSmokeTest} disabled={smokeLoading || !selectedOrgId}>
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
                  <CardTitle>{result?.nuclei_version || '—'}</CardTitle>
                </CardHeader>
              </Card>
              <Card className="bg-gradient-to-br from-card to-muted/20">
                <CardHeader className="pb-2">
                  <CardDescription>Template</CardDescription>
                  <CardTitle>{result?.templates_executed_count ?? '—'}</CardTitle>
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
                  <CardTitle>{result?.duration_ms ? `${Math.round(result.duration_ms / 1000)}s` : '—'}</CardTitle>
                </CardHeader>
              </Card>
            </div>

            <Card className="border-primary/20">
              <CardHeader>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <CardTitle>Coda NUCLEI-SCAN360</CardTitle>
                    <CardDescription>
                      Job persistenti su Supabase per {selectedOrganizationName}. Il cron LAB processa Nmap/httpx, Nikto, attesa safe e Nuclei fino al report finale.
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => refreshJobs()} disabled={queueLoading || !selectedOrgId}>
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
                    {jobs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                          Nessun job LAB per questo cliente. Inserisci IP, dominio o CIDR e avvia LAB Scan360.
                        </TableCell>
                      </TableRow>
                    ) : jobs.map((job) => (
                      <TableRow key={job.id} className={cn(selectedJobId === job.id && 'bg-muted/40')}>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Badge className={stageClass(job.stage || job.status)}>{job.stage || job.status}</Badge>
                            <Badge className={statusClass(job.status)}>{job.status}</Badge>
                            {job.stage === 'waiting_nuclei' && <span className="text-xs text-muted-foreground">Nuclei tra {formatCountdown(job.next_run_at)}</span>}
                            {job.source && <span className="text-xs text-muted-foreground">{job.source}</span>}
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
	                            <span className="text-xs text-muted-foreground">{job.open_port_count ?? 0} porte · {job.technology_count ?? 0} tech · {job.nikto_findings_count ?? 0} nikto · {job.templates_executed_count ?? 0} template</span>
	                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                            <span>creato {formatDateTime(job.created_at)}</span>
                            <span>fine {formatDateTime(job.completed_at)}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" onClick={() => openJob(job)} disabled={queueLoading}>
                            Apri
                          </Button>
                        </TableCell>
                      </TableRow>
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
                        Report DOCX
                      </Button>
                      <Button variant="outline" size="sm" onClick={downloadSelectedJobJsonReport} disabled={reportExporting !== null}>
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
                          <CardDescription>
                            Sintesi multi-engine: Nmap/httpx per contesto, Nikto per misconfiguration/exposure, Nuclei per CVE confermate e NVD per CVE potenziali.
                          </CardDescription>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className={verdictClass(unifiedVerdict?.level)}>{unifiedVerdict?.level || 'non calcolato'}</Badge>
                          <Badge variant="outline">score {formatScore(unifiedVerdict?.score)}</Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="grid gap-3 md:grid-cols-5">
                      {([
                        ['nmap', 'Nmap'],
                        ['httpx', 'httpx tech'],
                        ['nikto', 'Nikto'],
                        ['nuclei', 'Nuclei'],
                        ['report', 'Report'],
                      ] as const).map(([engine, label]) => {
                        const meta = engineStatusMeta(engine, selectedJob);
                        return (
                          <div key={engine} className="rounded-lg border p-3">
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <span className="text-sm font-medium">{label}</span>
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
                    <CardContent className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
                      <div className="rounded-lg border p-3">
                        <h3 className="mb-2 text-sm font-medium">Motivazioni</h3>
                        <div className="flex flex-col gap-2">
                          {(unifiedVerdict?.reasons || ['Verdetto non ancora disponibile: completa Nmap, Nikto e Nuclei.']).map((reason) => (
                            <div key={reason} className="text-sm text-muted-foreground">{reason}</div>
                          ))}
                        </div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-5">
                        {(['nmap', 'httpx', 'nikto', 'nuclei', 'nvd'] as const).map((engine) => {
                          const values = (unifiedVerdict?.engines?.[engine] || {}) as Record<string, unknown>;
                          const firstMetric = Object.entries(values)[0];
                          return (
                            <div key={engine} className="rounded-lg border p-3">
                              <div className="text-xs uppercase text-muted-foreground">{engine}</div>
                              <div className="mt-1 text-lg font-semibold">{formatEngineValue(firstMetric?.[1])}</div>
                              <div className="truncate text-xs text-muted-foreground">{firstMetric?.[0]?.replace(/_/g, ' ') || '—'}</div>
                            </div>
                          );
                        })}
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
                              <TableCell>
                                <Badge variant="outline">{port.protocol || 'tcp'}/{port.port}</Badge>
                              </TableCell>
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
	                        httpx/Wappalyzer HTTP fingerprint · {selectedJob.fingerprint_status || 'non avviato'} · {selectedJob.fingerprint_duration_ms ? `${Math.round(selectedJob.fingerprint_duration_ms / 1000)}s` : '—'} · {technologies.length} tecnologie. Versioni e CPE sono usati solo quando concreti.
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
	                        <TableBody>
	                          {renderTechnologyRows()}
	                        </TableBody>
	                      </Table>
	                    </CardContent>
	                  </Card>

	                  <Card className="xl:col-span-2">
	                    <CardHeader>
	                      <CardTitle className="text-base">Nikto</CardTitle>
	                      <CardDescription>
	                        {selectedJob.nikto_version || 'versione Nikto non ancora disponibile'} · {selectedJob.nikto_status || 'non avviato'} · durata {selectedJob.nikto_duration_ms ? `${Math.round(selectedJob.nikto_duration_ms / 1000)}s` : '—'} · {niktoFindings.length} finding. Nikto segnala configurazioni e superfici sospette; Nuclei conferma CVE tecniche.
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
	                        <TableBody>
	                          {renderNiktoRows()}
	                        </TableBody>
	                      </Table>
	                    </CardContent>
	                  </Card>

	                  <Card className="xl:col-span-2">
	                    <CardHeader>
	                      <CardTitle className="text-base">CVE intelligence</CardTitle>
                      <CardDescription>
                        {confirmedCveMatches.length} confermate da Nuclei · {potentialCveMatches.length} potenziali da NVD/CPE. Zero CVE indica nessun match in questa pipeline, non assenza assoluta di vulnerabilità.
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
                          <TableBody>
                            {renderCveRows(confirmedCveMatches, 'Nessuna CVE confermata dai template Nuclei per questo job.')}
                          </TableBody>
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
                          <TableBody>
	                            {renderCveRows(potentialCveMatches, 'Nessuna CVE potenziale da CPE Nmap/NVD o tecnologia versionata per questo job.')}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                </CardContent>
              </Card>
            )}

            {result && (
              <Card className="border-primary/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    Executive parser
                  </CardTitle>
                  <CardDescription>
                    {result.target_url} → {result.resolved_target_url || result.target_url}
                  </CardDescription>
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
                        Requests
                      </div>
                      <p className="mt-2 text-2xl font-semibold">{analysis.stats.requests}</p>
                      <p className="text-xs text-muted-foreground">errori: {analysis.stats.errors}</p>
                    </div>
                    <div className="rounded-xl border bg-muted/20 p-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        Cluster
                      </div>
                      <p className="mt-2 truncate text-sm font-medium">{analysis.stats.clustered}</p>
                      <p className="text-xs text-muted-foreground">scan: {analysis.stats.completed}</p>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Finding per severità</CardTitle>
                        <CardDescription>Distribuzione normalizzata dal parser.</CardDescription>
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
                                {analysis.severityRows.map((row) => (
                                  <Cell key={row.severity} fill={row.fill} />
                                ))}
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
                        <CardDescription>HTTP, SSL e altri tipi rilevati.</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {analysis.typeRows.length > 0 ? (
                          <ChartContainer config={typeChartConfig} className="h-[230px] w-full">
                            <PieChart>
                              <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                              <Pie data={analysis.typeRows} dataKey="count" nameKey="type" innerRadius={52} outerRadius={86} paddingAngle={3}>
                                {analysis.typeRows.map((row) => (
                                  <Cell key={row.type} fill={row.fill} />
                                ))}
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
                        <CardDescription>Host ordinati per numero di match.</CardDescription>
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
                              <TableRow>
                                <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">Nessun asset con finding.</TableCell>
                              </TableRow>
                            ) : analysis.assetRows.map((row) => (
                              <TableRow key={row.asset}>
                                <TableCell className="max-w-[260px] truncate font-mono text-xs">{row.asset}</TableCell>
                                <TableCell className="text-right font-medium">{row.count}</TableCell>
                                <TableCell>
                                  <div className="flex flex-wrap gap-1">
                                    {SEVERITY_ORDER.filter((severity) => row.severities[severity]).map((severity) => (
                                      <Badge key={severity} className={severityClass(severity)}>{severity}: {row.severities[severity]}</Badge>
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
                        <CardDescription>Parser per tag, template-id e tipo di finding.</CardDescription>
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
                              <TableRow>
                                <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">Nessun template con match.</TableCell>
                              </TableRow>
                            ) : analysis.templateRows.map((row) => (
                              <TableRow key={row.template_id}>
                                <TableCell>
                                  <div className="flex flex-col gap-1">
                                    <span className="font-medium">{row.name}</span>
                                    <span className="font-mono text-xs text-muted-foreground">{row.template_id}</span>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline">{row.category}</Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                  <Badge className={severityClass(row.severity)}>{row.count}</Badge>
                                </TableCell>
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
                      <CardDescription>Tabella operativa ordinata per severità, categoria e nome.</CardDescription>
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
                            <TableRow>
                              <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Nessun finding nel limite richiesto.</TableCell>
                            </TableRow>
                          ) : findings.map((finding) => (
                            <TableRow key={finding.id}>
                              <TableCell>
                                <Badge className={severityClass(finding.severityKey)}>{finding.severityKey}</Badge>
                              </TableCell>
                              <TableCell className="max-w-[320px]">
                                <div className="flex flex-col gap-1">
                                  <span className="font-medium">{finding.label}</span>
                                  <span className="font-mono text-xs text-muted-foreground">{finding.template_id}</span>
                                </div>
                              </TableCell>
                              <TableCell className="max-w-[240px] truncate font-mono text-xs">{finding.matched_at || finding.asset}</TableCell>
                              <TableCell>
                                <Badge variant="outline">{finding.category}</Badge>
                              </TableCell>
                              <TableCell className="max-w-[320px]">
                                <pre className="max-h-24 overflow-auto rounded bg-muted p-2 text-xs">
                                  {finding.evidence || '—'}
                                </pre>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>

                  {analysis.warnings.length > 0 && (
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Warning tecnici</AlertTitle>
                      <AlertDescription>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {analysis.warnings.slice(0, 8).map((warning) => (
                            <Badge key={warning} variant="outline">{warning}</Badge>
                          ))}
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            )}

            {lastDiagnostic && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Diagnostica ultima chiamata NucleiScan360</AlertTitle>
                <AlertDescription>
                  <div className="mt-2 grid gap-2 text-xs md:grid-cols-2">
                    <span><strong>fase:</strong> {lastDiagnostic.phase}</span>
                    <span><strong>request_id:</strong> {lastDiagnostic.request_id}</span>
                    <span><strong>status:</strong> {lastDiagnostic.status ?? 'network'}</span>
                    <span><strong>retry:</strong> {lastDiagnostic.retry_count}</span>
                    <span className="md:col-span-2"><strong>endpoint:</strong> {lastDiagnostic.endpoint}</span>
                    <span className="md:col-span-2"><strong>messaggio:</strong> {lastDiagnostic.message}</span>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            <Card>
              <CardHeader>
                <CardTitle>JSON debug</CardTitle>
                <CardDescription>Output normalizzato dal container, utile per validare l’MVP.</CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  className="min-h-[280px] font-mono text-xs"
                  value={rawResult}
                  readOnly
                  placeholder="Avvia una scansione per vedere il JSON completo."
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
