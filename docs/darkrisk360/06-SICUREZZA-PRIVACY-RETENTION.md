# 06 - Sicurezza, privacy e retention

## 1. Classificazione

| Classe | Esempi | Trattamento |
|---|---|---|
| Pubblico operativo | dominio, IP autorizzato | tenant-scoped |
| Confidenziale | conteggi, finding, sorgenti | RLS + report confidenziale |
| Altamente sensibile | account, password, righe leak | cifratura, no-store, audit |
| Segreto | API key, service role, KEK | secret manager, mai DB applicativo/Git |

## 2. Matrice autorizzativa

| Operazione | Superadmin | Admin organizzazione | Customer autorizzato | Sales | Service role |
|---|---:|---:|---:|---:|---:|
| Leggere Standard | Si' | Si' | Si' | No nel percorso sensibile | Si' |
| Modificare scope | Si' | Si' | No | No | Si' |
| Concedere Esteso | Si' | No | No | No | Si' |
| Avviare Esteso | Si' | Si' | No | No | Si' |
| Vedere Esteso | Si' | Si' | Se capability e policy lo consentono | No | Si' |
| Reveal/download | Si', audit | Si', audit | Se autorizzato, audit | No | Solo processo |

Il controllo effettivo deve essere applicato sia nel backend Laravel sia nelle RLS/Edge; la sola visibilita' del pulsante frontend non e' un controllo di sicurezza.

## 3. Cifratura V2

Per ogni record Esteso:

1. viene generata una DEK casuale da 32 byte;
2. il payload JSON e' cifrato con AES-256-GCM e IV casuale;
3. la DEK e' cifrata con la KEK runtime usando AES-GCM e IV separato;
4. la DEK in memoria viene azzerata dopo l'uso;
5. vengono salvati ciphertext, DEK cifrata, IV, versione chiave e SHA-256 del plaintext;
6. la KEK non entra nel database.

L'identificatore schema corrente e' `AES-256-GCM+AES-KW-GCM`; l'implementazione concreta usa AES-GCM anche per proteggere la DEK. Un cambio di formato richiede nuova versione e migrazione controllata, non una modifica silenziosa dell'etichetta.

## 4. Gestione chiavi

- KEK separata per ambiente;
- minimo 32 byte casuali;
- storage in secret manager Supabase/infrastrutturale;
- `DARKRISK_EVIDENCE_KEY_VERSION` obbligatoria;
- nessuna copia in `.env.example`, documentazione o log;
- rotazione con dual-read della vecchia versione e rewrap progressivo;
- revoca immediata in caso di sospetta esposizione;
- backup della KEK secondo processo aziendale: senza KEK i payload non sono recuperabili.

Il repository implementa encryption ma non contiene ancora un servizio completo di rotation/rewrap.

## 5. Dati in transito e cache

- HTTPS obbligatorio verso IntelX e API applicativa;
- chiave solo header `x-key`;
- endpoint sensibili con `Cache-Control: no-store`;
- query Esteso React Query con `gcTime: 0`;
- nessun Service Worker o localStorage per password;
- URL firmati con durata 60-900 secondi;
- report Esteso distribuito solo tramite URL firmato breve.

## 6. Logging

Consentito:

- correlation ID;
- `task_id`, `run_id`, organizzazione;
- codice errore sanificato;
- conteggi;
- stato task/provider;
- tempi e retry.

Vietato:

- API key e bearer;
- password;
- account completi se non necessari;
- righe IntelX;
- ciphertext o KEK/DEK;
- URL firmati;
- response body provider raw.

`last_error_message` nei task deve restare generico. Per la diagnosi usare codici e correlation ID.

## 7. Audit obbligatorio

Auditare almeno:

- modifica scope;
- avvio run Esteso;
- reveal evidenza;
- download/esportazione report;
- accesso negato;
- fallback IP -> dominio;
- record fuori bucket scartati;
- purge di fine contratto;
- rotazione/revoca chiave.

L'audit non deve replicare il dato sensibile che intende tracciare.

## 8. Retention

### Durante il contratto

- Standard conserva conteggi, trend e report secondo policy commerciale;
- Esteso conserva payload e report fino alla fine del contratto;
- eventuali `retention_until` piu' restrittivi prevalgono.

### Fine contratto Esteso

La funzione `darkrisk_purge_expired_extended_v2` seleziona organizzazioni prive di grant Esteso attivo e con termine da almeno 23 ore. Elimina:

- payload V2 cifrati;
- riferimenti raw evidence Esteso;
- oggetti `darkrisk-evidence-private` relativi a run Esteso;
- report Esteso e oggetti HTML/JSON/PDF;
- snapshot Esteso.

Con il cron orario la cancellazione avviene entro 24 ore, salvo indisponibilita' infrastrutturale da trattare come incidente.

Rimangono solo audit aggregati e dati non sensibili consentiti.

## 9. Report ed evidenze legacy vs V2

- `darkrisk360-report-access` firma path Storage e registra audit;
- `darkrisk360-reveal-evidence` opera sui riferimenti `darkrisk_raw_evidence_refs` legacy;
- i payload V2 in `darkrisk_sensitive_payloads` richiedono un endpoint Laravel dedicato che esegua decrypt, autorizzazione e audit;
- non collegare direttamente la tabella cifrata al frontend.

## 10. Minacce principali e controlli

| Minaccia | Controllo |
|---|---|
| Tenant breakout | RLS + verifica organizzazione Laravel/Edge |
| Escalation commerciale | grant mutabili solo da superadmin/service role |
| Query fuori scope | registro approvato + snapshot run |
| Shared hosting contamination | allowlist root + `correlated_from_ip` |
| Provider endpoint vietato | origin pinning e test |
| Esfiltrazione password | envelope encryption + no-store + audit |
| Replay/doppio click | idempotency key + indici unique |
| Worker concorrenti | SKIP LOCKED + lease task/provider |
| Bucket inatteso | filtro client-side + audit |
| Secret leak | no-secrets gate + `.env*` ignorati |

## 11. Security gate prima della Produzione

- test RLS per ogni ruolo;
- test IDOR su run, report ed evidence ID;
- test che sales/customer non avviino Esteso;
- test che grant disabilitato blocchi accesso e avvio;
- test che `4.intelx.io` sia impossibile;
- test che password non compaiano in log, DB canonico o overview;
- test URL firmati scaduti;
- test purge entro SLA;
- test backup/restore e disponibilita' KEK;
- revisione del decrypt Laravel.

