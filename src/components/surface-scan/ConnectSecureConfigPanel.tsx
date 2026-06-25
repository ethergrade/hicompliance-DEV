import React, { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';

interface ConnectSecureConfigPanelProps {
  organizationId: string;
}

interface CsConfig {
  pod_host: string;
  client_auth_token: string;
  company_id: string;
  enabled: boolean;
}

const DEFAULT_CONFIG: CsConfig = {
  pod_host: 'pod401.myconnectsecure.com',
  client_auth_token: '',
  company_id: '',
  enabled: true,
};

export const ConnectSecureConfigPanel: React.FC<ConnectSecureConfigPanelProps> = ({ organizationId }) => {
  const [config, setConfig]     = useState<CsConfig>(DEFAULT_CONFIG);
  const [saving, setSaving]     = useState(false);
  const [testing, setTesting]   = useState(false);
  const [saved, setSaved]       = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    supabase
      .from('connectsecure_config')
      .select('pod_host, client_auth_token, company_id, enabled')
      .eq('organization_id', organizationId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setConfig({
            pod_host:           data.pod_host || DEFAULT_CONFIG.pod_host,
            client_auth_token:  data.client_auth_token || '',
            company_id:         String(data.company_id || ''),
            enabled:            data.enabled ?? true,
          });
        }
      });
  }, [organizationId]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    const { error } = await supabase.from('connectsecure_config').upsert({
      organization_id:    organizationId,
      pod_host:           config.pod_host.trim(),
      client_auth_token:  config.client_auth_token.trim(),
      company_id:         parseInt(config.company_id, 10) || 0,
      enabled:            config.enabled,
      updated_at:         new Date().toISOString(),
    }, { onConflict: 'organization_id' });
    setSaving(false);
    if (!error) setSaved(true);
  };

  const handleTestAuth = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/connectsecure-scan`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ action: 'test_auth', organization_id: organizationId }),
        },
      );
      const json = await res.json();
      if (json.ok) {
        setTestResult({ ok: true, message: `Connessione OK — user_id: ${json.user_id}` });
      } else {
        setTestResult({ ok: false, message: json.error || 'Connessione fallita' });
      }
    } catch (err) {
      setTestResult({ ok: false, message: String(err) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="text-sm font-medium text-foreground">Attack Surface Mapper — Configurazione</div>

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
    </div>
  );
};
