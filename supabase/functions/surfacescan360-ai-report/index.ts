// Genera report SurfaceScan360 con sintesi e top-5 raccomandazioni via OpenAI gpt-4o-mini.
// Body: { job_id?: string, scan_job_id?: string, organization_id?: string, trigger_source?: "manual"|"auto_on_complete", force_regenerate?: boolean }
// Se job_id non fornito, usa l'ultimo job completato dell'organizzazione.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-surface-internal-secret',
};
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const INTERNAL_REPORT_SECRET =
  Deno.env.get('SURFACESCAN_REPORT_INTERNAL_SECRET') ||
  Deno.env.get('SURFACESCAN_INTERNAL_REPORT_SECRET') ||
  '';

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const SEV_RANK: Record<string, number> = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };

function normalizeHost(value: string): string {
  return String(value || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, 'www.');
}

function subdomainDepth(host: string, rootDomain: string): number {
  const h = normalizeHost(host);
  const root = normalizeHost(rootDomain);
  if (!h || !root || h === root || !h.endsWith(`.${root}`)) return 0;
  return h.slice(0, -(root.length + 1)).split('.').filter(Boolean).length;
}

// Mappa euristica CVE → categoria assessment NIS2 (14 categorie ufficiali)
function inferCategoryFromCwe(cweIds: string[] | null, title: string): string {
  const cwes = (cweIds ?? []).map((c) => String(c).toUpperCase());
  const t = (title || '').toLowerCase();
  const has = (xs: string[]) => xs.some((c) => cwes.includes(c));
  if (has(['CWE-287','CWE-798','CWE-522','CWE-306','CWE-307','CWE-862','CWE-863']) || /auth|login|credential|privilege/.test(t))
    return 'Gestione delle identità Gestione degli accessi';
  if (has(['CWE-310','CWE-311','CWE-326','CWE-327','CWE-330']) || /crypt|tls|ssl|cipher/.test(t))
    return 'Crittografia';
  if (has(['CWE-79','CWE-89','CWE-22','CWE-78','CWE-77','CWE-94','CWE-502','CWE-434','CWE-918']) || /injection|xss|rce|deserial|upload/.test(t))
    return 'Sviluppo software';
  if (has(['CWE-200','CWE-209','CWE-538']) || /information disclosure|leak/.test(t))
    return 'Gestione delle risorse';
  if (/dos|denial of service|exhaust|overflow/.test(t) || has(['CWE-400','CWE-770']))
    return 'Network Security Best Practices & Operations';
  // Default: i KEV sono per definizione vulnerabilità note → patching/manutenzione
  return 'Manutenzione e miglioramento continuo';
}

function priorityFromCvss(cvss: number | null): { priority: string; color: string } {
  const s = Number(cvss ?? 0);
  if (s >= 9) return { priority: 'critical', color: '#DC2626' };
  if (s >= 7) return { priority: 'high', color: '#EA580C' };
  if (s >= 4) return { priority: 'medium', color: '#EAB308' };
  return { priority: 'low', color: '#22C55E' };
}

async function generateKevRemediations(supabase: any, organizationId: string, findings: any[]) {
  // 1) raccogli CVE unici dai findings
  const allCves = Array.from(new Set(findings.flatMap((f) => (f.cve ?? [])).map((c: string) => String(c).toUpperCase()).filter(Boolean)));
  if (allCves.length === 0) return { created: 0, total_kev: 0, existing: 0 };

  // 2) filtra KEV via cve_intel_cache
  const { data: intel } = await supabase
    .from('cve_intel_cache')
    .select('cve_id, cvss_v3_score, cwe_ids, kev_due_date, kev_required_action, description')
    .in('cve_id', allCves)
    .eq('cisa_kev', true);
  const kevList = intel ?? [];
  if (kevList.length === 0) return { created: 0, total_kev: 0, existing: 0 };

  // 3) trova già esistenti per evitare duplicati
  const { data: existing } = await supabase
    .from('remediation_tasks')
    .select('source_ref')
    .eq('organization_id', organizationId)
    .eq('source', 'cisa_kev');
  const have = new Set((existing ?? []).map((r: any) => r.source_ref));

  // 4) costruisci righe da inserire
  const today = new Date();
  const rows: any[] = [];
  for (const k of kevList) {
    if (have.has(k.cve_id)) continue;
    const cat = inferCategoryFromCwe(k.cwe_ids, k.description || k.cve_id);
    const { priority, color } = priorityFromCvss(k.cvss_v3_score);
    const due = k.kev_due_date ? new Date(k.kev_due_date) : new Date(today.getTime() + 14 * 24 * 3600 * 1000);
    const start = today;
    rows.push({
      organization_id: organizationId,
      task: `[KEV] ${k.cve_id} - ${k.kev_required_action || 'Applicare patch / mitigare vulnerabilità sfruttata attivamente'}`,
      category: cat,
      start_date: start.toISOString().slice(0, 10),
      end_date: due.toISOString().slice(0, 10),
      progress: 0, // pianificato
      priority,
      color,
      assignee: 'IT Security Team',
      source: 'cisa_kev',
      source_ref: k.cve_id,
    });
  }
  if (rows.length === 0) return { created: 0, total_kev: kevList.length, existing: have.size };

  const { error: insErr } = await supabase
    .from('remediation_tasks')
    .upsert(rows, { onConflict: 'organization_id,source,source_ref', ignoreDuplicates: true });
  if (insErr) console.warn('KEV remediation insert failed', insErr.message);
  return { created: rows.length, total_kev: kevList.length, existing: have.size };
}

