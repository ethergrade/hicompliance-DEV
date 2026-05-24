import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import {
  assertCustomerAccess,
  corsHeaders,
  getCallerProfile,
  makeSupabaseClients,
} from '../_shared/surface-scan-utils.ts';
import { maskPotentialSecrets, normalizeText } from '../_shared/darkrisk-utils.ts';

type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';
type Confidence = 'low' | 'medium' | 'high';
type Priority = 'immediate' | 'short_term' | 'mid_term' | 'long_term';
type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

type FindingRow = {
  id: string;
  finding_type: string | null;
  title: string | null;
  description: string | null;
  severity: Severity | null;
  confidence: Confidence | null;
  risk_score: number | null;
  risk_dimensions: Record<string, number> | null;
  evidence_ids: string[] | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  metadata: Record<string, unknown> | null;
  status: string | null;
  affected_asset_id: string | null;
};

type AssetRow = {
  id: string;
  value: string | null;
  normalized_value: string | null;
};

type EvidenceRow = {
  id: string;
  title: string | null;
  summary: string | null;
  masked_value: string | null;
};

type RecommendationFinding = {
  id: string;
  finding_type: string;
  title: string;
  description: string;
  severity: Severity;
  confidence: Confidence;
  risk_score: number;
  risk_dimensions: Record<string, number>;
  affected_asset_masked?: string;
  evidence_summary: string[];
  first_seen_at: string;
  last_seen_at: string;
  compromise_type: 'direct' | 'indirect' | 'potential' | 'misconfiguration' | 'unknown';
  remediation_status: string;
};

type RecommendationInput = {
  report_id?: string;
  customer: {
    id: string;
    display_name: string;
    industry?: string;
    tier: 'standard' | 'extended';
  };
  scan_run: {
    id: string;
    started_at: string;
    completed_at: string;
    sources: string[];
  };
  coverage: {
    domains_count: number;
    selectors_count: number;
    intelx_queries_count: number;
    surfacescan_assets_count: number;
    limitations: string[];
  };
  findings: RecommendationFinding[];
  requested_sections: Array<'executive_summary' | 'recommendations' | 'technical_notes' | 'limitations'>;
};

type RecommendationOutput = {
  summary: {
    risk_level: RiskLevel;
    executive_text: string;
    top_drivers: string[];
    coverage_note: string;
  };
  recommendations: Array<{
    finding_id: string;
    title: string;
    priority: Priority;
    why_it_matters: string;
    actions: string[];
    expected_outcome: string;
    confidence: Confidence;
  }>;
  limitations: string[];
  confidence_note: string;
};

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || '';
const OPENAI_RECOMMENDATION_MODEL = Deno.env.get('OPENAI_RECOMMENDATION_MODEL') || 'gpt-4o-mini';
const OPENAI_PROMPT_VERSION = Deno.env.get('OPENAI_RECOMMENDATION_PROMPT_VERSION') || 'darkrisk360-reco-v1';
const OPENAI_SCHEMA_VERSION = Deno.env.get('OPENAI_RECOMMENDATION_SCHEMA_VERSION') || '1.0.0';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const INTERNAL_SECRET = Deno.env.get('DARKRISK360_INTERNAL_SECRET') || '';

const recommendationSchema = {
  name: 'darkrisk360_recommendations',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['summary', 'recommendations', 'limitations', 'confidence_note'],
    properties: {
      summary: {
        type: 'object',
        additionalProperties: false,
        required: ['risk_level', 'executive_text', 'top_drivers', 'coverage_note'],
        properties: {
          risk_level: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
          executive_text: { type: 'string' },
          top_drivers: { type: 'array', items: { type: 'string' }, maxItems: 5 },
          coverage_note: { type: 'string' },
        },
      },
      recommendations: {
        type: 'array',
        maxItems: 20,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['finding_id', 'title', 'priority', 'why_it_matters', 'actions', 'expected_outcome', 'confidence'],
          properties: {
            finding_id: { type: 'string' },
            title: { type: 'string' },
            priority: { type: 'string', enum: ['immediate', 'short_term', 'mid_term', 'long_term'] },
            why_it_matters: { type: 'string' },
            actions: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 8 },
            expected_outcome: { type: 'string' },
            confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
          },
        },
      },
      limitations: {
        type: 'array',
        items: { type: 'string' },
      },
      confidence_note: { type: 'string' },
    },
  },
} as const;

