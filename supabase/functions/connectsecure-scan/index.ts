/**
 * connectsecure-scan — Edge Function
 *
 * Azioni:
 *  test_auth   → verifica connessione CS (restituisce user_id)
 *  scan        → external scan per una org specifica
 *  weekly_all  → sweep di tutte le org abilitate (dal cron)
 *
 * Auth: service-role key | x-surface-internal-secret | JWT utente Supabase valido
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  csAuthorize,
  csGetDiscoverySettings,
  csCreateDiscoverySetting,
  csExternalScan,
  csGetExternalScanAssets,
  csGetExternalPorts,
  csGetExternalVulns,
  csMapExternalToFindings,
  type CsConfig,
} from '../_shared/connectsecure-adapter.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-surface-internal-secret',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const INTERNAL_SECRET  = Deno.env.get('SURFACE_SCAN_CRON_INTERNAL_SECRET') || '';

  const authHeader    = req.headers.get('Authorization') || '';
  const internalToken = req.headers.get('x-surface-internal-secret') || '';
  const isServiceRole = authHeader === `Bearer ${SERVICE_ROLE_KEY}`;
  const isInternal    = INTERNAL_SECRET && internalToken === INTERNAL_SECRET;

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Accetta anche JWT utente Supabase valido
  if (!isServiceRole && !isInternal) {
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    if (!token) return unauthorized();
    const { data: { user }, error } = await adminClient.auth.getUser(token);
    if (error || !user) return unauthorized();
  }

  // Secrets globali CS (override per-org)
  const GLOBAL_POD_HOST = Deno.env.get('CS_POD_HOST');
  const GLOBAL_TOKEN    = Deno.env.get('CS_CLIENT_AUTH_TOKEN');
  const GLOBAL_COMPANY  = Deno.env.get('CS_COMPANY_ID');
  const hasGlobalCfg    = !!(GLOBAL_POD_HOST && GLOBAL_TOKEN && GLOBAL_COMPANY);

  function mergeWithGlobal(dbCfg: Partial<CsConfig> = {}): CsConfig {
    return {
      pod_host:          (GLOBAL_POD_HOST || dbCfg.pod_host || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, ''),
      client_auth_token: (GLOBAL_TOKEN    || dbCfg.client_auth_token || '').trim(),
      company_id:        GLOBAL_COMPANY  ? parseInt(GLOBAL_COMPANY.trim(), 10) : (dbCfg.company_id ?? 0),
    };
  }

  try {
    const body      = await req.json().catch(() => ({}));
    const action    = String(body.action || 'scan');
    const orgId     = body.organization_id as string | undefined;
    const inputDomain = body.domain as string | undefined;

    // ── Test auth ───────────────────────────────────────────────────────────
    if (action === 'test_auth') {
      let cfgBase: Partial<CsConfig> = {};
      if (orgId) {
        const { data } = await adminClient
          .from('connectsecure_config')
          .select('pod_host, client_auth_token, company_id')
          .eq('organization_id', orgId)
          .maybeSingle();
        cfgBase = data || {};
      }
      const cfg = mergeWithGlobal(cfgBase);
      if (!cfg.pod_host || !cfg.client_auth_token) return jsonErr('nessuna configurazione ConnectSecure disponibile', 404);
      const session = await csAuthorize(cfg);
      return json({ ok: true, user_id: session.userId, pod_host: cfg.pod_host, global_cfg: hasGlobalCfg });
    }

    // ── Weekly sweep ────────────────────────────────────────────────────────
    if (action === 'weekly_all') {
      const { data: configs } = await adminClient
        .from('connectsecure_config')
        .select('organization_id, pod_host, client_auth_token, company_id')
        .eq('enabled', true);

      const results: Array<{ org_id: string; assets_scanned: number; triggered: number; error?: string }> = [];
      for (const cfg of (configs || [])) {
        try {
          const mergedCfg = mergeWithGlobal(cfg as Partial<CsConfig>);
          const r = await runExternalScanForOrg(adminClient, { ...mergedCfg, organization_id: cfg.organization_id }, undefined);
          results.push({ org_id: cfg.organization_id, ...r });
        } catch (err) {
          results.push({ org_id: cfg.organization_id, assets_scanned: 0, triggered: 0, error: String(err) });
        }
      }
      return json({ ok: true, orgs_swept: results.length, results });
    }

    // ── Single org scan ─────────────────────────────────────────────────────
    if (!orgId) return jsonErr('organization_id obbligatorio', 400);

    const { data: dbCfg } = await adminClient
      .from('connectsecure_config')
      .select('pod_host, client_auth_token, company_id')
      .eq('organization_id', orgId)
      .maybeSingle();

    const cfg = mergeWithGlobal(dbCfg || {});
    if (!cfg.pod_host || !cfg.client_auth_token) return jsonErr('nessuna configurazione ConnectSecure per questa org', 404);

    const r = await runExternalScanForOrg(adminClient, { ...cfg, organization_id: orgId }, inputDomain);
    return json({ ok: true, organization_id: orgId, ...r });

  } catch (err) {
    console.error('[connectsecure-scan] errore:', err);
    return json({ ok: false, error: String(err) }, 500);
  }
});

// ── External Scan Engine ──────────────────────────────────────────────────────

async function runExternalScanForOrg(
  adminClient: ReturnType<typeof createClient>,
  cfg: CsConfig & { organization_id: string },
  forceDomain?: string,
): Promise<{ assets_scanned: number; triggered: number; findings_saved: number }> {
  const orgId = cfg.organization_id;

  // 1. Recupera scope org
  let scopeEntries: Array<{ input_value: string; entry_type: string }> = [];
  if (forceDomain) {
    scopeEntries = [{ input_value: forceDomain.trim().toLowerCase(), entry_type: 'domain' }];
  } else {
    const { data } = await adminClient
      .from('surface_scan_monitored_ips')
      .select('entry_type, input_value')
      .eq('organization_id', orgId)
      .in('entry_type', ['domain', 'ip', 'ip_range']);
    scopeEntries = (data || []).map((r: any) => ({
      input_value: String(r.input_value || '').trim().toLowerCase(),
      entry_type:  String(r.entry_type || 'domain'),
    })).filter(r => r.input_value);
  }

  if (scopeEntries.length === 0) return { assets_scanned: 0, triggered: 0, findings_saved: 0 };

  // 2. Auth CS
  const session = { current: await csAuthorize(cfg) };

  // 3. Leggi discovery settings esistenti in CS per questa company
  const existingSettings = await csGetDiscoverySettings(cfg, session);
  const settingsByAddr   = new Map(existingSettings.map(s => [s.address.toLowerCase(), s.id]));

  // 4. Per ogni entry in scope: usa l'ID esistente o crea il discovery setting
  const dsIds: number[] = [];
  for (const entry of scopeEntries) {
    const addr = entry.input_value;
    if (settingsByAddr.has(addr)) {
      dsIds.push(settingsByAddr.get(addr)!);
    } else {
      const addrType = entry.entry_type === 'ip' || entry.entry_type === 'ip_range' ? 'ipaddress' : 'domain';
      const newId = await csCreateDiscoverySetting(cfg, session, addr, addrType);
      if (newId) {
        dsIds.push(newId);
        settingsByAddr.set(addr, newId);
        console.log(`[cs-scan] creato discovery setting id=${newId} per ${addr}`);
      }
    }
  }

  if (dsIds.length === 0) return { assets_scanned: 0, triggered: 0, findings_saved: 0 };

  // 5. Trigger external scan (asincrono su CS — i risultati arrivano dopo alcuni minuti)
  const scanResp = await csExternalScan(cfg, session, dsIds);
  console.log(`[cs-scan] external_scan triggerato: status=${scanResp.status} msg=${scanResp.message || ''}`);

  // 6. Leggi i risultati disponibili (scan precedente o corrente se già completato)
  const allAssets = await csGetExternalScanAssets(cfg, session);

  // 7. Filtra gli asset per lo scope di questa org
  const scopeAddrSet = new Set(scopeEntries.map(e => e.input_value));
  const relevantAssets = allAssets.filter(a => {
    const hn = (a.host_name || '').toLowerCase();
    const nm = (a.name     || '').toLowerCase();
    // Match diretto o sottodominio
    return Array.from(scopeAddrSet).some(scope =>
      hn === scope || hn.endsWith(`.${scope}`) ||
      nm === scope || nm.endsWith(`.${scope}`)
    );
  });

  // 8. Per ogni asset rilevante: porta + vuln + salva in DB
  let findingsSaved = 0;
  for (const asset of relevantAssets) {
    const [ports, vulns] = await Promise.all([
      csGetExternalPorts(cfg, session, asset.id),
      csGetExternalVulns(cfg, session, asset.id),
    ]);

    const { assets: mappedAssets, findings, ports: mappedPorts } = csMapExternalToFindings(asset, ports, vulns);

    const now = new Date().toISOString();

    for (const a of mappedAssets) {
      await adminClient.from('surface_assets').upsert({
        organization_id: orgId,
        customer_id:     orgId,
        tenant_id:       orgId,
        asset_type:      a.asset_type,
        asset_value:     a.asset_value,
        hostname:        a.hostname  || null,
        root_domain:     a.root_domain || null,
        ip:              a.ip        || null,
        source:          a.source,
        confidence:      a.confidence,
        raw:             a.raw || {},
        first_seen:      now,
        last_seen:       now,
      }, { onConflict: 'organization_id,asset_type,asset_value' }).catch(console.warn);
    }

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
        ip:              f.ip        || null,
        port:            f.port      || null,
        protocol:        f.protocol  || null,
        cve:             f.cve       || [],
        cwe:             f.cwe       || [],
        cvss:            f.cvss      || null,
        evidence:        f.evidence  || {},
        remediation:     f.remediation || null,
        status:          'open',
        first_seen_at:   now,
        last_seen_at:    now,
      }).catch(console.warn);
      findingsSaved++;
    }

    for (const p of mappedPorts) {
      await adminClient.from('surface_open_ports').upsert({
        organization_id: orgId,
        customer_id:     orgId,
        tenant_id:       orgId,
        host:            p.host,
        ip:              p.ip,
        port:            p.port,
        protocol:        p.protocol,
        state:           'open',
        service_name:    p.serviceName    || null,
        service_version: p.serviceVersion || null,
        banner:          p.banner         || null,
        is_web:          [80, 443, 8080, 8443, 8888, 9000, 3000].includes(p.port),
        is_tls:          [443, 8443, 993, 995, 465].includes(p.port),
        exposure_level:  'info',
        first_seen_at:   now,
        last_seen_at:    now,
        raw:             { source: 'connectsecure', grade: asset.grade },
      }, { onConflict: 'organization_id,host,port,protocol' }).catch(console.warn);
    }
  }

  return {
    assets_scanned: relevantAssets.length,
    triggered:      dsIds.length,
    findings_saved: findingsSaved,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function unauthorized() {
  return new Response(JSON.stringify({ error: 'unauthorized' }), {
    status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

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
