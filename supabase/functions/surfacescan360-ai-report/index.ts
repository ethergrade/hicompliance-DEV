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
const TECHNOLOGY_TOKENS: RegExp[] = [
  /\bapache\b/gi,
  /\bnginx\b/gi,
  /\bwordpress\b/gi,
  /\bphp\b/gi,
  /\bopenssl\b/gi,
  /\bcpanel\b/gi,
  /\bplesk\b/gi,
  /\biis\b/gi,
  /\btomcat\b/gi,
  /\bdrupal\b/gi,
  /\bjoomla\b/gi,
  /\bshodan\b/gi,
  /\bpentest-?tools?\b/gi,
  /\bweb[\s-]?check\b/gi,
  /\burlscan\b/gi,
  /\bcrt\.sh\b/gi,
  /\bhackertarget\b/gi,
  /\bpassive[_\s-]?dns\b/gi,
];
const CVE_REGEX = /\bCVE-\d{4}-\d{4,7}\b/gi;

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

function redactTechnologyMentions(value: string): string {
  let out = String(value || '');
  for (const token of TECHNOLOGY_TOKENS) {
    out = out.replace(token, 'componente tecnologica');
  }
  return out.replace(/\s{2,}/g, ' ').trim();
}

function extractCvesFromText(value: string): string[] {
  const matches = String(value || '').toUpperCase().match(CVE_REGEX) ?? [];
  return Array.from(new Set(matches));
}

function toTextSummary(value: unknown): string {
  if (value == null) return 'Nessuna evidenza disponibile.';
  if (typeof value === 'string') {
    return redactTechnologyMentions(value);
  }
  if (typeof value !== 'object') {
    return String(value);
  }
  const obj = value as Record<string, unknown>;
  const parts: string[] = [];
  const asArray = (k: string) => (Array.isArray(obj[k]) ? (obj[k] as unknown[]) : []);
  const ports = [...asArray('ports'), ...asArray('open_ports')]
    .map((p) => Number(p))
    .filter((p) => Number.isFinite(p));
  if (ports.length > 0) {
    parts.push(`Porte esposte rilevate: ${[...new Set(ports)].slice(0, 15).join(', ')}`);
  }
  const hostnames = asArray('hostnames')
    .map((h) => String(h || '').trim())
    .filter(Boolean);
  if (hostnames.length > 0) {
    parts.push(`Host correlati: ${hostnames.slice(0, 5).join(', ')}`);
  }
  if (obj['type']) {
    parts.push(`Contesto: ${String(obj['type'])}`);
  }
  if (obj['multi_tenant'] != null) {
    parts.push(`Multi-tenant: ${obj['multi_tenant'] ? 'sì' : 'no'}`);
  }
  if (obj['total'] != null) {
    parts.push(`Risultati storici trovati: ${String(obj['total'])}`);
  }
  if (parts.length === 0) {
    parts.push('Evidenza disponibile nel dettaglio tecnico della scansione.');
  }
  return redactTechnologyMentions(parts.join(' · '));
}

function mapIntelCategory(provider: string): string {
  const key = String(provider || '').toLowerCase();
  if (key.includes('pentest')) return 'Validazione esposizione e vulnerabilità';
  if (key.includes('shodan')) return 'Esposizione servizi pubblici';
  if (key.includes('urlscan')) return 'Comportamento applicativo esterno';
  if (key.includes('dns') || key.includes('mail')) return 'Postura DNS e posta';
  if (key.includes('security_headers') || key.includes('http')) return 'Configurazione sicurezza web';
  if (key.includes('hosting')) return 'Classificazione contesto hosting';
  return 'Evidenze esterne';
}

function normalizeRiskLevelFromScore(score: number): 'Critico' | 'Alto' | 'Medio' | 'Basso' {
  if (score <= 30) return 'Critico';
  if (score <= 50) return 'Alto';
  if (score <= 75) return 'Medio';
  return 'Basso';
}

function computeRiskScoreFromSeverity(sevCount: Record<string, number>): number {
  const crit = Number(sevCount.critical || 0);
  const high = Number(sevCount.high || 0);
  const med = Number(sevCount.medium || 0);
  const low = Number(sevCount.low || 0);
  const info = Number(sevCount.info || 0);
  const penalty = crit * 22 + high * 12 + med * 6 + low * 2 + info;
  return Math.max(5, Math.min(100, 100 - penalty));
}

