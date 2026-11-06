# Percorso NIS2 ACN (rules_version 2026.11)

Pagina: `/assessment/nis2` (pulsante "Percorso NIS2 ACN" in Assessment). Visibilità: servizio HiCompliance (prefisso /assessment).

- Catalogo: `src/data/nis2Acn/catalog.json` estratto dalla specifica (43 misure, 116 requisiti; 87 IMP; 20 misure Base). Rigenerabile con lo script di parsing della §4.
- Logica: `src/lib/nis2Acn/catalog.ts` (profili, punteggi: Implementato 1, Parziale 0,5, Non implementato 0, Deroga 1 solo su requisiti con flag D), `classify.ts` (wizard §1.5, soglie 2003/361, scadenze §2), `legacyMapping.ts` (correlazione a parole chiave con le 132 domande: proposta da validare).
- Tabelle: `nis2_classifications` (org, anno, risposte, esito), `nis2_acn_responses` (org, requisito, stato, nota, responsabile, data, documento evidenza, source manual|suggested_from_assessment). RLS: `doc_can_access_org`.
- Test: `bun test src/lib/nis2Acn`.

TODO produzione: validazione consulente della correlazione; snapshot storici ACN; generazione automatica task in Remediation dal piano di adeguamento; incidenti IS-x nel modulo IRP; elenco sottosettori/ATECO dal testo ufficiale degli allegati; punti "da verificare" §8.
