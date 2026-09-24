# Business Impact Analysis (BIA) — stato implementazione

Specifica di riferimento: README BIA e allegati 01–06 (modello `BIA_SCORE_V1`).

## Cosa c'è
- Pagine: `/business-impact-analysis` (registro servizi, vista operativa/executive, suggerimenti da infrastruttura critica) e `/business-impact-analysis/services/:serviceId[/bia/:biaId]` (Sintesi, Impatti, Recovery, Dipendenze, Rischi e remediation, Storico).
- Salvataggio automatico bozza (1,5 s), controllo conflitti su `updated_at`, ricalcolo lato database (`bia_compute`).
- Workflow: bozza -> in revisione -> approvata (immutabile) -> nuova revisione (`bia_clone_revision`); richiesta modifiche con commento; audit in `bia_audit_events`.
- Export PDF (filigrana BOZZA per versioni non approvate).
- Voce di menu in HiCompliance e permesso `hicompliance.bia`.

## Decisioni
- **Backend**: su questo branch prototipo il backend autoritativo è Supabase (tabelle + RPC con RLS), non l'API Laravel prevista dal README. Nessun dato in localStorage.
- **Soglie di criticità**: >80 Critica, >60 Alta, >30 Media (l'esempio della specifica 80,42 = Critica prevale sulle fasce intere 81–100).
- Perdita annua attesa calcolata solo con frequenza documentata; ROI/payback solo con riduzione motivata e budget.
- Il rischio tecnico resta separato dal Business Impact Score (indice di priorità = BIS × rischio / 100).

## Test
- `bun test src/lib/bia` — 29 test sul motore di calcolo.
- Verifica E2E: creazione servizio, inserimento costo a 24 h, ricalcolo dimensione economica (75) e copertura dati.

## Da completare
- Integrazione ordine di recovery nella pagina Incident Response.
- Warning di sicurezza database preesistenti (funzioni SECURITY DEFINER eseguibili, viste, ecc.).

## Lavoro della giornata (branch PROTOTIPO)
Login su Supabase, demo Innovatech (HiTrack, HiPatch, SurfaceScan, DarkRisk), assessment/remediation/IRP su Supabase, Supply Chain con portale fornitori, snapshot e confronto assessment, modulo BIA.
