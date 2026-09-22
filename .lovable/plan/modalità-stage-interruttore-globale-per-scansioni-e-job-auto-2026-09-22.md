# Modalità Stage: interruttore globale per scansioni e job automatici

Questa istanza viene usata come ambiente di test, non come produzione. Serve un modo semplice, riservato al super-admin, per spegnere le attività automatiche che consumano risorse (scansioni periodiche, arricchimenti, polling) e riaccenderle quando servono.

## Cosa vedrà l'utente

Nuova sezione **"Modalità operativa"** dentro Impostazioni (`/admin/impostazioni`, già riservata al super-admin), sopra il catalogo domande:

- Un interruttore principale **"Modalità Stage (scansioni in pausa)"**. Attivandolo, tutte le attività automatiche si fermano e le richieste manuali di scansione vengono rifiutate con un messaggio chiaro.
- Sotto, una lista delle singole attività automatiche con stato (attiva/in pausa) e frequenza, ognuna con il proprio interruttore, per casi in cui si vuole tenerne accesa solo qualcuna:
  - arricchimento vulnerabilità (ogni minuto + ogni 5 minuti)
  - elaborazione coda scansioni Nuclei (ogni minuto)
  - recupero risultati ConnectSecure (ogni minuto)
  - coda sottodomini SurfaceScan (ogni 2 minuti)
  - scansione settimanale SurfaceScan (lunedì)
  - DarkRisk: polling richieste manuali (5 min), pulizia lock (10 min), ciclo settimanale
  - sincronizzazione catalogo CISA KEV (giornaliera)
- Un banner di avviso in cima alla Dashboard quando la modalità Stage è attiva, così nessuno pensa che i dati siano aggiornati.

## Effetti della pausa

1. I job pianificati sul database vengono disattivati (non vengono eliminati: si riattivano con lo stesso interruttore).
2. Le funzioni di scansione controllano il flag all'avvio e terminano subito se la modalità Stage è attiva, anche se qualcuno le invoca a mano o resta una chiamata in coda.
3. I pulsanti "avvia scansione" nell'interfaccia mostrano un avviso invece di partire.

## Dettagli tecnici

**Database**
- Nuova tabella `public.platform_runtime_settings` (riga singola, chiave `stage_mode` booleana + `paused_jobs` jsonb + `updated_by`, `updated_at`), con GRANT a `authenticated`/`service_role`, RLS attiva: lettura a tutti gli autenticati, scrittura solo `has_role(auth.uid(),'super_admin')`.
- Funzione `public.set_platform_stage_mode(_enabled boolean)` e `public.set_cron_job_active(_jobname text, _active boolean)`, entrambe SECURITY DEFINER con verifica `has_role(auth.uid(),'super_admin')`, che aggiornano la tabella e chiamano `cron.alter_job(..., active := ...)` sui job elencati sopra. La versione globale itera sull'elenco dei job noti.
- Vista/funzione di sola lettura `public.list_platform_cron_jobs()` (SECURITY DEFINER, super-admin) che restituisce nome, schedule e stato attivo dei job, per popolare la lista in interfaccia.

**Edge functions**
- Nuovo helper `supabase/functions/_shared/stage-mode.ts` con `isStageModePaused(client)`; usato in testa a `surface-scan-cron`, `surfacescan360-start-scan`, `surfacescan360-run-enrichment`, `cve-enrichment`, `connectsecure-scan`, `cisa-kev-sync`, `darkrisk360-orchestrator-v2`, `darkrisk360-worker-v2`, `nuclei-scan360` e `hitrack-scheduler`: se in pausa restituiscono `200 { skipped: true, reason: 'stage_mode' }` senza lavoro né chiamate esterne.

**Frontend**
- `src/hooks/usePlatformRuntimeSettings.ts`: lettura/scrittura del flag e dei job via Supabase (query + mutation con invalidazione).
- `src/components/admin/PlatformRuntimeSettings.tsx`: card con interruttore globale, elenco job e conferma prima di riattivare.
- `src/pages/AdminSettings.tsx`: inserimento della nuova sezione.
- Banner in `src/components/layout/DashboardLayout.tsx` quando `stage_mode` è attivo.

**Nota**: la riduzione del carico storico (`cron.job_run_details` ~867 MB) non è inclusa qui; se vuoi, aggiungo nello stesso pannello un pulsante "pulisci storico esecuzioni".
