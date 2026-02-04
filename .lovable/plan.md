
# Piano: Salvataggio Automatico Sostituto CISO

## Obiettivo
Salvare automaticamente il nome del sostituto CISO nel database quando viene inserito manualmente o selezionato dalla rubrica contatti, così da non perdere il dato al ricaricamento della pagina.

---

## Analisi Attuale

Il campo `cisoSubstitute` nel componente `GovernanceContactsTable.tsx`:
- E' gestito solo come stato React locale (`useState('')`)
- Non viene mai salvato su database
- Viene perso al refresh della pagina

---

## Soluzione Proposta

Estendere la tabella `organization_profiles` (già esistente) con un nuovo campo `ciso_substitute` per memorizzare il nome del sostituto.

---

## Modifiche Previste

### 1. Database Migration
Aggiungere il campo `ciso_substitute` alla tabella `organization_profiles`:

```sql
ALTER TABLE public.organization_profiles 
ADD COLUMN ciso_substitute TEXT;
```

### 2. Aggiornare i Tipi TypeScript
Modificare `src/types/organization.ts` per includere il nuovo campo:
- Aggiungere `ciso_substitute: string | null` all'interfaccia `OrganizationProfile`

### 3. Aggiornare l'Hook useOrganizationProfile
Modificare `src/hooks/useOrganizationProfile.ts`:
- Aggiungere `ciso_substitute` a `ProfileFormData`
- Aggiungere il campo nel payload di salvataggio
- Caricare il valore durante il fetch

### 4. Modificare GovernanceContactsTable
Aggiornare `src/components/irp/GovernanceContactsTable.tsx`:
- Importare e usare `useOrganizationProfile`
- Inizializzare `cisoSubstitute` dal profilo caricato
- Salvare automaticamente quando il valore cambia (con debounce)
- Mostrare indicatore di stato "Salvando..." / "Salvato"

---

## Flusso di Funzionamento

```text
Utente inserisce/seleziona nome
         |
         v
+----------------------+
| Aggiorna stato locale|
+----------------------+
         |
         v (debounce 1.5s)
+----------------------+
| Salva su database    |
| organization_profiles|
+----------------------+
         |
         v
+----------------------+
| Mostra "Salvato ✓"   |
+----------------------+
```

---

## File da Modificare

| File | Modifica |
|------|----------|
| Database migration | Aggiungere colonna `ciso_substitute` |
| `src/types/organization.ts` | Aggiungere campo al tipo |
| `src/hooks/useOrganizationProfile.ts` | Gestire load/save del campo |
| `src/components/irp/GovernanceContactsTable.tsx` | Integrare hook e auto-save |

---

## Vantaggi
- Riutilizza la tabella `organization_profiles` esistente (evita tabelle ridondanti)
- Segue lo stesso pattern di auto-save usato nel form anagrafica
- Il dato viene recuperato automaticamente al caricamento pagina
- Feedback visivo per l'utente sullo stato di salvataggio
