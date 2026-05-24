<!--
DarkRisk360 Codex Pack
Generated for HICONSOLE / HiSolution.
Target stack assumption: Lovable frontend, React/Vite, Supabase Postgres, Supabase Edge Functions.
Do not paste API keys, passwords, leaked credentials, tokens, cookies, raw dumps or secrets into this repository.
-->

# 06 - Report Schema and Generation

## Obiettivo

Generare report DarkRisk360 coerenti con la struttura del report DTI esteso esistente, ma alimentati da dati normalizzati.

Il report deve essere prodotto da `ReportSnapshot`, non da chiamate live ai provider.

## Tipologie report

### Standard

Report sintetico per cliente.

Sezioni:

1. Frontespizio
2. Executive summary
3. Perimetro monitorato
4. Copertura controlli
5. KPI rischio
6. Finding principali
7. Evidenze mascherate
8. Raccomandazioni operative
9. Limitazioni e note
10. Appendice asset

### Estesa

Report completo DTI.

Sezioni:

1. Frontespizio
2. Classificazione documento
3. Accordo di servizio e scope
4. OSINT e CLOSINT
5. Standard HiSolution
6. Perimetro concordato
7. Domini collaterali e asset osservabili
8. DNS, WHOIS/RDAP e domain health
9. Email security
10. Provider, hosting e blast radius
11. Porte, servizi, TLS e tecnologie
12. CVE e posture SurfaceScan360
13. Contesto Domain Threat Intelligence
14. Intelligence X results per data source
15. Intelligence X results per file type
16. Identity exposure e credential risk
17. Stealer log e compromissioni indirette
18. Risk assessment
19. Raccomandazioni operative
20. Appendici tecniche
21. Glossario
22. Limitazioni

## Classificazione

Supportare:

- `Pubblico`
- `Privato`
- `Confidenziale`

Default: `Confidenziale`.

Nel report scrivere sempre:

```text
Il presente documento contiene informazioni riservate. Non distribuire a soggetti non autorizzati. Le evidenze sensibili sono mascherate salvo diversa autorizzazione.
```

## Report JSON

Creare una struttura persistente:

```ts
export interface DarkRiskReportJson {
  report_id: string;
  customer_id: string;
  tier: "standard" | "extended";
  classification: "public" | "private" | "confidential";
  generated_at: string;
  generated_by: string;
  scan_run_id: string;
  document_metadata: {
    product_name: string;
    document_type: string;
    status: string;
    version: string;
    owner: string;
    reviewed_by?: string[];
    customer_name: string;
  };
  scope: {
    authorized_assets: string[];
    excluded_assets: string[];
    discovered_candidate_assets: string[];
    limitations: string[];
  };
  executive_summary: {
    risk_level: "low" | "medium" | "high" | "critical";
    risk_score: number;
    text: string;
    top_drivers: string[];
  };
  coverage: {
    surfacescan360: Record<string, unknown>;
    intelx: Record<string, unknown>;
    openai: Record<string, unknown>;
  };
  findings: ReportFinding[];
  recommendations: ReportRecommendation[];
  statistics: {
    by_source: Array<{ source: string; count: number; percentage: number }>;
    by_file_type: Array<{ file_type: string; count: number; percentage: number }>;
    by_severity: Array<{ severity: string; count: number }>;
    by_finding_type: Array<{ finding_type: string; count: number }>;
  };
  appendices: Record<string, unknown>;
}
```

## ReportFinding

```ts
export interface ReportFinding {
  id: string;
  title: string;
  type: string;
  severity: string;
  confidence: string;
  risk_score: number;
  affected_asset: string;
  affected_selector_masked?: string;
  first_seen_at: string;
  last_seen_at: string;
  source_names: string[];
  evidence_summary: string[];
  interpretation: string;
  status: string;
}
```

## ReportRecommendation

```ts
export interface ReportRecommendation {
  finding_id: string;
  priority: "immediate" | "short_term" | "mid_term" | "long_term";
  title: string;
  why_it_matters: string;
  actions: string[];
  expected_outcome: string;
}
```

## Mapping sezioni dal report attuale

