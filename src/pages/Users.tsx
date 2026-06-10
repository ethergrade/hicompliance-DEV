import { useEffect, useState, useRef, useMemo } from "react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { companiesApi, configApi, usersApi } from "@/lib/api";
import { useClientOrganization } from "@/hooks/useClientOrganization";
import type { TenantResource, UserResource } from "@/types/api";
import { User, Plus, Edit, Trash2, UserCheck, UserX, Building2, Search, X } from "lucide-react";

interface UserFormData {
  email: string;
  name: string;
  role: string;
  password: string;
}

const fallbackRoles = ["admin", "viewer", "sales", "customer"];
const tenantRestrictedRoles = new Set(["customer", "viewer", "editor"]);

const getPrimaryRole = (user: UserResource) => user.roles?.[0] ?? "viewer";

const getRoleLabel = (role: string) => {
  const labels: Record<string, string> = {
    "super-admin": "Super Admin",
    master: "Master",
    super_admin: "Super Admin",
    superadmin: "Super Admin",
    admin: "Amministratore",
    manager: "Manager",
    sales: "Sales",
    customer: "Cliente",
    client: "Cliente",
    editor: "Editor",
    viewer: "Viewer",
  };

  return labels[role] ?? role;
};

const getRoleVariant = (role: string): "default" | "destructive" | "secondary" | "outline" => {
  if (role === "super-admin" || role === "super_admin" || role === "superadmin" || role === "master" || role === "admin") return "destructive";
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
  const [tenantDialogOpen, setTenantDialogOpen] = useState(false);
  const [tenantUser, setTenantUser] = useState<UserResource | null>(null);
  const [selectedTenantIds, setSelectedTenantIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const tenantInitialLoadDone = useRef(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedOrganization } = useClientOrganization();
  const groupId = selectedOrganization?.group_id ?? null;

  const form = useForm<UserFormData>({
    defaultValues: {
      email: "",
      name: "",
      role: "viewer",
      password: "",
    },
  });

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users", groupId],
    queryFn: () => usersApi.list(groupId),
    enabled: !!groupId,
  });

  const searchedUsers = useMemo(() => {
    if (!searchQuery.trim()) return users;
    const q = searchQuery.toLowerCase();
    return users.filter(u =>
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q)
    );
  }, [users, searchQuery]);

  const { data: roles = [] } = useQuery({
    queryKey: ["config", "roles"],
    queryFn: configApi.roles,
  });

  const { data: companies = [] } = useQuery({
    queryKey: ['companies-all', groupId],
    queryFn: () => companiesApi.listAll(groupId!),
    enabled: !!groupId,
  });

  const { data: tenantAssignments = [], isLoading: tenantAssignmentsLoading } = useQuery({
    queryKey: ['user-tenants', tenantUser?.id, groupId],
    queryFn: () => usersApi.listTenants(tenantUser!.id, groupId),
    enabled: tenantDialogOpen && !!tenantUser?.id && !!groupId,
  });

  useEffect(() => {
    if (tenantDialogOpen && !tenantAssignmentsLoading && !tenantInitialLoadDone.current) {
      setSelectedTenantIds(tenantAssignments);
      tenantInitialLoadDone.current = true;
    }
  }, [tenantAssignments, tenantDialogOpen, tenantAssignmentsLoading]);

  const roleOptions = roles.length > 0 ? roles : fallbackRoles;

  const getUserGroups = (user: UserResource) => {
    const groups = (user as any).groups as Array<{ id: string; name: string; role: string }> | undefined;
    return groups?.map(g => g.name).join(", ") ?? "—";
  };

  const createUserMutation = useMutation({
    mutationFn: (data: UserFormData) => usersApi.create({
      name: data.name,
      email: data.email,
      password: data.password,
      role: data.role,
    }, groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setIsDialogOpen(false);
      setSelectedUser(null);
      form.reset();
      toast({ title: "Successo", description: "Utente creato con successo" });
    },
    onError: (error) => {
      toast({ title: "Errore", description: getErrorMessage(error), variant: "destructive" });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: (data: UserFormData) => {
      if (!selectedUser) throw new Error("Nessun utente selezionato");
      return usersApi.update(selectedUser.id, {
        name: data.name,
        email: data.email,
        role: data.role,
      }, groupId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setIsDialogOpen(false);
      setSelectedUser(null);
      form.reset();
      toast({ title: "Successo", description: "Utente aggiornato con successo" });
    },
    onError: (error) => {
      toast({ title: "Errore", description: getErrorMessage(error), variant: "destructive" });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (userId: string | number) => usersApi.delete(userId, groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setIsDeleteDialogOpen(false);
      setUserToDelete(null);
      toast({ title: "Successo", description: "Utente eliminato con successo" });
    },
    onError: (error) => {
      toast({ title: "Errore", description: getErrorMessage(error), variant: "destructive" });
    },
  });

  const syncTenantsMutation = useMutation({
    mutationFn: async () => {
      if (!tenantUser) throw new Error('Nessun utente selezionato');
      return usersApi.syncTenants(tenantUser.id, selectedTenantIds, groupId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-tenants', tenantUser?.id, groupId] });
      setTenantDialogOpen(false);
      setTenantUser(null);
      toast({ title: 'Successo', description: 'Tenant assegnati aggiornati con successo' });
    },
    onError: (error) => {
      toast({ title: 'Errore', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  const openDialog = (user?: UserResource) => {
    if (user) {
      setSelectedUser(user);
      form.reset({ email: user.email, name: user.name, role: getPrimaryRole(user), password: "" });
    } else {
      setSelectedUser(null);
      form.reset({ email: "", name: "", role: roleOptions[0] ?? "viewer", password: "" });
    }
    setIsDialogOpen(true);
  };

  const openDeleteDialog = (user: UserResource) => {
    setUserToDelete(user);
    setIsDeleteDialogOpen(true);
  };

  const openTenantDialog = (user: UserResource) => {
    setTenantUser(user);
    setSelectedTenantIds([]);
    tenantInitialLoadDone.current = false;
    setTenantDialogOpen(true);
  };

  const onSubmit = (data: UserFormData) => {
    if (selectedUser) updateUserMutation.mutate(data);
    else createUserMutation.mutate(data);
  };

  const toggleTenant = (tenantId: string, checked: boolean) => {
    setSelectedTenantIds(prev => checked ? [...prev, tenantId] : prev.filter(id => id !== tenantId));
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Gestione Utenti</h1>
            <p className="text-muted-foreground">
              Gestisci accessi, ruoli e tenant assegnati agli utenti limitati
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
                <DialogTitle>{selectedUser ? "Modifica Utente" : "Nuovo Utente"}</DialogTitle>
                <DialogDescription>
                  {selectedUser ? "Modifica i dettagli dell'utente e i suoi privilegi" : "Crea un nuovo utente e assegna i suoi privilegi"}
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
                      pattern: { value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i, message: "Email non valida" }
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
                      rules={{ required: "Password è richiesta", minLength: { value: 8, message: "Password deve essere di almeno 8 caratteri" } }}
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
                    L'utente verrà creato nel gruppo corrente{selectedOrganization?.name ? ` (${selectedOrganization.name})` : ''}.
                  </p>
                  <DialogFooter>
                    <Button type="submit" disabled={createUserMutation.isPending || updateUserMutation.isPending}>
                      {createUserMutation.isPending || updateUserMutation.isPending ? 'Salvando...' : selectedUser ? 'Aggiorna' : 'Crea'}
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
              <User className="w-5 h-5" /> Utenti del Sistema
            </CardTitle>
            <CardDescription>
              Lista completa degli utenti con ruoli, gruppi e tenant assegnati se il ruolo è limitato
            </CardDescription>
            <div className="relative mt-2">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cerca per nome o email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-8"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-muted-foreground">Caricamento utenti...</div>
              </div>
            ) : searchedUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8">
                <User className="w-12 h-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">
                  {searchQuery ? 'Nessun risultato' : 'Nessun utente trovato'}
                </h3>
                <p className="text-muted-foreground text-center mb-4">
                  {searchQuery
                    ? 'Nessun utente corrisponde ai criteri di ricerca'
                    : 'Inizia creando il primo utente del sistema'}
                </p>
                {!searchQuery && (
                  <Button onClick={() => openDialog()}>
                    <Plus className="w-4 h-4 mr-2" />
                    Crea primo utente
                  </Button>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Ruolo</TableHead>
                    <TableHead>Gruppo</TableHead>
                    <TableHead>Data Creazione</TableHead>
                    <TableHead className="text-right">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {searchedUsers.map((user) => {
                    const role = getPrimaryRole(user);
                    const canAssignTenants = tenantRestrictedRoles.has(role);
                    return (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.name}</TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>
                          <Badge variant={getRoleVariant(role)}>
                            {role === 'super-admin' || role === 'superadmin' || role === 'super_admin' || role === 'master' || role === 'admin' ? (
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
                        <TableCell>{getUserGroups(user)}</TableCell>
                        <TableCell>{new Date(user.created_at).toLocaleDateString('it-IT')}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {canAssignTenants && (
                              <Button variant="outline" size="sm" onClick={() => openTenantDialog(user)} title="Assegna tenant">
                                <Building2 className="w-4 h-4" />
                              </Button>
                            )}
                            <Button variant="outline" size="sm" onClick={() => openDialog(user)}>
                              <Edit className="w-4 h-4" />
                            </Button>
                            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                              <AlertDialogTrigger asChild>
                                <Button variant="outline" size="sm" onClick={() => openDeleteDialog(user)}>
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Elimina Utente</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Sei sicuro di voler eliminare l'utente <strong>{userToDelete?.name}</strong>? Questa azione non può essere annullata.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Annulla</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => userToDelete && deleteUserMutation.mutate(userToDelete.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
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

        <Dialog open={tenantDialogOpen} onOpenChange={setTenantDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Tenant assegnati</DialogTitle>
              <DialogDescription>
                Limita i tenant visibili per <strong>{tenantUser?.name}</strong>. Valido per ruoli customer / viewer / editor.
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[420px] pr-4">
              <div className="space-y-3">
                {companies.map((company: TenantResource) => {
                  const checked = selectedTenantIds.includes(company.id);
                  return (
                    <label key={company.id} className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer">
                      <Checkbox checked={checked} onCheckedChange={(value) => toggleTenant(company.id, value === true)} />
                      <div>
                        <div className="font-medium">{company.name}</div>
                        <div className="text-xs text-muted-foreground">{company.id}</div>
                      </div>
                    </label>
                  );
                })}
                {companies.length === 0 && (
                  <div className="text-sm text-muted-foreground">Nessun tenant disponibile nel gruppo selezionato.</div>
                )}
              </div>
            </ScrollArea>
            <DialogFooter>
              <Button variant="outline" onClick={() => setTenantDialogOpen(false)}>Annulla</Button>
              <Button onClick={() => syncTenantsMutation.mutate()} disabled={syncTenantsMutation.isPending}>
                {syncTenantsMutation.isPending ? 'Salvando...' : 'Salva Tenant'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Users;
