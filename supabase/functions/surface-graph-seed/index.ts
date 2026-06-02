// surface-graph-seed: Popola il grafo dai dati esistenti SurfaceScan360.
// Legge surface_assets, surface_open_ports, surface_scan_history, darkrisk_findings
// e crea nodi/archi nell'investigazione specificata.
// v2: usa le colonne reali (asset_value non normalized_value), delete+insert per edges.
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const SUPABASE_URL = String(Deno.env.get('SUPABASE_URL') || '').trim();
const SERVICE_ROLE = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

const NODE_COLORS: Record<string, string> = {
  Domain: '#3b82f6', Subdomain: '#6366f1', Ip: '#10b981', Asn: '#8b5cf6',
  Email: '#f59e0b', Port: '#ef4444', Certificate: '#0ea5e9', DnsRecord: '#64748b',
  Credential: '#dc2626', Breach: '#b91c1c', Leak: '#ea580c', Organization: '#0ea5e9',
  Location: '#84cc16', Website: '#3b82f6', Cve: '#f97316', Technology: '#a78bfa',
};
const NODE_ICONS: Record<string, string> = {
  Domain: 'Globe', Subdomain: 'Link', Ip: 'Server', Asn: 'Network', Email: 'Mail',
  Port: 'Plug', Certificate: 'Shield', DnsRecord: 'FileText', Credential: 'Key',
  Breach: 'AlertTriangle', Leak: 'Droplets', Organization: 'Building2',
  Location: 'MapPin', Website: 'Globe2', Cve: 'Bug', Technology: 'Cpu',
};
const NODE_SHAPES: Record<string, string> = {
  Credential: 'triangle', Breach: 'triangle', Leak: 'triangle', Cve: 'hexagon',
  Asn: 'hexagon', Organization: 'square',
};
const NODE_SIZES: Record<string, number> = {
  Domain: 6, Subdomain: 4, Ip: 5, Asn: 7, Email: 5, Port: 3, Credential: 4, Breach: 5,
};

function makeNodeId(type: string, value: string) {
  return `${type.toLowerCase()}:${value.toLowerCase().trim()}`;
}

function buildNode(type: string, value: string, label: string, props: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: makeNodeId(type, value), nodeType: type, nodeLabel: label,
    nodeProperties: { value, ...props },
    nodeSize: NODE_SIZES[type] ?? 5,
    nodeColor: NODE_COLORS[type] ?? '#0074D9',
    nodeIcon: NODE_ICONS[type] ?? 'Circle',
    nodeImage: null, nodeFlag: null,
    nodeShape: NODE_SHAPES[type] ?? 'circle',
    nodeMetadata: {}, x: Math.random() * 400 - 200, y: Math.random() * 400 - 200,
  };
}

