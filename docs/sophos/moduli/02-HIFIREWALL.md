# HiFirewall ← Sophos Firewall (XGS / SFOS)

Dashboard: `HiFirewallDashboard.tsx` · Hook: `src/hooks/useFirewall.ts`
Tipo: `FirewallDashboardData = { stats, blockedThreats[], firewallRules[], connectionLogs[] }`

## Due fonti, da combinare
1. **Sophos Central Firewall Management API** (developer.sophos.com): inventario, stato, firmware, gruppi.
2. **API XML on-box** del firewall (link community 145998): `https://<fw>:4444/webconsole/APIController?reqxml=...` – richiede abilitazione API e IP sorgente consentito in *Backup & firmware → API*. Unica fonte per regole e contatori.
3. **Log/traffico**: syslog verso collector, oppure Central Reporting / Data Lake (NDR/XDR). Non esiste API Central per traffico in tempo reale.

## API Central
| API | Uso |
|---|---|
| `GET /firewall/v1/firewalls` | `id, hostname, serialNumber, firmwareVersion, model, status.connected, status.suspended, cluster, group, geoLocation` |
| `POST /firewall/v1/firewalls/actions/firmware-upgrade-check` | firmware disponibili |
| `POST /firewall/v1/firewalls/actions/firmware-upgrade` | upgrade (fase 2) |
| `GET /firewall/v1/firewall-groups` | gruppi e sync status |
| `GET /licenses/v1/licenses/firewalls` | licenze/abbonamenti (Xstream, ZTNA) |
| `GET /common/v1/alerts?product=firewall` / `/siem/v1/events` | IPS, ATP, web, heartbeat |

## blockedThreats[]
| Campo UI | Fonte | Stato |
|---|---|---|
| id | alert `id` | API |
| source / destination | `data.source_ip`/`data.destination_ip` evento | Verif (dipende dal tipo evento) |
| type | `type` (`Event::Firewall::...`, ATP, IPS) → etichetta | Calc |
| severity | `severity` | API |
| timestamp | `when` / `raisedAt` | API |
| action | sempre Blocked per eventi ATP/IPS | Calc |

## firewallRules[]
| Campo UI | Fonte on-box (`<Get><FirewallRule/></Get>`) | Stato |
|---|---|---|
| id, name | `Name` | API on-box |
| source/destination | `SourceZones`, `SourceNetworks`, `DestinationZones`, `DestinationNetworks` | API on-box |
| port/protocol | `Services` (risolvere oggetti Service) | Calc |
| action | `Action` Accept/Drop/Reject → Allow/Drop/Deny | API on-box |
| status | `Status` Enable/Disable | API on-box |
| hits | contatori regola | **Verif** (non sempre esposti via XML; alternativa: report) |

## connectionLogs[]
**No** su Central. Fonte: syslog (`log_type="Firewall"`, `src_ip, dst_ip, dst_port, protocol, fw_rule_id, bytes_sent/recv`) o Data Lake XDR.

## stats
`activeRules` (on-box), `threatsBlocked` (alert 24h), `blockedConnections` e `activeConnections` (syslog / Live Discover NDR) → **Calc/Verif**.

## Proposte UI
Aggiungere scheda "Apparati" (firewall Central, firmware, connesso/no, licenze in scadenza): oggi la dashboard non la ha ma è il dato più affidabile.
