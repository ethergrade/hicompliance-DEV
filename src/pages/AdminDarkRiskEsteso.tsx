import React, { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserRoles } from '@/hooks/useUserRoles';
import { Navigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ShieldAlert,
  PlayCircle,
  Loader2,
  Building2,
  Mail,
  Clock,
  Zap,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Users,
  Calendar,
  RefreshCw,
  Plus,
  Trash2,
  Eye,
  Globe,
  Timer,
} from 'lucide-react';
import { toast } from 'sonner';

const IDENTITY_EXPIRY = '2026-06-10';

type OrgRow = {
  id: string;
  name: string;
  code: string;
};

type EstesoProfile = {
  organization_id: string;
  enabled: boolean;
  manual_only: boolean;
  identity_model_valid_until: string;
  cron_enabled: boolean;
  last_cron_run_at: string | null;
  next_cron_run_at: string | null;
  notes: string | null;
};

type ScanRun = {
  id: string;
  organization_id: string;
  status: string;
  trigger_type: string;
  started_at: string | null;
  completed_at: string | null;
  warnings: string[];
  stats: Record<string, unknown>;
  error_message: string | null;
};

type FindingRow = {
  id: string;
  organization_id: string;
  finding_type: string;
  title: string;
  severity: string;
  status: string;
  risk_score: number | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  metadata: Record<string, unknown>;
};

type ClientEmailRow = {
  id: string;
  normalized_value: string;
  status: string;
  created_at: string;
};

type ClientData = OrgRow & {
  profile: EstesoProfile | null;
  lastRun: ScanRun | null;
  emailCount: number;
};

function fmtDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function fmtDateShort(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('it-IT');
}

function isExpired(validUntil: string | null | undefined): boolean {
  const v = String(validUntil || IDENTITY_EXPIRY);
  return new Date().toISOString().slice(0, 10) > v;
}

function severityColor(sev: string): string {
  switch (sev) {
    case 'critical': return 'text-red-400';
    case 'high': return 'text-orange-400';
    case 'medium': return 'text-yellow-400';
    case 'low': return 'text-blue-400';
    default: return 'text-muted-foreground';
  }
}

function severityBadge(sev: string): 'default' | 'destructive' | 'secondary' | 'outline' {
  if (sev === 'critical' || sev === 'high') return 'destructive';
  if (sev === 'medium') return 'secondary';
  return 'outline';
}

function statusIcon(status: string | null | undefined) {
  if (status === 'completed' || status === 'completed_with_warnings') return <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />;
  if (status === 'failed') return <XCircle className="w-3.5 h-3.5 text-red-400" />;
  if (status === 'running') return <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />;
  return <Clock className="w-3.5 h-3.5 text-muted-foreground" />;
}

function findingTypeLabel(ft: string): string {
  if (ft.includes('credential')) return 'Credential Leak';
  if (ft.includes('identity_leak')) return 'Identity Leak';
  if (ft.includes('identity')) return 'Identity Exposure';
  if (ft.includes('domain_leak')) return 'Domain Leak';
  if (ft.includes('domain')) return 'Domain Exposure';
  if (ft.includes('signal')) return 'OSINT Signal';
  return ft.replace('intelx_', '').replace(/_/g, ' ');
}

