# Moduli Sophos – indice documenti per il DEV

Un documento per prodotto. Ogni documento incrocia **cosa mostra la dashboard HiSolution** (tipi in `src/hooks/use*.ts`)
con **le API Sophos** documentate in:
- https://developer.sophos.com/apis/ (catalogo API Central)
- https://central-public-prod-api.s3.us-west-2.amazonaws.com/swagger-api-specification-us-west-2 (Swagger SIEM: `/siem/v1/alerts`, `/siem/v1/events`)
- https://community.sophos.com/sophos-xg-firewall/management-apis/f/recommended-reads/145998 (API on-box Sophos Firewall)
- https://developer.sophos.com/whatsnew/sep-18-2026-xdr-graphql-apis/ (Fusion XDR GraphQL, 18/09/2026)

| # | Documento | Prodotto Sophos | Copertura API stimata |
|---|---|---|---|
| 01 | [HiEndpoint](01-HIENDPOINT.md) | Intercept X / Server Protection | Alta |
| 02 | [HiFirewall](02-HIFIREWALL.md) | Sophos Firewall (XGS) | Media: serve API on-box |
| 03 | [HiDetect](03-HIDETECT.md) | XDR / MDR / NDR | Alta, ma migrazione a GraphQL |
| 04 | [HiMail](04-HIMAIL.md) | Sophos Email | Media |
| 05 | [HiMobile](05-HIMOBILE.md) | Sophos Mobile | Media-bassa: da verificare |
| 06 | [Comune](06-COMUNE-AUTH-SIEM-HEALTH.md) | Auth, tenant, SIEM, Health score | — |
| 07 | [Criteri di accettazione](07-CRITERI-ACCETTAZIONE.md) | Pilota, IDS/IPS, punteggio unificato | — |

Legenda colonne "Stato": **API** = campo diretto; **Calc** = calcolato da noi; **Verif** = non confermato in doc pubblica; **No** = non disponibile su Central.

Nota: nessuna risposta reale Sophos è stata osservata; tutto deriva da documentazione pubblica. Verificare su un tenant reale.
