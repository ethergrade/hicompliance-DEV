
# Piano: Feed NIS2 e Vulnerabilita in Dashboard

## Panoramica

Aggiungere due feed informativi in fondo alla Dashboard:
1. **Feed NIS2** - Novita e aggiornamenti normativi da ACN
2. **Feed Threat/Vulnerabilita** - Alert di sicurezza CSIRT Italia

---

## Architettura Proposta

Poiche le fonti ACN non espongono un RSS tradizionale, utilizzeremo web scraping tramite Edge Function che estrae e parsifica il contenuto HTML delle pagine.

```text
+----------------+     +------------------------+     +------------------+
|   Dashboard    | --> | Edge Function (scrape) | --> | ACN/CSIRT Pages  |
|   Component    |     |   - fetch-acn-feeds    |     |                  |
+----------------+     +------------------------+     +------------------+
        |                        |
        v                        v
+----------------+     +------------------------+
|  FeedCard UI   |     |   Cache in Supabase    |
|  (rolling)     |     |   (opzionale)          |
+----------------+     +------------------------+
```

---

## Fonti Dati

| Feed | URL Sorgente | Tipo |
|------|--------------|------|
| NIS2 | `https://www.acn.gov.it/portale/nis/notizie-ed-eventi` | Scraping HTML |
| Threat | `https://www.acn.gov.it/portale/feedrss` (CSIRT) | Scraping HTML |

### Struttura Dati Estratti

```typescript
interface FeedItem {
  title: string;
  description: string;
  url: string;
  date: string;
  type: 'nis2' | 'threat';
  severity?: 'critica' | 'alta' | 'media' | 'bassa';
}
```

---

## Componenti da Creare

### 1. Edge Function: `fetch-acn-feeds`

Funzione che:
- Effettua fetch delle due pagine ACN
- Parsifica l'HTML estraendo titolo, descrizione, data, link
- Ritorna array di FeedItem ordinati per data

**Endpoint**: `POST /functions/v1/fetch-acn-feeds`

### 2. Hook: `useACNFeeds`

```text
src/hooks/useACNFeeds.ts
```

Hook React che:
- Chiama l'edge function
- Gestisce loading/error state
- Opzionale: cache locale per ridurre chiamate

### 3. Componente: `SecurityFeedCard`

```text
src/components/dashboard/SecurityFeedCard.tsx
```

Card singola per visualizzare un feed item con:
- Badge colorato per tipo (NIS2 blu, Threat rosso/arancio)
- Titolo linkato
- Descrizione troncata
- Data formattata

### 4. Componente: `SecurityFeedsSection`

```text
src/components/dashboard/SecurityFeedsSection.tsx
```

Sezione che contiene:
- Due colonne affiancate (NIS2 | Threat)
- Scroll verticale per ogni colonna
- Massimo 5-8 item per colonna
- Link "Vedi tutti" per fonte esterna

---

## Design UI

Layout proposto per la sezione feed in fondo alla dashboard:

```text
+--------------------------------------------------+
|                    Dashboard                      |
|  [Metriche] [Servizi HiSolution] [Statistiche]   |
+--------------------------------------------------+
|                                                   |
|  +---------------------+  +---------------------+ |
|  |   Novita NIS2       |  |  Alert Sicurezza   | |
|  |   ----------------  |  |  ----------------   | |
|  | * NIS2, aggiorna... |  | * Vulnerabilita... | |
|  |   23 Dic 2025       |  |   CRITICA - 5 Feb  | |
|  |                     |  |                     | |
|  | * NIS: prossimi...  |  | * Risolte vuln...  | |
|  |   22 Nov 2025       |  |   ALTA - 5 Feb     | |
|  |                     |  |                     | |
|  | * UNI/PdR 174...    |  | * Phishing camp... | |
|  |   15 Mag 2025       |  |   MEDIA - 4 Feb    | |
|  +---------------------+  +---------------------+ |
|                                                   |
+--------------------------------------------------+
```

---

## Dettagli Tecnici

### Edge Function - Parsing HTML

La funzione utilizzera regex o un parser DOM leggero per estrarre:
- Titoli: elementi `<h3>` con link `<a>`
- Date: testo tipo "News - 23 Dicembre 2025" o "Alert - 05/02/26"
- Descrizioni: testo successivo al titolo
- Severity per threat: parole chiave come "critica", "alta", "media"

### Caching

Per evitare troppe richieste verso ACN:
- Cache lato client con stale-while-revalidate (5 minuti)
- Opzionale: tabella Supabase `feed_cache` per persistenza

### Gestione Errori

- Fallback a "Nessun aggiornamento disponibile" se scraping fallisce
- Retry automatico dopo 30 secondi
- Toast di errore solo in modalita sviluppo

---

## File da Creare

| File | Descrizione |
|------|-------------|
| `supabase/functions/fetch-acn-feeds/index.ts` | Edge function per scraping |
| `src/hooks/useACNFeeds.ts` | Hook per fetch e gestione dati |
| `src/components/dashboard/SecurityFeedCard.tsx` | Card singolo item feed |
| `src/components/dashboard/SecurityFeedsSection.tsx` | Sezione con due feed |

## File da Modificare

| File | Modifica |
|------|----------|
| `src/pages/Dashboard.tsx` | Aggiungere SecurityFeedsSection in fondo |
| `supabase/config.toml` | Aggiungere configurazione fetch-acn-feeds |

---

## Ordine di Implementazione

1. **Edge Function** - `fetch-acn-feeds` con parsing HTML
2. **Hook** - `useACNFeeds` per consumare l'endpoint
3. **Componenti UI** - SecurityFeedCard e SecurityFeedsSection
4. **Integrazione** - Aggiungere sezione in Dashboard.tsx
5. **Stile** - Affinare design e responsive

---

## Note Tecniche

- Lo scraping e necessario perche ACN non espone RSS pubblici funzionanti
- La funzione edge ha timeout di 10 secondi per evitare blocchi
- I link esterni si aprono in nuova tab (`target="_blank"`)
- Il feed si aggiorna automaticamente ogni 5 minuti (client-side)
- Badge severity con colori: critica=rosso, alta=arancio, media=giallo
