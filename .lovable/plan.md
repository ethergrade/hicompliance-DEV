## Obiettivo

Quando un utente Sales/Super Admin è su `/surface-scan` con un cliente selezionato e fa refresh (F5), deve restare sullo stesso cliente e sulla stessa pagina, senza essere reindirizzato a `/admin/clients` né perdere il contesto.

## Diagnosi

- `ClientContext` già salva la selezione in `localStorage` (`hicompliance_selected_org`) e prova a ripristinarla in `fetchOrganizations()`.
- `ClientSelectionGuard` protegge `/surface-scan`: se `needsClientSelection` diventa `true` anche per un istante dopo che `isLoadingClients` passa a `false`, scatta `<Navigate to="/admin/clients" replace />` e l'URL originale viene perso.
- Problemi attuali:
  1. Race condition: `isLoadingClients` può diventare `false` prima che `setSelectedOrganizationState(storedOrg)` sia "visibile" nel render successivo, causando un redirect spurio.
  2. Se `localStorage` è stato pulito (logout in altra tab, browser privato, ecc.), la selezione viene persa silenziosamente senza fallback nell'URL.
  3. Nessuna persistenza nell'URL: condividere il link `/surface-scan` non porta sullo stesso cliente.

## Soluzione

### 1. URL come fonte di verità aggiuntiva su `/surface-scan`

- Aggiungere supporto al query param `?org=<organization_id>` su `SurfaceScan360`.
- All'avvio della pagina:
  - se `?org=` è presente e l'utente è Sales/Super Admin e l'org è tra le `organizations` caricate, chiamare `setSelectedOrganization(org)` (che aggiorna anche il `localStorage`).
  - se `?org=` non c'è ma esiste un `selectedOrganization`, fare `navigate` "replace" aggiungendo `?org=<id>` così il refresh successivo è deterministico.
- Quando l'utente cambia cliente dal selettore in pagina (o da `/admin/clients` tornando indietro), aggiornare il query param.

### 2. Hardening del `ClientSelectionGuard`

- Non triggerare il redirect finché `organizations` non è stato popolato almeno una volta (nuovo flag `hasFetchedOrganizations` nel context) — evita il flash/redirect durante il ripristino.
- Quando il guard deve redirectare a `/admin/clients`, passare `state: { from: location.pathname + location.search }` così la pagina di selezione cliente può tornare indietro al posto giusto.

### 3. Ritorno automatico dopo la selezione

- In `ClientSelection.handleSelectClient`, se `location.state?.from` è presente, fare `navigate(state.from)` invece del default `/dashboard`. In questo modo, anche nei casi in cui il redirect scatta, l'utente torna su `/surface-scan` con il cliente appena scelto.

### 4. Robustezza localStorage

- In `ClientContext.fetchOrganizations`, settare `isLoadingClients = false` solo dopo aver tentato il restore da `localStorage` (già così oggi, ma assicurare ordine e aggiungere il nuovo flag `hasFetchedOrganizations`).
- Validare l'org letta da `localStorage`: se non è più nella lista (es. cliente eliminato), pulire la chiave senza errori.

## Dettagli tecnici

File toccati:
- `src/contexts/ClientContext.tsx` — aggiungere `hasFetchedOrganizations` al context value; esporlo.
- `src/components/guards/ClientSelectionGuard.tsx` — bloccare il redirect finché `!hasFetchedOrganizations`; passare `state.from` con pathname + search.
- `src/pages/ClientSelection.tsx` — usare `location.state?.from` per il `navigate` post-selezione.
- `src/pages/SurfaceScan360.tsx` — sync bidirezionale tra `?org=` e `selectedOrganization` via `useSearchParams`.

Nessuna modifica al DB, nessuna modifica alle edge function.

## Out of scope

- Estendere lo stesso pattern URL ad altre pagine (Dashboard, Assessment, Integrations). Si potrà replicare in un secondo momento se serve.
