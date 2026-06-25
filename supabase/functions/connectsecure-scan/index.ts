/**
 * connectsecure-scan — Edge Function standalone
 *
 * Chiamata:
 *  - POST { organization_id, domain, action? }
 *    action = 'test_auth'   → solo auth test, restituisce { ok: true, user_id }
 *    action = 'scan'        → BFS completo per domain
 *    action = 'weekly_all'  → sweep di tutte le org con config (dal cron)
 *
 * Auth: Bearer service-role oppure x-surface-internal-secret
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  csAuthorize,
  csGetOrCreateDomain,
  csScanNow,
  csWaitForJob,
  csGetResults,
  csMapToFindings,
  type CsConfig,
} from '../_shared/connectsecure-adapter.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-surface-internal-secret',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const INTERNAL_SECRET   = Deno.env.get('SURFACE_SCAN_CRON_INTERNAL_SECRET') || '';

  // Auth check
  const authHeader    = req.headers.get('Authorization') || '';
  const internalToken = req.headers.get('x-surface-internal-secret') || '';
  const isServiceRole = authHeader === `Bearer ${SERVICE_ROLE_KEY}`;
  const isInternal    = INTERNAL_SECRET && internalToken === INTERNAL_SECRET;

  if (!isServiceRole && !isInternal) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  try {
    const body = await req.json().catch(() => ({}));
    const action    = String(body.action || 'scan');
    const orgId     = body.organization_id as string | undefined;
    const inputDomain = body.domain as string | undefined;

    // ── Test auth ─────────────────────────────────────────────────────────────
    if (action === 'test_auth') {
      if (!orgId) return jsonErr('organization_id required', 400);

      const { data: cfg } = await adminClient
        .from('connectsecure_config')
        .select('pod_host, client_auth_token, company_id')
        .eq('organization_id', orgId)
        .maybeSingle();
      if (!cfg) return jsonErr('no ConnectSecure config for this org', 404);

      const session = await csAuthorize(cfg as CsConfig);
      return json({ ok: true, user_id: session.userId, pod_host: cfg.pod_host });
    }

    // ── Weekly sweep (tutte le org con config) ────────────────────────────────
    if (action === 'weekly_all') {
      const { data: configs } = await adminClient
        .from('connectsecure_config')
        .select('organization_id, pod_host, client_auth_token, company_id')
        .eq('enabled', true);

      const results: Array<{ org_id: string; domains_scanned: number; error?: string }> = [];
      for (const cfg of (configs || [])) {
        try {
          const r = await runBfsForOrg(adminClient, cfg as CsConfig & { organization_id: string }, undefined);
          results.push({ org_id: cfg.organization_id, domains_scanned: r.totalScanned });
        } catch (err) {
          results.push({ org_id: cfg.organization_id, domains_scanned: 0, error: String(err) });
        }
      }
      return json({ ok: true, orgs_swept: results.length, results });
    }

    // ── Single org scan ───────────────────────────────────────────────────────
    if (!orgId) return jsonErr('organization_id required', 400);

    const { data: cfg } = await adminClient
      .from('connectsecure_config')
      .select('pod_host, client_auth_token, company_id')
      .eq('organization_id', orgId)
      .eq('enabled', true)
      .maybeSingle();

    if (!cfg) return jsonErr('no ConnectSecure config for this org', 404);

    const r = await runBfsForOrg(
      adminClient,
      { ...(cfg as CsConfig), organization_id: orgId },
      inputDomain,
    );

    return json({ ok: true, organization_id: orgId, ...r });

  } catch (err) {
    console.error('[connectsecure-scan] unhandled error:', err);
    return json({ ok: false, error: String(err) }, 500);
  }
});

// ── BFS engine ────────────────────────────────────────────────────────────────

async function runBfsForOrg(
  adminClient: ReturnType<typeof createClient>,
  cfg: CsConfig & { organization_id: string },
  forceDomain?: string,
): Promise<{ totalScanned: number; maxDepthReached: number; domainsVisited: number }> {
  const MAX_DEPTH   = 10;
  const MAX_DOMAINS = 500;
  const orgId       = cfg.organization_id;

  // Recupera root domains dallo scope
  let startDomains: string[] = [];
  if (forceDomain) {
    startDomains = [forceDomain.trim().toLowerCase()];
  } else {
    const { data: scopeRules } = await adminClient
      .from('surface_scan_monitored_ips')
      .select('entry_type, input_value')
      .eq('organization_id', orgId)
      .in('entry_type', ['domain']);

    startDomains = (scopeRules || [])
      .map((r: any) => String(r.input_value || '').trim().toLowerCase())
      .filter(Boolean);
  }

  if (startDomains.length === 0) return { totalScanned: 0, maxDepthReached: 0, domainsVisited: 0 };

  const session     = { current: await csAuthorize(cfg) };
  const visited     = new Set<string>(startDomains);
  const queue: Array<{ domain: string; depth: number; parent?: string }> =
    startDomains.map(d => ({ domain: d, depth: 0 }));

  let totalScanned   = 0;
  let maxDepthReached = 0;

  while (queue.length > 0 && totalScanned < MAX_DOMAINS) {
    const currentDepth = queue[0].depth;
    const batch = queue.splice(0, queue.filter(q => q.depth === currentDepth).length);

    // Resolve domain IDs
    const domainObjs: Array<{ name: string; domain: string; company_id: number; id: number; depth: number; parent?: string }> = [];
    for (const b of batch) {
      try {
        const id = await csGetOrCreateDomain(cfg, session, b.domain, adminClient, orgId);
        await adminClient.from('connectsecure_domain_registry').upsert({
          organization_id: orgId,
          domain:          b.domain,
          cs_domain_id:    id,
          depth:           b.depth,
          parent_domain:   b.parent || null,
          last_scanned_at: new Date().toISOString(),
        }, { onConflict: 'organization_id,domain' });
        domainObjs.push({ name: b.domain, domain: b.domain, company_id: cfg.company_id, id, depth: b.depth, parent: b.parent });
      } catch (err) {
        console.warn('[connectsecure-scan] getOrCreateDomain failed:', b.domain, err);
      }
    }

    if (domainObjs.length === 0) continue;

    try {
      await csScanNow(cfg, session, domainObjs);
    } catch (err) {
      console.warn('[connectsecure-scan] scanNow failed:', err);
      continue;
    }

    for (const d of domainObjs) {
      let result;
      try {
        await csWaitForJob(cfg, session, d.domain, 360_000);
        result = await csGetResults(cfg, session, d.id);
      } catch (err) {
        console.warn('[connectsecure-scan] poll failed:', d.domain, err);
        continue;
      }
      if (!result) continue;

      totalScanned++;
      if (d.depth > maxDepthReached) maxDepthReached = d.depth;

      const { assets, findings, ports, observations, sensitiveData } = csMapToFindings(result, d.domain, d.depth);

      // Persist assets
      for (const a of assets) {
        await adminClient.from('surface_assets').upsert({
          organization_id: orgId,
          customer_id:     orgId,
          tenant_id:       orgId,
          asset_type:      a.asset_type,
          asset_value:     a.asset_value,
          hostname:        a.hostname || null,
          root_domain:     a.root_domain || null,
          ip:              a.ip || null,
          source:          a.source,
          confidence:      a.confidence,
          raw:             a.raw || {},
          first_seen:      new Date().toISOString(),
          last_seen:       new Date().toISOString(),
        }, { onConflict: 'organization_id,asset_type,asset_value' }).catch(console.warn);
      }

      // Persist findings
      for (const f of findings) {
        await adminClient.from('surface_findings').insert({
          organization_id: orgId,
          customer_id:     orgId,
          tenant_id:       orgId,
          provider:        f.provider,
          module:          f.module,
          finding_type:    f.finding_type,
          severity:        f.severity,
          title:           f.title,
          description:     f.description,
          affected_asset:  f.affected_asset,
          ip:              f.ip || null,
          port:            f.port || null,
          protocol:        f.protocol || null,
          cve:             f.cve || [],
          cwe:             f.cwe || [],
          cvss:            f.cvss || null,
          evidence:        f.evidence || {},
          remediation:     f.remediation || null,
          status:          'open',
          first_seen_at:   new Date().toISOString(),
          last_seen_at:    new Date().toISOString(),
        }).catch(console.warn);
      }

      // Persist open ports
      for (const p of ports) {
        await adminClient.from('surface_open_ports').upsert({
          organization_id: orgId,
          customer_id:     orgId,
          tenant_id:       orgId,
          host:            p.host,
          ip:              p.ip,
          port:            p.port,
          protocol:        p.protocol,
          state:           'open',
          service_name:    p.serviceName || null,
          service_version: p.serviceVersion || null,
          banner:          p.banner || null,
          is_web:          [80, 443, 8080, 8443, 8888, 9000, 3000].includes(p.port),
          is_tls:          [443, 8443, 993, 995, 465].includes(p.port),
          exposure_level:  'info',
          first_seen_at:   new Date().toISOString(),
          last_seen_at:    new Date().toISOString(),
          raw:             { source: 'connectsecure' },
        }, { onConflict: 'organization_id,host,port,protocol' }).catch(console.warn);
      }

      // Persist observations
      for (const obs of observations) {
        await adminClient.from('surface_observations').insert({
          organization_id: orgId,
          customer_id:     orgId,
          tenant_id:       orgId,
          module:          'connectsecure',
          observation_type: obs.type,
          title:           obs.title,
          value:           obs.value,
          severity:        obs.severity,
        }).catch(console.warn);
      }

      // Persist sensitive data
      if ((sensitiveData.creds?.length || 0) + (sensitiveData.hashes?.length || 0) > 0) {
        await adminClient.from('connectsecure_sensitive_data').insert({
          organization_id: orgId,
          domain:          sensitiveData.domain,
          creds_count:     sensitiveData.creds?.length || 0,
          hashes_count:    sensitiveData.hashes?.length || 0,
          creds:           sensitiveData.creds || null,
          hashes:          sensitiveData.hashes || null,
        }).catch(console.warn);
      }

      // Enqueue subdomains + seed scope
      if (d.depth < MAX_DEPTH) {
        for (const sub of result.subdomains || []) {
          const sub_domain = String(sub.subdomain || '').trim().toLowerCase();
          if (sub_domain && !visited.has(sub_domain)) {
            visited.add(sub_domain);
            queue.push({ domain: sub_domain, depth: d.depth + 1, parent: d.domain });
            // Seed into monitored scope so future weekly cron picks it up
            await adminClient.from('surface_scan_monitored_ips').upsert({
              organization_id: orgId,
              input_value:     sub_domain,
              entry_type:      'domain',
              ip_start:        '',
              ip_end:          '',
              discovered_via:  'connectsecure_bfs',
              discovered_from: d.domain,
              created_by:      null,
            }, { onConflict: 'organization_id,input_value' }).catch(console.warn);
          }
        }
      }
    }
  }

  return { totalScanned, maxDepthReached, domainsVisited: visited.size };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function jsonErr(msg: string, status: number) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