const severityRank: Record<Severity, number> = {
  info: 1,
  low: 2,
  medium: 3,
  high: 4,
  critical: 5,
};

const forbiddenPatterns: RegExp[] = [
  /\b(password|passwd|pwd)\b\s*[:=]/i,
  /\b(token|api[_-]?key|secret|bearer)\b\s*[:=]/i,
  /\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/, // jwt-like
  /\bsk-[A-Za-z0-9]{16,}\b/i,
];

const fallbackActionsByType: Array<{ pattern: RegExp; actions: string[]; why: string }> = [
  {
    pattern: /credential_leak_confirmed|stealer|identity|password|credenzial/i,
    actions: [
      'Forzare reset password degli account impattati e revocare sessioni attive.',
      'Abilitare MFA obbligatorio sui servizi critici.',
      'Verificare accessi anomali negli ultimi 30 giorni e applicare hardening IAM.',
    ],
    why: 'La presenza di indicatori su credenziali aumenta il rischio di accesso non autorizzato e abuso account.',
  },
  {
    pattern: /dmarc_missing|dmarc|spf|dkim|mail/i,
    actions: [
      'Pubblicare/aggiornare DMARC con reporting (rua) e percorso graduale verso p=quarantine/reject.',
      'Allineare SPF ai soli sender autorizzati, evitando configurazioni permissive.',
      'Verificare selector DKIM attivi e firma corretta per i flussi in uscita.',
    ],
    why: 'Le misconfigurazioni del canale email favoriscono spoofing, phishing e perdita di fiducia del dominio.',
  },
  {
    pattern: /ftp_exposed|ssh_exposed|open_port|port|service|rdp|smb|telnet/i,
    actions: [
      'Limitare esposizione Internet ai soli servizi indispensabili e chiudere le porte non necessarie.',
      'Proteggere accessi amministrativi con VPN/ZTNA, allowlist IP e MFA.',
      'Applicare patching e hardening su servizi esposti con monitoraggio continuo.',
    ],
    why: 'Servizi esposti ampliano la superficie di attacco e facilitano tentativi di intrusione esterna.',
  },
  {
    pattern: /tls|ssl|hsts|certificate|http_security|header/i,
    actions: [
      'Abilitare configurazioni TLS moderne e rimuovere protocolli/cipher obsoleti.',
      'Forzare HTTPS con HSTS e header di sicurezza coerenti.',
      'Verificare validità certificati e corretta configurazione SAN/SNI.',
    ],
    why: 'Debolezze TLS/HTTP espongono il traffico a intercettazione, downgrade e manipolazione.',
  },
  {
    pattern: /.*/,
    actions: [
      'Validare il finding con owner tecnico e definire azione correttiva misurabile.',
      'Pianificare remediation con priorità e scadenza secondo severità/rischio.',
      'Verificare efficacia della fix con nuova scansione e controllo regressioni.',
    ],
    why: 'Il finding rappresenta una deviazione di sicurezza che richiede trattamento strutturato e verificabile.',
  },
];

const systemPrompt = [
  'Sei un consulente senior di Cyber Threat Intelligence per HiSolution.',
  'Generi raccomandazioni per il modulo DarkRisk360.',
  'Usa solo i finding forniti nel JSON: non inventare evidenze o finding nuovi.',
  'Non citare password, token, cookie, segreti o dati personali non necessari.',
  'Non dichiarare breach diretto se compromise_type non è direct.',
  'Per evidenza indiretta o terza parte, esplicitalo in modo prudente.',
  'Scrivi in italiano professionale, chiaro, per CIO/CISO/IT Manager.',
  'Restituisci esclusivamente JSON valido conforme allo schema fornito.',
].join(' ');

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function capText(value: string, max = 1200): string {
  return normalizeText(value).slice(0, max);
}

