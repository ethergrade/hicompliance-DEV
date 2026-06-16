# SurfaceScan360 Nikto Container

Cloudflare Worker + Container wrapper for Nikto 2.6.0 used by the NUCLEI-SCAN360 LAB pipeline.

Endpoints:

- `GET /health`
- `POST /nikto/scan`

The Worker requires `NIKTO_SHARED_SECRET` and forwards authorized scan requests to the container.
Targets are limited to public HTTP/HTTPS URLs and private/local hosts are blocked before Nikto runs.