async function callOpenAi(systemPrompt: string, userPrompt: string) {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY non configurata');
  // Sanitize: rimuovi whitespace/newline/caratteri non-ASCII che fanno fallire fetch con
  // "Failed to construct 'Request': 'headers' is not a valid ByteString"
  const cleanKey = OPENAI_API_KEY.trim().replace(/[^\x20-\x7E]/g, '');
  if (!cleanKey) throw new Error('OPENAI_API_KEY contiene solo caratteri non validi');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${cleanKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '{}';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const requestedJobId = String((body as any)?.job_id || (body as any)?.scan_job_id || '').trim() || undefined;
    let organization_id = String((body as any)?.organization_id || '').trim() || undefined;
    const triggerSource = String((body as any)?.trigger_source || 'manual').trim() || 'manual';
    const forceRegenerate = Boolean((body as any)?.force_regenerate);
    const requestedCreatedBy = String((body as any)?.created_by || '').trim() || null;

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Auth: utente autenticato o chiamata interna sicura (service role/secret)
    const authHeader = req.headers.get('authorization');
    const bearerToken = (authHeader || '').replace(/^Bearer\s+/i, '').trim();
    const internalHeaderSecret = req.headers.get('x-surface-internal-secret') || '';
    const isInternalCall =
      (INTERNAL_REPORT_SECRET && internalHeaderSecret === INTERNAL_REPORT_SECRET) ||
      (bearerToken && bearerToken === SERVICE_ROLE);

    let actorUserId: string | null = null;
    if (!isInternalCall) {
      if (!authHeader) return json({ error: 'Autenticazione richiesta' }, 401);
      const { data: userData } = await supabase.auth.getUser(bearerToken);
      if (!userData?.user) return json({ error: 'Token non valido' }, 401);
      actorUserId = userData.user.id;

      if (!organization_id) {
        const { data: u } = await supabase.from('users').select('organization_id').eq('auth_user_id', userData.user.id).maybeSingle();
        organization_id = u?.organization_id ?? undefined;
      }
      if (!organization_id) {
        const { data: cd } = await supabase.from('contact_directory').select('organization_id').eq('auth_user_id', userData.user.id).limit(1).maybeSingle();
        organization_id = cd?.organization_id ?? undefined;
      }
    } else {
      actorUserId = requestedCreatedBy;
    }

    // Se chiamata interna senza organization_id, prova a risolvere dal job.
    if (!organization_id && requestedJobId) {
      const { data: jOrg } = await supabase
        .from('surface_scan_jobs')
        .select('organization_id, customer_id')
        .eq('id', requestedJobId)
        .maybeSingle();
      organization_id = jOrg?.organization_id || jOrg?.customer_id || undefined;
    }

    if (!organization_id) {
      return json({ error: 'organization_id mancante: passa organization_id nel body o associa l\'utente a un\'organizzazione' }, 400);
    }

    // Job: ultimo completato se non passato
    let job: any = null;
    if (requestedJobId) {
      const { data } = await supabase.from('surface_scan_jobs').select('*').eq('id', requestedJobId).eq('organization_id', organization_id).maybeSingle();
      job = data;
    } else {
      const { data } = await supabase.from('surface_scan_jobs')
        .select('*').eq('organization_id', organization_id)
        .in('status', ['completed', 'partial'])
        .order('completed_at', { ascending: false }).limit(1).maybeSingle();
      job = data;
    }
    if (!job) return json({ error: 'Nessuno scan disponibile per l\'organizzazione' }, 404);
    if (!['completed', 'partial'].includes(String(job.status || '').toLowerCase())) {
      return json({ error: 'Il report AI può essere generato solo su scansioni completate/partial' }, 409);
    }

    // Evita duplicazione per auto-report sullo stesso job (repository persistente).
    const { data: latestReportRow } = await supabase
      .from('surface_scan_ai_reports')
      .select('id, payload, created_at, title')
      .eq('organization_id', organization_id)
      .eq('scan_job_id', job.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestReportRow && !forceRegenerate && triggerSource === 'auto_on_complete') {
      return json({
        ok: true,
        existing: true,
        repository_id: latestReportRow.id,
        created_at: latestReportRow.created_at,
        report: latestReportRow.payload,
      });
    }

    const [profileRes, orgRes, assetsRes, findingsRes, intelRes, obsRes, monitoredRes, subdomainDumpRes] = await Promise.all([
      supabase.from('organization_profiles').select('*').eq('organization_id', organization_id).maybeSingle(),
      supabase.from('organizations').select('id, name').eq('id', organization_id).maybeSingle(),
      supabase.from('surface_assets').select('asset_type, asset_value, hostname, ip, source').eq('scan_job_id', job.id).limit(500),
      supabase.from('surface_findings').select('module, finding_type, title, description, severity, affected_asset, affected_url, remediation, cve, cvss, attribution_confidence').eq('scan_job_id', job.id).limit(500),
      supabase.from('surface_external_intel').select('provider, target, summary, confidence').eq('scan_job_id', job.id).limit(200),
      supabase.from('surface_observations').select('module, observation_type, title, value, severity').eq('scan_job_id', job.id).limit(500),
      supabase.from('surface_scan_monitored_ips').select('entry_type, input_value, ip_start, ip_end, discovered_via, discovered_from').eq('organization_id', organization_id),
      supabase.from('subdomain_dumps').select('id, root_domain, depth_limit, total_discovered, total_returned, truncated, sources, results, created_at').eq('organization_id', organization_id).order('created_at', { ascending: false }).limit(50),
    ]);

    const profile = profileRes.data;
    const org = orgRes.data;
    const rawAssets = assetsRes.data ?? [];
    const subdomain_dumps = subdomainDumpRes.data ?? [];
    const assetKeys = new Set(rawAssets.map((a: any) => normalizeHost(a.hostname || a.asset_value || a.ip)));
    const discoveredSubdomainAssets = subdomain_dumps.flatMap((dump: any) =>
      ((dump.results ?? []) as any[]).map((r: any) => ({
        asset_type: 'subdomain',
        asset_value: r.subdomain,
        hostname: r.subdomain,
        ip: r.ip,
        source: 'discovery_sottodomini',
        root_domain: dump.root_domain,
        depth: subdomainDepth(r.subdomain, dump.root_domain),
        discovered_at: dump.created_at,
        evidence: {
          root_domain: dump.root_domain,
          country: r.country,
          asn_name: r.asn_name,
          depth_limit: dump.depth_limit,
        },
      }))
    ).filter((a: any) => {
      const key = normalizeHost(a.hostname || a.asset_value);
      if (!key || assetKeys.has(key)) return false;
      assetKeys.add(key);
      return true;
    });
    const assets = [...rawAssets, ...discoveredSubdomainAssets];
    const findings = (findingsRes.data ?? []).sort((a, b) => (SEV_RANK[b.severity] ?? 0) - (SEV_RANK[a.severity] ?? 0));
    const intel = intelRes.data ?? [];
    const observations = obsRes.data ?? [];
    const monitored_scope = monitoredRes.data ?? [];

    const sevCount = findings.reduce((acc: Record<string, number>, f) => { acc[f.severity] = (acc[f.severity] ?? 0) + 1; return acc; }, {});
    const topFindings = findings.slice(0, 25).map((f) => ({
      severity: f.severity, module: f.module, title: f.title,
      asset: f.affected_asset || f.affected_url, cve: f.cve, cvss: f.cvss, remediation: f.remediation,
    }));

    // ---- AI correlation ----
    const systemPrompt = `Sei un CISO esperto in cybersecurity. Analizzi i risultati di una scansione Attack Surface esterna.
Produci un report STRUTTURATO in italiano, formato JSON con campi:
{
  "executive_summary": "string (max 6 frasi, no emoji, no liste, severità con [CRITICO]/[ALTO]/[MEDIO]/[BASSO])",
  "risk_score": number (0-100, 100=ottimo),
  "risk_level": "Critico"|"Alto"|"Medio"|"Basso",
  "top_recommendations": [ { "priority": 1-5, "title": "string", "rationale": "string", "action": "string", "affected_assets": ["..."], "severity": "critical|high|medium|low|info" } ] (esattamente 5 elementi, ordinati per priorità),
  "correlations": [ "string (correlazioni tra findings/intel/asset, max 5 bullet)" ],
  "compliance_notes": "string (riferimenti NIS2/GDPR se rilevanti, max 4 frasi)"
}
Regole: usa solo dati forniti, NON inventare CVE/asset. Bullet stretti. NESSUN emoji.`;

    const userPayload = {
      organization: { name: org?.name, legal_name: profile?.legal_name, sector: profile?.business_sector, nis2: profile?.nis2_classification },
      scan: { target: job.raw_target, type: job.target_type, profile: job.scan_profile, hosting_context: job.hosting_context, completed_at: job.completed_at },
      asset_count: assets.length,
      assets_sample: assets.slice(0, 30),
      subdomain_evidence: discoveredSubdomainAssets.map((a: any) => ({ host: a.hostname, ip: a.ip, root_domain: a.root_domain, depth: a.depth })).slice(0, 50),
      findings_by_severity: sevCount,
      top_findings: topFindings,
      intel_summary: intel.slice(0, 20),
      key_observations: observations.filter((o) => ['mail_security','security_headers','dnssec','ssl_ct','tech_stack'].includes(o.module)).slice(0, 30),
    };

    let aiReport: any = null;
    let aiError: string | null = null;
    try {
      const raw = await callOpenAi(systemPrompt, JSON.stringify(userPayload).slice(0, 60_000));
      aiReport = JSON.parse(raw);
    } catch (e) {
      aiError = (e as Error).message;
    }

    // ---- Auto-genera azioni di remediation per CVE KEV (se non esistono già) ----
    const kevGen = await generateKevRemediations(supabase, organization_id, findings).catch((e) => {
      console.warn('generateKevRemediations error', (e as Error).message);
      return { created: 0, total_kev: 0, existing: 0 };
    });

    // ---- Carica tutte le remediation_tasks attive dell'organizzazione ----
    const { data: remediationRows } = await supabase
      .from('remediation_tasks')
      .select('id, task, category, start_date, end_date, progress, priority, assignee, color, source, source_ref, budget')
      .eq('organization_id', organization_id)
      .eq('is_deleted', false)
      .order('priority', { ascending: true })
      .order('start_date', { ascending: true })
      .limit(500);
    const remediation_tasks = (remediationRows ?? []).map((t: any) => ({
      ...t,
      status: (t.progress ?? 0) >= 100 ? 'completato' : 'pianificato',
    }));

    const reportPayload = {
      generated_at: new Date().toISOString(),
      report_repository: {
        trigger_source: triggerSource,
        auto_generated: triggerSource === 'auto_on_complete',
        generated_by_user_id: actorUserId,
        generated_via: isInternalCall ? 'internal_call' : 'manual_call',
      },
      organization: {
        id: organization_id,
        name: org?.name,
        legal_name: profile?.legal_name,
        vat_number: profile?.vat_number,
        fiscal_code: profile?.fiscal_code,
        legal_address: profile?.legal_address,
        operational_address: profile?.operational_address,
        pec: profile?.pec,
        email: profile?.email,
        phone: profile?.phone,
        business_sector: profile?.business_sector,
        nis2_classification: profile?.nis2_classification,
      },
      scan: {
        job_id: job.id,
        target: job.raw_target,
        normalized_target: job.normalized_target,
        target_type: job.target_type,
        scan_profile: job.scan_profile,
        hosting_context: job.hosting_context,
        status: job.status,
        started_at: job.started_at,
        completed_at: job.completed_at,
      },
      assets_in_scope: assets,
      findings,
      findings_by_severity: sevCount,
      intel,
      observations,
      monitored_scope,
      subdomain_dumps,
      remediation_tasks,
      kev_generation: kevGen,
      ai: aiReport,
      ai_error: aiError,
    };

    // Persisti il report (best-effort)
    let repositoryId: string | null = null;
    try {
      if (latestReportRow && triggerSource === 'auto_on_complete') {
        const { data: updated } = await supabase
          .from('surface_scan_ai_reports')
          .update({
            title: `Report AI - ${job.raw_target}`,
            payload: reportPayload as any,
            created_by: actorUserId,
            created_at: new Date().toISOString(),
          })
          .eq('id', latestReportRow.id)
          .select('id')
          .maybeSingle();
        repositoryId = updated?.id ?? latestReportRow.id;
      } else {
        const { data: inserted } = await supabase
          .from('surface_scan_ai_reports')
          .insert({
            organization_id,
            scan_job_id: job.id,
            title: `Report AI - ${job.raw_target}`,
            payload: reportPayload as any,
            created_by: actorUserId,
          })
          .select('id')
          .maybeSingle();
        repositoryId = inserted?.id ?? null;
      }
    } catch (e) { console.warn('persist report failed', e); }

    return json({ ok: true, repository_id: repositoryId, report: reportPayload });
  } catch (e) {
    console.error('ai-report error', e);
    return json({ error: String((e as Error).message) }, 500);
  }
});
