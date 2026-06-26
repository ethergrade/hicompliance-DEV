import React, { useState, useEffect, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Globe, Shield, Bell, ShieldAlert, CheckCircle2, XCircle,
  Loader2, Play, RefreshCw, Trash2, Plus, User, Pencil,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRoles } from '@/hooks/useUserRoles';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import { useSurfaceScanAlerts, SurfaceScanAlertTypes } from '@/hooks/useSurfaceScanAlerts';
import { SurfaceScanAlertConfigDialog } from '@/components/surface-scan/SurfaceScanAlertConfigDialog';
import {
  IocLeaseMinutes, IocSeverity, IocType, useSurfaceScanIocFreshList,
} from '@/hooks/useSurfaceScanIocFreshList';
import { useAuth } from '@/components/auth/AuthProvider';
import { toast } from 'sonner';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface CveQueueStats { queued: number; failed: number; ok: number; }

const alertTypeLabels: Record<keyof SurfaceScanAlertTypes, string> = {
  vulnerabilita_critiche: 'Vulnerabilità Critiche',
  vulnerabilita_alte: 'Vulnerabilità Alte',
  porte_esposte: 'Porte Esposte',
  certificati_scaduti: 'Certificati Scaduti',
  servizi_non_sicuri: 'Servizi Non Sicuri',
};

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

