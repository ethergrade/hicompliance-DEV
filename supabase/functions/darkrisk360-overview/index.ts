import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import {
  assertCustomerAccess,
  corsHeaders,
  getCallerProfile,
  makeSupabaseClients,
} from '../_shared/surface-scan-utils.ts';

type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';
type CoverageStatus = 'completed' | 'partial' | 'error' | 'not_run' | 'planned';

type FindingLite = {
  id: string;
  severity: string | null;
  title: string | null;
  finding_type: string | null;
  module?: string | null;
  source?: string | null;
  created_at: string | null;
  status?: string | null;
  affected_asset?: string | null;
  affected_host?: string | null;
  affected_url?: string | null;
  attribution_confidence?: string | null;
};

type ModuleResultLite = {
  module_key: string;
  module_label: string;
  status: string;
  completed_at: string | null;
  created_at: string | null;
};

type CoverageControl = {
  key: string;
  control: string;
  status: CoverageStatus;
  last_execution: string | null;
  source: string;
};

const severityRank: Record<Severity, number> = {
  info: 1,
  low: 2,
  medium: 3,
  high: 4,
  critical: 5,
};

const activeStatuses = new Set([
  'new',
  'open',
  'triaged',
  'validated',
  'remediation_in_progress',
  'investigating',
]);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}

function normalizeSeverity(value: string | null | undefined): Severity {
  const normalized = String(value || 'info').toLowerCase();
  if (normalized === 'critical') return 'critical';
  if (normalized === 'high') return 'high';
  if (normalized === 'medium') return 'medium';
  if (normalized === 'low') return 'low';
  return 'info';
}

function normalizeCoverageStatus(status: string | null | undefined): CoverageStatus {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'success' || normalized === 'completed' || normalized === 'finished') {
    return 'completed';
  }
  if (normalized === 'running' || normalized === 'queued' || normalized === 'waiting') {
    return 'partial';
  }
  if (normalized === 'error' || normalized === 'timeout' || normalized === 'failed') {
    return 'error';
  }
  if (normalized === 'skipped') {
    return 'partial';
  }
  return 'not_run';
}

function isActiveFinding(status: string | null | undefined): boolean {
  const normalized = String(status || 'open').toLowerCase();
  if (activeStatuses.has(normalized)) return true;
  return !(normalized === 'resolved' || normalized === 'suppressed' || normalized === 'false_positive' || normalized === 'accepted_risk');
}

function riskFromFindings(findings: FindingLite[]): { score: number; level: 'Basso' | 'Medio' | 'Alto' | 'Critico' } {
  const counts = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };

  for (const finding of findings) {
    const sev = normalizeSeverity(finding.severity);
    counts[sev] += 1;
  }

  const penalty =
    counts.critical * 12 +
    counts.high * 7 +
    counts.medium * 3 +
    counts.low * 1 +
    counts.info * 0.25;

  const score = Math.max(5, Math.min(100, Math.round(100 - penalty)));

  if (score <= 30) return { score, level: 'Critico' };
  if (score <= 50) return { score, level: 'Alto' };
  if (score <= 75) return { score, level: 'Medio' };
  return { score, level: 'Basso' };
}

function classifyThreatCategory(finding: FindingLite): string {
  const sourceText = [
    finding.module || '',
    finding.finding_type || '',
    finding.title || '',
    finding.source || '',
  ]
    .join(' ')
    .toLowerCase();

  if (/credential|credenzial|password|stealer|compromis/.test(sourceText)) return 'Credenziali compromesse';
  if (/mail|email/.test(sourceText) && /leak|expos|compromis/.test(sourceText)) return 'Email esposte';
  if (/database|dump|db /.test(sourceText)) return 'Database leak';
  if (/phish|brand|impersonation/.test(sourceText)) return 'Phishing e brand abuse';
  if (/open_port|open port|service_fingerprint|ports|pentest_tool|shodan/.test(sourceText)) return 'Servizi esposti';
  if (/dmarc|spf|dkim|mail_security|mx|bimi/.test(sourceText)) return 'Email security';
  if (/dns|tls|ssl|hsts|whois|rdap|http_security|headers/.test(sourceText)) return 'DNS e TLS';
  if (/safe_browsing|urlhaus|phishtank|reputation|dnsbl|threat/.test(sourceText)) return 'Reputation';
  return 'Minacce rilevate';
}

