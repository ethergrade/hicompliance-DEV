import type { SurfaceScan360Report } from './surfaceScan360PdfReport';

type ReportInput = {
  organizationId?: string | null;
  organizationName?: string | null;
  job: any;
  openPorts: any[];
  technologies: any[];
  niktoFindings: any[];
  cveMatches: any[];
  nucleiFindings: any[];
  nucleiResult: any;
};

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'];

const asText = (value: unknown, fallback = '-'): string => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const asNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const uniq = <T,>(values: T[]): T[] => Array.from(new Set(values));

const normalizeSeverity = (value: unknown, fallback = 'info'): string => {
  const severity = String(value || '').trim().toLowerCase();
  if (SEVERITY_ORDER.includes(severity)) return severity;
  return fallback;
};

const severityFromCvss = (value: unknown): string => {
  const score = asNumber(value);
  if (score == null) return 'medium';
  if (score >= 9) return 'critical';
  if (score >= 7) return 'high';
  if (score >= 4) return 'medium';
  if (score > 0) return 'low';
  return 'info';
};

const severityForPort = (port: unknown, service: unknown): string => {
  const parsedPort = Number(port);
  const svc = String(service || '').toLowerCase();
  if ([21, 23, 445, 3389, 5900].includes(parsedPort)) return 'high';
  if ([25, 110, 143, 3306, 5432, 6379, 9200, 11211].includes(parsedPort)) return 'medium';
  if (svc.includes('ftp') || svc.includes('telnet') || svc.includes('smb')) return 'high';
  return 'info';
};

const targetLabel = (job: any): string =>
  asText(job?.target_input || job?.target_host || job?.nmap_target || job?.target_url || job?.resolved_target_url, 'Target LAB');

const targetHost = (job: any): string => {
  const raw = targetLabel(job);
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname || raw;
  } catch {
    return raw.replace(/^https?:\/\//i, '').replace(/\/.*$/, '') || raw;
  }
};

const inferAssetType = (value: string): 'domain' | 'subdomain' => {
  const host = String(value || '').replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  return host.split('.').length > 2 ? 'subdomain' : 'domain';
};

const countBySeverity = (findings: any[]): Record<string, number> =>
  findings.reduce((acc: Record<string, number>, finding: any) => {
    const severity = normalizeSeverity(finding?.severity);
    acc[severity] = (acc[severity] || 0) + 1;
    return acc;
  }, {});

const buildCveCatalog = (matches: any[]) => {
  const byCve = new Map<string, any>();
  for (const match of matches || []) {
    const cveId = String(match?.cve_id || '').trim().toUpperCase();
    if (!cveId) continue;
    const current = byCve.get(cveId);
    const affectedAsset = asText(match?.asset_host || match?.matched_at || match?.cpe, '');
    const next = {
      cve_id: cveId,
      description: match?.description || current?.description || null,
      cvss: asNumber(match?.cvss_score) ?? current?.cvss ?? null,
      cvss_severity: normalizeSeverity(match?.severity || severityFromCvss(match?.cvss_score), ''),
      epss: asNumber(match?.epss_score) ?? current?.epss ?? null,
      epss_percentile: asNumber(match?.epss_percentile) ?? current?.epss_percentile ?? null,
      cisa_kev: Boolean(match?.kev_known_exploited || current?.cisa_kev),
      kev_due_date: current?.kev_due_date ?? null,
      kev_required_action: current?.kev_required_action ?? null,
      cwe: current?.cwe ?? [],
      references: current?.references ?? [`https://nvd.nist.gov/vuln/detail/${encodeURIComponent(cveId)}`],
      affected_assets: uniq([...(current?.affected_assets || []), affectedAsset].filter(Boolean)),
      published_at: match?.published_at || current?.published_at || null,
      last_modified_at: match?.last_modified_at || current?.last_modified_at || null,
      refreshed_at: new Date().toISOString(),
    };
    byCve.set(cveId, next);
  }
  return Array.from(byCve.values());
};

