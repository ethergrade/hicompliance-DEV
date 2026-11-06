# Metadati Word: lettura automatica e modifica dalla piattaforma

## Obiettivo
Quando carichi un file Word (.docx), la piattaforma legge da sola Revisione, Stato, Classificazione, Categoria e gli altri campi scritti nel documento. Poi puoi cambiarli con un clic dall'elenco documenti, e il file Word scaricato riporta già i valori aggiornati, senza aprirlo.

## Cosa vedrai
1. **Lettura al caricamento**: scegli un .docx e i campi del modulo (nome, codice, revisione, stato, classificazione, categoria, descrizione, tag, redatto/revisionato/approvato da) si compilano da soli. Prima di salvare compare un riepilogo «Trovato nel documento», con la possibilità di accettare o ignorare ogni valore.
2. **Pulsante «Leggi metadati dal file»** sui documenti già caricati, per allineare la piattaforma al contenuto del Word.
3. **Modifica con un clic nell'elenco**: Stato, Classificazione e Categoria diventano menu a tendina sulla riga del documento, e la data di revisione si sceglie dal calendario. Le modifiche si salvano subito (salvataggio automatico).
4. **Scrittura nel Word**: ogni modifica aggiorna anche le proprietà interne del file e i campi nel testo (frontespizio o tabella di controllo). Così, scaricando il documento, i valori sono già corretti.
5. **Indicatore di allineamento**: un'etichetta «Allineato al file» oppure «Differenze con il file», con l'elenco dei campi che non coincidono.

## Regole
- La Revisione continua ad avanzare solo con «Carica nuova revisione», per non perdere lo storico ISO. La lettura la mostra ma non la cambia da sola.
- Lo Stato segue sempre il percorso Bozza → In Revisione → Approvato → Obsoleto. Un valore letto dal file che salta passaggi viene proposto, non applicato.
- Solo .docx. PDF e altri formati continuano con l'inserimento manuale.

## Dettagli tecnici
- Fonti lette, in ordine di priorità:
  1. `docProps/custom.xml`: proprietà personalizzate HiCompliance (Revisione, Stato, Classificazione, Categoria, Codice).
  2. `docProps/core.xml`: title, subject, keywords → tag, description, lastModifiedBy, revision.
  3. Campi DOCPROPERTY e controlli contenuto con tag (`w:sdt` con alias «Stato», «Revisione» ecc.).
  4. Righe testuali nel corpo, nell'intestazione e nel piè di pagina, tipo «Revisione: 2» o «Classificazione: Interno», trovate con alias italiani e inglesi.
- Nuovo modulo `src/lib/docxMetadata.ts` (con pizzip, già installato):
  - `readDocxMetadata(blob)` restituisce i valori trovati e la loro fonte.
  - `writeDocxMetadata(blob, meta)` aggiorna custom.xml e core.xml, i valori nei controlli contenuto, i campi DOCPROPERTY e le righe «Etichetta: valore» già presenti.
  - I valori vengono normalizzati sugli elenchi della piattaforma (DOCUMENT_STATUSES, CONFIDENTIALITY_LEVELS, categorie).
- Scrittura: dopo la modifica di un campo, il file viene riscritto sullo stesso percorso di archivio della versione corrente, senza creare una revisione. La riga in `document_versions` della revisione corrente resta coerente perché punta allo stesso file. Se la riscrittura del file non riesce, il dato in piattaforma resta salvato e compare l'avviso «File non aggiornato».
- Nessuna modifica al database: i campi esistono già in `incident_documents`.
- Test: lettura e scrittura di andata e ritorno su un docx di prova (custom props, controllo contenuto, riga testuale), normalizzazione dei valori e transizioni di Stato non ammesse.
