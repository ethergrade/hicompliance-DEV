# CyberNews — Documentazione Tecnica

## Panoramica

**CyberNews** è il modulo di intelligence e monitoraggio delle minacce cyber della piattaforma HiCompliance. Aggrega in tempo reale feed di sicurezza da fonti autorevoli italiane e internazionali, fornendo agli utenti una visione completa e aggiornata del panorama delle vulnerabilità e degli alert di sicurezza.

---

## Architettura

### Componenti Principali

| Componente | Path | Descrizione |
|---|---|---|
| **CyberNews Page** | `src/pages/CyberNews.tsx` | Pagina principale del modulo |
| **SecurityFeedsSection** | `src/components/dashboard/SecurityFeedsSection.tsx` | Sezione aggregata dei feed (riutilizzabile, supporta modalità compact e full) |
| **SecurityFeedCard** | `src/components/dashboard/SecurityFeedCard.tsx` | Card singola per ogni notizia/alert |
| **EPSSPredictionCard** | `src/components/dashboard/EPSSPredictionCard.tsx` | Card dedicata alle prediction EPSS |
| **EPSSWidget** | `src/components/dashboard/EPSSWidget.tsx` | Widget compatto EPSS per la dashboard principale |
| **useACNFeeds Hook** | `src/hooks/useACNFeeds.ts` | Hook per il fetching e caching dei feed |
| **Edge Function** | `supabase/functions/fetch-acn-feeds/index.ts` | Funzione serverless per lo scraping dei feed |

### Flusso Dati

```
Browser → useACNFeeds (React Query) → Edge Function (fetch-acn-feeds) → Fonti Esterne
                                                                          ├── CSIRT Italia (Alert Sicurezza)
                                                                          ├── CVEFeed.io (CVE High Severity)
                                                                          └── FIRST.org (EPSS Predictions)
```

---

## Feed Attivi

### 1. Alert Sicurezza — CSIRT Italia

