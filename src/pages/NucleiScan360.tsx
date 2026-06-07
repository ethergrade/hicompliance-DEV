import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Database, Loader2, PlayCircle, Radar, RefreshCcw, Route, ShieldAlert, Target, TerminalSquare } from 'lucide-react';
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
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

type NucleiProfile = 'baseline_headers' | 'exposure_medium' | 'web_vuln_safe' | 'web_vuln_authorized';

type NucleiFinding = {
  template_id?: string;
  name?: string | null;
  severity?: string | null;
  type?: string | null;
  matched_at?: string | null;
  matcher_name?: string | null;
  extracted_results?: string[];
  tags?: string[];
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
  resolved_target_url?: string | null;
  target_host?: string | null;
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
  web_vuln_authorized: 'Web vuln authorized',
};

const PROFILE_DESCRIPTIONS: Record<NucleiProfile, string> = {
  baseline_headers: 'Solo header di sicurezza e TLS basic. Profilo rapido per smoke test.',
  exposure_medium: 'Exposure, misconfiguration, file disclosure, panel e tecnologie con template non distruttivi.',
  web_vuln_safe: 'Vulnerabilità HTTP non distruttive low/medium/high/critical.',
  web_vuln_authorized: 'DAST/fuzz a bassa aggressività. Richiede autorizzazione esplicita.',
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
  const [targetUrl, setTargetUrl] = useState('https://example.com');
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [includeSurfaceAssets, setIncludeSurfaceAssets] = useState(true);
  const [profile, setProfile] = useState<NucleiProfile>('baseline_headers');
  const [authorizedScan, setAuthorizedScan] = useState(false);
  const [timeoutSeconds, setTimeoutSeconds] = useState(45);
  const [rateLimit, setRateLimit] = useState(5);
  const [maxFindings, setMaxFindings] = useState(25);
  const [loading, setLoading] = useState(false);
  const [queueLoading, setQueueLoading] = useState(false);
  const [processingQueue, setProcessingQueue] = useState(false);
  const [jobs, setJobs] = useState<NucleiJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [result, setResult] = useState<NucleiResult | null>(null);
  const [rawResult, setRawResult] = useState('');

  const analysis = useMemo(() => parseNucleiResult(result), [result]);
  const findings = analysis.findings;
  const selectedOrganizationName = useMemo(
    () => organizations.find((organization) => organization.id === selectedOrgId)?.name || selectedOrganization?.name || 'Cliente non selezionato',
    [organizations, selectedOrgId, selectedOrganization?.name],
  );

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
      const { data, error } = await supabase.functions.invoke('nuclei-scan360', {
        body: {
          action: 'list',
          organization_id: organizationId,
          limit: 30,
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Impossibile leggere la coda NucleiScan360');
      setJobs((data.jobs || []) as NucleiJob[]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast({
        title: 'Coda NucleiScan360 non disponibile',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setQueueLoading(false);
    }
  }, [isSuperAdmin, selectedOrgId, toast]);

  useEffect(() => {
    if (selectedOrgId && isSuperAdmin) {
      refreshJobs(selectedOrgId);
    }
  }, [isSuperAdmin, refreshJobs, selectedOrgId]);

  const targetList = useMemo(
    () => targetUrl
      .split(/[\n,]+/)
      .map((target) => target.trim())
      .filter(Boolean),
    [targetUrl],
  );

  const enqueueScan = async () => {
    if (!selectedOrgId) {
      toast({
        title: 'Seleziona un cliente',
        description: 'La coda NUCLEI-SCAN360 salva ogni job su un cliente esistente.',
        variant: 'destructive',
      });
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('nuclei-scan360', {
        body: {
          action: 'enqueue',
          organization_id: selectedOrgId,
          targets: targetList,
          include_surface_assets: includeSurfaceAssets,
          surface_asset_limit: 25,
          profile,
          timeout_seconds: timeoutSeconds,
          rate_limit: rateLimit,
          max_findings: maxFindings,
          authorized_scan: authorizedScan,
        },
      });

      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'NucleiScan360 enqueue failed');

      toast({
        title: 'Job accodati',
        description: `${data.queued_count || 0} target in coda per ${selectedOrganizationName}. Duplicati saltati: ${data.skipped_duplicates || 0}.`,
      });
      await refreshJobs(selectedOrgId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast({
        title: 'NucleiScan360 enqueue errore',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const openJob = async (job: NucleiJob) => {
    setSelectedJobId(job.id);
    if (job.raw_result && Object.keys(job.raw_result).length > 0) {
      setResult(job.raw_result);
      setRawResult(JSON.stringify(job.raw_result, null, 2));
      return;
    }

    setQueueLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('nuclei-scan360', {
        body: {
          action: 'get',
          job_id: job.id,
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Impossibile aprire job NucleiScan360');
      const nextResult = (data.job?.raw_result || null) as NucleiResult | null;
      setResult(nextResult);
      setRawResult(nextResult ? JSON.stringify(nextResult, null, 2) : JSON.stringify(data, null, 2));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast({
        title: 'Apertura job fallita',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setQueueLoading(false);
    }
  };

  const processNextJob = async () => {
    if (!selectedOrgId) return;
    setProcessingQueue(true);
    try {
      const { data, error } = await supabase.functions.invoke('nuclei-scan360', {
        body: {
          action: 'process_queue',
          organization_id: selectedOrgId,
          limit: 1,
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'NucleiScan360 queue failed');

      const processed = data.processed?.[0];
      if (processed?.result) {
        setResult(processed.result as NucleiResult);
        setRawResult(JSON.stringify(processed.result, null, 2));
        setSelectedJobId(processed.job_id || '');
      }
      toast({
        title: processed ? `Job ${processed.status}` : 'Nessun job in coda',
        description: processed?.error || (processed?.result ? `${(processed.result.findings || []).length} finding salvati in Supabase.` : 'La coda è vuota.'),
        variant: processed?.status === 'failed' || processed?.status === 'timeout' ? 'destructive' : 'default',
      });
      await refreshJobs(selectedOrgId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast({
        title: 'Processamento coda fallito',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setProcessingQueue(false);
    }
  };

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
                <p className="text-muted-foreground">Scanner Nuclei via Cloudflare Container, separato da SurfaceScan360 e pensato per analisi controllate.</p>
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
                <Input
                  id="target_url"
                  value={targetUrl}
                  onChange={(event) => setTargetUrl(event.target.value)}
                  placeholder="https://example.com oppure dominio.it"
                />
                <p className="text-xs text-muted-foreground">Puoi separare più target con virgole o nuove righe.</p>
              </div>

              <div className="flex items-start gap-3 rounded-lg border p-3">
                <Checkbox
                  id="include_surface_assets"
                  checked={includeSurfaceAssets}
                  onCheckedChange={(checked) => setIncludeSurfaceAssets(checked === true)}
                />
                <div className="flex flex-col gap-1">
                  <Label htmlFor="include_surface_assets">Includi asset SurfaceScan360</Label>
                  <p className="text-xs text-muted-foreground">Accoda fino a 25 domain/subdomain/url già presenti per il cliente.</p>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label>Profilo</Label>
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

              <Button className="w-full" onClick={enqueueScan} disabled={loading || !selectedOrgId || (!targetList.length && !includeSurfaceAssets)}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}
                Accoda target
              </Button>

              <Button className="w-full" variant="secondary" onClick={processNextJob} disabled={processingQueue || !selectedOrgId}>
                {processingQueue ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
                Processa prossimo job
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
                      Job salvati su Supabase per {selectedOrganizationName}. Processali uno alla volta per gestire scan lunghi senza bloccare tutto.
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
                          Nessun job Nuclei per questo cliente. Accoda un target manuale o importa asset SurfaceScan360.
                        </TableCell>
                      </TableRow>
                    ) : jobs.map((job) => (
                      <TableRow key={job.id} className={cn(selectedJobId === job.id && 'bg-muted/40')}>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Badge className={statusClass(job.status)}>{job.status}</Badge>
                            {job.source && <span className="text-xs text-muted-foreground">{job.source}</span>}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[280px]">
                          <div className="flex flex-col gap-1">
                            <span className="truncate font-mono text-xs">{job.target_url}</span>
                            {job.resolved_target_url && job.resolved_target_url !== job.target_url && (
                              <span className="truncate text-xs text-muted-foreground">→ {job.resolved_target_url}</span>
                            )}
                            {job.last_error && <span className="line-clamp-2 text-xs text-destructive">{job.last_error}</span>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Badge variant="outline">{PROFILE_LABELS[job.profile] || job.profile}</Badge>
                            <span className="text-xs text-muted-foreground">rate {job.rate_limit || '—'} · timeout {job.timeout_seconds || '—'}s</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-col items-end gap-1">
                            <span className="font-semibold">{job.findings_count ?? 0}</span>
                            <span className="text-xs text-muted-foreground">{job.templates_executed_count ?? 0} template</span>
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
