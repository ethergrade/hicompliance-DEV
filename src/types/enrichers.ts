/** Enricher data embedded in SurfaceScan/DarkRisk scan results */

export interface WhoisInfo {
  registrar?: string;
  creation_date?: string;
  expiry_date?: string;
  name_servers?: string[];
  registrant_org?: string;
  registrant_country?: string;
  updated_date?: string;
}

export interface ReverseDnsInfo {
  ptr_records?: string[];
  hostname?: string;
  root_domain?: string;
}

export interface IpReputation {
  ip: string;
  reputation: 'clean' | 'suspicious' | 'malicious' | 'unknown';
  abuse_score?: number;
  reported_activities?: string[];
  country?: string;
  isp?: string;
}

export interface EnricherData {
  whois?: WhoisInfo;
  reverse_dns?: ReverseDnsInfo;
  subdomains?: string[];
  ip_reputation?: IpReputation[];
}

/** Parse enricher data from raw API response, returning null if no enricher data present */
export function parseEnricherData(raw: Record<string, unknown> | null | undefined): EnricherData | null {
  if (!raw) return null;

  const data: EnricherData = {};
  let hasAny = false;

  // Try multiple possible locations for enricher data
  const sources = [
    raw.enricher as Record<string, unknown> | undefined,
    raw.enrichment as Record<string, unknown> | undefined,
    raw.osint as Record<string, unknown> | undefined,
    raw, // fallback: data might be at top level
  ];

  for (const src of sources) {
    if (!src) continue;

    // Whois
    if (src.whois && typeof src.whois === 'object') {
      data.whois = src.whois as WhoisInfo;
      hasAny = true;
    }

    // Reverse DNS
    if (src.reverse_dns && typeof src.reverse_dns === 'object') {
      data.reverse_dns = src.reverse_dns as ReverseDnsInfo;
      hasAny = true;
    }

    // Subdomains
    if (src.subdomains && Array.isArray(src.subdomains)) {
      data.subdomains = src.subdomains as string[];
      hasAny = true;
    } else if (src.discovered_subdomains && Array.isArray(src.discovered_subdomains)) {
      data.subdomains = src.discovered_subdomains as string[];
      hasAny = true;
    }

    // IP Reputation
    if (src.ip_reputation && Array.isArray(src.ip_reputation)) {
      data.ip_reputation = src.ip_reputation as IpReputation[];
      hasAny = true;
    }
    // Also try resolved_ips as simple IP list
    if (!data.ip_reputation && src.resolved_ips && Array.isArray(src.resolved_ips)) {
      data.ip_reputation = (src.resolved_ips as string[]).map(ip => ({
        ip,
        reputation: 'unknown' as const,
      }));
      hasAny = true;
    }

    if (hasAny) break;
  }

  return hasAny ? data : null;
}

/** Build enricher data from a SurfaceScanJob object */
export function parseJobEnrichers(job: Record<string, unknown> | null | undefined): EnricherData | null {
  if (!job) return null;

  const data: EnricherData = {};
  let hasAny = false;

  // Whois from hosting_context
  if (job.hosting_context && typeof job.hosting_context === 'string') {
    data.whois = { registrant_org: job.hosting_context as string };
    hasAny = true;
  }

  // Reverse DNS from hostname/root_domain
  const hostname = job.hostname as string | undefined;
  const rootDomain = job.root_domain as string | undefined;
  if (hostname || rootDomain) {
    data.reverse_dns = { hostname, root_domain: rootDomain };
    hasAny = true;
  }

  // Subdomains from summary
  const summary = job.summary as Record<string, unknown> | undefined;
  if (summary?.discovered_subdomains && Array.isArray(summary.discovered_subdomains)) {
    data.subdomains = summary.discovered_subdomains as string[];
    hasAny = true;
  }

  // IP Reputation from resolved_ips + shodan_status
  if (job.resolved_ips && Array.isArray(job.resolved_ips)) {
    const shodanStatus = (job.shodan_status as string) || '';
    const getReputation = (): IpReputation['reputation'] => {
      if (shodanStatus.includes('malicious')) return 'malicious';
      if (shodanStatus.includes('suspicious')) return 'suspicious';
      if (shodanStatus.includes('clean') || shodanStatus.includes('ok')) return 'clean';
      return 'unknown';
    };
    data.ip_reputation = (job.resolved_ips as string[]).map(ip => ({
      ip,
      reputation: getReputation(),
    }));
    hasAny = true;
  }

  // Also check summary for hosts
  if (!data.ip_reputation && summary?.discovered_hosts && Array.isArray(summary.discovered_hosts)) {
    data.ip_reputation = (summary.discovered_hosts as string[]).map(ip => ({
      ip,
      reputation: 'unknown' as const,
    }));
    hasAny = true;
  }

  return hasAny ? data : null;
}
