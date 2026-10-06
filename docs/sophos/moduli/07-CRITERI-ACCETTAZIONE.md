# Criteri di accettazione – integrazione Sophos in HiConsole

Ambito: integrazione **in sola lettura** con un **tenant pilota** per HiEndpoint, HiFirewall, HiDetect/MDR, HiMail, HiMobile, più IDS/IPS e punteggio di rischio unificato.
Ogni criterio è verificabile (Sì/No). Un modulo è "accettato" solo se tutti i criteri comuni e quelli del modulo sono Sì sul tenant pilota.

Riferimenti: [00-INDICE](00-INDICE.md), schede 01–06.

---

## A. Criteri comuni (tutti i moduli)

### A1. Collegamento e tenant
- [ ] Per ogni cliente HiSolution è registrabile un solo tenant Sophos (`sophos_tenant_id`, `api_host`/data region) nelle impostazioni del servizio cliente; modificabile solo da super admin/sales.
- [ ] Token OAuth (client credentials) ottenuto lato server; `whoami` restituisce tenant/partner e data region corretti.
- [ ] Per account partner: l'elenco tenant è letto e il tenant scelto corrisponde al cliente collegato.
- [ ] Le credenziali API hanno ruolo **sola lettura**; nessuna chiamata POST/PATCH/DELETE verso Sophos (escluse le query di ricerca XDR/quarantena che sono letture).
- [ ] Client ID/secret salvati solo come secret server-side: assenti dal bundle frontend, dalle risposte API, dai log e dal database (verifica con ricerca nel build e nei log).

### A2. Isolamento tra clienti
- [ ] Un utente cliente vede solo i dati del tenant Sophos associato alla propria organizzazione (test con due clienti: zero dati incrociati).
- [ ] Un cliente senza servizio attivo non vede il modulo né i suoi dati.
- [ ] Cambio cliente in HiConsole: nessun dato del cliente precedente resta visibile (cache con chiave per tenant).

### A3. Contratto dati e fallback
- [ ] `GET /<modulo>/dashboard?tenant_id=` restituisce esattamente il tipo `*DashboardData` del relativo hook; validazione schema senza errori.
- [ ] Campi non disponibili da Sophos (stato **No/Verif** nelle schede) sono assenti o `null`, **mai inventati**; la UI nasconde la sezione o mostra "Dato non disponibile".
- [ ] Badge "Demo Data" visibile solo quando i dati sono mock; con dati reali il badge non compare.
- [ ] Innovatech resta in demo e non chiama mai Sophos.

### A4. Freschezza, cache, limiti
- [ ] Ogni risposta include `fetched_at` (UTC) e la UI mostra "Aggiornato alle …".
- [ ] Cache server 5–15 min per tenant/modulo; refresh manuale rispettando la cache minima.
- [ ] Dato più vecchio di 2× l'intervallo di cache → indicatore "dato non aggiornato".
- [ ] HTTP 429: rispettato `Retry-After`, nessun errore bloccante in UI, ultimo dato valido mostrato con avviso.
- [ ] Paginazione completa (`nextKey`/`pageFromKey`, `cursor`/`has_more`): conteggi uguali a quelli della console Sophos.

### A5. Coerenza con la console Sophos
- [ ] Su un campione di 10 elementi per modulo, nome, stato, severità e data coincidono con Sophos Central.
- [ ] Totali (dispositivi, alert aperti, messaggi in quarantena) entro ±0 rispetto alla console allo stesso istante (o differenza spiegata dalla cache).

### A6. Errori e audit
- [ ] Credenziali errate/scadute, tenant inesistente, region sbagliata: messaggio chiaro in italiano, nessun dato parziale di un altro tenant.
- [ ] Log server di ogni chiamata (tenant, endpoint, esito, durata) senza token né dati personali in chiaro.
- [ ] Modifica dell'associazione tenant registrata in audit (chi, quando, valore prima/dopo).

### A7. Prestazioni
- [ ] Dashboard con dati in cache: caricamento < 2 s; a cache vuota < 10 s con indicatore di caricamento.
- [ ] Filtri colonne, query avanzata, ordinamento per rischio e paginazione funzionano sui dati reali come sui mock.

---

## B. HiEndpoint (Intercept X / Server)
- [ ] Elenco dispositivi da `/endpoint/v1/endpoints` completo (tutte le pagine); conteggio = console.
- [ ] Stato protezione derivato da `health.overall` secondo la regola documentata (good → Protected, bad/suspicious → At Risk, prodotto non aggiornato → Outdated, altro → Unknown).
- [ ] Tamper protection, online/offline, ultimo contatto, OS e versioni agente mostrati per ogni dispositivo.
- [ ] Minacce rilevate da alert endpoint con severità, data, dispositivo; ransomware classificato Critical.
- [ ] Contatori in alto coerenti con l'elenco filtrato.
- [ ] Nessuna distinzione portatile/fisso inventata: se non disponibile, tipo = Computer/Server.
- [ ] Punteggio di conformità del dispositivo con formula documentata nel codice e nella scheda.

## C. HiFirewall
- [ ] Scheda "Apparati" con firewall da `/firewall/v1/firewalls`: hostname, seriale, firmware, connesso sì/no, cluster.
- [ ] Aggiornamenti firmware disponibili mostrati per apparato.
- [ ] Minacce bloccate da alert/eventi SIEM firewall con sorgente, destinazione, tipo, severità, ora.
- [ ] Regole e contatori hit: **mostrati solo** se attiva la fonte on-box (API XML porta 4444) per quell'apparato; altrimenti sezione nascosta con nota.
- [ ] Log connessioni: **mostrati solo** se attiva una fonte log (syslog o Data Lake); altrimenti sezione nascosta.
- [ ] Credenziali on-box (se usate) solo server-side, accesso in sola lettura, IP sorgente autorizzato sul firewall.

