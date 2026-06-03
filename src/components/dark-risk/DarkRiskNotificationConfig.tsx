import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Bell, X, Save, RefreshCw } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface NotificationConfig {
  id?: string;
  organization_id: string;
  recipient_emails: string[];
  alert_on_new_findings: boolean;
  alert_severity_threshold: string;
  min_new_findings_to_alert: number;
  weekly_summary_enabled: boolean;
  last_alert_sent_at: string | null;
  last_summary_sent_at: string | null;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Props {
  organizationId: string;
}

export function DarkRiskNotificationConfig({ organizationId }: Props) {
  const queryClient = useQueryClient();
  const [emailInput, setEmailInput] = useState('');
  const [emails, setEmails] = useState<string[]>([]);
  const [alertEnabled, setAlertEnabled] = useState(true);
  const [summaryEnabled, setSummaryEnabled] = useState(true);
  const [threshold, setThreshold] = useState('high');
  const [minFindings, setMinFindings] = useState(1);

  const { data: config, isLoading } = useQuery({
    queryKey: ['darkrisk360-notification-config', organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('darkrisk360_notification_configs')
        .select('*')
        .eq('organization_id', organizationId)
        .maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      return (data as NotificationConfig) ?? null;
    },
  });

  useEffect(() => {
    if (config) {
      setEmails(config.recipient_emails ?? []);
      setAlertEnabled(config.alert_on_new_findings ?? true);
      setSummaryEnabled(config.weekly_summary_enabled ?? true);
      setThreshold(config.alert_severity_threshold ?? 'high');
      setMinFindings(config.min_new_findings_to_alert ?? 1);
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        organization_id: organizationId,
        recipient_emails: emails,
        alert_on_new_findings: alertEnabled,
        alert_severity_threshold: threshold,
        min_new_findings_to_alert: minFindings,
        weekly_summary_enabled: summaryEnabled,
        updated_at: new Date().toISOString(),
      };
      const { error } = await (supabase as any)
        .from('darkrisk360_notification_configs')
        .upsert(payload, { onConflict: 'organization_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['darkrisk360-notification-config', organizationId] });
      toast({ title: 'Configurazione salvata' });
    },
    onError: (err: Error) => {
      toast({ title: 'Errore', description: err.message, variant: 'destructive' });
    },
  });

  const addEmail = () => {
    const trimmed = emailInput.trim().toLowerCase();
    if (!trimmed) return;
    if (!EMAIL_REGEX.test(trimmed)) {
      toast({ title: 'Email non valida', variant: 'destructive' });
      return;
    }
    if (emails.includes(trimmed)) return;
    setEmails([...emails, trimmed]);
    setEmailInput('');
  };

  const removeEmail = (email: string) => {
    setEmails(emails.filter((e) => e !== email));
  };

  if (isLoading) return null;

  return (
    <Card className="bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Bell className="h-4 w-4" />
          Configurazione Notifiche
        </CardTitle>
        <CardDescription className="text-xs">
          Configura gli indirizzi email per gli alert DarkRisk360 e i report settimanali.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Email recipients */}
        <div className="space-y-2">
          <Label className="text-xs font-medium">Destinatari Email</Label>
          <div className="flex gap-2">
            <Input
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addEmail()}
              placeholder="nome@azienda.it"
              className="flex-1 text-sm h-8"
            />
            <Button size="sm" variant="outline" onClick={addEmail} className="h-8">
              Aggiungi
            </Button>
          </div>
          {emails.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {emails.map((email) => (
                <Badge key={email} variant="secondary" className="text-xs gap-1.5 pr-1">
                  {email}
                  <button
                    onClick={() => removeEmail(email)}
                    className="hover:text-destructive transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Alert toggle */}
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-xs font-medium">Alert nuovi finding</Label>
            <p className="text-xs text-muted-foreground">Notifica immediata quando trovati nuovi finding</p>
          </div>
          <Switch checked={alertEnabled} onCheckedChange={setAlertEnabled} />
        </div>

        {/* Severity threshold */}
        {alertEnabled && (
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Soglia severity minima</Label>
            <Select value={threshold} onValueChange={setThreshold}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High (default)</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="info">Info (tutti)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Weekly summary toggle */}
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-xs font-medium">Report settimanale</Label>
            <p className="text-xs text-muted-foreground">Riepilogo ogni lunedì con stats e trend</p>
          </div>
          <Switch checked={summaryEnabled} onCheckedChange={setSummaryEnabled} />
        </div>

        {/* Last sent info */}
        {(config?.last_alert_sent_at || config?.last_summary_sent_at) && (
          <div className="text-xs text-muted-foreground space-y-0.5 pt-1 border-t">
            {config.last_alert_sent_at && (
              <div>Ultimo alert: {new Date(config.last_alert_sent_at).toLocaleString('it-IT')}</div>
            )}
            {config.last_summary_sent_at && (
              <div>Ultimo riepilogo: {new Date(config.last_summary_sent_at).toLocaleString('it-IT')}</div>
            )}
          </div>
        )}

        {/* Save button */}
        <Button
          size="sm"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || emails.length === 0}
          className="w-full"
        >
          {saveMutation.isPending ? (
            <RefreshCw className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Salva configurazione
        </Button>
      </CardContent>
    </Card>
  );
}
