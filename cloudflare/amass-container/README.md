# SurfaceScan360 Amass Cloudflare Container

Cloudflare Worker + Container wrapper for optional SurfaceScan360 Amass discovery.

The Cloudflare dashboard shows no Containers until a Worker with a `containers` binding is deployed. This folder contains that deployable Worker.

## Contract

- `GET /health`
- `POST /amass/enum`
- Auth: `Authorization: Bearer $AMASS_SHARED_SECRET`
- Request:

```json
{
  "target": "example.com",
  "root_domain": "example.com",
  "mode": "active_light",
  "timeout_seconds": 45,
  "max_names": 250,
  "scan_job_id": "uuid"
}
```

- Response:

```json
{
  "subdomains": ["www.example.com"],
  "ips": ["198.51.100.10"],
  "warnings": [],
  "duration_ms": 1200,
  "amass_version": "v5.1.1"
}
```

## Runtime

Required:

- `AMASS_SHARED_SECRET`: shared bearer secret used by SurfaceScan360.

Optional:

- `PORT`: defaults to `8080`.
- `AMASS_TIMEOUT_SECONDS`: defaults to `45`.
- `AMASS_MAX_TIMEOUT_SECONDS`: defaults to `120`; raise only for local/manual validation.
- `AMASS_MAX_NAMES`: defaults to `250`.
- `AMASS_BINARY`: defaults to `amass`.

SurfaceScan360 Supabase Edge Function env:

- `SURFACESCAN_ENABLE_AMASS=true`
- `SURFACESCAN_AMASS_SERVICE_URL=https://<container-host>`
- `SURFACESCAN_AMASS_SHARED_SECRET=<same secret>`

## Deploy to Cloudflare

From this folder:

```bash
npm install
npx wrangler secret put AMASS_SHARED_SECRET
npx wrangler deploy
npx wrangler containers list
npx wrangler containers images list
```

After deploy, Cloudflare will show `surfacescan360-amass` under Workers & Pages and the Containers page will populate after the first request/provisioning window.

Use the deployed Worker URL as:

```bash
SURFACESCAN_AMASS_SERVICE_URL=https://surfacescan360-amass.<YOUR_WORKERS_SUBDOMAIN>.workers.dev
```

Then configure Supabase Edge Function secrets:

```bash
supabase secrets set SURFACESCAN_ENABLE_AMASS=true
supabase secrets set SURFACESCAN_AMASS_SERVICE_URL=https://surfacescan360-amass.<YOUR_WORKERS_SUBDOMAIN>.workers.dev
supabase secrets set SURFACESCAN_AMASS_SHARED_SECRET=<same secret>
```

## Build details

The Dockerfile pins Amass with:

```dockerfile
ARG AMASS_VERSION=v5.1.1
```

The active-light command uses `amass enum -active -norecursive -silent` with a process timeout enforced by Node.
