# HiTrack Domotz API Mapping

## Runtime Source of Truth
- Runtime source: Domotz Public API
- Auth header: `X-Api-Key`
- Allowed methods used for discovery: `GET`
- Discovery date: `2026-07-16`
- Customer: `ETRURIA_SOCIETA_COOPERATIVA`
- `organization.id = 212244`
- `agent_id = 323061`

## Endpoints Verified
- `GET /organization`
- `GET /agent?page_size=1&page_number=0`
- `GET /agent/{agent_id}`
- `GET /agent/{agent_id}/device?show_hidden=false&show_excluded=false`
- `GET /agent/{agent_id}/device/monitoring-state/unmanaged`
- `GET /agent/{agent_id}/device/rtd`
- `GET /agent/{agent_id}/device/variable`
- `GET /agent/{agent_id}/variable`
- `GET /alert?from={ISO-8601 UTC}&to={ISO-8601 UTC}`
- `GET /agent/{agent_id}/device/{device_id}/variable/{variable_id}/history?...`

## Collector and Inventory
- Collector name: `ETRURIA_SOCIETA_COOPERATIVA`
- Collector status: `ONLINE`
- Managed devices: `9`
- Unmanaged devices: `185`
- Managed device ids verified:
  - `22511155`
  - `22511163`
  - `22511208`
  - `22511209`
  - `22511228`
  - `22511229`
  - `22511230`
  - `22511231`
  - `23903285`

## RTD Mapping
- Endpoint: `GET /agent/{agent_id}/device/rtd`
- Runtime fields used:
  - `device_id`
  - `avg_max` -> `rtd_worst_ms`
  - `avg_median` -> `rtd_median_ms`
  - `latest_lost_packet_count`
  - `latest_sent_packet_count`
- Derived runtime metric:
  - `packet_loss_percent = latest_lost_packet_count / latest_sent_packet_count * 100`

## Collector Variable Mapping
- `agent_performance/unloaded-packet-loss`
  - `variable_id = 27850358`
  - `metric = unloaded_packet_loss`
  - `label = Packet Loss`
  - `unit = %`
  - `has_history = true`
- `agent_performance/speed-test/upload`
  - `variable_id = 27850359`
  - `metric = speed_test_upload`
  - `label = Upload`
  - `unit = b/s`
  - `has_history = true`
- `agent_performance/speed-test/download`
  - `variable_id = 27850361`
  - `metric = speed_test_download`
  - `label = Download`
  - `unit = b/s`
  - `has_history = true`
- `agent_performance/loaded-jitter-upload`
  - `variable_id = 27850363`
  - `unit = ms`
  - `has_history = true`
- `agent_performance/loaded-jitter-download`
  - `variable_id = 27850364`
  - `unit = ms`
  - `has_history = true`

## RAM Mapping Verified
- Source endpoint: `GET /agent/{agent_id}/device/variable`
- Quantitative RAM variables verified only on device `22511155` (`Vcenter`)
- Path pattern: `custom-driver/7851/table/host-*/column/7`
  - Label pattern: `* - Memory`
  - Example `variable_id = 27869056`
  - Unit observed in data handling: GiB
- Path pattern: `custom-driver/7851/table/host-*/column/8`
  - Label pattern: `* - Memory Usage`
  - Example `variable_id = 27869057`
  - Unit: `%`
  - History verified on `GET /agent/323061/device/22511155/variable/27869057/history`

## Disk Mapping Verified
- Source endpoint: `GET /agent/{agent_id}/device/variable`
- Quantitative disk variables verified only on device `22511155` (`Vcenter`)
- Path pattern: `custom-driver/7846/table/datastore-*/column/3`
  - Label pattern: `* - Capacity`
  - Example `variable_id = 27843073`
- Path pattern: `custom-driver/7846/table/datastore-*/column/4`
  - Label pattern: `* - Free Space`
  - Example `variable_id = 27843074`
- Path pattern: `custom-driver/7846/table/datastore-*/column/5`
  - Label pattern: `* - Usage`
  - Example `variable_id = 27843075`
  - History verified on `GET /agent/323061/device/22511155/variable/27843075/history`

## Status-Only Variables Verified But Inactive
- `snmp/preset/idrac-general/globalStorageStatus`
  - Examples: `27879805`, `27842497`
- `snmp/preset/idrac-components/idrac_hw_components/*/systemStateMemoryDeviceStatusCombined`
  - Example: `27879815`
- Reason inactive:
  - values are qualitative (`ok`)
  - no quantitative RAM/disk payload suitable for the MVP panels

## Real Result and Coverage
- RTD coverage: `9/9 managed devices`
- RAM quantitative coverage: `1/9 managed devices`
- Disk quantitative coverage: `1/9 managed devices`
- Alert coverage:
  - endpoint requires `from`/`to`
  - last 7 days for Etruria returned `0 open alerts`

## MCP vs Public API Discrepancy
- MCP counters observed: `194 total`, `9 managed`
- Public API runtime used by implementation:
  - `9 managed`
  - `185 unmanaged`
- Resolution:
  - Public API treated as runtime truth
  - discrepancy documented
  - no full payload committed to repository
