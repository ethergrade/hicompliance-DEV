// surface-graph-enrich: Enricher dispatcher for SurfaceGraph.
// Accepts a node list + enricher name, calls external APIs, returns new nodes/edges.
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const SUPABASE_URL  = String(Deno.env.get('SUPABASE_URL') || '').trim();
const SERVICE_ROLE  = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
const SHODAN_KEY    = String(Deno.env.get('SHODAN_API_KEY') || '').trim();
const DNSDUMPSTER_KEY = String(Deno.env.get('DNSDUMPSTER_API_KEY') || '').trim();
const INTELX_KEY    = String(Deno.env.get('INTELX_API_KEY') || '').trim();
const INTELX_LEAKS  = String(Deno.env.get('INTELX_LEAKS_API_KEY') || INTELX_KEY).trim();

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
}

async function timedFetch(url: string, init: RequestInit = {}, ms = 12_000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...init, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

function makeNodeId(type: string, value: string) {
  return `${type.toLowerCase()}:${value.toLowerCase().trim()}`;
}

function buildNode(type: string, value: string, label: string, props: Record<string, unknown> = {}, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const NODE_COLORS: Record<string, string> = {
    Domain: '#3b82f6', Subdomain: '#6366f1', Ip: '#10b981', Asn: '#8b5cf6',
    Email: '#f59e0b', Port: '#ef4444', Certificate: '#0ea5e9', DnsRecord: '#64748b',
    Credential: '#dc2626', Breach: '#b91c1c', Leak: '#ea580c', Organization: '#0ea5e9',
    Location: '#84cc16', Website: '#3b82f6', Cve: '#f97316', Technology: '#a78bfa',
  };
  const NODE_ICONS: Record<string, string> = {
    Domain: 'Globe', Subdomain: 'Link', Ip: 'Server', Asn: 'Network',
    Email: 'Mail', Port: 'Plug', Certificate: 'Shield', DnsRecord: 'FileText',
    Credential: 'Key', Breach: 'AlertTriangle', Leak: 'Droplets', Organization: 'Building2',
    Location: 'MapPin', Website: 'Globe2', Cve: 'Bug', Technology: 'Cpu',
  };
  const NODE_SHAPES: Record<string, string> = {
    Credential: 'triangle', Breach: 'triangle', Leak: 'triangle', Cve: 'hexagon', Asn: 'hexagon', Organization: 'square',
  };
  const NODE_SIZES: Record<string, number> = { Domain: 6, Subdomain: 4, Ip: 5, Asn: 7, Email: 5, Port: 3, Credential: 4, Breach: 5 };
  return {
    id: makeNodeId(type, value),
    nodeType: type, nodeLabel: label,
    nodeProperties: { value, ...props },
    nodeSize: NODE_SIZES[type] ?? 5,
    nodeColor: NODE_COLORS[type] ?? '#0074D9',
    nodeIcon: NODE_ICONS[type] ?? 'Circle',
    nodeImage: null, nodeFlag: null,
    nodeShape: NODE_SHAPES[type] ?? 'circle',
    nodeMetadata: {}, x: Math.random() * 200 - 100, y: Math.random() * 200 - 100,
    ...extra,
  };
}

function buildEdge(src: string, tgt: string, label: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: `${src}--${label}--${tgt}`, source: src, target: tgt, label, ...extra };
}

// ─── Enrichers ───────────────────────────────────────────────────────────────

