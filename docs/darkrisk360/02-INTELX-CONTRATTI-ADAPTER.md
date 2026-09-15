# 02 - Contratti IntelX e adapter

Questa specifica interna deriva dai manuali Intelligence X Search API v5, Leaks API v5 e Search Tips analizzati per il progetto. I PDF originali non sono committati.

## 1. Regole comuni

- chiamate esclusivamente server-side;
- API key nell'header `x-key`, mai in URL;
- `User-Agent` applicativo obbligatorio;
- massimo una richiesta al secondo per chiave;
- rispetto di `Retry-After`;
- retry solo per `429` e `5xx` con backoff e jitter;
- circuit breaker immediato per `401` e `402`, progressivo per failure provider;
- URL provider validato per origin esatta;
- nessun redirect o path puo' spostare la richiesta su un host diverso.

Implementazione: `supabase/functions/_shared/intelx-http-client.ts`.

## 2. Search API - Standard

Origin ammessa:

```text
https://2.intelx.io
```

Submit:

```http
POST /intelligent/search
```

```json
{
  "term": "azienda.it",
  "buckets": [],
  "lookuplevel": 0,
  "maxresults": 1000,
  "timeout": 0,
  "datefrom": "",
  "dateto": "",
  "sort": 2,
  "media": 0,
  "terminate": []
}
```

Polling:

```http
GET /intelligent/search/result?id={search_id}&limit=1000
```

| Stato | Significato | Azione |
|---:|---|---|
| `0` | risultati disponibili | acquisire e continuare |
| `1` | terminale | acquisire eventuali record finali e terminare |
| `2` | search ID non trovato | fallire il task |
| `3` | nessun risultato ancora | continuare il polling |

Se il submit restituisce `softselectorwarning=true`, il selector e' considerato non affidabile: il job viene terminato e il task fallisce con errore di contratto.

Terminazione best effort:

```http
GET /intelligent/search/terminate?id={search_id}
```

### Output Standard

L'adapter restituisce:

```text
selector
count
atLeast
```

Se un bucket raggiunge il limite, `atLeast=true` e la UI deve mostrare `Almeno N`, mai un totale esatto.

## 3. Leaks API - Esteso

Origin programmatica ammessa:

```text
https://3.intelx.io
```

`https://4.intelx.io` e' riservata alla UI Identity e viene rifiutata dalla validazione della configurazione.

### Ricerca righe

```http
GET /live/search/internal
  ?selector=azienda.it
  &limit=1000
  &bucket=leaks.private.general
  &skipinvalid=true
  &analyze=false
```

### Esportazione account/password

```http
GET /accounts/csv
  ?selector=azienda.it
  &limit=1000
  &bucket=leaks.private.general
```

Il percorso sincrono `/accounts/1` e' vietato perche' puo' perdere risultati.

### Polling condiviso

```http
GET /live/search/result?id={search_id}&format=1
```

| Stato | Significato | Azione |
|---:|---|---|
| `0` | risultati disponibili | acquisire e continuare |
| `1` | nessun risultato momentaneo | continuare |
| `2` | terminale | acquisire eventuali record finali e terminare |
| `3` | search ID non trovato | fallire il task |

Terminazione best effort:

```http
GET /live/search/terminate?id={search_id}
```

La risposta attesa dal provider e' `204`.

## 4. Filtro bucket obbligatorio

Il parametro inviato al provider non e' sufficiente. Ogni record viene ricontrollato lato applicazione:

```text
record.bucket == leaks.private.general
```

I record fuori bucket:

- non vengono persistiti;
- incrementano `dropped_out_of_bucket`;
- generano audit aggregato senza payload sensibile.

## 5. Limiti e deduplicazione

- limite massimo configurato: 1000;
- il limite viene applicato anche lato client;
- Search preferisce `systemid` per la fingerprint;
- Leaks usa una fingerprint SHA-256 deterministica del selector e del record normalizzato;
- un `Set` in-memory evita duplicati nella singola risposta;
- l'unicita' database evita duplicati tra retry e run concorrenti.

Implementazione:

- `intelx-record-fingerprint.ts`;
- `darkrisk_source_records` per il record canonico;
- `darkrisk_source_record_occurrences` per la presenza in ogni run.

## 6. Errori HTTP

| HTTP | Codice interno | Retry | Effetto circuit breaker |
|---:|---|---|---|
| `400` | `invalid_request` | No | reset |
| `401` | `not_authorized` | No | apertura immediata |
| `402` | `credits_exhausted` | No | apertura immediata |
| `404` | `not_found` | No | reset |
| `429` | `rate_limited` | Si' | rispetta `Retry-After` |
| `5xx` | `provider_unavailable` | Si' | apre dopo soglia |

I messaggi persistiti nei task non contengono la risposta raw del provider. `last_error_message` resta generico; `last_error_code` e' limitato e sanificato.

## 7. Selector

### Ammessi dal prodotto V2

- dominio bare, esempio `azienda.it`;
- IPv4 pubblico, per esempio `93.184.216.34`.

### Rifiutati

- `@azienda.it`;
- indirizzi email;
- URL;
- CIDR e range;
- selector vuoti o deboli;
- IPv6 nel frontend corrente.

L'adapter normalizza di nuovo il selector: la validazione UI non e' considerata un confine di sicurezza.

## 8. IP nella Leaks API

L'IP viene provato soltanto su `/live/search/internal`. Se il provider risponde `intelx_leaks_selector_invalid`, il worker puo' interrogare domini correlati da SurfaceScan360 solo quando:

- il dominio coincide con una root approvata; oppure
- e' un sottodominio di una root approvata.

Le occurrence risultanti hanno `match_type=correlated_from_ip`. `/accounts/csv` resta limitato ai domini.

## 9. Variabili runtime

```text
INTELX_SEARCH_API_KEY
INTELX_LEAKS_API_KEY
INTELX_API_KEY                 # fallback legacy opzionale
INTELX_USER_AGENT
```

Gli origin non sono configurabili liberamente in produzione: il client accetta solo quelli previsti dal servizio.

## 10. Test di contratto

La suite `supabase/functions/_shared/intelx-adapters.test.ts` verifica almeno:

- blocco di `4.intelx.io`;
- blocco di origin, path o credenziali URL non ammessi;
- header `x-key` e `User-Agent`;
- polling Search e Leaks;
- `softselectorwarning`;
- filtro `leaks.private.general`;
- limite client-side;
- assenza di `/accounts/1`;
- rate limiting, retry e circuit breaker;
- dedupe deterministico.

## 11. Checklist di modifica adapter

Prima di cambiare un adapter:

1. confrontare la modifica con il PDF API corrispondente;
2. non unificare i codici stato Search e Leaks: hanno semantiche diverse;
3. mantenere il filtro bucket lato client;
4. aggiungere un test che fallisce con `4.intelx.io` e `/accounts/1`;
5. verificare che errori e log non contengano selector sensibili o payload;
6. eseguire `npm run test:deno` e `npm run qa:no-secrets`.