function sanitizeText(value: string, max = 1200): string {
  return capText(maskPotentialSecrets(value), max);
}

function parseArray<T = string>(value: unknown): T[] {
  if (!Array.isArray(value)) return [];
  return value as T[];
}

function normalizeSeverity(value: string | null | undefined): Severity {
  const normalized = String(value || 'info').toLowerCase();
  if (normalized === 'critical') return 'critical';
  if (normalized === 'high') return 'high';
  if (normalized === 'medium') return 'medium';
  if (normalized === 'low') return 'low';
  return 'info';
}

function normalizeConfidence(value: string | null | undefined): Confidence {
  const normalized = String(value || 'medium').toLowerCase();
  if (normalized === 'high') return 'high';
  if (normalized === 'low') return 'low';
  return 'medium';
}

function normalizePriorityFromSeverity(severity: Severity): Priority {
  if (severity === 'critical' || severity === 'high') return 'immediate';
  if (severity === 'medium') return 'short_term';
  if (severity === 'low') return 'mid_term';
  return 'long_term';
}

function normalizeRiskLevel(findings: RecommendationFinding[]): RiskLevel {
  const maxRank = findings.reduce((acc, item) => Math.max(acc, severityRank[item.severity]), 1);
  if (maxRank >= severityRank.critical) return 'critical';
  if (maxRank >= severityRank.high) return 'high';
  if (maxRank >= severityRank.medium) return 'medium';
  return 'low';
}

function detectForbiddenText(value: string): boolean {
  const text = String(value || '');
  return forbiddenPatterns.some((pattern) => pattern.test(text));
}

function assertNoSecrets(value: unknown): void {
  const serialized = JSON.stringify(value);
  if (detectForbiddenText(serialized)) {
    throw new Error('Sensitive pattern detected in sanitized payload/output');
  }
}

function dedupeStrings(values: string[], max = 8): string[] {
  const set = new Set<string>();
  for (const raw of values) {
    const candidate = sanitizeText(raw, 220);
    if (!candidate) continue;
    set.add(candidate);
    if (set.size >= max) break;
  }
  return Array.from(set);
}

function inferCompromiseType(metadata: Record<string, unknown> | null | undefined): RecommendationFinding['compromise_type'] {
  const candidate = String(metadata?.compromise_type || '').toLowerCase();
  if (candidate === 'direct') return 'direct';
  if (candidate === 'indirect') return 'indirect';
  if (candidate === 'potential') return 'potential';
  if (candidate === 'misconfiguration') return 'misconfiguration';
  return 'unknown';
}

function buildCoverageNote(coverage: RecommendationInput['coverage']): string {
  const limitations = coverage.limitations.length ? ` Limitazioni: ${coverage.limitations.join('; ')}.` : '';
  return `Copertura: ${coverage.domains_count} domini, ${coverage.selectors_count} selector, ${coverage.surfacescan_assets_count} asset SurfaceScan, ${coverage.intelx_queries_count} query IntelX.${limitations}`;
}

function buildDeterministicOutput(input: RecommendationInput): RecommendationOutput {
  const findingsSorted = [...input.findings].sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0)).slice(0, 20);

  const recommendations = findingsSorted.map((finding) => {
    const match = fallbackActionsByType.find((entry) => entry.pattern.test(`${finding.finding_type} ${finding.title}`)) || fallbackActionsByType[fallbackActionsByType.length - 1];

    const actions = dedupeStrings(match.actions, 6);
    return {
      finding_id: finding.id,
      title: sanitizeText(finding.title || 'Azione di remediation consigliata', 120),
      priority: normalizePriorityFromSeverity(finding.severity),
      why_it_matters: sanitizeText(match.why, 400),
      actions,
      expected_outcome: sanitizeText('Riduzione misurabile del rischio sull’asset impattato e miglioramento della postura complessiva.', 260),
      confidence: finding.confidence,
    };
  });

  const topDrivers = findingsSorted
    .slice(0, 5)
    .map((finding) => sanitizeText(`${finding.title} (${finding.severity})`, 120));

  const riskLevel = normalizeRiskLevel(findingsSorted);

  return {
    summary: {
      risk_level: riskLevel,
      executive_text: sanitizeText(
        `L'analisi DarkRisk360 ha prodotto ${input.findings.length} finding con priorità focalizzata su remediation tracciabili per ridurre esposizione e rischio operativo.`,
        500,
      ),
      top_drivers: topDrivers,
      coverage_note: sanitizeText(buildCoverageNote(input.coverage), 500),
    },
    recommendations,
    limitations: dedupeStrings(input.coverage.limitations, 12),
    confidence_note: sanitizeText(
      'Output generato in fallback deterministico: validare i finding più critici con il team tecnico prima della chiusura.',
      300,
    ),
  };
}

