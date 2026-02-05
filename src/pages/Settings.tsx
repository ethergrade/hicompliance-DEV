import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
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
import { Plus, Pencil, Trash2, User, RotateCcw, Settings2 } from 'lucide-react';
import { useDarkRiskAlerts } from '@/hooks/useDarkRiskAlerts';
import { AlertConfigDialog } from '@/components/dark-risk/AlertConfigDialog';
import { AlertTypes } from '@/hooks/useDarkRiskAlerts';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useResetAllPreferences } from '@/hooks/useUserPreferences';
import { useClientContext } from '@/contexts/ClientContext';
import { toast } from '@/hooks/use-toast';

const alertTypeLabels: Record<keyof AlertTypes, string> = {
  credenziali_compromesse: 'Credenziali Compromesse',
  dati_carte_credito: 'Carte di Credito',
  database_leak: 'Database Leak',
  email_compromesse: 'Email Compromesse',
  dati_sensibili: 'Dati Sensibili',
};

const Settings: React.FC = () => {
  const { userProfile } = useAuth();
  const { selectedOrganization } = useClientContext();
  const isAdmin = userProfile?.user_type === 'admin';
  const { alerts, loading, createAlert, updateAlert, deleteAlert, toggleAlertStatus } = useDarkRiskAlerts();
  const { resetAllPreferences } = useResetAllPreferences();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAlert, setEditingAlert] = useState<typeof alerts[0] | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [alertToDelete, setAlertToDelete] = useState<string | null>(null);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetScope, setResetScope] = useState<'current' | 'all'>('current');
  const [isResetting, setIsResetting] = useState(false);

  // Carica i nomi utente per gli alert (solo per admin)
  useEffect(() => {
    if (!isAdmin || alerts.length === 0) return;
    
    const fetchUserNames = async () => {
      const userIds = [...new Set(alerts.map(a => a.user_id))];
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

  const handleCreateAlert = async (data: { alert_email: string; alert_types: AlertTypes; target_user_id?: string }) => {
    return await createAlert(data);
  };

  const handleUpdateAlert = async (data: { alert_email: string; alert_types: AlertTypes; target_user_id?: string }) => {
    if (!editingAlert) return false;
    return await updateAlert(editingAlert.id, data);
  };

  const handleDeleteClick = (alertId: string) => {
    setAlertToDelete(alertId);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (alertToDelete) {
      await deleteAlert(alertToDelete);
      setDeleteDialogOpen(false);
      setAlertToDelete(null);
    }
  };

  const handleEditClick = (alert: typeof alerts[0]) => {
    setEditingAlert(alert);
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditingAlert(null);
  };

  const getActiveAlertTypes = (alertTypes: AlertTypes) => {
    return Object.entries(alertTypes)
      .filter(([_, value]) => value)
      .map(([key]) => alertTypeLabels[key as keyof AlertTypes]);
  };

  const handleResetPreferences = async () => {
    setIsResetting(true);
    const success = await resetAllPreferences(resetScope === 'current');
    setIsResetting(false);
    setResetDialogOpen(false);
    
    if (success) {
      toast({
        title: 'Preferenze Resettate',
        description: resetScope === 'current' 
          ? `Preferenze per ${selectedOrganization?.name || 'questa organizzazione'} resettate`
          : 'Tutte le preferenze sono state resettate',
      });
      // Reload page to reflect changes
      window.location.reload();
    } else {
      toast({
        title: 'Errore',
        description: 'Impossibile resettare le preferenze',
        variant: 'destructive',
      });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Impostazioni Alert DarkRisk360</h1>
            <p className="text-muted-foreground mt-2">
              Gestisci le notifiche per le minacce rilevate sul dark web
            </p>
          </div>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Nuovo Alert
          </Button>
        </div>

        {loading ? (
          <Card>
            <CardContent className="p-6">
              <p className="text-center text-muted-foreground">Caricamento alert...</p>
            </CardContent>
          </Card>
        ) : alerts.length === 0 ? (
          <Card>
            <CardContent className="p-6">
              <div className="text-center">
                <p className="text-muted-foreground mb-4">
                  Non hai ancora configurato nessun alert
                </p>
                <Button onClick={() => setDialogOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Crea il tuo primo alert
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {alerts.map((alert) => (
              <Card key={alert.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-lg">{alert.alert_email}</CardTitle>
                      <CardDescription>
                        Creato il {new Date(alert.created_at).toLocaleDateString('it-IT')}
                      </CardDescription>
                      {isAdmin && userNames[alert.user_id] && (
                        <div className="flex items-center gap-2 mt-2">
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
                        onCheckedChange={(checked) => toggleAlertStatus(alert.id, checked)}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditClick(alert)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteClick(alert.id)}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-medium mb-2">Tipi di minacce monitorate:</p>
                      <div className="flex flex-wrap gap-2">
                        {getActiveAlertTypes(alert.alert_types).map((type) => (
                          <Badge key={type} variant="secondary">
                            {type}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={alert.is_active ? 'default' : 'outline'}>
                        {alert.is_active ? 'Attivo' : 'Disattivo'}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Separator className="my-6" />

        {/* User Preferences Section */}
        <Card className="border-border">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-primary" />
              <CardTitle>Preferenze Utente</CardTitle>
            </div>
            <CardDescription>
              Gestisci le preferenze salvate per filtri, ordinamenti e visualizzazioni
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Reset Preferenze</p>
                <p className="text-sm text-muted-foreground">
                  Ripristina i valori predefiniti per filtri, ordinamenti e altre preferenze salvate
                </p>
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setResetScope('current');
                    setResetDialogOpen(true);
                  }}
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Reset Org. Corrente
                </Button>
                <Button 
                  variant="destructive" 
                  onClick={() => {
                    setResetScope('all');
                    setResetDialogOpen(true);
                  }}
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Reset Tutte
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <AlertConfigDialog
          open={dialogOpen && !editingAlert}
          onOpenChange={handleDialogClose}
          onSubmit={handleCreateAlert}
          mode="create"
        />

        {editingAlert && (
          <AlertConfigDialog
            open={dialogOpen && !!editingAlert}
            onOpenChange={handleDialogClose}
            onSubmit={handleUpdateAlert}
            defaultValues={{
              alert_email: editingAlert.alert_email,
              alert_types: editingAlert.alert_types,
            }}
            mode="edit"
          />
        )}

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Elimina Alert</AlertDialogTitle>
              <AlertDialogDescription>
                Sei sicuro di voler eliminare questo alert? Questa azione non può essere annullata.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annulla</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteConfirm}>
                Elimina
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset Preferenze</AlertDialogTitle>
              <AlertDialogDescription>
                {resetScope === 'current' 
                  ? `Vuoi resettare tutte le preferenze salvate per ${selectedOrganization?.name || 'questa organizzazione'}? Filtri, ordinamenti e altre impostazioni verranno ripristinati ai valori predefiniti.`
                  : 'Vuoi resettare tutte le preferenze salvate per tutte le organizzazioni? Questa azione non può essere annullata.'
                }
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isResetting}>Annulla</AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleResetPreferences}
                disabled={isResetting}
                className={resetScope === 'all' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
              >
                {isResetting ? 'Resettando...' : 'Conferma Reset'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
};

export default Settings;