const buildFindings = (input: ReportInput): any[] => {
  const target = targetHost(input.job);
  const portFindings = (input.openPorts || []).map((port) => ({
    provider: 'nuclei_scan360',
    module: 'nmap',
    finding_type: 'open.port',
    title: `Porta ${asText(port?.protocol, 'tcp')}/${asText(port?.port)} aperta${port?.service ? ` (${port.service})` : ''}`,
    description: `Nmap ha rilevato la porta aperta sul target. Prodotto/versione: ${[port?.product, port?.version].filter(Boolean).join(' ') || 'non disponibile'}.`,
    severity: severityForPort(port?.port, port?.service),
    affected_asset: asText(port?.hostname || port?.host || target, target),
    affected_url: (port?.url_candidates || [])[0] || null,
    ip: port?.host || null,
    port: port?.port || null,
    protocol: port?.protocol || 'tcp',
    remediation: 'Verificare che il servizio esposto sia necessario, aggiornato e protetto da controlli di accesso adeguati.',
    cve: [],
    cwe: [],
    cvss: null,
    evidence: {
      service: port?.service || null,
      product: port?.product || null,
      version: port?.version || null,
      cpe: port?.cpe || [],
    },
    attribution_confidence: 'high',
    created_at: input.job?.nmap_completed_at || input.job?.created_at || new Date().toISOString(),
  }));

  const niktoReportFindings = (input.niktoFindings || []).map((finding) => ({
    provider: 'nuclei_scan360',
    module: 'nikto',
    finding_type: `nikto.${asText(finding?.category, 'web_exposure')}`,
    title: asText(finding?.message || finding?.category, 'Finding Nikto'),
    description: asText(finding?.message, 'Nikto ha rilevato una configurazione o esposizione da verificare.'),
    severity: normalizeSeverity(finding?.severity),
    affected_asset: asText(finding?.asset_host || target, target),
    affected_url: finding?.target_url || null,
    ip: null,
    port: finding?.port || null,
    protocol: finding?.tls ? 'https' : 'http',
    remediation: 'Validare il finding Nikto, ridurre l esposizione pubblica e applicare hardening applicativo/web server.',
    cve: [],
    cwe: [],
    cvss: null,
    evidence: {
      nikto_id: finding?.nikto_id || null,
      method: finding?.method || 'GET',
      uri: finding?.uri || '/',
      references: finding?.references || [],
    },
    attribution_confidence: 'medium',
    created_at: input.job?.nikto_completed_at || input.job?.created_at || new Date().toISOString(),
  }));

  const cveReportFindings = (input.cveMatches || []).map((match) => {
    const status = match?.match_status === 'potential' ? 'potential' : 'confirmed';
    const severity = normalizeSeverity(match?.severity, severityFromCvss(match?.cvss_score));
    return {
      provider: 'nuclei_scan360',
      module: status === 'confirmed' ? 'nuclei' : 'nvd_cpe',
      finding_type: `cve.${status}`,
      title: `${match?.cve_id || 'CVE'} ${status === 'confirmed' ? 'confermata da Nuclei' : 'potenziale da NVD/CPE'}`,
      description: asText(match?.description, status === 'confirmed'
        ? 'CVE rilevata da template Nuclei.'
        : 'CVE potenziale correlata a CPE/versione: richiede verifica tecnica prima della remediation.'),
      severity,
      affected_asset: asText(match?.asset_host || target, target),
      affected_url: match?.matched_at || null,
      ip: null,
      port: null,
      protocol: null,
      remediation: status === 'confirmed'
        ? 'Applicare patch o mitigazione vendor e rieseguire Nuclei per confermare la chiusura.'
        : 'Confermare prodotto e versione installata prima di pianificare patch o mitigazione.',
      cve: match?.cve_id ? [String(match.cve_id).toUpperCase()] : [],
      cwe: [],
      cvss: asNumber(match?.cvss_score),
      evidence: {
        source: match?.source || null,
        cpe: match?.cpe || null,
        confidence: match?.confidence || null,
        nvd_status: match?.nvd_status || null,
      },
      attribution_confidence: status === 'confirmed' ? 'high' : 'medium',
      created_at: match?.matched_at || input.job?.completed_at || new Date().toISOString(),
    };
  });

  const nucleiReportFindings = (input.nucleiFindings || [])
    .filter((finding) => !(finding?.cve_ids || []).length)
    .map((finding) => ({
      provider: 'nuclei_scan360',
      module: 'nuclei',
      finding_type: `nuclei.${asText(finding?.category || finding?.type, 'finding').toLowerCase()}`,
      title: asText(finding?.label || finding?.name || finding?.template_id, 'Finding Nuclei'),
      description: asText(finding?.evidence, 'Finding tecnico rilevato da Nuclei.'),
      severity: normalizeSeverity(finding?.severityKey || finding?.severity),
      affected_asset: asText(finding?.asset || target, target),
      affected_url: finding?.matched_at || null,
      ip: null,
      port: null,
      protocol: null,
      remediation: 'Analizzare il template Nuclei, correggere la configurazione o vulnerabilita e rieseguire il controllo.',
      cve: [],
      cwe: [],
      cvss: null,
      evidence: {
        template_id: finding?.template_id || null,
        matcher_name: finding?.matcher_name || null,
        extracted_results: finding?.extracted_results || [],
        tags: finding?.tags || [],
      },
      attribution_confidence: 'high',
      created_at: input.job?.completed_at || new Date().toISOString(),
    }));

  return [...cveReportFindings, ...nucleiReportFindings, ...niktoReportFindings, ...portFindings];
};

