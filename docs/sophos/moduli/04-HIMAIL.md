# HiMail ← Sophos Email

Dashboard: `HiMailDashboard.tsx` · Hook: `src/hooks/useMail.ts`
Tipo: `{ stats, recentThreats[], quarantinedEmails[], topSenders[], policyViolations[] }`

## API Sophos
| API | Uso | Stato |
|---|---|---|
| `POST /email/v1/quarantine/messages/search` | messaggi in quarantena (`from`, `to`, `subject`, `reason`, `receivedAt`, `direction`) | API |
| `POST /email/v1/quarantine/messages/release` / `/delete` | azioni (fase 2) | API |
| `GET /common/v1/alerts?product=email` | alert email | API |
| `GET /siem/v1/events` (tipi `Event::Email::*`) | phishing, malware, BEC, impersonation | API |
| Mailboxes/domini (Email settings) | domini protetti | Verif |

## Campi
| Campo UI | Fonte | Stato |
|---|---|---|
| quarantinedEmails.* | quarantine search | API |
| recentThreats.sender/recipient/subject | evento SIEM `data` | Verif (contenuto `data` per tipo evento) |
| recentThreats.threatType | `reason`/`type` → Phishing/Spam/Malware/Spoofing/BEC | Calc |
| recentThreats.action | quarantena → Quarantined; blocco → Blocked | Calc |
| stats.blocked/spam/phishing/malware | conteggi per tipo su 24h/7g | Calc |
| stats.totalEmails | — | **Verif/No**: Central non espone il totale processato via API pubblica |
| topSenders | group by dominio mittente | Calc |
| policyViolations | eventi DLP / content control | Verif |

## Proposta
Se `totalEmails` non è disponibile, sostituire il KPI con "Minacce bloccate 7g" e la % calcolarla sui messaggi analizzati presenti negli eventi.