function parseResponseContent(data: any): string {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const text = content
      .map((item) => (typeof item?.text === 'string' ? item.text : ''))
      .join('')
      .trim();
    if (text) return text;
  }
  throw new Error('OpenAI response content missing');
}

function validateOutputShape(raw: any, validFindingIds: Set<string>): RecommendationOutput {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid output object');

  const summary = raw.summary || {};
  const riskLevel = String(summary.risk_level || 'medium').toLowerCase();
  if (!['low', 'medium', 'high', 'critical'].includes(riskLevel)) {
    throw new Error('Invalid summary.risk_level');
  }

  const recommendations = Array.isArray(raw.recommendations) ? raw.recommendations : [];
  const normalizedRecommendations: RecommendationOutput['recommendations'] = [];

  for (const item of recommendations) {
    const findingId = String(item?.finding_id || '').trim();
    if (!findingId || !validFindingIds.has(findingId)) continue;

    const priority = String(item?.priority || '').toLowerCase();
    if (!['immediate', 'short_term', 'mid_term', 'long_term'].includes(priority)) continue;

    const confidence = String(item?.confidence || '').toLowerCase();
    if (!['low', 'medium', 'high'].includes(confidence)) continue;

    const actions = dedupeStrings(parseArray<string>(item?.actions), 8);
    if (actions.length === 0) continue;

    normalizedRecommendations.push({
      finding_id: findingId,
      title: sanitizeText(String(item?.title || 'Raccomandazione'), 140),
      priority: priority as Priority,
      why_it_matters: sanitizeText(String(item?.why_it_matters || ''), 600),
      actions,
      expected_outcome: sanitizeText(String(item?.expected_outcome || ''), 400),
      confidence: confidence as Confidence,
    });

    if (normalizedRecommendations.length >= 20) break;
  }

  if (normalizedRecommendations.length === 0) {
    throw new Error('No valid recommendations produced');
  }

  const limitations = dedupeStrings(parseArray<string>(raw.limitations), 12);

  const output: RecommendationOutput = {
    summary: {
      risk_level: riskLevel as RiskLevel,
      executive_text: sanitizeText(String(summary.executive_text || ''), 800),
      top_drivers: dedupeStrings(parseArray<string>(summary.top_drivers), 5),
      coverage_note: sanitizeText(String(summary.coverage_note || ''), 600),
    },
    recommendations: normalizedRecommendations,
    limitations,
    confidence_note: sanitizeText(String(raw.confidence_note || ''), 400),
  };

  assertNoSecrets(output);
  return output;
}

async function callOpenAi(input: RecommendationInput, timeoutMs = 35000): Promise<RecommendationOutput> {
  const cleanKey = OPENAI_API_KEY.trim().replace(/[^\x20-\x7E]/g, '');
  if (!cleanKey) throw new Error('OPENAI_API_KEY missing/invalid');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const userPrompt = [
    'Genera executive summary e raccomandazioni operative per questo scan DarkRisk360.',
    'Rispetta il tier indicato. Per standard: sintesi manageriale. Per extended: più contesto tecnico, senza segreti.',
    'Input JSON sanitizzato:',
    JSON.stringify(input),
  ].join('\n\n');

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${cleanKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_RECOMMENDATION_MODEL,
        temperature: 0.1,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: recommendationSchema,
        },
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`OpenAI ${res.status}: ${txt.slice(0, 300)}`);
    }

    const json = await res.json();
    const rawContent = parseResponseContent(json);
    const parsed = JSON.parse(rawContent);
    const validFindingIds = new Set(input.findings.map((item) => item.id));
    return validateOutputShape(parsed, validFindingIds);
  } finally {
    clearTimeout(timeout);
  }
}