- **Fonte**: [CSIRT Italia](https://www.csirt.gov.it)
- **Tipo**: Alert e bollettini di sicurezza del Computer Security Incident Response Team italiano
- **Classificazione severità**: Critica, Alta, Media, Bassa
- **Filtri disponibili**:
  - **Tutti**: Mostra tutti gli alert
  - **⚡ Prioritari**: Solo alert con severità Critica o Alta
  - **Critica / Alta / Media / Bassa**: Filtro per singola severità
- **Aggiornamento**: On-demand tramite pulsante refresh + caching React Query
- **Link diretto**: [https://www.csirt.gov.it](https://www.csirt.gov.it)

### 2. CVE Feed — Vulnerabilità High Severity

- **Fonte**: [CVEFeed.io RSS High Severity](https://cvefeed.io/rssfeed/severity/high)
- **Tipo**: Ultime vulnerabilità CVE con severity alta
- **Formato**: Griglia 3 colonne con card dedicate
- **Dati mostrati**:
  - CVE ID (es. CVE-2025-XXXX)
  - Titolo/Descrizione della vulnerabilità
  - Data di pubblicazione
  - Link al [National Vulnerability Database (NVD)](https://nvd.nist.gov/)
- **Link diretto**: [https://cvefeed.io/rssfeed/severity/high](https://cvefeed.io/rssfeed/severity/high)

### 3. EPSS Predictions — Exploit Prediction Scoring System

- **Fonte**: [FIRST.org EPSS](https://www.first.org/epss/)
- **Documentazione**: [EPSS Model](https://www.first.org/epss/model)
- **API**: [FIRST.org EPSS API](https://api.first.org/data/v1/epss)
- **Tipo**: Predizioni sulla probabilità di exploit delle CVE (ultimi 2 giorni)
- **Formato**: Griglia 4 colonne con card dedicate
- **Dati mostrati**:
  - CVE ID
  - EPSS Score (probabilità di exploit, 0-100%)
  - Percentile (ranking rispetto ad altre CVE)
  - Data della predizione
- **Top 12**: Mostra le 12 CVE con il punteggio EPSS più alto
- **Link diretto**: [https://cvefeed.io/epss/exploit-prediction-scoring-system/](https://cvefeed.io/epss/exploit-prediction-scoring-system/)

---

## Funzionalità

### Ricerca Globale

- Barra di ricerca full-text su tutti i feed attivi
- Ricerca per **parole chiave**, **CVE ID** (es. `CVE-2025-1234`), **descrizione**
- Persistenza della query in `localStorage` (chiave: `security_feeds_search_query`)
- Contatore risultati in tempo reale

### Filtri Severità (Alert Sicurezza)

- Persistenza del filtro selezionato in `localStorage` (chiave: `security_feeds_severity_filter`)
- Badge con conteggio per ogni livello di severità
- Filtro rapido "Prioritari" (Critica + Alta)

### Gestione Link Esterni

I link esterni utilizzano un sistema di intercettazione intelligente:
- **Apertura diretta**: Tenta `window.open()` in nuova scheda
- **Fallback iframe**: Se bloccato dal browser (es. in ambienti iframe/preview), copia automaticamente l'URL negli appunti
- **Notifica toast**: Mostra istruzioni per l'apertura manuale

### Modalità Compact (Dashboard)

La sezione è riutilizzabile con prop `compact={true}`:
- Mostra solo le prime 3 notizie NIS2 + 3 alert sicurezza
- Senza barra di ricerca
- Altezza fissa 350px con scroll

---

## Accesso e Permessi

| Ruolo | Accesso CyberNews |
|---|---|
| Super Admin | ✅ |
| Sales | ✅ |
| Client | ✅ |

La visibilità del modulo è gestita tramite la tabella `role_module_permissions` nel database Supabase.

---

## Edge Function: `fetch-acn-feeds`

### Endpoint

```
POST /functions/v1/fetch-acn-feeds
```

### Configurazione

```toml
# supabase/config.toml
[functions.fetch-acn-feeds]
verify_jwt = false
```

### Fonti Scraping

| Feed | URL | Metodo |
|---|---|---|
| CSIRT Alert | `https://www.csirt.gov.it` | HTML Scraping |
| CVE High | `https://cvefeed.io/rssfeed/severity/high` | RSS/XML Parsing |
| EPSS | `https://api.first.org/data/v1/epss` | REST API JSON |

### Filtri Scraping

- Esclusione automatica di link social irrilevanti (Facebook, Twitter, LinkedIn, etc.)
- I link CVE puntano al [National Vulnerability Database](https://nvd.nist.gov/)
- Arricchimento dati con score EPSS da [FIRST.org](https://www.first.org/epss/)

---

## Caching

- **React Query**: Caching client-side con invalidazione automatica
- **localStorage**: Persistenza filtri e query di ricerca tra sessioni

---

## Stack Tecnologico

| Tecnologia | Utilizzo |
|---|---|
| React 18 | UI Components |
| TypeScript | Type Safety |
| React Query (TanStack) | Data Fetching & Caching |
| Supabase Edge Functions | Backend Serverless |
| Tailwind CSS | Styling |
| shadcn/ui | Component Library |
| Lucide React | Iconografia |

---

## Link Utili

- **CSIRT Italia**: [https://www.csirt.gov.it](https://www.csirt.gov.it)
- **CVEFeed.io**: [https://cvefeed.io](https://cvefeed.io)
- **CVEFeed RSS High Severity**: [https://cvefeed.io/rssfeed/severity/high](https://cvefeed.io/rssfeed/severity/high)
- **FIRST.org EPSS**: [https://www.first.org/epss/](https://www.first.org/epss/)
- **EPSS API**: [https://api.first.org/data/v1/epss](https://api.first.org/data/v1/epss)
- **EPSS Model Documentation**: [https://www.first.org/epss/model](https://www.first.org/epss/model)
- **National Vulnerability Database**: [https://nvd.nist.gov/](https://nvd.nist.gov/)
- **MITRE CVE**: [https://cve.mitre.org/](https://cve.mitre.org/)
