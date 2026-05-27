import React, { useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle,
  Bell,
  Eye,
  Mail,
  Shield,
  UserX,
} from 'lucide-react';
import { AlertBellButton } from '@/components/dark-risk/AlertBellButton';
import { AlertConfigDialog } from '@/components/dark-risk/AlertConfigDialog';
import { useDarkRiskAlerts } from '@/hooks/useDarkRiskAlerts';
import { useClientOrganization } from '@/hooks/useClientOrganization';

const alertTypeLabels: Record<string, string> = {
  credenziali_compromesse: 'Credenziali compromesse',
  dati_carte_credito: 'Dati carte di credito',
  database_leak: 'Database leak',
  email_compromesse: 'Email compromesse',
  dati_sensibili: 'Dati sensibili',
};

const DarkRisk360: React.FC = () => {
  const { alerts, loading, createAlert } = useDarkRiskAlerts();
  const { canManageMultipleClients, selectedOrganization } = useClientOrganization();
  const [alertDialogOpen, setAlertDialogOpen] = useState(false);

  const activeAlertsCount = alerts.filter((alert) => alert.is_active).length;
  const uniqueEmails = new Set(alerts.map((alert) => alert.alert_email)).size;
  const monitoredTypes = useMemo(() => {
    const types = new Set<string>();
    alerts.forEach((alert) => {
      Object.entries(alert.alert_types || {}).forEach(([key, enabled]) => {
        if (enabled) types.add(key);
      });
    });
    return Array.from(types);
  }, [alerts]);

  const hasConfiguredAlerts = alerts.length > 0;
  const isReadOnlyView = canManageMultipleClients;
  const emptyStateText = isReadOnlyView
    ? `${selectedOrganization?.name || 'Il cliente selezionato'} non ha ancora configurato monitoraggi DarkRisk.`
    : 'Configura il primo alert per iniziare a monitorare esposizioni e ricevere notifiche.';

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">DarkRisk360</h1>
            <p className="text-muted-foreground">
              Vista DarkRisk del cliente attualmente selezionato
            </p>
          </div>
          {!isReadOnlyView && (
            <Button className="bg-primary text-primary-foreground" onClick={() => setAlertDialogOpen(true)}>
              <Eye className="w-4 h-4 mr-2" />
              Configura monitoraggio
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">Alert attivi</p>
                    <AlertBellButton
                      alertCount={activeAlertsCount}
                      onClick={() => !isReadOnlyView && setAlertDialogOpen(true)}
                    />
                  </div>
                  <p className="text-2xl font-bold text-foreground">{activeAlertsCount}</p>
                </div>
                <Bell className="w-8 h-8 text-primary" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Monitoraggi configurati</p>
                  <p className="text-2xl font-bold text-foreground">{alerts.length}</p>
                </div>
                <Shield className="w-8 h-8 text-primary" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Destinatari</p>
                  <p className="text-2xl font-bold text-foreground">{uniqueEmails}</p>
                </div>
                <Mail className="w-8 h-8 text-primary" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Tipologie monitorate</p>
                  <p className="text-2xl font-bold text-foreground">{monitoredTypes.length}</p>
                </div>
                <UserX className="w-8 h-8 text-primary" />
              </div>
            </CardContent>
          </Card>
        </div>

        {!loading && !hasConfiguredAlerts ? (
          <Card className="border-dashed border-border">
            <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
              <AlertTriangle className="h-10 w-10 text-muted-foreground/60" />
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-foreground">Nessun dato disponibile</h2>
                <p className="max-w-xl text-sm text-muted-foreground">{emptyStateText}</p>
              </div>
              {!isReadOnlyView && (
                <Button onClick={() => setAlertDialogOpen(true)}>
                  Configura il primo alert
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border">
            <CardHeader>
              <CardTitle>Monitoraggi configurati</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {alerts.map((alert) => {
                  const enabledTypes = Object.entries(alert.alert_types || {})
                    .filter(([, enabled]) => enabled)
                    .map(([type]) => alertTypeLabels[type] || type);

                  return (
                    <div
                      key={alert.id}
                      className="rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/30"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4 text-primary" />
                            <span className="font-medium text-foreground">{alert.alert_email}</span>
                            <Badge variant={alert.is_active ? 'default' : 'outline'}>
                              {alert.is_active ? 'Attivo' : 'Disattivato'}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {enabledTypes.length > 0 ? (
                              enabledTypes.map((type) => (
                                <Badge key={type} variant="secondary">
                                  {type}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-sm text-muted-foreground">Nessuna tipologia attiva</span>
                            )}
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Aggiornato il {new Date(alert.updated_at).toLocaleDateString('it-IT')}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {!isReadOnlyView && (
          <AlertConfigDialog
            open={alertDialogOpen}
            onOpenChange={setAlertDialogOpen}
            onSubmit={createAlert}
            mode="create"
          />
        )}
      </div>
    </DashboardLayout>
  );
};

export default DarkRisk360;
