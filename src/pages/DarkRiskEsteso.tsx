import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import { useUserRoles } from '@/hooks/useUserRoles';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, ShieldAlert, PlayCircle, Eye, Globe } from 'lucide-react';

const DEFAULT_EXPIRY = '2026-06-10';

type RunRow = {
  id: string;
  trigger_type: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  warnings: string[];
  stats: Record<string, unknown>;
  error_message: string | null;
};

function formatDateTime(value: string | null | undefined): string {
  const parsed = Date.parse(String(value || ''));
  if (!Number.isFinite(parsed)) return '-';
  return new Date(parsed).toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function parseEmailInput(value: string): string[] {
  return Array.from(
    new Set(
      String(value || '')
        .split(/[\n,;\s]+/)
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

const DarkRiskEsteso: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { organizationId } = useClientOrganization();
  const { isSuperAdmin } = useUserRoles();

  const [identityEmailsInput, setIdentityEmailsInput] = useState('');
  const [includeSurfaceSync, setIncludeSurfaceSync] = useState(true);
  const [running, setRunning] = useState(false);
  const [lastRunResponse, setLastRunResponse] = useState<Record<string, unknown> | null>(null);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['darkrisk-esteso-profile', organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      if (!organizationId) return null;
      const [orgRes, profileRes] = await Promise.all([
        supabase
          .from('organizations')
          .select('darkrisk_esteso_enabled' as any)
          .eq('id', organizationId)
          .maybeSingle(),
        supabase
          .from('darkrisk_esteso_profiles' as any)
          .select('enabled, manual_only, identity_model_valid_until')
          .eq('organization_id', organizationId)
          .maybeSingle(),
      ]);

      if (orgRes.error) throw orgRes.error;
      if (profileRes.error && String((profileRes.error as { code?: string }).code || '') !== '42P01') {
        throw profileRes.error;
      }

      return {
        org_enabled: Boolean((orgRes.data as any)?.darkrisk_esteso_enabled),
        profile_enabled: Boolean((profileRes.data as any)?.enabled ?? (orgRes.data as any)?.darkrisk_esteso_enabled),
        manual_only: Boolean((profileRes.data as any)?.manual_only ?? true),
        valid_until: String((profileRes.data as any)?.identity_model_valid_until || DEFAULT_EXPIRY),
      };
    },
    staleTime: 30_000,
  });

  const { data: runs = [], isLoading: runsLoading } = useQuery({
    queryKey: ['darkrisk-esteso-runs', organizationId],
    enabled: Boolean(organizationId),
    queryFn: async (): Promise<RunRow[]> => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('darkrisk_scan_runs' as any)
        .select('id, trigger_type, status, started_at, completed_at, warnings, stats, error_message')
        .eq('organization_id', organizationId)
        .eq('trigger_type', 'darkrisk_esteso_manual')
        .order('started_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return ((data || []) as any[]).map((row) => ({
        id: String(row.id),
        trigger_type: String(row.trigger_type || ''),
        status: String(row.status || ''),
        started_at: row.started_at || null,
        completed_at: row.completed_at || null,
        warnings: Array.isArray(row.warnings) ? row.warnings.map((w) => String(w)) : [],
        stats: (row.stats && typeof row.stats === 'object') ? row.stats : {},
        error_message: row.error_message ? String(row.error_message) : null,
      }));
    },
    refetchInterval: 45_000,
    staleTime: 15_000,
  });

  const nowDate = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const isExpired = Boolean(profile?.valid_until && nowDate > profile.valid_until);
  const isEnabled = Boolean(profile?.profile_enabled);

  const runEstesoScan = async () => {
    if (!organizationId) {
      toast.error('Seleziona un cliente prima di avviare il modulo esteso.');
      return;
    }

    setRunning(true);
    setLastRunResponse(null);

    try {
      const emails = parseEmailInput(identityEmailsInput);
      const { data, error } = await supabase.functions.invoke('darkrisk-esteso-sync', {
        body: {
          customer_id: organizationId,
          trigger_type: 'manual',
          identity_emails: emails,
          include_surface_sync: includeSurfaceSync,
        },
      });

      if (error) throw error;
      if ((data as any)?.error) throw new Error(String((data as any).error));

      setLastRunResponse((data as Record<string, unknown>) || null);

      const warnings = Array.isArray((data as any)?.warnings) ? (data as any).warnings.length : 0;
      if (warnings > 0) {
        toast.warning(`Run completato con ${warnings} warning.`);
      } else {
        toast.success('DARKRISK_ESTESO completato correttamente.');
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['darkrisk-esteso-runs', organizationId] }),
        queryClient.invalidateQueries({ queryKey: ['darkrisk360-overview', organizationId] }),
      ]);
    } catch (err: any) {
      const message = String(err?.message || 'Errore durante esecuzione DARKRISK_ESTESO');
      const likelyTransportError = message.toLowerCase().includes('failed to send a request to the edge function');
      if (likelyTransportError) {
        toast.warning('Timeout lato client: la run potrebbe essere partita. Controlla Run Recenti tra pochi secondi.');
        await queryClient.invalidateQueries({ queryKey: ['darkrisk-esteso-runs', organizationId] });
      } else {
        toast.error(message);
      }
      setLastRunResponse({
        ok: false,
        error: message,
        ...(likelyTransportError ? { hint: 'Possibile timeout client: verifica lo storico Run Recenti.' } : {}),
      });
    } finally {
      setRunning(false);
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="container mx-auto py-6">
        <Card>
          <CardHeader>
            <CardTitle>Accesso non consentito</CardTitle>
            <CardDescription>Il modulo DARKRISK_ESTESO e' disponibile solo per utenti Super Admin.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">DARKRISK_ESTESO</h1>
          <p className="text-sm text-muted-foreground">
            MVP Super Admin: Surface scope + IntelX Search + IntelX Leaks (no Firecrawl), esecuzione manuale.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/surface-scan')}>
            <Globe className="w-4 h-4 mr-2" />
            SurfaceScan360
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/dark-risk')}>
            <Eye className="w-4 h-4 mr-2" />
            DarkRisk360
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PlayCircle className="w-5 h-5" />
            Esecuzione Manuale
          </CardTitle>
          <CardDescription>
            Trigger manuale con selector email opzionali. Il modulo usa Search API su `2.intelx.io` e Leaks API su `3.intelx.io`.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={isEnabled ? 'default' : 'destructive'}>
              {profileLoading ? 'Profilo...' : isEnabled ? 'Modulo abilitato' : 'Modulo non abilitato'}
            </Badge>
            <Badge variant="outline">manual_only: {String(profile?.manual_only ?? true)}</Badge>
            <Badge variant="outline">scadenza: {profile?.valid_until || DEFAULT_EXPIRY}</Badge>
          </div>

          <div className="space-y-2">
            <Label htmlFor="identity-emails">Email identity (una per riga o separate da virgola)</Label>
            <Input
              id="identity-emails"
              value={identityEmailsInput}
              onChange={(e) => setIdentityEmailsInput(e.target.value)}
              placeholder="security@cliente.it, admin@cliente.it"
            />
          </div>

          <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
            <div>
              <p className="text-sm font-medium">Include Surface auto-refresh</p>
              <p className="text-xs text-muted-foreground">Avvia automaticamente la coda scope SurfaceScan prima della correlazione.</p>
            </div>
            <Switch checked={includeSurfaceSync} onCheckedChange={setIncludeSurfaceSync} disabled={running} />
          </div>

          <div className="flex justify-end">
            <Button
              onClick={runEstesoScan}
              disabled={running || !organizationId || !isEnabled}
            >
              {running && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {running ? 'Esecuzione in corso...' : 'Run now'}
            </Button>
          </div>

          {lastRunResponse && (
            <pre className="text-xs rounded-md border border-border/50 bg-muted/20 p-3 overflow-auto max-h-56">
              {JSON.stringify(lastRunResponse, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Run Recenti</CardTitle>
          <CardDescription>Storico run `darkrisk_esteso_manual` del cliente selezionato.</CardDescription>
        </CardHeader>
        <CardContent>
          {runsLoading ? (
            <p className="text-sm text-muted-foreground">Caricamento run...</p>
          ) : runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessuna run DARKRISK_ESTESO trovata.</p>
          ) : (
            <div className="space-y-3">
              {runs.map((run) => (
                <div key={run.id} className="rounded-md border border-border/50 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{run.status}</Badge>
                      <span className="text-xs text-muted-foreground">{run.id.slice(0, 8)}...</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(run.started_at)} {run.completed_at ? `→ ${formatDateTime(run.completed_at)}` : ''}
                    </span>
                  </div>
                  {run.error_message && (
                    <p className="text-xs text-red-400">Errore: {run.error_message}</p>
                  )}
                  {run.warnings.length > 0 && (
                    <div className="text-xs text-amber-300 space-y-1">
                      {run.warnings.slice(0, 4).map((warning, idx) => (
                        <p key={`${run.id}-warn-${idx}`}>• {warning}</p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default DarkRiskEsteso;
