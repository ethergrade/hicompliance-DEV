# 07 - API, frontend e report

## 1. Contratto API Laravel

Il frontend V2 considera Laravel l'unica API applicativa.

| Metodo | Endpoint | Scopo |
|---|---|---|
| `GET` | `/companies/{id}/external-scope` | leggere scope |
| `PUT` | `/companies/{id}/external-scope` | replace transazionale scope |
| `POST` | `/companies/{id}/darkrisk/runs` | accodare Standard |
| `POST` | `/companies/{id}/darkrisk-esteso/runs` | accodare Esteso |
| `GET` | `/companies/{id}/darkrisk/runs/{runId}` | stato run |
| `GET` | `/companies/{id}/darkrisk/overview` | overview count-only |
| `GET` | `/companies/{id}/darkrisk-esteso/runs/{runId}/results` | risultati Esteso |
| `GET` | `/companies/{id}/darkrisk/reports` | lista report per mode |

Le POST di avvio restituiscono `202`:

```json
{
  "run_id": "uuid",
  "status": "queued"
}
```

Il backend genera o inoltra una `Idempotency-Key` stabile per doppio click e retry.

## 2. Payload scope

```json
{
  "targets": [
    { "type": "domain", "value": "azienda.it" },
    { "type": "ip", "value": "93.184.216.34" }
  ]
}
```

Il backend deve:

- normalizzare di nuovo;
- rifiutare `@`, URL, email, CIDR, range e IP non pubblici;
- deduplicare;
- imporre massimo quattro target;
- sostituire lo scope in una transazione logica;
- aggiornare soltanto le righe SurfaceScan con provenienza DarkRisk V2.

## 3. Overview Standard

Shape accettata dal parser frontend:

```json
{
  "total_leaks": 120,
  "is_minimum": true,
  "new_leaks": 4,
  "risk_score": 62,
  "risk_level": "Medio",
  "last_scan_at": "2026-06-29T00:00:00Z",
  "monitored_targets": 2,
  "historical_weeks": [
    { "period": "2026-W26", "total": 120, "new_leaks": 4 }
  ]
}
```

Il parser supporta alias legacy, ma il contratto nuovo deve preferire questi nomi. Nessun array di record o password deve essere incluso.

## 4. Risultati Esteso

Shape applicativa:

```json
{
  "run": {
    "run_id": "uuid",
    "status": "completed"
  },
  "records": [
    {
      "id": "opaque-id",
      "selector": "azienda.it",
      "user": "account@example",
      "password": "value-revealed-after-authorization",
      "passwordtype": "cleartext",
      "bucket": "leaks.private.general",
      "date": "2025-01-01",
      "sourceshort": "source",
      "sourcelong": "source detail",
      "match_type": "direct"
    }
  ]
}
```

Requisiti:

- bucket diverso viene scartato anche dal parser;
- record solo della run richiesta;
- decrypt esclusivamente dopo autorizzazione;
- `Cache-Control: no-store`;
- audit di visualizzazione;
- nessuna cache persistente.

## 5. Gateway frontend

File: `src/features/darkrisk/api/darkRiskGateway.ts`.

Comportamento:

- prova il contratto Laravel V2;
- fallback legacy soltanto con flag V2 disabilitato oppure risposta `404`, `405`, `501`;
- errori auth, validation e server non vengono nascosti dal fallback;
- parser di confine convertono shape Laravel/legacy in contratti stabili.

Nota: `getStandardOverview` usa direttamente l'API Laravel e non ha fallback legacy nel gateway V2. La pagina Standard richiede quindi il relativo controller.

## 6. Struttura frontend

```text
src/features/darkrisk/
  api/
    darkRiskGateway.ts
    queryKeys.ts
  domain/
    contracts.ts
    schemas.ts
    scope.ts
  shared/
    ReportList.tsx
    ScopeEditor.tsx
    useDarkRiskEntitlements.ts
  standard/
    StandardDarkRiskPage.tsx
  extended/
    ExtendedDarkRiskPage.tsx
```

Route:

```text
/dark-risk
/dark-risk-esteso
```

Entrambe sono protette da `ClientSelectionGuard`.

## 7. UI Standard

Mostra:

- totale leak con prefisso `Almeno` quando il limite e' raggiunto;
- nuovi leak nel periodo;
- indice e livello di rischio;
- numero target;
- scope condiviso;
- schedulazione;
- trend settimanale;
- report mensili.

Non mostra record, account, password o dettagli bucket.

## 8. UI Esteso

Mostra:

- avviso dati altamente sensibili;
- scope condiviso;
- pulsante run spot solo per admin/superadmin;
- stato run attiva;
- selector, account, password, fonte, data e tipo match;
- conteggio record fuori bucket scartati;
- report per run.

La query risultati usa:

```text
staleTime: 0
gcTime: 0
poll ogni 5 secondi solo mentre queued/running
```

## 9. Entitlement frontend

`useDarkRiskEntitlements` deriva:

- Standard da HiCompliance attivo, servizio DarkRisk attivo o Esteso;
- Esteso da settings del servizio DarkRisk e `VITE_DARKRISK_EXTENDED_UI_V2`.

Questa derivazione controlla la UX. L'autorizzazione reale resta server-side.

## 10. Report

### Standard

- uno per `(organization, YYYY-MM)`;
- dati del mese precedente;
- solo conteggi, trend, rischio e remediation aggregate;
- nessun payload Identity.

### Esteso

- uno per `scan_run_id`;
- contiene esclusivamente le occurrence della run;
- cifrato a riposo;
- download con URL firmato breve;
- view/download auditati;
- eliminato a fine contratto.

## 11. Projector mancanti in questo repository

L'orchestratore crea task `standard_monthly_report` ed `extended_run_report`. Il worker provider non li claima. Il backend Laravel/report worker deve:

1. claimare task provider `report`;
2. costruire snapshot deterministico;
3. generare artefatti;
4. salvarli nei bucket privati;
5. completare task e run;
6. rispettare gli indici unique V2;
7. non includere record di run diverse.

## 12. Test browser minimi

- Standard senza dati: empty state leggibile;
- `at_least=true`: testo `Almeno N`;
- quattro target: nessun quinto target aggiungibile;
- dominio con `@`: errore;
- customer/sales: nessun avvio Esteso;
- admin: run spot e polling;
- risultato fuori bucket: non renderizzato;
- cambio cliente: nessun dato del tenant precedente;
- uscita da Esteso: nessuna password nella cache/query devtools persistente;
- report: link scaduto e accesso cross-tenant negato.