## D. HiDetect / MDR
- [ ] Implementato sulle **nuove API XDR** (Fusion GraphQL); nessuna dipendenza dalle API REST deprecate dal 18/09/2026.
- [ ] Rilevamenti con severità, tattica/tecnica MITRE, dispositivo, regola, ora; conteggio = console nel periodo.
- [ ] Casi MDR con stato, assegnatario, data apertura/chiusura; tempo medio di risposta calcolato solo su casi chiusi.
- [ ] Grafici per severità, giorno e ora calcolati dai rilevamenti reali (somme = totale rilevamenti).
- [ ] Senza licenza XDR/MDR sul tenant: modulo mostra "Servizio non attivo su Sophos", nessun errore.

## E. HiMail
- [ ] Quarantena: mittente, destinatario, oggetto, motivo, data; conteggio = console.
- [ ] Minacce recenti (phishing, malware, BEC) da alert/eventi email.
- [ ] Top mittenti calcolato per dominio sugli eventi del periodo indicato.
- [ ] Totale email processate: **mostrato solo se** verificato disponibile da API; altrimenti KPI nascosto (non stimato).
- [ ] Nessuna azione di rilascio/cancellazione in questa fase.

## F. HiMobile
- [ ] Prerequisito: confermata su tenant reale la disponibilità dell'API dispositivi mobile; in caso negativo il modulo resta in demo e se ne dà evidenza nel report pilota.
- [ ] Inventario: nome, piattaforma, versione OS, modello, utente, ultimo sync, conformità.
- [ ] Distribuzione OS e conformità calcolate dall'inventario (somme = totale).
- [ ] Eventi di sicurezza mobile da alert.
- [ ] Batteria e app installate **nascoste** finché non verificate.
- [ ] Nessuna azione blocco/cancellazione/sync in questa fase.

---

## G. IDS/IPS (verifica separata)
La sezione attuale è un prototipo con dati di esempio. Accettazione solo dopo verifica delle fonti.

### G1. Fonti
- [ ] Per ogni modulo è documentata la fonte reale: firewall = eventi IPS/ATP da alert/SIEM (o log completi da syslog/Data Lake); endpoint e mobile = alert di protezione rete. Moduli senza fonte: sezione IDS nascosta.
- [ ] Ogni evento ha: ID, ora, sorgente, destinazione, porta, firma/regola, severità, azione (bloccato/rilevato), fonte.
- [ ] Gli eventi SIEM (consultabili max 24 h indietro) sono salvati lato nostro con cadenza ≤ 1 h, senza buchi né duplicati (dedup per ID evento).
- [ ] Retention dello storico eventi definita e applicata (valore da concordare, es. 90 giorni).

### G2. Storm e correlazioni (regole nostre)
- [ ] Regole documentate e configurabili: storm = ≥15 eventi dalla stessa sorgente in 5 minuti (valori di partenza), classificazione scansione/brute force/flood/raffica.
- [ ] Correlazioni per schema (stessa firma su molti bersagli; molte sorgenti su un bersaglio) e per comportamento (più fasi di attacco dalla stessa sorgente; attività dopo blocco), con affidabilità % e formula esplicita.
- [ ] Su un dataset di test con esiti attesi, storm e correlazioni rilevati = attesi (nessun falso positivo né negativo sul set).
- [ ] Ogni storm/correlazione rimanda agli eventi che l'hanno generata.
- [ ] In UI è indicato che storm e correlazioni sono calcolati da HiSolution, non da Sophos.

### G3. Visibilità
- [ ] I dati IDS di esempio non sono più visibili ai clienti reali: demo solo per Innovatech; altri clienti vedono dati reali o sezione nascosta.

---

## H. Punteggio di rischio unificato
- [ ] **Formula** pubblicata (in UI tramite tooltip e in documentazione): componenti, pesi per servizio, scala 0–100, soglie Basso/Medio/Alto.
- [ ] **Copertura** mostrata: quali servizi contribuiscono e quanti dispositivi/utenti coprono; servizi non collegati esclusi dal calcolo (non contati come 0 né come 100).
- [ ] **Freschezza**: ogni componente ha `fetched_at`; componente scaduto escluso o segnalato e il punteggio riporta "parziale".
- [ ] **Storico**: un valore salvato almeno al giorno per cliente, grafico ultimi 90 giorni, versione della formula salvata con ogni valore.
- [ ] Cambio formula = nuova versione; i valori storici non vengono ricalcolati in silenzio.
- [ ] Componente igiene da Account Health Check (se disponibile sul tenant) con peso dichiarato.
- [ ] Test: con input noti il punteggio calcolato coincide con il valore atteso.

---

## I. Uscita dal pilota
- [ ] Report pilota con: esito di ogni criterio, campi verificati/non disponibili per modulo, limiti di chiamata osservati, tempi di risposta.
- [ ] Schede 01–06 aggiornate con lo stato reale dei campi (API/Calc/Verif/No).
- [ ] Decisione scritta su: estensione ad altri clienti, attivazione fonti on-box/log firewall, fonti IDS confermate.