function categoryDescription(category: string): string {
  switch (category) {
    case 'Credenziali compromesse':
      return 'Account e credenziali con segnali di esposizione o riuso potenziale.';
    case 'Email esposte':
      return 'Identità email aziendali con segnali di esposizione su fonti esterne.';
    case 'Database leak':
      return 'Riferimenti a dump, dataset o archivi potenzialmente pubblicati.';
    case 'Phishing e brand abuse':
      return 'Possibili segnali di abuso brand, impersonazione o phishing mirato.';
    case 'Servizi esposti':
      return 'Porte e servizi pubblici che aumentano la superficie di attacco.';
    case 'Email security':
      return 'Controlli SPF, DKIM, DMARC e postura del canale email.';
    case 'DNS e TLS':
      return 'Misconfigurazioni DNS/HTTP/TLS che impattano integrità e trasporto.';
    case 'Reputation':
      return 'Segnali da feed reputazionali e threat intelligence esterna.';
    default:
      return 'Finding tecnici aggregati dall’ultimo ciclo di analisi.';
  }
}

function buildCoverageControls(
  moduleRows: ModuleResultLite[],
  tier: 'standard' | 'extended',
): CoverageControl[] {
  const mapping: Array<{ key: string; control: string; modules: string[]; source: string }> = [
    { key: 'dns', control: 'DNS', modules: ['dns', 'dnssec', 'dns_blocklists'], source: 'SurfaceScan360' },
    { key: 'whois', control: 'WHOIS/RDAP', modules: ['whois'], source: 'SurfaceScan360' },
    { key: 'email_security', control: 'Email security', modules: ['mail_security', 'mail_config'], source: 'SurfaceScan360' },
    { key: 'ports_services', control: 'Porte e servizi', modules: ['open_ports', 'shodan', 'pentest_tools'], source: 'SurfaceScan360' },
    { key: 'intelx_domain', control: 'Intelligence X dominio', modules: [], source: 'IntelX' },
    { key: 'intelx_selectors', control: 'Intelligence X selector', modules: [], source: 'IntelX' },
    { key: 'phonebook', control: 'Phonebook', modules: [], source: 'IntelX' },
  ];

  const rowsByModule = new Map<string, ModuleResultLite>();
  for (const row of moduleRows) {
    const key = String(row.module_key || '').trim().toLowerCase();
    if (!key) continue;
    const current = rowsByModule.get(key);
    if (!current) {
      rowsByModule.set(key, row);
      continue;
    }
    const currentTime = Date.parse(String(current.completed_at || current.created_at || 0));
    const nextTime = Date.parse(String(row.completed_at || row.created_at || 0));
    if (Number.isFinite(nextTime) && nextTime > currentTime) {
      rowsByModule.set(key, row);
    }
  }

  return mapping.map((control) => {
    if (control.modules.length === 0) {
      const isExtendedOnly = control.key === 'phonebook';
      const controlSource = isExtendedOnly && tier !== 'extended'
        ? 'IntelX (solo Estesa)'
        : control.source;
      const controlStatus = isExtendedOnly && tier !== 'extended'
        ? ('planned' as CoverageStatus)
        : ('not_run' as CoverageStatus);

      return {
        key: control.key,
        control: control.control,
        status: controlStatus,
        last_execution: null,
        source: controlSource,
      };
    }

    const moduleHits = control.modules
      .map((moduleKey) => rowsByModule.get(moduleKey))
      .filter((row): row is ModuleResultLite => Boolean(row));

    if (moduleHits.length === 0) {
      return {
        key: control.key,
        control: control.control,
        status: 'not_run' as CoverageStatus,
        last_execution: null,
        source: control.source,
      };
    }

    const statuses = moduleHits.map((hit) => normalizeCoverageStatus(hit.status));
    const hasError = statuses.includes('error');
    const hasCompleted = statuses.includes('completed');
    const hasPartial = statuses.includes('partial');

    let status: CoverageStatus = 'not_run';
    if (hasError && !hasCompleted) status = 'error';
    else if (hasCompleted && (hasPartial || hasError)) status = 'partial';
    else if (hasCompleted) status = 'completed';
    else if (hasPartial) status = 'partial';

    const lastExecution = moduleHits
      .map((hit) => hit.completed_at || hit.created_at)
      .filter((v): v is string => Boolean(v))
      .sort((a, b) => Date.parse(b) - Date.parse(a))[0] || null;

    return {
      key: control.key,
      control: control.control,
      status,
      last_execution: lastExecution,
      source: control.source,
    };
  });
}

