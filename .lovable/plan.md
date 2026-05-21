## Sistema classificazione e arricchimento findings

### 1. Database (migrazione approvata in chat precedente — già eseguita)

- **`cve_intel_cache`** — cache per CVE: descrizione NVD, CVSS v3/v2 (score+vector+severity), CWE list, references, CPE, exploit links, EPSS score+percentile, flag CISA KEV, date pubblicazione/modifica
- **`cve_enrichment_queue`** — coda di lavoro (status: queued/processing/done/failed)
- **`cisa_kev_catalog`** — copia completa del catalogo CISA KEV (~1200 record)
- **Trigger automatici** su `surface_findings` e `external_cve_findings`: ad ogni insert/update con CVE non vuoto, chiama `enqueue_cve_enrichment()` che accoda i CVE non già in cache recente (<7 giorni)
- Funzione helper `enqueue_cve_enrichment(cves[], org_id, source)` con dedup

### 2. Edge function `cve-enrichment` (worker coda)

Consuma fino a 25 elementi `queued` per invocazione, in sequenza:
1. **NVD 2.0 API** (`services.nvd.nist.gov/rest/json/cves/2.0?cveId=...`) → descrizione, CVSS, CWE, references, CPE, exploit links (filtra ref con tag `Exploit`/`PoC` o URL exploit-db/metasploit/github)
2. **FIRST EPSS API** (`api.first.org/data/v1/epss?cve=...`) → epss_score + percentile
3. **Match KEV locale** su `cisa_kev_catalog`
4. **Upsert** in `cve_intel_cache` con `refreshed_at = now()`
5. Rate limit: 6.5s tra chiamate senza NVD API key, 250ms con key (supporta opzionale `NVD_API_KEY` secret)
6. Retry fino a 3 tentativi, poi `failed`

**Trigger di esecuzione:**
- pg_cron ogni 30 secondi → drena la coda automaticamente
- Invocazione "kick" dal client all'apertura del modal CVE (per immediatezza)

### 3. Edge function `cisa-kev-sync` + cron

Scarica `cisa.gov/.../known_exploited_vulnerabilities.json`, upsert batch in `cisa_kev_catalog`, propaga flag KEV alle entries esistenti in `cve_intel_cache`.

**Cron:** ogni giorno alle 03:00 UTC via pg_cron + pg_net (registrato con tool insert, non migration, perché contiene URL+anon key).

### 4. Tassonomia statica per findings senza CVE — `src/lib/findingTaxonomy.ts`

Mappa `finding_type` → `{ cwe, owasp, baseScore, severity, category }` per i ~30 finding types Web Check/OSINT (security_headers, tls, dns, email_auth, cookies, exposure, components, auth). Esempi: `missing_xfo` → CWE-1021/A05:2021/5.4; `default_credentials` → CWE-798/A07:2021/9.8. Include link helpers per NVD, MITRE CWE, OWASP Top 10.

### 5. UI — Frontend

**`src/hooks/useCveIntel.ts`**
- `useCveIntel(cveId)` — fetch singolo da cache, se assente invoca `cve-enrichment` e ripolla ogni 4s finché arriva
- `useCveIntelBatch(cveIds[])` — fetch multipla per arricchire le righe della tabella

**`src/components/surface-scan/CveDetailDialog.tsx` (NEW)**
Modal con vista essenziale sempre visibile + sezioni collassabili:
- Sempre visibile: CVSS v3 (score+severity+vector), EPSS %+percentile, badge KEV (con data e azione richiesta CISA in box rosso), data pubblicazione, badges CWE cliccabili, descrizione completa
- Collassabili (chiuse di default tranne Exploit): **Exploit / PoC links**, **References complete**, **CPE affette**
- Footer: bottone "Apri su NVD" + timestamp refresh

**`src/components/surface-scan/SecurityFindings.tsx` (extend)**
- Ricerca estesa: accetta CVE-ID, CWE-ID, OWASP code, finding_type (regex match)
- 3 nuovi filtri: dropdown **OWASP Top 10**, toggle **Solo CISA KEV**, toggle **Solo con CVE**
- Nuova colonna **Classificazione** con badges CWE + OWASP (cliccabili → MITRE/OWASP docs)
- Click su qualsiasi CVE-ID nella riga vulnerability → apre `CveDetailDialog`
- Riga finding mostra EPSS reale (da `cve_intel_cache` quando disponibile) sovrascrivendo il valore parziale

### 6. Tecnicamente

Files da creare:
```
supabase/functions/cve-enrichment/index.ts
supabase/functions/cisa-kev-sync/index.ts
src/lib/findingTaxonomy.ts
src/hooks/useCveIntel.ts
src/components/surface-scan/CveDetailDialog.tsx
```

Files da modificare:
```
src/components/surface-scan/SecurityFindings.tsx   (badges, filtri, modal, EPSS reale)
```

Setup post-deploy:
- cron job pg_cron `cve-enrichment-drain` ogni 30s (via insert tool)
- cron job pg_cron `cisa-kev-sync-daily` ogni giorno 03:00 UTC (via insert tool)
- Trigger manuale immediato di `cisa-kev-sync` per popolare subito il catalogo
- Bootstrap: enqueue di tutti i CVE già presenti in `surface_findings` + `external_cve_findings` (one-shot INSERT...SELECT)

### 7. Note

- NVD API funziona senza key (rate limit 5 req/30s). Se vuoi velocità >10x posso chiedere un `NVD_API_KEY` gratuito su https://nvd.nist.gov/developers/request-an-api-key (rate limit 50 req/30s).
- I findings senza CVE (security headers, TLS, ecc.) restano classificati via tassonomia statica → comunque ricercabili per CWE/OWASP e con severity score numerico per ordinamento.
