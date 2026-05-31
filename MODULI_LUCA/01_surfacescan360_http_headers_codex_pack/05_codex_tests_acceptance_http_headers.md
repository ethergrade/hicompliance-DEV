# Codex - Test e Acceptance Criteria HTTP Headers Scanner

## Obiettivo
Garantire che lo scanner HTTP Headers funzioni in modo affidabile, testabile e sicuro dentro SurfaceScan360.

## Unit test funzioni pure
Testare `evaluateHeaders()` senza rete.

### Casi minimi

1. Tutti header corretti -> grade A
2. HSTS mancante -> finding high missing
3. HSTS `max-age=0` -> weak
4. X-Content-Type-Options diverso da `nosniff` -> weak
5. CSP mancante -> high missing
6. CSP con `unsafe-inline` -> weak
7. X-Frame-Options mancante ma CSP `frame-ancestors 'none'` presente -> ok
8. Referrer-Policy `unsafe-url` -> weak
9. Permissions-Policy presente ma non restrittiva -> weak
10. Nessun header -> grade F

## Integration test Edge Function
Con Supabase local o ambiente dev:

1. Crea scan job test.
2. Crea asset URL test in scope.
3. Invoca `surface-http-headers-scan`.
4. Verifica insert in `surface_http_header_results`.
5. Verifica insert di N findings in `surface_http_header_findings`.
6. Verifica che un asset fuori perimetro venga rifiutato.
7. Verifica che un timeout salvi errore senza bloccare gli altri asset.

## Test manuale target
Usare solo target autorizzati o domini pubblici di test.

Suggeriti:

- `https://example.com`
- un dominio interno/staging autorizzato
- un endpoint app reale cliente solo se nel perimetro SurfaceScan360

## Sicurezza

- Verificare blocco URL:
  - `http://localhost`
  - `http://127.0.0.1`
  - `http://10.0.0.1`
  - `http://192.168.1.1`
  - `http://169.254.169.254`
- Verificare che il browser non faccia fetch diretto verso asset cliente.
- Verificare che Edge Function accetti solo POST.
- Verificare che RLS impedisca accesso cross-project.

## Performance

- Batch da 10 asset completato senza superare timeout funzione.
- Concorrenza massima consigliata: 3.
- Ogni target timeout 10 secondi.

## Acceptance finale

- `npm run build` passa.
- `npm run lint` passa o non introduce nuovi errori.
- La funzione Edge viene deployata correttamente.
- La dashboard mostra risultati coerenti con DB.
- Il report include la nuova sezione.
- Errori di singolo target non bloccano SurfaceScan360.
