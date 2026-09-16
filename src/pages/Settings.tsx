import React, { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import { RotateCcw, Settings2 } from 'lucide-react';
import { DarkRiskNotificationConfigCard } from '@/components/dark-risk/DarkRiskNotificationConfigCard';
import { useResetAllPreferences } from '@/hooks/useUserPreferences';
import { useClientContext } from '@/contexts/ClientContext';
import { toast } from '@/hooks/use-toast';

// Le notifiche DarkRisk360 passano da `darkrisk/notification-config`, l'unica
// configurazione che il backend legge per inviare le email. La precedente
// sezione "alert" di questa pagina scriveva su `dark-risk-alerts`, che nessun
// job consuma: era una lista di indirizzi che non riceveva mai nulla.
const Settings: React.FC = () => {
  const { selectedOrganization } = useClientContext();
  const { resetAllPreferences } = useResetAllPreferences();
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetScope, setResetScope] = useState<'current' | 'all'>('current');
  const [isResetting, setIsResetting] = useState(false);

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
        <div>
          <h1 className="text-3xl font-bold">Impostazioni</h1>
          <p className="text-muted-foreground mt-2">
            Notifiche DarkRisk360 per {selectedOrganization?.name || 'il cliente selezionato'} e preferenze personali
          </p>
        </div>

        <DarkRiskNotificationConfigCard />

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