const buildRecommendations = (input: ReportInput, findings: any[]) => {
  const confirmed = (input.cveMatches || []).filter((match) => (match?.match_status || 'confirmed') === 'confirmed');
  const potential = (input.cveMatches || []).filter((match) => match?.match_status === 'potential');
  const highNikto = (input.niktoFindings || []).filter((finding) => ['critical', 'high', 'medium'].includes(normalizeSeverity(finding?.severity)));
  const exposedPorts = (input.openPorts || []).filter((port) => severityForPort(port?.port, port?.service) !== 'info');
  const affectedAssets = uniq(findings.map((finding) => finding.affected_asset).filter(Boolean)).slice(0, 10);

  return [
    {
      priority: 1,
      title: confirmed.length > 0 ? 'Correggere le CVE confermate da Nuclei' : 'Confermare assenza di CVE tecniche con scansioni ricorrenti',
      rationale: confirmed.length > 0
        ? `${confirmed.length} CVE sono state confermate da template Nuclei sul perimetro LAB.`
        : 'Nessuna CVE confermata: mantenere la validazione ricorrente per intercettare nuove esposizioni.',
      action: confirmed.length > 0
        ? 'Applicare patch vendor o mitigazioni compensative e rieseguire NUCLEI-SCAN360 sullo stesso target.'
        : 'Schedulare scansioni periodiche con profili CVE recenti e confrontare le variazioni dei risultati.',
      affected_assets: affectedAssets,
      severity: confirmed.some((match) => ['critical', 'high'].includes(normalizeSeverity(match?.severity, severityFromCvss(match?.cvss_score)))) ? 'critical' : 'medium',
    },
    {
      priority: 2,
      title: 'Verificare CVE potenziali da versioni e CPE',
      rationale: `${potential.length} CVE potenziali sono state correlate tramite NVD/CPE o tecnologia versionata.`,
      action: 'Validare versione reale, componente installato e configurazione prima di aprire remediation operative.',
      affected_assets: affectedAssets,
      severity: potential.length > 0 ? 'high' : 'low',
    },
    {
      priority: 3,
      title: 'Risolvere finding Nikto di configurazione',
      rationale: `${highNikto.length} finding Nikto richiedono verifica di hardening web server o esposizione applicativa.`,
      action: 'Applicare header/cookie hardening, rimuovere file esposti e validare directory o endpoint segnalati.',
      affected_assets: affectedAssets,
      severity: highNikto.length > 0 ? 'medium' : 'low',
    },
    {
      priority: 4,
      title: 'Ridurre porte e servizi esposti',
      rationale: `${exposedPorts.length} servizi sono esposti con priorita superiore a informativa.`,
      action: 'Chiudere i servizi non necessari, limitare accesso amministrativo via VPN/IP allowlist e documentare eccezioni.',
      affected_assets: affectedAssets,
      severity: exposedPorts.length > 0 ? 'medium' : 'low',
    },
    {
      priority: 5,
      title: 'Rieseguire report dopo remediation',
      rationale: 'Il verdetto unico cambia solo con evidenze tecniche aggiornate dai tre motori.',
      action: 'Rilanciare Nmap/httpx, Nikto e Nuclei dopo ogni remediation e allegare il nuovo report al ticket cliente.',
      affected_assets: affectedAssets,
      severity: 'low',
    },
  ];
};

