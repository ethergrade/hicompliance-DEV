import type { DiscoveredSubdomain, NormalizedTechnology } from '../pentestToolsTypes.ts';

function parseTechnology(raw: unknown): NormalizedTechnology[] {
  const value = String(raw || '').trim();
  if (!value) return [];
  const parts = value.split(',').map((entry) => entry.trim()).filter(Boolean);
  return parts.map((name) => ({
    url: '',
    host: '',
    name,
    raw: { source: 'subdomain_finder' },
  }));
}

export function normalizeSubdomainFinderOutput(output: unknown, sourceScanId = 0): DiscoveredSubdomain[] {
  const data = (output && typeof output === 'object' ? output : {}) as Record<string, unknown>;
  const outputData = (data.output_data && typeof data.output_data === 'object'
    ? data.output_data
    : (data.data && typeof data.data === 'object' ? (data.data as any).output_data : {})) as Record<string, unknown>;

  const subdomains = Array.isArray(outputData.subdomains)
    ? outputData.subdomains
    : Array.isArray((data as any)?.subdomains)
      ? (data as any).subdomains
      : [];

  const out: DiscoveredSubdomain[] = [];
  for (const entry of subdomains) {
    const row = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
    const hostname = String(row.hostname || row.subdomain || '').trim().toLowerCase();
    if (!hostname) continue;
    const resolved = row.resolved;
    if (resolved === false) continue;

    const ipValue = String(row.ip_address || row.ip || '').trim();
    const technologies = parseTechnology(row.technology || row.web_platform);

    out.push({
      hostname,
      ips: ipValue ? [ipValue] : [],
      cname: row.cname ? String(row.cname) : undefined,
      country: row.whois_country ? String(row.whois_country) : undefined,
      netname: row.whois_netname ? String(row.whois_netname) : undefined,
      technologies,
      source_scan_id: sourceScanId,
    });
  }

  const uniq = new Map<string, DiscoveredSubdomain>();
  for (const item of out) {
    const existing = uniq.get(item.hostname);
    if (!existing) {
      uniq.set(item.hostname, item);
      continue;
    }
    const ips = [...new Set([...(existing.ips || []), ...(item.ips || [])])];
    uniq.set(item.hostname, {
      ...existing,
      ips,
      country: existing.country || item.country,
      netname: existing.netname || item.netname,
      technologies: [...(existing.technologies || []), ...(item.technologies || [])],
    });
  }

  return Array.from(uniq.values());
}
