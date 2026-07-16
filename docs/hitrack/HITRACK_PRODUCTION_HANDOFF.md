# HiTrack Production Handoff

## Branching Context
- Base branch: `merge-imnick-IMNICK`
- Initial SHA: `d67059cac64975069bb96e97f9de8e929e794537`
- Implementation branch: `feature/hitrack-domotz-integration`

## IMPLEMENTATO LOCALMENTE
- Frontend HiTrack autonomo con route dedicata: [src/components/service-dashboards/HiTrackDashboard.tsx](/Users/lucasalvatori/Documents/HICOMPLIANCE/hicompliance-DEV-merge-imnick-IMNICK/src/components/service-dashboards/HiTrackDashboard.tsx)
- Separazione HiTrack da SurfaceScan: [src/pages/ServiceDashboard.tsx](/Users/lucasalvatori/Documents/HICOMPLIANCE/hicompliance-DEV-merge-imnick-IMNICK/src/pages/ServiceDashboard.tsx), [src/components/service-dashboards/SurfaceScanDashboard.tsx](/Users/lucasalvatori/Documents/HICOMPLIANCE/hicompliance-DEV-merge-imnick-IMNICK/src/components/service-dashboards/SurfaceScanDashboard.tsx)
- Attivazione modulo HiTrack in dashboard, sidebar e gestione moduli cliente: [src/pages/Dashboard.tsx](/Users/lucasalvatori/Documents/HICOMPLIANCE/hicompliance-DEV-merge-imnick-IMNICK/src/pages/Dashboard.tsx), [src/components/layout/AppSidebar.tsx](/Users/lucasalvatori/Documents/HICOMPLIANCE/hicompliance-DEV-merge-imnick-IMNICK/src/components/layout/AppSidebar.tsx), [src/components/clients/ClientServicesDialog.tsx](/Users/lucasalvatori/Documents/HICOMPLIANCE/hicompliance-DEV-merge-imnick-IMNICK/src/components/clients/ClientServicesDialog.tsx)
- Client tipizzato Supabase per HiTrack con placeholder pubblici: [src/lib/hitrack/client.ts](/Users/lucasalvatori/Documents/HICOMPLIANCE/hicompliance-DEV-merge-imnick-IMNICK/src/lib/hitrack/client.ts), [.env.example](/Users/lucasalvatori/Documents/HICOMPLIANCE/hicompliance-DEV-merge-imnick-IMNICK/.env.example)
- Migration forward-only HiTrack con schema dati, queue, RLS, viste e RPC: [supabase/migrations/20260716120000_hitrack_domotz_integration.sql](/Users/lucasalvatori/Documents/HICOMPLIANCE/hicompliance-DEV-merge-imnick-IMNICK/supabase/migrations/20260716120000_hitrack_domotz_integration.sql)
- Edge Functions locali create:
  - `hitrack-discovery`
  - `hitrack-scheduler`
  - `hitrack-worker`
  - `hitrack-sync-now`
  - `hitrack-retention`
  - shared lib: [supabase/functions/_shared/hitrack-domotz.ts](/Users/lucasalvatori/Documents/HICOMPLIANCE/hicompliance-DEV-merge-imnick-IMNICK/supabase/functions/_shared/hitrack-domotz.ts)

## TESTATO LOCALMENTE
- Typecheck PASS: `npm run check:fast`
- Build PASS: `npm run build`
- Test unitario HiTrack PASS: `npx vitest run src/lib/hitrack/formatters.test.ts`

## VERIFICATO VIA DOMOTZ READ-ONLY
- Public API auth test PASS: `GET /agent?page_size=1&page_number=0`
- Organizzazione verificata: `ETRURIA_SOCIETA_COOPERATIVA`
- `organization.id = 212244`
- Collector verificato: `domotz_agent_id = 323061`
- Nome collector: `ETRURIA_SOCIETA_COOPERATIVA`
- Stato collector: `ONLINE`
- Managed device runtime truth: `9`
- Unmanaged device runtime truth: `185`
- Alert ultimi 7 giorni per collector: `0`
- RTD disponibile per `9/9` managed device
- RAM/dischi quantitativi verificati solo su device `22511155` (`Vcenter`)
- Variabili status-only iDRAC verificate ma lasciate inattive per i pannelli numerici
- Discrepanza documentata:
  - MCP counters: `194 total`, `9 managed`
  - Public API `/agent/{id}/device`: `9` managed
  - Public API è la fonte runtime adottata

## DA CONFIGURARE IN STAGING
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `DOMOTZ_API_BASE_URL`
- `DOMOTZ_API_KEY`
- `HITRACK_CRON_INTERNAL_SECRET`
- Collector mapping reale da confermare in `hitrack_collectors`
- Eventuale sessione Supabase browser o strategia JWT applicativa coerente con le RPC frontend

## DA DEPLOYARE
1. Migration `20260716120000_hitrack_domotz_integration.sql`
2. Shared code + Edge Functions HiTrack
3. Frontend HiTrack
4. Cron remoto `hitrack-scheduler-15min`
5. Prima discovery / sync manuale in staging

## NON VERIFICATO
- Versione PostgreSQL locale
- Supporto locale reale di `pg_cron`, `pg_net`, `vault`, partizionamento
- Esecuzione live delle nuove migration su DB Supabase
- Deploy reale delle Edge Functions
- Browser runtime con JWT Supabase valido
- RLS end-to-end con utente autenticato reale Supabase

## FUORI PERIMETRO
- Deploy remoto staging/production
- `supabase db push`
- Attivazione cron remoti
- Push Git remoto / PR
- Bridge `hiapi`

## Known Limits
- La repo usa auth Laravel nel browser; il consumo frontend delle RPC Supabase è predisposto ma resta `NOT VERIFIED` fino a una strategia JWT coerente.
- La coverage RAM/disco è intenzionalmente parziale: Etruria espone metriche quantitative verificate solo su `Vcenter`.
- Il lint e la suite test generale della repo falliscono per problemi preesistenti non limitati a HiTrack.
