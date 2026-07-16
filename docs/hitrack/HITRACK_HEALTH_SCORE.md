# HiTrack Health Score

## Objective
Provide a conservative health score for HiTrack using only metrics verified through Domotz Public API discovery.

## Formula Implemented Locally
Function: `public.hitrack_health_score`

Score components:
- Availability: up to `45` points
  - `online_devices / managed_devices`
- Open alerts penalty: up to `20` points deducted
- Packet loss penalty: up to `15` points deducted
- Data coverage: up to `15` points
- Freshness: up to `5` points

SQL intent:
- availability dominates
- open alerts and packet loss reduce the score quickly
- partial RAM/disk coverage never inflates the score beyond actual collected data
- stale data lowers score even when devices remain online

## Why This Formula
- Etruria exposes reliable managed-device counts and RTD data on all managed devices
- RAM and disk quantitative coverage is partial and must not be over-weighted
- the score must stay meaningful even when only RTD/network coverage is available

## Inputs Used
- `managed_devices`
- `online_devices`
- `open_alerts`
- `avg_packet_loss_percent`
- `data_coverage_percent`
- `freshness_seconds`

## Inputs Explicitly Not Used
- fake historical seeds from legacy HiTrack migrations
- unverified aliases
- qualitative iDRAC storage/memory status for numeric panels
- MCP managed-device counts when they differ from Public API runtime

## Expected Behaviour
- All managed devices online, no alerts, low packet loss, fresh data:
  - score stays high
- Data stale over one hour:
  - freshness contribution drops
- Packet loss high:
  - score drops even if devices stay online
- Coverage partial:
  - score reflects the partial visibility and does not simulate missing RAM/disk evidence

## Known Limits
- Uptime is not yet reconstructed as a long-running time-series in local tests
- Current implementation uses the freshest snapshot per collector and does not yet model weighted trend deterioration over multiple sync failures
- Final thresholds should be reviewed after staging data accumulates for at least 7-14 days