function buildConsultingRecommendations(input: {
  findings: any[];
  assets: any[];
  monitoredScope: any[];
  discoveredSubdomains: any[];
}): Array<{ priority: number; title: string; rationale: string; action: string; affected_assets: string[]; severity: string }> {
  const findings = input.findings || [];
  const assets = input.assets || [];
  const monitoredScope = input.monitoredScope || [];
  const discoveredSubdomains = input.discoveredSubdomains || [];
  const byType = new Set(findings.map((f: any) => String(f.finding_type || '').toLowerCase()));
  const affectedAssets = Array.from(
    new Set(
      findings
        .map((f: any) => String(f.affected_asset || f.affected_url || '').trim())
        .filter(Boolean),
    ),
  ).slice(0, 6);

  const out: Array<{ priority: number; title: string; rationale: string; action: string; affected_assets: string[]; severity: string }> = [];

  out.push({
    priority: 1,
    title: 'Ridurre immediatamente l’esposizione ad alta priorità',
    rationale: 'Sono presenti evidenze con severità elevata o media che aumentano la superficie d’attacco esterna.',
    action: 'Definire una finestra di remediation rapida, confermare ownership degli asset coinvolti e chiudere prima i punti più esposti.',
    affected_assets: affectedAssets,
    severity: 'high',
  });

  if (findings.some((f: any) => Array.isArray(f.cve) && f.cve.length > 0)) {
    out.push({
      priority: 2,
      title: 'Prioritizzare patching e mitigazioni CVE confermate',
      rationale: 'La presenza di CVE richiede una gestione ordinata per ridurre rischio operativo e reputazionale.',
      action: 'Ordinare le CVE per severità e impatto business, applicare patch o compensating control e validare il risultato con nuova verifica.',
      affected_assets: affectedAssets,
      severity: 'high',
    });
  }

  if (byType.has('open_port_exposed') || byType.has('service_fingerprint_exposed')) {
    out.push({
      priority: 3,
      title: 'Limitare servizi pubblicamente raggiungibili',
      rationale: 'Porte o servizi esposti aumentano il rischio di ricognizione e abuso.',
      action: 'Applicare regole ACL/firewall, rimuovere servizi non necessari e restringere l’accesso a sorgenti autorizzate.',
      affected_assets: affectedAssets,
      severity: 'medium',
    });
  }

  if (
    byType.has('missing_csp') ||
    byType.has('missing_hsts') ||
    byType.has('missing_x_content_type_options') ||
    byType.has('missing_framing_protection')
  ) {
    out.push({
      priority: 4,
      title: 'Rafforzare baseline di sicurezza applicativa',
      rationale: 'Header e controlli web incompleti favoriscono attacchi opportunistici su asset Internet-facing.',
      action: 'Applicare baseline standard sui controlli HTTP di sicurezza e rieseguire la validazione di conformità tecnica.',
      affected_assets: affectedAssets,
      severity: 'medium',
    });
  }

  out.push({
    priority: 5,
    title: 'Governare scope e discovery continuativa',
    rationale: 'L’efficacia del monitoraggio dipende da uno scope aggiornato e dalla visibilità dei sottodomini.',
    action: `Mantenere allineato lo scope (${monitoredScope.length} regole attive), verificare i sottodomini scoperti (${discoveredSubdomains.length}) e programmare riesecuzioni periodiche.`,
    affected_assets: assets.slice(0, 5).map((a: any) => String(a.asset_value || a.hostname || a.ip || '').trim()).filter(Boolean),
    severity: 'low',
  });

  const unique: typeof out = [];
  const seen = new Set<string>();
  for (const entry of out) {
    const key = entry.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(entry);
  }
  return unique.slice(0, 5).map((entry, index) => ({ ...entry, priority: index + 1 }));
}

function buildFallbackAiReport(input: {
  orgName: string;
  target: string;
  sevCount: Record<string, number>;
  findings: any[];
  assets: any[];
  monitoredScope: any[];
  discoveredSubdomains: any[];
}): any {
  const score = computeRiskScoreFromSeverity(input.sevCount);
  const level = normalizeRiskLevelFromScore(score);
  const totalFindings = Object.values(input.sevCount || {}).reduce((sum, v) => sum + Number(v || 0), 0);
  const recommendations = buildConsultingRecommendations({
    findings: input.findings,
    assets: input.assets,
    monitoredScope: input.monitoredScope,
    discoveredSubdomains: input.discoveredSubdomains,
  });

  const critical = Number(input.sevCount.critical || 0);
  const high = Number(input.sevCount.high || 0);
  const medium = Number(input.sevCount.medium || 0);
  const subCount = input.discoveredSubdomains.length;
  const scopeCount = input.monitoredScope.length;

  return {
    executive_summary:
      `La valutazione dell’esposizione esterna per ${input.orgName || 'l’organizzazione'} sul target ${input.target || 'selezionato'} ` +
      `mostra ${totalFindings} evidenze totali (critiche: ${critical}, alte: ${high}, medie: ${medium}). ` +
      `Lo scope monitorato include ${scopeCount} regole e sono stati rilevati ${subCount} sottodomini nel perimetro osservato. ` +
      `La priorità operativa è ridurre i punti più esposti e consolidare i controlli di sicurezza sugli asset pubblici.`,
    risk_score: score,
    risk_level: level,
    top_recommendations: recommendations,
    correlations: [
      `La severità massima rilevata è ${critical > 0 ? 'critica' : high > 0 ? 'alta' : medium > 0 ? 'media' : 'bassa/informativa'}.`,
      `Le evidenze su asset Internet-facing suggeriscono un approccio di remediation progressivo per priorità.`,
      `L’ampliamento o variazione del perimetro (scope/subdomini) incide direttamente sul volume dei risultati rilevati.`,
    ],
    compliance_notes:
      'Le azioni prioritarie supportano i principi di gestione del rischio, hardening continuo e riduzione dell’esposizione richiesti dai framework NIS2 e dalle buone pratiche di sicurezza.',
  };
}

