# SurfaceScan360 Nmap Cloudflare Container

Authenticated Cloudflare Worker + Container wrapper for safe TCP port discovery.

## Endpoints

- `GET /health`
- `POST /nmap/scan`

## Profiles

- `web_top`: common web ports only, no NSE scripts.
- `tcp_top_100`: top 100 TCP ports, no NSE scripts.
- `service_light`: common web ports plus light service/version detection.
- `custom_tcp`: explicit caller-provided TCP ports.

After port discovery, the container runs a safe HTTP technology fingerprint on web URL candidates with ProjectDiscovery `httpx` and returns `technology_fingerprints`, `technology_count`, `fingerprint_status`, `fingerprint_duration_ms`, and `httpx_version`.

Private/local networks are blocked and IPv4 CIDR scans are limited to `/28` or smaller by default.
