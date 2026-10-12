# HiTrack – Filtri, ordinamento, dettaglio salute, gruppi/tag, trend

Documento per il DEV per portare in produzione le modifiche del modulo HiTrack (ramo PROTOTIPO).
Regola: si usano solo dati già forniti da HiTrack (stato, RTD peggiore/mediana, packet loss, RAM, dischi, trend 24h/7g/30g). Nessun dato inventato.

## 1. File

| File | Contenuto |
|---|---|
| `src/components/service-dashboards/HiTrackDashboard.tsx` | pagina; usa i componenti sotto |
| `src/components/service-dashboards/HiTrackExtras.tsx` | `Sparkline`, `TrendDialog` (grafico storico), `HealthSheet`, `DevicesSection` (tabella con filtri/ordinamento/gruppi/tag), `useCardFilter` (dischi e RAM) |
| `src/lib/hitrack/hostHealth.ts` | punteggio per host, motivi, top 5, ricostruzione formula globale |
| `src/lib/hitrack/hostHealth.test.ts` | test Vitest |
| `src/lib/api/hitrack-organize.ts` | API gruppi e tag (Supabase) |
| Migrazione `hitrack_device_groups`, `hitrack_device_group_members`, `hitrack_device_tags` | persistenza gruppi/tag |

## 2. Funzioni

### 2.1 Tabella dispositivi
- Filtro per colonna: nome, IP, OS (testo), stato (lista), salute (valore massimo), packet loss (valore minimo); ricerca libera su nome/IP/tipo/vendor/OS/tag.
- Clic sull'intestazione: crescente -> decrescente -> nessun ordinamento. Nome asset A-Z / Z-A; IP ordinato numericamente; numeri dal più basso al più alto e viceversa.
- Pulsanti "Dal migliore al peggiore" / "Dal peggiore al migliore" (ordinano per salute host). Default: peggiore in cima.
- Paginazione 10 righe sui risultati filtrati.
- Selezione multipla (riga o pagina) per azioni in blocco.

### 2.2 Dischi e RAM
Filtro per nome, livello (Critico / Attenzione / OK), ordinamento peggiore/migliore e A-Z/Z-A.

### 2.3 Widget Health Score
Clic -> pannello laterale con:
- composizione del punteggio globale secondo `HITRACK_HEALTH_SCORE.md` (disponibilità 45, alert fino a -20, packet loss fino a -15, copertura 15, freschezza 5). È una **ricostruzione lato browser**: il valore ufficiale resta quello del backend. Parametri ricostruiti da allineare con `public.hitrack_health_score`: penalità alert = 2 punti per alert (max 20), packet loss = 3 punti per 1% medio (max 15), freschezza 5 se ≤ 15 min, 2,5 se ≤ 60 min, altrimenti 0.
- i 5 host con più problemi e il motivo (offline, RAM alta, disco pieno, rete degradata).
- soglie.

### 2.4 Punteggio per host (calcolato da noi)
Media delle componenti disponibili (quelle senza dati non pesano):

