<!--
DarkRisk360 Codex Pack
Generated for HICONSOLE / HiSolution.
Target stack assumption: Lovable frontend, React/Vite, Supabase Postgres, Supabase Edge Functions.
Do not paste API keys, passwords, leaked credentials, tokens, cookies, raw dumps or secrets into this repository.
-->

# 05 - OpenAI Recommendation Engine

## Obiettivo

Usare `gpt-4o-mini` per generare testi consulenziali e raccomandazioni operative partendo da finding già normalizzati.

Il modello non deve scoprire finding. Il finding engine scopre finding. OpenAI spiega, prioritizza e trasforma i finding in raccomandazioni leggibili.

## Principi

1. Usare OpenAI solo lato backend.
2. Non inviare password, token, cookie, dump raw o segreti.
3. Usare Structured Outputs con JSON Schema.
4. Validare sempre l'output.
5. Salvare modello, prompt version e schema version.
6. Usare fallback deterministico se OpenAI non risponde.
7. Ogni raccomandazione deve essere collegata a finding ed evidence già persistenti.
8. Nessuna affermazione deve essere generata senza finding di supporto.

## Environment

```bash
OPENAI_API_KEY=
OPENAI_RECOMMENDATION_MODEL=gpt-4o-mini
OPENAI_RECOMMENDATION_PROMPT_VERSION=darkrisk360-reco-v1
OPENAI_RECOMMENDATION_SCHEMA_VERSION=1.0.0
```

## Input payload

Creare payload già bonificato.

```ts
export interface RecommendationInput {
  report_id?: string;
  customer: {
    id: string;
    display_name: string;
    industry?: string;
    tier: "standard" | "extended";
  };
  scan_run: {
    id: string;
    started_at: string;
    completed_at: string;
    sources: string[];
  };
  coverage: {
    domains_count: number;
    selectors_count: number;
    intelx_queries_count: number;
    surfacescan_assets_count: number;
    limitations: string[];
  };
  findings: Array<{
    id: string;
    finding_type: string;
    title: string;
    description: string;
    severity: "info" | "low" | "medium" | "high" | "critical";
    confidence: "low" | "medium" | "high";
    risk_score: number;
    risk_dimensions: Record<string, number>;
    affected_asset_masked?: string;
    affected_selector_masked?: string;
    evidence_summary: string[];
    first_seen_at: string;
    last_seen_at: string;
    compromise_type: "direct" | "indirect" | "potential" | "misconfiguration" | "unknown";
    remediation_status: string;
  }>;
  requested_sections: Array<"executive_summary" | "recommendations" | "technical_notes" | "limitations">;
}
```

## Dati vietati nel prompt

Non inviare mai:

- password in chiaro;
- cookie;
- token OAuth;
- session ID;
- dump raw;
- allegati IntelX completi;
- file read raw;
- carta di credito completa;
- IBAN completo;
- codice fiscale completo;
- dati sanitari;
- dati personali non necessari.

## Masking obbligatorio

Esempi:

```ts
maskEmail("mario.rossi@example.com") => "m***@example.com"
maskDomain("example.com") => "example.com"
maskPassword("Qwer1234") => "[PASSWORD_REDACTED]"
maskToken("abc123") => "[TOKEN_REDACTED]"
maskIp("192.0.2.44") => "192.0.2.44"
```

## Output JSON Schema

Creare schema stretto.

```json
{
  "name": "darkrisk360_recommendations",
  "schema": {
    "type": "object",
    "additionalProperties": false,
    "required": ["summary", "recommendations", "limitations", "confidence_note"],
    "properties": {
      "summary": {
        "type": "object",
        "additionalProperties": false,
        "required": ["risk_level", "executive_text", "top_drivers", "coverage_note"],
        "properties": {
          "risk_level": {
            "type": "string",
            "enum": ["low", "medium", "high", "critical"]
          },
          "executive_text": {
            "type": "string"
          },
          "top_drivers": {
            "type": "array",
            "items": { "type": "string" },
            "maxItems": 5
          },
          "coverage_note": {
            "type": "string"
          }
        }
      },
      "recommendations": {
        "type": "array",
        "maxItems": 20,
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": ["finding_id", "title", "priority", "why_it_matters", "actions", "expected_outcome", "confidence"],
          "properties": {
            "finding_id": { "type": "string" },
            "title": { "type": "string" },
            "priority": {
              "type": "string",
              "enum": ["immediate", "short_term", "mid_term", "long_term"]
            },
            "why_it_matters": { "type": "string" },
            "actions": {
              "type": "array",
              "items": { "type": "string" },
              "minItems": 1,
              "maxItems": 8
            },
            "expected_outcome": { "type": "string" },
            "confidence": {
              "type": "string",
              "enum": ["low", "medium", "high"]
            }
          }
        }
      },
      "limitations": {
        "type": "array",
        "items": { "type": "string" }
      },
      "confidence_note": {
        "type": "string"
      }
    }
  }
}
```

