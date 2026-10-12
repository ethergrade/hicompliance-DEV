# HiTrack: filtri, ordinamento, dettaglio salute, gruppi/tag, trend funzionanti

Usiamo solo i dati che HiTrack fornisce già: stato, latenza (RTD peggiore/mediana), packet loss, RAM, dischi, trend 24h/7g/30g. Nessun dato inventato.

## 1. Filtri e ordinamento su tutte e tre le tabelle (Dispositivi, Dischi, RAM)
- Filtro per ogni colonna (testo per nome/IP/OS, selezione per stato, soglia minima/massima per i valori numerici), più ricerca libera.
- Pulsanti in alto: **Dal migliore al peggiore** / **Dal peggiore al migliore** (in base al punteggio di salute dell'host).
- Clic sull'intestazione di colonna: alterna crescente / decrescente / nessuno, con freccia visibile. Nome asset: A-Z / Z-A; colonne numeriche: dal migliore al peggiore e viceversa.
- Per default i più a rischio stanno in cima (come negli altri moduli).
- La paginazione conta sempre i risultati filtrati.

## 2. Clic sul widget Health Score: "Perché questo punteggio"
Si apre un pannello laterale con:
- La scomposizione del punteggio globale secondo la formula già documentata (disponibilità 45, alert -20, packet loss -15, copertura dati 15, freschezza 5), con il valore di ogni voce.
- **I 5 host con più problemi**, ognuno con il motivo: RAM alta, disco pieno, rete degradata, offline.
- Soglie usate (mostrate nel pannello): RAM e disco attenzione oltre 80%, critico oltre 90%; rete attenzione con packet loss oltre 1% o RTD peggiore oltre 100 ms, critico oltre 5% o 300 ms.

Punteggio per host (0-100), calcolato da noi solo con i dati disponibili: media delle componenti presenti (RAM, disco, rete, disponibilità); se una componente manca non pesa e viene indicata come "dato non disponibile".

**Banda:** HiTrack oggi non fornisce traffico in Mbps. L'indicatore di rete "calcolato da noi" si basa su packet loss e latenza ed è etichettato "Qualità rete (calcolata)". La banda reale in Mbps va aggiunta in produzione leggendola dalla variabile Domotz dedicata (descritto nel documento).

## 3. Gruppi e tag
- L'utente crea gruppi propri (nome) e tag liberi, li assegna a uno o più host (anche in blocco con selezione multipla).
- Filtro per gruppo e per tag; opzione "Raggruppa per gruppo" che mostra le righe divise per sezioni con conteggi e punteggio medio.
- Salvati nel database per cliente; gruppi visibili solo a chi li crea, tag condivisi nel cliente.

## 4. Linee di trend RAM e disco funzionanti
- Correzione del disegno: scala fissa 0-100% (oggi la linea si schiaccia sul valore massimo), colore che segue la soglia, valore ultimo e min/max accanto, tooltip al passaggio.
- Il selettore 24h / 7g / 30g cambia davvero la serie mostrata.
- Con meno di 2 punti: "Storico non disponibile" invece di una linea finta.

## 5. Nice to have: grafico storicizzato
Clic sulla riga di un host: grafico grande RAM/disco sulla finestra scelta, con linee di soglia 80/90%. Usa le stesse serie di trend del backend. Lo storico del punteggio di salute non esiste ancora: nel documento è descritto come salvarlo (snapshot giornalieri).

## 6. Documento per il DEV
`docs/hitrack/HITRACK_FILTRI_SALUTE_GRUPPI.md`: funzioni, formula del punteggio per host e soglie, struttura dati gruppi/tag con permessi, contratto atteso dal backend per i trend (numero punti, intervallo), banda reale da Domotz, storico punteggio, criteri di accettazione e checklist di rilascio.

## Dettagli tecnici
- Nuovo `src/lib/hitrack/hostHealth.ts` (punteggio host, motivi, top 5, breakdown globale) con test Vitest.
- `HiTrackDashboard.tsx`: hook generico tabella (filtri colonne, ordinamento a 3 stati, preset best/worst), `Sheet` per Health, `Sparkline` riscritta, dialog con grafico recharts.
- Migrazione: `hitrack_device_groups` (owner_user_id, organization_id, name), `hitrack_device_group_members` (group_id, device_key), `hitrack_device_tags` (organization_id, device_key, tag). GRANT + RLS con `doc_can_access_org` e proprietario per i gruppi. `device_key` = id dispositivo HiTrack.
- Demo Innovatech: i trend demo esistenti restano; nessun nuovo dato finto.
