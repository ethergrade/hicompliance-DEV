// dnsdumpster-scan: Standalone DNSDumpster domain intelligence.
// Returns subdomains, IPs, DNS records (A/MX/NS/TXT/CNAME), ASN, netblock, country, banners.
// Called from surface-scan-engine as part of the discovery phase, AND directly
// from admin/cron for ad-hoc domain intelligence queries.
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const SUPABASE_URL = String(Deno.env.get('SUPABASE_URL') || '').trim();
const SERVICE_ROLE = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
const DNSDUMPSTER_API_KEY = String(Deno.env.get('DNSDUMPSTER_API_KEY') || '').trim();
const INTERNAL_SECRET = String(
  Deno.env.get('SURFACESCAN_CRON_INTERNAL_SECRET') ||
  Deno.env.get('SURFACESCAN_INTERNAL_SECRET') || ''
).trim();

const MIN_DELAY_MS = 2100; // 1 req/2s max
let lastRequestAt = 0;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-surface-internal-secret',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

function isValidDomain(s: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9.-]{1,250}\.[a-zA-Z]{2,}$/.test(s);
}

function isIp(s: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(s);
}

function isValidHostname(s: string): boolean {
  return /^[a-z0-9][a-z0-9.-]{0,250}\.[a-z]{2,}$/.test(s);
}

async function withRateLimit<T>(fn: () => Promise<T>): Promise<T> {
  const elapsed = Date.now() - lastRequestAt;
  if (lastRequestAt > 0 && elapsed < MIN_DELAY_MS) {
    await new Promise((r) => setTimeout(r, MIN_DELAY_MS - elapsed));
  }
  lastRequestAt = Date.now();
  return fn();
}

interface DnsDumpsterResult {
  domain: string;
  subdomains: Array<{ hostname: string; ip: string | null; asn: string | null; country: string | null; banner: string | null }>;
  a_records: Array<{ hostname: string; ip: string; asn: string | null; netblock: string | null; country: string | null; banner: string | null }>;
  mx_records: Array<{ hostname: string; ip: string | null; priority: number | null }>;
  ns_records: Array<{ hostname: string; ip: string | null }>;
  txt_records: string[];
  unique_ips: string[];
  unique_asns: string[];
  scanned_at: string;
  source: 'dnsdumpster';
}