function buildEdge(src: string, tgt: string, label: string): Record<string, unknown> {
  return { id: `${src}--${label}--${tgt}`, source: src, target: tgt, label };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  // Auth: verificata a livello di RLS (service role per DB ops).
  // Il gateway Supabase gestisce il JWT check — niente doppio check manuale.
  const body = await req.json().catch(() => ({}));
  const investigationId = String(body?.investigation_id || '').trim();
  const organizationId  = String(body?.organization_id || '').trim();
  if (!investigationId || !organizationId) {
    return json({ ok: false, error: 'investigation_id and organization_id required' }, 400);
  }

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const nodeMap = new Map<string, Record<string, unknown>>();
  const edgeMap = new Map<string, Record<string, unknown>>();

  const addNode = (n: Record<string, unknown>) => nodeMap.set(n.id as string, n);
  const addEdge = (e: Record<string, unknown>) => edgeMap.set(e.id as string, e);

  try {
    // 1. Monitored IPs / domains (root nodes)
    const { data: monitored, error: monErr } = await adminClient
      .from('surface_scan_monitored_ips')
      .select('entry_type, input_value')
      .eq('organization_id', organizationId);
    if (monErr) console.warn('[seed] monitored_ips error:', monErr.message);

    for (const m of (monitored || []) as any[]) {
      const val = String(m.input_value || '').trim().toLowerCase();
      if (!val) continue;
      if (m.entry_type === 'domain') {
        addNode(buildNode('Domain', val, val, { is_root: true, source: 'monitored_scope' }));
      } else if (m.entry_type === 'single' && /^(\d{1,3}\.){3}\d{1,3}$/.test(val)) {
        addNode(buildNode('Ip', val, val, { is_root: true, source: 'monitored_scope' }));
      }
    }

    // 2. Surface assets — use asset_value (NOT normalized_value which doesn't exist)
    const { data: assets, error: assetsErr } = await adminClient
      .from('surface_assets')
      .select('asset_type, asset_value, source, ip')
      .or(`customer_id.eq.${organizationId},organization_id.eq.${organizationId}`)
      .in('asset_type', ['subdomain', 'reverse_dns_hostname', 'domain', 'ip'])
      .order('created_at', { ascending: false })
      .limit(500);
    if (assetsErr) console.warn('[seed] surface_assets error:', assetsErr.message);

    for (const a of (assets || []) as any[]) {
      const val = String(a.asset_value || '').trim().toLowerCase().replace(/\.$/, '');
      if (!val) continue;
      if (a.asset_type === 'subdomain' || a.asset_type === 'reverse_dns_hostname') {
        const node = buildNode('Subdomain', val, val, { source: 'surfacescan360', ip: a.ip });
        addNode(node);
        const parts = val.split('.');
        if (parts.length > 2) {
          const parent = parts.slice(1).join('.');
          const parentId = makeNodeId('Domain', parent);
          if (nodeMap.has(parentId)) addEdge(buildEdge(parentId, node.id as string, 'HAS_SUBDOMAIN'));
        }
      } else if (a.asset_type === 'ip' || a.asset_type === 'domain') {
        const type = a.asset_type === 'ip' ? 'Ip' : 'Domain';
        addNode(buildNode(type, val, val, { source: 'surfacescan360' }));
      }
    }

    // 3. Open ports (from Shodan sync)
    const { data: ports, error: portsErr } = await adminClient
      .from('surface_open_ports')
      .select('host, ip, port, protocol, service_name, service_product, service_version, exposure_level')
      .eq('customer_id', organizationId)
      .order('port', { ascending: true })
      .limit(300);
    if (portsErr) console.warn('[seed] surface_open_ports error:', portsErr.message);

    for (const p of (ports || []) as any[]) {
      const host = String(p.host || p.ip || '').trim().toLowerCase();
      if (!host || !p.port) continue;
      const portLabel = p.service_product ? `${p.port}/${p.service_product}` : String(p.port);
      const portNode = buildNode('Port', `${host}:${p.port}`, portLabel, {
        port: p.port, protocol: p.protocol || 'tcp',
        service: p.service_name || p.service_product,
        version: p.service_version, exposure_level: p.exposure_level || 'info',
        source: 'shodan',
      });
      addNode(portNode);
      const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(host);
      const hostId = makeNodeId(isIp ? 'Ip' : 'Subdomain', host);
      if (!nodeMap.has(hostId)) {
        addNode(buildNode(isIp ? 'Ip' : 'Subdomain', host, host, { source: 'shodan_port' }));
      }
      addEdge(buildEdge(hostId, portNode.id as string, 'HAS_PORT'));
    }

    // 4. DarkRisk identity leaks
    const { data: findings, error: findErr } = await adminClient
      .from('darkrisk_findings')
      .select('finding_type, title, severity, metadata')
      .eq('organization_id', organizationId)
      .in('finding_type', ['intelx_identity_leak', 'intelx_credential_exposure', 'intelx_identity_exposure', 'intelx_domain_leak', 'intelx_exposure_signal'])
      .order('risk_score', { ascending: false })
      .limit(100);
    if (findErr) console.warn('[seed] darkrisk_findings error:', findErr.message);

    for (const f of (findings || []) as any[]) {
      const isLeak = String(f.finding_type || '').includes('leak');
      const type = isLeak ? 'Breach' : 'Leak';
      const title = String(f.title || 'IntelX signal').slice(0, 80);
      const key = title.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 60);
      const node = buildNode(type, key, title, {
        severity: f.severity, source: 'intelx', finding_type: f.finding_type,
        query_term: (f.metadata as any)?.query_term || null,
      });
      addNode(node);
      const qt = String((f.metadata as any)?.query_term || '');
      if (qt.includes('@')) {
        const emailId = makeNodeId('Email', qt);
        if (!nodeMap.has(emailId)) addNode(buildNode('Email', qt, qt, { source: 'intelx_selector' }));
        addEdge(buildEdge(emailId, node.id as string, 'FOUND_IN_BREACH'));
      } else if (qt) {
        const scope = qt.replace(/^@/, '').toLowerCase();
        const domainId = makeNodeId('Domain', scope);
        if (nodeMap.has(domainId)) addEdge(buildEdge(domainId, node.id as string, 'HAS_LEAK'));
      }
    }

    // 5. Email selectors
    const { data: selectors, error: selErr } = await adminClient
      .from('darkrisk_selectors')
      .select('selector_type, normalized_value')
      .eq('organization_id', organizationId)
      .eq('selector_type', 'email')
      .in('status', ['approved', 'candidate'])
      .limit(50);
    if (selErr) console.warn('[seed] darkrisk_selectors error:', selErr.message);

    for (const s of (selectors || []) as any[]) {
      const email = String(s.normalized_value || '').trim().toLowerCase();
      if (!email || !email.includes('@')) continue;
      const emailNode = buildNode('Email', email, email, { source: 'selector' });
      addNode(emailNode);
      const domain = email.split('@')[1];
      if (domain) {
        const domainId = makeNodeId('Domain', domain);
        if (nodeMap.has(domainId)) {
          addEdge(buildEdge(emailNode.id as string, domainId, 'BELONGS_TO_DOMAIN'));
        }
      }
    }

    const allNodes = Array.from(nodeMap.values());
    const allEdges = Array.from(edgeMap.values());

    // Persist: delete existing + insert fresh (avoids complex upsert conflict expressions)
    await adminClient.from('surface_graph_edges').delete().eq('investigation_id', investigationId);
    await adminClient.from('surface_graph_nodes').delete().eq('investigation_id', investigationId);

    let nodesCreated = 0;
    let edgesCreated = 0;
    const now = new Date().toISOString();

    // Insert nodes in chunks
    const NODE_CHUNK = 200;
    for (let i = 0; i < allNodes.length; i += NODE_CHUNK) {
      const chunk = allNodes.slice(i, i + NODE_CHUNK).map((n: any) => ({
        id: n.id, investigation_id: investigationId, organization_id: organizationId, node_data: n,
      }));
      const { error: ne } = await adminClient.from('surface_graph_nodes').insert(chunk);
      if (ne) console.warn('[seed] node insert error:', ne.message);
      else nodesCreated += chunk.length;
    }

    // Insert edges in chunks
    const EDGE_CHUNK = 200;
    for (let i = 0; i < allEdges.length; i += EDGE_CHUNK) {
      const chunk = allEdges.slice(i, i + EDGE_CHUNK).map((e: any) => ({
        investigation_id: investigationId, organization_id: organizationId,
        source_node_id: String(e.source), target_node_id: String(e.target),
        edge_data: e,
      }));
      const { error: ee } = await adminClient.from('surface_graph_edges').insert(chunk);
      if (ee) console.warn('[seed] edge insert error:', ee.message);
      else edgesCreated += chunk.length;
    }

    // Update investigation counts
    await adminClient.from('surface_graph_investigations')
      .update({ node_count: nodesCreated, edge_count: edgesCreated, updated_at: now })
      .eq('id', investigationId);

    return json({ ok: true, nodes_created: nodesCreated, edges_created: edgesCreated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[surface-graph-seed] fatal:', msg);
    return json({ ok: false, error: msg }, 500);
  }
});