Il report esistente contiene sezioni importanti che vanno trasformate in componenti generabili:

| Sezione report esistente | Nuova sorgente dati |
|---|---|
| Perimetro concordato | `darkrisk_assets`, `darkrisk_selectors` |
| Inventario asset osservabili | SurfaceScan360 records |
| DNS, WHOIS/RDAP | SurfaceScan360 records |
| Criticità SPF/DMARC/MX | Finding engine email security |
| Reputation score | SurfaceScan360 + scoring |
| Porte aperte | SurfaceScan360 port records |
| TLS observations | SurfaceScan360 TLS records |
| DTI sintesi evidenze | IntelX source records + findings |
| Results per data source | IntelX bucket aggregation |
| Results per file type | IntelX media/type aggregation |
| Password in chiaro | Non mostrare in chiaro, usare mascheramento |
| Stealer log | Finding `stealer_log_identity` |
| Raccomandazioni | OpenAI + fallback deterministic |

## Mascheramento report

### Standard

- email: mascherata;
- password: sempre `[REDACTED]`;
- token/cookie: sempre `[REDACTED]`;
- raw preview: non inclusa;
- systemid: non mostrato;
- storageid: non mostrato.

### Estesa

- email: visibile solo se policy lo consente;
- password: mai in chiaro nel report cliente;
- token/cookie: mai in chiaro;
- systemid: visibile in appendice analyst;
- storageid: visibile solo in evidence vault, non nel PDF cliente;
- preview: estratto breve e sanitizzato.

## Template executive summary

```markdown
## Executive Summary

L'analisi DarkRisk360 sul perimetro autorizzato del cliente {{customer_name}} ha evidenziato un livello di rischio complessivo {{risk_level}}.

I principali driver di rischio sono:

{{top_drivers}}

La valutazione combina:
- postura infrastrutturale rilevata da SurfaceScan360;
- esposizioni identity e leak rilevate tramite Intelligence X;
- configurazione DNS ed email security;
- freshness e ricorrenza delle evidenze;
- confidenza associata ai finding.

Le raccomandazioni operative sono ordinate per priorità e collegate ai finding rilevati.
```

## Template finding

```markdown
### {{finding.title}}

| Campo | Valore |
|---|---|
| Severità | {{finding.severity}} |
| Confidenza | {{finding.confidence}} |
| Risk score | {{finding.risk_score}} |
| Asset impattato | {{finding.affected_asset}} |
| Prima rilevazione | {{finding.first_seen_at}} |
| Ultima rilevazione | {{finding.last_seen_at}} |
| Stato | {{finding.status}} |

**Interpretazione**

{{finding.interpretation}}

**Evidenze**

{{finding.evidence_summary}}

**Azioni consigliate**

{{recommendation.actions}}
```

## Generazione HTML/PDF

Implementare pipeline:

```text
report_json
  -> renderer markdown/html
  -> HTML sanitizzato
  -> PDF
  -> Supabase Storage
  -> darkrisk_report_snapshots
```

Opzioni tecniche:

- HTML server-side e browser print se ambiente lo supporta;
- servizio serverless con Playwright se disponibile;
- libreria PDF già presente nel repository;
- generazione solo HTML in MVP e PDF in fase successiva.

## Storage

Bucket suggeriti:

```text
darkrisk-reports
darkrisk-evidence-private
```

Policy:

- `darkrisk-reports`: accesso firmato, scadenza link.
- `darkrisk-evidence-private`: solo service role e analyst autorizzati.

## Report versioning

Ogni report deve salvare:

- `report_schema_version`;
- `prompt_version`;
- `model`;
- `scan_run_id`;
- `finding_ids`;
- `recommendation_ids`;
- `generated_at`.

Il report non deve cambiare se i finding successivamente cambiano stato.

## Acceptance criteria

- Report generato da snapshot dati.
- Nessun segreto in chiaro nel report.
- Standard ed Estesa usano stesso schema.
- Estesa ha sezioni aggiuntive.
- Report scaricabile e tracciato.
- Ogni sezione è riproducibile.
- Le raccomandazioni AI sono grounded sui finding.