async function domainToIps(domain: string): Promise<{ nodes: unknown[]; edges: unknown[] }> {
  const nodes: unknown[] = [], edges: unknown[] = [];
  const srcId = makeNodeId('Domain', domain);
  try {
    const res = await timedFetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=A`, { headers: { accept: 'application/dns-json' } });
    if (res.ok) {
      const d = await res.json();
      for (const a of (d.Answer || [])) {
        if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(a.data)) continue;
        const ip = a.data;
        const node = buildNode('Ip', ip, ip, { ttl: a.TTL });
        nodes.push(node);
        edges.push(buildEdge(srcId, node.id as string, 'RESOLVES_TO'));
      }
    }
  } catch { /* ignore */ }
  return { nodes, edges };
}

async function domainToSubdomains(domain: string): Promise<{ nodes: unknown[]; edges: unknown[] }> {
  const nodes: unknown[] = [], edges: unknown[] = [];
  const srcId = makeNodeId('Domain', domain);
  try {
    const res = await timedFetch(`https://crt.sh/?q=%25.${encodeURIComponent(domain)}&output=json`, { headers: { 'User-Agent': 'SurfaceScan360/1.0' } }, 15_000);
    if (res.ok) {
      const certs = await res.json().catch(() => []);
      const seen = new Set<string>([domain]);
      for (const cert of (Array.isArray(certs) ? certs : []).slice(0, 200)) {
        const names = String(cert.name_value || '').split('\n');
        for (const n of names) {
          const sub = n.trim().replace(/^\*\./, '').toLowerCase();
          if (!sub || seen.has(sub) || !sub.endsWith(`.${domain}`) || !sub.includes('.')) continue;
          seen.add(sub);
          const node = buildNode('Subdomain', sub, sub);
          nodes.push(node);
          edges.push(buildEdge(srcId, node.id as string, 'HAS_SUBDOMAIN'));
        }
      }
    }
  } catch { /* ignore */ }
  // Also try DNSDumpster if key available
  if (DNSDUMPSTER_KEY) {
    try {
      const res = await timedFetch(`https://api.dnsdumpster.com/domain/${encodeURIComponent(domain)}`, {
        headers: { 'X-API-Key': DNSDUMPSTER_KEY, Accept: 'application/json', 'User-Agent': 'SurfaceScan360/1.0' },
      }, 12_000);
      if (res.ok) {
        const d = await res.json().catch(() => ({}));
        const seen2 = new Set(nodes.map((n: any) => n.id));
        const walkSubs = (arr: unknown[]) => {
          for (const item of arr) {
            if (typeof item !== 'object' || !item) continue;
            const host = String((item as any).host || (item as any).hostname || '').toLowerCase();
            if (host && host.endsWith(`.${domain}`) && host !== domain) {
              const id = makeNodeId('Subdomain', host);
              if (!seen2.has(id)) {
                seen2.add(id);
                const node = buildNode('Subdomain', host, host);
                nodes.push(node);
                edges.push(buildEdge(srcId, node.id as string, 'HAS_SUBDOMAIN'));
              }
            }
          }
        };
        if (Array.isArray(d.a)) walkSubs(d.a);
        if (Array.isArray(d.cname)) walkSubs(d.cname);
      }
    } catch { /* ignore */ }
  }
  return { nodes, edges };
}

async function domainToWhois(domain: string): Promise<{ nodes: unknown[]; edges: unknown[] }> {
  const nodes: unknown[] = [], edges: unknown[] = [];
  const srcId = makeNodeId('Domain', domain);
  try {
    const res = await timedFetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, { headers: { Accept: 'application/json' } });
    if (res.ok) {
      const d = await res.json();
      const events = (d.events || []) as any[];
      const getDate = (action: string) => events.find((e: any) => e.eventAction === action)?.eventDate;
      const ns = ((d.nameservers || []) as any[]).map((n: any) => n.ldhName?.toLowerCase()).filter(Boolean);
      const registrar = ((d.entities || []) as any[]).find((e: any) => e.roles?.includes('registrar'));
      const registrarName = registrar?.vcardArray?.[1]?.find((v: any) => v[0] === 'fn')?.[3] || '';
      const orgEntity = ((d.entities || []) as any[]).find((e: any) => e.roles?.includes('registrant'));
      const orgName = orgEntity?.vcardArray?.[1]?.find((v: any) => v[0] === 'org')?.[3] || '';
      if (orgName) {
        const node = buildNode('Organization', orgName, orgName, { type: 'registrant' });
        nodes.push(node);
        edges.push(buildEdge(srcId, node.id as string, 'REGISTERED_BY'));
      }
      // Nameservers as DnsRecord nodes
      for (const ns_ of ns.slice(0, 4)) {
        const node = buildNode('DnsRecord', ns_, ns_, { record_type: 'NS', ttl: 86400 });
        nodes.push(node);
        edges.push(buildEdge(srcId, node.id as string, 'HAS_NS'));
      }
    }
  } catch { /* ignore */ }
  return { nodes, edges };
}

