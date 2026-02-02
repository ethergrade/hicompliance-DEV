

## Piano: Implementazione Rubrica Contatti Centralizzata

### Concetto
Creare una **Rubrica Contatti** separata dove vengono salvati i dati anagrafici delle persone dell'organizzazione. Quando si aggiunge un contatto alla matrice "Governance e Organi Decisionali", l'utente potrà:

1. **Scegliere dalla rubrica** - Selezionare una persona già censita
2. **Creare nuovo contatto** - Inserire i dati da zero (e opzionalmente salvare nella rubrica)

Questo permette:
- La stessa persona (es. "Luca Rossi") può avere **ruoli multipli** con email/telefoni diversi per ruolo
- I dati anagrafici base (nome, telefono, email principale) sono riutilizzabili
- Nessuna perdita di tempo nel reinserire i dati

---

### Architettura Database

#### Nuova tabella: `contact_directory`
Questa tabella contiene le "persone" dell'organizzazione, separata dai ruoli IRP.

| Colonna | Tipo | Descrizione |
|---------|------|-------------|
| id | uuid | Primary key |
| organization_id | uuid | FK organizzazione |
| first_name | text | Nome |
| last_name | text | Cognome |
| job_title | text | Titolo aziendale |
| phone | text | Telefono principale |
| email | text | Email principale |
| notes | text | Note opzionali |
| created_at | timestamp | Data creazione |
| updated_at | timestamp | Data modifica |

La tabella `emergency_contacts` esistente rimane invariata ma conterrà un **riferimento opzionale** alla rubrica tramite un nuovo campo:
- `directory_contact_id` (uuid, nullable) - FK alla rubrica

---

### Componenti UI

#### 1. Nuovo componente: `ContactDirectoryDialog.tsx`
Una modale accessibile dal form contatti che mostra:
- Lista contatti in rubrica con ricerca
- Pulsante per selezionare un contatto
- Pulsante per creare nuovo contatto in rubrica

#### 2. Modifica: `IRPContactForm.tsx`
Aggiungere:
- Pulsante "Seleziona dalla Rubrica" sopra i campi nome
- Quando si seleziona dalla rubrica, i campi Nome, Cognome, Email, Telefono vengono precompilati
- Checkbox "Salva nella Rubrica" quando si inserisce un nuovo contatto

#### 3. Nuovo componente: `ContactDirectoryManager.tsx`
Una sezione nella pagina Settings o direttamente in Incident Response per:
- Visualizzare tutti i contatti in rubrica
- Aggiungere/modificare/eliminare contatti dalla rubrica
- Importare contatti esistenti nella rubrica

---

### Flusso Utente

```text
+-----------------------------------------------------------+
|  AGGIUNGI CONTATTO GOVERNANCE                             |
|                                                           |
|  [📖 Seleziona dalla Rubrica]  oppure compila manualmente |
|                                                           |
|  +-------------------------------------------------------+|
|  | Nome:     [Mario        ]  Cognome: [Rossi          ] ||
|  | Titolo:   [IT Manager   ]  Ruolo IRP: [dropdown     ] ||
|  | Telefono: [333-1234567  ]  Email: [m.rossi@...      ] ||
|  | Responsabilità: [textarea]                            ||
|  +-------------------------------------------------------+|
|                                                           |
|  [x] Salva questa persona nella Rubrica                   |
|                                                           |
|  [Annulla]                              [Aggiungi]        |
+-----------------------------------------------------------+
```

**Quando si clicca "Seleziona dalla Rubrica":**

```text
+-----------------------------------------------------------+
|  RUBRICA CONTATTI                                    [X]  |
|                                                           |
|  [🔍 Cerca per nome...                               ]    |
|                                                           |
|  +-------------------------------------------------------+|
|  | Mario Rossi      | IT Manager     | [Seleziona]       ||
|  | Luca Bianchi     | CISO           | [Seleziona]       ||
|  | Anna Verdi       | CTO            | [Seleziona]       ||
|  +-------------------------------------------------------+|
|                                                           |
|  [+ Aggiungi nuovo alla Rubrica]                          |
+-----------------------------------------------------------+
```

---

### File da Creare/Modificare

| File | Azione |
|------|--------|
| `supabase/migrations/xxx_add_contact_directory.sql` | Creare tabella `contact_directory` con RLS |
| `src/components/irp/ContactDirectoryDialog.tsx` | Nuovo - Modale selezione dalla rubrica |
| `src/components/irp/ContactDirectoryForm.tsx` | Nuovo - Form per aggiungere/modificare contatto rubrica |
| `src/components/irp/IRPContactForm.tsx` | Modificare - Aggiungere integrazione rubrica |
| `src/hooks/useContactDirectory.ts` | Nuovo - Hook per CRUD rubrica |
| `src/types/irp.ts` | Aggiungere tipo `DirectoryContact` |

---

### Dettagli Tecnici

#### Migration SQL

```sql
-- Tabella rubrica contatti
CREATE TABLE contact_directory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id),
  first_name text NOT NULL,
  last_name text NOT NULL,
  job_title text,
  phone text,
  email text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indice per ricerca veloce
CREATE INDEX idx_contact_directory_org ON contact_directory(organization_id);
CREATE INDEX idx_contact_directory_name ON contact_directory(organization_id, last_name, first_name);

-- RLS
ALTER TABLE contact_directory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their organization's contacts" ON contact_directory
  FOR SELECT USING (organization_id IN (
    SELECT organization_id FROM users WHERE auth_user_id = auth.uid()
  ));

CREATE POLICY "Users can manage their organization's contacts" ON contact_directory
  FOR ALL USING (organization_id IN (
    SELECT organization_id FROM users WHERE auth_user_id = auth.uid()
  ));

-- Aggiungere riferimento alla rubrica in emergency_contacts
ALTER TABLE emergency_contacts 
  ADD COLUMN directory_contact_id uuid REFERENCES contact_directory(id) ON DELETE SET NULL;
```

#### Hook `useContactDirectory.ts`

```typescript
// Funzioni principali:
// - fetchContacts() - Lista contatti rubrica
// - searchContacts(query) - Ricerca per nome
// - addContact(data) - Aggiungi alla rubrica
// - updateContact(id, data) - Modifica
// - deleteContact(id) - Elimina
```

#### Componente `ContactDirectoryDialog.tsx`

```typescript
// Props:
// - open: boolean
// - onOpenChange: (open: boolean) => void
// - onSelectContact: (contact: DirectoryContact) => void

// Features:
// - Ricerca in tempo reale
// - Lista scrollabile
// - Pulsante selezione per ogni riga
// - Pulsante per aggiungere nuovo
```

---

### Vantaggi della Soluzione

1. **Riutilizzabilità**: Una persona può essere assegnata a più ruoli IRP senza reinserire i dati
2. **Consistenza**: I dati anagrafici sono centralizzati
3. **Flessibilità**: Email/telefono possono variare per ruolo (override nel form governance)
4. **Non invasiva**: La tabella `emergency_contacts` esistente rimane funzionante
5. **Opzionale**: L'utente può comunque inserire dati manualmente senza usare la rubrica

