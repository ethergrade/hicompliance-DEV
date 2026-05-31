# Codex - Inserire HTTP Headers Scanner nel Report SurfaceScan360

## Obiettivo
Aggiungere una sezione nel report SurfaceScan360 dedicata agli HTTP Security Headers, utile sia per executive summary sia per remediation tecnica.

## Prima di sviluppare
Cerca nel repo:

- generazione PDF
- generazione DOCX
- template report SurfaceScan360
- funzioni export
- sezioni già esistenti per Web Check, Shodan, Pentest Tools, tecnologie, porte, CVE

Integra il contenuto nel report esistente, non creare un secondo report.

## Struttura sezione report

### 1. Executive Summary
Titolo:

```text
HTTP Security Headers Posture
```

Contenuto:

```text
The HTTP Security Headers module evaluates browser-side hardening controls exposed by the public web applications in scope. The score reflects missing or weak headers that can increase exposure to downgrade attacks, clickjacking, MIME sniffing, information leakage and XSS/content injection scenarios.
```

KPI:

- Average score
- Grade distribution
- Assets with grade D/F
- High impact findings
- Top missing header

### 2. Asset summary table
Colonne:

- Asset
- Final URL
- HTTP Status
- HTTPS
- Score
- Grade
- High impact open
- Missing headers
- Weak headers

### 3. Detailed findings
Per ogni asset con finding non OK:

```text
Asset: https://example.com
Grade: C | Score: 72/100

Finding: Strict-Transport-Security missing
Severity: High
Risk: Browser will not be instructed to force HTTPS on future visits.
Recommendation: Add Strict-Transport-Security: max-age=31536000; includeSubDomains; preload on HTTPS responses.
Evidence: Header not present.
```

### 4. Remediation backlog
Genera una tabella ordinata per priorità:

1. severity high + missing
2. severity high + weak
3. medium + missing
4. medium + weak
5. low

Colonne:

- Priority
- Asset
- Header
- Issue
- Recommended fix
- Owner suggestion

Owner suggestion:

- HSTS, X-Frame-Options, CSP: Web/App team or reverse proxy/WAF owner
- Referrer-Policy, Permissions-Policy: Web/App team
- COOP/COEP/CORP: Web/App team, validate compatibility first

## Frasi standard remediation

### HSTS
`Configure Strict-Transport-Security on HTTPS responses with max-age=31536000; includeSubDomains; preload after validating all subdomains support HTTPS.`

### CSP
`Define a Content-Security-Policy with restrictive default-src/script-src, remove unsafe-inline/unsafe-eval where possible, and add object-src 'none', base-uri 'none', frame-ancestors 'self' or 'none'.`

### X-Content-Type-Options
`Configure X-Content-Type-Options: nosniff on all web responses.`

### Frame protection
`Prefer Content-Security-Policy frame-ancestors 'none' or 'self'. Alternatively configure X-Frame-Options: DENY or SAMEORIGIN.`

### Referrer-Policy
`Configure Referrer-Policy: strict-origin-when-cross-origin or no-referrer based on business requirements.`

### Permissions-Policy
`Disable unused browser features with Permissions-Policy, starting with camera=(), microphone=(), geolocation=(), payment=().`

## Acceptance criteria

- Report non mostra raw headers completi nella parte executive.
- Raw headers possono essere inseriti solo in appendice tecnica, se già esiste una sezione evidence.
- I finding sono raggruppati per asset e ordinati per severità.
- Il report mostra chiaramente che lo scanner non esegue exploit e non prova vulnerabilità applicative.
- Il report distingue `missing`, `weak`, `ok` e `error`.