async function ipToAsn(ip: string): Promise<{ nodes: unknown[]; edges: unknown[] }> {
  const nodes: unknown[] = [], edges: unknown[] = [];
  const srcId = makeNodeId('Ip', ip);
  try {
    const res = await timedFetch(`https://api.bgpview.io/ip/${encodeURIComponent(ip)}`, { headers: { Accept: 'application/json' } });
    if (res.ok) {
      const d = await res.json();
      const prefixes = d.data?.prefixes || [];
      for (const p of prefixes.slice(0, 3)) {
        const asn = p.asn?.asn ? `AS${p.asn.asn}` : null;
        const asnName = p.asn?.name || asn || 'Unknown';
        if (asn) {
          const node = buildNode('Asn', asn, asnName, { name: asnName, prefix: p.prefix });
          nodes.push(node);
          edges.push(buildEdge(srcId, node.id as string, 'BELONGS_TO_ASN'));
        }
        if (p.name) {
          const org = buildNode('Organization', p.name, p.name, { type: 'asn_owner' });
          nodes.push(org);
          edges.push(buildEdge(srcId, org.id as string, 'OWNED_BY'));
        }
      }
    }
  } catch { /* ignore */ }
  return { nodes, edges };
}

async function ipToPorts(ip: string): Promise<{ nodes: unknown[]; edges: unknown[] }> {
  const nodes: unknown[] = [], edges: unknown[] = [];
  const srcId = makeNodeId('Ip', ip);
  if (!SHODAN_KEY) return { nodes, edges };
  try {
    const res = await timedFetch(`https://api.shodan.io/shodan/host/${encodeURIComponent(ip)}?key=${SHODAN_KEY}`);
    if (res.ok) {
      const d = await res.json();
      for (const port of ((d.ports || []) as number[]).slice(0, 20)) {
        const svc = ((d.data || []) as any[]).find((s: any) => s.port === port);
        const label = svc?.product ? `${port}/${svc.product}` : String(port);
        const node = buildNode('Port', `${ip}:${port}`, label, {
          port, protocol: svc?.transport || 'tcp',
          service: svc?.product || null, version: svc?.version || null,
          banner: String(svc?.data || '').slice(0, 200),
        });
        nodes.push(node);
        edges.push(buildEdge(srcId, node.id as string, 'HAS_PORT'));
      }
      // CVEs
      if (d.vulns) {
        const vulnList = Array.isArray(d.vulns) ? d.vulns : Object.keys(d.vulns);
        for (const cve of vulnList.slice(0, 10)) {
          const info = typeof d.vulns === 'object' && !Array.isArray(d.vulns) ? d.vulns[cve] : {};
          const node = buildNode('Cve', cve, cve, { cvss: info?.cvss || null });
          nodes.push(node);
          edges.push(buildEdge(srcId, node.id as string, 'VULNERABLE_TO'));
        }
      }
    }
  } catch { /* ignore */ }
  return { nodes, edges };
}

async function ipToGeo(ip: string): Promise<{ nodes: unknown[]; edges: unknown[] }> {
  const nodes: unknown[] = [], edges: unknown[] = [];
  const srcId = makeNodeId('Ip', ip);
  try {
    const res = await timedFetch(`https://ipwho.is/${encodeURIComponent(ip)}`);
    if (res.ok) {
      const d = await res.json();
      if (d.success && d.country) {
        const loc = `${d.city || ''}, ${d.country}`.replace(/^, /, '');
        const node = buildNode('Location', loc, loc, { country: d.country, country_code: d.country_code, city: d.city, lat: d.latitude, lon: d.longitude });
        nodes.push(node);
        edges.push(buildEdge(srcId, node.id as string, 'LOCATED_IN'));
        if (d.org || d.isp) {
          const orgName = d.org || d.isp;
          const org = buildNode('Organization', orgName, orgName, { isp: d.isp, type: 'isp' });
          nodes.push(org);
          edges.push(buildEdge(srcId, org.id as string, 'HOSTED_BY'));
        }
      }
    }
  } catch { /* ignore */ }
  return { nodes, edges };
}

