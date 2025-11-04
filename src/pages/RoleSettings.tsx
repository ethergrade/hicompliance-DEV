import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface ModulePermission {
  id: string;
  role: string;
  module_path: string;
  module_name: string;
  is_enabled: boolean;
}

export default function RoleSettings() {
  const [permissions, setPermissions] = useState<ModulePermission[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchPermissions();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('role-permissions-admin')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'role_module_permissions',
        },
        () => {
          fetchPermissions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchPermissions = async () => {
    try {
      const { data, error } = await supabase
        .from('role_module_permissions')
        .select('*')
        .eq('role', 'sales')
        .order('module_name');

      if (error) throw error;
      setPermissions(data || []);
    } catch (error) {
      console.error('Error fetching permissions:', error);
      toast({
        title: 'Errore',
        description: 'Impossibile caricare le impostazioni',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const togglePermission = async (permissionId: string, currentState: boolean) => {
    try {
      const { error } = await supabase
        .from('role_module_permissions')
        .update({ is_enabled: !currentState, updated_at: new Date().toISOString() })
        .eq('id', permissionId);

      if (error) throw error;

      toast({
        title: 'Aggiornato',
        description: 'Permesso aggiornato con successo',
      });
    } catch (error) {
      console.error('Error updating permission:', error);
      toast({
        title: 'Errore',
        description: 'Impossibile aggiornare il permesso',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Gestione Ruoli e Permessi</h1>
          <p className="text-muted-foreground mt-2">
            Configura quali moduli sono visibili per il ruolo Sales. Le modifiche sono applicate in tempo reale.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              Permessi Ruolo Sales
              <Badge variant="outline" className="font-normal">
                Real-time RBAC
              </Badge>
            </CardTitle>
            <CardDescription>
              Attiva o disattiva l'accesso ai moduli per gli utenti con ruolo Sales
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {permissions.map((permission) => (
                <div
                  key={permission.id}
                  className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="space-y-1">
                    <Label htmlFor={permission.id} className="text-base font-medium cursor-pointer">
                      {permission.module_name}
                    </Label>
                    <p className="text-sm text-muted-foreground">{permission.module_path}</p>
                  </div>
                  <Switch
                    id={permission.id}
                    checked={permission.is_enabled}
                    onCheckedChange={() => togglePermission(permission.id, permission.is_enabled)}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-lg">ℹ️ Come funziona</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>• I Super Admin vedono sempre tutti i moduli</p>
            <p>• Le modifiche ai permessi Sales sono visibili immediatamente</p>
            <p>• Gli utenti Sales vedranno solo i moduli abilitati nella sidebar</p>
            <p>• Le modifiche vengono sincronizzate in tempo reale via Supabase Realtime</p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
