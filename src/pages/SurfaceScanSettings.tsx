import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Bell, Pencil, Trash2, Plus } from 'lucide-react';
import { useSurfaceScanAlerts, SurfaceScanAlertTypes } from '@/hooks/useSurfaceScanAlerts';
import { SurfaceScanAlertConfigDialog } from '@/components/surface-scan/SurfaceScanAlertConfigDialog';

const alertTypeLabels: Record<keyof SurfaceScanAlertTypes, string> = {
  vulnerabilita_critiche: 'Vulnerabilità Critiche',
  vulnerabilita_alte: 'Vulnerabilità Alte',
  porte_esposte: 'Porte Esposte',
  certificati_scaduti: 'Certificati Scaduti',
  servizi_non_sicuri: 'Servizi Non Sicuri',
};

export default function SurfaceScanSettings() {
  const { alerts, loading, createAlert, updateAlert, deleteAlert, toggleAlertStatus } =
    useSurfaceScanAlerts();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAlert, setEditingAlert] = useState<string | null>(null);
  const [deleteAlertId, setDeleteAlertId] = useState<string | null>(null);

  const handleCreateAlert = async (data: {
    alert_email: string;
    alert_types: SurfaceScanAlertTypes;
  }) => {
    return await createAlert(data);
  };

  const handleUpdateAlert = async (data: {
    alert_email: string;
    alert_types: SurfaceScanAlertTypes;
  }) => {
    if (!editingAlert) return false;
    const success = await updateAlert(editingAlert, data);
    if (success) {
      setEditingAlert(null);
    }
    return success;
  };

  const handleDeleteConfirm = async () => {
    if (!deleteAlertId) return;
    const success = await deleteAlert(deleteAlertId);
    if (success) {
      setDeleteAlertId(null);
    }
  };

  const editingAlertData = alerts.find((a) => a.id === editingAlert);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Alert SurfaceScan360</h1>
            <p className="text-muted-foreground mt-2">
              Gestisci le notifiche per le vulnerabilità rilevate nelle scansioni
            </p>
          </div>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Nuovo Alert
          </Button>
        </div>

        {loading ? (
          <Card>
            <CardContent className="py-8">
              <p className="text-center text-muted-foreground">Caricamento alert...</p>
            </CardContent>
          </Card>
        ) : alerts.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center space-y-4">
                <Bell className="w-12 h-12 mx-auto text-muted-foreground" />
                <div>
                  <p className="text-lg font-medium">Nessun alert configurato</p>
                  <p className="text-muted-foreground">
                    Crea il tuo primo alert per ricevere notifiche sulle vulnerabilità
                  </p>
                </div>
                <Button onClick={() => setDialogOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Crea Alert
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {alerts.map((alert) => {
              const activeTypes = Object.entries(alert.alert_types)
                .filter(([_, enabled]) => enabled)
                .map(([type]) => type as keyof SurfaceScanAlertTypes);

              return (
                <Card key={alert.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="space-y-2 flex-1">
                        <CardTitle className="flex items-center gap-2">
                          <Bell className="w-5 h-5" />
                          {alert.alert_email}
                        </CardTitle>
                        <CardDescription>
                          Creato il {new Date(alert.created_at).toLocaleDateString('it-IT')}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={alert.is_active}
                          onCheckedChange={(checked) =>
                            toggleAlertStatus(alert.id, checked)
                          }
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditingAlert(alert.id)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteAlertId(alert.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Tipi di alert monitorati:</p>
                      <div className="flex flex-wrap gap-2">
                        {activeTypes.map((type) => (
                          <Badge key={type} variant="secondary">
                            {alertTypeLabels[type]}
                          </Badge>
                        ))}
                      </div>
                      {!alert.is_active && (
                        <Badge variant="outline" className="mt-2">
                          Disattivato
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <SurfaceScanAlertConfigDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleCreateAlert}
        mode="create"
      />

      {editingAlertData && (
        <SurfaceScanAlertConfigDialog
          open={!!editingAlert}
          onOpenChange={(open) => !open && setEditingAlert(null)}
          onSubmit={handleUpdateAlert}
          defaultValues={{
            alert_email: editingAlertData.alert_email,
            alert_types: editingAlertData.alert_types,
          }}
          mode="edit"
        />
      )}

      <AlertDialog open={!!deleteAlertId} onOpenChange={() => setDeleteAlertId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma eliminazione</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare questo alert? L'azione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>Elimina</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
