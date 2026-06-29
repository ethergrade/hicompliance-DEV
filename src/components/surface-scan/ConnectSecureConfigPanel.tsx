import React, { useEffect, useState, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { connectSecureApi } from '@/lib/api/connectsecure';
import { cveEnrichmentApi } from '@/lib/api/cve-enrichment';
import { CheckCircle2, Loader2, XCircle, Play, Globe, RefreshCw, Shield } from 'lucide-react';
import { toast } from 'sonner';

interface ConnectSecureConfigPanelProps {
  organizationId: string;
  groupId?: string | null;
}

interface CsConfig {
  pod_host: string;
  client_auth_token: string;
  company_id: string;
  enabled: boolean;
}

interface CveQueueStats {
  queued: number;
  failed: number;
}

const DEFAULT_CONFIG: CsConfig = {
  pod_host: 'pod401.myconnectsecure.com',
  client_auth_token: '',
  company_id: '',
  enabled: true,
};

export const ConnectSecureConfigPanel: React.FC<ConnectSecureConfigPanelProps> = ({ organizationId, groupId }) => {
  const [config, setConfig]     = useState<CsConfig>(DEFAULT_CONFIG);
  const [saving, setSaving]     = useState(false);
  const [testing, setTesting]   = useState(false);
  const [saved, setSaved]       = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const [scanningOrg, setScanningOrg]   = useState(false);
  const [sweepingAll, setSweepingAll]   = useState(false);
  const [scanOrgResult, setScanOrgResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [sweepResult, setSweepResult]   = useState<string | null>(null);

  const [cveStats, setCveStats]           = useState<CveQueueStats | null>(null);
  const [cveStatsLoading, setCveStatsLoading] = useState(false);
  const [triggeringCve, setTriggeringCve] = useState(false);
  const [cveResult, setCveResult]         = useState<string | null>(null);

  useEffect(() => {
    connectSecureApi.getConfig(organizationId, groupId).then((data) => {
      setConfig({
        pod_host:           String(data.pod_host ?? DEFAULT_CONFIG.pod_host),
        client_auth_token:  String(data.client_auth_token ?? ''),
        company_id:         String(data.company_id ?? ''),
        enabled:            Boolean(data.enabled ?? true),
      });
    });
    loadCveStats();
  }, [organizationId, groupId]);

  const loadCveStats = useCallback(async () => {
    setCveStatsLoading(true);
    try {
      const stats = await cveEnrichmentApi.getStats(organizationId, groupId);
      setCveStats({ queued: stats.queued, failed: stats.failed });
    } catch {
      // stats non critici
    } finally {
      setCveStatsLoading(false);
    }
  }, [organizationId, groupId]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await connectSecureApi.updateConfig(organizationId, groupId, {
        pod_host:           config.pod_host.trim(),
        company_id:         config.company_id.trim(),
        client_auth_token:  config.client_auth_token.trim(),
        enabled:            config.enabled,
      });
      setSaved(true);
    } catch (err) {
      toast.error('Salvataggio fallito: ' + String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleTestAuth = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await connectSecureApi.scan(organizationId, groupId, 'test_auth');
      if (result.ok) {
        setTestResult({ ok: true, message: `Connessione OK${result.user_id ? ` — user_id: ${result.user_id}` : ''}` });
      } else {
        setTestResult({ ok: false, message: result.error || 'Connessione fallita' });
      }
    } catch (err) {
      setTestResult({ ok: false, message: String(err) });
    } finally {
      setTesting(false);
    }
  };

  const handleScanOrg = async () => {
    setScanningOrg(true);
    setScanOrgResult(null);
    try {
      const result = await connectSecureApi.scan(organizationId, groupId, 'scan');
      if (result.ok) {
        setScanOrgResult({ ok: true, message: `BFS avviato — ${result.triggered ?? 0} domini accodati` });
      } else {
        setScanOrgResult({ ok: false, message: result.error || 'Scan fallito' });
      }
    } catch (err) {
      setScanOrgResult({ ok: false, message: String(err) });
    } finally {
      setScanningOrg(false);
    }
  };

  const handleSweepAll = async () => {
    setSweepingAll(true);
    setSweepResult(null);
    try {
      const result = await connectSecureApi.sweepAll(groupId);
      if (result.ok) {
        setSweepResult(`Sweep completato — ${result.orgs_swept ?? 0} org processate`);
        toast.success(`BFS globale completato: ${result.orgs_swept ?? 0} organizzazioni`);
      } else {
        setSweepResult('Sweep fallito');
        toast.error('Sweep fallito');
      }
    } catch (err) {
      setSweepResult(`Errore: ${String(err)}`);
      toast.error('Sweep fallito: ' + String(err));
    } finally {
      setSweepingAll(false);
    }
  };

  const handleCveRetrigger = async () => {
    setTriggeringCve(true);
    setCveResult(null);
    try {
      const result = await cveEnrichmentApi.retrigger(organizationId, groupId);
      const msg = `Accodati ${result.enqueued ?? 0} CVE — processati subito ${result.processed_count ?? 0}`;
      setCveResult(msg);
      toast.success(msg + '. Il drain automatico continuerà ogni 5 minuti.');
      await loadCveStats();
    } catch (err) {
      const msg = `Errore: ${String(err)}`;
      setCveResult(msg);
      toast.error(msg);
    } finally {
      setTriggeringCve(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="text-sm font-medium text-foreground">Attack Surface Mapper — Configurazione</div>

      {/* ConnectSecure credentials */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="cs-pod-host" className="text-xs">Pod Host</Label>
          <Input
            id="cs-pod-host"
            placeholder="pod401.myconnectsecure.com"
            value={config.pod_host}
            onChange={e => setConfig(c => ({ ...c, pod_host: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cs-company-id" className="text-xs">Company ID</Label>
          <Input
            id="cs-company-id"
            placeholder="12345"
            value={config.company_id}
            onChange={e => setConfig(c => ({ ...c, company_id: e.target.value }))}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cs-token" className="text-xs">Client-Auth-Token (base64)</Label>
        <Input
          id="cs-token"
          placeholder="aWN0cGx1cys..."
          value={config.client_auth_token}
          onChange={e => setConfig(c => ({ ...c, client_auth_token: e.target.value }))}
        />
        <p className="text-xs text-muted-foreground">Token già in formato base64 come da documentazione ConnectSecure.</p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
          Salva
        </Button>
        <Button size="sm" variant="outline" onClick={handleTestAuth} disabled={testing}>
          {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
          Testa connessione
        </Button>
        {saved && (
          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3 mr-1" />Salvato
          </Badge>
        )}
      </div>

      {testResult && (
        <div className={`flex items-center gap-2 text-xs rounded-md px-3 py-2 border ${testResult.ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-red-500/30 bg-red-500/10 text-red-400'}`}>
          {testResult.ok
            ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            : <XCircle className="w-3.5 h-3.5 shrink-0" />}
          {testResult.message}
        </div>
      )}

      <Separator />

      {/* BFS Scan — current org */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          <Globe className="w-3.5 h-3.5" />
          Scansione BFS
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Button size="sm" variant="outline" onClick={handleScanOrg} disabled={scanningOrg}>
            {scanningOrg
              ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
              : <Play className="w-3.5 h-3.5 mr-1.5" />}
            Avvia BFS ora
          </Button>
          <Button size="sm" variant="outline" onClick={handleSweepAll} disabled={sweepingAll}>
            {sweepingAll
              ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
              : <Globe className="w-3.5 h-3.5 mr-1.5" />}
            Lancia BFS globale
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground">
          "Avvia BFS ora" — scansiona i domini in scope per questa org.
          "BFS globale" — itera tutte le org con ConnectSecure configurato.
        </p>
        {scanOrgResult && (
          <div className={`flex items-center gap-2 text-xs rounded-md px-3 py-2 border ${scanOrgResult.ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-red-500/30 bg-red-500/10 text-red-400'}`}>
            {scanOrgResult.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 shrink-0" />}
            {scanOrgResult.message}
          </div>
        )}
        {sweepResult && (
          <div className="text-xs rounded-md px-3 py-2 border border-blue-500/30 bg-blue-500/10 text-blue-400">
            {sweepResult}
          </div>
        )}
      </div>

      <Separator />

      {/* CVE Enrichment */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <Shield className="w-3.5 h-3.5" />
            CVE Enrichment (NVD / EPSS / CISA KEV)
          </div>
          <button
            onClick={loadCveStats}
            disabled={cveStatsLoading}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Aggiorna statistiche coda"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${cveStatsLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {cveStats !== null && (
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-xs">
              {cveStats.queued} in coda
            </Badge>
            {cveStats.failed > 0 && (
              <Badge variant="outline" className="text-xs border-red-500/40 text-red-400">
                {cveStats.failed} falliti
              </Badge>
            )}
            {cveStats.queued === 0 && cveStats.failed === 0 && (
              <Badge className="text-xs bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                <CheckCircle2 className="w-3 h-3 mr-1" />Coda vuota
              </Badge>
            )}
          </div>
        )}

        <Button size="sm" variant="outline" onClick={handleCveRetrigger} disabled={triggeringCve}>
          {triggeringCve
            ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
            : <Shield className="w-3.5 h-3.5 mr-1.5" />}
          Arricchisci CVE storici
        </Button>
        <p className="text-[10px] text-muted-foreground">
          Accoda tutti i CVE da surface_findings non ancora arricchiti, poi drena i primi 50.
          Il drain automatico (ogni 5 min) processa il resto. Il processo completo può richiedere 1–4 ore.
        </p>

        {cveResult && (
          <div className="text-xs rounded-md px-3 py-2 border border-blue-500/30 bg-blue-500/10 text-blue-400">
            {cveResult}
          </div>
        )}
      </div>
    </div>
  );
};