| Componente | Calcolo |
|---|---|
| Disponibilità | 100 online, 50 warning, 0 offline (`statusType`) |
| RAM | 100 fino a 80%, poi lineare fino a 0 a 100% (massimo tra le righe RAM dell'host) |
| Disco | come RAM, sul disco più pieno dell'host |
| Qualità rete (calcolata) | minimo tra: packet loss (100 a 0%, 0 a ≥5%) e RTD peggiore (100 fino a 100 ms, 0 a ≥300 ms) |

Associazione RAM/dischi all'host: stesso IP, oppure nome uguale (`deviceName` o `dimensionLabel` per host ESXi). In produzione è preferibile che il backend esponga direttamente `deviceId` su righe RAM/disco.

Soglie motivi: RAM/disco attenzione > 80%, critico > 90%; rete attenzione > 1% loss o > 100 ms, critico > 5% o > 300 ms.

**Banda:** HiTrack non fornisce oggi traffico in Mbps; la "qualità rete" è calcolata da packet loss e latenza ed è etichettata come tale. Per la banda reale: leggere in sync la variabile Domotz di traffico interfaccia (`/agent/{id}/device/{id}/variable` + `/history`, vedi `HITRACK_DOMOTZ_API_MAPPING.md`), aggiungere al payload `bandwidthInMbps`, `bandwidthOutMbps`, `interfaceSpeedMbps` e una componente "Saturazione banda" (utilizzo / velocità interfaccia) con le stesse soglie 80/90%.

### 2.5 Gruppi e tag
- Gruppi personali (visibili solo al creatore, per cliente): crea, elimina (quello filtrato), aggiungi/togli dispositivi selezionati.
- Tag condivisi nel cliente: aggiungi ai selezionati, rimuovi dal badge.
- Filtri per gruppo e tag; "Raggruppa per gruppo" mostra sezioni con numero host e salute media (più "Senza gruppo").
- Chiave dispositivo: `device_key = HiTrackMonitoredDevice.id`. In produzione deve essere stabile tra sync (consigliato `domotzDeviceId` + `collectorId`).

### 2.6 Trend RAM/disco
- Sparkline su scala fissa 0-100% (prima scalava sul massimo e appiattiva la linea), linea soglia 80%, colore per soglia, ultimo valore e min-max, tooltip.
- Il selettore 24h / 7d / 30d sceglie `trend24h/7d/30d`.
- Meno di 2 punti: "Storico non disponibile".
- Clic sulla sparkline: grafico storicizzato grande con soglie 80/90%.

## 3. Database

```text
hitrack_device_groups(id, organization_id, owner_user_id default auth.uid(), name, created_at)  unique(owner, org, name)
hitrack_device_group_members(group_id -> groups ON DELETE CASCADE, device_key)  pk(group_id, device_key)
hitrack_device_tags(id, organization_id, device_key, tag, created_by, created_at)  unique(org, device_key, tag)
```
RLS: gruppi e membri solo proprietario + `doc_can_access_org`; tag per utenti del cliente (`doc_can_access_org`). GRANT ad `authenticated` e `service_role`.
Se in produzione HiTrack resta su Laravel, replicare le stesse tabelle/permessi lato Laravel ed esporre endpoint `/companies/{id}/hitrack/groups|tags`.

## 4. Contratto atteso dal backend per i trend
- `trend24h`: un punto ogni 1-2 ore (12-24 punti); `trend7d`: uno al giorno o ogni 12 h (7-14); `trend30d`: uno al giorno (30).
- Valori percentuali 0-100, ordinati dal più vecchio al più recente, senza riempimenti finti: se manca un campione, ometterlo.
- Facoltativo ma consigliato: timestamp per punto (`[{ t, v }]`) per mostrare date sull'asse X.
- I trend attuali dei dati demo Innovatech sono sintetici; vanno sostituiti dalla history Domotz in produzione.

## 5. Storico Health Score (da fare)
Lo storico del punteggio non esiste. Proposta: tabella `hitrack_health_snapshots(organization_id, captured_at, health_score, components jsonb, host_scores jsonb)` scritta dal sync una volta al giorno, retention 400 giorni, grafico 30/90/365 giorni nel pannello Health.

## 6. Criteri di accettazione
- Ogni colonna della tabella dispositivi è filtrabile e ordinabile; Nome asset A-Z/Z-A; il conteggio paginazione riflette i filtri.
- "Dal peggiore al migliore" mette in cima l'host con salute più bassa; "Dal migliore al peggiore" il contrario.
- Il pannello Health mostra composizione, 5 host peggiori con motivo e soglie; nessun host sano compare tra i problematici.
- Componenti senza dati indicate "N/D" e non penalizzano.
- Gruppi visibili solo al creatore; tag visibili a tutti gli utenti del cliente; nessun accesso cross-cliente.
- Le sparkline cambiano con 24h/7d/30d, usano scala 0-100 e mostrano "Storico non disponibile" con meno di 2 punti.
- Nessuna voce mostra la banda in Mbps finché il backend non la fornisce.

## 7. Checklist rilascio
1. Applicare la migrazione (o equivalente Laravel).
2. Rendere stabile `device_key` tra sync.
3. Allineare i parametri della ricostruzione globale con `public.hitrack_health_score`.
4. Fornire trend reali dalla history Domotz (par. 4) e `deviceId` su righe RAM/disco.
5. Banda reale (par. 2.4) e storico Health Score (par. 5) come fase successiva.
6. Ripristinare l'ambiente Vitest (oggi non si avvia: incompatibilità `vitest`/`vite`) ed eseguire `hostHealth.test.ts`.
