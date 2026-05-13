import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { configApi, tenantsApi, usersApi } from "@/lib/api";
import { useClientContext } from "@/contexts/ClientContext";
import type { TenantResource, UserResource } from "@/types/api";
import { User, Plus, Edit, Trash2, UserCheck, UserX } from "lucide-react";

interface UserFormData {
  email: string;
  name: string;
  role: string;
  password: string;
}

const fallbackRoles = ["admin", "editor", "viewer"];

const getPrimaryRole = (user: UserResource) => user.roles?.[0] ?? "viewer";

const getRoleLabel = (role: string) => {
  const labels: Record<string, string> = {
    super_admin: "Super Admin",
    superadmin: "Super Admin",
    admin: "Amministratore",
    manager: "Manager",
    sales: "Sales",
    client: "Cliente",
    editor: "Editor",
    viewer: "Viewer",
  };

  return labels[role] ?? role;
};

const getRoleVariant = (role: string): "default" | "destructive" | "secondary" | "outline" => {
  if (role === "super_admin" || role === "superadmin" || role === "admin") return "destructive";
  if (role === "manager" || role === "sales" || role === "editor") return "secondary";
  return "default";
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  return "Operazione non riuscita";
};

const Users = () => {
  const [selectedUser, setSelectedUser] = useState<UserResource | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserResource | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedOrganization, canManageMultipleClients } = useClientContext();

  const form = useForm<UserFormData>({
    defaultValues: {
      email: "",
      name: "",
      role: "viewer",
      password: "",
    },
  });

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: usersApi.list,
  });

  const { data: tenants = [] } = useQuery({
    queryKey: ["tenants"],
    queryFn: tenantsApi.listAll,
  });

  const { data: roles = [] } = useQuery({
    queryKey: ["config", "roles"],
    queryFn: configApi.roles,
  });

  const roleOptions = roles.length > 0 ? roles : fallbackRoles;

  const getTenantName = (tenantId: string | null) => {
    if (!tenantId) return "Nessuna";
    const tenant = tenants.find((item: TenantResource) => item.id === tenantId);
    return tenant?.name ?? tenantId;
  };

  const createUserMutation = useMutation({
    mutationFn: (data: UserFormData) => usersApi.create({
      name: data.name,
      email: data.email,
      password: data.password,
      role: data.role,
      tenant_id: canManageMultipleClients ? selectedOrganization?.id ?? null : undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setIsDialogOpen(false);
      setSelectedUser(null);
      form.reset();
      toast({
        title: "Successo",
        description: "Utente creato con successo",
      });
    },
    onError: (error) => {
      toast({
        title: "Errore",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: (data: UserFormData) => {
      if (!selectedUser) throw new Error("Nessun utente selezionato");

      return usersApi.update(selectedUser.id, {
        name: data.name,
        email: data.email,
        role: data.role,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setIsDialogOpen(false);
      setSelectedUser(null);
      form.reset();
      toast({
        title: "Successo",
        description: "Utente aggiornato con successo",
      });
    },
    onError: (error) => {
      toast({
        title: "Errore",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (userId: number) => usersApi.delete(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setIsDeleteDialogOpen(false);
      setUserToDelete(null);
      toast({
        title: "Successo",
        description: "Utente eliminato con successo",
      });
    },
    onError: (error) => {
      toast({
        title: "Errore",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const openDialog = (user?: UserResource) => {
    if (user) {
      setSelectedUser(user);
      form.reset({
        email: user.email,
        name: user.name,
        role: getPrimaryRole(user),
        password: "",
      });
    } else {
      setSelectedUser(null);
      form.reset({
        email: "",
        name: "",
        role: roleOptions[0] ?? "viewer",
        password: "",
      });
    }
    setIsDialogOpen(true);
  };

  const openDeleteDialog = (user: UserResource) => {
    setUserToDelete(user);
    setIsDeleteDialogOpen(true);
  };

  const onSubmit = (data: UserFormData) => {
    if (selectedUser) {
      updateUserMutation.mutate(data);
    } else {
      createUserMutation.mutate(data);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Gestione Utenti</h1>
            <p className="text-muted-foreground">
              Gestisci accessi e controllo basato sui ruoli (RBAC)
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => openDialog()}>
                <Plus className="w-4 h-4 mr-2" />
                Nuovo Utente
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {selectedUser ? "Modifica Utente" : "Nuovo Utente"}
                </DialogTitle>
                <DialogDescription>
                  {selectedUser
                    ? "Modifica i dettagli dell'utente e i suoi privilegi"
                    : "Crea un nuovo utente e assegna i suoi privilegi"
                  }
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    rules={{ required: "Nome completo è richiesto" }}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome Completo</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Mario Rossi" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email"
                    rules={{
                      required: "Email è richiesta",
                      pattern: {
                        value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                        message: "Email non valida"
                      }
                    }}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input {...field} type="email" placeholder="mario.rossi@email.com" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {!selectedUser && (
                    <FormField
                      control={form.control}
                      name="password"
                      rules={{
                        required: "Password è richiesta",
                        minLength: {
                          value: 8,
                          message: "Password deve essere di almeno 8 caratteri"
                        }
                      }}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <Input {...field} type="password" placeholder="••••••••" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ruolo</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleziona un ruolo" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {roleOptions.map((role) => (
                              <SelectItem key={role} value={role}>
                                {getRoleLabel(role)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <p className="text-xs text-muted-foreground">
                    {canManageMultipleClients
                      ? `L'utente verrà creato nel tenant selezionato: ${selectedOrganization?.name || 'nessun cliente selezionato'}.`
                      : "L'utente verrà creato nel tenant dell'account autenticato."}
                  </p>
                  <DialogFooter>
                    <Button
                      type="submit"
                      disabled={createUserMutation.isPending || updateUserMutation.isPending}
                    >
                      {createUserMutation.isPending || updateUserMutation.isPending
                        ? "Salvando..."
                        : selectedUser ? "Aggiorna" : "Crea"
                      }
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              Utenti del Sistema
            </CardTitle>
            <CardDescription>
              Lista completa degli utenti con i loro ruoli e tenant
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-muted-foreground">Caricamento utenti...</div>
              </div>
            ) : users.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8">
                <User className="w-12 h-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Nessun utente trovato</h3>
                <p className="text-muted-foreground text-center mb-4">
                  Inizia creando il primo utente del sistema
                </p>
                <Button onClick={() => openDialog()}>
                  <Plus className="w-4 h-4 mr-2" />
                  Crea primo utente
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Ruolo</TableHead>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Data Creazione</TableHead>
                    <TableHead className="text-right">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => {
                    const role = getPrimaryRole(user);

                    return (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.name}</TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>
                          <Badge variant={getRoleVariant(role)}>
                            {role === "superadmin" || role === "admin" ? (
                              <>
                                <UserCheck className="w-3 h-3 mr-1" />
                                {getRoleLabel(role)}
                              </>
                            ) : (
                              <>
                                <UserX className="w-3 h-3 mr-1" />
                                {getRoleLabel(role)}
                              </>
                            )}
                          </Badge>
                        </TableCell>
                        <TableCell>{getTenantName(user.tenant_id)}</TableCell>
                        <TableCell>
                          {new Date(user.created_at).toLocaleDateString("it-IT")}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openDialog(user)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openDeleteDialog(user)}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Elimina Utente</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Sei sicuro di voler eliminare l'utente <strong>{userToDelete?.name}</strong>?
                                    Questa azione non può essere annullata.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Annulla</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => userToDelete && deleteUserMutation.mutate(userToDelete.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Elimina
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Users;
