

# Piano: HiLog Dashboard - Filtri avanzati, dati mock estesi e correlazioni

## Panoramica

Potenziamento significativo della dashboard HiLog con:
1. Molti piu dati mock realistici (da ~4 righe per tabella a 20-40+)
2. Filtri funzionanti per utente, IP, hostname, severity, date range
3. Barra di ricerca globale attiva su tutte le sezioni
4. Sezione correlazioni per collegare eventi tra sorgenti diverse

## Modifiche al file `HiLogDashboard.tsx`

### 1. Dati mock estesi (tutti anonymized)

Espandere ogni dataset con dati credibili:
- **Windows Logs**: ~30 righe con mix di login/logout/failure, utenti diversi (user001-user020), hostname diversi (WS-PC001-PC030, SRV-DC01, SRV-APP01-03, SRV-BACKUP01), IP vari (192.168.100.xxx, 192.168.101.xxx, 10.0.0.xxx)
- **Entra ID**: ~20 righe con app diverse (Outlook, Teams, SharePoint, Azure PowerShell, Graph API), location diverse (Milano, Roma, Londra, sospette da Russia/Cina), status misti
- **Security Events**: ~15 righe con severity miste, eventi come brute force, lateral movement, privilege escalation, anomalous login hours, USB policy violation
- **Firewall**: ~15 righe con azioni diverse (Allow, Block, Drop), severity varie, regole VPN, NAT, IPS
- **Hosts**: ~20 host con OS misti (Win 10/11/Server 2019/2022), issues count variabili
- **Users**: ~15 utenti AD, ~10 local, ~12 Entra ID
- **Startup/Shutdown**: ~15 righe

### 2. Stato e filtri funzionanti

Aggiungere state variables:
```text
globalSearch, severityFilter, sourceFilter, dateRangeFilter,
hostnameFilter, usernameFilter, ipFilter, actionFilter
```

Ogni tabella viene filtrata dai filtri attivi. Aggiungere una barra filtri globale in alto con:
- Input ricerca globale (cerca in tutti i campi di tutte le tabelle)
- Select severity (All / Low / Medium / High / Critical)
- Select source (All / Windows / Entra ID / Firewall / Security)
- Input hostname
- Input username/IP

### 3. Filtri per sezione

Attivare i pulsanti "Add filter" gia presenti ma non funzionanti. Ogni sezione filtra i propri dati tramite il globalSearch + filtri specifici.

### 4. Sezione Correlazioni (nuova)

Nuova sezione in fondo con:
- **Correlazione automatica**: dato un IP o username, mostra tutti gli eventi correlati tra Windows logs, Entra ID, firewall e security events
- Input per inserire un IP o username da correlare
- Tabella risultati aggregata con colonna "Source" che indica la provenienza
- Timeline visiva degli eventi correlati

### 5. Paginazione

Aggiungere paginazione (10 righe per pagina) a tutte le tabelle piu grandi.

## Riepilogo

| Cosa | Dettaglio |
|---|---|
| File modificato | `src/components/service-dashboards/HiLogDashboard.tsx` |
| Dati mock | Da ~20 righe totali a ~150+ |
| Filtri | Globali + per sezione, tutti funzionanti |
| Correlazioni | Nuova sezione cross-source |
| Paginazione | Su tutte le tabelle |

