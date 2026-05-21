## Perché vedi "Remediation Disponibile"

Il badge appare ogni volta che il campo `remediation` del finding è valorizzato:

```ts
patchAvailable: Boolean(finding.remediation)
```

Per `shared_hosting_detected` il modulo backend (`intelModules.ts` → `hostingContextModule`) salva sempre una stringa di consiglio:

> "Valida le CVE con scan attivi a livello applicativo. Considera hosting dedicato per ridurre rischio side-channel..."

Tecnicamente non è una **patch**: è un suggerimento di mitigazione/hardening. L'etichetta "Remediation Disponibile" è quindi fuorviante in questi casi informativi.

## Cosa propongo

In `src/components/surface-scan/SecurityFindings.tsx`:

1. **Rinominare il badge** in `"Mitigazione Suggerita"` (verde, icona Lightbulb) — descrive correttamente sia patch CVE sia consigli OSINT/hosting.
2. **Tooltip / popover sul badge**: al click/hover mostra il testo completo di `vuln.remediation` invece di richiedere all'utente di scorrere il finding.
3. **Distinguere visivamente** i due casi:
   - Finding con CVE reali (`vuln.cve.length > 0`) → badge `"Patch CVE Disponibile"` (verde forte).
   - Finding senza CVE ma con `remediation` (es. `shared_hosting_detected`, `security_headers`) → badge `"Mitigazione Suggerita"` (verde tenue/outline).
4. Nessun cambio backend: il campo `remediation` rimane com'è, cambia solo la presentazione.

## Note

- Nessuna migrazione DB.
- Cambio circoscritto al componente `SecurityFindings.tsx` (sezione "Dettagli Findings", righe ~743-749).