## System prompt

Usare un prompt simile:

```text
Sei un consulente senior di Cyber Threat Intelligence per HiSolution.
Devi generare raccomandazioni per il modulo DarkRisk360.
Usa solo i finding forniti nel JSON.
Non inventare evidenze.
Non citare password, token, cookie o segreti.
Non dichiarare breach diretto se il campo compromise_type non è direct.
Se l'evidenza è indiretta o di terza parte, esplicitalo.
Scrivi in italiano professionale, chiaro, adatto a CIO, CISO e IT Manager.
Prioritizza remediation concrete e verificabili.
Restituisci solo JSON valido conforme allo schema.
```

## User prompt

```text
Genera executive summary e raccomandazioni operative per questo scan DarkRisk360.
Rispetta il tier indicato.
Per tier standard mantieni sintesi e nessun dettaglio raw.
Per tier extended includi più contesto tecnico, ma senza segreti.
Input JSON:
{{sanitized_payload}}
```

## Service design

Creare servizio backend:

```ts
export async function generateDarkRiskRecommendations(input: RecommendationInput): Promise<RecommendationOutput> {
  const sanitized = sanitizeRecommendationInput(input);
  validateNoSecrets(sanitized);

  const response = await openai.responses.create({
    model: process.env.OPENAI_RECOMMENDATION_MODEL ?? "gpt-4o-mini",
    input: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(sanitized) }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "darkrisk360_recommendations",
        schema: DARKRISK_RECOMMENDATION_SCHEMA,
        strict: true
      }
    }
  });

  const parsed = parseAndValidate(response);
  return parsed;
}
```

Adattare alla versione SDK presente nel repository.

## Fallback deterministic

Se OpenAI fallisce:

- generare raccomandazioni da template;
- loggare errore senza payload sensibile;
- mostrare label `AI unavailable, deterministic recommendation used`.

Esempi template:

| Finding type | Azione |
|---|---|
| `credential_leak_confirmed` | Reset password, revoca sessioni, MFA, audit accessi |
| `dmarc_missing` | Pubblicare DMARC p=none con reporting, poi quarantine/reject |
| `dmarc_monitor_only` | Passare gradualmente a quarantine e reject |
| `ftp_exposed` | Chiudere FTP o limitare con allowlist/VPN, preferire SFTP |
| `ssh_exposed` | Limitare a VPN/bastion, key-only, no password login |
| `tls_certificate_mismatch` | Correggere certificato SAN/SNI e validare redirect HTTPS |
| `stealer_log_identity` | Verificare account, reset, revoca token, awareness endpoint partner |

## Storage output

Salvare in `darkrisk_recommendations`:

- `finding_id`
- `title`
- `priority`
- `why_it_matters`
- `actions`
- `expected_outcome`
- `confidence`
- `model`
- `prompt_version`
- `output_schema_version`
- `grounded_on_evidence_ids`
- `metadata`

## Quality gates

Prima di salvare output:

- validare JSON;
- verificare che ogni `finding_id` esista;
- verificare che nessuna action contenga segreti;
- verificare che il modello non abbia introdotto finding non presenti;
- limitare lunghezza testi;
- salvare `model_metadata`.

## Acceptance criteria

- OpenAI viene chiamata solo server-side.
- Il prompt non contiene raw credentials.
- L'output rispetta JSON Schema.
- Ogni recommendation è legata a finding.
- Esiste fallback deterministic.
- I test includono casi con finding diretto, indiretto e misconfigurazione.