async function emailToDomain(email: string): Promise<{ nodes: unknown[]; edges: unknown[] }> {
  const nodes: unknown[] = [], edges: unknown[] = [];
  const srcId = makeNodeId('Email', email);
  const domain = email.split('@')[1];
  if (!domain) return { nodes, edges };
  const node = buildNode('Domain', domain, domain);
  nodes.push(node);
  edges.push(buildEdge(srcId, node.id as string, 'BELONGS_TO_DOMAIN'));
  return { nodes, edges };
}

async function emailToBreaches(email: string): Promise<{ nodes: unknown[]; edges: unknown[] }> {
  const nodes: unknown[] = [], edges: unknown[] = [];
  const srcId = makeNodeId('Email', email);
  if (!INTELX_LEAKS) return { nodes, edges };
  try {
    const submitRes = await timedFetch(`https://3.intelx.io/live/search/internal?selector=${encodeURIComponent(email)}&limit=20&bucket=&skipinvalid=true&analyze=false`, {
      headers: { 'x-key': INTELX_LEAKS, 'User-Agent': 'SurfaceScan360/1.0' },
    });
    if (!submitRes.ok) return { nodes, edges };
    const submitData = await submitRes.json();
    const searchId = String(submitData?.id || '');
    if (!searchId) return { nodes, edges };

    await new Promise((r) => setTimeout(r, 1500));
    const resultRes = await timedFetch(`https://3.intelx.io/live/search/result?id=${searchId}&format=1&limit=20`, {
      headers: { 'x-key': INTELX_LEAKS, 'User-Agent': 'SurfaceScan360/1.0' },
    });
    if (!resultRes.ok) return { nodes, edges };
    const resultData = await resultRes.json();
    const records = Array.isArray(resultData?.records) ? resultData.records : [];

    const seen = new Set<string>();
    for (const rec of records.slice(0, 15)) {
      const title = String(rec?.name || rec?.title || 'Unknown breach').slice(0, 100);
      const key = title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const node = buildNode('Breach', key, title, { source: 'intelx_leaks', date: rec?.date || null, bucket: rec?.bucket || null });
      nodes.push(node);
      edges.push(buildEdge(srcId, node.id as string, 'FOUND_IN_BREACH'));
    }

    // Terminate search
    await timedFetch(`https://3.intelx.io/live/search/terminate?id=${searchId}`, {
      headers: { 'x-key': INTELX_LEAKS, 'User-Agent': 'SurfaceScan360/1.0' },
    }, 5_000).catch(() => {});
  } catch { /* ignore */ }
  return { nodes, edges };
}

