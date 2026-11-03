# Report VA esterni (Nove) — Generale → Report → Vulnerability Assessment

Report di Vulnerability Assessment mensili continuativi letti dall'archivio esterno **Nove** (API VA v1, sola lettura, vedi `API_VA.md` del team Nove).

## Architettura
```text
Browser (Reports.tsx → ExternalVaReports.tsx)
   └─ supabase.functions.invoke("va-reports")  [JWT utente]
        └─ edge function va-reports  ──Bearer NOVE_API_TOKEN──▶ http://nove.hisolution.it:8000/api/v1/va/...
```
- Il token `NOVE_API_TOKEN` è un secret del backend: non arriva mai al browser.
- Endpoint dal secret `NOVE_API_BASE_URL`, configurato su richiesta con `http://nove.hisolution.it:8000/api`; precede il vecchio `NOVE_API_HOST` (fallback). La funzione normalizza host, `/api` o `/api/v1` in una sola base `/api/v1`, mantenendo la porta 8000. Si usano solo percorsi costruiti dal server (mai i `link` restituiti), `redirect: "manual"`.
- **Attenzione:** HTTP non cifra token Bearer e report sul collegamento tra funzione e Nove. Configurazione richiesta dal cliente; per produzione predisporre HTTPS e aggiornare `NOVE_API_BASE_URL`. Nessun token viene esposto al browser.

## Collegamento cliente
- Colonne `organizations.nove_cliente_id` (int) e `nove_cliente_name`.
- Super Admin/Sales: tasto **Collega cliente VA** → elenco `GET /va/clienti/?q=` → scelta → azione `link`. Il collegamento si scrive solo dalla funzione (service role) dopo il controllo `can_manage_all_organizations`.
- Innovatech Group va collegato dalla UI con questo tasto.

## Azioni della funzione `va-reports`
| action | chi | chiamata Nove |
|---|---|---|
| clients | super admin / sales | GET /api/v1/va/clienti/?q= |
| link | super admin / sales | — (aggiorna organizations) |
| reviews | chi ha accesso all'org (`doc_can_access_org`) | GET /va/clienti/{id}/review/ |
| review | idem | GET /va/review/{rid}/ |
| zip | idem | GET /va/review/{rid}/zip/ (stream application/zip) |
| password | idem | GET /va/review/{rid}/password/ |

Per `review`, `zip` e `password` la funzione legge prima il dettaglio e verifica che `cliente.id` coincida con il cliente collegato all'org, così un utente non può leggere VA di altri clienti cambiando `review_id`.

## Audit
`integration_audit_logs` con `service_name = 'nove_va'`: `va_link`, `va_unlink`, `va_zip_download`, `va_password_read` (utente, org, review_id). Nove registra a sua volta zip e password nel suo registro attività.

## Errori
I codici Nove (`non_autenticato`, `non_autorizzato`, `ip_non_ammesso`, `https_richiesto`, `non_trovato`, `troppe_richieste`, `troppi_tentativi`) vengono tradotti in messaggi in italiano mostrati nella scheda.

## Configurazione Nove richiesta
- Utente di servizio `api-report`, ruolo con i tre permessi `API VA` (clienti e review, zip, password).
- Lista IP del token: gli indirizzi in uscita delle funzioni Supabase non sono fissi; lasciare la lista vuota oppure passare da un proxy con IP fisso.
- Rate limit 120 richieste al minuto per token: la UI chiede il dettaglio solo all'apertura di "Contenuto".

## Da decidere / produzione
- Password visibile anche agli utenti del cliente. Nove consiglia canali separati per zip e password: valutare se limitarla a super admin/sales (controllo `isManager` nella funzione).
- Cache dell'elenco review per non consumare il rate limit.
- Rotazione del token (scadenza 90–730 giorni): aggiornare il secret `NOVE_API_TOKEN`.

## File
- `supabase/functions/va-reports/index.ts`
- `src/components/reports/ExternalVaReports.tsx`
- `src/pages/Reports.tsx` (scheda "Vulnerability Assessment")
