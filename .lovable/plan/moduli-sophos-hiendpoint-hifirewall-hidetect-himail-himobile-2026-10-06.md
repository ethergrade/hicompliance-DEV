# Moduli Sophos (HiEndpoint, HiFirewall, HiDetect, HiMail, HiMobile) in demo per il DEV

## Situazione trovata
- Le 5 schermate esistono già (in `src/components/service-dashboards/`) e si aprono da `/dashboard/service/<codice>`.
- Ognuna legge da un'API (oggi Laravel, non attiva su questo ramo) e, se fallisce, mostra dati di esempio con badge "Demo Data".
- Non c'è un riferimento esplicito a Sophos nei contratti dati; nel menu laterale le voci non sono visibili come HiTrack/HiPatch.

## Cosa faremo
1. **Menu laterale**: aggiungere le 5 voci nella sezione Generale (sotto HiPatch), visibili al super admin e ai clienti con il servizio attivo.
2. **Dati mock Innovatech ricchi** (come fatto per HiTrack/HiPatch), file dedicati in `src/data/` modellati sui campi delle API Sophos Central:
   - HiEndpoint (Endpoint API): ~40 dispositivi, stato protezione/tamper, alert, versioni agente.
   - HiFirewall (Firewall API/XG): firewall, regole, minacce bloccate, log connessioni, firmware.
   - HiDetect (XDR/Detections + Network Detection): topologia, rilevamenti con MITRE, dispositivi nuovi/non autorizzati.
   - HiMail (Email API): messaggi in quarantena, phishing/BEC, top mittenti, trend.
   - HiMobile (Mobile API): dispositivi iOS/Android, conformità, policy, app.
   Nessun nome reale di cliente; mock solo per Innovatech, gli altri clienti restano invariati.
3. **Contratti API documentati**: aggiornare i tipi in `src/lib/api/*.ts` con i campi Sophos e aggiungere `docs/sophos/` con mappatura endpoint Sophos -> campi UI (per il DEV che implementerà il backend).
4. **UX coerente**: menu fisso di sezione (SectionNav), filtri, paginazione e semafori nelle 5 dashboard; health score alimentato dai mock così la dashboard principale riflette i 5 servizi.
5. Attivare i 5 servizi su Innovatech (tabella servizi cliente) e verificare con Playwright ogni pagina.

## Dettagli tecnici
- Hook `useEndpoints/useFirewall/useDetect/useMail/useMobile`: se org = Innovatech restituiscono il mock senza chiamare l'API (come `useHipatch`), altrimenti comportamento attuale.
- Gating sidebar tramite `orgFlags`/tenant_services come HiPatch.
- Nessuna modifica al database oltre all'attivazione dei servizi demo.
