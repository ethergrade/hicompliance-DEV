import React, { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle2, Loader2, XCircle, Play, Globe, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

interface ConnectSecureConfigPanelProps {
  organizationId: string;
}

export const ConnectSecureConfigPanel: React.FC<ConnectSecureConfigPanelProps> = ({ organizationId }) => {
  const navigate = useNavigate();
  const [enabled, setEnabled] = useState(true);
  const [savingEnabled, setSavingEnabled] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    supabase
      .from('connectsecure_config')
      .select('enabled')
      .eq('organization_id', organizationId)
      .maybeSingle()
      .then(({ data }) => { if (data) setEnabled(data.enabled ?? true); });
  }, [organizationId]);

  const handleToggleEnabled = async (val: boolean) => {
    setEnabled(val);
    setSavingEnabled(true);
    await supabase
      .from('connectsecure_config')
      .upsert({ organization_id: organizationId, enabled: val, updated_at: new Date().toISOString() }, { onConflict: 'organization_id' });
    setSavingEnabled(false);
  };

  const handleScanOrg = async () => {
    setScanning(true);
    setScanResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/connectsecure-scan`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({ action: 'scan', organization_id: organizationId }),
        },
      );
      const json = await res.json();
      if (json.ok) {
        setScanResult({ ok: true, message: `BFS completato — ${json.totalScanned ?? 0} domini scansionati` });
        toast.success('BFS completato');
      } else {
        setScanResult({ ok: false, message: json.error || 'Scan fallito' });
      }
    } catch (err) {
      setScanResult({ ok: false, message: String(err) });
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Attack Surface Mapper — ConnectSecure</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Credenziali configurate tramite secrets Supabase.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {savingEnabled && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
          <Switch checked={enabled} onCheckedChange={handleToggleEnabled} disabled={savingEnabled} />
          <span className="text-xs text-muted-foreground">{enabled ? 'Abilitato' : 'Disabilitato'}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" variant="outline" onClick={handleScanOrg} disabled={scanning || !enabled}>
          {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Play className="w-3.5 h-3.5 mr-1.5" />}
          Avvia BFS org
        </Button>
        <Button size="sm" variant="ghost" onClick={() => navigate('/impostazioni/surface-scan')}>
          <Settings className="w-3.5 h-3.5 mr-1.5" />
          Impostazioni avanzate
        </Button>
      </div>

      {scanResult && (
        <div className={`flex items-center gap-2 text-xs rounded-md px-3 py-2 border ${scanResult.ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-red-500/30 bg-red-500/10 text-red-400'}`}>
          {scanResult.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 shrink-0" />}
          {scanResult.message}
        </div>
      )}
    </div>
  );
};
