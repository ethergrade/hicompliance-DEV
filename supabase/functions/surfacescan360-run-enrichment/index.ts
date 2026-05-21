// Esegue moduli di enrichment OSINT per un job SurfaceScan360.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SAFE_RECON_MODULES, type ScanContext, type ModuleResult } from '../_shared/osintModules.ts';
import { EXTRA_RECON_MODULES } from '../_shared/osintExtraModules.ts';
import { shodanHostModule, urlscanModule, hostingContextModule, type IntelRow } from '../_shared/intelModules.ts';

const ALL_RECON = [...SAFE_RECON_MODULES, ...EXTRA_RECON_MODULES];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { job_id } = await req.json();
    if (!job_id) return json({ error: 'job_id richiesto' }, 400);

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: job, error } = await supabase.from('surface_scan_jobs').select('*').eq('id', job_id).single();
    if (error || !job) return json({ error: 'Job non trovato' }, 404);

    await supabase.from('surface_scan_jobs').update({ status: 'running', started_at: new Date().toISOString() }).eq('id', job_id);

    const ctx: ScanContext = {
      job_id,
      organization_id: job.organization_id,
      parsed: {
        raw_target: job.raw_target,
        normalized_target: job.normalized_target,
        target_type: job.target_type,
        hostname: job.hostname,
        root_domain: job.root_domain,
        protocol: job.protocol,
        port: job.port,
      },
    };

    const results = await Promise.allSettled(ALL_RECON.map((fn) => fn(ctx)));
    const observations: any[] = [];
    const findings: any[] = [];
    const assets: any[] = [];
    const errors: string[] = [];

    const mapFinding = (f: any, provider: string) => ({
      organization_id: job.organization_id, scan_job_id: job_id, provider,
      module: f.module, finding_type: f.finding_type, title: f.title,
      description: f.description ?? null, severity: f.severity,
      affected_asset: f.affected_asset ?? null, affected_url: f.affected_url ?? null,
      remediation: f.remediation ?? null, evidence: f.evidence ?? null,
      attribution_confidence: f.attribution_confidence ?? 'medium',
      port: f.port ?? null, protocol: f.protocol ?? null,
      cve: f.cve ?? null, cvss: f.cvss ?? null, cisa_kev: f.cisa_kev ?? null,
    });

    for (const r of results) {
      if (r.status === 'fulfilled') {
        const v = r.value as ModuleResult;
        for (const o of v.observations) observations.push({ organization_id: job.organization_id, scan_job_id: job_id, module: o.module, observation_type: o.observation_type, title: o.title ?? null, value: o.value, severity: o.severity ?? 'info', confidence: o.confidence ?? 'medium' });
        for (const f of v.findings) findings.push(mapFinding(f, 'internal'));
        for (const a of v.assets) assets.push({ organization_id: job.organization_id, scan_job_id: job_id, asset_type: a.asset_type, asset_value: a.asset_value, hostname: a.hostname ?? null, root_domain: a.root_domain ?? null, ip: a.ip ?? null, source: a.source, confidence: a.confidence ?? 'medium', raw: a.raw ?? null });
      } else {
        errors.push(String(r.reason));
        console.error('module failed', r.reason);
      }
    }

    // --- Phase 2: intel passiva (Shodan, urlscan) + hosting detector --------
    const resolvedIps = assets.filter((a) => a.asset_type === 'ipv4' || a.asset_type === 'ipv6').map((a) => a.asset_value);
    const intelRows: IntelRow[] = [];
    try {
      const httpObs = observations.filter((o) => o.module === 'http_headers' || o.module === 'security_headers');
      const [shodanRes, urlscanRes] = await Promise.allSettled([
        shodanHostModule(ctx, resolvedIps),
        urlscanModule(ctx),
      ]);
      const collect = (r: PromiseSettledResult<any>, label: string) => {
        if (r.status === 'fulfilled') return r.value;
        errors.push(`${label}: ${String(r.reason)}`); return { intel: [], observations: [], findings: [] };
      };
      const sho = collect(shodanRes, 'shodan');
      const urls = collect(urlscanRes, 'urlscan');
      intelRows.push(...sho.intel, ...urls.intel);
      observations.push(...sho.observations.map((o: any) => ({ organization_id: job.organization_id, scan_job_id: job_id, module: o.module, observation_type: o.observation_type, title: o.title ?? null, value: o.value, severity: o.severity ?? 'info', confidence: o.confidence ?? 'medium' })));
      observations.push(...urls.observations.map((o: any) => ({ organization_id: job.organization_id, scan_job_id: job_id, module: o.module, observation_type: o.observation_type, title: o.title ?? null, value: o.value, severity: o.severity ?? 'info', confidence: o.confidence ?? 'medium' })));
      findings.push(...sho.findings.map((f: any) => mapFinding(f, 'shodan')));

      // Arricchisci asset esistenti con services/fingerprint Shodan
      for (const s of sho.intel as IntelRow[]) {
        if (s.provider !== 'shodan' || !s.found) continue;
        const asset = assets.find((a: any) => a.asset_value === s.target);
        if (asset) {
          asset.raw = { ...(asset.raw || {}), shodan: s.summary };
          asset.confidence = 'high';
        } else {
          assets.push({ organization_id: job.organization_id, scan_job_id: job_id, asset_type: 'ipv4', asset_value: s.target, ip: s.target, source: 'shodan', confidence: 'high', raw: { shodan: s.summary } });
        }
      }

      // Hosting context dipende da shodan + http
      const hcRes = await hostingContextModule(ctx, sho.intel, httpObs.map((o) => ({ module: o.module, observation_type: o.observation_type, value: o.value })) as any, resolvedIps);
      intelRows.push(...hcRes.intel);
      observations.push(...hcRes.observations.map((o: any) => ({ organization_id: job.organization_id, scan_job_id: job_id, module: o.module, observation_type: o.observation_type, title: o.title ?? null, value: o.value, severity: o.severity ?? 'info', confidence: o.confidence ?? 'medium' })));
      findings.push(...hcRes.findings.map((f: any) => mapFinding(f, 'internal')));

      // ── Auto-trigger Pentest-Tools se shared hosting rilevato ──
      const sharedRow = hcRes.intel.find((i: any) => i?.summary?.type === 'shared_hosting');
      if (sharedRow) {
        try {
          const { data: orgRow } = await supabase
            .from('organizations')
            .select('pentest_tools_auto_validation')
            .eq('id', job.organization_id)
            .maybeSingle();
          if ((orgRow as any)?.pentest_tools_auto_validation) {
            const shoRow = sho.intel.find((i: any) => i.provider === 'shodan' && i.found);
            const s: any = shoRow?.summary ?? null;
            const snapshot = s ? {
              found: true,
              hostnames: Array.isArray(s.hostnames) ? s.hostnames : [],
              ports: Array.isArray(s.ports) ? s.ports : [],
              vulns: Array.isArray(s.vulns_top) ? s.vulns_top.map((v: any) => v.cve).filter(Boolean) : [],
              last_update: s.last_update,
              asn: s.fingerprint?.asn,
              org: s.fingerprint?.org,
            } : { found: false, hostnames: [], ports: [], vulns: [] };
            const target = job.normalized_target || job.hostname || job.raw_target;
            const startedAt = new Date().toISOString();
            const orchUrl = `${SUPABASE_URL}/functions/v1/pentest-tools-orchestrator`;
            const resp = await fetch(orchUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_ROLE}` },
              body: JSON.stringify({
                organization_id: job.organization_id,
                target,
                profile: 'recon_safe',
                triggered_by: 'auto_from_shodan',
                resolved_ips: resolvedIps,
                shodan_snapshot: snapshot,
              }),
            });
            const respBody = await resp.json().catch(() => ({}));
            const action = resp.ok ? 'auto_trigger_accepted'
              : resp.status === 403 ? 'auto_trigger_blocked'
              : resp.status === 429 ? 'auto_trigger_rate_limited'
              : (resp.status === 200 && respBody?.skipped) ? 'auto_trigger_skipped'
              : 'auto_trigger_failed';
            await supabase.from('external_scan_audit_log').insert({
              organization_id: job.organization_id,
              scan_job_id: respBody?.job_id ?? null,
              actor_email: 'system:surfacescan360',
              action,
              details: {
                source: 'osint_enrichment',
                reason: 'shared_hosting_detected',
                shared_score: sharedRow.summary?.shared_score,
                co_hosted_count: sharedRow.summary?.co_hosted_count,
                target,
                triggered_by: 'auto_from_shodan',
                http_status: resp.status,
                requested_at: startedAt,
                job_id: respBody?.job_id ?? null,
                error: !resp.ok ? (respBody?.error ?? null) : null,
              },
            });
          }
        } catch (e) {
          errors.push(`auto_pentest_trigger: ${(e as Error).message}`);
        }
      }
    } catch (e) {
      errors.push(`intel: ${(e as Error).message}`);
    }

    if (observations.length) await supabase.from('surface_observations').insert(observations);
    if (findings.length) await supabase.from('surface_findings').insert(findings);
    if (assets.length) await supabase.from('surface_assets').insert(assets);
    if (intelRows.length) await supabase.from('surface_external_intel').insert(
      intelRows.map((i) => ({ organization_id: job.organization_id, scan_job_id: job_id, provider: i.provider, target: i.target, found: i.found, summary: i.summary, raw_response: i.raw_response, confidence: i.confidence })),
    );

    await supabase.from('surface_scan_jobs').update({
      status: errors.length === ALL_RECON.length ? 'failed' : (errors.length ? 'partial' : 'completed'),
      completed_at: new Date().toISOString(),
      error_message: errors.length ? errors.join(' | ').slice(0, 1000) : null,
      resolved_ips: resolvedIps,
    }).eq('id', job_id);

    return json({ ok: true, observations: observations.length, findings: findings.length, assets: assets.length, intel: intelRows.length, errors });
  } catch (e) {
    console.error('run-enrichment error', e);
    return json({ error: String((e as Error).message) }, 500);
  }
});
