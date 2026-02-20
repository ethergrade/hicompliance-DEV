
## Sposta "Remediation" nel sottomenu HiCompliance

### Modifica unica: `src/components/layout/AppSidebar.tsx`

**Due cambiamenti nel file:**

1. **Rimuovi `Remediation` dall'array `navigation`** (riga 54):
   - Elimina la voce `{ title: 'Remediation', href: '/remediation', icon: Wrench }` dall'array generale.

2. **Aggiungi `Remediation` in `hiComplianceModules` dopo `DarkRisk360`** (riga 64):
   - Inserisci `{ title: 'Remediation', href: '/remediation', icon: Wrench }` come quarto elemento, subito sotto `DarkRisk360`.

Il risultato finale dell'array `hiComplianceModules` sarà:

```text
hiComplianceModules = [
  Assessment    → /assessment
  SurfaceScan360 → /surface-scan
  DarkRisk360   → /dark-risk
  Remediation   → /remediation   ← NUOVO
]
```

La voce rispetta già `isModuleEnabled` (filtro ruoli) perché viene renderizzata con lo stesso `renderNavItem` usato per gli altri elementi del gruppo. Nessun altro file deve essere modificato.
