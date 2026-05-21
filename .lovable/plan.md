## Perché vedi 2 invece di 5

Le 5 regole (`panapesca.eu`, `pana-pesca.cloud`, `panapesca.it`, `bottegamarinara.it`, `bottegamarinara.com`) risolvono a pochi IP condivisi (Cloudflare / hosting condiviso). L'hook `useProgressiveShodanScan` **deduplica gli asset per IP**: domini diversi che puntano allo stesso IP vengono collassati in un'unica entry e perdono gli hostname "non vincenti". Le card si basano su quegli asset deduplicati → mostrano 2.

Inoltre il filtro `monitoredAssets` confronta l'hostname memorizzato con il dominio della regola; dopo il dedup resta un solo hostname per IP, quindi le regole che condividono l'IP risultano "senza match" e spariscono.

## Cosa cambio

1. **Contatori card basati sulle regole, non sugli IP unici** (`src/pages/SurfaceScan360.tsx`):
   - `Domini Monitorati` = numero di regole con `entry_type='domain'`.
   - `Asset Monitorati` = totale regole attive (`monitoredIpRules.length`), che riflette ciò che l'admin ha inserito (5/5).
   - `Vulnerabilità Critiche` e `Score Medio` continuano a usare `shodanAssets` (correttamente sui dati Shodan reali).

2. **Preservare tutti gli hostname nel dedup per IP** (`src/hooks/useProgressiveShodanScan.ts`):
   - Quando due asset hanno lo stesso IP, fare merge degli `hostname`/`hostnames` invece di scartarne uno (array unificato).
   - Esporre il campo aggregato per consentire il match con le regole dominio.

3. **Filtro `monitoredAssets` consapevole del merge** (`src/pages/SurfaceScan360.tsx`):
   - Per le regole `domain` matchare contro l'intera lista hostname aggregati (non solo `asset.hostname`), così tutte le 5 regole risultano coperte anche se gli IP coincidono.

4. **Riga per regola nella tabella esposti** (opzionale, lo confermo prima di farlo): mostrare una riga per ciascuna regola dominio anche se condividono lo stesso IP, indicando "IP condiviso con N altri domini monitorati" — utile per la trasparenza shared-hosting.

## Note tecniche

- Nessuna modifica DB richiesta.
- Nessun impatto sul backend (Shodan / Pentest-Tools): solo logica di aggregazione UI.
- Le scansioni reali continuano a girare 1 per regola (già così); cambia solo come i risultati vengono contati e visualizzati.