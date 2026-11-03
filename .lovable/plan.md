# Report VA esterni (Nove) nella pagina Report

## Obiettivo
In **Generale → Report**, una nuova scheda **Vulnerability Assessment** che legge le VA mensili dall'archivio esterno Nove (API VA v1, sola lettura) e le mostra per cliente. Innovatech Group viene collegato a uno dei clienti presenti in Nove.

## Cosa vede l'utente
- **Token:** un modulo sicuro chiede il token Nove una volta sola. Il token resta sul server e non arriva mai al browser.
- **Collegamento cliente (Super Admin/Sales):** un tasto "Collega cliente VA" apre l'elenco dei clienti Nove (con ricerca) e associa quello giusto al cliente selezionato. Lo uso subito per collegare Innovatech Group a un cliente reale dell'elenco.
- **Elenco VA:** per il cliente collegato, l'elenco delle VA dalla più recente: nome, data, commessa, numero di documenti. Il dettaglio mostra i documenti contenuti nell'archivio.
- **Scarica:** scarica lo zip cifrato (AES-256). Un tasto separato "Mostra password" mostra la password dell'archivio, con un tasto per copiarla.
- **Chi vede cosa:** gli utenti del cliente vedono solo le VA del proprio cliente. Super Admin e Sales vedono quelle del cliente selezionato. Se il cliente non è collegato, vedono un messaggio.
- **Errori chiari:** token scaduto o revocato, permesso mancante, IP non ammesso, troppe richieste.

## Dettagli tecnici
- Secret `NOVE_API_TOKEN`, richiesto con il modulo sicuro. Host `https://nove.hisolution.it` (dalla documentazione allegata).
- Nuova funzione server `va-reports`: verifica la sessione dell'utente, risolve l'organizzazione (`doc_can_access_org`), legge `organizations.nove_cliente_id` e chiama Nove con `Authorization: Bearer`. Usa solo i percorsi `/api/v1/va/...` ammessi, mai link liberi, e non segue i redirect. Le azioni sono `clients` (solo Super Admin/Sales), `reviews`, `review`, `zip` (inoltrato come file) e `password`. Ogni review richiesta viene controllata: deve appartenere al cliente collegato.
- Migrazione: colonne `organizations.nove_cliente_id` (int) e `nove_cliente_name`. L'associazione la modificano solo Super Admin e Sales, attraverso la funzione server.
- Registro: ogni download di zip e ogni lettura della password viene scritto in `integration_audit_logs`.
- UI: `src/components/reports/ExternalVaReports.tsx` e una nuova scheda in `src/pages/Reports.tsx`.
- Doc DEV: `docs/report-va-esterni.md` (ramo PROTOTIPO, GitHub `ethergrade/hicompliance-DEV`).

## Da confermare
- La password è visibile anche agli utenti del cliente. La documentazione di Nove consiglia di dare questo permesso solo se serve davvero: posso limitarla a Super Admin/Sales.
