import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { configApi, roleModulePermissionsApi } from '@/lib/api';
import { useUserRoles } from '@/hooks/useUserRoles';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import { useToast } from '@/hooks/use-toast';
import type { RoleModulePermission } from '@/types/api';

const roleDescriptions: Record<string, string> = {
  'super-admin': 'Accesso di piattaforma completo.',
  master: 'Ruolo globale di piattaforma restituito dalla configurazione API.',
  admin: 'Gestione completa delle risorse del tenant.',
  manager: 'Accesso operativo esteso sul tenant.',
  sales: 'Gestione commerciale e selezione tenant.',
  customer: 'Utente cliente associato al tenant.',
  viewer: 'Sola lettura.',
  editor: 'Modifica operativa limitata.',
};

const formatRole = (role: string) => {
  const labels: Record<string, string> = {
    'super-admin': 'Super Admin',
    master: 'Master',
    admin: 'Admin',
    manager: 'Manager',
    sales: 'Sales',
    customer: 'Customer',
    viewer: 'Viewer',
    editor: 'Editor',
  };

  return labels[role] ?? role;
};

export default function RoleSettings() {
  const [selectedRole, setSelectedRole] = useState<string>('all');
  const { roles: currentUserRoles, isSuperAdmin } = useUserRoles();
  const { selectedOrganization } = useClientOrganization();
  const groupId = selectedOrganization?.group_id ?? null;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const {
    data: roles = [],
    isLoading: rolesLoading,
    error: rolesError,
  } = useQuery({
    queryKey: ['config', 'roles'],
    queryFn: configApi.roles,
  });

  const {
    data: permissions = [],
    isLoading: permissionsLoading,
    error: permissionsError,
  } = useQuery({
    queryKey: ['role-module-permissions', selectedRole, groupId],
    queryFn: () => roleModulePermissionsApi.list(selectedRole === 'all' ? undefined : selectedRole, groupId),
    enabled: !!groupId,
  });

  const togglePermissionMutation = useMutation({
    mutationFn: ({ id, isEnabled }: { id: string; isEnabled: boolean }) =>
      roleModulePermissionsApi.update(id, isEnabled, groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['role-module-permissions'] });
      toast({
        title: 'Permesso aggiornato',
        description: 'La modifica è stata salvata correttamente.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Errore',
        description: error instanceof Error ? error.message : 'Impossibile aggiornare il permesso',
        variant: 'destructive',
      });
    },
  });

  const groupedPermissions = useMemo(() => {
    return permissions.reduce<Record<string, RoleModulePermission[]>>((acc, permission) => {
      const key = permission.role;
      acc[key] ??= [];
      acc[key].push(permission);
      return acc;
    }, {});
  }, [permissions]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Ruoli & Permessi</h1>
          <p className="mt-2 text-muted-foreground">
            Gestione runtime dei permessi modulo via endpoint backend `role-module-permissions`.
          </p>
        </div>

        {!isSuperAdmin && (
          <Alert>
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Modalità sola lettura</AlertTitle>
            <AlertDescription>
              Solo i Super Admin possono modificare i permessi. Gli altri ruoli possono visualizzare il catalogo attivo.
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Ruoli utente corrente</CardTitle>
            <CardDescription>
              Ruoli ricevuti da `GET /auth/me` o dal login.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {currentUserRoles.length > 0 ? (
                currentUserRoles.map((role) => (
                  <Badge key={role} variant="destructive">
                    {formatRole(role)}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">
                  Nessun ruolo disponibile per l&apos;utente corrente.
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ruoli assegnabili</CardTitle>
            <CardDescription>
              Lista restituita da `GET /config/roles`.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {rolesLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Caricamento ruoli...
              </div>
            ) : rolesError ? (
              <div className="text-sm text-destructive">
                Impossibile caricare i ruoli dall&apos;API.
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {roles.map((role) => (
                  <div key={role} className="rounded-lg border p-4">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-primary" />
                      <span className="font-medium">{formatRole(role)}</span>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {roleDescriptions[role] ?? 'Ruolo disponibile esposto dal backend.'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>Permessi per modulo</CardTitle>
                <CardDescription>
                  Catalogo runtime da `GET /role-module-permissions` con toggle `PUT /role-module-permissions/{'{id}'}`.
                </CardDescription>
              </div>
              <div className="w-full md:w-64">
                <Select value={selectedRole} onValueChange={setSelectedRole}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filtra per ruolo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tutti i ruoli</SelectItem>
                    {roles.map((role) => (
                      <SelectItem key={role} value={role}>
                        {formatRole(role)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {permissionsLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Caricamento permessi...
              </div>
            ) : permissionsError ? (
              <div className="text-sm text-destructive">
                Impossibile caricare i permessi modulo dall&apos;API.
              </div>
            ) : permissions.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                Nessun permesso disponibile per il filtro selezionato.
              </div>
            ) : (
              <div className="space-y-6">
                {Object.entries(groupedPermissions).map(([role, items]) => (
                  <div key={role} className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{formatRole(role)}</Badge>
                      <span className="text-sm text-muted-foreground">{items.length} permessi</span>
                    </div>
                    <div className="rounded-lg border divide-y">
                      {items.map((permission) => (
                        <div key={permission.id} className="flex items-center justify-between gap-4 p-4">
                          <div className="min-w-0">
                            <div className="font-medium">{permission.module_name}</div>
                            <div className="text-xs text-muted-foreground font-mono break-all">
                              {permission.module_path}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <Badge variant={permission.is_enabled ? 'default' : 'secondary'}>
                              {permission.is_enabled ? 'Attivo' : 'Disattivo'}
                            </Badge>
                            <Switch
                              checked={permission.is_enabled}
                              disabled={!isSuperAdmin || togglePermissionMutation.isPending}
                              onCheckedChange={(checked) =>
                                togglePermissionMutation.mutate({ id: permission.id, isEnabled: checked })
                              }
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
