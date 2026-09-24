# Assessment: nuovi snapshot, confronto tra anni e report di confronto

## Cosa vedrai
Nella sezione "Storico & Gap Analysis" della pagina Assessment:

1. **Pulsante "Genera nuovo snapshot"**: salva nel database il punteggio globale e i punteggi per categoria in quel momento. Ogni snapshot ha anno, data e un'etichetta facoltativa (es. "2026 - Q3", "Pre-audit"). Si possono salvare più snapshot nello stesso anno, e il nuovo snapshot non sovrascrive i precedenti.
2. **Scelta del confronto**: due menu, "Da" (snapshot di partenza) e "A" (un altro snapshot oppure "Situazione attuale"). Oggi, se clicchi 2026 durante il 2026, appare "Confronto 2026 -> 2026". Con i due menu questo errore scompare: le etichette mostrano sempre i due snapshot scelti (es. "2025 - 44/100 -> 2026 - 56/100").
3. **Chip degli snapshot**: rimangono come negli screen (anno e punteggio). Il clic imposta lo snapshot come "Da". Ogni chip ha un'icona per eliminare lo snapshot, riservata ad admin e super admin.
4. **Legenda colori sempre visibile** sopra il grafico e nel report:
   - grigio = snapshot di partenza
   - verde = migliorata
   - rosso = peggiorata
   - viola = stabile
   
   La stessa colorazione si applica anche ai numeri delle liste "Migliori miglioramenti" e "Aree critiche".
5. **Correzioni al riepilogo**: in "Migliori miglioramenti" compaiono solo le categorie con variazione positiva. Le "Aree critiche" sono le categorie peggiorate o con il punteggio più basso, non quelle con variazione 0.
6. **Pulsante "Esporta report di confronto (PDF)"**: il PDF contiene:
   - intestazione con cliente, data e i due snapshot confrontati;
   - punteggio globale con la variazione;
   - la legenda dei colori;
   - un grafico a barre per categoria;
   - una tabella per categoria: punteggio Da, punteggio A, variazione, stato (colorato);
   - l'elenco dei miglioramenti e delle aree critiche.

## Dettagli tecnici
- **Modifica al database** sulla tabella degli snapshot esistente: si aggiungono i campi `label` e `snapshot_date` e si rimuove il vincolo "uno per anno" (organization_id, snapshot_year). I dati esistenti restano. Le regole di accesso attuali restano invariate. Aggiunta la regola per l'eliminazione, riservata ad admin e super admin.
- `assessment-v2.ts`:
  - `createSnapshot` passa da upsert a insert, con etichetta e anno;
  - nuovo `deleteSnapshot`;
  - la lista degli snapshot è ordinata per data.
- `useAssessmentSnapshots`: espone `saveSnapshot(label?)` e `deleteSnapshot(id)`.
- `GapAnalysisSection.tsx`:
  - stato `fromId` e `toId`, dove "Situazione attuale" è il valore speciale `current`;
  - dialog con l'etichetta per il nuovo snapshot;
  - legenda in HTML sopra il grafico;
  - colori presi dai token del tema.
- Nuovo `src/lib/report/exportAssessmentComparisonPdf.ts` con jsPDF, già usato per il report assessment. Usa la stessa palette della legenda.
- Verifica nell'anteprima con Innovatech:
  1. generare uno snapshot;
  2. ricaricare la pagina e controllare che sia ancora presente;
  3. confrontare 2025 con 2026;
  4. esportare il PDF e controllare le pagine.
