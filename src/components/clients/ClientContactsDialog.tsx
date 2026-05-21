import React, { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, UserPlus, Trash2, Shield, Search, Users as UsersIcon } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { PERMISSION_CATALOG, buildDefaultPermissions, ALL_ACTIONS, PermissionMap, PermAction } from '@/lib/permissions/catalog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  organizationName: string;
}

interface ContactRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  auth_user_id: string | null;
  is_platform_user: boolean;
  account_disabled: boolean;
  module_permissions: any;
}

const ClientContactsDialog: React.FC<Props> = ({ open, onOpenChange, organizationId, organizationName }) => {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'list' | 'permissions'>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // New contact form
  const [newContact, setNewContact] = useState({ first_name: '', last_name: '', email: '', phone: '', job_title: '' });

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ['org-contacts', organizationId],
    enabled: open && !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contact_directory')
        .select('*')
        .eq('organization_id', organizationId)
        .order('last_name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ContactRow[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) =>
      `${c.first_name} ${c.last_name} ${c.email ?? ''} ${c.job_title ?? ''}`.toLowerCase().includes(q),
    );
  }, [contacts, search]);

  const selected = contacts.find((c) => c.id === selectedId) ?? null;

  const createMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('contact_directory').insert({
        organization_id: organizationId,
        first_name: newContact.first_name,
        last_name: newContact.last_name,
        email: newContact.email || null,
        phone: newContact.phone || null,
        job_title: newContact.job_title || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Contatto aggiunto');
      setNewContact({ first_name: '', last_name: '', email: '', phone: '', job_title: '' });
      qc.invalidateQueries({ queryKey: ['org-contacts', organizationId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('contact_directory').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Contatto rimosso');
      if (selectedId) setSelectedId(null);
      qc.invalidateQueries({ queryKey: ['org-contacts', organizationId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: async (patch: Partial<ContactRow> & { id: string }) => {
      const { id, ...rest } = patch;
      const { error } = await supabase.from('contact_directory').update(rest as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-contacts', organizationId] }),
    onError: (e: any) => toast.error(`Aggiornamento fallito: ${e.message}`),
  });

  // local permissions buffer
  const [permBuf, setPermBuf] = useState<PermissionMap>({});
  useEffect(() => {
    if (selected) {
      const base = buildDefaultPermissions();
      const stored = (selected.module_permissions ?? {}) as PermissionMap;
      // merge stored over base
      const merged: PermissionMap = { ...base };
      for (const mk of Object.keys(stored)) {
        merged[mk] = { ...(base[mk] ?? {}), ...(stored[mk] ?? {}) } as any;
      }
      setPermBuf(merged);
    }
  }, [selectedId]); // eslint-disable-line

  const togglePerm = (mk: string, sk: string, action: PermAction, value: boolean) => {
    setPermBuf((prev) => {
      const next = { ...prev, [mk]: { ...(prev[mk] ?? {}) } };
      next[mk][sk] = { ...(next[mk][sk] ?? {}), [action]: value };
      return next;
    });
  };

  const setAllModule = (mk: string, value: boolean) => {
    setPermBuf((prev) => {
      const next = { ...prev };
      const mod = PERMISSION_CATALOG.find((m) => m.key === mk)!;
      next[mk] = {};
      for (const sub of mod.subsections) {
        const acts = sub.actions ?? ALL_ACTIONS;
        next[mk][sub.key] = Object.fromEntries(acts.map((a) => [a, value]));
      }
      return next;
    });
  };

  const savePerms = () => {
    if (!selected) return;
    updateMut.mutate({ id: selected.id, module_permissions: permBuf as any });
    toast.success('Permessi aggiornati');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UsersIcon className="w-5 h-5" /> Rubrica & Permessi — {organizationName}
          </DialogTitle>
          <DialogDescription>
            Gestisci la rubrica centralizzata. Per i contatti collegati a un account, abilita/disabilita visualizzazione,
            modifica ed export PDF per ogni modulo.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="flex-1 overflow-hidden flex flex-col">
          <TabsList>
            <TabsTrigger value="list">Rubrica</TabsTrigger>
            <TabsTrigger value="permissions" disabled={!selected}>Permessi {selected ? `(${selected.first_name} ${selected.last_name})` : ''}</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="flex-1 overflow-hidden flex flex-col gap-3">
            {/* Add new */}
            <div className="grid grid-cols-1 md:grid-cols-6 gap-2 p-3 border rounded-lg bg-muted/30">
              <Input placeholder="Nome*" value={newContact.first_name} onChange={(e) => setNewContact({ ...newContact, first_name: e.target.value })} />
              <Input placeholder="Cognome*" value={newContact.last_name} onChange={(e) => setNewContact({ ...newContact, last_name: e.target.value })} />
              <Input placeholder="Email" value={newContact.email} onChange={(e) => setNewContact({ ...newContact, email: e.target.value })} />
              <Input placeholder="Telefono" value={newContact.phone} onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })} />
              <Input placeholder="Ruolo" value={newContact.job_title} onChange={(e) => setNewContact({ ...newContact, job_title: e.target.value })} />
              <Button onClick={() => createMut.mutate()} disabled={!newContact.first_name || !newContact.last_name || createMut.isPending}>
                {createMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><UserPlus className="w-4 h-4 mr-1" />Aggiungi</>}
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-muted-foreground" />
              <Input placeholder="Cerca..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
            </div>

            <ScrollArea className="flex-1 border rounded-lg">
              {isLoading ? (
                <div className="p-6 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
              ) : filtered.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground">Nessun contatto</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 sticky top-0">
                    <tr>
                      <th className="text-left p-2">Nome</th>
                      <th className="text-left p-2">Ruolo</th>
                      <th className="text-left p-2">Email</th>
                      <th className="text-left p-2">Account piattaforma</th>
                      <th className="text-left p-2">Stato</th>
                      <th className="p-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((c) => (
                      <tr key={c.id} className="border-t hover:bg-muted/20">
                        <td className="p-2 font-medium">{c.first_name} {c.last_name}</td>
                        <td className="p-2 text-muted-foreground">{c.job_title ?? '—'}</td>
                        <td className="p-2 text-muted-foreground">{c.email ?? '—'}</td>
                        <td className="p-2">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={c.is_platform_user}
                              onCheckedChange={(v) => updateMut.mutate({ id: c.id, is_platform_user: v })}
                            />
                            {c.is_platform_user && !c.auth_user_id && (
                              <Badge variant="outline" className="text-xs">non collegato</Badge>
                            )}
                          </div>
                        </td>
                        <td className="p-2">
                          {c.is_platform_user ? (
                            <Badge variant={c.account_disabled ? 'destructive' : 'default'}>
                              {c.account_disabled ? 'Disattivato' : 'Attivo'}
                            </Badge>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </td>
                        <td className="p-2 text-right">
                          <div className="flex justify-end gap-1">
                            {c.is_platform_user && (
                              <Button size="sm" variant="outline" onClick={() => { setSelectedId(c.id); setTab('permissions'); }}>
                                <Shield className="w-3.5 h-3.5 mr-1" />Permessi
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => deleteMut.mutate(c.id)}>
                              <Trash2 className="w-3.5 h-3.5 text-destructive" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="permissions" className="flex-1 overflow-hidden flex flex-col gap-3">
            {selected && (
              <>
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <div className="font-medium">{selected.first_name} {selected.last_name}</div>
                    <div className="text-xs text-muted-foreground">{selected.email ?? 'no email'} {selected.auth_user_id ? '· account collegato' : '· non collegato'}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Label className="text-sm flex items-center gap-2">
                      Account disattivato
                      <Switch
                        checked={selected.account_disabled}
                        onCheckedChange={(v) => updateMut.mutate({ id: selected.id, account_disabled: v })}
                      />
                    </Label>
                  </div>
                </div>

                <ScrollArea className="flex-1 border rounded-lg p-3">
                  <div className="space-y-4">
                    {PERMISSION_CATALOG.map((mod) => (
                      <div key={mod.key} className="border rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-semibold">{mod.label}</h4>
                          <div className="flex gap-2">
                            <Button size="sm" variant="ghost" onClick={() => setAllModule(mod.key, true)}>Tutto</Button>
                            <Button size="sm" variant="ghost" onClick={() => setAllModule(mod.key, false)}>Niente</Button>
                          </div>
                        </div>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-xs text-muted-foreground">
                              <th className="text-left">Sezione</th>
                              <th className="w-20 text-center">Vedi</th>
                              <th className="w-20 text-center">Modifica</th>
                              <th className="w-20 text-center">Export PDF</th>
                            </tr>
                          </thead>
                          <tbody>
                            {mod.subsections.map((sub) => {
                              const acts = sub.actions ?? ALL_ACTIONS;
                              const cur = permBuf[mod.key]?.[sub.key] ?? {};
                              return (
                                <tr key={sub.key} className="border-t">
                                  <td className="py-1.5">{sub.label}</td>
                                  {(['view', 'edit', 'export'] as PermAction[]).map((a) => (
                                    <td key={a} className="text-center">
                                      {acts.includes(a) ? (
                                        <Checkbox
                                          checked={cur[a] !== false}
                                          onCheckedChange={(v) => togglePerm(mod.key, sub.key, a, !!v)}
                                        />
                                      ) : <span className="text-muted-foreground">—</span>}
                                    </td>
                                  ))}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                </ScrollArea>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setTab('list')}>Indietro</Button>
                  <Button onClick={savePerms} disabled={updateMut.isPending}>
                    {updateMut.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                    Salva permessi
                  </Button>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default ClientContactsDialog;