const buildAssetModuleDetails = (input: ReportInput) => {
  const target = targetHost(input.job);
  const groupedTech = (input.technologies || []).reduce<Record<string, any[]>>((acc, tech) => {
    const host = asText(tech?.asset_host || tech?.url || target, target).replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
    (acc[host] ||= []).push(tech);
    return acc;
  }, {});

  if (Object.keys(groupedTech).length === 0) {
    groupedTech[target] = [];
  }

  return Object.entries(groupedTech).slice(0, 20).map(([asset, technologies]) => ({
    asset,
    asset_type: inferAssetType(asset),
    technologies: technologies.slice(0, 20).map((technology) => ({
      name: asText(technology?.name, 'Tecnologia'),
      version: technology?.version || null,
      category: technology?.category || technology?.source || null,
    })),
  }));
};

const buildObservations = (input: ReportInput): any[] => {
  const job = input.job || {};
  const rawWarnings = [
    ...(Array.isArray(job?.nmap_warnings) ? job.nmap_warnings : []),
    ...(Array.isArray(job?.warnings) ? job.warnings : []),
    ...(Array.isArray(input.nucleiResult?.warnings) ? input.nucleiResult.warnings : []),
  ];
  return [
    {
      provider: 'nuclei_scan360',
      module: 'pipeline',
      title: 'Pipeline LAB multi-engine',
      severity: 'info',
      description: `Stage finale: ${asText(job?.stage || job?.status)}. Nmap/httpx, Nikto e Nuclei sono salvati in Supabase e correlati nel verdetto unico.`,
      raw: {
        nmap_status: job?.nmap_status || null,
        fingerprint_status: job?.fingerprint_status || null,
        nikto_status: job?.nikto_status || null,
        nuclei_status: job?.status || null,
      },
    },
    ...rawWarnings.slice(0, 20).map((warning) => ({
      provider: 'nuclei_scan360',
      module: 'warning',
      title: 'Warning tecnico pipeline',
      severity: 'low',
      description: String(warning),
    })),
  ];
};

const levelLabel = (level: unknown): string => {
  switch (String(level || '').toLowerCase()) {
    case 'critical':
      return 'Critico';
    case 'elevated':
      return 'Elevato';
    case 'watch':
      return 'Monitorare';
    case 'informational':
      return 'Informativo';
    case 'clean':
      return 'Pulito';
    default:
      return 'Non calcolato';
  }
};

