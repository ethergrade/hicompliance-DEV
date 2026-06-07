# SurfaceScan360 Nuclei Cloudflare Container

Cloudflare Worker + Container wrapper for optional ProjectDiscovery Nuclei checks.

This container is intentionally separate from the Amass container and exposes a narrow authenticated API.

## Contract

- `GET /health`
- `POST /nuclei/scan`
- Auth: `Authorization: Bearer $NUCLEI_SHARED_SECRET`
- Request:

```json
{
  "target_url": "https://google-gruyere.appspot.com/start",
  "profile": "exposure_medium",
  "timeout_seconds": 45,
  "rate_limit": 5,
  "max_findings": 100,
  "authorized_scan": false,
  "scan_job_id": "uuid"
}
```

- Response:

```json
{
  "target_url": "https://google-gruyere.appspot.com/start",
  "resolved_target_url": "https://google-gruyere.appspot.com/123456789/",
  "profile": "exposure_medium",
  "findings": [],
  "warnings": [],
  "duration_ms": 1200,
  "nuclei_version": "v3.8.0",
  "templates_loaded_count": 1200,
  "templates_executed_count": 1200,
  "template_paths": [
    "/opt/surfacescan360-nuclei-templates/http/exposures",
    "/root/nuclei-templates/http/exposures"
  ],
  "nuclei_command_sanitized": "nuclei -list <targets-file> ...",
  "debug_summary": {
    "templates_loaded_log": 1200,
    "targets_loaded": 1,
    "templates_clustered": "1200 (Reduced 400 Requests)",
    "scan_completed": "14.2s",
    "stats_last": {}
  }
}
```

## Runtime

Required:

- `NUCLEI_SHARED_SECRET`: shared bearer secret.

Optional:

- `PORT`: defaults to `8080`.
- `NUCLEI_TIMEOUT_SECONDS`: defaults to `45`.
- `NUCLEI_MAX_TIMEOUT_SECONDS`: defaults to `120`; raise only for local/manual validation.
- `NUCLEI_RATE_LIMIT`: defaults to `5`.
- `NUCLEI_MAX_FINDINGS`: defaults to `100`.
- `NUCLEI_BINARY`: defaults to `nuclei`.
- `NUCLEI_TEMPLATES_DIR`: defaults to `/root/nuclei-templates`.
- `SURFACESCAN_NUCLEI_TEMPLATES_DIR`: defaults to `/opt/surfacescan360-nuclei-templates`.

## Safety Profile

Profiles:

- `baseline_headers`: local SurfaceScan360 security-header checks plus basic TLS templates.
- `exposure_medium`: official exposure, misconfiguration, exposed panels, technologies, plus lightweight SurfaceScan360 disclosure templates.
- `web_vuln_safe`: official HTTP vulnerability and CVE templates with low/medium/high/critical severity only.
- `web_vuln_authorized`: adds DAST/fuzzing with low aggression and rate limit capped at `2`, only when `authorized_scan=true`.

Public profiles exclude `dos`, `bruteforce`, `intrusive`, and `destructive` tags. Runtime template updates are disabled, localhost/private IPv4 targets are rejected, redirects are resolved before scanning, and every run uses rate limits plus process timeouts.

The image installs official `nuclei-templates` at `/root/nuclei-templates` and verifies these paths during build:

- `/root/nuclei-templates/http/exposures/`
- `/root/nuclei-templates/http/misconfiguration/`
- `/root/nuclei-templates/http/vulnerabilities/`
- `/root/nuclei-templates/http/cves/`
- `/root/nuclei-templates/http/technologies/`

## Deploy to Cloudflare

From this folder:

```bash
npm install
npx wrangler secret put NUCLEI_SHARED_SECRET
npx wrangler deploy
```

The deployed Worker URL will be:

```bash
https://surfacescan360-nuclei.<YOUR_WORKERS_SUBDOMAIN>.workers.dev
```

## Build details

The Dockerfile pins Nuclei with:

```dockerfile
ARG NUCLEI_VERSION=v3.8.0
```

The wrapper runs Nuclei with `-stats`, `-jsonl`, `-silent=false`, `-disable-update-check`, strict rate limits, sanitized command reporting, and templates from `/root/nuclei-templates` plus `/opt/surfacescan360-nuclei-templates`.
