# DarkRisk360 — Scope condiviso con SurfaceScan in HiCompliance

Data: 2026-06-29  
Branch: `PRODOTTO`

## Problema risolto

Quando il cliente ha `HiCompliance` attivo, la pagina `DarkRisk360` non deve più leggere uno scope separato o vuoto: deve usare lo stesso scope già mantenuto da `SurfaceScan360`.

Prima del fix, la UI DarkRisk poteva mostrare:

- stato attivo ma scope vuoto;
- scope non allineato con i target configurati in SurfaceScan;
- comportamento diverso tra lettura e scrittura dello scope.

## Comportamento dopo il fix

Se `organizations.hicompliance_enabled = true`:

- `DarkRisk360` legge i target da `surface_scan_monitored_ips`;
- `DarkRisk360` salva lo scope condiviso nella stessa tabella;
- la sincronizzazione verso i flussi SurfaceScan continua tramite `darkrisk360-sync-surfacescan`;
- la pagina standard e quella estesa mostrano lo stesso scope operativo.

Se `HiCompliance` non è attivo:

- `DarkRisk360` continua a usare l’endpoint legacy `/external-scope`.

## File modificati

- `src/features/darkrisk/api/darkRiskGateway.ts`
- `src/features/darkrisk/shared/scopeBridge.ts`

## Dettagli tecnici

Nuovo bridge condiviso:

- rileva se il cliente usa lo scope comune (`HiCompliance`);
- legge i record da `surface_scan_monitored_ips`;
- normalizza solo i target supportati da DarkRisk (`domain` e `single`);
- aggiorna lo scope condiviso senza creare un secondo modello separato;
- invoca `darkrisk360-sync-surfacescan` dopo le modifiche per mantenere allineati i flussi.

## Verifiche eseguite

- `npx tsc --noEmit`
- `npm run build`

Entrambi i controlli sono passati.

## Nota per il DEV

Il punto centrale del fix è che DarkRisk non ha più uno scope “proprio” quando HiCompliance è presente: la source of truth diventa la stessa di SurfaceScan.
