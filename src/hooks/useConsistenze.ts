import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import { useAuth } from '@/components/auth/AuthProvider';
import { toast } from 'sonner';
import type { ConsistenzeCliente, ConsistenzeItem, ConsistenzeArea } from '@/types/consistenze';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function useConsistenze() {
  const { organizationId } = useClientOrganization();
  const { user } = useAuth();
  const [cliente, setCliente] = useState<ConsistenzeCliente | null>(null);
  const [items, setItems] = useState<ConsistenzeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const debounceRef = useRef<NodeJS.Timeout>();

  // Load data
  const loadData = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const [clienteRes, itemsRes] = await Promise.all([
        supabase
          .from('consistenze_clienti' as any)
          .select('*')
          .eq('organization_id', organizationId)
          .maybeSingle(),
        supabase
          .from('consistenze_items' as any)
          .select('*')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: true }),
      ]);

      if (clienteRes.error) throw clienteRes.error;
      if (itemsRes.error) throw itemsRes.error;

      setCliente(clienteRes.data as any || {
        organization_id: organizationId,
        nr_sedi: 0,
        nr_interni_telefonici: 0,
        descrizione_telefoni: '',
        nr_canali_fonia: 0,
        note_generali: '',
      });
      setItems((itemsRes.data as any[]) || []);
    } catch (err: any) {
      console.error('Error loading consistenze:', err);
      toast.error('Errore caricamento consistenze');
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Save cliente with debounce
  const saveCliente = useCallback(async (data: Partial<ConsistenzeCliente>) => {
    if (!organizationId || !user) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    setSaveStatus('saving');
    debounceRef.current = setTimeout(async () => {
      try {
        const payload = {
          ...data,
          organization_id: organizationId,
          updated_by: user.id,
        };

        if (cliente?.id) {
          const { error } = await supabase
            .from('consistenze_clienti' as any)
            .update(payload as any)
            .eq('id', cliente.id);
          if (error) throw error;
        } else {
          const insertPayload = { ...payload, created_by: user.id };
          const { data: newData, error } = await supabase
            .from('consistenze_clienti' as any)
            .insert(insertPayload as any)
            .select()
            .single();
          if (error) throw error;
          setCliente(newData as any);
        }
        setSaveStatus('saved');
      } catch (err: any) {
        console.error('Error saving cliente:', err);
        setSaveStatus('error');
        toast.error('Errore salvataggio');
      }
    }, 1500);
  }, [organizationId, user, cliente?.id]);

  const updateCliente = useCallback((field: string, value: any) => {
    setCliente(prev => {
      const updated = { ...prev!, [field]: value };
      saveCliente(updated);
      return updated;
    });
  }, [saveCliente]);

  // Item CRUD
  const addItem = useCallback(async (area: ConsistenzeArea) => {
    if (!organizationId || !user) return;
    try {
      const { data, error } = await supabase
        .from('consistenze_items' as any)
        .insert({
          organization_id: organizationId,
          area,
          categoria: '',
          tecnologia: '',
          fornitore: '',
          quantita: 0,
          metriche_json: {},
          created_by: user.id,
          updated_by: user.id,
        } as any)
        .select()
        .single();
      if (error) throw error;
      setItems(prev => [...prev, data as any]);
    } catch (err: any) {
      console.error('Error adding item:', err);
      toast.error('Errore aggiunta riga');
    }
  }, [organizationId, user]);

  const updateItem = useCallback(async (id: string, updates: Partial<ConsistenzeItem>) => {
    if (!user) return;
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));
    
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSaveStatus('saving');
    debounceRef.current = setTimeout(async () => {
      try {
        const { error } = await supabase
          .from('consistenze_items' as any)
          .update({ ...updates, updated_by: user.id } as any)
          .eq('id', id);
        if (error) throw error;
        setSaveStatus('saved');
      } catch (err: any) {
        console.error('Error updating item:', err);
        setSaveStatus('error');
        toast.error('Errore aggiornamento');
      }
    }, 1500);
  }, [user]);

  const deleteItem = useCallback(async (id: string) => {
    try {
      const { error } = await supabase
        .from('consistenze_items' as any)
        .delete()
        .eq('id', id);
      if (error) throw error;
      setItems(prev => prev.filter(i => i.id !== id));
    } catch (err: any) {
      console.error('Error deleting item:', err);
      toast.error('Errore eliminazione');
    }
  }, []);

  const getItemsByArea = useCallback((area: ConsistenzeArea) => {
    return items.filter(i => i.area === area);
  }, [items]);

  return {
    cliente,
    items,
    loading,
    saveStatus,
    updateCliente,
    addItem,
    updateItem,
    deleteItem,
    getItemsByArea,
    reload: loadData,
  };
}
