

# Sistema di Connessione Rapida API per Servizi Dashboard

## Obiettivo
Aggiungere un sistema "one-click" per collegare i servizi HiSolution direttamente dalla dashboard, con un dialog semplificato che richiede solo una stringa di connessione (API key/ID) e un URL, senza dover navigare alla pagina Integrazioni completa.

## Cosa cambia per l'utente
- Ogni card servizio nella dashboard mostra lo stato di connessione API (collegato / non collegato)
- Cliccando su un servizio non collegato, si apre un dialog rapido con solo 2 campi: **URL API** e **Chiave API**
- I servizi gia collegati mostrano un badge "API Connessa" verde
- Un pulsante permette di scollegare rapidamente un servizio

## Dettaglio tecnico

### 1. Nuovo componente: `ServiceQuickConnect.tsx`
Dialog modale semplificato che:
- Mostra il nome del servizio selezionato
- Richiede solo `api_url` e `api_key`
- Inserisce/aggiorna un record in `organization_integrations` con `is_active: true` e `api_methods: {}`
- Mostra feedback di successo/errore con toast

### 2. Nuovo hook: `useServiceIntegrations.ts`
Hook che:
- Fetcha le `organization_integrations` per l'organizzazione corrente
- Espone una funzione `isServiceConnected(serviceCode)` per verificare lo stato
- Espone `connectService(serviceId, apiUrl, apiKey)` e `disconnectService(integrationId)`
- Usa React Query con invalidazione automatica

### 3. Modifica: `Dashboard.tsx`
- Importa il nuovo hook e componente
- Aggiunge un indicatore visivo (badge/icona) su ogni card servizio per mostrare se ha un'integrazione API attiva
- Aggiunge un pulsante "Collega API" sulle card non collegate, e "Scollegato" / "Gestisci" su quelle collegate
- Il dialog si apre con un click sulla card o sul pulsante

### 4. Flusso utente

```text
Card Servizio (es. HiFirewall)
  |
  |-- Se NON collegato:
  |     Badge grigio "API non connessa"
  |     Click -> Apre dialog con:
  |       - Nome servizio (readonly)
  |       - Campo URL API
  |       - Campo Chiave API  
  |       - Pulsante "Collega"
  |
  |-- Se collegato:
  |     Badge verde "API Connessa"
  |     Click -> Naviga alla dashboard servizio (comportamento attuale)
  |     Icona link/unlink per gestire connessione
```

### 5. Accesso
- Super Admin e Sales possono collegare/scollegare servizi (coerente con la pagina Integrazioni)
- I client vedono solo lo stato (collegato/non collegato) senza poter modificare

### File coinvolti
| File | Azione |
|------|--------|
| `src/hooks/useServiceIntegrations.ts` | Nuovo - hook per gestire integrazioni |
| `src/components/dashboard/ServiceQuickConnect.tsx` | Nuovo - dialog connessione rapida |
| `src/pages/Dashboard.tsx` | Modifica - aggiunta badge e dialog alle card servizio |

