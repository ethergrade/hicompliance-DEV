// Genera report SurfaceScan360 con sintesi e top-5 raccomandazioni via OpenAI gpt-4o-mini.
// Body: { job_id?: string, organization_id?: string }
// Se job_id non fornito, usa l'ultimo job completato dell'organizzazione.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const SEV_RANK: Record<string, number> = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };

async function callOpenAi(systemPrompt: string, userPrompt: string) {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY non configurata');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
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
    let { job_id, organization_id } = body as { job_id?: string; organization_id?: string };

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Auth: deve essere autenticato; ricaviamo organization_id se non fornito
    const authHeader = req.headers.get('authorization');
    if (!authHeader) return json({ error: 'Autenticazione richiesta' }, 401);
    const { data: userData } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (!userData?.user) return json({ error: 'Token non valido' }, 401);

    if (!organization_id) {
      const { data: u } = await supabase.from('users').select('organization_id').eq('auth_user_id', userData.user.id).single();
      organization_id = u?.organization_id;
    }
    if (!organization_id) return json({ error: 'organization_id mancante' }, 400);

    // Job: ultimo completato se non passato
    let job: any = null;
    if (job_id) {
      const { data } = await supabase.from('surface_scan_jobs').select('*').eq('id', job_id).eq('organization_id', organization_id).maybeSingle();
      job = data;
    } else {
      const { data } = await supabase.from('surface_scan_jobs')
        .select('*').eq('organization_id', organization_id)
        .in('status', ['completed', 'partial'])
        .order('completed_at', { ascending: false }).limit(1).maybeSingle();
      job = data;
    }
    if (!job) return json({ error: 'Nessuno scan disponibile per l\'organizzazione' }, 404);

    const [profileRes, orgRes, assetsRes, findingsRes, intelRes, obsRes] = await Promise.all([
      supabase.from('organization_profiles').select('*').eq('organization_id', organization_id).maybeSingle(),
      supabase.from('organizations').select('id, name').eq('id', organization_id).maybeSingle(),
      supabase.from('surface_assets').select('asset_type, asset_value, hostname, ip, source').eq('scan_job_id', job.id).limit(500),
      supabase.from('surface_findings').select('module, finding_type, title, description, severity, affected_asset, affected_url, remediation, cve, cvss, attribution_confidence').eq('scan_job_id', job.id).limit(500),
      supabase.from('surface_external_intel').select('provider, target, summary, confidence').eq('scan_job_id', job.id).limit(200),
      supabase.from('surface_observations').select('module, observation_type, title, value, severity').eq('scan_job_id', job.id).limit(500),
    ]);

    const profile = profileRes.data;
    const org = orgRes.data;
    const assets = assetsRes.data ?? [];
    const findings = (findingsRes.data ?? []).sort((a, b) => (SEV_RANK[b.severity] ?? 0) - (SEV_RANK[a.severity] ?? 0));
    const intel = intelRes.data ?? [];
    const observations = obsRes.data ?? [];

    const sevCount = findings.reduce((acc: Record<string, number>, f) => { acc[f.severity] = (acc[f.severity] ?? 0) + 1; return acc; }, {});
    const topFindings = findings.slice(0, 25).map((f) => ({
      severity: f.severity, module: f.module, title: f.title,
      asset: f.affected_asset || f.affected_url, cve: f.cve, cvss: f.cvss, remediation: f.remediation,
    }));

    // ---- AI correlation ----
    const systemPrompt = `Sei un CISO esperto in cybersecurity. Analizzi i risultati di una scansione Attack Surface (SurfaceScan360, basato su Shodan/Pentest-Tools/OSINT Web-Check).
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

    const reportPayload = {
      generated_at: new Date().toISOString(),
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
      ai: aiReport,
      ai_error: aiError,
    };

    // Persisti il report (best-effort)
    try {
      await supabase.from('external_scan_reports').insert({
        organization_id, scan_job_id: job.id,
        report_type: 'surface_scan_ai',
        title: `Report AI - ${job.raw_target}`,
        payload: reportPayload as any,
      });
    } catch (e) { console.warn('persist report failed', e); }

    return json({ ok: true, report: reportPayload });
  } catch (e) {
    console.error('ai-report error', e);
    return json({ error: String((e as Error).message) }, 500);
  }
});
