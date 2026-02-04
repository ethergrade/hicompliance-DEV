
# Piano: Anagrafica Aziendale e Classificazione NIS2

## Obiettivo
Aggiungere una sezione "Anagrafica Azienda" nella tab "Contatti e Informazioni" (attualmente "Contatti di Emergenza") che permetta di inserire i dati aziendali e selezionare obbligatoriamente la classificazione NIS2 (Essenziale, Importante, o Nessuna delle due).

---

## Modifiche Previste

### 1. Rinominare la Tab
La tab attuale "Contatti di Emergenza" diventerà **"Contatti e Informazioni"** nel file `IncidentResponse.tsx`.

### 2. Nuova Sezione "Anagrafica Azienda"
Prima della sezione "Governance e Organi Decisionali", verrà aggiunto un form con:

**Campi Anagrafica:**
- Ragione Sociale
- Partita IVA
- Codice Fiscale
- Sede Legale (indirizzo completo)
- Sede Operativa (opzionale)
- PEC
- Telefono
- Email aziendale
- Settore di attività

**Classificazione NIS2 (obbligatoria):**
- Soggetto Essenziale
- Soggetto Importante  
- Nessuna delle due

La selezione sarà tramite radio button con descrizioni esplicative per ogni opzione.

### 3. Database
Verrà creata una nuova tabella `organization_profiles` con i seguenti campi:
- `id` (UUID, primary key)
- `organization_id` (UUID, foreign key verso organizations)
- `legal_name` (ragione sociale)
- `vat_number` (partita IVA)
- `fiscal_code` (codice fiscale)
- `legal_address` (sede legale)
- `operational_address` (sede operativa)
- `pec` (email certificata)
- `phone` (telefono)
- `email` (email aziendale)
- `business_sector` (settore)
- `nis2_classification` (enum: 'essential', 'important', 'none')
- `created_at`, `updated_at`

Con policy RLS appropriate per la sicurezza.

### 4. Sincronizzazione con Assessment
I dati dell'anagrafica saranno disponibili nella pagina Assessment per mostrare:
- Nome azienda
- Classificazione NIS2 (con badge colorato)
- Settore di attività

---

## Componenti da Creare/Modificare

| File | Azione |
|------|--------|
| `src/pages/IncidentResponse.tsx` | Rinominare tab, aggiungere componente anagrafica |
| `src/components/irp/OrganizationProfileForm.tsx` | **Nuovo** - Form anagrafica aziendale |
| `src/hooks/useOrganizationProfile.ts` | **Nuovo** - Hook per CRUD profilo |
| `src/types/organization.ts` | **Nuovo** - Tipi TypeScript |
| `src/pages/Assessment.tsx` | Aggiungere banner con classificazione NIS2 |
| Database migration | Creare tabella `organization_profiles` |

---

## Dettagli Tecnici

### Struttura Form Anagrafica
```text
+--------------------------------------------------+
| ANAGRAFICA AZIENDA                               |
+--------------------------------------------------+
| Ragione Sociale: [_______________]               |
| Partita IVA:     [_______________]               |
| Codice Fiscale:  [_______________]               |
| Sede Legale:     [_______________]               |
| Sede Operativa:  [_______________] (opzionale)   |
| PEC:             [_______________]               |
| Telefono:        [_______________]               |
| Email:           [_______________]               |
| Settore:         [Dropdown con opzioni]          |
+--------------------------------------------------+
| CLASSIFICAZIONE NIS2 (obbligatorio)              |
+--------------------------------------------------+
| ○ Soggetto Essenziale                            |
|   Operatori di servizi essenziali (energia,      |
|   trasporti, sanità, banche, infrastrutture...)  |
|                                                  |
| ○ Soggetto Importante                            |
|   Fornitori di servizi digitali, produttori,     |
|   gestori rifiuti, settore alimentare...         |
|                                                  |
| ○ Nessuna delle due                              |
|   L'azienda non rientra nelle categorie NIS2     |
+--------------------------------------------------+
```

### Validazione
- La classificazione NIS2 sarà obbligatoria
- Partita IVA: validazione formato italiano (11 cifre)
- PEC: validazione formato email

### Salvataggio Automatico
Come le altre sezioni IRP, i dati verranno salvati automaticamente con debounce di 1.5 secondi e feedback visivo ("Salvando...", "Salvato").

---

## Ordine delle Sezioni nella Tab
1. **Anagrafica Azienda** (nuovo)
2. **Governance e Organi Decisionali** (esistente)
