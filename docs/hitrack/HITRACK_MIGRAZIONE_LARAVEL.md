# HiTrack — migrazione da Supabase al backend Laravel

Aggiornato al 5 agosto 2026. Sostituisce, per la parte di runtime, quanto descritto
in `HITRACK_PRODUCTION_HANDOFF.md`: schema, edge function e RPC vivono ora nel
backend Laravel. `HITRACK_DOMOTZ_API_MAPPING.md` e `HITRACK_HEALTH_SCORE.md`
restano validi — sono la specifica da cui è stato fatto il porting.

## Perché

Il handoff lo dichiarava apertamente: *«la repo usa auth Laravel nel browser; il
consumo frontend delle RPC Supabase è predisposto ma resta NOT VERIFIED fino a una
strategia JWT coerente»*. Il browser non ha mai avuto una sessione Supabase valida,
quindi il modulo non era utilizzabile — non per un difetto del codice, ma perché
metà della piattaforma stava da un'altra parte.

## Cosa corrisponde a cosa

| Prima (Supabase) | Ora (Laravel) |
|---|---|
| `supabase/migrations/20260716120000_...sql` | `database/migrations/2026_08_05_120000_create_hitrack_tables.php` |
| `_shared/hitrack-domotz.ts` → `domotzGet`, `fetchCollectorSnapshot` | `app/Services/HiTrack/DomotzClient.php` |
| `_shared/hitrack-domotz.ts` → `syncCollector` | `app/Services/HiTrack/CollectorSyncService.php` |
| funzione SQL `hitrack_health_score` | `app/Services/HiTrack/HealthScoreCalculator.php` |
| RPC `hitrack_get_dashboard` / `hitrack_get_collectors` | `app/Services/HiTrack/HiTrackDashboardService.php` |
| edge function `hitrack-discovery` | `php artisan hitrack:discover` |
| edge function `hitrack-scheduler` + `hitrack-worker` + tabella `hitrack_sync_jobs` | `php artisan hitrack:sync` + `App\Jobs\HiTrackSyncJob` (coda Laravel) |
| edge function `hitrack-retention` | `php artisan hitrack:prune-samples` |
| edge function `hitrack-sync-now` | `POST /companies/{company}/hitrack/sync` |
| RLS + `hitrack_can_access_organization` | trait `BelongsToGroup` + `HiTrackCollectorPolicy` + capability |

`organization_id` diventa la coppia `tenant_id` + `group_id`, come nel resto del
backend. La tabella di coda `hitrack_sync_jobs` non è stata portata: ritentativi e
fallimenti li gestisce la coda, lo stato per collector sta in `last_synced_at` e
`last_error_code`.

## Endpoint

```
GET  /companies/{company}/hitrack/dashboard    capability hitrack.view
GET  /companies/{company}/hitrack/collectors   capability hitrack.view
POST /companies/{company}/hitrack/sync         capability hitrack.manage
```

Il payload della dashboard è **identico** a quello della RPC — `overview`,
`collectors`, `monitoredDevices`, `ramMonitoring`, `logicalDisks`, `dataCoverage`,
chiavi in camelCase — dentro l'involucro `{ success, message, data }` comune a
tutte le API. `HiTrackDashboard.tsx`, `types.ts` e `formatters.ts` non sono stati
modificati, a parte la rimozione del blocco «Supabase non configurato», che con la
migrazione non ha più senso.

Capability: `hitrack.view` per admin, sales, customer e viewer; `hitrack.manage`
per admin e sales. Sincronizzare costa otto chiamate a Domotz per collector, e chi
ha sola lettura non deve poterle spendere.

## Comandi

```bash
php artisan hitrack:discover --tenant=<uuid>            # propone i collector, una persona conferma
php artisan hitrack:sync --tenant=<uuid> --now          # sincronizza subito, in-process
php artisan hitrack:sync                                # accoda tutti i collector abilitati
php artisan hitrack:prune-samples --dry-run             # conta cosa toglierebbe la ritenzione
```

Nello scheduler: `hitrack:sync` ogni quindici minuti (`withoutOverlapping(14)`) e
`hitrack:prune-samples` alle 04:30.

## Correzioni rispetto all'originale

Tre cose sono state cambiate, non per gusto ma perché non avrebbero funzionato.

1. **`source_key` sui campioni.** Sia l'inserimento sia la lettura dei trend
   scrivevano e filtravano su una colonna che `hitrack_metric_samples` non ha:
   entrambe le operazioni sarebbero fallite alla prima esecuzione contro un
   database vero. La serie è ora identificata da
   `(collector, device, metrica, dimensione)`.
2. **Sette chiavi metrica.** La documentazione riporta le etichette
   (`speed_test_download`), il codice e la RPC usano le chiavi
   (`collector_speed_test_download_bps`). Il catalogo segue le seconde.
3. **Riconoscimento delle metriche.** Non più una catena di espressioni regolari
   cablate, ma i `path_pattern` del catalogo: aggiungere una metrica è una riga di
   seeder.

## Limiti ereditati, da decidere

`online_devices` è posto uguale al numero di dispositivi gestiti e
`freshness_seconds` è fisso a zero, perché il payload Domotz non viene interrogato
per lo stato dei singoli dispositivi. La conseguenza è che **la voce disponibilità
del punteggio di salute non scende mai**: vale sempre 45 su 45, e il punteggio
reagisce solo ad alert aperti e packet loss. Erano già così nell'originale — i
"Known Limits" del handoff — e sono stati portati fedelmente perché correggerli
cambia un numero mostrato al cliente. Va deciso da quale campo ricavare lo stato.

La copertura RAM e disco resta parziale: su Etruria è 1 dispositivo su 9, ed è la
Public API a non esporre di più.

## Cosa resta di Supabase

Nulla a runtime: `src/lib/hitrack/client.ts` era l'ultimo file del frontend a
importare `@supabase/supabase-js`. Restano sul disco, come riferimento per il
confronto, i file da cancellare a collaudo concluso:

```
supabase/functions/hitrack-*
supabase/functions/_shared/hitrack-domotz.ts
supabase/migrations/20260716120000_hitrack_domotz_integration.sql
```

Insieme a `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` in `.env.example` e alla
dipendenza `@supabase/supabase-js` in `package.json`.

## Collaudo

Su **Etruria Società Cooperativa**, l'unico cliente con dati verificati: collector
`323061`, 9 dispositivi gestiti e 185 non gestiti, RTD su tutti e nove, RAM e
dischi solo su `Vcenter` (`22511155`), zero alert negli ultimi sette giorni. Se i
numeri a schermo corrispondono, la migrazione è fedele.

```bash
docker exec hiconsole-app php artisan migrate --force
docker exec hiconsole-app php artisan db:seed --class=HiTrackMetricDefinitionSeeder --force
docker exec hiconsole-app php artisan db:seed --class=RoleModulePermissionSeeder --force
docker exec hiconsole-app php artisan hitrack:discover --tenant=<id-etruria>
docker exec hiconsole-app php artisan hitrack:sync --tenant=<id-etruria> --now --force
```

Prima di attivare lo scheduler su molti clienti conviene sapere a che quota si è:
otto chiamate per collector ogni quindici minuti sono circa 770 al giorno per
collector.