const AdminDarkRiskEsteso: React.FC = () => {
  const { isSuperAdmin, loading: rolesLoading } = useUserRoles();
  const queryClient = useQueryClient();

  const [configOrgId, setConfigOrgId] = useState<string | null>(null);
  const [configTab, setConfigTab] = useState<'settings' | 'emails'>('settings');
  const [newEmail, setNewEmail] = useState('');
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set());
  const [findingOrgFilter, setFindingOrgFilter] = useState<string>('all');
  const [findingSevFilter, setFindingSevFilter] = useState<string>('all');

  // ── Clients query ──────────────────────────────────────────────────────────
  const { data: clients = [], isLoading: clientsLoading, refetch: refetchClients } = useQuery({
    queryKey: ['admin-esteso-clients'],
    queryFn: async (): Promise<ClientData[]> => {
      const [orgsRes, profilesRes, runsRes, emailCountsRes] = await Promise.all([
        supabase.from('organizations').select('id, name, code').order('name'),
        supabase.from('darkrisk_esteso_profiles' as any)
          .select('organization_id, enabled, manual_only, identity_model_valid_until, cron_enabled, last_cron_run_at, next_cron_run_at, notes'),
        supabase.from('darkrisk_scan_runs' as any)
          .select('id, organization_id, status, trigger_type, started_at, completed_at, warnings, stats, error_message')
          .in('trigger_type', ['darkrisk_esteso_manual', 'darkrisk_esteso_cron'])
          .order('started_at', { ascending: false })
          .limit(400),
        supabase.from('darkrisk_selectors' as any)
          .select('organization_id')
          .eq('selector_type', 'email')
          .eq('source', 'manual')
          .in('status', ['approved', 'candidate']),
      ]);

      if (orgsRes.error) throw orgsRes.error;

      const profileMap = new Map<string, EstesoProfile>();
      for (const p of (profilesRes.data || []) as EstesoProfile[]) {
        profileMap.set(p.organization_id, p);
      }

      const lastRunMap = new Map<string, ScanRun>();
      for (const r of (runsRes.data || []) as ScanRun[]) {
        if (!lastRunMap.has(r.organization_id)) lastRunMap.set(r.organization_id, r);
      }

      const emailCountMap = new Map<string, number>();
      for (const e of (emailCountsRes.data || []) as Array<{ organization_id: string }>) {
        emailCountMap.set(e.organization_id, (emailCountMap.get(e.organization_id) || 0) + 1);
      }

      return (orgsRes.data || []).map((org): ClientData => ({
        id: org.id,
        name: org.name,
        code: org.code,
        profile: profileMap.get(org.id) || null,
        lastRun: lastRunMap.get(org.id) || null,
        emailCount: emailCountMap.get(org.id) || 0,
      }));
    },
    staleTime: 30_000,
    refetchInterval: 45_000,
  });

  // ── Findings query ─────────────────────────────────────────────────────────
  const { data: findings = [], isLoading: findingsLoading } = useQuery({
    queryKey: ['admin-esteso-findings', findingOrgFilter, findingSevFilter],
    queryFn: async (): Promise<FindingRow[]> => {
      let q = (supabase.from('darkrisk_findings' as any) as any)
        .select('id, organization_id, finding_type, title, severity, status, risk_score, first_seen_at, last_seen_at, metadata')
        .ilike('finding_type', '%intelx%')
        .order('last_seen_at', { ascending: false })
        .limit(300);

      if (findingOrgFilter !== 'all') q = q.eq('organization_id', findingOrgFilter);
      if (findingSevFilter !== 'all') q = q.eq('severity', findingSevFilter);

      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as FindingRow[];
    },
    staleTime: 60_000,
  });

  // ── Emails for selected client ─────────────────────────────────────────────
  const { data: clientEmails = [], refetch: refetchEmails } = useQuery({
    queryKey: ['admin-esteso-emails', configOrgId],
    enabled: Boolean(configOrgId),
    queryFn: async (): Promise<ClientEmailRow[]> => {
      if (!configOrgId) return [];
      const { data, error } = await (supabase.from('darkrisk_selectors' as any) as any)
        .select('id, normalized_value, status, created_at')
        .eq('organization_id', configOrgId)
        .eq('selector_type', 'email')
        .eq('source', 'manual')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as ClientEmailRow[];
    },
    staleTime: 15_000,
  });

  // ── Mutations ──────────────────────────────────────────────────────────────
  const toggleEstesoMutation = useMutation({
    mutationFn: async ({ orgId, enabled }: { orgId: string; enabled: boolean }) => {
      const { error } = await (supabase.from('darkrisk_esteso_profiles' as any) as any)
        .upsert({
          organization_id: orgId,
          enabled,
          manual_only: true,
          identity_model_valid_until: IDENTITY_EXPIRY,
          cron_enabled: false,
        }, { onConflict: 'organization_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-esteso-clients'] });
      toast.success('Profilo DARKRISK_ESTESO aggiornato.');
    },
    onError: (err: any) => toast.error(String(err?.message || 'Errore aggiornamento profilo.')),
  });

  const toggleCronMutation = useMutation({
    mutationFn: async ({ orgId, cronEnabled }: { orgId: string; cronEnabled: boolean }) => {
      const { error } = await (supabase.from('darkrisk_esteso_profiles' as any) as any)
        .upsert({
          organization_id: orgId,
          enabled: true,
          manual_only: !cronEnabled,
          identity_model_valid_until: IDENTITY_EXPIRY,
          cron_enabled: cronEnabled,
        }, { onConflict: 'organization_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-esteso-clients'] });
      toast.success('Configurazione cron aggiornata.');
    },
    onError: (err: any) => toast.error(String(err?.message || 'Errore cron update.')),
  });

  const addEmailMutation = useMutation({
    mutationFn: async ({ orgId, email }: { orgId: string; email: string }) => {
      const { error } = await (supabase.from('darkrisk_selectors' as any) as any)
        .upsert({
          organization_id: orgId,
          tenant_id: orgId,
          selector_type: 'email',
          value: email,
          normalized_value: email,
          source: 'manual',
          status: 'approved',
          metadata: { discovered_by: 'darkrisk-esteso-admin', input_mode: 'manual_identity_esteso' },
        }, { onConflict: 'organization_id,selector_type,normalized_value' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-esteso-emails', configOrgId] });
      queryClient.invalidateQueries({ queryKey: ['admin-esteso-clients'] });
      setNewEmail('');
      toast.success('Email aggiunta.');
    },
    onError: (err: any) => toast.error(String(err?.message || 'Errore aggiunta email.')),
  });

  const removeEmailMutation = useMutation({
    mutationFn: async ({ orgId, email }: { orgId: string; email: string }) => {
      const { error } = await (supabase.from('darkrisk_selectors' as any) as any)
        .delete()
        .eq('organization_id', orgId)
        .eq('selector_type', 'email')
        .eq('normalized_value', email);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-esteso-emails', configOrgId] });
      queryClient.invalidateQueries({ queryKey: ['admin-esteso-clients'] });
      toast.success('Email rimossa.');
    },
    onError: (err: any) => toast.error(String(err?.message || 'Errore rimozione email.')),
  });

  const runScanForClient = useCallback(async (orgId: string) => {
    setRunningIds((prev) => new Set([...prev, orgId]));
    try {
      const { data, error } = await supabase.functions.invoke('darkrisk-esteso-sync', {
        body: {
          customer_id: orgId,
          trigger_type: 'manual',
          include_surface_sync: true,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error(String((data as any).error));

      const warnings = Array.isArray((data as any)?.warnings) ? (data as any).warnings.length : 0;
      if (warnings > 0) {
        toast.warning(`Run completato con ${warnings} warning.`);
      } else {
        toast.success('DARKRISK_ESTESO completato.');
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-esteso-clients'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-esteso-findings'] }),
      ]);
    } catch (err: any) {
      const msg = String(err?.message || 'Errore run.');
      if (msg.toLowerCase().includes('failed to send a request')) {
        toast.warning('Timeout client: la run potrebbe essere partita. Controlla tra breve.');
        queryClient.invalidateQueries({ queryKey: ['admin-esteso-clients'] });
      } else {
        toast.error(msg);
      }
    } finally {
      setRunningIds((prev) => { const next = new Set(prev); next.delete(orgId); return next; });
    }
  }, [queryClient]);

  // ── Derived KPIs ───────────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    const enabled = clients.filter((c) => c.profile?.enabled).length;
    const withCron = clients.filter((c) => c.profile?.cron_enabled).length;
    const totalFindings = findings.length;
    const critHigh = findings.filter((f) => f.severity === 'critical' || f.severity === 'high').length;
    return { enabled, withCron, totalFindings, critHigh, total: clients.length };
  }, [clients, findings]);

  const configClient = useMemo(() => clients.find((c) => c.id === configOrgId) || null, [clients, configOrgId]);

  // ── Guards ─────────────────────────────────────────────────────────────────
  if (!rolesLoading && !isSuperAdmin) return <Navigate to="/dashboard" replace />;
  if (rolesLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">DARKRISK_ESTESO</h1>
            <p className="text-sm text-muted-foreground">
              Super Admin · Identity Leaks + Domain Threat Intel via IntelX.io · Senza Firecrawl
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={new Date().toISOString().slice(0, 10) > IDENTITY_EXPIRY ? 'destructive' : 'secondary'}>
              Trial identity: {IDENTITY_EXPIRY}
            </Badge>
            <Button variant="outline" size="sm" onClick={() => refetchClients()}>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Aggiorna
            </Button>
          </div>
        </div>

        {/* ── Alert expiry ───────────────────────────────────────────────── */}
        <Alert className={new Date().toISOString().slice(0, 10) > IDENTITY_EXPIRY
          ? 'border-red-500/40 bg-red-500/10'
          : 'border-amber-500/40 bg-amber-500/10'}>
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Modello Identity IntelX.io</AlertTitle>
          <AlertDescription>
            Accesso ai Leaks API (<code>3.intelx.io</code>) è concesso fino al{' '}
            <strong>{IDENTITY_EXPIRY}</strong>. La Search API (<code>2.intelx.io</code>) rimane attiva.
            Le run cron dopo la scadenza verranno bloccate automaticamente.
          </AlertDescription>
        </Alert>

        {/* ── KPI row ────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Clienti totali</p>
                <p className="text-2xl font-bold">{kpi.total}</p>
              </div>
              <Building2 className="w-5 h-5 text-muted-foreground" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Esteso abilitato</p>
                <p className="text-2xl font-bold text-green-400">{kpi.enabled}</p>
              </div>
              <CheckCircle2 className="w-5 h-5 text-green-400" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Findings IntelX</p>
                <p className="text-2xl font-bold">{kpi.totalFindings}</p>
              </div>
              <Eye className="w-5 h-5 text-muted-foreground" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Critici/High</p>
                <p className="text-2xl font-bold text-red-400">{kpi.critHigh}</p>
              </div>
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </CardContent>
          </Card>
        </div>

        {/* ── Main Tabs ──────────────────────────────────────────────────── */}
        <Tabs defaultValue="clients">
          <TabsList className="mb-4">
            <TabsTrigger value="clients">
              <Users className="w-3.5 h-3.5 mr-1.5" />
              Clienti ({clients.length})
            </TabsTrigger>
            <TabsTrigger value="findings">
              <Eye className="w-3.5 h-3.5 mr-1.5" />
              Findings ({findings.length})
            </TabsTrigger>
            <TabsTrigger value="cron">
              <Timer className="w-3.5 h-3.5 mr-1.5" />
              Cron Auto ({kpi.withCron})
            </TabsTrigger>
          </TabsList>

          {/* ── CLIENTI TAB ────────────────────────────────────────────── */}
          <TabsContent value="clients">
            <Card>
              <CardHeader>
                <CardTitle>Gestione Clienti DARKRISK_ESTESO</CardTitle>
                <CardDescription>
                  Abilita il modulo per cliente, configura email identity e avvia scan manuali.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {clientsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-3 px-4 text-muted-foreground font-medium">Cliente</th>
                          <th className="text-center py-3 px-4 text-muted-foreground font-medium">Esteso</th>
                          <th className="text-center py-3 px-4 text-muted-foreground font-medium">Scadenza</th>
                          <th className="text-center py-3 px-4 text-muted-foreground font-medium">Email ID</th>
                          <th className="text-center py-3 px-4 text-muted-foreground font-medium">Ultima run</th>
                          <th className="text-right py-3 px-4 text-muted-foreground font-medium">Azioni</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clients.map((client) => {
                          const profileEnabled = Boolean(client.profile?.enabled);
                          const validUntil = client.profile?.identity_model_valid_until || IDENTITY_EXPIRY;
                          const expired = isExpired(validUntil);
                          const isRunning = runningIds.has(client.id);

                          return (
                            <tr key={client.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                              <td className="py-3 px-4">
                                <div>
                                  <p className="font-medium">{client.name}</p>
                                  <p className="text-xs text-muted-foreground">{client.code}</p>
                                </div>
                              </td>
                              <td className="text-center py-3 px-4">
                                <Switch
                                  checked={profileEnabled}
                                  onCheckedChange={(v) => toggleEstesoMutation.mutate({ orgId: client.id, enabled: v })}
                                  disabled={toggleEstesoMutation.isPending}
                                />
                              </td>
                              <td className="text-center py-3 px-4">
                                {client.profile ? (
                                  <Badge variant={expired ? 'destructive' : 'outline'} className="text-xs">
                                    {fmtDateShort(validUntil)}
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground text-xs">—</span>
                                )}
                              </td>
                              <td className="text-center py-3 px-4">
                                <div className="flex items-center justify-center gap-1">
                                  <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                                  <span>{client.emailCount}</span>
                                </div>
                              </td>
                              <td className="text-center py-3 px-4">
                                {client.lastRun ? (
                                  <div className="flex items-center justify-center gap-1.5">
                                    {statusIcon(client.lastRun.status)}
                                    <span className="text-xs text-muted-foreground">{fmtDate(client.lastRun.started_at)}</span>
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground">Nessuna run</span>
                                )}
                              </td>
                              <td className="text-right py-3 px-4">
                                <div className="flex items-center justify-end gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => { setConfigOrgId(client.id); setConfigTab('settings'); }}
                                  >
                                    Configura
                                  </Button>
                                  <Button
                                    size="sm"
                                    disabled={isRunning || !profileEnabled || expired}
                                    onClick={() => runScanForClient(client.id)}
                                  >
                                    {isRunning
                                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      : <PlayCircle className="w-3.5 h-3.5" />}
                                    <span className="ml-1.5">{isRunning ? 'Running...' : 'Run'}</span>
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── FINDINGS TAB ───────────────────────────────────────────── */}
          <TabsContent value="findings">
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div>
                    <CardTitle>Findings IntelX — Vista Aggregata</CardTitle>
                    <CardDescription>Domain threat intelligence + identity leaks da IntelX Search & Leaks API.</CardDescription>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Select value={findingOrgFilter} onValueChange={setFindingOrgFilter}>
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="Tutti i clienti" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tutti i clienti</SelectItem>
                        {clients.filter((c) => c.profile?.enabled).map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={findingSevFilter} onValueChange={setFindingSevFilter}>
                      <SelectTrigger className="w-36">
                        <SelectValue placeholder="Severità" />
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
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {findingsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : findings.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground text-sm">
                    Nessun finding IntelX trovato. Esegui una run per i clienti abilitati.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-3 px-4 text-muted-foreground font-medium">Sev</th>
                          <th className="text-left py-3 px-4 text-muted-foreground font-medium">Tipo</th>
                          <th className="text-left py-3 px-4 text-muted-foreground font-medium">Titolo</th>
                          <th className="text-left py-3 px-4 text-muted-foreground font-medium">Cliente</th>
                          <th className="text-left py-3 px-4 text-muted-foreground font-medium">Prima vista</th>
                          <th className="text-left py-3 px-4 text-muted-foreground font-medium">Ultima vista</th>
                        </tr>
                      </thead>
                      <tbody>
                        {findings.map((f) => {
                          const org = clients.find((c) => c.id === f.organization_id);
                          return (
                            <tr key={f.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                              <td className="py-2.5 px-4">
                                <Badge variant={severityBadge(f.severity)} className="text-xs capitalize">
                                  {f.severity}
                                </Badge>
                              </td>
                              <td className="py-2.5 px-4">
                                <span className="text-xs text-muted-foreground">{findingTypeLabel(f.finding_type)}</span>
                              </td>
                              <td className="py-2.5 px-4 max-w-xs">
                                <p className="truncate" title={f.title}>{f.title}</p>
                              </td>
                              <td className="py-2.5 px-4">
                                <span className="text-xs">{org?.name || f.organization_id.slice(0, 8)}</span>
                              </td>
                              <td className="py-2.5 px-4">
                                <span className="text-xs text-muted-foreground">{fmtDate(f.first_seen_at)}</span>
                              </td>
                              <td className="py-2.5 px-4">
                                <span className="text-xs text-muted-foreground">{fmtDate(f.last_seen_at)}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── CRON TAB ───────────────────────────────────────────────── */}
          <TabsContent value="cron">
            <Card>
              <CardHeader>
                <CardTitle>Cron Auto — Scansione Settimanale</CardTitle>
                <CardDescription>
                  Il cron si attiva ogni lunedì alle 02:00 UTC e avvia automaticamente DARKRISK_ESTESO
                  per tutti i clienti con cron abilitato. I domini vengono presi da SurfaceScan360.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-3 px-4 text-muted-foreground font-medium">Cliente</th>
                        <th className="text-center py-3 px-4 text-muted-foreground font-medium">Esteso attivo</th>
                        <th className="text-center py-3 px-4 text-muted-foreground font-medium">Cron abilitato</th>
                        <th className="text-center py-3 px-4 text-muted-foreground font-medium">Ultima run cron</th>
                        <th className="text-center py-3 px-4 text-muted-foreground font-medium">Scadenza identity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clients.map((client) => {
                        const profileEnabled = Boolean(client.profile?.enabled);
                        const cronEnabled = Boolean(client.profile?.cron_enabled);
                        const expired = isExpired(client.profile?.identity_model_valid_until);

                        return (
                          <tr key={client.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                            <td className="py-3 px-4">
                              <div>
                                <p className="font-medium">{client.name}</p>
                                <p className="text-xs text-muted-foreground">{client.code}</p>
                              </div>
                            </td>
                            <td className="text-center py-3 px-4">
                              <Badge variant={profileEnabled ? 'default' : 'secondary'}>
                                {profileEnabled ? 'Sì' : 'No'}
                              </Badge>
                            </td>
                            <td className="text-center py-3 px-4">
                              <Switch
                                checked={cronEnabled}
                                disabled={!profileEnabled || expired || toggleCronMutation.isPending}
                                onCheckedChange={(v) => toggleCronMutation.mutate({ orgId: client.id, cronEnabled: v })}
                              />
                            </td>
                            <td className="text-center py-3 px-4">
                              <span className="text-xs text-muted-foreground">
                                {client.profile?.last_cron_run_at
                                  ? fmtDate(client.profile.last_cron_run_at)
                                  : '—'}
                              </span>
                            </td>
                            <td className="text-center py-3 px-4">
                              <Badge variant={expired ? 'destructive' : 'outline'} className="text-xs">
                                {client.profile?.identity_model_valid_until || IDENTITY_EXPIRY}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
            <div className="mt-4 rounded-md border border-border/50 bg-muted/10 p-4 text-sm text-muted-foreground space-y-1">
              <p><strong className="text-foreground">Nota tecnica:</strong></p>
              <p>• Il cron pg_cron chiama l'edge function <code>darkrisk-esteso-admin-cron</code> ogni lunedì ore 02:00 UTC.</p>
              <p>• Per ogni cliente con cron abilitato, avvia automaticamente <code>darkrisk-esteso-sync</code> con i domini da SurfaceScan360.</p>
              <p>• Endpoint: Search API <code>2.intelx.io</code> + Leaks API <code>3.intelx.io</code> (valido fino al {IDENTITY_EXPIRY}).</p>
              <p>• I client con scadenza superata vengono saltati automaticamente.</p>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Configure Dialog ────────────────────────────────────────────── */}
      <Dialog open={Boolean(configOrgId)} onOpenChange={(open) => { if (!open) setConfigOrgId(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              Configura: {configClient?.name || '...'}
            </DialogTitle>
            <DialogDescription>
              Gestisci impostazioni e email identity per DARKRISK_ESTESO.
            </DialogDescription>
          </DialogHeader>

          <Tabs value={configTab} onValueChange={(v) => setConfigTab(v as any)}>
            <TabsList className="w-full mb-4">
              <TabsTrigger value="settings" className="flex-1">Impostazioni</TabsTrigger>
              <TabsTrigger value="emails" className="flex-1">Email Identity ({clientEmails.length})</TabsTrigger>
            </TabsList>

            {/* Settings sub-tab */}
            <TabsContent value="settings" className="space-y-4">
              <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium">DARKRISK_ESTESO abilitato</p>
                  <p className="text-xs text-muted-foreground">Abilita il modulo per questo cliente</p>
                </div>
                <Switch
                  checked={Boolean(configClient?.profile?.enabled)}
                  onCheckedChange={(v) => configOrgId && toggleEstesoMutation.mutate({ orgId: configOrgId, enabled: v })}
                />
              </div>

              <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium">Cron automatico settimanale</p>
                  <p className="text-xs text-muted-foreground">Run ogni lunedì 02:00 UTC (domini da SurfaceScan)</p>
                </div>
                <Switch
                  checked={Boolean(configClient?.profile?.cron_enabled)}
                  disabled={!configClient?.profile?.enabled || isExpired(configClient?.profile?.identity_model_valid_until)}
                  onCheckedChange={(v) => configOrgId && toggleCronMutation.mutate({ orgId: configOrgId, cronEnabled: v })}
                />
              </div>

              <div className="rounded-md border border-border/60 px-3 py-2.5 space-y-1">
                <p className="text-sm font-medium">Scadenza modello identity</p>
                <p className="text-sm text-muted-foreground">
                  {configClient?.profile?.identity_model_valid_until || IDENTITY_EXPIRY}
                </p>
                {isExpired(configClient?.profile?.identity_model_valid_until) && (
                  <p className="text-xs text-red-400">Scaduto — le run Leaks API sono bloccate.</p>
                )}
              </div>

              <div className="rounded-md border border-border/60 px-3 py-2.5 space-y-1">
                <p className="text-sm font-medium">Ultima run</p>
                <div className="flex items-center gap-2">
                  {statusIcon(configClient?.lastRun?.status)}
                  <p className="text-sm text-muted-foreground">
                    {configClient?.lastRun ? fmtDate(configClient.lastRun.started_at) : 'Nessuna run eseguita'}
                  </p>
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={() => configOrgId && runScanForClient(configOrgId)}
                  disabled={
                    !configOrgId
                    || runningIds.has(configOrgId)
                    || !configClient?.profile?.enabled
                    || isExpired(configClient?.profile?.identity_model_valid_until)
                  }
                >
                  {runningIds.has(configOrgId || '') && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                  <PlayCircle className="w-3.5 h-3.5 mr-1.5" />
                  Run Now
                </Button>
              </div>
            </TabsContent>

            {/* Emails sub-tab */}
            <TabsContent value="emails" className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Le email qui inserite vengono usate come selettori per IntelX Leaks API (ricerca esposizioni identity).
              </p>

              {/* Add email */}
              <div className="flex gap-2">
                <Input
                  placeholder="email@dominio.it"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newEmail.trim() && configOrgId) {
                      addEmailMutation.mutate({ orgId: configOrgId, email: newEmail.trim().toLowerCase() });
                    }
                  }}
                />
                <Button
                  size="sm"
                  disabled={!newEmail.trim() || !configOrgId || addEmailMutation.isPending}
                  onClick={() => {
                    if (newEmail.trim() && configOrgId) {
                      addEmailMutation.mutate({ orgId: configOrgId, email: newEmail.trim().toLowerCase() });
                    }
                  }}
                >
                  {addEmailMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                </Button>
              </div>

              {/* Email list */}
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {clientEmails.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    Nessuna email configurata.
                  </p>
                ) : clientEmails.map((em) => (
                  <div
                    key={em.id}
                    className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-sm">{em.normalized_value}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-red-400"
                      onClick={() => configOrgId && removeEmailMutation.mutate({ orgId: configOrgId, email: em.normalized_value })}
                      disabled={removeEmailMutation.isPending}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default AdminDarkRiskEsteso;