export function adaptNucleiScan360JobToSurfaceReport(input: ReportInput): SurfaceScan360Report {
  const job = input.job || {};
  const target = targetLabel(job);
  const host = targetHost(job);
  const verdict = job?.unified_verdict || {};
  const findings = buildFindings(input);
  const cveCatalog = buildCveCatalog(input.cveMatches || []);
  const recommendations = buildRecommendations(input, findings);
  const confirmedCount = (input.cveMatches || []).filter((match) => (match?.match_status || 'confirmed') === 'confirmed').length;
  const potentialCount = (input.cveMatches || []).filter((match) => match?.match_status === 'potential').length;
  const verdictScore = asNumber(verdict?.score);

  return {
    generated_at: new Date().toISOString(),
    organization: {
      id: input.organizationId || job?.organization_id || null,
      name: input.organizationName || 'Cliente LAB',
      legal_name: input.organizationName || 'Cliente LAB',
      hicompliance_enabled: true,
      has_hicompliance: true,
      report_brand_title: 'HICOMPLIANCE · SURFACESCAN360',
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
      job_id: job?.id || null,
      target,
      normalized_target: job?.normalized_target_url || job?.resolved_target_url || target,
      target_type: job?.target_kind || 'mixed_scope',
      scan_profile: `NUCLEI-SCAN360 · Nmap ${job?.nmap_profile || 'service_light'} · Nuclei ${job?.profile || 'web_cve_recent'} · Nikto safe`,
      hosting_context: 'lab_authorized_scope',
      status: job?.status || 'completed',
      started_at: job?.nmap_started_at || job?.started_at || job?.created_at || null,
      completed_at: job?.completed_at || job?.nikto_completed_at || job?.nmap_completed_at || null,
      scope_mode: 'single_or_batch_target',
      scope_jobs_total: 1,
      scope_job_ids: job?.id ? [job.id] : [],
      scope_targets_total: 1,
      scope_targets: [target],
      scope_target_types: [job?.target_kind || 'target'],
      scope_profiles: [job?.profile || 'web_cve_recent'],
    },
    assets_in_scope: [{
      asset_type: job?.target_kind || 'target',
      asset_value: host,
      hostname: host,
      ip: null,
      source: 'nuclei_scan360_lab',
    }],
    findings,
    findings_by_severity: countBySeverity(findings),
    scope_guard_summary: {
      in_scope: 1,
      excluded_by_scope: 0,
      excluded_shared_noise: 0,
      excluded_reasons: {},
    },
    cve_catalog: cveCatalog,
    intel: [],
    observations: buildObservations(input),
    asset_module_details: buildAssetModuleDetails(input),
    monitored_scope: [{
      entry_type: job?.target_kind || 'target',
      input_value: target,
      discovered_via: 'nuclei_scan360_lab',
    }],
    subdomain_dumps: [],
    remediation_tasks: [],
    kev_generation: { created: 0, total_kev: cveCatalog.filter((entry) => entry.cisa_kev).length, existing: 0 },
    ai: {
      executive_summary:
        `NUCLEI-SCAN360 ha eseguito Nmap/httpx, Nikto e Nuclei sul target autorizzato ${target}. ` +
        `Risultato: ${input.openPorts.length} porte aperte, ${input.technologies.length} tecnologie rilevate, ` +
        `${input.niktoFindings.length} finding Nikto, ${confirmedCount} CVE confermate e ${potentialCount} CVE potenziali. ` +
        `Il verdetto unico e ${levelLabel(verdict?.level)}; 0 CVE significa nessun match confermato/potenziale nella pipeline, non assenza assoluta di vulnerabilita.`,
      risk_score: verdictScore,
      risk_level: levelLabel(verdict?.level),
      top_recommendations: recommendations,
      correlations: [
        'Nmap/httpx definisce superficie e tecnologie; Nikto evidenzia hardening e misconfiguration; Nuclei valida CVE tecniche.',
        'Le CVE potenziali da NVD/CPE richiedono conferma di prodotto e versione prima di essere trattate come vulnerabilita provate.',
        ...(Array.isArray(verdict?.reasons) ? verdict.reasons.slice(0, 5) : []),
      ],
      compliance_notes: 'Report LAB normalizzato sul template SurfaceScan360 per uso operativo multi-cliente. Nikto non conferma CVE: contribuisce al verdetto come evidenza di esposizione o configurazione.',
    },
    ai_error: null,
  };
}
