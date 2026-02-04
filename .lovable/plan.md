
# Piano: Spostare "Eventi Compliance" come Pagina Separata nella Sidebar

## Obiettivo
Spostare la sezione "Eventi Compliance" dalla tab in Remediation a una voce separata nella sidebar, posizionandola sotto la sezione **"Incident Remediation"** accanto a "Incident Response".

---

## Situazione Attuale

### Sidebar - Sezione "Incident Remediation"
Attualmente contiene:
- Incident Response (`/incident-response`)
- Threat Management (`/threat-management`)

### Pagina Remediation
Contiene 5 tab:
1. Panoramica Remediation
2. GANTT Operativo  
3. Azioni Eliminate
4. Metriche & KPI
5. **Eventi Compliance** (da spostare)

---

## Modifiche Pianificate

### 1. Creare Nuova Pagina `ComplianceEvents.tsx`

Nuova pagina dedicata che utilizza il componente esistente `ComplianceEventsTab`:

```text
/src/pages/ComplianceEvents.tsx
+----------------------------------------+
| DashboardLayout                        |
|   Header: "Eventi Compliance"          |
|   Breadcrumb: Incident Remediation >   |
|               Eventi Compliance        |
|   Content: <ComplianceEventsTab />     |
+----------------------------------------+
```

### 2. Aggiungere Route in App.tsx

```text
Route: /compliance-events
Component: ComplianceEvents
```

### 3. Modificare Sidebar (AppSidebar.tsx)

Aggiungere voce nella sezione "Incident Remediation":

```text
Incident Remediation
  ⚠ Incident Response
  📋 Eventi Compliance   <-- NUOVO
  🛡 Threat Management
```

Icona: `FileCheck` (gia' usata nel componente ComplianceEventsTab)

### 4. Rimuovere Tab da Remediation.tsx

Rimuovere:
- `TabsTrigger` per "Eventi Compliance"
- `TabsContent` con `<ComplianceEventsTab />`
- Import del componente

---

## File da Modificare

| File | Modifica |
|------|----------|
| `src/pages/ComplianceEvents.tsx` | **NUOVO** - Pagina dedicata |
| `src/App.tsx` | Aggiungere route `/compliance-events` |
| `src/components/layout/AppSidebar.tsx` | Aggiungere voce menu sotto "Incident Remediation" |
| `src/pages/Remediation.tsx` | Rimuovere tab "Eventi Compliance" |

---

## Dettagli Implementazione

### Nuova Pagina ComplianceEvents.tsx

La pagina:
- Utilizza `DashboardLayout` come wrapper (stile consistente)
- Include header con titolo e descrizione
- Renderizza `ComplianceEventsTab` come contenuto principale
- Mantiene la stessa logica e funzionalita'

### Aggiornamento Sidebar

Nella sezione "Incident Remediation" (linee 174-210 di AppSidebar.tsx):
- Aggiungere check `isModuleEnabled('/compliance-events')`
- Inserire `SidebarMenuItem` con:
  - Icona: `FileCheck`
  - Label: "Eventi Compliance"
  - Link: `/compliance-events`
  - Posizione: tra "Incident Response" e "Threat Management"

### Permessi

Aggiungere nuovo modulo nella tabella `role_module_permissions`:
- `module_path`: `/compliance-events`
- `module_name`: `Eventi Compliance`

Questo assicura che la visibilita' sia controllata dallo stesso sistema di permessi esistente.

---

## Risultato Finale

```text
SIDEBAR
+----------------------------+
| Sicurezza                  |
|   Home                     |
|   Dashboard                |
|   ...                      |
+----------------------------+
| Incident Remediation       |
|   ⚠ Incident Response     |
|   📋 Eventi Compliance     | <-- NUOVO
|   🛡 Threat Management     |
+----------------------------+
| Impostazioni               |
|   ...                      |
+----------------------------+
```

La pagina Remediation tornera' ad avere 4 tab come originariamente previsto, mentre "Eventi Compliance" sara' accessibile direttamente dalla sidebar.
