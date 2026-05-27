<!--
DarkRisk360 Codex Pack
Generated for HICONSOLE / HiSolution.
Target stack assumption: Lovable frontend, React/Vite, Supabase Postgres, Supabase Edge Functions.
Do not paste API keys, passwords, leaked credentials, tokens, cookies, raw dumps or secrets into this repository.
-->

# 04 - Finding Taxonomy and Scoring

## Obiettivo

Definire tassonomia, scoring, deduplica, confidenza e stato dei finding DarkRisk360.

Il finding engine deve trasformare evidenze normalizzate in problemi operativi comprensibili e prioritizzabili.

## Principi

1. Un'evidenza non è sempre un finding.
2. Un finding può derivare da più evidenze.
3. Un finding deve avere severità, confidenza e stato.
4. La parola "compromissione" va usata solo se supportata.
5. Lo score deve essere spiegabile.
6. La ricorrenza cross-dataset aumenta il rischio.
7. La presenza di raw leak non va mostrata al cliente senza mascheramento.
8. Le misconfigurazioni SurfaceScan360 e i leak IntelX devono contribuire a dimensioni diverse dello score.

## Classi finding

### Identity exposure

| Finding type | Descrizione | Default severity |
|---|---|---|
| `credential_leak_confirmed` | Credenziale aziendale rilevata con pattern user/password o evidenza equivalente | critical |
| `credential_leak_possible` | Dominio o email presente in collection, ma credenziale non visibile in preview | high |
| `email_exposure` | Email aziendale esposta in lista, paste, web o dataset | medium |
| `stealer_log_identity` | Email, autofill, cookie o browser artifact in contesto stealer | high |
| `third_party_endpoint_exposure` | Email aziendale trovata in dump di endpoint terzo | medium |
| `credential_reuse_pattern` | Stessa identità o password pattern ricorre in più dataset | critical |
| `sensitive_personal_data_exposure` | Dati personali o autofill sensibili collegati a email aziendale | critical |

### Domain and brand risk

| Finding type | Descrizione | Default severity |
|---|---|---|
| `domain_in_leak_dataset` | Dominio citato in dataset leak o collection | medium |
| `cross_domain_leakage` | Evidenze su domini collaterali o affiliati | high |
| `brand_phishing_indicator` | Evidenza di phishing o impersonation | high |
| `suspicious_lookalike_domain` | Dominio typosquatting o lookalike | high |
| `darknet_reference` | Riferimento in bucket darknet | high |

### Surface exposure

| Finding type | Descrizione | Default severity |
|---|---|---|
| `public_admin_service` | Porta o servizio admin esposto | high |
| `ftp_exposed` | FTP o FTPS esposto pubblicamente | high |
| `ssh_exposed` | SSH esposto pubblicamente | medium |
| `unknown_service_exposed` | Porta non documentata o servizio non classificato | high |
| `default_web_page` | Pagina default server o vhost misconfigurato | medium |
| `outdated_service_version` | Banner o tecnologia obsoleta | high |
| `cve_candidate` | Possibile CVE associata a versione rilevata | high |
| `cohosted_blast_radius` | Più domini sullo stesso host/IP | medium |

### Email security

| Finding type | Descrizione | Default severity |
|---|---|---|
| `dmarc_missing` | Nessun record DMARC | high |
| `dmarc_monitor_only` | DMARC presente con `p=none` | high |
| `spf_too_complex` | SPF con rischio lookup eccessivi o include non governati | medium |
| `dkim_not_verified` | DKIM non verificato o assente | medium |
| `mta_sts_missing` | MTA-STS assente | low |
| `smtp_open_relay_suspected` | Open relay sospetto da validare | critical |
| `smtp_banner_mismatch` | rDNS/banner mismatch | medium |

### DNS, WHOIS and TLS

| Finding type | Descrizione | Default severity |
|---|---|---|
| `dnssec_unsigned` | Zona non firmata DNSSEC | low |
| `domain_expiring_soon` | Dominio in scadenza entro soglia | high |
| `registrar_lock_missing` | Lock trasferimento assente | high |
| `tls_certificate_mismatch` | Certificato non coerente con host | high |
| `tls_expiring_soon` | Certificato in scadenza | high |
| `tls_weak_configuration` | Cipher, protocollo o policy deboli | medium |
| `certificate_ca_true_anomaly` | Certificato server con Basic Constraints anomalo | medium |

### Reputation

| Finding type | Descrizione | Default severity |
|---|---|---|
| `domain_blacklisted` | Dominio in blacklist | critical |
| `ip_blacklisted` | IP in blacklist | high |
| `smtp_reputation_issue` | Problema reputazionale email | high |
| `malware_reputation_indicator` | Indicatori malware su dominio/IP | critical |

## Risk dimensions

Ogni finding deve popolare cinque dimensioni:

```json
{
  "surface_posture": 0,
  "identity_exposure": 0,
  "email_trust": 0,
  "evidence_confidence": 0,
  "freshness_trend": 0
}
```

