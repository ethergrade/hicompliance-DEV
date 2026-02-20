
## Sposta "Analisi" nel sottomenu HiCompliance

### Modifica unica: `src/components/layout/AppSidebar.tsx`

1. **Rimuovi `Analisi` dall'array `navigation`** — elimina la voce `{ title: 'Analisi', href: '/analytics', icon: BarChart3 }`.

2. **Aggiungi `Analisi` in `hiComplianceModules` dopo `Remediation`** — inserisci la stessa voce come quinto elemento.

Risultato finale di `hiComplianceModules`:

```text
hiComplianceModules = [
  Assessment      → /assessment
  SurfaceScan360  → /surface-scan
  DarkRisk360     → /dark-risk
  Remediation     → /remediation
  Analisi         → /analytics   ← NUOVO
]
```

Nessun altro file deve essere modificato.
