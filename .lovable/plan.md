# Fix: home e /hiconsole non caricano sul sito pubblicato

## Cosa ho verificato
- In anteprima (locale) `/` e `/hiconsole` caricano correttamente, nessun errore.
- Su https://hicompliance.it `/` e `/hiconsole` restano bianche: la pagina crasha subito con l'errore `supabaseUrl is required.`
- Causa: la versione pubblicata è stata costruita senza le variabili pubbliche di collegamento al database (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`). Il client database viene creato all'avvio dell'app, quindi l'errore blocca tutte le pagine, non solo la home.

## Cosa faccio
1. In `vite.config.ts` aggiungo dei valori di riserva pubblici (URL del progetto `hcllvyzhefcqftesahnv` e chiave anon pubblica, già pubblicabili) iniettati via `define` solo se le variabili non sono presenti al momento della build. Il file client generato automaticamente non viene toccato.
2. Verifico con una build di produzione locale senza `.env` che l'app parta senza errori.
3. Ripubblico e riprovo `/` e `/hiconsole` su hicompliance.it con un browser di prova.

## Note tecniche
- Nessuna chiave segreta coinvolta: la chiave anon è pubblica per natura (protetta da RLS).
- Se il sito è deployato anche da GitHub Actions (`deploy-dev.yml`), controllo che il workflow passi le stesse variabili; in caso contrario i valori di riserva coprono comunque il caso.
