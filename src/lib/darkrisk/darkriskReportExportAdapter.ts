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

export function adaptDarkRiskReportToSurfaceScanTemplate(reportJson: any): SurfaceScan360Report {
  const scopeAssets = Array.isArray(reportJson?.scope?.authorized_assets) ? reportJson.scope.authorized_assets : [];
  const findings = Array.isArray(reportJson?.findings) ? reportJson.findings : [];
  const recommendations = Array.isArray(reportJson?.recommendations) ? reportJson.recommendations : [];
  const bySeverity = findings.reduce((acc: Record<string, number>, item: any) => {
    const key = String(item?.severity || 'info').toLowerCase();
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const hasHiCompliance = Boolean(reportJson?.document_metadata?.hicompliance_enabled);
  const reportBrandTitle = hasHiCompliance ? 'HICOMPLIANCE · DARKRISK360' : 'HiConsole - DARKRISK360';
  const targetLabel =
    scopeAssets.length > 0
      ? `Scope completo (${scopeAssets.length} target)`
      : reportJson?.document_metadata?.customer_name || 'Scope cliente';

  const surfaceFindings = findings.map((finding: any) => {
    const cve = extractCves(finding?.title, finding?.type, finding?.interpretation, ...(finding?.evidence_summary || []));
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
      evidence: { summary: Array.isArray(finding?.evidence_summary) ? finding.evidence_summary : [] },
      attribution_confidence: String(finding?.confidence || 'medium').toLowerCase(),
      created_at: finding?.last_seen_at || finding?.first_seen_at || reportJson?.generated_at,
    };
  });

  const cveCatalog = Array.from(
    new Set(surfaceFindings.flatMap((entry: any) => Array.isArray(entry.cve) ? entry.cve : [])),
  ).map((cveId) => ({
    cve_id: cveId,
    description: 'Descrizione tecnica disponibile da evidenza DarkRisk360.',
    cvss: null,
    cvss_severity: null,
    epss: null,
    epss_percentile: null,
    cisa_kev: false,
    affected_assets: surfaceFindings.filter((entry: any) => (entry.cve || []).includes(cveId)).map((entry: any) => entry.affected_asset).filter(Boolean),
  }));

  return {
    generated_at: String(reportJson?.generated_at || new Date().toISOString()),
    organization: {
      id: reportJson?.customer_id || null,
      name: reportJson?.document_metadata?.customer_name || 'Cliente',
      legal_name: reportJson?.document_metadata?.customer_name || 'Cliente',
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
      job_id: reportJson?.scan_run_id || null,
      target: targetLabel,
      normalized_target: targetLabel,
      target_type: 'mixed_scope',
      scan_profile: 'darkrisk360_scope',
      hosting_context: 'mixed_scope',
      status: 'completed',
      started_at: null,
      completed_at: reportJson?.generated_at || null,
      scope_mode: 'organization_scope',
      scope_jobs_total: 1,
      scope_job_ids: reportJson?.scan_run_id ? [reportJson.scan_run_id] : [],
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
    findings_by_severity: bySeverity,
    scope_guard_summary: {
      in_scope: scopeAssets.length,
      excluded_by_scope: Array.isArray(reportJson?.scope?.excluded_assets) ? reportJson.scope.excluded_assets.length : 0,
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
      executive_summary: reportJson?.executive_summary?.text || '',
      risk_score: reportJson?.executive_summary?.risk_score ?? null,
      risk_level: reportJson?.executive_summary?.risk_level || null,
      top_recommendations: buildTopRecommendations(reportJson, recommendations, scopeAssets),
      correlations: buildCorrelations(reportJson),
      compliance_notes: 'Analisi DarkRisk360 normalizzata su template SurfaceScan360 per reporting unificato.',
    },
    ai_error: null,
    // Sezione DTI (solo tier extended): credenziali esposte
    dti_credentials: buildDtiCredentialsSection(reportJson),
    dti_risk_index: reportJson?.risk_index ?? reportJson?.executive_summary?.risk_score ?? null,
  };
}

function buildTopRecommendations(reportJson: any, recommendations: any[], scopeAssets: string[]): any[] {
  const tier = String(reportJson?.tier ?? 'standard');
  const allRecs = [...recommendations];

  // Per tier extended, aggiungi raccomandazioni prioritizzate da DTI
  if (tier === 'extended') {
    const dtiRecs = Array.isArray(reportJson?.dti_intelligence?.recommendations)
      ? reportJson.dti_intelligence.recommendations
      : [];
    allRecs.push(...dtiRecs);
  }

  return allRecs
    .sort((a, b) => {
      const priorityOrder: Record<string, number> = { immediate: 0, short_term: 1, mid_term: 2, long_term: 3 };
      return (priorityOrder[a?.priority] ?? 4) - (priorityOrder[b?.priority] ?? 4);
    })
    .slice(0, 10)
    .map((entry: any, index: number) => ({
      priority: index + 1,
      title: String(entry?.title || `Raccomandazione ${index + 1}`),
      rationale: String(entry?.why_it_matters || entry?.rationale || ''),
      action: Array.isArray(entry?.actions) ? entry.actions.join('; ') : String(entry?.actions || ''),
      affected_assets: Array.isArray(scopeAssets) ? scopeAssets.slice(0, 10) : [],
      severity: entry?.priority === 'immediate' ? 'critical' : entry?.priority === 'short_term' ? 'high' : entry?.priority === 'mid_term' ? 'medium' : 'low',
    }));
}

function buildCorrelations(reportJson: any): string[] {
  const baseCorrelations = Array.isArray(reportJson?.executive_summary?.top_drivers)
    ? reportJson.executive_summary.top_drivers.slice(0, 5)
    : [];

  const tier = String(reportJson?.tier ?? 'standard');
  if (tier !== 'extended') return baseCorrelations;

  // Per tier extended: aggiungi summary credenziali esposte come correlazione
  const sensitiveHits = Array.isArray(reportJson?.dti_intelligence?.sensitive_hits)
    ? reportJson.dti_intelligence.sensitive_hits
    : [];
  const pwdCount = sensitiveHits.filter((h: any) => String(h?.tag || '') === 'passwords').length;
  const cardCount = sensitiveHits.filter((h: any) => String(h?.tag || '') === 'credit_cards').length;

  const dtiCorrelations: string[] = [];
  if (pwdCount > 0) dtiCorrelations.push(`${pwdCount} credenziali con password in chiaro identificate`);
  if (cardCount > 0) dtiCorrelations.push(`${cardCount} dati carta di credito rilevati`);

  return [...baseCorrelations, ...dtiCorrelations].slice(0, 8);
}

/**
 * Sezione credenziali DTI per il report Esteso.
 * Mostra la password in chiaro (clear_value) quando disponibile — è il dato utile per il cliente.
 * Fallback su masked_value se clear_value non è presente.
 */
function buildDtiCredentialsSection(reportJson: any): any[] {
  const tier = String(reportJson?.tier ?? 'standard');
  if (tier !== 'extended') return [];

  const hits = Array.isArray(reportJson?.dti_intelligence?.sensitive_hits)
    ? reportJson.dti_intelligence.sensitive_hits
    : [];

  return hits
    .filter((h: any) => String(h?.tag || '') === 'passwords' && (h?.clear_value || h?.masked_value))
    .slice(0, 50)
    .map((h: any) => ({
      email: String(h?.selector_value || h?.asset_scope || '').slice(0, 120),
      password: String(h?.clear_value || h?.masked_value || ''),
      source: String(h?.source_bucket || h?.source || 'intelx'),
      date: String(h?.source_date || h?.first_seen_at || '').slice(0, 10),
      password_type: String(h?.password_type || 'plaintext'),
    }));
}

