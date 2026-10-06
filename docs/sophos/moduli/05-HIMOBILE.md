# HiMobile ← Sophos Mobile

Dashboard: `HiMobileDashboard.tsx` · Hook: `src/hooks/useMobile.ts`
Tipo: `{ overview, osDistribution, complianceData, enrollmentTrend, deviceInventory, securityPolicies, appInventory, securityEvents }`

## Attenzione
Sophos Mobile ha API Central più limitate degli altri prodotti; alcune funzioni sono solo nella console Mobile o nell'API Sophos Mobile (on-premise/console). Verificare sul catalogo developer.sophos.com prima di sviluppare.

## Mappatura
| Sezione UI | Fonte | Stato |
|---|---|---|
| deviceInventory (nome, OS, versione, modello, utente, ultimo sync) | `GET /mobile/v1/devices` | Verif |
| compliance per device | stato compliance del device | Verif |
| encryption, jailbreak/root | attributi device / Intercept X for Mobile | Verif |
| battery, app installate | dettaglio device | **Verif/No** |
| securityPolicies | profili e regole di compliance | Verif |
| appInventory | app gestite aggregate | Verif |
| securityEvents | `GET /common/v1/alerts?product=mobile` + SIEM | API |
| overview / osDistribution / complianceData | da deviceInventory | Calc |
| enrollmentTrend | data di registrazione device per mese | Calc |
| Azioni lock/wipe/sync | azioni device | Verif (fase 2) |

## Proposta
Fase 1 solo con quanto certo: alert mobile da Common/SIEM + inventario se `/mobile/v1/devices` è confermato. Nascondere batteria e app finché non verificate.
