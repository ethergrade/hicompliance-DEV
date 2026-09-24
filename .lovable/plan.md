# Porting frontend da merge-imnick-IMNICK a PRODOTTO

## Cosa emerge dal confronto (PRODOTTO vs copia salvata)
- 189 file diversi, 111 presenti solo nella copia, 42 presenti solo su PRODOTTO.
- **PRODOTTO usa già l'accesso con il database Supabase** (`hcllvyzhefcqftesahnv`): login, profili e ruoli passano da lì.
- **La copia usa il server Laravel** per accesso e dati in 37 file (`apiClient`, `authApi`). Copiarla così com'è riporterebbe il login su Laravel, cioè l'opposto di quanto richiesto.
- PRODOTTO ha moduli che la copia non ha (DarkRisk Esteso, Surface Graph, Admin Sales Dashboard, calcolo health score, varie funzioni lato server). Vanno conservati.

## Approccio proposto: porting selettivo, non sovrascrittura
1. **Accesso e ruoli**: restano quelli di PRODOTTO (Supabase). Nessun file di login/`AuthProvider`/`api-client` Laravel viene copiato.
2. **Copio solo le parti visibili che lavorano già su Supabase** o che sono pura interfaccia:
   - SurfaceScan360 (report AI, PDF, sottodomini, etichette neutrali, OSINT senza nomi tecnologie).
   - Dashboard con health score reale e True Risk Score.
   - Pannello Modalità Stage per super admin + banner.
   - Componenti UI condivisi e correzioni grafiche.
3. **File misti** (usano sia Laravel sia Supabase): li adatto uno a uno per leggere da Supabase. Se un dato esiste solo su Laravel e non nel database, lo segnalo invece di inventarlo.
4. **Esclusi**: modifiche alle tabelle, `.env`, documenti di lavoro, workflow GitHub di deploy DEV.
5. **Funzioni lato server** della copia (surface-scan-cron, pentest-tools-poll, stage-mode, ai-report): le porto, perché girano già su questo database.

## Ordine di lavoro (a blocchi, con verifica dopo ciascuno)
```text
Blocco 1  componenti UI condivisi + utility        -> build verde
Blocco 2  SurfaceScan360 (pagine, report, PDF)      -> build + prova in anteprima
Blocco 3  Dashboard health score / True Risk        -> build + prova
Blocco 4  Modalità Stage admin + funzioni server    -> build + prova interruttore
Blocco 5  file misti adattati a Supabase            -> build + login e navigazione completa
```
Dopo ogni blocco controllo che i moduli esclusivi di PRODOTTO funzionino ancora.

## Verifica finale
- Login come super admin sul database Supabase, apertura di Dashboard, SurfaceScan360, DarkRisk, Impostazioni.
- Nessun errore di build o in console.
- Elenco finale di cosa è stato portato, adattato o lasciato fuori.

## Note tecniche
- Nessuna migrazione SQL.
- Le funzioni server che richiedono ruoli usano `has_role` già presente.
- Ogni modifica si sincronizza automaticamente sul ramo PRODOTTO.