function sanitizeAiReport(report: any, fallback: any): any {
  const safe = report && typeof report === 'object' ? { ...report } : {};
  const normalized = {
    executive_summary: redactTechnologyMentions(String(safe.executive_summary || fallback.executive_summary || '')),
    risk_score: Number.isFinite(Number(safe.risk_score)) ? Number(safe.risk_score) : Number(fallback.risk_score || 50),
    risk_level: String(safe.risk_level || '').trim() || fallback.risk_level || 'Medio',
    top_recommendations: Array.isArray(safe.top_recommendations) ? safe.top_recommendations : fallback.top_recommendations,
    correlations: Array.isArray(safe.correlations) ? safe.correlations : fallback.correlations,
    compliance_notes: redactTechnologyMentions(String(safe.compliance_notes || fallback.compliance_notes || '')),
  };
  normalized.risk_score = Math.max(0, Math.min(100, normalized.risk_score));
  normalized.risk_level = normalizeRiskLevelFromScore(normalized.risk_score);
  normalized.top_recommendations = (normalized.top_recommendations || [])
    .slice(0, 5)
    .map((item: any, idx: number) => ({
      priority: idx + 1,
      title: redactTechnologyMentions(String(item?.title || `Raccomandazione ${idx + 1}`)),
      rationale: redactTechnologyMentions(String(item?.rationale || '')),
      action: redactTechnologyMentions(String(item?.action || '')),
      affected_assets: Array.isArray(item?.affected_assets) ? item.affected_assets.slice(0, 10) : [],
      severity: String(item?.severity || 'medium').toLowerCase(),
    }));
  while (normalized.top_recommendations.length < 5) {
    normalized.top_recommendations.push(
      fallback.top_recommendations[normalized.top_recommendations.length] || {
        priority: normalized.top_recommendations.length + 1,
        title: `Raccomandazione ${normalized.top_recommendations.length + 1}`,
        rationale: 'Consolidare il piano di miglioramento continuo della sicurezza esterna.',
        action: 'Programmare riesecuzione periodica della scansione e verifica delle remediation aperte.',
        affected_assets: [],
        severity: 'low',
      },
    );
  }
  normalized.correlations = (normalized.correlations || [])
    .slice(0, 5)
    .map((item: any) => redactTechnologyMentions(String(item || '')))
    .filter(Boolean);
  return normalized;
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
    const findingsRaw = (findingsRes.data ?? []).sort((a, b) => (SEV_RANK[b.severity] ?? 0) - (SEV_RANK[a.severity] ?? 0));
    const findings = findingsRaw.map((f: any) => {
      const cvesFromArray = Array.isArray(f.cve)
        ? f.cve.map((c: unknown) => String(c || '').toUpperCase().trim()).filter(Boolean)
        : [];
      const cvesFromText = extractCvesFromText(
        `${String(f.title || '')} ${String(f.description || '')} ${String(f.remediation || '')}`,
      );
      const cves = Array.from(new Set([...cvesFromArray, ...cvesFromText]));
      return {
        ...f,
        cve: cves,
        title: redactTechnologyMentions(String(f.title || '')),
        description: redactTechnologyMentions(String(f.description || '')),
        remediation: redactTechnologyMentions(String(f.remediation || '')),
      };
    });
    const intelRaw = intelRes.data ?? [];
    const intel = intelRaw.map((entry: any) => ({
      category: mapIntelCategory(String(entry.provider || '')),
      target: entry.target,
      summary_text: toTextSummary(entry.summary),
      confidence: entry.confidence || null,
    }));
    const observations = obsRes.data ?? [];
    const monitored_scope = monitoredRes.data ?? [];

    const cveByAsset = new Map<string, Set<string>>();
    const cveSet = new Set<string>();
    findings.forEach((finding: any) => {
      const asset = String(finding.affected_asset || finding.affected_url || job.raw_target || '').trim() || 'Asset principale';
      const cves = Array.isArray(finding.cve) ? finding.cve : [];
      if (cves.length === 0) return;
      for (const cve of cves) {
        const cveId = String(cve || '').toUpperCase().trim();
        if (!cveId) continue;
        cveSet.add(cveId);
        if (!cveByAsset.has(cveId)) cveByAsset.set(cveId, new Set<string>());
        cveByAsset.get(cveId)!.add(asset);
      }
    });
    const cveIds = Array.from(cveSet);

    const cveIntelById = new Map<string, any>();
    if (cveIds.length > 0) {
      const { data: cveIntelRows } = await supabase
        .from('cve_intel_cache')
        .select('cve_id, description, cvss_v3_score, cvss_v3_severity, cvss_v2_score, cwe_ids, references_json, cpe_json, exploit_links, epss_score, epss_percentile, cisa_kev, kev_date_added, kev_due_date, kev_required_action, published_at, last_modified_at, refreshed_at')
        .in('cve_id', cveIds.slice(0, 500));
      (cveIntelRows ?? []).forEach((row: any) => cveIntelById.set(String(row.cve_id || '').toUpperCase(), row));
    }

    const cve_catalog = cveIds
      .map((cveId) => {
        const intelRow = cveIntelById.get(cveId);
        const fallbackCvss = findings.find((f: any) => Array.isArray(f.cve) && f.cve.includes(cveId))?.cvss ?? null;
        const references = Array.isArray(intelRow?.references_json)
          ? intelRow.references_json
              .map((entry: any) => {
                if (typeof entry === 'string') return entry;
                if (entry && typeof entry === 'object') return String(entry.url || entry.href || '').trim();
                return '';
              })
              .filter(Boolean)
              .slice(0, 8)
          : [];
        const cwes = Array.isArray(intelRow?.cwe_ids)
          ? intelRow.cwe_ids.map((c: unknown) => String(c || '').trim()).filter(Boolean).slice(0, 12)
          : [];
        return {
          cve_id: cveId,
          description: redactTechnologyMentions(String(intelRow?.description || 'Descrizione non disponibile nel cache CVE.')),
          cvss: intelRow?.cvss_v3_score ?? fallbackCvss ?? intelRow?.cvss_v2_score ?? null,
          cvss_severity: intelRow?.cvss_v3_severity || null,
          epss: intelRow?.epss_score ?? null,
          epss_percentile: intelRow?.epss_percentile ?? null,
          cisa_kev: Boolean(intelRow?.cisa_kev),
          kev_due_date: intelRow?.kev_due_date || null,
          kev_required_action: intelRow?.kev_required_action ? redactTechnologyMentions(String(intelRow.kev_required_action)) : null,
          cwe: cwes,
          references,
          affected_assets: Array.from(cveByAsset.get(cveId) ?? []).slice(0, 20),
          published_at: intelRow?.published_at || null,
          last_modified_at: intelRow?.last_modified_at || null,
          refreshed_at: intelRow?.refreshed_at || null,
        };
      })
      .sort((a, b) => {
        const aCvss = Number(a.cvss ?? -1);
        const bCvss = Number(b.cvss ?? -1);
        if (a.cisa_kev !== b.cisa_kev) return a.cisa_kev ? -1 : 1;
        return bCvss - aCvss;
      })
      .slice(0, 200);

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
      intel_summary: intel.slice(0, 40),
      key_observations: observations.slice(0, 80),
      monitored_scope: monitored_scope.slice(0, 200),
      cve_catalog: cve_catalog.slice(0, 80).map((item: any) => ({
        cve_id: item.cve_id,
        cvss: item.cvss,
        epss: item.epss,
        cisa_kev: item.cisa_kev,
        affected_assets: item.affected_assets,
      })),
    };

    let aiReport: any = null;
    let aiError: string | null = null;
    const fallbackAiReport = buildFallbackAiReport({
      orgName: org?.name || profile?.legal_name || 'organizzazione',
      target: job.raw_target,
      sevCount,
      findings,
      assets,
      monitoredScope: monitored_scope,
      discoveredSubdomains: discoveredSubdomainAssets,
    });
    try {
      if (OPENAI_API_KEY) {
        const raw = await callOpenAi(systemPrompt, JSON.stringify(userPayload).slice(0, 60_000));
        aiReport = JSON.parse(raw);
      } else {
        aiError = 'OPENAI_API_KEY non configurata';
      }
    } catch (e) {
      aiError = (e as Error).message;
    }
    aiReport = sanitizeAiReport(aiReport, fallbackAiReport);
    aiError = null;

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
      cve_catalog,
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