const SurfaceScanImpostazioni: React.FC = () => {
  const { isSuperAdmin } = useUserRoles();
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.user_type === 'admin' || isSuperAdmin;
  const { organizationId } = useClientOrganization();

  const [activeTab, setActiveTab] = useState('scanner');

  // ── ConnectSecure / Scanner ──────────────────────────────────────────────
  const [sweepingAll, setSweepingAll] = useState(false);
  const [sweepResult, setSweepResult] = useState<string | null>(null);
  const [scanningOrg, setScanningOrg] = useState(false);
  const [scanOrgResult, setScanOrgResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // ── CVE Enrichment ───────────────────────────────────────────────────────
  const [cveStats, setCveStats] = useState<CveQueueStats | null>(null);
  const [cveStatsLoading, setCveStatsLoading] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [enrichResult, setEnrichResult] = useState<string | null>(null);

  // ── Alert ────────────────────────────────────────────────────────────────
  const { alerts, loading: alertsLoading, createAlert, updateAlert, deleteAlert, toggleAlertStatus } = useSurfaceScanAlerts();
  const [alertDialogOpen, setAlertDialogOpen] = useState(false);
  const [editingAlert, setEditingAlert] = useState<string | null>(null);
  const [deleteAlertId, setDeleteAlertId] = useState<string | null>(null);
  const [userNames, setUserNames] = useState<Record<string, string>>({});

  // ── IOC ──────────────────────────────────────────────────────────────────
  const {
    config: iocConfig, items: iocItems, loading: iocLoading, saving: iocSaving,
    isAdmin: isIocAdmin, saveConfig: saveIocConfig, addItem: addIocItem,
    removeItem: removeIocItem, toggleItem: toggleIocItem,
  } = useSurfaceScanIocFreshList();
  const [leaseMinutes, setLeaseMinutes] = useState<IocLeaseMinutes>(60);
  const [iocEnabled, setIocEnabled] = useState(true);
  const [iocValue, setIocValue] = useState('');
  const [iocType, setIocType] = useState<IocType>('domain');
  const [iocConfidence, setIocConfidence] = useState(80);
  const [iocSeverity, setIocSeverity] = useState<IocSeverity>('medium');
  const [iocNotes, setIocNotes] = useState('');

  useEffect(() => { if (iocConfig) { setLeaseMinutes(iocConfig.lease_minutes); setIocEnabled(Boolean(iocConfig.is_enabled)); } }, [iocConfig]);

  useEffect(() => {
    if (!isAdmin || alerts.length === 0) return;
    const fetchNames = async () => {
      const ids = [...new Set(alerts.map((a) => a.user_id))];
      const { data } = await supabase.from('users').select('auth_user_id, full_name, email').in('auth_user_id', ids);
      if (data) {
        const m: Record<string, string> = {};
        data.forEach((u) => { m[u.auth_user_id] = `${u.full_name} (${u.email})`; });
        setUserNames(m);
      }
    };
    fetchNames();
  }, [alerts, isAdmin]);

  // ── Helpers ──────────────────────────────────────────────────────────────

  const callEdge = useCallback(async (fn: string, body: object) => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${fn}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify(body),
      },
    );
    return res.json();
  }, []);

  const connectSecureErrorMessage = (payload: any, fallback = 'Scan fallito') => {
    if (payload?.error === 'auth_failed_config_diagnostic') {
      return 'Secret ConnectSecure non valido o non aggiornato in Supabase';
    }
    return payload?.message || payload?.error || fallback;
  };

  const loadCveStats = useCallback(async () => {
    setCveStatsLoading(true);
    const [{ count: queued }, { count: failed }, { count: ok }] = await Promise.all([
      supabase.from('cve_enrichment_queue').select('id', { count: 'exact', head: true }).eq('status', 'queued'),
      supabase.from('cve_enrichment_queue').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
      supabase.from('cve_intel_cache').select('id', { count: 'exact', head: true }).eq('fetch_status', 'ok'),
    ]);
    setCveStats({ queued: queued ?? 0, failed: failed ?? 0, ok: ok ?? 0 });
    setCveStatsLoading(false);
  }, []);

  useEffect(() => { loadCveStats(); }, [loadCveStats]);

  const handleSweepAll = async () => {
    setSweepingAll(true);
    setSweepResult(null);
    try {
      const json = await callEdge('connectsecure-scan', { action: 'weekly_all' });
      if (json.ok) {
        const authFailures = Array.isArray(json.results)
          ? json.results.filter((row: any) => row?.error === 'auth_failed_config_diagnostic').length
          : 0;
        if (authFailures > 0) {
          const msg = `Secret ConnectSecure non valido o non aggiornato in Supabase — ${authFailures} org non avviate`;
          setSweepResult(msg);
          toast.error(msg);
          return;
        }
        const msg = `Attack Surface Mapper avviato in background — ${json.orgs_swept ?? 0} org processate`;
        setSweepResult(msg);
        toast.success(msg);
      } else {
        const msg = connectSecureErrorMessage(json, 'Sweep fallito');
        setSweepResult(`Errore: ${msg}`);
        toast.error(msg);
      }
    } catch (err) {
      setSweepResult(`Errore: ${String(err)}`);
    } finally {
      setSweepingAll(false);
    }
  };

  const handleScanOrg = async () => {
    if (!organizationId) return;
    setScanningOrg(true);
    setScanOrgResult(null);
    try {
      const json = await callEdge('connectsecure-scan', { action: 'scan', organization_id: organizationId });
      setScanOrgResult(json.ok
        ? { ok: true, msg: `Attack Surface Mapper avviato in background — ${json.triggered ?? 0} domini accodati` }
        : { ok: false, msg: connectSecureErrorMessage(json) });
    } catch (err) {
      setScanOrgResult({ ok: false, msg: String(err) });
    } finally {
      setScanningOrg(false);
    }
  };

  const handleEnrich = async () => {
    setEnriching(true);
    setEnrichResult(null);
    try {
      const json = await callEdge('cve-enrichment', { action: 'retrigger_all', max_per_run: 50 });
      const msg = `Accodati ${json.enqueued ?? 0} CVE — processati subito ${json.processed_count ?? 0}`;
      setEnrichResult(msg);
      toast.success(msg + '. Il drain automatico continuerà ogni 5 minuti.');
      await loadCveStats();
    } catch (err) {
      setEnrichResult(`Errore: ${String(err)}`);
    } finally {
      setEnriching(false);
    }
  };

  const editingAlertData = alerts.find((a) => a.id === editingAlert);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      <div>
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white">Impostazioni</h1>
          <p className="text-gray-400 mt-1">
            Configurazione SurfaceScan360 — scanner, arricchimento CVE, alert e IOC
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          {/* ── Sticky tab bar ─────────────────────────────────────────── */}
          <div className="sticky top-0 z-20 bg-background -mx-6 px-6 pb-3 pt-1 border-b border-border">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="scanner" className="flex items-center gap-1.5">
                <Globe className="w-4 h-4" />
                Attack Surface Scanner
              </TabsTrigger>
              <TabsTrigger value="cve" className="flex items-center gap-1.5">
                <Shield className="w-4 h-4" />
                Arricchimento CVE
              </TabsTrigger>
              <TabsTrigger value="alerts" className="flex items-center gap-1.5">
                <Bell className="w-4 h-4" />
                Alert
              </TabsTrigger>
              <TabsTrigger value="ioc" className="flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4" />
                IOC Fresh List
              </TabsTrigger>
            </TabsList>
          </div>

          {/* ── Scanner tab ────────────────────────────────────────────── */}
          <TabsContent value="scanner" className="mt-6 space-y-6">
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="w-5 h-5" />
                  ConnectSecure — Attack Surface Mapper
                </CardTitle>
                <CardDescription>
                  Le credenziali sono lette dai secrets Supabase; gli scan puntuali e schedulati rigenerano il token automaticamente.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border border-border/50 p-3 bg-muted/30 text-xs text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground/60">Secrets richiesti (via CLI):</p>
                  <code className="block">supabase secrets set CS_POD_HOST=pod401.myconnectsecure.com</code>
                  <code className="block">supabase secrets set CS_COMPANY_ID=12345</code>
                  <code className="block">supabase secrets set CS_CLIENT_AUTH_TOKEN='&lt;Client-Auth-Token base64 oppure tenant+client:secret&gt;'</code>
                </div>
              </CardContent>
            </Card>

            {/* ConnectSecure ASM controls */}
            <Card className="border-border">
              <CardHeader>
                <CardTitle>ConnectSecure ASM</CardTitle>
                <CardDescription>
                  Avvia Attack Surface Mapper ConnectSecure su tutti i clienti configurati, o solo sull'org corrente.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <Button onClick={handleSweepAll} disabled={sweepingAll}>
                    {sweepingAll ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Globe className="w-4 h-4 mr-2" />}
                    Lancia ASM globale (tutte le org)
                  </Button>

                  {organizationId && (
                    <Button variant="outline" onClick={handleScanOrg} disabled={scanningOrg}>
                      {scanningOrg ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                      Avvia ASM org corrente
                    </Button>
                  )}
                </div>

                <p className="text-xs text-muted-foreground">
                  "ASM globale" itera tutte le org con ConnectSecure abilitato. "Org corrente" scansiona solo l'org selezionata in sidebar.
                </p>

                {sweepResult && (
                  <div className="text-sm rounded-md px-4 py-3 border border-blue-500/30 bg-blue-500/10 text-blue-400">
                    {sweepResult}
                  </div>
                )}
                {scanOrgResult && (
                  <div className={`flex items-center gap-2 text-sm rounded-md px-4 py-3 border ${scanOrgResult.ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-red-500/30 bg-red-500/10 text-red-400'}`}>
                    {scanOrgResult.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
                    {scanOrgResult.msg}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── CVE Enrichment tab ─────────────────────────────────────── */}
          <TabsContent value="cve" className="mt-6 space-y-6">
            <Card className="border-border">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="w-5 h-5" />
                    Arricchimento CVE — NVD / EPSS / CISA KEV
                  </CardTitle>
                  <button
                    onClick={loadCveStats}
                    disabled={cveStatsLoading}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    title="Aggiorna statistiche"
                  >
                    <RefreshCw className={`w-4 h-4 ${cveStatsLoading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
                <CardDescription>
                  Arricchisce tutti i CVE presenti in surface_findings con dati NVD, EPSS e CISA KEV.
                  Richiede la secret <code className="text-xs">NVD_API_KEY</code> configurata su Supabase.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Queue stats */}
                {cveStats !== null && (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg border border-border p-3 text-center">
                      <p className="text-2xl font-bold">{cveStats.queued}</p>
                      <p className="text-xs text-muted-foreground mt-1">In coda</p>
                    </div>
                    <div className={`rounded-lg border p-3 text-center ${cveStats.failed > 0 ? 'border-red-500/30 bg-red-500/5' : 'border-border'}`}>
                      <p className={`text-2xl font-bold ${cveStats.failed > 0 ? 'text-red-400' : ''}`}>{cveStats.failed}</p>
                      <p className="text-xs text-muted-foreground mt-1">Falliti</p>
                    </div>
                    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-center">
                      <p className="text-2xl font-bold text-emerald-400">{cveStats.ok}</p>
                      <p className="text-xs text-muted-foreground mt-1">Arricchiti (cache)</p>
                    </div>
                  </div>
                )}

                {cveStats?.queued === 0 && cveStats?.failed === 0 && (
                  <div className="flex items-center gap-2 text-sm text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                    Coda vuota — tutti i CVE sono stati processati.
                  </div>
                )}

                <div className="space-y-2">
                  <Button onClick={handleEnrich} disabled={enriching} className="w-full sm:w-auto">
                    {enriching ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Shield className="w-4 h-4 mr-2" />}
                    Arricchisci CVE storici (tutti)
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Accoda tutti i CVE da surface_findings non ancora arricchiti, poi drena i primi 50.
                    Il drain automatico (pg_cron ogni 5 min) processa il resto. Il processo completo può richiedere 1–4 ore.
                  </p>
                </div>

                {enrichResult && (
                  <div className="text-sm rounded-md px-4 py-3 border border-blue-500/30 bg-blue-500/10 text-blue-400">
                    {enrichResult}
                  </div>
                )}

                <div className="rounded-lg border border-border/50 p-3 bg-muted/30 text-xs text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground/60">Secret richiesta:</p>
                  <code className="block">supabase secrets set NVD_API_KEY=&lt;tua-chiave-NVD&gt;</code>
                  <p className="mt-1">Senza la key: 6.5s/CVE (rate limit anonimo). Con la key: 250ms/CVE → ~600 CVE/ora.</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Alert tab ──────────────────────────────────────────────── */}
          <TabsContent value="alerts" className="mt-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Alert SurfaceScan360</h2>
                <p className="text-sm text-muted-foreground mt-1">Notifiche email per vulnerabilità e anomalie rilevate</p>
              </div>
              <Button onClick={() => setAlertDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Nuovo Alert
              </Button>
            </div>

            {alertsLoading ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">Caricamento alert...</CardContent></Card>
            ) : alerts.length === 0 ? (
              <Card>
                <CardContent className="py-12">
                  <div className="text-center space-y-4">
                    <Bell className="w-12 h-12 mx-auto text-muted-foreground" />
                    <p className="text-lg font-medium">Nessun alert configurato</p>
                    <Button onClick={() => setAlertDialogOpen(true)}>
                      <Plus className="w-4 h-4 mr-2" />Crea Alert
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {alerts.map((alert) => {
                  const activeTypes = Object.entries(alert.alert_types)
                    .filter(([, enabled]) => enabled)
                    .map(([type]) => type as keyof SurfaceScanAlertTypes);
                  return (
                    <Card key={alert.id}>
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="space-y-1 flex-1">
                            <CardTitle className="flex items-center gap-2 text-base">
                              <Bell className="w-4 h-4" />
                              {alert.alert_email}
                            </CardTitle>
                            <CardDescription>Creato il {new Date(alert.created_at).toLocaleDateString('it-IT')}</CardDescription>
                            {isAdmin && userNames[alert.user_id] && (
                              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                <User className="w-3.5 h-3.5" />
                                {userNames[alert.user_id]}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch checked={alert.is_active} onCheckedChange={(c) => toggleAlertStatus(alert.id, c)} />
                            <Button variant="ghost" size="icon" onClick={() => setEditingAlert(alert.id)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => setDeleteAlertId(alert.id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-wrap gap-2">
                          {activeTypes.map((type) => (
                            <Badge key={type} variant="secondary">{alertTypeLabels[type]}</Badge>
                          ))}
                          {!alert.is_active && <Badge variant="outline">Disattivato</Badge>}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ── IOC tab ────────────────────────────────────────────────── */}
          <TabsContent value="ioc" className="mt-6 space-y-6">
            {(!isAdmin || !isIocAdmin) ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">Accesso riservato agli amministratori.</CardContent></Card>
            ) : (
              <>
                <div>
                  <h2 className="text-xl font-semibold">IOC Fresh List</h2>
                  <p className="text-sm text-muted-foreground mt-1">Indicatori di compromissione con aggiornamento periodico basato su lease</p>
                </div>

                <Card>
                  <CardHeader><CardTitle className="text-base">Configurazione lease</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Intervallo aggiornamento</p>
                        <Select value={String(leaseMinutes)} onValueChange={(v) => setLeaseMinutes(Number(v) as IocLeaseMinutes)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="30">30 min</SelectItem>
                            <SelectItem value="60">1 ora</SelectItem>
                            <SelectItem value="120">2 ore</SelectItem>
                            <SelectItem value="720">12 ore</SelectItem>
                            <SelectItem value="1440">24 ore</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Abilitazione</p>
                        <div className="h-10 px-3 rounded-md border border-input flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">{iocEnabled ? 'Attiva' : 'Disattiva'}</span>
                          <Switch checked={iocEnabled} onCheckedChange={setIocEnabled} />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Ultimo refresh</p>
                        <div className="h-10 px-3 rounded-md border border-input flex items-center text-sm text-muted-foreground">
                          {iocConfig?.last_refreshed_at ? new Date(iocConfig.last_refreshed_at).toLocaleString('it-IT') : 'Mai'}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Azioni</p>
                        <Button className="w-full" onClick={() => saveIocConfig({ lease_minutes: leaseMinutes, is_enabled: iocEnabled })} disabled={iocSaving}>
                          Salva
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-base">Aggiungi IOC manuale</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                      <Input className="md:col-span-2" value={iocValue} onChange={(e) => setIocValue(e.target.value)} placeholder="dominio, IP o URL" />
                      <Select value={iocType} onValueChange={(v) => setIocType(v as IocType)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="domain">Dominio</SelectItem>
                          <SelectItem value="ip">IP</SelectItem>
                          <SelectItem value="url">URL</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input type="number" min={0} max={100} value={iocConfidence} onChange={(e) => setIocConfidence(Math.max(0, Math.min(100, Number(e.target.value))))} placeholder="Confidenza 0-100" />
                      <Select value={iocSeverity} onValueChange={(v) => setIocSeverity(v as IocSeverity)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="critical">Critical</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="info">Info</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Textarea value={iocNotes} onChange={(e) => setIocNotes(e.target.value)} placeholder="Note operative (opzionale)" rows={2} />
                    <div className="flex justify-end">
                      <Button onClick={async () => {
                        const ok = await addIocItem({ ioc_value: iocValue, ioc_type: iocType, confidence: iocConfidence, severity: iocSeverity, notes: iocNotes });
                        if (ok) { setIocValue(''); setIocNotes(''); setIocConfidence(80); setIocSeverity('medium'); }
                      }} disabled={iocSaving || !iocValue.trim()}>
                        Aggiungi IOC
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">IOC in lista</CardTitle>
                      <Badge variant="secondary">{iocItems.length}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {iocLoading ? (
                      <p className="text-sm text-muted-foreground">Caricamento...</p>
                    ) : iocItems.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nessun IOC presente.</p>
                    ) : (
                      <div className="space-y-2">
                        {iocItems.map((item) => (
                          <div key={item.id} className="rounded-md border p-3 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{item.ioc_value}</p>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <Badge variant="outline">{item.ioc_type}</Badge>
                                <Badge variant="outline">{item.source === 'manual' ? 'Manuale' : 'Feed curato'}</Badge>
                                <Badge variant="outline">Conf: {item.confidence}</Badge>
                                <Badge variant="outline">{item.severity}</Badge>
                                {item.expires_at && <span className="text-xs text-muted-foreground">Exp: {new Date(item.expires_at).toLocaleString('it-IT')}</span>}
                              </div>
                              {item.notes && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.notes}</p>}
                            </div>
                            <div className="flex items-center gap-2">
                              <Switch checked={item.is_active} onCheckedChange={(c) => void toggleIocItem(item.id, c)} />
                              <Button variant="ghost" size="icon" onClick={() => void removeIocItem(item.id)} disabled={item.source !== 'manual'}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Dialogs ────────────────────────────────────────────────────── */}
      <SurfaceScanAlertConfigDialog
        open={alertDialogOpen}
        onOpenChange={setAlertDialogOpen}
        onSubmit={async (data) => { await createAlert(data); }}
        mode="create"
      />
      {editingAlertData && (
        <SurfaceScanAlertConfigDialog
          open={!!editingAlert}
          onOpenChange={(open) => !open && setEditingAlert(null)}
          onSubmit={async (data) => { const ok = await updateAlert(editingAlert!, data); if (ok) setEditingAlert(null); return ok; }}
          defaultValues={{ alert_email: editingAlertData.alert_email, alert_types: editingAlertData.alert_types }}
          mode="edit"
        />
      )}
      <AlertDialog open={!!deleteAlertId} onOpenChange={() => setDeleteAlertId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma eliminazione</AlertDialogTitle>
            <AlertDialogDescription>Eliminare questo alert? L'azione non può essere annullata.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={async () => { if (deleteAlertId) { await deleteAlert(deleteAlertId); setDeleteAlertId(null); } }}>
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default SurfaceScanImpostazioni;