function findImpactedAsset(finding: FindingLite): string | null {
  const candidate = [finding.affected_asset, finding.affected_host, finding.affected_url]
    .map((value) => String(value || '').trim())
    .find((value) => value.length > 0);
  return candidate || null;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (!['GET', 'POST'].includes(req.method)) {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const { userClient, adminClient } = makeSupabaseClients(req);
    const { data: authData, error: authError } = await userClient.auth.getUser();

    if (authError || !authData.user) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const query = new URL(req.url).searchParams;

    const inputCustomerId = String(
      body?.customer_id || query.get('customer_id') || '',
    ).trim();

    const caller = await getCallerProfile(adminClient, authData.user.id);
    const customerId = inputCustomerId || caller.organizationId || '';

    if (!customerId) {
      return jsonResponse({ error: 'customer_id is required' }, 400);
    }

    assertCustomerAccess(caller, customerId);

    const [orgFlagsRes, entitlementRes] = await Promise.all([
      adminClient
        .from('organizations' as any)
        .select('dark_risk360_enabled')
        .eq('id', customerId)
        .maybeSingle(),
      adminClient
        .from('darkrisk_entitlements' as any)
        .select('enabled, tier')
        .eq('organization_id', customerId)
        .maybeSingle(),
    ]);

    const orgFlags = orgFlagsRes.data || null;
    let entitlement: { enabled?: boolean | null; tier?: string | null } | null = null;
    if (!entitlementRes.error) {
      entitlement = (entitlementRes.data || null) as any;
    } else {
      const missingRelation = String((entitlementRes.error as any)?.code || '') === '42P01';
      if (!missingRelation) {
        throw entitlementRes.error;
      }
    }

    const darkRiskEnabled = entitlement?.enabled ?? Boolean(orgFlags?.dark_risk360_enabled);
    const darkRiskTier = String(entitlement?.tier || 'standard').toLowerCase() === 'extended'
      ? 'extended'
      : 'standard';

    const latestJobQuery = adminClient
      .from('surface_scan_jobs' as any)
      .select('id, created_at, completed_at, status, scan_profile, scan_type, summary')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const fallbackLatestJobQuery = adminClient
      .from('surface_scan_jobs' as any)
      .select('id, created_at, completed_at, status, scan_profile, scan_type, summary')
      .eq('organization_id', customerId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const [latestPrimaryRes, latestFallbackRes] = await Promise.all([
      latestJobQuery,
      fallbackLatestJobQuery,
    ]);

    const latestJob = latestPrimaryRes.data || latestFallbackRes.data || null;

    let previousJob: any = null;
    if (latestJob?.created_at) {
      const previousJobRes = await adminClient
        .from('surface_scan_jobs' as any)
        .select('id, created_at, completed_at, status, scan_profile, scan_type')
        .eq('customer_id', customerId)
        .lt('created_at', String(latestJob.created_at))
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      previousJob = previousJobRes.data || null;
    }

    const [
      alertConfigsRes,
      monitoredDomainsRes,
      moduleRowsRes,
      latestFindingsRes,
      latestExposureFindingsRes,
      previousFindingsRes,
      previousExposureFindingsRes,
      openPortsRes,
    ] = await Promise.all([
      adminClient
        .from('dark_risk_alerts' as any)
        .select('id, is_active')
        .eq('organization_id', customerId),
      adminClient
        .from('surface_scan_monitored_ips' as any)
        .select('id, entry_type, input_value')
        .eq('organization_id', customerId),
      latestJob?.id
        ? adminClient
            .from('surface_scan_module_results' as any)
            .select('module_key, module_label, status, completed_at, created_at')
            .eq('scan_job_id', latestJob.id)
        : Promise.resolve({ data: [], error: null }),
      latestJob?.id
        ? adminClient
            .from('surface_findings' as any)
            .select('id, severity, title, finding_type, module, created_at, status, affected_asset, attribution_confidence')
            .eq('scan_job_id', latestJob.id)
            .order('created_at', { ascending: false })
            .limit(500)
        : Promise.resolve({ data: [], error: null }),
      latestJob?.id
        ? adminClient
            .from('surface_exposure_findings' as any)
            .select('id, severity, title, finding_type, source, created_at, status, affected_host, affected_url')
            .eq('scan_job_id', latestJob.id)
            .order('created_at', { ascending: false })
            .limit(500)
        : Promise.resolve({ data: [], error: null }),
      previousJob?.id
        ? adminClient
            .from('surface_findings' as any)
            .select('id, severity, title, finding_type, module, created_at, status, affected_asset, attribution_confidence')
            .eq('scan_job_id', previousJob.id)
            .limit(500)
        : Promise.resolve({ data: [], error: null }),
      previousJob?.id
        ? adminClient
            .from('surface_exposure_findings' as any)
            .select('id, severity, title, finding_type, source, created_at, status, affected_host, affected_url')
            .eq('scan_job_id', previousJob.id)
            .limit(500)
        : Promise.resolve({ data: [], error: null }),
      latestJob?.id
        ? adminClient
            .from('surface_open_ports' as any)
            .select('id, exposure_level')
            .eq('scan_job_id', latestJob.id)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (alertConfigsRes.error) throw alertConfigsRes.error;
    if (monitoredDomainsRes.error) throw monitoredDomainsRes.error;
    if ((moduleRowsRes as any).error) throw (moduleRowsRes as any).error;
    if ((latestFindingsRes as any).error) throw (latestFindingsRes as any).error;
    if ((latestExposureFindingsRes as any).error) throw (latestExposureFindingsRes as any).error;
    if ((previousFindingsRes as any).error) throw (previousFindingsRes as any).error;
    if ((previousExposureFindingsRes as any).error) throw (previousExposureFindingsRes as any).error;
    if ((openPortsRes as any).error) throw (openPortsRes as any).error;

    const moduleRows = ((moduleRowsRes as any).data || []) as ModuleResultLite[];
    const coverageControls = buildCoverageControls(moduleRows, darkRiskTier);

    const latestFindings = [
      ...(((latestFindingsRes as any).data || []) as FindingLite[]),
      ...(((latestExposureFindingsRes as any).data || []) as FindingLite[]),
    ];

    const previousFindings = [
      ...(((previousFindingsRes as any).data || []) as FindingLite[]),
      ...(((previousExposureFindingsRes as any).data || []) as FindingLite[]),
    ];

    const activeLatest = latestFindings.filter((finding) => isActiveFinding(finding.status));
    const activePrevious = previousFindings.filter((finding) => isActiveFinding(finding.status));

    const credentialsRegex = /credential|credenzial|password|stealer|compromis|leak/i;
    const credentialsLatest = latestFindings.filter((finding) => {
      const text = `${finding.finding_type || ''} ${finding.title || ''}`;
      return credentialsRegex.test(text);
    });
    const credentialsPrevious = previousFindings.filter((finding) => {
      const text = `${finding.finding_type || ''} ${finding.title || ''}`;
      return credentialsRegex.test(text);
    });

    const criticalLatestCount = latestFindings.filter((finding) => normalizeSeverity(finding.severity) === 'critical').length;
    const criticalPreviousCount = previousFindings.filter((finding) => normalizeSeverity(finding.severity) === 'critical').length;

    const highLatestCount = latestFindings.filter((finding) => normalizeSeverity(finding.severity) === 'high').length;
    const highPreviousCount = previousFindings.filter((finding) => normalizeSeverity(finding.severity) === 'high').length;

    const risk = riskFromFindings(activeLatest);

    const monitoredDomainRules = ((monitoredDomainsRes.data || []) as Array<{ entry_type?: string | null; input_value?: string | null }>)
      .filter((row) => {
        const entryType = String(row.entry_type || '').toLowerCase();
        const value = String(row.input_value || '').toLowerCase();
        return entryType === 'domain' || value.includes('.') && /[a-z]/i.test(value);
      }).length;

    const exposedServicesCount = (((openPortsRes as any).data || []) as Array<{ exposure_level?: string | null }>).filter((port) => {
      const level = String(port.exposure_level || '').toLowerCase();
      return level === 'critical' || level === 'high';
    }).length;

    const recentAlerts = activeLatest
      .slice(0, 24)
      .sort((a, b) => Date.parse(String(b.created_at || 0)) - Date.parse(String(a.created_at || 0)))
      .slice(0, 8)
      .map((finding) => {
        const category = classifyThreatCategory(finding);
        return {
          id: finding.id,
          severity: normalizeSeverity(finding.severity),
          title: finding.title || finding.finding_type || 'Nuova evidenza rilevata',
          asset: findImpactedAsset(finding),
          type: category,
          time: finding.created_at,
          status: String(finding.status || 'open').toLowerCase(),
          confidence: String(finding.attribution_confidence || 'medium').toLowerCase(),
          source: String(finding.module || finding.source || 'surface_scan_engine'),
          finding_id: finding.id,
        };
      });

    const categoryMap = new Map<string, { count: number; severity_max: Severity }>();
    for (const finding of activeLatest) {
      const category = classifyThreatCategory(finding);
      const severity = normalizeSeverity(finding.severity);
      const current = categoryMap.get(category);
      if (!current) {
        categoryMap.set(category, { count: 1, severity_max: severity });
        continue;
      }

      current.count += 1;
      if (severityRank[severity] > severityRank[current.severity_max]) {
        current.severity_max = severity;
      }
    }

    const previousCategoryMap = new Map<string, number>();
    for (const finding of activePrevious) {
      const category = classifyThreatCategory(finding);
      previousCategoryMap.set(category, (previousCategoryMap.get(category) || 0) + 1);
    }

    const threatGroups = Array.from(categoryMap.entries())
      .map(([category, value]) => ({
        category,
        count: value.count,
        severity_max: value.severity_max,
        description: categoryDescription(category),
        trend_delta: value.count - (previousCategoryMap.get(category) || 0),
      }))
      .sort((a, b) => b.count - a.count);

    const coverageCompleted = coverageControls.filter((control) => control.status === 'completed').length;
    const coveragePartial = coverageControls.filter((control) => control.status === 'partial').length;

    const previousScanEnd = previousJob?.completed_at || previousJob?.created_at || null;
    const newAlertsSincePrevious = previousScanEnd
      ? activeLatest.filter((finding) => {
          if (!finding.created_at) return false;
          return Date.parse(finding.created_at) > Date.parse(String(previousScanEnd));
        }).length
      : activeLatest.length;

    const impactedIdentities = new Set(
      credentialsLatest
        .map((finding) => findImpactedAsset(finding))
        .filter((value): value is string => Boolean(value)),
    ).size;

    return jsonResponse({
      customer_id: customerId,
      enabled: Boolean(darkRiskEnabled),
      tier: darkRiskTier,
      latest_scan: latestJob
        ? {
            id: latestJob.id,
            status: String(latestJob.status || 'unknown').toLowerCase(),
            profile: latestJob.scan_profile || null,
            type: latestJob.scan_type || null,
            started_at: latestJob.created_at || null,
            completed_at: latestJob.completed_at || null,
          }
        : null,
      previous_scan: previousJob
        ? {
            id: previousJob.id,
            started_at: previousJob.created_at || null,
            completed_at: previousJob.completed_at || null,
          }
        : null,
      kpis: {
        active_threats: {
          value: activeLatest.length,
          delta: activeLatest.length - activePrevious.length,
        },
        credential_leaks: {
          value: credentialsLatest.length,
          delta: credentialsLatest.length - credentialsPrevious.length,
        },
        monitored_domains: {
          value: monitoredDomainRules,
          delta: null,
        },
        risk_score: {
          value: risk.score,
          level: risk.level,
          delta: risk.score - riskFromFindings(activePrevious).score,
        },
        last_scan: {
          value: latestJob?.completed_at || latestJob?.created_at || null,
          delta: null,
        },
        controls_coverage: {
          value: coverageControls.length > 0 ? Math.round((coverageCompleted / coverageControls.length) * 100) : 0,
          completed: coverageCompleted,
          partial: coveragePartial,
          total: coverageControls.length,
        },
        critical_findings: {
          value: criticalLatestCount,
          delta: criticalLatestCount - criticalPreviousCount,
        },
        new_alerts: {
          value: newAlertsSincePrevious,
          delta: null,
        },
        high_priority_findings: {
          value: highLatestCount,
          delta: highLatestCount - highPreviousCount,
        },
        impacted_identities: {
          value: impactedIdentities,
          delta: null,
        },
        exposed_services: {
          value: exposedServicesCount,
          delta: null,
        },
      },
      coverage_controls: coverageControls,
      threat_groups: threatGroups,
      recent_alerts: recentAlerts,
      alert_config: {
        total: (alertConfigsRes.data || []).length,
        active: ((alertConfigsRes.data || []) as Array<{ is_active?: boolean }>).filter((alert) => Boolean(alert.is_active)).length,
      },
    });
  } catch (error: any) {
    return jsonResponse({
      error: error?.message || 'Internal error',
    }, 500);
  }
});
