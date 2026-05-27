import { useState, useEffect, useCallback, useRef } from 'react';
import { consistenzeApi } from '@/lib/api/consistenze';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import { toast } from 'sonner';
import type { ConsistenzeCliente, ConsistenzeItem, ConsistenzeArea } from '@/types/consistenze';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/** Map API ConsistenzeSummary (tenant_id) → local ConsistenzeCliente (organization_id) */
function toCliente(apiSummary: NonNullable<Awaited<ReturnType<typeof consistenzeApi.summary>>>, orgId: string): ConsistenzeCliente {
  return {
    id: apiSummary.id,
    organization_id: orgId,
    nr_sedi: apiSummary.nr_sedi ?? 0,
    nr_interni_telefonici: apiSummary.nr_interni_telefonici ?? 0,
    descrizione_telefoni: apiSummary.descrizione_telefoni ?? '',
    nr_canali_fonia: apiSummary.nr_canali_fonia ?? 0,
    note_generali: apiSummary.note_generali ?? '',
  };
}

/** Map API ConsistenzeItem (tenant_id) → local ConsistenzeItem (organization_id) */
function toLocalItem(apiItem: Awaited<ReturnType<typeof consistenzeApi.items>>[number], orgId: string): ConsistenzeItem {
  return {
    id: apiItem.id,
    organization_id: orgId,
    area: apiItem.area as ConsistenzeArea,
    categoria: apiItem.categoria ?? '',
    tecnologia: apiItem.tecnologia ?? '',
    fornitore: apiItem.fornitore ?? '',
    quantita: apiItem.quantita ?? 0,
    scadenza: apiItem.scadenza ?? null,
    metriche_json: apiItem.metriche_json ?? {},
  };
}

/** Map local ConsistenzeCliente → API summary payload (omit id/org) */
function toSummaryPayload(data: Partial<ConsistenzeCliente>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (data.nr_sedi !== undefined) payload.nr_sedi = data.nr_sedi;
  if (data.nr_interni_telefonici !== undefined) payload.nr_interni_telefonici = data.nr_interni_telefonici;
  if (data.descrizione_telefoni !== undefined) payload.descrizione_telefoni = data.descrizione_telefoni;
  if (data.nr_canali_fonia !== undefined) payload.nr_canali_fonia = data.nr_canali_fonia;
  if (data.note_generali !== undefined) payload.note_generali = data.note_generali;
  return payload;
}

/** Map local ConsistenzeItem → API item payload */
function toItemPayload(item: Partial<ConsistenzeItem>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (item.area !== undefined) payload.area = item.area;
  if (item.categoria !== undefined) payload.categoria = item.categoria;
  if (item.tecnologia !== undefined) payload.tecnologia = item.tecnologia;
  if (item.fornitore !== undefined) payload.fornitore = item.fornitore;
  if (item.quantita !== undefined) payload.quantita = item.quantita;
  if (item.scadenza !== undefined) payload.scadenza = item.scadenza;
  if (item.metriche_json !== undefined) payload.metriche_json = item.metriche_json;
  return payload;
}

export function useConsistenze() {
  const { organizationId } = useClientOrganization();
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
      const [summary, apiItems] = await Promise.all([
        consistenzeApi.summary(organizationId).catch(() => null),
        consistenzeApi.items(organizationId),
      ]);

      setCliente(summary ? toCliente(summary, organizationId) : {
        organization_id: organizationId,
        nr_sedi: 0,
        nr_interni_telefonici: 0,
        descrizione_telefoni: '',
        nr_canali_fonia: 0,
        note_generali: '',
      });
      setItems((apiItems ?? []).map(item => toLocalItem(item, organizationId)));
    } catch (err: unknown) {
      console.error('Error loading consistenze:', err);
      toast.error('Errore caricamento consistenze');
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Save cliente with debounce (PUT only — backend creates on first save)
  const saveCliente = useCallback(async (data: Partial<ConsistenzeCliente>) => {
    if (!organizationId) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    setSaveStatus('saving');
    debounceRef.current = setTimeout(async () => {
      try {
        const payload = toSummaryPayload(data);

        if (cliente?.id) {
          // Update existing
          const updated = await consistenzeApi.updateSummary(organizationId, payload);
          setCliente(toCliente(updated, organizationId));
        } else {
          // Create via PUT (upsert)
          const created = await consistenzeApi.updateSummary(organizationId, payload);
          setCliente(toCliente(created, organizationId));
        }
        setSaveStatus('saved');
      } catch (err: unknown) {
        console.error('Error saving cliente:', err);
        setSaveStatus('error');
        toast.error('Errore salvataggio');
      }
    }, 1500);
  }, [organizationId, cliente?.id]);

  const updateCliente = useCallback((field: string, value: unknown) => {
    setCliente(prev => {
      const updated = { ...prev!, [field]: value };
      saveCliente(updated);
      return updated;
    });
  }, [saveCliente]);

  // Item CRUD
  const addItem = useCallback(async (area: ConsistenzeArea) => {
    if (!organizationId) return;
    try {
      const created = await consistenzeApi.createItem(organizationId, {
        area,
        categoria: '',
        tecnologia: '',
        fornitore: '',
        quantita: 0,
        metriche_json: {},
      });
      setItems(prev => [...prev, toLocalItem(created, organizationId)]);
    } catch (err: unknown) {
      console.error('Error adding item:', err);
      toast.error('Errore aggiunta riga');
    }
  }, [organizationId]);

  const updateItem = useCallback(async (id: string, updates: Partial<ConsistenzeItem>) => {
    if (!organizationId) return;
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));

    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSaveStatus('saving');
    debounceRef.current = setTimeout(async () => {
      try {
        const payload = toItemPayload(updates);
        await consistenzeApi.updateItem(organizationId, id, payload);
        setSaveStatus('saved');
      } catch (err: unknown) {
        console.error('Error updating item:', err);
        setSaveStatus('error');
        toast.error('Errore aggiornamento');
      }
    }, 1500);
  }, [organizationId]);

  const deleteItem = useCallback(async (id: string) => {
    if (!organizationId) return;
    try {
      await consistenzeApi.deleteItem(organizationId, id);
      setItems(prev => prev.filter(i => i.id !== id));
    } catch (err: unknown) {
      console.error('Error deleting item:', err);
      toast.error('Errore eliminazione');
    }
  }, [organizationId]);

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
