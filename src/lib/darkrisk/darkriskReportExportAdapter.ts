import type { SurfaceScan360Report } from '@/lib/surfaceScan360PdfReport';

const CVE_REGEX = /\bCVE-\d{4}-\d{4,7}\b/gi;

const isIpv4 = (value: string): boolean => /^(?:\d{1,3}\.){3}\d{1,3}$/.test(String(value || '').trim());

const inferAssetType = (value: string): string => {
  const clean = String(value || '').trim().toLowerCase();
  if (!clean) return 'asset';
  if (isIpv4(clean)) return 'ip';
  if (clean.includes('@')) return 'email';
  if (/^https?:\/\//.test(clean)) return 'url';
  if (clean.split('.').length > 2) return 'subdomain';
  if (clean.includes('.')) return 'domain';
  return 'asset';
};

const extractCves = (...values: Array<string | null | undefined>): string[] => {
  const out = new Set<string>();
  values
    .filter(Boolean)
    .forEach((value) => {
      const matches = String(value).match(CVE_REGEX) || [];
      matches.forEach((entry) => out.add(entry.toUpperCase()));
    });
  return Array.from(out);
};

export function adaptDarkRiskReportToSurfaceScanTemplate(reportJson: unknown): SurfaceScan360Report {
  const r = reportJson as {
    scope?: { authorized_assets?: string[] };
    findings?: Array<Record<string, unknown>>;
    recommendations?: unknown[];
    document_metadata?: { hicompliance_enabled?: boolean; customer_name?: string };
    generated_at?: string;
  };
  const scopeAssets = Array.isArray(r?.scope?.authorized_assets) ? r.scope.authorized_assets : [];
  const findings = Array.isArray(r?.findings) ? r.findings : [];
  const recommendations = Array.isArray(r?.recommendations) ? r.recommendations : [];
  const bySeverity = findings.reduce((acc: Record<string, number>, item: Record<string, unknown>) => {
    const key = String(item?.severity || 'info').toLowerCase();
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const hasHiCompliance = Boolean(r?.document_metadata?.hicompliance_enabled);
  const reportBrandTitle = hasHiCompliance ? 'HICOMPLIANCE · DARKRISK360' : 'HiConsole - DARKRISK360';
  const targetLabel =
    scopeAssets.length > 0
      ? `Scope completo (${scopeAssets.length} target)`
      : r?.document_metadata?.customer_name || 'Scope cliente';

  const surfaceFindings = findings.map((finding: Record<string, unknown>) => {
    const cve = extractCves(
      String(finding?.title || ''),
      String(finding?.type || ''),
      String(finding?.interpretation || ''),
      ...(Array.isArray(finding?.evidence_summary) ? (finding.evidence_summary as unknown[]).map(String) : [])
    );
    return {
      provider: 'darkrisk360',
      module: String(finding?.type || 'darkrisk').trim().toLowerCase() || 'darkrisk',
      finding_type: String(finding?.type || 'darkrisk_signal').trim().toLowerCase(),
      title: String(finding?.title || 'Finding DarkRisk360'),
      description: String(finding?.interpretation || ''),
      severity: String(finding?.severity || 'info').toLowerCase(),
      affected_asset: String(finding?.affected_asset || '').trim() || null,
      affected_url: null,
      ip: isIpv4(String(finding?.affected_asset || '').trim()) ? String(finding?.affected_asset || '').trim() : null,
      port: null,
      protocol: null,
      remediation: String(finding?.interpretation || 'Gestire il finding con remediation tracciata e verifica successiva.'),
      cve,
      cwe: [],
      cvss: Number.isFinite(Number(finding?.risk_score)) ? Number(finding.risk_score) / 10 : null,
      evidence: { summary: Array.isArray(finding?.evidence_summary) ? (finding.evidence_summary as unknown[]) : [] },
      attribution_confidence: String(finding?.confidence || 'medium').toLowerCase(),
      created_at: (finding?.last_seen_at as string) || (finding?.first_seen_at as string) || r?.generated_at,
    };
  });

  const cveCatalog = Array.from(
    new Set(surfaceFindings.flatMap((entry: unknown) => Array.isArray((entry as { cve?: unknown[] }).cve) ? (entry as { cve?: unknown[] }).cve as unknown[] : [])),
  ).map((cveId: unknown) => ({
    cve_id: String(cveId),
    description: 'Descrizione tecnica disponibile da evidenza DarkRisk360.',
    cvss: null,
    cvss_severity: null,
    epss: null,
    epss_percentile: null,
    cisa_kev: false,
    affected_assets: surfaceFindings.filter((entry: Record<string, unknown>) => ((entry.cve as unknown[]) || []).includes(cveId)).map((entry: Record<string, unknown>) => entry.affected_asset as string).filter(Boolean),
  }));

  return {
    generated_at: String(r?.generated_at || new Date().toISOString()),
    organization: {
      id: (reportJson as { customer_id?: string })?.customer_id || null,
      name: r?.document_metadata?.customer_name || 'Cliente',
      legal_name: r?.document_metadata?.customer_name || 'Cliente',
      hicompliance_enabled: hasHiCompliance,
      has_hicompliance: hasHiCompliance,
      report_brand_title: reportBrandTitle,
      business_sector: null,
      nis2_classification: null,
      email: null,
      phone: null,
      pec: null,
      vat_number: null,
      fiscal_code: null,
      legal_address: null,
      operational_address: null,
    },
    scan: {
      job_id: (reportJson as { scan_run_id?: string })?.scan_run_id || null,
      target: targetLabel,
      normalized_target: targetLabel,
      target_type: 'mixed_scope',
      scan_profile: 'darkrisk360_scope',
      hosting_context: 'mixed_scope',
      status: 'completed',
      started_at: null,
      completed_at: r?.generated_at || null,
      scope_mode: 'organization_scope',
      scope_jobs_total: 1,
      scope_job_ids: (reportJson as { scan_run_id?: string })?.scan_run_id ? [(reportJson as { scan_run_id?: string }).scan_run_id as string] : [],
      scope_targets_total: scopeAssets.length,
      scope_targets: scopeAssets,
      scope_target_types: Array.from(new Set(scopeAssets.map((asset: string) => inferAssetType(asset)))),
      scope_profiles: ['darkrisk360_scope'],
    },
    assets_in_scope: scopeAssets.map((assetValue: string) => ({
      asset_type: inferAssetType(assetValue),
      asset_value: assetValue,
      hostname: inferAssetType(assetValue) === 'domain' || inferAssetType(assetValue) === 'subdomain' ? assetValue : null,
      ip: inferAssetType(assetValue) === 'ip' ? assetValue : null,
      source: 'darkrisk_scope',
    })),
    findings: surfaceFindings,
    findings_by_severity: bySeverity as Record<string, number>,
    scope_guard_summary: {
      in_scope: scopeAssets.length,
      excluded_by_scope: Array.isArray(r?.scope && (r.scope as { excluded_assets?: unknown[] }).excluded_assets) ? (r.scope as { excluded_assets?: unknown[] }).excluded_assets?.length ?? 0 : 0,
      excluded_shared_noise: 0,
      excluded_reasons: {},
    },
    cve_catalog: cveCatalog,
    intel: [],
    observations: [],
    monitored_scope: scopeAssets.map((assetValue: string) => ({
      entry_type: inferAssetType(assetValue) === 'ip' ? 'single' : 'domain',
      input_value: assetValue,
      discovered_via: 'darkrisk_scope',
    })),
    subdomain_dumps: [],
    remediation_tasks: [],
    kev_generation: { created: 0, total_kev: 0, existing: 0 },
    ai: {
      executive_summary: (reportJson as { executive_summary?: { text?: string } })?.executive_summary?.text || '',
      risk_score: (reportJson as { executive_summary?: { risk_score?: number } })?.executive_summary?.risk_score ?? null,
      risk_level: (reportJson as { executive_summary?: { risk_level?: string } })?.executive_summary?.risk_level || null,
      top_recommendations: recommendations.slice(0, 10).map((entry: unknown, index: number) => {
        const e = entry as Record<string, unknown>;
        return {
        priority: index + 1,
        title: String(e?.title || `Raccomandazione ${index + 1}`),
        rationale: String(e?.why_it_matters || ''),
        action: Array.isArray(e?.actions) ? (e.actions as unknown[]).join('; ') : String(e?.actions || ''),
        affected_assets: Array.isArray(scopeAssets) ? scopeAssets.slice(0, 10) : [],
        severity: e?.priority === 'immediate' ? 'critical' : e?.priority === 'short_term' ? 'high' : e?.priority === 'mid_term' ? 'medium' : 'low',
        };
      }),
      correlations: Array.isArray((reportJson as { executive_summary?: { top_drivers?: unknown[] } })?.executive_summary?.top_drivers)
        ? (((reportJson as { executive_summary?: { top_drivers?: unknown[] } }).executive_summary?.top_drivers ?? []).slice(0, 5) as string[])
        : [],
      compliance_notes: 'Analisi DarkRisk360 normalizzata su template SurfaceScan360 per reporting unificato.',
    },
    ai_error: null,
  };
}

