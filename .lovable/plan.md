

# Piano: Gestione Multi-Cliente per Sales/Admin

## Panoramica

Implementazione di un sistema che permette agli utenti Sales e Admin di gestire più clienti (organizzazioni), potendo selezionare quale cliente visualizzare e passare liberamente da uno all'altro.

## Flusso Utente Finale

1. L'utente Sales/Admin fa login
2. Viene reindirizzato alla pagina `/clients` con la lista di tutti i clienti
3. Seleziona un cliente e viene salvato il contesto
4. Può navigare in tutti i moduli vedendo i dati di quel cliente
5. Dall'header può cambiare cliente in qualsiasi momento o tornare alla selezione

---

## Fase 1: Database - RLS Policies

### Nuova Funzione Database

Creare una funzione per verificare se l'utente può gestire più organizzazioni:

```sql
CREATE OR REPLACE FUNCTION public.can_manage_all_organizations(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('super_admin', 'sales')
  )
$$;
```

### Aggiornamento RLS Policies

Per ogni tabella con dati cliente (organization_profiles, contact_directory, emergency_contacts, ecc.), aggiungere policy che permettano a sales/admin di accedere a tutte le organizzazioni:

```sql
-- Esempio per organization_profiles
CREATE POLICY "Sales can view all organization profiles"
ON organization_profiles FOR SELECT
USING (can_manage_all_organizations(auth.uid()));

-- Ripetere per tutte le tabelle rilevanti
```

**Tabelle da aggiornare:**
- `organization_profiles`
- `contact_directory`
- `emergency_contacts`
- `irp_documents`
- `playbook_completions`
- `risk_analysis`
- `critical_infrastructure`
- `remediation_tasks`
- `assessment_responses`
- `asset_inventory`

---

## Fase 2: Client Context (React)

### Nuovo Context: `ClientContext.tsx`

```text
src/contexts/ClientContext.tsx
```

**Funzionalità:**
- `selectedOrganization`: l'organizzazione attualmente selezionata
- `setSelectedOrganization()`: cambia organizzazione
- `clearSelection()`: torna alla selezione clienti
- `canManageMultipleClients`: booleano che indica se l'utente è sales/admin
- Persistenza in localStorage per ricordare la scelta

**Struttura:**

```text
interface ClientContextType {
  selectedOrganization: Organization | null;
  setSelectedOrganization: (org: Organization) => void;
  clearSelection: () => void;
  canManageMultipleClients: boolean;
  isLoadingClients: boolean;
}
```

---

## Fase 3: Pagina Selezione Clienti

### Nuova Pagina: `/clients`

```text
src/pages/ClientSelection.tsx
```

**Design della pagina:**
- Header con titolo "Gestione Clienti"
- Barra di ricerca per filtrare clienti
- Griglia di cards con:
  - Nome organizzazione
  - Codice cliente
  - Data creazione
  - Badge con stato servizi attivi
  - Pulsante "Gestisci" per selezionare

**Caratteristiche:**
- Responsive: cards in griglia (1-3 colonne)
- Ricerca in tempo reale
- Ordinamento alfabetico
- Loading skeleton durante il caricamento

---

## Fase 4: Header con Indicatore Cliente

### Nuovo Componente: `ClientIndicator.tsx`

```text
src/components/layout/ClientIndicator.tsx
```

Un componente nell'header che mostra:
- Nome del cliente attualmente selezionato
- Pulsante per cambiare cliente (torna a /clients)
- Visibile solo per utenti sales/admin

Verrà integrato nel `DashboardLayout.tsx` nell'area header.

---

## Fase 5: Aggiornamento Hook Esistenti

### Pattern Comune

Tutti gli hook che attualmente ottengono `organization_id` dall'utente loggato devono essere aggiornati per usare il context:

**Prima:**
```typescript
const { data: userData } = await supabase
  .from('users')
  .select('organization_id')
  .eq('auth_user_id', user.id)
  .single();
```

**Dopo:**
```typescript
const { selectedOrganization } = useClientContext();
const organizationId = selectedOrganization?.id || userOrganizationId;
```

### Hook da Modificare

| Hook | File |
|------|------|
| useOrganizationProfile | `src/hooks/useOrganizationProfile.ts` |
| useContactDirectory | `src/hooks/useContactDirectory.ts` |
| useIRPDocument | `src/hooks/useIRPDocument.ts` |
| usePlaybookCompletions | `src/hooks/usePlaybookCompletions.ts` |
| useRiskAnalysis | `src/hooks/useRiskAnalysis.ts` |
| useCriticalInfrastructure | `src/hooks/useCriticalInfrastructure.ts` |

### Nuovo Hook: `useClientOrganization`

```text
src/hooks/useClientOrganization.ts
```

Hook helper che:
1. Controlla se l'utente può gestire più clienti
2. Restituisce l'`organization_id` corretto (da context o da profilo utente)
3. Fornisce metodo per ricaricare l'organizzazione

---

## Fase 6: Routing e Protezione

### Aggiornamento App.tsx

- Aggiungere route `/clients`
- Wrappare le routes con `ClientProvider`
- Redirect automatico a `/clients` per sales se nessun cliente selezionato

### Componente Guard

```text
src/components/guards/ClientSelectionGuard.tsx
```

Componente che verifica se:
- L'utente è sales/admin
- Ha un cliente selezionato
- Altrimenti redirect a `/clients`

---

## Fase 7: Aggiornamento Sidebar

### Modifiche a `AppSidebar.tsx`

Per utenti sales/admin:
- Aggiungere voce "Selezione Clienti" in cima al menu
- Mostrare nel footer il nome del cliente selezionato
- Cambiare stile per indicare la "modalità gestione cliente"

---

## Riepilogo File da Creare/Modificare

### Nuovi File
1. `src/contexts/ClientContext.tsx` - Context per gestione cliente
2. `src/pages/ClientSelection.tsx` - Pagina selezione clienti
3. `src/components/layout/ClientIndicator.tsx` - Indicatore nell'header
4. `src/components/guards/ClientSelectionGuard.tsx` - Guard per redirect
5. `src/hooks/useClientOrganization.ts` - Hook helper

### File da Modificare
1. `src/App.tsx` - Nuove routes e provider
2. `src/components/layout/DashboardLayout.tsx` - Aggiungere ClientIndicator
3. `src/components/layout/AppSidebar.tsx` - Voce menu e stile
4. `src/hooks/useOrganizationProfile.ts` - Usare context
5. `src/hooks/useContactDirectory.ts` - Usare context
6. `src/hooks/useIRPDocument.ts` - Usare context
7. `src/hooks/usePlaybookCompletions.ts` - Usare context
8. `src/hooks/useRiskAnalysis.ts` - Usare context
9. `src/hooks/useCriticalInfrastructure.ts` - Usare context

### Migrazioni Database
1. Funzione `can_manage_all_organizations`
2. RLS policies per SELECT su tutte le tabelle rilevanti

---

## Ordine di Implementazione

1. **Migrazioni DB** - Funzione e RLS policies
2. **ClientContext** - Context base con persistenza
3. **Pagina ClientSelection** - UI selezione clienti
4. **useClientOrganization** - Hook helper
5. **Aggiornamento hooks** - Tutti gli hook esistenti
6. **Routing e guards** - Protezione routes
7. **UI (Header + Sidebar)** - Indicatori visivi

---

## Note Tecniche

- Il localStorage viene usato per persistere la selezione tra sessioni
- Gli utenti "client" normali non vedono nulla di diverso
- Le RLS policies garantiscono sicurezza lato server
- Il context viene resettato al logout