Range per dimensione: `0-100`.

### surface_posture

Contribuiscono:

- porte esposte;
- servizi admin;
- CVE candidate;
- TLS mismatch;
- co-hosting;
- default page;
- tecnologia obsoleta.

### identity_exposure

Contribuiscono:

- credential leak;
- email exposure;
- stealer log;
- credential reuse;
- dati personali.

### email_trust

Contribuiscono:

- DMARC;
- SPF;
- DKIM;
- MTA-STS;
- MX;
- SMTP relay;
- spoofing risk.

### evidence_confidence

Contribuiscono:

- sorgente;
- xscore;
- preview presente;
- ricorrenza;
- presenza di dati strutturati;
- validazione analyst.

### freshness_trend

Contribuiscono:

- data più recente;
- nuovo rispetto alla scansione precedente;
- aumento occorrenze;
- ricomparsa dopo resolved;
- ricorrenza su dataset recenti.

## Formula base

Implementare una funzione spiegabile:

```ts
type Severity = "info" | "low" | "medium" | "high" | "critical";

const severityBase: Record<Severity, number> = {
  info: 5,
  low: 20,
  medium: 45,
  high: 70,
  critical: 90,
};

export function calculateFindingRiskScore(input: {
  severity: Severity;
  confidence: "low" | "medium" | "high";
  freshnessDays: number | null;
  recurrenceCount: number;
  affectedAssetCriticality: "low" | "medium" | "high";
  isDirectCompromise: boolean;
  isThirdPartyOnly: boolean;
}): number {
  let score = severityBase[input.severity];

  if (input.confidence === "high") score += 5;
  if (input.confidence === "low") score -= 10;

  if (input.freshnessDays !== null) {
    if (input.freshnessDays <= 7) score += 10;
    else if (input.freshnessDays <= 30) score += 6;
    else if (input.freshnessDays <= 180) score += 2;
    else score -= 5;
  }

  if (input.recurrenceCount >= 10) score += 10;
  else if (input.recurrenceCount >= 3) score += 5;

  if (input.affectedAssetCriticality === "high") score += 5;
  if (input.affectedAssetCriticality === "low") score -= 5;

  if (input.isDirectCompromise) score += 10;
  if (input.isThirdPartyOnly) score -= 5;

  return Math.max(0, Math.min(100, Math.round(score)));
}
```

## Severity mapping

| Score | Severity |
|---|---|
| 0-19 | info |
| 20-39 | low |
| 40-59 | medium |
| 60-79 | high |
| 80-100 | critical |

## Deduplica

### IntelX

Usare:

- `systemid` come chiave primaria record;
- `storageid` per contenuto;
- `simhash` per similarità;
- `selector_id`;
- `bucket`;
- `date`;
- `added`.

Regole:

1. Stesso `systemid` per stesso cliente non deve creare record duplicato nello stesso scan.
2. Stesso `simhash` e stessa classe evidenza può contribuire a ricorrenza.
3. Stessa email mascherata in più dataset può creare un solo finding aggregato con `recurrence_count`.
4. Stessa credenziale non deve essere mostrata più volte al cliente.
5. Cross-domain leakage deve aggregare domini collegati.

### SurfaceScan360

Usare:

- asset;
- categoria;
- porta;
- protocollo;
- fingerprint;
- CVE;
- record DNS;
- timestamp.

Regole:

- stessa porta aperta già nota aggiorna `last_seen_at`;
- nuova porta genera alert;
- porta chiusa può risolvere finding se confermata da scansioni successive;
- DMARC/SPF/TLS sono finding persistenti finché non risolti.

## Confidenza

| Livello | Criterio |
|---|---|
| low | evidenza indiretta, preview assente, sorgente generica |
| medium | evidenza coerente ma non validata manualmente |
| high | preview coerente, ricorrenza, validazione analyst o sorgente forte |

## Direct vs indirect

Aggiungere metadati:

```json
{
  "compromise_type": "direct|indirect|potential|misconfiguration|unknown",
  "third_party_involved": true,
  "requires_validation": true
}
```

Esempi:

- email in stealer log di endpoint partner: `indirect`
- password aziendale in leak: `potential` o `direct` solo se account confermato
- FTP esposto: `misconfiguration`
- DMARC p=none: `misconfiguration`

## Alert generation

Generare alert quando:

- finding critical nuovo;
- finding high nuovo;
- nuovo credential leak;
- nuovo stealer log;
- nuova porta esposta high;
- peggioramento risk score di almeno 15 punti;
- asset critico entra in stato high/critical;
- report generation fallisce;
- API IntelX esaurisce crediti.

## Acceptance criteria

- Ogni finding ha motivazione e sorgente.
- Lo score è riproducibile.
- Le ricorrenze non gonfiano i conteggi in modo artificiale.
- Le evidenze di terze parti sono distinte da breach diretto.
- La dashboard può filtrare per tipo, severità, confidenza, asset, sorgente e stato.
- Le raccomandazioni si collegano ai finding, non alle evidenze raw.
