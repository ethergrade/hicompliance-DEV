
# Piano: Convertire "Severity SLA" in Selezione Singola (Radio Button)

## Problema
La sezione "Severity, SLA e Escalation" usa attualmente checkbox normali con conteggio "1/4 completati". Questo non ha senso perche' le 4 opzioni (CRITICO, ALTO, MEDIO, BASSO) sono **mutualmente esclusive** - l'utente deve sceglierne solo UNA.

## Soluzione
Aggiungere un nuovo tipo di sezione `radio` (o flag `singleChoice`) che:
1. Permette di selezionare solo un item alla volta
2. Mostra "1/1" quando selezionato invece di "1/4"
3. Deseleziona automaticamente le altre opzioni quando ne viene scelta una

---

## Modifiche Pianificate

### 1. Estendere il Tipo `PlaybookSection`

Aggiungere flag opzionale `singleChoice` al tipo esistente:

```typescript
// src/types/playbook.ts
export interface PlaybookSection {
  id: string;
  title: string;
  subtitle?: string;
  type: 'text' | 'checklist' | 'input-list' | 'notes';
  singleChoice?: boolean;  // <-- NUOVO: Se true, solo 1 item selezionabile
  items?: PlaybookChecklistItem[];
  // ...
}
```

### 2. Aggiornare `common-standards.ts`

Aggiungere `singleChoice: true` alla sezione severity-sla:

```typescript
{
  id: 'severity-sla',
  title: 'Severity, SLA e Escalation',
  subtitle: 'riferimento unico',
  type: 'checklist',
  singleChoice: true,  // <-- NUOVO
  items: [...]
}
```

### 3. Creare Componente `PlaybookRadioSection`

Nuovo componente che usa `RadioGroup` invece di `Checkbox`:
- Renderizza le opzioni come radio buttons
- Gestisce la selezione singola
- Mantiene lo stesso stile visivo (card, note, link, screenshot)

### 4. Aggiornare `PlaybookViewer.tsx`

Modificare la logica di rendering per:
- Usare `PlaybookRadioSection` quando `singleChoice: true`
- Calcolare il badge come "1/1" (se selezionato) o "0/1" (se non selezionato)

### 5. Aggiornare `calculatePlaybookProgress`

Modificare la logica per contare correttamente le sezioni single-choice:
- Se `singleChoice: true`: conta come 1 item totale, completato se almeno uno e' selezionato
- Altrimenti: comportamento attuale (conta tutti gli items)

---

## File da Modificare

| File | Modifica |
|------|----------|
| `src/types/playbook.ts` | Aggiungere `singleChoice?: boolean` a `PlaybookSection` |
| `src/data/playbooks/common-standards.ts` | Aggiungere `singleChoice: true` a severity-sla |
| `src/components/irp/PlaybookRadioSection.tsx` | **NUOVO** - Componente radio per selezione singola |
| `src/components/irp/PlaybookViewer.tsx` | Usare RadioSection quando appropriato |
| `src/types/playbook.ts` | Aggiornare `calculatePlaybookProgress` per gestire singleChoice |

---

## Risultato Finale

Prima:
```
Severity, SLA e Escalation    [1/4]
☑ CRITICO: 0-2h...
☐ ALTO: 2-8h...
☐ MEDIO: 8-24h...
☐ BASSO: 24-72h...
```

Dopo:
```
Severity, SLA e Escalation    [1/1] ✓
◉ CRITICO: 0-2h...
○ ALTO: 2-8h...
○ MEDIO: 8-24h...
○ BASSO: 24-72h...
```

L'utente potra' selezionare solo una severita' e il conteggio mostrera' correttamente "1/1" quando completato.
