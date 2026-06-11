import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Loader2, UserPlus, Trash2, Search, Users as UsersIcon } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { irpApi } from '@/lib/api';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import { toast } from 'sonner';
import { getErrorDetail } from "@/lib/api-client";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  organizationName: string;
  groupId?: string | null;
}

interface ContactRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  /** Linked platform user (null until invite) */
  user_id: string | null;
  is_platform_user: boolean;
  account_disabled: boolean;
}

const ClientContactsDialog: React.FC<Props> = ({ open, onOpenChange, organizationId, organizationName, groupId: propGroupId }) => {
  const { groupId: hookGroupId } = useClientOrganization();
  const groupId = propGroupId ?? hookGroupId;
  const qc = useQueryClient();
  const [search, setSearch] = useState('');

  // New contact form
  const [newContact, setNewContact] = useState({ first_name: '', last_name: '', email: '', phone: '', job_title: '' });

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ['org-contacts', organizationId, groupId],
    enabled: open && !!organizationId,
    queryFn: async () => {
      // Backend returns ContactDirectory rows with full platform fields
      // (user_id, is_platform_user, account_disabled). Map them verbatim.
      const apiContacts = await irpApi.contacts(organizationId, groupId);
      return (apiContacts ?? []).map(c => ({
        id: c.id,
        first_name: c.first_name,
        last_name: c.last_name,
        email: c.email ?? null,
        phone: c.phone ?? null,
        job_title: c.job_title ?? null,
        user_id: c.user_id ?? null,
        is_platform_user: !!c.is_platform_user,
        account_disabled: !!c.account_disabled,
      } as ContactRow));
    },
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) =>
      `${c.first_name} ${c.last_name} ${c.email ?? ''} ${c.job_title ?? ''}`.toLowerCase().includes(q),
    );
  }, [contacts, search]);

  const createMut = useMutation({
    mutationFn: async () => {
      const created = await irpApi.createContact(organizationId, {
        first_name: newContact.first_name,
        last_name: newContact.last_name,
        email: newContact.email || '',
        phone: newContact.phone || '',
        job_title: newContact.job_title || undefined,
        role: newContact.job_title || '',
        category: 'general',
      }, groupId);
      return created;
    },
    onSuccess: () => {
      toast.success('Contatto aggiunto');
      setNewContact({ first_name: '', last_name: '', email: '', phone: '', job_title: '' });
      qc.invalidateQueries({ queryKey: ['org-contacts', organizationId, groupId] });
    },
    onError: (e: any) => toast.error(getErrorDetail(e)),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      await irpApi.deleteContact(organizationId, id, groupId);
    },
    onSuccess: () => {
      toast.success('Contatto rimosso');
      qc.invalidateQueries({ queryKey: ['org-contacts', organizationId, groupId] });
    },
    onError: (e: any) => toast.error(getErrorDetail(e)),
  });

  /**
   * Toggle the platform-user switch:
   * - If turning ON and the contact has no linked user yet → call the dedicated
   *   /invite endpoint (creates User, attaches to group, sends reset-password email).
   * - If turning OFF → updateContact with is_platform_user=false so the linked
   *   user is detached from the contact (account itself is not deleted).
   */
  const inviteMut = useMutation({
    mutationFn: async (contactId: string) => {
      return await irpApi.inviteContact(organizationId, contactId, groupId);
    },
    onSuccess: () => {
      toast.success('Invito inviato: l’utente riceverà un’email per impostare la password.');
      qc.invalidateQueries({ queryKey: ['org-contacts', organizationId, groupId] });
    },
    onError: (e: any) => toast.error(`Invito fallito: ${getErrorDetail(e)}`),
  });

  const updateMut = useMutation({
    mutationFn: async (patch: Partial<ContactRow> & { id: string; mode?: 'full' | 'platform' | 'account' }) => {
      const { id, mode, ...rest } = patch;
      // Build payload based on the caller intent
      if (mode === 'platform' || mode === 'account') {
        await irpApi.updateContact(organizationId, id, {
          is_platform_user: rest.is_platform_user,
          account_disabled: rest.account_disabled,
        }, groupId);
        return;
      }
      await irpApi.updateContact(organizationId, id, {
        first_name: rest.first_name,
        last_name: rest.last_name,
        email: rest.email || undefined,
        phone: rest.phone || undefined,
        job_title: rest.job_title || undefined,
      }, groupId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-contacts', organizationId, groupId] }),
    onError: (e: any) => toast.error(`Aggiornamento fallito: ${getErrorDetail(e)}`),
  });

  const handlePlatformToggle = (row: ContactRow, next: boolean) => {
    if (next && !row.user_id) {
      // First-time activation: trigger backend invite flow
      if (!row.email) {
        toast.error('Per attivare l’account piattaforma serve un’email sul contatto.');
        return;
      }
      inviteMut.mutate(row.id);
      return;
    }
    updateMut.mutate({ id: row.id, mode: 'platform', is_platform_user: next });
  };

  const handleAccountDisabledToggle = (row: ContactRow, disabled: boolean) => {
    updateMut.mutate({ id: row.id, mode: 'account', is_platform_user: row.is_platform_user, account_disabled: disabled });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UsersIcon className="w-5 h-5" /> Rubrica — {organizationName}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-3">
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
                              disabled={inviteMut.isPending}
                              onCheckedChange={(v) => handlePlatformToggle(c, v)}
                            />
                            {c.is_platform_user && !c.user_id && (
                              <Badge variant="outline" className="text-xs">non collegato</Badge>
                            )}
                            {inviteMut.isPending && (
                              <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                            )}
                          </div>
                        </td>
                        <td className="p-2">
                          {c.is_platform_user && c.user_id ? (
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={!c.account_disabled}
                                disabled={updateMut.isPending}
                                onCheckedChange={(active) => handleAccountDisabledToggle(c, !active)}
                              />
                              <Badge variant={c.account_disabled ? 'destructive' : 'default'}>
                                {c.account_disabled ? 'Disattivato' : 'Attivo'}
                              </Badge>
                            </div>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </td>
                        <td className="p-2 text-right">
                          <div className="flex justify-end gap-1">
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
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ClientContactsDialog;
