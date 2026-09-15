# Cadenza Esteso, KPI Standard e Cleartext in Piattaforma

Ultimo aggiornamento: 15 settembre 2026.

Questo documento **estende** l'architettura canonica V2 già descritta in
[01](./01-ARCHITETTURA-PRODOTTO-FLUSSI.md), [02](./02-INTELX-CONTRATTI-ADAPTER.md),
[03](./03-SUPABASE-SCHEMA-EDGE-CRON.md), [05](./05-DATA-DICTIONARY.md),
[06](./06-SICUREZZA-PRIVACY-RETENTION.md) e [07](./07-API-FRONTEND-REPORT.md). In caso di
contrasto tra questo documento e uno di quelli, **questo documento prevale solo sui tre punti
elencati in §0** (esplicitamente rivisti); su tutto il resto valgono i documenti canonici e,
in caso di ulteriore divergenza, il comportamento verificabile del codice — stessa gerarchia
dichiarata in [README.md](./README.md).

Nota terminologica: nella richiesta di prodotto che ha originato questo documento si è usato
"DarkRisk **Normale**" per indicare quello che i documenti canonici chiamano sempre
"DarkRisk **Standard**". Da qui in avanti si usa esclusivamente **Standard**/**Esteso** per
coerenza con 01-08.

## 0. Sintesi delle decisioni prese rispetto alla V2 esistente

| Tema | Decisione V2 esistente (giu 2026) | Decisione di questo documento | Impatto sul codice |
|---|---|---|---|
| Cadenza Esteso | Solo spot; una migration rimuove attivamente ogni cron `esteso`/`extended`/`identity`/`dti` (§8.1) | **Configurabile per organizzazione**: manuale (spot, resta sempre disponibile) / mensile / trimestrale | Nuove 2 colonne su `darkrisk_capability_grants`; nuovo cron con nome che non collide col filtro di pulizia; **nessuna** modifica a `darkrisk_scan_tasks`/validazione orchestrator (§8) |
| Policy di sblocco cleartext per il cliente finale | Mai definita ("Vedere Esteso: Sì, se capability e policy lo consentono" — la "policy" non è mai stata scritta) | **Basta la capability `extended_identity` attiva** sull'organizzazione; MFA è già obbligatoria al login della console, nessun controllo aggiuntivo al momento del reveal | Nessuna nuova tabella; il gate resta quello già previsto per la capability (§5) |
| Presentazione UI del cleartext | Non specificata | **Visibile diretto in tabella**, nessun mascheramento/click-to-reveal per singolo campo | Nessun componente di masking lato frontend; resta comunque obbligatorio l'audit ad ogni lettura (§5.3) |

Due criticità sono emerse durante la ricerca per questo documento e **non sono decisioni**:
sono segnalazioni. Sono isolate in sezioni proprie con intestazione ben visibile: la mancanza
dell'endpoint di decrypt/reveal per la pipeline V2 (§6) e il cleartext non cifrato nella
pipeline legacy tuttora in uso (§7).

## 1. Ambito

Questo documento copre:

1. Cosa mostra DarkRisk **Standard** e come si calcola il "nuovo questa settimana" (§4) —
   oggi non definito in nessun documento canonico.
2. Cosa mostra DarkRisk **Esteso** (cleartext, email+password) e con quale autorizzazione
   (§5).
3. Come si risolve lo scope (domini/IP) in selettori di ricerca IntelX, con particolare
   attenzione al caso "nessuna email, solo dominio" (§3).
4. Riferimento tecnico dell'adapter IntelX **realmente in codice oggi**, con verifica
   empirica eseguita in sessione (§2, §9).
5. Come introdurre la cadenza automatica mensile/trimestrale per Esteso senza toccare la
   validazione dell'orchestrator esistente (§8).

## 2. Riferimento tecnico IntelX: cosa fa davvero l'adapter oggi

Fonti: documentazione ufficiale *Intelligence X — Leaks API*, v5, 16/12/2020 (fornita
dall'utente, `NOXFIELD/Intelligence X Leaks API.pdf`), screenshot dell'UI
`identity.intelx.io` → tab "Search Data Leaks" (fornito dall'utente), e lettura diretta del
codice sorgente elencato in ciascun punto.

### 2.1 Autenticazione

- Endpoint Leaks API: **`https://3.intelx.io`**. Header `x-key: <API key>` (alternativa
  documentata: `&k=<key>` in query string — l'adapter usa l'header).
- `https://4.intelx.io` è l'origine della **UI** Identity Portal, non un endpoint
  programmatico: **vietato** per il runtime — `02-INTELX-CONTRATTI-ADAPTER.md:89`,
  ribadito in `README.md:49`.

### 2.2 Endpoint usati oggi dall'adapter (`intelx-leaks-adapter.ts`)

| Operazione | Metodo/endpoint | Note | Riferimento |
|---|---|---|---|
| `searchLines(selector)` | `GET /live/search/internal` → poll `GET /live/search/result` | `bucket` fissato a `leaks.private.general`, `skipinvalid=true`, `analyze=false`, `limit` (default 1000, max 1000) | `intelx-leaks-adapter.ts:109-123` |
| `exportAccounts(selector)` | `GET /accounts/csv` (asincrono) → poll `GET /live/search/result` | stesso bucket fisso; selettore **obbligatoriamente a dominio** (vedi §2.3) | `intelx-leaks-adapter.ts:125-137` |
| Terminazione | `GET /live/search/terminate?id=...` | eseguita in un blocco `finally` ogni volta che il job **non** raggiunge lo stato terminale (2) — anche in caso di errore/timeout | `intelx-leaks-adapter.ts:200-206` |

**Sempre e solo `leaks.private.general`** — mai `leaks.public.general` — hard-coded in
`INTELX_PRIVATE_LEAKS_BUCKET` (`intelx-leaks-adapter.ts:11`) e ri-verificato record per
record: qualunque risultato con `bucket` diverso viene scartato e contato in
`droppedOutOfBucket` (`intelx-leaks-adapter.ts:73-75, 121, 135, 169-173`) — implementa
esattamente il "ri-controllo obbligatorio del bucket" descritto in
`02-INTELX-CONTRATTI-ADAPTER.md:134-146`.

**Vietato esplicitamente** (`02-INTELX-CONTRATTI-ADAPTER.md:89,111`, `README.md:49`):
`4.intelx.io`, e l'endpoint **sincrono** `GET /accounts/1` ("può perdere risultati"). La
sessione odierna ha prodotto una **conferma empirica diretta** di questo secondo divieto:
vedi §9.1.

### 2.3 Selettori: solo dominio o IP pubblico, mai email

`intelx-selector.ts` (file completo, 31 righe):

- `normalizeIntelXScopeSelector(input)` — usato da `searchLines`. Toglie un eventuale `@`
  iniziale, poi valida come dominio (`DOMAIN_PATTERN`), IPv4 o IPv6. Un vero indirizzo email
  (`mario@panapesca.it`) **non** supera nessuno dei tre pattern (l'`@` resta nel mezzo della
  stringa) → lancia `intelx_scope_selector_invalid`. Un selettore tipo `@panapesca.it` invece
  **non fallisce**: viene silenziosamente ridotto a `panapesca.it` — motivo per cui i
  documenti canonici trattano `@dominio` come "rifiutato": collassa nello stesso identico
  selettore del dominio nudo, quindi non esiste come concetto distinto lato adapter.
- `normalizeIntelXAccountSelector(input)` — usato da `exportAccounts`. Richiama la funzione
  precedente e in più impone `type === 'domain'`: un IP viene accettato da
  `normalizeIntelXScopeSelector` ma **rifiutato** qui con
  `intelx_accounts_selector_requires_domain` — coerente con "`/accounts/csv` resta
  domain-only" (`02-INTELX-CONTRATTI-ADAPTER.md`, sezione 8).
- IPv6 è tecnicamente riconosciuto dall'adapter ma non è ancora esposto come opzione nel
  frontend (`02-INTELX-CONTRATTI-ADAPTER.md:176-192`) — limite di prodotto, non di adapter.

**Conseguenza operativa, importante per §3**: non esiste, né deve esistere, un modo per
cercare *per email* su IntelX. Le coppie email→password che compaiono nel report Esteso sono
sempre un **risultato del parsing** dei record restituiti da una ricerca **a dominio**, mai
l'esito di una ricerca impostata sull'email stessa.

### 2.4 Deduplicazione e fingerprint

`intelx-record-fingerprint.ts` (file completo, 39 righe): la fingerprint di un record è
`"<selector>|systemid:<id>"` se il chiamante passa `preferSystemId: true` e il record ha un
`systemid`; altrimenti è `"<selector>|sha256:<hash del JSON dell'intero record, chiavi
ordinate>"`. `IntelXLeaksAdapter` chiama sempre `preferSystemId: false`
(`intelx-leaks-adapter.ts:174-176`) → **per Esteso la dedup è sempre sull'hash dell'intero
record**, non sul `systemid`. Questo significa che due chiamate che restituiscono lo stesso
contenuto ma con un campo di metadato anche minimamente diverso (es. `positionsize`) non
vengono deduplicate dall'adapter: la dedup "vera" tra run/retry avviene a livello DB tramite
il record canonico in `darkrisk_source_records` e l'univocità di
`darkrisk_source_record_occurrences` (`02-INTELX-CONTRATTI-ADAPTER.md:148-161`,
`05-DATA-DICTIONARY.md:92`).

Nota: il dedup "manuale" fatto in sessione odierna per il documento PANAPESCA usava una
chiave più permissiva (`identifier normalizzato + password + url`), volutamente più larga di
quella dell'adapter — utile per un export una-tantum, ma se questa logica viene portata in
piattaforma **deve** allinearsi alla fingerprint canonica sopra, non reinventarne una propria.

### 2.5 Concorrenza e robustezza

- `ExclusiveOperationGate` (`intelx-leaks-adapter.ts:77-95`): una coda in-process, condivisa
  da tutte le istanze di `IntelXLeaksAdapter` nello stesso processo (`sharedIdentityOperationGate`,
  riga 95), che serializza **ogni** chiamata Leaks (sia `searchLines` che `exportAccounts`) una
  alla volta. Protegge solo all'interno di una singola istanza Edge Function calda.
- `darkrisk_provider_leases` (tabella, `20260628195813_darkrisk360_orchestrator_v2.sql:141-148`,
  PK `provider` con CHECK `IN ('intelx_search','intelx_leaks')`): serializzazione **cross-istanza**
  a livello DB — questo è il meccanismo che davvero impedisce a due cold-start concorrenti di
  bruciare crediti in parallelo.
- Poll loop: fino a `maxPollRounds` (default 30, tetto 120) chiamate a `/live/search/result`;
  si ferma su `status=2` (terminale), lancia errore su `status=3` (search id non trovato) o su
  qualunque status fuori da `{0,1,2,3}`; se il limite `records` viene raggiunto prima dello
  stato terminale, si ferma con `capped=true` **senza** errore (`intelx-leaks-adapter.ts:161-198`).
  `capped=true` va sempre interpretato come "potrebbero esserci altri risultati", non come "ho
  tutto".

### 2.6 Formati riga grezza (`linea`) — parsing multi-formato

L'adapter oggi restituisce la riga grezza (`linea`) così come la dà IntelX; **non** esegue
un parsing strutturato dei formati (email:password, `URL:utente:password` da stealer log,
`android://...`, separatori vari). Il parsing multi-formato usato nel documento PANAPESCA è
stato fatto **fuori** dalla piattaforma, in uno script una-tantum. Se si vuole davvero
"tutto in piattaforma" (mostrare anche le credenziali da stealer log come quella su
`hr.panapesca.eu/HRPortal`, non solo le coppie email:password da `/accounts/csv`), questo
parser va scritto lato server e agganciato all'output di `searchLines` — **non è compreso
in questo documento**, è segnalato come lavoro necessario in §10.

### 2.7 Endpoint noti ma non documentati nel PDF fornito

La chiave usata in sessione espone anche `/reverse/domain`, `/reverse/download`,
`/reverse/preview`, `/stealer/log`, `/stealer/log/download`, `/stealer/log/preview` (visti
nella risposta di `/authenticate/info`), oltre alle tab "Reverse Lookup" ed "Export Stealer
Log" nello screenshot dell'UI fornito. **Nessuno di questi è coperto dal PDF fornito** e non
vanno usati né documentati come comportamento certo finché non si ottiene/legge la relativa
documentazione ufficiale.

## 3. Risoluzione scope → selettori di ricerca

Scope org = righe in `darkrisk_external_scope` con `authorization_status='approved'`
(`target_type` ∈ `{domain, ip}` — CHECK a livello di ENUM,
`20260628195813_darkrisk360_orchestrator_v2.sql:21,49`).

**Non esiste, e non deve essere introdotto, un `target_type='email'`.** La richiesta
originale ("la ricerca avviene nello scope di domini e/o email in scope... se non ci sono
email ma solo dominio.it, prendiamo dominio.it") si risolve così, senza bisogno di
modificare lo schema: **il selettore è sempre e solo il dominio (o l'IP)**, mai un'email —
per costruzione dell'adapter (§2.3), non come fallback speciale per il "caso senza email".
Le email compaiono unicamente nell'**output**, quando emergono dal parsing dei record
trovati cercando il dominio.

Da `buildTaskRows` (`darkrisk360-orchestrator-v2/orchestration.ts:122-194`), per ogni target
di scope in modalità `extended`:

- **sempre** un task `extended_lines` (provider `intelx_leaks` → `searchLines`), sia per
  target `domain` che `ip`;
- **solo se `target_type='domain'`**, in aggiunta, un task `extended_accounts` (provider
  `intelx_leaks` → `exportAccounts`) — un IP non genera mai questo secondo task, coerente
  con `normalizeIntelXAccountSelector` che rifiuta gli IP (§2.3).

**Filtro di attribuzione (da formalizzare lato adapter/report)**: un identificativo estratto
(email o account) va attribuito all'organizzazione solo se il suo dominio coincide con un
target di scope approvato o ne è un sottodominio — esattamente il filtro applicato a mano
nell'export PANAPESCA di oggi, che ha scartato dai risultati grezzi qualunque account di
terze parti presente negli stessi file di leak/combolist. Senza questo filtro si rischia di
esporre nel report di un cliente le credenziali di soggetti non in scope, catturati per pura
coincidenza nello stesso dump.

## 4. DarkRisk Standard — cosa mostra

Invariato rispetto a `01-ARCHITETTURA-PRODOTTO-FLUSSI.md:7-19`: solo dati aggregati — totale,
soglia, nuovi risultati, trend; **mai** account o password
(`05-DATA-DICTIONARY.md:254`: mapping Standard = "Mai"). Fonte via IntelX Search API
(`2.intelx.io`), non Leaks API.

**"Fonte" da mostrare**: `darkrisk_source_records.source` (enum) +
`darkrisk_source_records.title`/`source_system_id` (nome del dump/collection, es. "LinkedIn
2023 35M") — colonne già esistenti, nessuna modifica necessaria
(`05-DATA-DICTIONARY.md:76-92`).

**Deduplicazione**: già garantita dal modello dati (`darkrisk_source_records` univoco per
fingerprint + `darkrisk_source_record_occurrences` per il legame run↔record) — nessun
lavoro aggiuntivo richiesto (§2.4, `02-INTELX-CONTRATTI-ADAPTER.md:148-161`).

### 4.1 KPI "nuovi leak questa settimana" — non definito oggi, proposta

Verificato che questo KPI **non esiste** come concetto formalizzato: il contratto API
frontend (`07-API-FRONTEND-REPORT.md:53-66`) prevede un campo `new_leaks` nella risposta,
ma la vista di proiezione `darkrisk_standard_overview_v2`
(`05-DATA-DICTIONARY.md:226-244`) **non ha una colonna che lo alimenti** — è uno scollamento
reale tra contratto API e modello dati, non un'omissione di questo documento.

**Proposta** (usa solo tabelle già esistenti, nessuna nuova tabella):

```
new_leaks_first_seen(organization, week) =
  COUNT(DISTINCT source_record_id)
  FROM darkrisk_source_record_occurrences o
  WHERE o.organization_id = :organization
    AND o.observed_at::date BETWEEN :week_start AND :week_end
    AND NOT EXISTS (
      SELECT 1 FROM darkrisk_source_record_occurrences o2
      WHERE o2.organization_id = o.organization_id
        AND o2.source_record_id = o.source_record_id
        AND o2.observed_at < :week_start
    )
```

Cioè: "prima comparsa assoluta di questo leak per questa organizzazione", non "presente
questa settimana ma non la scorsa" — quest'ultima definizione alternativa avrebbe
"sfarfallio" (un leak che scompare una settimana e ricompare tornerebbe a contare come
"nuovo" ogni volta). La definizione proposta è deterministica e stabile. Da aggiungere come
colonna calcolata (o vista materializzata settimanale) alla proiezione esistente — **da
confermare/implementare separatamente**, non incluso in questo documento.

## 5. DarkRisk Esteso — cleartext in piattaforma

### 5.1 Giustificazione (come da richiesta di prodotto)

La console impone MFA all'accesso ed esistono contratti con il cliente finale che regolano
l'uso dei dati: su questa base si mostra **cleartext completo** (email/account, password in
chiaro, riga sorgente, bucket, data) quando la capability `extended_identity`
(`darkrisk_capability_grants`) è attiva per l'organizzazione — non un dato mascherato o
parziale.

### 5.2 Policy di sblocco per il cliente finale (formalizza il vuoto in 06)

`06-SICUREZZA-PRIVACY-RETENTION.md:12-23` prevede che un "Customer autorizzato" possa
vedere/scaricare Esteso "se capability e policy lo consentono", senza mai definire la
policy. Si formalizza qui: **la policy è soddisfatta dalla sola capability
`extended_identity` attiva e non scaduta** (`enabled=true`,
`starts_at <= now() < COALESCE(ends_at, 'infinity')`). Non è richiesto un controllo MFA
aggiuntivo al momento del reveal: l'MFA è già un requisito di accesso alla console nel suo
complesso, non una barriera ulteriore specifica per questo dato.

### 5.3 UI: visibile diretto, audit obbligatorio comunque

Nessun mascheramento, nessun click-per-rivelare: le colonne cleartext (dominio/target,
email/account, password, tipo plaintext/hash, fonte, data) compaiono direttamente nella
tabella per chi ha la capability. Questo **non riduce** l'obbligo di audit già presente in
`06-SICUREZZA-PRIVACY-RETENTION.md:84-98` ("reveal evidenza" è tra le azioni ad audit
obbligatorio): senza un gesto di "reveal" esplicito da tracciare, **l'endpoint che serve i
dati Esteso al cliente deve scrivere un record in `darkrisk_audit_log` ad ogni lettura/fetch
della pagina**, non solo al download — altrimenti l'audit obbligatorio diventerebbe
inapplicabile con display diretto. Il payload dell'audit non deve mai contenere il dato
sensibile stesso (`05-DATA-DICTIONARY.md:190-224`).

## 6. Gap di implementazione bloccante: endpoint di decrypt/reveal

`08-IMPLEMENTATION-HANDOFF.md:85-87` è esplicito: il servizio che decifra
`darkrisk_sensitive_payloads` (autorizzazione + audit) **non esiste ancora**;
`darkrisk360-reveal-evidence` opera sul vault legacy, non sulla tabella V2 cifrata. Questo
significa che, allo stato attuale, **nessun dato scritto nella pipeline V2 può essere
mostrato in chiaro in piattaforma** — manca l'anello che lo decifra. "Tutto in piattaforma"
per Esteso, sul percorso V2, richiede prima la costruzione di questo servizio.
**Non incluso in questo documento** (è documentazione, non implementazione) — segnalato qui
perché blocca qualunque roadmap che assuma "basta collegare la UI ai dati V2".

## 7. Criticità di sicurezza attuale: cleartext non cifrato nella pipeline legacy

Verificato in codice, non dedotto dai documenti: `darkrisk_dti_sensitive_hits.clear_value`
è una colonna `text` semplice
(`supabase/migrations/20260526152000_darkrisk360_dti_extended_intel_firecrawl.sql:64`),
**mai cifrata** — `pgcrypto` non risulta abilitato in nessuna migration del repository. Questo
viola direttamente la classificazione "Altamente sensibile → cifratura, no-store, audit" di
`06-SICUREZZA-PRIVACY-RETENTION.md:5-10`, che la nuova pipeline V2 rispetta correttamente
tramite `darkrisk_sensitive_payloads` (envelope AES-256-GCM).

**Questa è esattamente la tabella usata finora in questa sessione** per generare i report
DTI Esteso di CERERIA, EURO-VAST e PANAPESCA, tramite
`supabase/functions/darkrisk-dti-esteso-report/index.ts:462-468`.

Raccomandazione (priorità alta, **da pianificare come attività separata**, non eseguita qui):

- minimo: abilitare `pgcrypto` e cifrare `clear_value` a riposo;
- strategico: migrare la generazione dei report Esteso sulla pipeline V2
  (`darkrisk_source_records` + `darkrisk_sensitive_payloads`), dismettendo gradualmente
  `darkrisk-dti-esteso-report` e la tabella legacy.

## 8. Cadenza Esteso configurabile (manuale / mensile / trimestrale)

### 8.1 Perché la regola attuale è "solo spot"

Non documentato esplicitamente il *perché*, ma il pattern (nessun cron, purge entro 24h a
fine contratto, dati "altamente sensibili" con cifratura+audit) suggerisce che l'obiettivo
sia minimizzare sia la superficie di dati sensibili a riposo sia il consumo del budget IntelX
condiviso. La migration `20260628195813_darkrisk360_orchestrator_v2.sql:723-745` applica
questo attivamente, rimuovendo ogni cron il cui nome contenga `darkrisk` insieme a uno tra
`esteso`/`extended`/`identity`/`dti`.

### 8.2 Decisione

Si introduce una cadenza **per organizzazione**, con lo spot che resta sempre disponibile e
di default.

### 8.3 Schema (minimo, riusa `darkrisk_capability_grants`)

```sql
ALTER TABLE public.darkrisk_capability_grants
  ADD COLUMN IF NOT EXISTS extended_cadence text NOT NULL DEFAULT 'manual'
    CHECK (extended_cadence IN ('manual', 'monthly', 'quarterly')),
  ADD COLUMN IF NOT EXISTS extended_cadence_last_run_at timestamptz;
```

Colonne significative solo sulle righe con `capability = 'extended_identity'`. Nessuna nuova
tabella.

### 8.4 Nessuna modifica a `darkrisk_scan_tasks` o alla validazione dell'orchestrator

Punto centrale: una run Esteso pianificata è, **strutturalmente identica** a una run spot —
stesso `mode='extended'`, stesso `workflow='scan'`, stesso `buildTaskRows` (crea gli stessi
task `extended_lines`/`extended_accounts`/`extended_run_report` per lo stesso scope). Cambia
**solo chi la avvia** e il `trigger_type` (es. `'scheduled_monthly'` invece di `'manual'`).

Questo evita di toccare `parseOrchestrationRequest`
(`darkrisk360-orchestrator-v2/orchestration.ts:17-60`), che oggi vieta esplicitamente
`workflow='monthly_report'` con `mode='extended'` (riga 39-41,
`extended_reports_are_run_scoped`) — **quella regola resta invariata**: i report Esteso
restano sempre legati a una singola run (`scan_run_id`), mai a un periodo calendariale, anche
quando la run è stata avviata automaticamente. "Mensile/trimestrale" descrive **la cadenza di
innesco**, non un nuovo tipo di report.

### 8.5 Nuovo scheduler

- **Nome del cron da evitare**: qualunque stringa che contenga `darkrisk` insieme a uno tra
  `esteso`/`extended`/`identity`/`dti` — verrebbe rimossa se il blocco di pulizia di §8.1
  venisse mai rieseguito. Nome proposto: **`darkrisk-v2-cadence-scheduler-daily`**.
- Tick giornaliero (proposto: 04:00 Europe/Rome, fuori dagli orari già occupati da
  `weekly_standard` lunedì 02:00 e `monthly_report` giorno 1 alle 03:00 —
  `orchestration.ts:100-117`).
- Query: `darkrisk_capability_grants` con `capability='extended_identity' AND enabled AND
  extended_cadence IN ('monthly','quarterly') AND (extended_cadence_last_run_at IS NULL OR
  now() - extended_cadence_last_run_at >= <intervallo per la cadenza>)`, ordinata per
  `extended_cadence_last_run_at ASC NULLS FIRST`.
- **Tetto giornaliero** (proposto: 20 organizzazioni/giorno, valore da tarare) per non
  saturare il budget IntelX condiviso se molte organizzazioni cadono sulla stessa data di
  cadenza. Non serve una nuova contabilità dei crediti: `ExclusiveOperationGate` +
  `darkrisk_provider_leases` (§2.5) già serializzano ogni chiamata Leaks una alla volta — il
  tetto giornaliero è l'unica leva realmente necessaria in più.
- Per ogni organizzazione selezionata: stessa chiamata usata oggi per lo spot
  (`mode=extended, workflow=scan`), con `trigger_type='scheduled_monthly'` o
  `'scheduled_quarterly'`; ad enqueue riuscito, `extended_cadence_last_run_at = now()`.
- Impostare/cambiare la cadenza per organizzazione resta un'azione **superadmin** (nuovo
  controllo UI, non esiste oggi) — coerente con "concedere Esteso: solo superadmin" già in
  `06-SICUREZZA-PRIVACY-RETENTION.md`.

## 9. Osservazioni empiriche di sessione (validano le regole esistenti)

Raccolte durante la produzione manuale del report credenziali per PANAPESCA
(2026-07-07/07-29), prima che questo documento venisse scritto.

### 9.1 `/accounts/1` (sincrono) è nondeterministico — conferma empirica del divieto

Stesso identico selettore (`panapesca.it`), stesso bucket, chiamate ravvicinate:
**39 → 38 → 13 → 8 → 0** record restituiti. Non un problema di crediti (verificato via
`/authenticate/info`: crediti ampiamente disponibili) ma di comportamento del backend IntelX
su quell'endpoint. Conferma diretta, con numeri reali, del divieto già scritto in
`02-INTELX-CONTRATTI-ADAPTER.md:111` ("può perdere risultati") — motivo in più per non
introdurlo mai, nemmeno per "velocità".

### 9.2 `leaks.public.general` — contributo marginale

Interrogato manualmente oltre al bucket privato: **+2 record** su un dominio (panapesca.it),
**0** sugli altri quattro. Conferma che il bucket fisso `leaks.private.general` già
implementato in `intelx-leaks-adapter.ts` non perde segnale in modo sostanziale.

### 9.3 Solo selettori a dominio bastano per ottenere le coppie email→password

98 credenziali trovate per PANAPESCA (90 su `panapesca.it` da coppie email:password,
8 su `panapesca.eu` da credenziali stealer log `URL:utente:password` su
`hr.panapesca.eu/HRPortal`) usando **esclusivamente** selettori a dominio — mai un'email come
selettore. Conferma il modello descritto in §3.

## 10. Aperto (non bloccante per procedere)

- Tetto giornaliero esatto di organizzazioni/giorno per la cadenza automatica (proposto 20 in
  §8.5, da tarare sul budget crediti reale).
- Parser strutturato lato server per i formati multipli di riga leak (§2.6) — necessario se
  si vuole includere anche l'evidenza da stealer log (non solo `/accounts/csv`) nella UI
  Esteso, non solo nei documenti generati manualmente.
- Priorità/owner per la criticità di cifratura legacy (§7).
- Se in futuro serve una ricerca mirata su singole email note (es. account VIP) oltre alla
  ricerca a dominio — oggi non richiesto, e comunque non supportato da
  `normalizeIntelXScopeSelector` senza una modifica esplicita e giustificata alla regola di
  selettore.

## 11. Riferimenti

- *Intelligence X — Leaks API*, versione 5, 16 dicembre 2020 (PDF fornito dall'utente,
  `NOXFIELD/Intelligence X Leaks API.pdf`).
- Screenshot UI `identity.intelx.io` → "Search Data Leaks" (fornito dall'utente).
- Codice: `supabase/functions/_shared/intelx-leaks-adapter.ts`,
  `intelx-selector.ts`, `intelx-record-fingerprint.ts`,
  `supabase/functions/darkrisk360-orchestrator-v2/orchestration.ts`,
  `supabase/migrations/20260628195813_darkrisk360_orchestrator_v2.sql`,
  `supabase/migrations/20260526152000_darkrisk360_dti_extended_intel_firecrawl.sql`,
  `supabase/functions/darkrisk-dti-esteso-report/index.ts`.
- Documenti canonici: [01](./01-ARCHITETTURA-PRODOTTO-FLUSSI.md),
  [02](./02-INTELX-CONTRATTI-ADAPTER.md), [03](./03-SUPABASE-SCHEMA-EDGE-CRON.md),
  [05](./05-DATA-DICTIONARY.md), [06](./06-SICUREZZA-PRIVACY-RETENTION.md),
  [07](./07-API-FRONTEND-REPORT.md), [08](./08-IMPLEMENTATION-HANDOFF.md).
- Test empirico IntelX condotto in sessione, luglio 2026 (documento credenziali PANAPESCA).
