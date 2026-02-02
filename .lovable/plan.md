

## Piano: Correzione Errore Inserimento Contatti di Esempio

### Problema Identificato
L'errore `"violates check constraint \"emergency_contacts_category_check\""` è causato dal fatto che il codice tenta di inserire contatti con `category: 'governance'`, ma il database ha un constraint che permette solo:
- `'security'`
- `'it'`
- `'authorities'`

### Soluzione
Aggiornare il check constraint del database per includere la categoria `'governance'`.

---

### Modifica Database

Creare una migration per modificare il constraint:

```sql
-- Rimuovere il vecchio constraint
ALTER TABLE emergency_contacts DROP CONSTRAINT IF EXISTS emergency_contacts_category_check;

-- Aggiungere il nuovo constraint con 'governance' incluso
ALTER TABLE emergency_contacts ADD CONSTRAINT emergency_contacts_category_check 
CHECK (category = ANY (ARRAY['security', 'it', 'authorities', 'governance']));
```

---

### Riepilogo

| Componente | Modifica |
|------------|----------|
| Database `emergency_contacts` | Aggiornare check constraint per includere `'governance'` |

### Nota
Non sono necessarie modifiche al codice TypeScript - la logica è corretta, manca solo la categoria nel database.

