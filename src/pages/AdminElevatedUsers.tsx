import { useEffect, useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { usersApi, authApi } from "@/lib/api";
import { useUserRoles } from "@/hooks/useUserRoles";
import { User, UserPlus, Edit, Trash2, KeyRound, Shield, Search, X } from "lucide-react";
import type { UserResource, UpdateUserRequest, Group } from "@/types/api";


const getRoleLabel = (role: string | null): string => {
  if (!role) return "N/A";
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

const getRoleVariant = (role: string | null): "default" | "destructive" | "secondary" | "outline" => {
  if (!role) return "outline";
  if (role === "super-admin" || role === "super_admin" || role === "superadmin" || role === "master" || role === "admin") return "destructive";
  if (role === "manager" || role === "sales" || role === "editor") return "secondary";
  return "outline";
};

const getPrimaryRole = (user: UserResource, groupId?: string | null): string | null => {
  if (groupId && user.groups?.length) {
    const group = user.groups.find(g => g.id === groupId);
    if (group?.role) return group.role;
  }
  if (!groupId && user.groups?.length) return user.groups[0].role;
  if (user.roles?.length) return user.roles[0];
  return null;
};

const getUserGroups = (user: UserResource): string => {
  if (!user.groups?.length) return "—";
  return user.groups.map(g => g.name).join(", ");
};

interface EditFormData {
  name: string;
  email: string;
  role: string;
}

interface CreateFormData {
  name: string;
  email: string;
  password: string;
  password_confirmation: string;
  role: string;
}

interface PasswordFormData {
  password: string;
  password_confirmation: string;
}

const roleOptions = ["super-admin", "admin", "sales", "manager", "viewer", "customer", "editor"];

const AdminElevatedUsers: React.FC = () => {
  const { isSuperAdmin } = useUserRoles();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Create dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserResource | null>(null);

  // Password dialog state
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [passwordUser, setPasswordUser] = useState<UserResource | null>(null);

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserResource | null>(null);

  const editForm = useForm<EditFormData>({
    defaultValues: { name: "", email: "", role: "viewer" },
  });

  const createForm = useForm<CreateFormData>({
    defaultValues: { name: "", email: "", password: "", password_confirmation: "", role: "super-admin" },
  });

  const passwordForm = useForm<PasswordFormData>({
    defaultValues: { password: "", password_confirmation: "" },
  });

  // Redirect if not super admin
  useEffect(() => {
    if (!isSuperAdmin) {
      navigate("/dashboard", { replace: true });
    }
  }, [isSuperAdmin, navigate]);

  // Fetch groups for filter
  const { data: groups = [] } = useQuery({
    queryKey: ["auth-groups"],
    queryFn: () => authApi.groups(),
    enabled: isSuperAdmin,
  });

  // Fetch elevated users from backend
  const { data: elevatedUsers = [], isLoading } = useQuery({
    queryKey: ["elevated-users", selectedGroupId],
    queryFn: () => usersApi.list(selectedGroupId, { elevated: true }),
    enabled: isSuperAdmin,
  });

  // Search filter
  const searchedUsers = useMemo(() => {
    if (!searchQuery) return elevatedUsers;
    const q = searchQuery.toLowerCase();
    return elevatedUsers.filter((u: UserResource) =>
      u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    );
  }, [elevatedUsers, searchQuery]);

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: async (data: CreateFormData) => {
      if (data.password !== data.password_confirmation) {
        throw new Error("Le password non coincidono");
      }
      return usersApi.create(
        { name: data.name, email: data.email, password: data.password, role: data.role },
        selectedGroupId,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["elevated-users"] });
      toast({ title: "Utente creato", description: "L'utente è stato creato con successo." });
      setCreateDialogOpen(false);
      createForm.reset({ name: "", email: "", password: "", password_confirmation: "", role: "super-admin" });
    },
    onError: (error) => {
      toast({ title: "Errore", description: error instanceof Error ? error.message : "Errore durante la creazione", variant: "destructive" });
    },
  });

  // Update user mutation
  const updateUserMutation = useMutation({
    mutationFn: async (data: EditFormData) => {
      if (!selectedUser) throw new Error("Nessun utente selezionato");
      if (!isSuperAdmin && !selectedGroupId) throw new Error("Seleziona un gruppo specifico per modificare un utente");
      const payload: UpdateUserRequest = {
        name: data.name,
        email: data.email,
        role: data.role,
      };
      const groupId = selectedGroupId ?? selectedUser.groups?.[0]?.id ?? null;
      return usersApi.update(selectedUser.id, payload, groupId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["elevated-users"] });
      toast({ title: "Utente aggiornato", description: "I dati dell'utente sono stati aggiornati con successo." });
      setEditDialogOpen(false);
      setSelectedUser(null);
    },
    onError: (error) => {
      toast({ title: "Errore", description: error instanceof Error ? error.message : "Errore durante l'aggiornamento", variant: "destructive" });
    },
  });

  // Change password mutation
  const changePasswordMutation = useMutation({
    mutationFn: async (data: PasswordFormData) => {
      if (!passwordUser) throw new Error("Nessun utente selezionato");
      if (!isSuperAdmin && !selectedGroupId) throw new Error("Seleziona un gruppo specifico per modificare la password");
      if (data.password !== data.password_confirmation) {
        throw new Error("Le password non coincidono");
      }
      const groupId = selectedGroupId ?? passwordUser.groups?.[0]?.id ?? null;
      return usersApi.update(passwordUser.id, { password: data.password }, groupId);
    },
    onSuccess: () => {
      toast({ title: "Password modificata", description: "La password dell'utente è stata aggiornata con successo." });
      setPasswordDialogOpen(false);
      setPasswordUser(null);
      passwordForm.reset({ password: "", password_confirmation: "" });
    },
    onError: (error) => {
      toast({ title: "Errore", description: error instanceof Error ? error.message : "Errore durante il cambio password", variant: "destructive" });
    },
  });

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: async () => {
      if (!userToDelete) throw new Error("Nessun utente selezionato");
      if (!isSuperAdmin && !selectedGroupId) throw new Error("Seleziona un gruppo specifico per eliminare un utente");
      const groupId = selectedGroupId ?? userToDelete.groups?.[0]?.id ?? null;
      return usersApi.delete(userToDelete.id, groupId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["elevated-users"] });
      toast({ title: "Utente eliminato", description: "L'utente è stato eliminato con successo." });
      setDeleteDialogOpen(false);
      setUserToDelete(null);
    },
    onError: (error) => {
      toast({ title: "Errore", description: error instanceof Error ? error.message : "Errore durante l'eliminazione", variant: "destructive" });
    },
  });

  const openEditDialog = (user: UserResource) => {
    setSelectedUser(user);
    const role = getPrimaryRole(user, selectedGroupId) ?? "viewer";
    editForm.reset({ name: user.name, email: user.email, role });
    setEditDialogOpen(true);
  };

  const openPasswordDialog = (user: UserResource) => {
    setPasswordUser(user);
    passwordForm.reset({ password: "", password_confirmation: "" });
    setPasswordDialogOpen(true);
  };

  const openDeleteDialog = (user: UserResource) => {
    setUserToDelete(user);
    setDeleteDialogOpen(true);
  };

  const onSubmitEdit = (data: EditFormData) => {
    updateUserMutation.mutate(data);
  };

  const onSubmitCreate = (data: CreateFormData) => {
    createUserMutation.mutate(data);
  };

  const onSubmitPassword = (data: PasswordFormData) => {
    if (data.password.length < 8) {
      toast({ title: "Errore", description: "La password deve essere di almeno 8 caratteri", variant: "destructive" });
      return;
    }
    changePasswordMutation.mutate(data);
  };

  if (!isSuperAdmin) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Reindirizzamento...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight">Utenti Elevated</h1>
            <p className="text-muted-foreground">
              Gestione utenti con ruoli Super Admin, Admin e Sales
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-destructive" />
              <span className="text-sm text-muted-foreground">Solo Super Admin</span>
            </div>
            <Button
              onClick={() => {
                createForm.reset({ name: "", email: "", password: "", password_confirmation: "", role: "super-admin" });
                setCreateDialogOpen(true);
              }}
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Nuovo utente superadmin
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-4 items-center">
          <div className="w-64">
            <Select value={selectedGroupId ?? "all"} onValueChange={(v) => setSelectedGroupId(v === "all" ? null : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Tutti i gruppi" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i gruppi</SelectItem>
                {groups.map((g: Group) => (
                  <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="relative flex-1 max-w-sm">
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
        </div>

        {/* Users Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" /> Utenti con Ruoli Elevati
            </CardTitle>
            <CardDescription>
              {elevatedUsers.length} utenti trovati
            </CardDescription>
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
                  {searchQuery ? "Nessun risultato" : "Nessun utente trovato"}
                </h3>
                <p className="text-muted-foreground text-center">
                  {searchQuery
                    ? "Nessun utente corrisponde ai criteri di ricerca"
                    : "Non ci sono utenti con ruoli elevati nel gruppo selezionato"}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Ruolo</TableHead>
                    <TableHead>Gruppo</TableHead>
                    <TableHead className="text-right">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {searchedUsers.map((user: UserResource) => {
                    const role = getPrimaryRole(user, selectedGroupId);
                    return (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.name}</TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>
                          <Badge variant={getRoleVariant(role)}>
                            {role === "super-admin" || role === "superadmin" || role === "super_admin" || role === "master" || role === "admin" ? (
                              <Shield className="w-3 h-3 mr-1" />
                            ) : (
                              <User className="w-3 h-3 mr-1" />
                            )}
                            {getRoleLabel(role)}
                          </Badge>
                        </TableCell>
                        <TableCell>{getUserGroups(user)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => openEditDialog(user)} title="Modifica utente">
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => openPasswordDialog(user)} title="Cambia password">
                              <KeyRound className="w-4 h-4" />
                            </Button>
                            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => openDeleteDialog(user)} title="Elimina utente">
                              <Trash2 className="w-4 h-4" />
                            </Button>
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

      {/* Create User Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={(open) => { setCreateDialogOpen(open); if (!open) createForm.reset({ name: "", email: "", password: "", password_confirmation: "", role: "super-admin" }); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nuovo utente superadmin</DialogTitle>
            <DialogDescription>Crea un nuovo utente con ruolo elevato. L'utente riceverà le credenziali per accedere.</DialogDescription>
          </DialogHeader>
          <Form {...createForm}>
            <form onSubmit={createForm.handleSubmit(onSubmitCreate)} className="space-y-4">
              <FormField
                control={createForm.control}
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
                control={createForm.control}
                name="email"
                rules={{
                  required: "Email è richiesta",
                  pattern: { value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i, message: "Email non valida" },
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
              <FormField
                control={createForm.control}
                name="password"
                rules={{ required: "Password è richiesta", minLength: { value: 8, message: "La password deve essere di almeno 8 caratteri" } }}
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
              <FormField
                control={createForm.control}
                name="password_confirmation"
                rules={{
                  required: "Conferma password è richiesta",
                  validate: (value: string) => value === createForm.watch("password") || "Le password non coincidono",
                }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Conferma Password</FormLabel>
                    <FormControl>
                      <Input {...field} type="password" placeholder="••••••••" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={createForm.control}
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
              <DialogFooter>
                <Button type="submit" disabled={createUserMutation.isPending}>
                  {createUserMutation.isPending ? "Creando..." : "Crea utente"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => { setEditDialogOpen(open); if (!open) setSelectedUser(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Modifica Utente</DialogTitle>
            <DialogDescription>Modifica i dati dell'utente</DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onSubmitEdit)} className="space-y-4">
              <FormField
                control={editForm.control}
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
                control={editForm.control}
                name="email"
                rules={{
                  required: "Email è richiesta",
                  pattern: { value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i, message: "Email non valida" },
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
              <FormField
                control={editForm.control}
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
              <DialogFooter>
                <Button type="submit" disabled={updateUserMutation.isPending}>
                  {updateUserMutation.isPending ? "Salvando..." : "Aggiorna"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Change Password Dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={(open) => { setPasswordDialogOpen(open); if (!open) { setPasswordUser(null); passwordForm.reset({ password: "", password_confirmation: "" }); }}}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cambia Password</DialogTitle>
            <DialogDescription>
              {passwordUser ? `Nuova password per ${passwordUser.name}` : "Inserisci la nuova password"}
            </DialogDescription>
          </DialogHeader>
          <Form {...passwordForm}>
            <form onSubmit={passwordForm.handleSubmit(onSubmitPassword)} className="space-y-4">
              <FormField
                control={passwordForm.control}
                name="password"
                rules={{ required: "Password è richiesta", minLength: { value: 8, message: "La password deve essere di almeno 8 caratteri" } }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nuova Password</FormLabel>
                    <FormControl>
                      <Input {...field} type="password" placeholder="••••••••" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={passwordForm.control}
                name="password_confirmation"
                rules={{
                  required: "Conferma password è richiesta",
                  validate: (value: string) => value === passwordForm.watch("password") || "Le password non coincidono",
                }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Conferma Password</FormLabel>
                    <FormControl>
                      <Input {...field} type="password" placeholder="••••••••" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="submit" disabled={changePasswordMutation.isPending}>
                  {changePasswordMutation.isPending ? "Salvando..." : "Cambia Password"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={(open) => { setDeleteDialogOpen(open); if (!open) setUserToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina Utente</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare l'utente <strong>{userToDelete?.name}</strong> ({userToDelete?.email})? Questa azione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setUserToDelete(null)}>Annulla</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteUserMutation.mutate()}>
              {deleteUserMutation.isPending ? "Eliminando..." : "Elimina"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default AdminElevatedUsers;
