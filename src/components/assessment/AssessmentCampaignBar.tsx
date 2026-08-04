import { useState } from 'react';
import { CheckCircle2, FilePlus2, Loader2, Lock, PencilLine } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { AssessmentCampaign, AssessmentReadiness } from '@/types/api';

interface AssessmentCampaignBarProps {
  campaign: AssessmentCampaign | null;
  readiness: AssessmentReadiness | null;
  isAdmin: boolean;
  working: boolean;
  onConfirm: () => void;
  onCreate: () => void;
}

/**
 * Stato del ciclo di assessment e i due soli gesti del flusso.
 *
 * Sostituisce il doppio passaggio precedente — "Salva snapshot" in Gap Analysis
 * più "Invia per elaborazione" nel pannello AI, che compariva solo dopo il primo:
 * un percorso in cui quasi metà dei clienti si fermava a metà senza accorgersene.
 */
export function AssessmentCampaignBar({
  campaign,
  readiness,
  isAdmin,
  working,
  onConfirm,
  onCreate,
}: AssessmentCampaignBarProps) {
  const [confermaAperta, setConfermaAperta] = useState(false);
  const [nuovoAperto, setNuovoAperto] = useState(false);

  // Nessun ciclo: si apre alla prima risposta salvata, non c'è nulla da mostrare.
  if (!campaign) return null;

  const confermato = campaign.is_confirmed;
  const pronto = readiness?.is_ready ?? false;

  const dataConferma = campaign.confirmed_at
    ? new Date(campaign.confirmed_at).toLocaleDateString('it-IT', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  return (
    <>
      <Card className="border-border">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div className="flex items-start gap-3">
            {confermato ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-500" />
            ) : (
              <PencilLine className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            )}

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{campaign.label}</span>
                <Badge variant={confermato ? 'default' : 'secondary'} className="text-[11px]">
                  {confermato ? 'Confermato' : 'In compilazione'}
                </Badge>
              </div>

              <p className="mt-0.5 text-sm text-muted-foreground">
                {confermato
                  ? dataConferma
                    ? `Confermato il ${dataConferma}. Le risposte sono in sola lettura.`
                    : 'Le risposte sono in sola lettura.'
                  : readiness
                    ? `${readiness.answered} di ${readiness.visible_total} domande compilate`
                    : 'Compila il questionario per poterlo confermare.'}
              </p>

              {!confermato && readiness && !pronto && readiness.blocking_reason && (
                <p className="mt-1 text-xs text-amber-500">{readiness.blocking_reason}</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!confermato && (
              <ConfirmButton
                disabled={!pronto || working}
                reason={readiness?.blocking_reason}
                working={working}
                onClick={() => setConfermaAperta(true)}
              />
            )}

            {confermato && isAdmin && (
              <Button variant="outline" onClick={() => setNuovoAperto(true)} disabled={working}>
                <FilePlus2 className="mr-2 h-4 w-4" />
                Crea nuovo assessment
              </Button>
            )}

            {confermato && !isAdmin && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Lock className="h-3.5 w-3.5" />
                Solo un amministratore può aprirne uno nuovo
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confermaAperta} onOpenChange={setConfermaAperta}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confermare l'assessment?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Le risposte diventano di sola lettura e parte l'elaborazione: analisi AI e
                  scansioni. Il risultato sarà disponibile entro pochi minuti.
                </p>
                <p>
                  Per modificarle in seguito servirà aprire un nuovo assessment, cosa che può
                  fare un amministratore.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirm}>Conferma e avvia</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={nuovoAperto} onOpenChange={setNuovoAperto}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aprire un nuovo assessment?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Le risposte attuali vengono riportate nel nuovo assessment come punto di
                  partenza e andranno riviste una per una.
                </p>
                <p>
                  <strong>{campaign.label}</strong> resta consultabile con le sue risposte, il suo
                  punteggio e il suo piano di remediation.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={onCreate}>Apri nuovo assessment</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Disabilitato spiega il perché nel tooltip, invece di lasciare l'utente a indovinare. */
function ConfirmButton({
  disabled,
  reason,
  working,
  onClick,
}: {
  disabled: boolean;
  reason?: string | null;
  working: boolean;
  onClick: () => void;
}) {
  const button = (
    <Button onClick={onClick} disabled={disabled}>
      {working ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <CheckCircle2 className="mr-2 h-4 w-4" />
      )}
      Conferma e avvia elaborazione
    </Button>
  );

  if (!disabled || !reason) return button;

  return (
    <Tooltip>
      {/* Un pulsante disabilitato non emette eventi: serve un wrapper per il tooltip */}
      <TooltipTrigger asChild>
        <span tabIndex={0}>{button}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{reason}</TooltipContent>
    </Tooltip>
  );
}
