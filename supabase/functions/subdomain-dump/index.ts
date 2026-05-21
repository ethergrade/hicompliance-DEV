// subdomain-dump: enumera sottodomini via Certificate Transparency (crt.sh) + Shodan DNS,
// arricchisce con IP/ASN/CIDR/Country e salva snapshot in `subdomain_dumps`.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';

const BodySchema = z.object({
  organization_id: z.string().uuid(),
  root_domain: z.string().trim().min(3).max(253),
  depth_limit: z.number().int().min(1).max(100).optional(),
  triggered_by: z.string().max(64).optional(),
});

const DOMAIN_RX = /^([a-z0-9-]+\.)+[a-z]{2,}$/i;
const SHODAN_KEY = Deno.env.get('SHODAN_API_KEY');

interface EnrichedSub {
  subdomain: string;
  ip: string | null;
  asn: number | null;
  asn_name: string | null;
  cidr: string | null;
  country: string | null;
  source: string[];
}

async function ctSubdomains(domain: string): Promise<Set<string>> {
  const out = new Set<string>();
  try {
    const r = await fetch(`https://crt.sh/?q=${encodeURIComponent('%.' + domain)}&output=json`, {
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) return out;
    const data = await r.json();
    for (const row of (data ?? [])) {
      const names: string = row?.name_value ?? '';
      for (const raw of names.split(/[\n,]/)) {
        const n = raw.trim().toLowerCase().replace(/^\*\./, '');
        if (!n || n === domain) continue;
        if (n.endsWith('.' + domain) && DOMAIN_RX.test(n)) out.add(n);
      }
    }
  } catch (e) { console.warn('ct error', (e as Error).message); }
  return out;
}

async function hackerTargetSubdomains(domain: string): Promise<Set<string>> {
  const out = new Set<string>();
  try {
    const r = await fetch(`https://api.hackertarget.com/hostsearch/?q=${encodeURIComponent(domain)}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) return out;
    const text = await r.text();
    if (text.toLowerCase().includes('error') || text.toLowerCase().includes('api count')) return out;
    for (const line of text.split('\n')) {
      const [host] = line.split(',');
      const n = host?.trim().toLowerCase();
      if (n && n.endsWith('.' + domain) && DOMAIN_RX.test(n)) out.add(n);
    }
  } catch (e) { console.warn('ht error', (e as Error).message); }
  return out;
}

async function shodanDnsSubdomains(domain: string): Promise<{ subs: Set<string>; ips: Map<string, string> }> {
  const subs = new Set<string>();
  const ips = new Map<string, string>();
  if (!SHODAN_KEY) return { subs, ips };
  try {
    const r = await fetch(`https://api.shodan.io/dns/domain/${encodeURIComponent(domain)}?key=${SHODAN_KEY}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) return { subs, ips };
    const data = await r.json();
    for (const sub of (data?.subdomains ?? [])) {
      const fqdn = `${sub}.${domain}`.toLowerCase();
      if (DOMAIN_RX.test(fqdn)) subs.add(fqdn);
    }
    for (const rec of (data?.data ?? [])) {
      if ((rec.type === 'A' || rec.type === 'AAAA') && rec.subdomain != null) {
        const fqdn = rec.subdomain ? `${rec.subdomain}.${domain}` : domain;
        if (fqdn !== domain && DOMAIN_RX.test(fqdn)) {
          subs.add(fqdn.toLowerCase());
          if (rec.type === 'A' && rec.value) ips.set(fqdn.toLowerCase(), String(rec.value));
        }
      }
    }
  } catch (e) { console.warn('shodan dns error', (e as Error).message); }
  return { subs, ips };
}

async function resolveDoh(host: string): Promise<string | null> {
  try {
    const r = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(host)}&type=A`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const a = (j?.Answer ?? []).find((x: any) => x.type === 1);
    return a?.data ?? null;
  } catch { return null; }
}

async function enrichIp(ip: string): Promise<{ asn: number | null; asn_name: string | null; cidr: string | null; country: string | null }> {
  if (!SHODAN_KEY) return { asn: null, asn_name: null, cidr: null, country: null };
  try {
    const r = await fetch(`https://api.shodan.io/shodan/host/${ip}?minify=true&key=${SHODAN_KEY}`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) return { asn: null, asn_name: null, cidr: null, country: null };
    const j = await r.json();
    const asnStr: string = j?.asn ?? ''; // formato "AS30722"
    const asn = asnStr.startsWith('AS') ? Number(asnStr.slice(2)) || null : null;
    return {
      asn,
      asn_name: j?.org ?? j?.isp ?? null,
      cidr: null,
      country: j?.country_name ?? j?.country_code ?? null,
    };
  } catch { return { asn: null, asn_name: null, cidr: null, country: null }; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { organization_id, triggered_by = 'manual' } = parsed.data;
    const root_domain = parsed.data.root_domain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!DOMAIN_RX.test(root_domain)) {
      return new Response(JSON.stringify({ error: 'Dominio non valido' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Carica setting org per il depth (admin-configurable)
    const { data: org } = await supabase
      .from('organizations')
      .select('subdomain_dump_depth, subdomain_dump_enabled')
      .eq('id', organization_id)
      .maybeSingle();
    if (org && org.subdomain_dump_enabled === false) {
      return new Response(JSON.stringify({ error: 'Subdomain Dump disabilitato per questa organizzazione' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const orgDepth = (org?.subdomain_dump_depth as number) ?? 10;
    const depth_limit = Math.max(1, Math.min(100, parsed.data.depth_limit ?? orgDepth));

    // 1) Discovery multi-source
    const sources: string[] = [];
    const [ctSet, htSet, shodanRes] = await Promise.all([
      ctSubdomains(root_domain),
      hackerTargetSubdomains(root_domain),
      shodanDnsSubdomains(root_domain),
    ]);
    if (ctSet.size) sources.push('crt.sh');
    if (htSet.size) sources.push('hackertarget');
    if (shodanRes.subs.size) sources.push('passive_dns');

    const all = new Set<string>([...ctSet, ...htSet, ...shodanRes.subs]);
    const total_discovered = all.size;

    // 2) Trunc al depth_limit (ordine stabile: alfabetico)
    const ordered = Array.from(all).sort();
    const selected = ordered.slice(0, depth_limit);
    const truncated = total_discovered > selected.length;

    // 3) Risoluzione IP + ASN/Country per i selezionati (max 10 in parallelo)
    const enriched: EnrichedSub[] = [];
    const CONCURRENCY = 5;
    for (let i = 0; i < selected.length; i += CONCURRENCY) {
      const chunk = selected.slice(i, i + CONCURRENCY);
      const out = await Promise.all(chunk.map(async (sub): Promise<EnrichedSub> => {
        const src: string[] = [];
        if (ctSet.has(sub)) src.push('crt.sh');
        if (htSet.has(sub)) src.push('hackertarget');
        if (shodanRes.subs.has(sub)) src.push('passive_dns');
        const ip = shodanRes.ips.get(sub) ?? await resolveDoh(sub);
        const meta = ip ? await enrichIp(ip) : { asn: null, asn_name: null, cidr: null, country: null };
        return { subdomain: sub, ip, ...meta, source: src };
      }));
      enriched.push(...out);
    }

    // 4) Persist
    const authHeader = req.headers.get('Authorization') ?? '';
    let created_by: string | null = null;
    try {
      const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: u } = await userClient.auth.getUser();
      created_by = u?.user?.id ?? null;
    } catch { /* service-role caller */ }

    const { data: row, error: insErr } = await supabase
      .from('subdomain_dumps')
      .insert({
        organization_id,
        root_domain,
        depth_limit,
        total_discovered,
        total_returned: enriched.length,
        truncated,
        sources,
        results: enriched,
        triggered_by,
        created_by,
      })
      .select('id, created_at')
      .single();
    if (insErr) throw insErr;

    return new Response(JSON.stringify({
      ok: true,
      id: row.id,
      created_at: row.created_at,
      root_domain,
      depth_limit,
      total_discovered,
      total_returned: enriched.length,
      truncated,
      sources,
      results: enriched,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('subdomain-dump error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