async function domainToLeaks(domain: string): Promise<{ nodes: unknown[]; edges: unknown[] }> {
  const nodes: unknown[] = [], edges: unknown[] = [];
  const srcId = makeNodeId('Domain', domain);
  if (!INTELX_KEY) return { nodes, edges };
  try {
    const submitRes = await timedFetch(`https://2.intelx.io/intelligent/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-key': INTELX_KEY, 'User-Agent': 'SurfaceScan360/1.0' },
      body: JSON.stringify({ term: `@${domain}`, buckets: [], lookuplevel: 0, maxresults: 20, timeout: 10, sort: 2, media: 0, terminate: [] }),
    });
    if (!submitRes.ok) return { nodes, edges };
    const sd = await submitRes.json();
    const id = String(sd?.id || '');
    if (!id) return { nodes, edges };

    await new Promise((r) => setTimeout(r, 1500));
    const resRes = await timedFetch(`https://2.intelx.io/intelligent/search/result?id=${id}&limit=20`, {
      headers: { 'x-key': INTELX_KEY, 'User-Agent': 'SurfaceScan360/1.0' },
    });
    if (!resRes.ok) return { nodes, edges };
    const rd = await resRes.json();
    const records = Array.isArray(rd?.records) ? rd.records : [];
    const seen = new Set<string>();
    for (const rec of records.slice(0, 10)) {
      const name = String(rec?.name || 'Leak record').slice(0, 100);
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const node = buildNode('Leak', key, name, { source: 'intelx_search', bucket: rec?.bucket || null });
      nodes.push(node);
      edges.push(buildEdge(srcId, node.id as string, 'FOUND_IN_LEAK'));
    }
    await timedFetch(`https://2.intelx.io/intelligent/search/terminate?id=${id}`, {
      headers: { 'x-key': INTELX_KEY, 'User-Agent': 'SurfaceScan360/1.0' },
    }, 5_000).catch(() => {});
  } catch { /* ignore */ }
  return { nodes, edges };
}

