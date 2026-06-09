import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { groupsApi, tenantsApi } from '@/lib/api';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Plus, Pencil, Trash2, Building2, Loader2,
  ChevronRight, FolderKanban, X,
} from 'lucide-react';
import { toast } from 'sonner';
import ClientCrudDialog from '@/components/clients/ClientCrudDialog';
import DeleteClientDialog from '@/components/clients/DeleteClientDialog';
import type { TenantResource, Group } from '@/types/api';
import { getErrorDetail } from "@/lib/api-client";

const STATUS_LABELS: Record<number, string> = { 0: 'Inattivo', 1: 'Attivo', 2: 'Sospeso' };
const STATUS_COLORS: Record<number, string> = { 0: 'secondary', 1: 'default', 2: 'outline' } as const;

const AdminCompanies: React.FC = () => {
  const { user } = useAuth();

  /* ─── Gruppi ─── */
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);

  /* ─── Nuovo gruppo dialog ─── */
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);

  /* ─── Companies ─── */
  const [tenants, setTenants] = useState<TenantResource[]>([]);
  const [loading, setLoading] = useState(false);
  const [crudOpen, setCrudOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<{ id: string; name: string; code: string } | null>(null);
  const [deletingOrg, setDeletingOrg] = useState<{ id: string; name: string } | null>(null);

  /* ─── Load groups ─── */
  const loadGroups = useCallback(async () => {
    try {
      const list = await groupsApi.list();
      setGroups(list);
    } catch (err: any) {
      toast.error(getErrorDetail(err));
    } finally {
      setGroupsLoading(false);
    }
  }, []);

  useEffect(() => { loadGroups(); }, [loadGroups]);

  /* ─── Load companies for selected group ─── */
  const loadTenants = useCallback(async (groupId: string) => {
    setLoading(true);
    try {
      const all = await tenantsApi.listAll(groupId);
      setTenants(all);
    } catch (err: any) {
      toast.error(getErrorDetail(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedGroup) {
      loadTenants(selectedGroup.id);
    }
  }, [selectedGroup, loadTenants]);

  /* ─── Group CRUD ─── */
  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    setCreatingGroup(true);
    try {
      const created = await groupsApi.create(newGroupName.trim(), newGroupDesc.trim() || undefined);
      setGroups(prev => [...prev, { ...created, is_active: true }]);
      toast.success(`Gruppo "${newGroupName}" creato`);
      setNewGroupName('');
      setNewGroupDesc('');
      setNewGroupOpen(false);
    } catch (err: any) {
      toast.error(getErrorDetail(err));
    } finally {
      setCreatingGroup(false);
    }
  };

  const handleDeleteGroup = async (group: Group) => {
    if (!confirm(`Eliminare il gruppo "${group.name}"? Le aziende al suo interno NON saranno eliminate.`)) return;
    try {
      await groupsApi.delete(group.id);
      setGroups(prev => prev.filter(g => g.id !== group.id));
      if (selectedGroup?.id === group.id) {
        setSelectedGroup(null);
        setTenants([]);
      }
      toast.success(`Gruppo "${group.name}" eliminato`);
    } catch (err: any) {
      toast.error(getErrorDetail(err) || 'Errore nell’eliminazione del gruppo');
    }
  };

  /* ─── Company CRUD ─── */
  const handleSaved = () => {
    if (selectedGroup) loadTenants(selectedGroup.id);
  };

  const handleEdit = (t: TenantResource) => {
    setEditingOrg({ id: t.id, name: t.name, code: t.customer_code ?? '' });
    setCrudOpen(true);
  };

  const handleCreate = () => {
    setEditingOrg(null);
    setCrudOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="flex h-[calc(100vh-5rem)] gap-6">
        {/* ─── SIDEBAR GRUPPI ─── */}
        <div className="w-72 shrink-0 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <FolderKanban className="w-5 h-5" /> Aziende
            </h2>
            <Button size="sm" variant="outline" onClick={() => setNewGroupOpen(true)}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          <Card className="flex-1 overflow-hidden flex flex-col">
            <CardContent className="p-0 flex-1 overflow-y-auto">
              {groupsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : groups.length === 0 ? (
                <div className="text-center py-12 px-4 text-sm text-muted-foreground">
                  Nessuna azienda. Creane una per iniziare.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {groups.map((g) => (
                    <div
                      key={g.id}
                      onClick={() => setSelectedGroup(g)}
                      className={`
                        flex items-center justify-between px-4 py-3 cursor-pointer
                        hover:bg-muted/50 transition-colors
                        ${selectedGroup?.id === g.id ? 'bg-muted border-l-2 border-l-primary' : ''}
                      `}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <ChevronRight className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${selectedGroup?.id === g.id ? 'rotate-90' : ''}`} />
                        <div className="min-w-0">
                          <p className="font-medium truncate">{g.name}</p>
                          {g.slug && <p className="text-xs text-muted-foreground truncate">{g.slug}</p>}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 h-7 w-7"
                        onClick={(e) => { e.stopPropagation(); handleDeleteGroup(g); }}
                        title="Elimina azienda"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ─── PANNELLO COMPANIES ─── */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground">
                {selectedGroup ? selectedGroup.name : 'Gestione Clienti'}
              </h1>
              <p className="text-muted-foreground">
                {selectedGroup
                  ? `Crea, modifica ed elimina i clienti dell'azienda`
                  : "Seleziona un'azienda dalla sidebar per gestire i suoi clienti"}
              </p>
            </div>
            {selectedGroup && (
              <Button onClick={handleCreate} className="gap-2">
                <Plus className="w-4 h-4" /> Nuovo Cliente
              </Button>
            )}
          </div>

          {!selectedGroup ? (
            <Card className="flex-1 flex items-center justify-center">
              <CardContent className="py-16 text-center text-muted-foreground">
                <Building2 className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p>Seleziona un'azienda dalla sidebar per visualizzare i suoi clienti.</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="flex-1 flex flex-col overflow-hidden">
              <CardHeader className="shrink-0">
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="w-5 h-5" /> Clienti ({tenants.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : tenants.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    Nessun cliente in questa azienda. Crea il primo!
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-muted-foreground">
                          <th className="py-3 px-3 font-medium">Nome</th>
                          <th className="py-3 px-3 font-medium">Codice</th>
                          <th className="py-3 px-3 font-medium">P.IVA</th>
                          <th className="py-3 px-3 font-medium">Dominio</th>
                          <th className="py-3 px-3 font-medium">Stato</th>
                          <th className="py-3 px-3 font-medium">Creata</th>
                          <th className="py-3 px-3 text-right font-medium">Azioni</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tenants.map((t) => (
                          <tr key={t.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                            <td className="py-3 px-3 font-medium">{t.name}</td>
                            <td className="py-3 px-3 text-muted-foreground">{t.customer_code || '—'}</td>
                            <td className="py-3 px-3 text-muted-foreground">{t.vat_number || '—'}</td>
                            <td className="py-3 px-3 text-muted-foreground">{t.primary_domain || '—'}</td>
                            <td className="py-3 px-3">
                              <Badge variant={STATUS_COLORS[t.status] as any}>
                                {STATUS_LABELS[t.status] ?? `Stato ${t.status}`}
                              </Badge>
                            </td>
                            <td className="py-3 px-3 text-muted-foreground">
                              {t.created_at ? new Date(t.created_at).toLocaleDateString('it-IT') : '—'}
                            </td>
                            <td className="py-3 px-3">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="icon" onClick={() => handleEdit(t)} title="Modifica">
                                  <Pencil className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setDeletingOrg({ id: t.id, name: t.name })}
                                  title="Elimina"
                                >
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* ─── Nuovo Gruppo Dialog ─── */}
      <Dialog open={newGroupOpen} onOpenChange={setNewGroupOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuovo Gruppo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome gruppo</Label>
              <Input
                value={newGroupName}
                onChange={e => setNewGroupName(e.target.value)}
                placeholder="es. Panapesca S.p.A."
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateGroup(); }}
              />
            </div>
            <div className="space-y-2">
              <Label>Descrizione (opzionale)</Label>
              <Textarea
                value={newGroupDesc}
                onChange={e => setNewGroupDesc(e.target.value)}
                placeholder="Breve descrizione..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewGroupOpen(false)}>Annulla</Button>
            <Button onClick={handleCreateGroup} disabled={creatingGroup || !newGroupName.trim()}>
              {creatingGroup ? 'Creazione...' : 'Crea Gruppo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Company CRUD Dialogs ─── */}
      <ClientCrudDialog
        open={crudOpen}
        onOpenChange={setCrudOpen}
        organization={editingOrg}
        onSaved={handleSaved}
        groupId={selectedGroup?.id ?? null}
      />
      <DeleteClientDialog
        open={!!deletingOrg}
        onOpenChange={(open: boolean) => { if (!open) setDeletingOrg(null); }}
        organization={deletingOrg}
        onDeleted={handleSaved}
      />
    </DashboardLayout>
  );
};

export default AdminCompanies;
