# Demo Innovatech: servizi, SurfaceScan360 e DarkRisk360

## Obiettivo
Creare una demo completa e credibile riservata a **Innovatech Group S.r.l.**, mantenendo invariati dati e comportamento di tutti gli altri clienti.

## Interventi
- Distribuire i servizi attivi della dashboard su stati realistici verdi, gialli e rossi, con Health Score e criticità coerenti tra loro.
- Ricostruire la presentazione di **SurfaceScan360** prendendo come riferimento il ramo `merge-imnick-IMNICK`, mantenendo l'accesso Supabase del ramo PROTOTIPO.
- Popolare SurfaceScan360 con un inventario demo più ampio: asset, domini, sottodomini, indirizzi, porte, findings, severità, stato scansioni ed evidenze.
- Ricostruire la presentazione di **DarkRisk360** dallo stesso riferimento e popolarla con esposizioni, evidenze, findings, alert, raccomandazioni e andamento temporale credibili.
- Aggiungere paginazione, filtri e stati vuoti coerenti dove gli elenchi sono lunghi.
- Eliminare dai mock nomi di clienti reali e qualunque riferimento a TELESAN.

## Isolamento e sicurezza
- I mock saranno attivati esclusivamente quando il cliente selezionato è `Innovatech Group S.r.l.`.
- Nessuna tabella, migrazione, credenziale o dato dei singoli servizi verrà modificato.
- Login, ruoli e selezione cliente continueranno a usare Supabase.

## Verifica
- Controllo dashboard con semafori misti.
- Controllo dei percorsi SurfaceScan360 e DarkRisk360 con liste paginate e dati demo.
- Verifica che un altro cliente non riceva alcun dato mock.
- Verifica finale di compilazione e assenza di errori visibili.