async function domainToEmailSecurity(domain: string): Promise<{ nodes: unknown[]; edges: unknown[] }> {
  const nodes: unknown[] = [], edges: unknown[] = [];
  const srcId = makeNodeId('Domain', domain);
  const checkTypes = ['MX', 'TXT', 'CNAME'];
  for (const type of checkTypes) {
    try {
      const res = await timedFetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=${type}`, { headers: { accept: 'application/dns-json' } });
      if (!res.ok) continue;
      const d = await res.json();
      for (const a of (d.Answer || []).slice(0, 5)) {
        const val = String(a.data || '').slice(0, 200);
        const label = `${type}: ${val.slice(0, 60)}`;
        const node = buildNode('DnsRecord', `${domain}-${type}-${val.slice(0, 30)}`, label, { record_type: type, value: val, ttl: a.TTL });
        nodes.push(node);
        edges.push(buildEdge(srcId, node.id as string, `HAS_${type}`));
      }
    } catch { /* ignore */ }
  }
  // DMARC
  try {
    const res = await timedFetch(`https://dns.google/resolve?name=_dmarc.${encodeURIComponent(domain)}&type=TXT`, { headers: { accept: 'application/dns-json' } });
    if (res.ok) {
      const d = await res.json();
      for (const a of (d.Answer || [])) {
        const val = String(a.data || '');
        if (val.includes('v=DMARC1')) {
          const node = buildNode('DnsRecord', `${domain}-dmarc`, `DMARC: ${val.slice(0, 60)}`, { record_type: 'DMARC', value: val });
          nodes.push(node);
          edges.push(buildEdge(srcId, node.id as string, 'HAS_DMARC'));
        }
      }
    }
  } catch { /* ignore */ }
  return { nodes, edges };
}

// ─── Dispatcher ──────────────────────────────────────────────────────────────

const ENRICHERS: Record<string, (value: string) => Promise<{ nodes: unknown[]; edges: unknown[] }>> = {
  domain_to_ips:            (v) => domainToIps(v),
  domain_to_subdomains:     (v) => domainToSubdomains(v),
  domain_to_whois:          (v) => domainToWhois(v),
  domain_to_asn:            (v) => ipToAsn(v),
  domain_to_email_security: (v) => domainToEmailSecurity(v),
  domain_to_leaks:          (v) => domainToLeaks(v),
  ip_to_ports:              (v) => ipToPorts(v),
  ip_to_asn:                (v) => ipToAsn(v),
  ip_to_geo:                (v) => ipToGeo(v),
  email_to_breaches:        (v) => emailToBreaches(v),
  email_to_domain:          (v) => emailToDomain(v),
  subdomain_to_ips:         (v) => domainToIps(v),
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  // Auth: gestita a livello gateway + RLS sulle tabelle surface_graph_*

  const body = await req.json().catch(() => ({}));
  const enricherName    = String(body?.enricher_name || '').trim();
  const inputNodeIds    = Array.isArray(body?.input_node_ids) ? body.input_node_ids as string[] : [];
  const investigationId = String(body?.investigation_id || '').trim();
  const organizationId  = String(body?.organization_id || '').trim();
  const runId           = String(body?.run_id || '').trim() || null;

  if (!enricherName || !inputNodeIds.length || !investigationId || !organizationId) {
    return json({ ok: false, error: 'enricher_name, input_node_ids, investigation_id, organization_id required' }, 400);
  }

  const enricherFn = ENRICHERS[enricherName];
  if (!enricherFn) return json({ ok: false, error: `Unknown enricher: ${enricherName}` }, 400);

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // Load input nodes to get values
  const { data: inputRows } = await adminClient
    .from('surface_graph_nodes')
    .select('id, node_data')
    .eq('investigation_id', investigationId)
    .in('id', inputNodeIds);

  const allNewNodes: unknown[] = [];
  const allNewEdges: unknown[] = [];

  for (const row of (inputRows || []) as any[]) {
    const nodeData = row.node_data;
    const value = String(nodeData?.nodeProperties?.value || nodeData?.nodeLabel || '').trim();
    if (!value) continue;
    try {
      const { nodes, edges } = await enricherFn(value);
      allNewNodes.push(...nodes);
      allNewEdges.push(...edges);
    } catch (err) {
      console.error(`[surface-graph-enrich] ${enricherName} failed for ${value}:`, err);
    }
  }

  // Deduplicate nodes
  const nodeMap = new Map<string, unknown>();
  for (const n of allNewNodes) nodeMap.set((n as any).id, n);
  const uniqueNodes = Array.from(nodeMap.values());

  // Deduplicate edges
  const edgeMap = new Map<string, unknown>();
  for (const e of allNewEdges) edgeMap.set((e as any).id, e);
  const uniqueEdges = Array.from(edgeMap.values());

  // Persist to DB
  let nodesCreated = 0, edgesCreated = 0;
  const now = new Date().toISOString();

  if (uniqueNodes.length > 0) {
    const nodeRows = uniqueNodes.map((n: any) => ({
      id: n.id, investigation_id: investigationId,
      organization_id: organizationId, node_data: n,
    }));
    const { error: ne } = await adminClient.from('surface_graph_nodes')
      .upsert(nodeRows, { onConflict: 'id,investigation_id', ignoreDuplicates: false });
    if (!ne) nodesCreated = nodeRows.length;
    else console.warn('[surface-graph-enrich] node upsert error:', ne.message);
  }

  if (uniqueEdges.length > 0) {
    const edgeRows = uniqueEdges.map((e: any) => ({
      investigation_id: investigationId, organization_id: organizationId,
      source_node_id: String(e.source), target_node_id: String(e.target),
      edge_data: e,
    }));
    const { error: ee } = await adminClient.from('surface_graph_edges')
      .upsert(edgeRows, { onConflict: 'investigation_id,source_node_id,target_node_id,(edge_data->>\'label\')', ignoreDuplicates: true });
    if (!ee) edgesCreated = edgeRows.length;
    else console.warn('[surface-graph-enrich] edge upsert error:', ee.message);
  }

  // Update enricher run status
  if (runId) {
    await adminClient.from('surface_graph_enricher_runs')
      .update({ status: 'completed', nodes_created: nodesCreated, edges_created: edgesCreated, completed_at: now })
      .eq('id', runId);
  }

  // Update investigation counts
  const { count: nc } = await adminClient.from('surface_graph_nodes').select('id', { count: 'exact', head: true }).eq('investigation_id', investigationId);
  const { count: ec } = await adminClient.from('surface_graph_edges').select('id', { count: 'exact', head: true }).eq('investigation_id', investigationId);
  await adminClient.from('surface_graph_investigations').update({ node_count: nc || 0, edge_count: ec || 0, updated_at: now }).eq('id', investigationId);

  return json({ ok: true, nodes_created: nodesCreated, edges_created: edgesCreated, nodes: uniqueNodes, edges: uniqueEdges });
});
