# API sincronizzazione CRM esterno — Sales Manager

Collegamento generico tra HiCompliance (Sales Manager) e qualsiasi CRM capace di fare chiamate HTTP.
**Chiave di sincronizzazione: Partita IVA** (`vat_number`).

## Endpoint e autenticazione

```
POST https://hcllvyzhefcqftesahnv.supabase.co/functions/v1/crm-sync
Content-Type: application/json
x-crm-token: <CRM_SYNC_TOKEN>
```

- `CRM_SYNC_TOKEN` è un segreto condiviso: lo stesso valore è salvato nei segreti del progetto e nella configurazione del CRM.
- Ogni richiesta è un `POST` con il campo `action`.
- Errori: `400` input non valido (dettaglio campi), `401` token errato, `404` cliente/remediation non trovati, `500` errore interno (`error` con messaggio).

### Normalizzazione Partita IVA
Maiuscolo, rimozione di spazi/simboli, rimozione del prefisso `IT` se seguito da 11 cifre.
`IT 02008500460`, `it02008500460` e `02008500460` identificano lo stesso cliente. Viene salvata normalizzata in `organization_profiles.vat_number`.

## Azioni

### 1. `upsert_client` — cliente entra nel CRM
Crea (o aggiorna) l'anagrafica e, se il cliente non ha remediation, genera il piano dai modelli standard (`remediation_templates`).

```json
{
  "action": "upsert_client",
  "vat_number": "IT02008500460",
  "name": "InnovaTech S.r.l.",
  "legal_name": "InnovaTech S.r.l.",
  "email": "info@innovatech.it",
  "pec": "innovatech@pec.it",
  "phone": "+39 0583 000000",
  "business_sector": "Trattamento acqua e servizi",
  "legal_address": "Via Roma 1, Lucca",
  "create_remediations": true,
  "template_categories": ["Governance", "Backup"]
}
```
Obbligatori: `vat_number`, `name`. `template_categories` opzionale (default: tutti i modelli).
Idempotente: richiamarla con la stessa P.IVA aggiorna solo i campi inviati e non duplica le remediation.

Risposta:
```json
{ "organization_id": "uuid", "created": true, "remediations_created": 56,
  "remediations": [ { "id": "uuid", "task": "...", "category": "...", "priority": "...", "progress": 0,
                      "budget": null, "status": "proposto", "notes": null, "start_date": "2026-11-24", "end_date": "2026-12-01" } ] }
```
Il CRM deve salvare `remediations[].id` (= `task_id`) per gli aggiornamenti successivi.

### 2. `list_remediations`
```json
{ "action": "list_remediations", "vat_number": "IT02008500460" }
```
Restituisce `organization_id` e `remediations` (stessa forma di sopra).

### 3. `update_remediation` — CRM → piattaforma
```json
{ "action": "update_remediation", "vat_number": "IT02008500460", "task_id": "uuid",
  "status": "accettato", "budget": 4500, "notes": "Offerta n. 123" }
```
- `status` ∈ `proposto, inviato, in_trattativa, accettato, rifiutato, in_esecuzione, completato`.
- `budget` aggiorna valore commerciale **e** budget del piano (restano sempre uguali). `null` azzera.
- `inviato` imposta la data proposta; `accettato/rifiutato/in_esecuzione/completato` la data chiusura.
- Il CRM può impostare qualsiasi stato (la piattaforma è guidata dai passaggi del Sales Manager; il CRM è autorevole quando scrive).

### 4. `list_changes` — piattaforma → CRM
Ogni cambio di stato o budget (Sales Manager, piano di remediation, API) viene registrato in `crm_sync_events`. Il CRM legge con un cursore:

```json
{ "action": "list_changes", "since_id": 0, "limit": 200, "include_crm_origin": false }
```
Risposta:
```json
{ "changes": [ { "id": 41, "organization_id": "uuid", "vat_number": "02008500460", "task_id": "uuid",
                 "status": "in_trattativa", "budget": 3000, "origin": "platform", "created_at": "..." } ],
  "next_since_id": 41 }
```
- Salvare `next_since_id` e usarlo alla chiamata successiva.
- Per default esclude le modifiche fatte dal CRM stesso (`origin = "crm"`), evitando loop.
- Lo stesso cambiamento può comparire più volte (stato e budget registrati separatamente): applicare sempre l'ultimo evento per `task_id`.
- Frequenza consigliata: ogni 5–15 minuti, o su azione dell'utente nel CRM.

## Flusso tipico
```text
CRM: nuovo cliente ──upsert_client──▶ HiCompliance crea anagrafica + piano
CRM: offerta accettata ──update_remediation──▶ stato/budget nel Sales Manager e nel piano
Sales Manager / piano: modifica ──▶ crm_sync_events ──list_changes──▶ CRM aggiorna opportunità
```

## Esempio curl
```bash
curl -X POST "https://hcllvyzhefcqftesahnv.supabase.co/functions/v1/crm-sync" \
  -H "Content-Type: application/json" -H "x-crm-token: $CRM_SYNC_TOKEN" \
  -d '{"action":"list_remediations","vat_number":"IT02008500460"}'
```

## Note tecniche
- Codice: `supabase/functions/crm-sync/index.ts` (validazione Zod, confronto token a tempo costante, accesso con chiave di servizio lato server).
- Tabelle: `organizations`, `organization_profiles` (P.IVA), `remediation_tasks` (`source = 'crm'` per quelle create via API), `remediation_commercial`, `crm_sync_events` (lettura solo super_admin/sales).
- Trigger: `trg_crm_commercial`, `trg_crm_task_budget` scrivono gli eventi; `origin` è `crm` quando la modifica arriva da questa API.
