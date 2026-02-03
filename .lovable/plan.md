
# Piano: Salvataggio Reattivo del Progresso Playbook

## Obiettivo

Implementare un sistema di salvataggio automatico che persista il progresso del playbook ogni volta che l'utente compila un campo o spunta un checkbox, senza richiedere un click esplicito. L'utente potra tornare dopo ore o giorni e trovare il lavoro esattamente dove lo aveva lasciato.

---

## Strategia Tecnica

### Approccio: Auto-save con Debounce

Ogni modifica allo stato del playbook triggera un salvataggio automatico, con un debounce di 500-1000ms per evitare eccessive scritture su localStorage.

```text
+------------------+     +------------------+     +------------------+
| Utente modifica  | --> | Debounce Timer   | --> | Salvataggio      |
| checkbox/input   |     | (500ms)          |     | localStorage     |
+------------------+     +------------------+     +------------------+
                                                         |
                                                         v
                                               +------------------+
                                               | Feedback visivo  |
                                               | "Salvato"        |
                                               +------------------+
```

### Componenti del Sistema

1. **useAutoSave hook**: Custom hook per gestire il salvataggio automatico con debounce
2. **Indicatore di stato**: Feedback visivo nell'header del playbook (Salvando... / Salvato)
3. **Timestamp ultimo salvataggio**: Mostra quando e stato salvato l'ultima volta

---

## Modifiche ai File

### 1. Nuovo Hook: `src/hooks/usePlaybookAutoSave.ts`

Hook dedicato per gestire:
- Debounce del salvataggio (500ms di ritardo dopo l'ultima modifica)
- Stato di salvataggio (idle / saving / saved)
- Timestamp ultimo salvataggio
- Cleanup automatico del timer

```typescript
interface UsePlaybookAutoSaveReturn {
  saveStatus: 'idle' | 'saving' | 'saved';
  lastSaved: Date | null;
  triggerSave: (playbook: Playbook) => void;
}
```

### 2. Modifica: `src/components/irp/PlaybookViewer.tsx`

Modifiche principali:
- Integrazione dell'hook usePlaybookAutoSave
- Rimozione del pulsante "Salva Progresso" (ora automatico)
- Aggiunta indicatore di stato nel header
- Auto-save su ogni modifica di playbookState

**Header con indicatore di stato:**
```text
+----------------------------------------------------------------+
|  PLAYBOOK: Phishing / Account Compromise              [Media]  |
|  Durata: 30 min - 1 ora                                        |
|                                                                |
|  [cloud-check icon] Salvato automaticamente - 2 min fa         |
+----------------------------------------------------------------+
```

### 3. Modifica: `src/components/irp/PlaybookProgressBar.tsx` (opzionale)

Aggiunta dello stato di salvataggio come informazione aggiuntiva nella progress bar.

---

## Flusso di Salvataggio

```text
1. Utente spunta checkbox "Confermare se evento o incidente"
         |
         v
2. handleItemChange() aggiorna playbookState
         |
         v
3. useEffect detecta cambio in playbookState
         |
         v
4. triggerSave() del hook avvia debounce timer
         |
         v
5. Se nessuna modifica per 500ms:
         |
         v
6. Salvataggio su localStorage
         |
         v
7. Aggiornamento stato: "Salvato" + timestamp
```

---

## Dettagli Implementativi

### usePlaybookAutoSave Hook

```typescript
export const usePlaybookAutoSave = (playbookId: string | null) => {
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const triggerSave = useCallback((playbook: Playbook) => {
    // Clear existing timer
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    setSaveStatus('saving');
    
    // Debounce: save after 500ms of no changes
    saveTimeoutRef.current = setTimeout(() => {
      const storageKey = `playbook_progress_${playbook.id}`;
      localStorage.setItem(storageKey, JSON.stringify(playbook));
      setSaveStatus('saved');
      setLastSaved(new Date());
    }, 500);
  }, []);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);
  
  return { saveStatus, lastSaved, triggerSave };
};
```

### Indicatore di Stato nel Header

Posizioni possibili:
- Sotto la progress bar
- Accanto al titolo
- Nel footer (con timestamp)

Scelta: sotto la progress bar, con icona + testo contestuale:
- Icona cloud animata + "Salvando..." durante il salvataggio
- Icona check + "Salvato automaticamente" + tempo relativo

### Gestione Edge Cases

1. **Chiusura improvvisa**: Il debounce di 500ms e abbastanza breve per catturare la maggior parte delle modifiche
2. **Caricamento progresso esistente**: Gia implementato, carica da localStorage all'apertura
3. **Reset playbook**: Rimuove da localStorage e resetta lastSaved
4. **Conflitti**: Non applicabile per localStorage (single-user)

---

## UI/UX Miglioramenti

### Stato Visivo

| Stato | Icona | Testo | Colore |
|-------|-------|-------|--------|
| Idle | - | - | - |
| Saving | CloudUp (animato) | Salvando... | Muted |
| Saved | CloudCheck | Salvato automaticamente - X min fa | Success |

### Footer Semplificato

Il pulsante "Salva Progresso" viene rimosso (ora automatico). Il footer diventa:
- Sinistra: Reset
- Destra: Scarica Checklist

---

## File da Modificare

| File | Modifiche |
|------|-----------|
| `src/hooks/usePlaybookAutoSave.ts` | NUOVO - Hook per auto-save con debounce |
| `src/components/irp/PlaybookViewer.tsx` | Integrazione auto-save, rimozione pulsante manuale, aggiunta indicatore stato |

---

## Riepilogo Funzionalita

1. Salvataggio automatico ogni 500ms dopo l'ultima modifica
2. Indicatore visivo "Salvando..." / "Salvato automaticamente"
3. Timestamp dell'ultimo salvataggio con tempo relativo (es. "2 min fa")
4. Persistenza in localStorage (ritorno dopo ore/giorni)
5. Rimozione del pulsante manuale "Salva Progresso"
6. Mantenimento del pulsante "Reset" per cancellare il progresso
