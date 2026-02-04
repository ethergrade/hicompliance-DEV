
# Piano: Mostrare le Date nel PlaybookViewer

## Obiettivo
Aggiungere badge/sezione nell'header del PlaybookViewer che mostri:
- **Iniziato**: 04/02/2026 10:30
- **Completato**: 04/02/2026 15:45 (solo se progresso = 100%)

---

## Situazione Attuale

Le date vengono tracciate automaticamente nel database (`playbook_completions`):
- `started_at`: impostato al primo salvataggio
- `completed_at`: impostato quando si raggiunge il 100%

Tuttavia, il `PlaybookViewer` non le visualizza perche':
1. Non recupera i dati dal database all'apertura
2. Le date non sono mostrate nell'interfaccia

---

## Modifiche Pianificate

### 1. Recuperare le Date dal Database

Modificare `PlaybookViewer.tsx` per:
- Importare e usare `usePlaybookCompletions` hook
- Recuperare il record corrispondente al playbook corrente
- Estrarre `started_at` e `completed_at`

### 2. Aggiungere Sezione Date nell'Header

Posizionare i badge sotto le info esistenti (durata, categoria) e sopra la progress bar:

```text
+------------------------------------------+
| Titolo Playbook                [Critica] |
| Descrizione                              |
|                                          |
| Clock 4-8h  |  Target Phishing           |
|                                          |
| [Calendar] Iniziato: 04/02/2026 10:30    |  <-- NUOVO
| [CheckCircle] Completato: 04/02/2026 15:45|  <-- NUOVO (se 100%)
|                                          |
| [======= Progress Bar 85% =========]     |
| Cloud Salvato automaticamente - 2 min fa |
+------------------------------------------+
```

### 3. Formattazione Data

Creare funzione helper per formattare le date in formato italiano:
- Input: ISO string (`2026-02-04T10:30:00.000Z`)
- Output: `04/02/2026 10:30`

---

## File da Modificare

| File | Modifica |
|------|----------|
| `src/components/irp/PlaybookViewer.tsx` | Aggiungere recupero date e visualizzazione |

---

## Dettagli Implementazione

### Recupero Date

All'interno del componente:
- Usare `usePlaybookCompletions` per ottenere `getCompletion`
- Chiamare `getCompletion(playbookState.id)` per recuperare il record
- Estrarre `started_at` e `completed_at`

### Nuovi Elementi UI

Aggiungere dopo le info (durata/categoria) e prima della progress bar:

```tsx
{/* Date Section */}
{completion && (
  <div className="flex flex-wrap items-center gap-3 text-sm mt-2">
    {completion.started_at && (
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Calendar className="w-4 h-4" />
        <span>Iniziato: {formatDateTime(completion.started_at)}</span>
      </div>
    )}
    {completion.completed_at && (
      <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
        <CheckCircle2 className="w-4 h-4" />
        <span>Completato: {formatDateTime(completion.completed_at)}</span>
      </div>
    )}
  </div>
)}
```

### Funzione Helper

```tsx
const formatDateTime = (isoString: string): string => {
  const date = new Date(isoString);
  return date.toLocaleDateString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};
// Output: "04/02/2026, 10:30"
```

---

## Risultato Finale

Nell'header del PlaybookViewer appariranno:
- **Iniziato**: data/ora del primo salvataggio (icona calendario, testo grigio)
- **Completato**: data/ora del completamento al 100% (icona check verde, solo se completato)

Le date si aggiornano automaticamente grazie al sync gia' esistente nel sistema di auto-save.
