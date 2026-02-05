
## Piano: Revisione Colori Analisi Rischi

### Obiettivo
Uniformare la scala cromatica per i punteggi dei controlli di sicurezza secondo questa logica:

| Score | Colore | Significato |
|-------|--------|-------------|
| 0 | Grigio | Non presente / Non applicabile |
| 1 | Rosso | Presente ma non incide sulla mitigazione |
| 2 | Giallo | Presente e parzialmente implementata |
| 3 | Verde | Presente e totalmente implementata |

Questa scala riflette un **miglioramento progressivo**: punteggi piu alti = controllo piu efficace = colore verde (positivo).

---

### Componenti da Modificare

#### 1. Toggle Buttons - Valutazione Controlli
**File**: `src/components/irp/RiskControlGroup.tsx`

Modificare la funzione `getScoreColor()`:
- 0: Grigio (`bg-muted`)
- 1: Rosso (`bg-destructive`)
- 2: Giallo/Amber (`bg-amber-500`)
- 3: Verde (`bg-emerald-500`)

---

#### 2. Heat Map - Celle della Matrice
**File**: `src/components/irp/RiskHeatMap.tsx`

Modificare la funzione `getScoreColor()` (righe 48-57):
- null/undefined: Grigio trasparente
- 0: Grigio
- 1: Rosso
- 2: Giallo
- 3: Verde

Aggiornare anche:
- **Legenda** (righe 337-364): aggiornare i colori visualizzati
- **Riepilogo per Categoria** (righe 505-508): aggiornare le soglie per medie

---

#### 3. Wizard - Indicatore Risk Score
**File**: `src/components/irp/RiskAnalysisWizard.tsx`

Aggiornare le funzioni:
- `getRiskColor()`: mantiene logica (score alto = rischio basso = verde)
- `getRiskLabel()`: mantiene logica corrente

---

#### 4. Asset Manager - Badge e Icone
**File**: `src/components/irp/RiskAnalysisManager.tsx`

Le funzioni `getRiskIcon()` e `getRiskBadgeVariant()` gestiscono il livello di rischio complessivo (alto/medio/basso), che segue una logica diversa (inversione):
- Score alto = Rischio basso = Verde (corretto)
- Score basso = Rischio alto = Rosso (corretto)

---

### Riepilogo Modifiche

```text
+---------------------------------+---------------------------+
| Componente                      | Tipo di modifica          |
+---------------------------------+---------------------------+
| RiskControlGroup.tsx            | getScoreColor()           |
| RiskHeatMap.tsx                 | getScoreColor() + Legenda |
| RiskHeatMap.tsx                 | Soglie Riepilogo          |
+---------------------------------+---------------------------+
```

---

### Dettagli Tecnici

**Nuova mappatura colori per i singoli score (0-3):**

```typescript
// Per score singolo (controllo)
case 0: return 'bg-muted text-muted-foreground';           // Grigio
case 1: return 'bg-destructive/60 text-destructive-foreground'; // Rosso
case 2: return 'bg-amber-500/60 text-amber-900';           // Giallo
case 3: return 'bg-emerald-500/60 text-emerald-900';       // Verde
```

**Legenda aggiornata:**
- N/V: Grigio trasparente (non valutato)
- 0: Grigio (Non presente)
- 1: Rosso (Non incide)
- 2: Giallo (Parziale)
- 3: Verde (Totale)

Questa modifica rendera coerente la visualizzazione in tutta la sezione Analisi Rischi.
