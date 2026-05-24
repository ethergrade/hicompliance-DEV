<!--
DarkRisk360 Codex Pack
Generated for HICONSOLE / HiSolution.
Target stack assumption: Lovable frontend, React/Vite, Supabase Postgres, Supabase Edge Functions.
Do not paste API keys, passwords, leaked credentials, tokens, cookies, raw dumps or secrets into this repository.
-->

# 10 - Test Plan and QA

## Obiettivo

Definire test automatici e controlli QA per DarkRisk360.

## Test strategy

Copertura minima:

- unit test;
- integration test;
- API mock test;
- RLS/security test;
- UI smoke test;
- report snapshot test;
- no-secret regression test.

## Unit test

### Selector validation

Testare:

- email valida;
- dominio valido;
- wildcard domain valido;
- URL valido;
- IPv4;
- IPv6;
- CIDR;
- generic term non valido;
- stringa marketing non valida;
- phone number;
- UUID;
- storage ID;
- system ID.

### Masking

Testare:

- email;
- password;
- token;
- cookie;
- credit card;
- IBAN;
- preview con pattern user:password;
- prompt OpenAI senza segreti.

### Scoring

Testare:

- critical credential leak;
- high stealer log;
- medium third party exposure;
- FTP exposed;
- DMARC missing;
- TLS mismatch;
- risk score bounds 0-100;
- severity mapping.

### Deduplica

Testare:

- stesso systemid;
- stesso simhash;
- stessa email in più dataset;
- stessa porta in due scansioni;
- finding risolto se porta chiusa in scan successive.

## Integration test

### IntelX client mock

Mock endpoint:

- `/intelligent/search`;
- `/intelligent/search/result`;
- `/intelligent/search/terminate`;
- `/file/preview`;
- `/phonebook/search`;
- `/phonebook/search/result`.

Casi:

- successo con status 0 e poi 1;
- status 3 keep trying;
- 401 unauthorized;
- 402 payment required;
- 404 item not found;
- timeout;
- softselectorwarning true;
- preview unavailable.

### SurfaceScan360 fixture

Creare fixture synthetic:

- dominio con DMARC p=none;
- dominio senza DMARC;
- FTP 21 aperto;
- SSH 22 aperto;
- HTTPS con certificate mismatch;
- pagina default Apache;
- porta 8080 aperta;
- DNSSEC unsigned;
- dominio in scadenza.

## Security test

### RLS

Verificare:

- customer A non legge customer B;
- customer non legge raw evidence;
- analyst legge solo clienti assegnati;
- admin legge tutto;
- service role scrive.

### No secret in frontend

Automated check:

- bundle non contiene `INTELX_API_KEY`;
- bundle non contiene `OPENAI_API_KEY`;
- bundle non contiene `SUPABASE_SERVICE_ROLE_KEY`;
- nessuna env server-only importata in componenti React.

### Logs

Testare log redaction:

- API key;
- password;
- token;
- cookie;
- raw preview.

## OpenAI tests

### Schema validation

- output valido;
- output con finding_id inesistente rifiutato;
- output con recommendation senza action rifiutato;
- output con testo troppo lungo rifiutato.

### Grounding

- se finding non contiene breach diretto, recommendation non deve dire "breach confermato";
- se evidence è terza parte, testo deve dire "compromissione indiretta" o equivalente;
- se input è vuoto, output deve indicare evidence insufficiente o nessuna raccomandazione critica.

### Fallback

- OpenAI timeout;
- errore 401;
- errore 429;
- invalid JSON;
- schema mismatch.

## UI tests

Smoke test:

- overview carica;
- KPI mostrano valori;
- empty state funziona;
- tier Standard nasconde evidence raw;
- tier Estesa mostra tab evidence vault per analyst;
- customer non vede reveal;
- report list carica;
- nuova scansione crea scan run.

## Report tests

Snapshot test:

- report Standard contiene sezioni previste;
- report Estesa contiene appendici;
- report non contiene `[PASSWORD_RAW]`;
- report non contiene token/cookie;
- report contiene classification;
- report contiene scan_run_id;
- report contiene generated_at;
- report è riproducibile.

## Synthetic fixture

Creare un cliente fittizio:

```json
{
  "customer": "Cliente Demo DarkRisk360",
  "domains": ["example.com", "example.net"],
  "ips": ["192.0.2.10"],
  "findings": [
    "dmarc_monitor_only",
    "ftp_exposed",
    "tls_certificate_mismatch",
    "credential_leak_possible",
    "stealer_log_identity"
  ]
}
```

Non usare credenziali reali nei test.

## Manual QA checklist

Prima del rilascio:

- [ ] API key non visibile in frontend
- [ ] scan run manuale completato
- [ ] dashboard aggiornata
- [ ] finding generati
- [ ] alert recenti generati
- [ ] report generato
- [ ] customer vede solo dati mascherati
- [ ] analyst reveal auditato
- [ ] OpenAI prompt sanitizzato
- [ ] RLS verificata
- [ ] 401 IntelX gestito
- [ ] 402 IntelX gestito
- [ ] empty state pulito
- [ ] tier Standard ed Estesa verificati

## Performance

Target iniziali:

- overview load sotto 2 secondi con dati già aggregati;
- findings table paginata;
- scan IntelX asincrona;
- nessuna query pesante lato frontend;
- aggregazioni salvate o indicizzate.

## Acceptance criteria

- Test suite eseguibile.
- Fixture senza dati reali.
- Nessun dato sensibile nei test.
- Security test inclusi.
- Report test impedisce leak di password.
- QA checklist completata.
