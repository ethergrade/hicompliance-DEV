import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Bell, Pencil, Trash2, Plus, User } from 'lucide-react';
import { useSurfaceScanAlerts, SurfaceScanAlertTypes } from '@/hooks/useSurfaceScanAlerts';
import { SurfaceScanAlertConfigDialog } from '@/components/surface-scan/SurfaceScanAlertConfigDialog';
import {
  IocLeaseMinutes,
  IocSeverity,
  IocType,
  useSurfaceScanIocFreshList,
} from '@/hooks/useSurfaceScanIocFreshList';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';

const alertTypeLabels: Record<keyof SurfaceScanAlertTypes, string> = {
  vulnerabilita_critiche: 'Vulnerabilità Critiche',
  vulnerabilita_alte: 'Vulnerabilità Alte',
  porte_esposte: 'Porte Esposte',
  certificati_scaduti: 'Certificati Scaduti',
  servizi_non_sicuri: 'Servizi Non Sicuri',
};

export default function SurfaceScanSettings() {
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.user_type === 'admin';
  const { alerts, loading, createAlert, updateAlert, deleteAlert, toggleAlertStatus } =
    useSurfaceScanAlerts();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAlert, setEditingAlert] = useState<string | null>(null);
  const [deleteAlertId, setDeleteAlertId] = useState<string | null>(null);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [leaseMinutes, setLeaseMinutes] = useState<IocLeaseMinutes>(60);
  const [iocEnabled, setIocEnabled] = useState(true);
  const [iocValue, setIocValue] = useState('');
  const [iocType, setIocType] = useState<IocType>('domain');
  const [iocConfidence, setIocConfidence] = useState(80);
  const [iocSeverity, setIocSeverity] = useState<IocSeverity>('medium');
  const [iocNotes, setIocNotes] = useState('');

  const {
    config: iocConfig,
    items: iocItems,
    loading: iocLoading,
    saving: iocSaving,
    isAdmin: isIocAdmin,
    saveConfig: saveIocConfig,
    addItem: addIocItem,
    removeItem: removeIocItem,
    toggleItem: toggleIocItem,
  } = useSurfaceScanIocFreshList();

  // Carica i nomi utente per gli alert (solo per admin)
  useEffect(() => {
    if (!isAdmin || alerts.length === 0) return;

    const fetchUserNames = async () => {
      const userIds = [...new Set(alerts.map((a) => a.user_id))];
      const { data } = await supabase
        .from('users')
        .select('auth_user_id, full_name, email')
        .in('auth_user_id', userIds);

      if (data) {
        const names: Record<string, string> = {};
        data.forEach((user) => {
          names[user.auth_user_id] = `${user.full_name} (${user.email})`;
        });
        setUserNames(names);
      }
    };

    fetchUserNames();
  }, [alerts, isAdmin]);

  useEffect(() => {
    if (!iocConfig) return;
    setLeaseMinutes(iocConfig.lease_minutes);
    setIocEnabled(Boolean(iocConfig.is_enabled));
  }, [iocConfig]);

  const handleCreateAlert = async (data: {
    alert_email: string;
    alert_types: SurfaceScanAlertTypes;
    target_user_id?: string;
  }) => {
    return await createAlert(data);
  };

  const handleUpdateAlert = async (data: {
    alert_email: string;
    alert_types: SurfaceScanAlertTypes;
    target_user_id?: string;
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

  const handleSaveIocConfig = async () => {
    await saveIocConfig({
      lease_minutes: leaseMinutes,
      is_enabled: iocEnabled,
    });
  };

  const handleAddIoc = async () => {
    const ok = await addIocItem({
      ioc_value: iocValue,
      ioc_type: iocType,
      confidence: iocConfidence,
      severity: iocSeverity,
      notes: iocNotes,
    });
    if (ok) {
      setIocValue('');
      setIocNotes('');
      setIocConfidence(80);
      setIocSeverity('medium');
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
                        {isAdmin && userNames[alert.user_id] && (
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">
                              {userNames[alert.user_id]}
                            </span>
                          </div>
                        )}
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

        {isAdmin && isIocAdmin && (
          <Card>
            <CardHeader>
              <CardTitle>IOC Fresh List</CardTitle>
              <CardDescription>
                Lista IOC amministrabile con aggiornamento periodico basato su lease.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Lease aggiornamento</p>
                  <Select
                    value={String(leaseMinutes)}
                    onValueChange={(value) => setLeaseMinutes(Number(value) as IocLeaseMinutes)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
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
                    <span className="text-sm text-muted-foreground">
                      {iocEnabled ? 'Attiva' : 'Disattiva'}
                    </span>
                    <Switch checked={iocEnabled} onCheckedChange={setIocEnabled} />
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">Ultimo refresh feed</p>
                  <div className="h-10 px-3 rounded-md border border-input flex items-center text-sm text-muted-foreground">
                    {iocConfig?.last_refreshed_at
                      ? new Date(iocConfig.last_refreshed_at).toLocaleString('it-IT')
                      : 'Non ancora eseguito'}
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">Azioni</p>
                  <Button className="w-full" onClick={handleSaveIocConfig} disabled={iocSaving}>
                    Salva configurazione
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border p-4 space-y-3">
                <p className="text-sm font-medium">Aggiungi IOC manuale</p>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                  <Input
                    className="md:col-span-2"
                    value={iocValue}
                    onChange={(event) => setIocValue(event.target.value)}
                    placeholder="es. bad-domain.tld, 203.0.113.10, https://target/path"
                  />
                  <Select value={iocType} onValueChange={(value) => setIocType(value as IocType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="domain">Dominio</SelectItem>
                      <SelectItem value="ip">IP</SelectItem>
                      <SelectItem value="url">URL</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={iocConfidence}
                    onChange={(event) =>
                      setIocConfidence(Math.max(0, Math.min(100, Number(event.target.value) || 0)))
                    }
                    placeholder="Confidenza 0-100"
                  />
                  <Select value={iocSeverity} onValueChange={(value) => setIocSeverity(value as IocSeverity)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="critical">Critical</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="info">Info</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Textarea
                  value={iocNotes}
                  onChange={(event) => setIocNotes(event.target.value)}
                  placeholder="Note operative (opzionale)"
                  rows={2}
                />
                <div className="flex justify-end">
                  <Button onClick={handleAddIoc} disabled={iocSaving || !iocValue.trim()}>
                    Aggiungi IOC
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">IOC in lista</p>
                  <Badge variant="secondary">{iocItems.length}</Badge>
                </div>
                {iocLoading ? (
                  <p className="text-sm text-muted-foreground">Caricamento IOC...</p>
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
                            {item.expires_at ? (
                              <span className="text-xs text-muted-foreground">
                                Exp: {new Date(item.expires_at).toLocaleString('it-IT')}
                              </span>
                            ) : null}
                          </div>
                          {item.notes ? (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.notes}</p>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={item.is_active}
                            onCheckedChange={(checked) => void toggleIocItem(item.id, checked)}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => void removeIocItem(item.id)}
                            disabled={item.source !== 'manual'}
                            title={item.source === 'manual' ? 'Elimina IOC' : 'IOC gestito automaticamente dal feed'}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
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