function parseResponse(domain: string, payload: Record<string, unknown>): DnsDumpsterResult {
  const result: DnsDumpsterResult = {
    domain,
    subdomains: [],
    a_records: [],
    mx_records: [],
    ns_records: [],
    txt_records: [],
    unique_ips: [],
    unique_asns: [],
    scanned_at: new Date().toISOString(),
    source: 'dnsdumpster',
  };

  const ipSet = new Set<string>();
  const asnSet = new Set<string>();

  const extractRecord = (obj: Record<string, unknown>, sectionType: string) => {
    const host = String(obj.host || obj.hostname || obj.domain || obj.name || '').trim().toLowerCase().replace(/\.$/, '');
    const ip = String(obj.ip || obj.address || obj.ipv4 || '').trim();
    const asn = String(obj.asn || '').trim().toUpperCase() || null;
    const netblock = String(obj.netblock || obj.prefix || '').trim() || null;
    const country = String(obj.country || obj.country_code || '').trim() || null;
    const banner = String(obj.header || obj.banner || obj.server || '').trim().slice(0, 200) || null;

    if (ip && isIp(ip)) ipSet.add(ip);
    if (asn) asnSet.add(asn);

    if (sectionType === 'a' && host && host.includes(domain)) {
      result.a_records.push({ hostname: host, ip: ip || '', asn, netblock, country, banner });
      if (host !== domain && isValidHostname(host)) {
        result.subdomains.push({ hostname: host, ip: ip || null, asn, country, banner });
      }
    } else if (sectionType === 'mx' && host) {
      const priority = typeof obj.priority === 'number' ? obj.priority : null;
      result.mx_records.push({ hostname: host, ip: ip || null, priority });
    } else if (sectionType === 'ns' && host) {
      result.ns_records.push({ hostname: host, ip: ip || null });
    } else if (sectionType === 'txt') {
      const txt = String(obj.txt || obj.value || obj.data || obj.text || obj || '').trim();
      if (txt) result.txt_records.push(txt.slice(0, 500));
    }
  };

  // DNSDumpster API v2 response structure
  const processSection = (section: unknown, type: string) => {
    if (!section) return;
    if (Array.isArray(section)) {
      for (const item of section) {
        if (typeof item === 'object' && item !== null) extractRecord(item as Record<string, unknown>, type);
        else if (type === 'txt' && typeof item === 'string') result.txt_records.push(item.slice(0, 500));
      }
    } else if (typeof section === 'object') {
      extractRecord(section as Record<string, unknown>, type);
    }
  };

  // Standard DNSDumpster API v2 sections
  processSection(payload.a || (payload as any).dns_records?.a, 'a');
  processSection(payload.mx || (payload as any).dns_records?.mx, 'mx');
  processSection(payload.ns || (payload as any).dns_records?.ns, 'ns');
  processSection(payload.txt || (payload as any).dns_records?.txt, 'txt');

  // Also check for 'host' section (top-level DNS info)
  const hostSection = payload.host;
  if (hostSection && typeof hostSection === 'object') {
    const hostObj = hostSection as Record<string, unknown>;
    const ip = String(hostObj.ip || hostObj.address || '').trim();
    if (ip && isIp(ip)) ipSet.add(ip);
    const asn = String(hostObj.asn || '').trim().toUpperCase() || null;
    if (asn) asnSet.add(asn);
  }

  // Generic traversal for unknown response shapes
  if (result.a_records.length === 0 && result.subdomains.length === 0) {
    const walkObject = (obj: unknown, depth = 0) => {
      if (depth > 4 || !obj) return;
      if (Array.isArray(obj)) { obj.forEach((item) => walkObject(item, depth + 1)); return; }
      if (typeof obj !== 'object') return;
      const o = obj as Record<string, unknown>;
      const host = String(o.host || o.hostname || o.domain || o.subdomain || '').trim().toLowerCase().replace(/\.$/, '');
      const ip = String(o.ip || o.address || o.ipv4 || '').trim();
      if (host && host.includes(domain) && host !== domain && isValidHostname(host)) {
        if (!result.subdomains.some((s) => s.hostname === host)) {
          result.subdomains.push({ hostname: host, ip: ip || null, asn: null, country: null, banner: null });
        }
      }
      if (ip && isIp(ip)) ipSet.add(ip);
      for (const val of Object.values(o)) walkObject(val, depth + 1);
    };
    walkObject(payload);
  }

  result.unique_ips = [...ipSet].sort();
  result.unique_asns = [...asnSet].sort();
  result.subdomains = result.subdomains.slice(0, 200);
  result.a_records = result.a_records.slice(0, 100);
  result.txt_records = [...new Set(result.txt_records)].slice(0, 50);

  return result;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);

  // Auth: user JWT, service role, or internal secret
  const secretHeader = req.headers.get('x-surface-internal-secret');
  const authHeader = req.headers.get('Authorization') || '';
  const bearerKey = authHeader.replace(/^Bearer\s+/i, '').trim();

  const isTrusted = Boolean(
    (INTERNAL_SECRET && secretHeader === INTERNAL_SECRET) ||
    (SERVICE_ROLE && bearerKey === SERVICE_ROLE)
  );

  if (!isTrusted) {
    // Check user JWT
    const anonKey = String(Deno.env.get('SUPABASE_ANON_KEY') || '').trim();
    const userClient = createClient(SUPABASE_URL, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return jsonResponse({ ok: false, error: 'Unauthorized' }, 401);
  }

  if (!DNSDUMPSTER_API_KEY) {
    return jsonResponse({ ok: false, error: 'DNSDUMPSTER_API_KEY not configured' }, 503);
  }

  const body = await req.json().catch(() => ({}));
  const domain = String(body?.domain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const orgId = String(body?.organization_id || body?.customer_id || '').trim();
  const saveToDb = Boolean(body?.save_to_db ?? true);
  const scanId = String(body?.scan_id || '').trim() || null;

  if (!domain || !isValidDomain(domain)) {
    return jsonResponse({ ok: false, error: 'Valid domain required' }, 400);
  }

  try {
    // Rate limit
    const payload = await withRateLimit(async () => {
      const url = `https://api.dnsdumpster.com/domain/${encodeURIComponent(domain)}`;
      let attempts = 0;
      while (attempts < 3) {
        attempts++;
        const response = await fetch(url, {
          headers: {
            'X-API-Key': DNSDUMPSTER_API_KEY,
            Accept: 'application/json',
            'User-Agent': 'SurfaceScan360/1.0',
          },
          signal: AbortSignal.timeout(10_000),
        });

        if (response.status === 429 && attempts < 3) {
          await new Promise((r) => setTimeout(r, 2000 * attempts));
          continue;
        }
        if (!response.ok) throw new Error(`DNSDumpster HTTP ${response.status}`);
        return await response.json().catch(() => ({}));
      }
      throw new Error('DNSDumpster max retries exceeded');
    });

    const result = parseResponse(domain, payload as Record<string, unknown>);

    // Optionally persist to DB
    if (saveToDb && orgId && SUPABASE_URL && SERVICE_ROLE) {
      const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
      const now = new Date().toISOString();

      // Save as observation
      const observationRows = [{
        organization_id: orgId,
        tenant_id: orgId,
        customer_id: orgId,
        scan_job_id: scanId,
        module: 'dnsdumpster',
        observation_type: 'dns_intelligence',
        title: `DNSDumpster: ${result.subdomains.length} subdomains, ${result.unique_ips.length} IPs found for ${domain}`,
        value: {
          domain,
          subdomains_count: result.subdomains.length,
          a_records_count: result.a_records.length,
          unique_ips_count: result.unique_ips.length,
          unique_asns: result.unique_asns,
          mx_count: result.mx_records.length,
          ns_count: result.ns_records.length,
          txt_count: result.txt_records.length,
          sample_subdomains: result.subdomains.slice(0, 20).map((s) => s.hostname),
        },
        severity: 'info',
        confidence: 'high',
        source: 'dnsdumpster',
        raw: payload,
        created_at: now,
      }];
      await adminClient.from('surface_observations' as any).insert(observationRows).catch(() => undefined);

      // Save discovered subdomains as assets
      const assetRows = result.subdomains.slice(0, 100).map((s) => ({
        organization_id: orgId,
        tenant_id: orgId,
        customer_id: orgId,
        scan_job_id: scanId,
        asset_type: 'subdomain',
        asset_value: s.hostname,
        normalized_value: s.hostname.toLowerCase(),
        source: 'dnsdumpster',
        confidence: 'high',
        first_seen_at: now,
        last_seen_at: now,
        metadata: {
          ip: s.ip,
          asn: s.asn,
          country: s.country,
          banner: s.banner,
        },
      }));
      if (assetRows.length > 0) {
        await adminClient.from('surface_assets' as any)
          .upsert(assetRows, { onConflict: 'organization_id,asset_type,normalized_value', ignoreDuplicates: false })
          .catch(() => undefined);
      }
    }

    return jsonResponse({
      ok: true,
      domain,
      subdomains_count: result.subdomains.length,
      a_records_count: result.a_records.length,
      unique_ips_count: result.unique_ips.length,
      result,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[dnsdumpster-scan] error:', msg);
    return jsonResponse({ ok: false, error: msg }, 500);
  }
});
