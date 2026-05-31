# Codex Prompt - Test e Acceptance Criteria DNS Lookup Scanner

## Test unitari scanner
Creare test per le funzioni pure dello scanner.

Casi minimi:

```text
normalizeDomain("https://www.example.com/path") -> www.example.com
normalizeDomain("example.com.") -> example.com
normalizeDomain("127.0.0.1") -> errore
normalizeDomain("localhost") -> errore
SPF +all -> high fail
SPF -all -> pass
SPF ~all -> medium warn
SPF multipli -> high fail
SPF lookup estimate >10 -> high fail
DMARC missing with MX -> high warn
DMARC p=none -> medium warn
DMARC p=reject -> pass
CAA missing -> low warn
DS missing -> medium warn
wildcard A present -> low warn
```

## Test Edge Function

### Success
Payload valido con dominio autorizzato:

```json
{
  "scan_id": "uuid",
  "asset_id": "uuid",
  "tenant_id": "uuid",
  "domain": "example.com"
}
```

Atteso:

```json
{
  "ok": true,
  "result_id": "uuid",
  "score": "number",
  "grade": "A|B|C|D|F"
}
```

### Errori
- metodo GET -> 405;
- payload senza domain -> 400;
- dominio fuori perimetro -> 403;
- dominio non valido -> 400;
- resolver timeout -> risultato salvato con errori parziali, non crash 500.

## Test DB
- insert result con service role funziona;
- select come tenant member vede solo tenant corretto;
- select come altro tenant non vede nulla;
- delete result elimina findings via cascade.

## Test UI
- dashboard mostra card vuota se non esistono risultati;
- dashboard mostra score e grade se risultato presente;
- filtro severity funziona;
- tab Records mostra TXT lunghi collassati;
- bottone Run DNS lookup invoca Edge Function;
- errore funzione mostrato con toast non bloccante.

## Test report
- report include sezione DNS;
- findings ordinati: critical, high, medium, low, info;
- record raw in appendice;
- remediation contiene owner ed effort;
- nessun record duplicato nel corpo principale.

## Comandi suggeriti

```bash
npm run lint
npm run build
supabase functions serve dns-lookup-scan
supabase functions deploy dns-lookup-scan
```

## Definition of Done
- Build verde.
- Edge Function deployata.
- Scan manuale su dominio test completato.
- Risultati salvati in Supabase.
- Dashboard visibile.
- Report aggiornato.
- Nessun dato cross-tenant esposto.
