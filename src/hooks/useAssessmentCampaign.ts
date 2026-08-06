import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { assessmentV2Api } from '@/lib/api';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import type {
  AssessmentCampaign,
  AssessmentCampaignsResponse,
  AssessmentReadiness,
} from '@/types/api';

/**
 * Il ciclo di assessment corrente e la sua completezza.
 *
 * La conferma è l'unico innesco dell'elaborazione: da lì il backend costruisce lo
 * snapshot e accoda le scansioni. Prima esistevano due gesti in due punti diversi
 * della pagina, e quasi metà dei clienti si fermava fra il primo e il secondo.
 */
export const useAssessmentCampaign = () => {
  const { organizationId: orgId, groupId } = useClientOrganization();

  const [current, setCurrent] = useState<AssessmentCampaign | null>(null);
  const [campaigns, setCampaigns] = useState<AssessmentCampaign[]>([]);
  const [readiness, setReadiness] = useState<AssessmentReadiness | null>(null);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);

  const apply = useCallback((data: AssessmentCampaignsResponse) => {
    setCampaigns(data.campaigns ?? []);
    setCurrent(data.current ?? null);
    setReadiness(data.readiness ?? null);
  }, []);

  const load = useCallback(async () => {
    if (!orgId || !groupId) return;
    setLoading(true);
    try {
      apply(await assessmentV2Api.campaigns(orgId, groupId));
    } catch (err) {
      // Il pannello degrada a nascosto: non è un errore da mostrare al cliente
      console.error('Errore nel caricamento del ciclo di assessment:', err);
    } finally {
      setLoading(false);
    }
  }, [orgId, groupId, apply]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Apre un nuovo ciclo: le risposte del precedente vengono riportate. */
  const createCampaign = useCallback(async (): Promise<boolean> => {
    if (!orgId || !groupId) return false;
    setWorking(true);
    try {
      await assessmentV2Api.createCampaign(orgId, groupId);
      toast.success('Nuovo assessment aperto: le risposte precedenti sono state riportate e vanno riviste.');
      await load();
      return true;
    } catch (error: unknown) {
      const status = (error as { status?: number })?.status;
      const message = (error as { message?: string })?.message;
      toast.error(
        status === 403
          ? 'Solo un amministratore può aprire un nuovo assessment.'
          : message || 'Impossibile aprire un nuovo assessment.',
      );
      return false;
    } finally {
      setWorking(false);
    }
  }, [orgId, groupId, load]);

  /** Chiude il questionario e avvia l'elaborazione. */
  const confirmCampaign = useCallback(async (): Promise<boolean> => {
    if (!orgId || !groupId || !current) return false;
    setWorking(true);
    try {
      await assessmentV2Api.confirmCampaign(orgId, current.id, groupId);
      toast.success('Assessment confermato: l\'elaborazione partirà a breve.');
      await load();
      return true;
    } catch (error: unknown) {
      const message = (error as { message?: string })?.message;
      toast.error(message || 'Impossibile confermare l\'assessment.');
      return false;
    } finally {
      setWorking(false);
    }
  }, [orgId, groupId, current, load]);

  /**
   * Annulla la conferma e riapre il questionario.
   *
   * Se il report è già stato presentato o pubblicato il backend rifiuta con
   * `errors.force`: qui non si ritenta da soli: si restituisce `needsForce` e la
   * decisione torna all'utente, che deve vedere scritto cosa sta riscrivendo.
   */
  const unconfirmCampaign = useCallback(
    async (force = false): Promise<UnconfirmResult> => {
      if (!orgId || !groupId || !current) return { ok: false };
      setWorking(true);
      try {
        await assessmentV2Api.unconfirmCampaign(orgId, current.id, force, groupId);
        toast.success('Assessment riaperto: le risposte sono di nuovo modificabili.');
        await load();
        return { ok: true };
      } catch (error: unknown) {
        const err = error as {
          status?: number;
          message?: string;
          errors?: Record<string, string[]> | null;
        };

        if (err.errors?.force) {
          return { ok: false, needsForce: true, message: err.message };
        }

        toast.error(
          err.status === 403
            ? 'Solo un amministratore può riaprire un assessment confermato.'
            : err.message || 'Impossibile riaprire l\'assessment.',
        );
        return { ok: false };
      } finally {
        setWorking(false);
      }
    },
    [orgId, groupId, current, load],
  );

  return {
    current,
    campaigns,
    readiness,
    loading,
    working,
    isConfirmed: current?.is_confirmed ?? false,
    reload: load,
    createCampaign,
    confirmCampaign,
    unconfirmCampaign,
  };
};

/** `needsForce` = il report è già stato consegnato al cliente, serve un assenso esplicito. */
export interface UnconfirmResult {
  ok: boolean;
  needsForce?: boolean;
  message?: string;
}