async function loadRecommendationInput(adminClient: any, params: {
  organizationId: string;
  scanRunId: string;
  tier: 'standard' | 'extended';
}): Promise<{ input: RecommendationInput; findingEvidenceMap: Map<string, string[]>; evidenceIdsByFinding: Map<string, string[]> }> {
  const { organizationId, scanRunId, tier } = params;

  const [{ data: orgRow, error: orgErr }, { data: runRow, error: runErr }, { data: findingRows, error: findingErr }] = await Promise.all([
    adminClient
      .from('organizations' as any)
      .select('id, name')
      .eq('id', organizationId)
      .maybeSingle(),
    adminClient
      .from('darkrisk_scan_runs' as any)
      .select('id, started_at, completed_at, sources, stats')
      .eq('id', scanRunId)
      .eq('organization_id', organizationId)
      .maybeSingle(),
    adminClient
      .from('darkrisk_findings' as any)
      .select('id, finding_type, title, description, severity, confidence, risk_score, risk_dimensions, evidence_ids, first_seen_at, last_seen_at, metadata, status, affected_asset_id')
      .eq('organization_id', organizationId)
      .eq('scan_run_id', scanRunId)
      .order('risk_score', { ascending: false })
      .limit(250),
  ]);

  if (orgErr) throw orgErr;
  if (runErr) throw runErr;
  if (findingErr) throw findingErr;

  if (!runRow?.id) {
    throw new Error('Scan run not found for organization');
  }

  const findings = (findingRows || []) as FindingRow[];
  if (findings.length === 0) {
    throw new Error('No findings available for recommendation generation');
  }

  const assetIds = Array.from(new Set(findings.map((row) => normalizeText(row.affected_asset_id)).filter(Boolean)));
  const evidenceIds = Array.from(
    new Set(
      findings.flatMap((row) => parseArray<string>(row.evidence_ids).map((entry) => normalizeText(entry))).filter(Boolean),
    ),
  );

  const [assetsRes, evidenceRes, sourceSummaryRes, selectorCountRes] = await Promise.all([
    assetIds.length > 0
      ? adminClient
          .from('darkrisk_assets' as any)
          .select('id, value, normalized_value')
          .eq('organization_id', organizationId)
          .in('id', assetIds)
      : Promise.resolve({ data: [], error: null }),
    evidenceIds.length > 0
      ? adminClient
          .from('darkrisk_evidence' as any)
          .select('id, title, summary, masked_value')
          .eq('organization_id', organizationId)
          .in('id', evidenceIds)
      : Promise.resolve({ data: [], error: null }),
    adminClient
      .from('darkrisk_source_records' as any)
      .select('source, asset_id, selector_id', { count: 'exact' })
      .eq('organization_id', organizationId)
      .eq('scan_run_id', scanRunId),
    adminClient
      .from('darkrisk_selectors' as any)
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId),
  ]);

  if ((assetsRes as any).error) throw (assetsRes as any).error;
  if ((evidenceRes as any).error) throw (evidenceRes as any).error;
  if (sourceSummaryRes.error) throw sourceSummaryRes.error;
  if (selectorCountRes.error) throw selectorCountRes.error;

  const assetMap = new Map<string, string>();
  for (const row of (((assetsRes as any).data || []) as AssetRow[])) {
    const label = sanitizeText(String(row.normalized_value || row.value || ''), 180);
    if (!label) continue;
    assetMap.set(String(row.id), label);
  }

  const evidenceMap = new Map<string, EvidenceRow>();
  for (const row of (((evidenceRes as any).data || []) as EvidenceRow[])) {
    evidenceMap.set(String(row.id), row);
  }

  const evidenceIdsByFinding = new Map<string, string[]>();
  const findingEvidenceMap = new Map<string, string[]>();

  const sanitizedFindings: RecommendationFinding[] = findings.map((row) => {
    const findingId = String(row.id);
    const rawEvidenceIds = parseArray<string>(row.evidence_ids).map((id) => String(id));
    evidenceIdsByFinding.set(findingId, rawEvidenceIds);

    const evidenceSummary = dedupeStrings(
      rawEvidenceIds.flatMap((evidenceId) => {
        const evidence = evidenceMap.get(evidenceId);
        if (!evidence) return [];
        return [
          sanitizeText(String(evidence.title || ''), 160),
          sanitizeText(String(evidence.summary || ''), 200),
          sanitizeText(String(evidence.masked_value || ''), 120),
        ].filter(Boolean);
      }),
      4,
    );

    findingEvidenceMap.set(findingId, evidenceSummary);

    return {
      id: findingId,
      finding_type: sanitizeText(String(row.finding_type || 'finding'), 80),
      title: sanitizeText(String(row.title || row.finding_type || 'Finding'), 140),
      description: sanitizeText(String(row.description || ''), 600),
      severity: normalizeSeverity(row.severity),
      confidence: normalizeConfidence(row.confidence),
      risk_score: Number(row.risk_score || 0),
      risk_dimensions: (row.risk_dimensions || {}) as Record<string, number>,
      affected_asset_masked: assetMap.get(String(row.affected_asset_id || '')),
      evidence_summary: evidenceSummary,
      first_seen_at: String(row.first_seen_at || runRow.started_at || new Date().toISOString()),
      last_seen_at: String(row.last_seen_at || runRow.completed_at || new Date().toISOString()),
      compromise_type: inferCompromiseType(row.metadata),
      remediation_status: sanitizeText(String(row.status || 'new'), 40),
    };
  });

  const sourceRows = (sourceSummaryRes.data || []) as Array<{ source: string | null; asset_id: string | null; selector_id: string | null }>;
  const sourceSet = new Set(sourceRows.map((row) => normalizeText(row.source)).filter(Boolean));
  const domainAssetIds = new Set(
    sourceRows
      .map((row) => normalizeText(row.asset_id))
      .filter(Boolean),
  );

  const intelxCount = sourceRows.filter((row) => normalizeText(row.source) === 'intelx').length;
  const surfaceCount = sourceRows.filter((row) => normalizeText(row.source) === 'surfacescan360').length;

  const limitations = ['Analisi basata esclusivamente su finding ed evidenze normalizzate persistite.'];
  if (tier === 'standard') {
    limitations.push('Tier standard: dettaglio tecnico ridotto e nessuna esposizione raw evidence.');
  }
  if (intelxCount === 0) {
    limitations.push('Nessuna evidenza IntelX nel run corrente.');
  }

  const input: RecommendationInput = {
    customer: {
      id: organizationId,
      display_name: sanitizeText(String(orgRow?.name || organizationId), 120),
      tier,
    },
    scan_run: {
      id: scanRunId,
      started_at: String(runRow.started_at || new Date().toISOString()),
      completed_at: String(runRow.completed_at || runRow.started_at || new Date().toISOString()),
      sources: Array.from(sourceSet),
    },
    coverage: {
      domains_count: domainAssetIds.size,
      selectors_count: Number(selectorCountRes.count || 0),
      intelx_queries_count: intelxCount,
      surfacescan_assets_count: surfaceCount,
      limitations,
    },
    findings: sanitizedFindings,
    requested_sections: ['executive_summary', 'recommendations', 'technical_notes', 'limitations'],
  };

  assertNoSecrets(input);
  return { input, findingEvidenceMap, evidenceIdsByFinding };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
  }

  const startedAt = new Date().toISOString();

  try {
    const { userClient, adminClient } = makeSupabaseClients(req);

    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const internalHeaderSecret = req.headers.get('x-darkrisk-internal-secret') || '';
    const isInternal = (SERVICE_ROLE && token === SERVICE_ROLE) || (INTERNAL_SECRET && internalHeaderSecret === INTERNAL_SECRET);

    const body = await req.json().catch(() => ({}));
    const requestedCustomerId = normalizeText(body?.customer_id || body?.organization_id);
    const requestedScanRunId = normalizeText(body?.scan_run_id);

    let customerId = requestedCustomerId;
    let actorUserId: string | null = isInternal ? normalizeText(body?.actor_user_id) || null : null;

    if (!isInternal) {
      const { data: authData, error: authError } = await userClient.auth.getUser();
      if (authError || !authData.user) {
        return jsonResponse({ ok: false, error: 'Unauthorized' }, 401);
      }

      const caller = await getCallerProfile(adminClient, authData.user.id);
      actorUserId = authData.user.id;
      customerId = requestedCustomerId || caller.organizationId || '';
      if (!customerId) {
        return jsonResponse({ ok: false, error: 'customer_id is required' }, 400);
      }
      assertCustomerAccess(caller, customerId);
    }

    if (!customerId && requestedScanRunId) {
      const { data: byRun } = await adminClient
        .from('darkrisk_scan_runs' as any)
        .select('organization_id')
        .eq('id', requestedScanRunId)
        .maybeSingle();
      customerId = normalizeText(byRun?.organization_id);
    }

    if (!customerId) {
      return jsonResponse({ ok: false, error: 'customer_id or scan_run_id is required' }, 400);
    }

    const entitlementRes = await adminClient
      .from('darkrisk_entitlements' as any)
      .select('enabled, tier, enable_ai_recommendations')
      .eq('organization_id', customerId)
      .maybeSingle();

    if (entitlementRes.error) {
      const missingTable = String((entitlementRes.error as any)?.code || '') === '42P01';
      if (missingTable) {
        return jsonResponse({ ok: false, error: 'darkrisk_entitlements table missing. Apply migrations first.' }, 412);
      }
      throw entitlementRes.error;
    }

    const entitlement = entitlementRes.data as { enabled?: boolean; tier?: string; enable_ai_recommendations?: boolean } | null;
    if (!entitlement?.enabled) {
      return jsonResponse({ ok: false, error: 'DarkRisk360 not enabled for customer' }, 403);
    }

    const aiEnabled = entitlement.enable_ai_recommendations !== false;

    const scanRunRes = requestedScanRunId
      ? await adminClient
          .from('darkrisk_scan_runs' as any)
          .select('id, status, organization_id, stats')
          .eq('id', requestedScanRunId)
          .eq('organization_id', customerId)
          .maybeSingle()
      : await adminClient
          .from('darkrisk_scan_runs' as any)
          .select('id, status, organization_id, stats')
          .eq('organization_id', customerId)
          .in('status', ['completed', 'completed_with_warnings'])
          .order('completed_at', { ascending: false })
          .limit(1)
          .maybeSingle();

    if (scanRunRes.error) throw scanRunRes.error;
    if (!scanRunRes.data?.id) {
      return jsonResponse({ ok: false, error: 'No completed darkrisk scan run found' }, 404);
    }

    const scanRunId = String(scanRunRes.data.id);
    const tier = String(entitlement.tier || 'standard').toLowerCase() === 'extended' ? 'extended' : 'standard';

    const { input, evidenceIdsByFinding } = await loadRecommendationInput(adminClient, {
      organizationId: customerId,
      scanRunId,
      tier,
    });

    const fallbackOutput = buildDeterministicOutput(input);

    let output: RecommendationOutput = fallbackOutput;
    let generationMode: 'openai' | 'deterministic_fallback' = 'deterministic_fallback';
    let generationError: string | null = null;

    if (aiEnabled && OPENAI_API_KEY.trim()) {
      try {
        output = await callOpenAi(input);
        generationMode = 'openai';
      } catch (error: any) {
        generationError = sanitizeText(error?.message || 'OpenAI generation failed', 280);
      }
    } else if (!aiEnabled) {
      generationError = 'AI recommendations disabled by entitlement';
    } else {
      generationError = 'OPENAI_API_KEY missing';
    }

    assertNoSecrets(output);

    const findingIds = Array.from(new Set(output.recommendations.map((entry) => entry.finding_id)));

    if (findingIds.length > 0) {
      const { error: deleteErr } = await adminClient
        .from('darkrisk_recommendations' as any)
        .delete()
        .eq('organization_id', customerId)
        .eq('source', 'openai')
        .in('finding_id', findingIds);
      if (deleteErr) throw deleteErr;
    }

    const recommendationRows = output.recommendations.map((entry) => {
      const groundedIds = evidenceIdsByFinding.get(entry.finding_id) || [];
      return {
        organization_id: customerId,
        tenant_id: customerId,
        finding_id: entry.finding_id,
        source: 'openai',
        title: sanitizeText(entry.title, 200),
        priority: entry.priority,
        why_it_matters: sanitizeText(entry.why_it_matters, 1000),
        actions: entry.actions,
        expected_outcome: sanitizeText(entry.expected_outcome, 600),
        confidence: entry.confidence,
        model: OPENAI_RECOMMENDATION_MODEL,
        prompt_version: OPENAI_PROMPT_VERSION,
        output_schema_version: OPENAI_SCHEMA_VERSION,
        grounded_on_evidence_ids: groundedIds,
        metadata: {
          mode: generationMode,
          summary: output.summary,
          limitations: output.limitations,
          confidence_note: output.confidence_note,
          generated_at: new Date().toISOString(),
          fallback_reason: generationError,
        },
      };
    });

    if (recommendationRows.length > 0) {
      const { error: insertErr } = await adminClient
        .from('darkrisk_recommendations' as any)
        .insert(recommendationRows as any);
      if (insertErr) throw insertErr;
    }

    const mergedStats = {
      ...(scanRunRes.data?.stats || {}),
      ai_recommendations: {
        mode: generationMode,
        total: recommendationRows.length,
        generated_at: new Date().toISOString(),
        model: OPENAI_RECOMMENDATION_MODEL,
        prompt_version: OPENAI_PROMPT_VERSION,
        schema_version: OPENAI_SCHEMA_VERSION,
        risk_level: output.summary.risk_level,
        top_drivers: output.summary.top_drivers,
        limitations: output.limitations,
        confidence_note: output.confidence_note,
        error: generationError,
      },
    };

    const { error: runUpdateErr } = await adminClient
      .from('darkrisk_scan_runs' as any)
      .update({ stats: mergedStats })
      .eq('id', scanRunId)
      .eq('organization_id', customerId);

    if (runUpdateErr) throw runUpdateErr;

    await adminClient
      .from('darkrisk_audit_log' as any)
      .insert({
        organization_id: customerId,
        tenant_id: customerId,
        actor_id: actorUserId || null,
        action: 'darkrisk_ai_recommendations_generated',
        entity_type: 'darkrisk_scan_run',
        entity_id: scanRunId,
        reason: generationMode === 'openai' ? 'openai_generation' : 'deterministic_fallback',
        metadata: {
          mode: generationMode,
          total_recommendations: recommendationRows.length,
          model: OPENAI_RECOMMENDATION_MODEL,
          prompt_version: OPENAI_PROMPT_VERSION,
          schema_version: OPENAI_SCHEMA_VERSION,
          warning: generationError ? sanitizeText(generationError, 280) : null,
        },
      });

    return jsonResponse({
      ok: true,
      customer_id: customerId,
      scan_run_id: scanRunId,
      mode: generationMode,
      generated_at: new Date().toISOString(),
      total_recommendations: recommendationRows.length,
      summary: output.summary,
      limitations: output.limitations,
      confidence_note: output.confidence_note,
      warning: generationError,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
    });
  } catch (error: any) {
    return jsonResponse({
      ok: false,
      error: normalizeText(error?.message) || 'Internal error',
      started_at: startedAt,
      completed_at: new Date().toISOString(),
    }, 500);
  }
});
