import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import {
  assertCustomerAccess,
  corsHeaders,
  getCallerProfile,
  makeSupabaseClients,
} from '../_shared/surface-scan-utils.ts';
import {
  mapSurfaceSeverity,
  maskPotentialSecrets,
  normalizeAssetValue,
  normalizeText,
} from '../_shared/darkrisk-utils.ts';
import {
  calculateFindingRiskScore,
  inferCompromiseType,
  inferRiskDimensions,
} from '../_shared/darkrisk-scoring.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

type SurfaceAssetRow = {
  id: string;
  asset_type: string | null;
  asset_value: string | null;
  source: string | null;
  raw: Record<string, unknown> | null;
};

type SurfaceFindingRow = {
  id: string;
  finding_type: string | null;
  title: string | null;
  description: string | null;
  severity: string | null;
  module: string | null;
  affected_asset: string | null;
  affected_url: string | null;
  status: string | null;
  evidence: Record<string, unknown> | null;
  created_at: string | null;
};

type ExposureFindingRow = {
  id: string;
  finding_type: string | null;
  title: string | null;
  description: string | null;
  severity: string | null;
  source: string | null;
  affected_host: string | null;
  affected_url: string | null;
  status: string | null;
  evidence: string | null;
  raw: Record<string, unknown> | null;
  created_at: string | null;
};

type CanonicalFinding = {
  origin: 'surface_findings' | 'surface_exposure_findings';
  source_id: string;
  finding_type: string;
  title: string;
  description: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  module: string;
  status: string;
  affected_asset: string;
  created_at: string | null;
  payload: Record<string, unknown>;
};

function daysSince(value: string | null | undefined): number | null {
  const parsed = Date.parse(String(value || ''));
  if (!Number.isFinite(parsed)) return null;
  const diff = Date.now() - parsed;
  if (!Number.isFinite(diff) || diff < 0) return 0;
  return Math.round(diff / (1000 * 60 * 60 * 24));
}

function inferAssetCriticality(input: string): 'low' | 'medium' | 'high' {
  const text = normalizeText(input).toLowerCase();
  if (!text) return 'medium';
  if (/admin|login|vpn|gateway|mail|mx|auth|panel|firewall|domain controller/.test(text)) return 'high';
  if (/staging|dev|test|sandbox/.test(text)) return 'low';
  return 'medium';
}

function inferConfidence(finding: CanonicalFinding): 'low' | 'medium' | 'high' {
  const text = `${finding.finding_type} ${finding.title} ${finding.module}`.toLowerCase();
  if (/cve|credential|verified|critical|high/.test(text)) return 'high';
  if (/candidate|possible|unknown/.test(text)) return 'low';
  return 'medium';
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}

function resolveAssetType(value: string): string {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return 'unknown';
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized)) return 'ip';
  if (normalized.includes('/')) return 'cidr';
  if (normalized.includes('@')) return 'email';
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) return 'url';
  const labels = normalized.split('.').filter(Boolean);
  if (labels.length >= 3) return 'subdomain';
  if (labels.length === 2) return 'domain';
  return 'host';
}

function normalizeSurfaceFinding(row: SurfaceFindingRow): CanonicalFinding {
  const affected = normalizeText(row.affected_asset) || normalizeText(row.affected_url);
  return {
    origin: 'surface_findings',
    source_id: row.id,
    finding_type: normalizeText(row.finding_type) || 'surface_finding',
    title: normalizeText(row.title) || normalizeText(row.finding_type) || 'Surface finding',
    description: normalizeText(row.description),
    severity: mapSurfaceSeverity(row.severity),
    module: normalizeText(row.module) || 'surface_scan_engine',
    status: normalizeText(row.status) || 'new',
    affected_asset: affected,
    created_at: row.created_at,
    payload: {
      evidence: row.evidence || {},
      module: row.module,
      affected_url: row.affected_url,
      affected_asset: row.affected_asset,
    },
  };
}

function normalizeExposureFinding(row: ExposureFindingRow): CanonicalFinding {
  const affected = normalizeText(row.affected_host) || normalizeText(row.affected_url);
  return {
    origin: 'surface_exposure_findings',
    source_id: row.id,
    finding_type: normalizeText(row.finding_type) || 'surface_exposure_finding',
    title: normalizeText(row.title) || normalizeText(row.finding_type) || 'Surface exposure finding',
    description: normalizeText(row.description),
    severity: mapSurfaceSeverity(row.severity),
    module: normalizeText(row.source) || 'surface_exposure_engine',
    status: normalizeText(row.status) || 'new',
    affected_asset: affected,
    created_at: row.created_at,
    payload: {
      evidence: row.evidence,
      raw: row.raw || {},
      affected_host: row.affected_host,
      affected_url: row.affected_url,
    },
  };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const startedAt = new Date().toISOString();
  let scanRunId: string | null = null;

  try {
    const { userClient, adminClient } = makeSupabaseClients(req);
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const requestedCustomerId = normalizeText(body?.customer_id);
    const requestedScanJobId = normalizeText(body?.scan_job_id);
    const triggerType = normalizeText(body?.trigger_type) || 'manual';

    const caller = await getCallerProfile(adminClient, authData.user.id);
    const customerId = requestedCustomerId || caller.organizationId || '';
    if (!customerId) return jsonResponse({ error: 'customer_id is required' }, 400);
    assertCustomerAccess(caller, customerId);

    const entitlementRes = await adminClient
      .from('darkrisk_entitlements' as any)
      .select('id, enabled, tier, enable_ai_recommendations')
      .eq('organization_id', customerId)
      .maybeSingle();

    if (entitlementRes.error) {
      const missingTable = String((entitlementRes.error as any)?.code || '') === '42P01';
      if (missingTable) {
        return jsonResponse({ error: 'darkrisk_entitlements table missing. Apply migrations first.' }, 412);
      }
      throw entitlementRes.error;
    }

    const entitlement = entitlementRes.data as {
      id: string;
      enabled: boolean;
      tier: string;
      enable_ai_recommendations?: boolean | null;
    } | null;
    if (!entitlement?.enabled) {
      return jsonResponse({ error: 'DarkRisk360 not enabled for customer' }, 403);
    }

    const scanJobQuery = adminClient
      .from('surface_scan_jobs' as any)
      .select('id, customer_id, organization_id, status, created_at, completed_at, scan_profile')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(1);

    const scanJobRes = requestedScanJobId
      ? await adminClient
          .from('surface_scan_jobs' as any)
          .select('id, customer_id, organization_id, status, created_at, completed_at, scan_profile')
          .eq('id', requestedScanJobId)
          .maybeSingle()
      : await scanJobQuery.maybeSingle();

    if (scanJobRes.error) throw scanJobRes.error;
    const scanJob = scanJobRes.data as any;
    if (!scanJob) return jsonResponse({ error: 'No SurfaceScan360 job found for customer' }, 404);

    const scanOwner = normalizeText(scanJob.customer_id || scanJob.organization_id);
    if (scanOwner !== customerId) {
      return jsonResponse({ error: 'scan_job_id not in selected customer scope' }, 403);
    }

    const { data: scanRunData, error: scanRunErr } = await adminClient
      .from('darkrisk_scan_runs' as any)
      .insert({
        organization_id: customerId,
        tenant_id: customerId,
        tier: String(entitlement.tier || 'standard').toLowerCase() === 'extended' ? 'extended' : 'standard',
        status: 'running',
        trigger_type: triggerType,
        requested_by: authData.user.id,
        surface_scan_job_id: scanJob.id,
        started_at: new Date().toISOString(),
        sources: ['surfacescan360'],
        stats: {},
      })
      .select('id')
      .single();

    if (scanRunErr || !scanRunData?.id) throw scanRunErr || new Error('Unable to create darkrisk scan run');
    scanRunId = scanRunData.id;

    const [assetsRes, findingsRes, exposureFindingsRes] = await Promise.all([
      adminClient
        .from('surface_assets' as any)
        .select('id, asset_type, asset_value, source, raw')
        .eq('scan_job_id', scanJob.id),
      adminClient
        .from('surface_findings' as any)
        .select('id, finding_type, title, description, severity, module, affected_asset, affected_url, status, evidence, created_at')
        .eq('scan_job_id', scanJob.id),
      adminClient
        .from('surface_exposure_findings' as any)
        .select('id, finding_type, title, description, severity, source, affected_host, affected_url, status, evidence, raw, created_at')
        .eq('scan_job_id', scanJob.id),
    ]);

    if (assetsRes.error) throw assetsRes.error;
    if (findingsRes.error) throw findingsRes.error;
    if (exposureFindingsRes.error) throw exposureFindingsRes.error;

    const assets = (assetsRes.data || []) as SurfaceAssetRow[];
    const surfaceFindings = (findingsRes.data || []) as SurfaceFindingRow[];
    const exposureFindings = (exposureFindingsRes.data || []) as ExposureFindingRow[];

    const assetRows = assets
      .map((asset) => {
        const value = normalizeText(asset.asset_value);
        if (!value) return null;
        const normalizedValue = normalizeAssetValue(value);
        const assetType = normalizeText(asset.asset_type) || resolveAssetType(normalizedValue);

        return {
          organization_id: customerId,
          tenant_id: customerId,
          asset_type: assetType,
          value,
          normalized_value: normalizedValue,
          source: 'surfacescan360',
          scope_status: 'approved',
          first_seen_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
          metadata: {
            source_asset_id: asset.id,
            source: asset.source,
            raw: asset.raw || {},
          },
        };
      })
      .filter(Boolean) as Array<Record<string, unknown>>;

    if (assetRows.length > 0) {
      const { error: assetsUpsertErr } = await adminClient
        .from('darkrisk_assets' as any)
        .upsert(assetRows as any, {
          onConflict: 'organization_id,asset_type,normalized_value',
          ignoreDuplicates: false,
        });
      if (assetsUpsertErr) throw assetsUpsertErr;
    }

    const assetValues = Array.from(new Set(assetRows.map((row) => String(row.normalized_value))));
    const darkriskAssetsRes = assetValues.length > 0
      ? await adminClient
          .from('darkrisk_assets' as any)
          .select('id, asset_type, normalized_value')
          .eq('organization_id', customerId)
          .in('normalized_value', assetValues)
      : { data: [], error: null } as any;

    if ((darkriskAssetsRes as any).error) throw (darkriskAssetsRes as any).error;

    const assetByNormalized = new Map<string, { id: string; asset_type: string }>();
    for (const row of ((darkriskAssetsRes as any).data || []) as Array<{ id: string; asset_type: string; normalized_value: string }>) {
      assetByNormalized.set(String(row.normalized_value), { id: row.id, asset_type: row.asset_type });
    }

    const canonicalFindings: CanonicalFinding[] = [
      ...surfaceFindings.map((row) => normalizeSurfaceFinding(row)),
      ...exposureFindings.map((row) => normalizeExposureFinding(row)),
    ];

    let recordsCreated = 0;
    let evidenceCreated = 0;
    let findingsCreated = 0;
    let alertsCreated = 0;

    for (const finding of canonicalFindings) {
      const affectedNormalized = normalizeAssetValue(finding.affected_asset);
      const existingAssetRef = affectedNormalized ? assetByNormalized.get(affectedNormalized) : undefined;

      let affectedAssetId = existingAssetRef?.id || null;

      if (!affectedAssetId && affectedNormalized) {
        const inferredType = resolveAssetType(affectedNormalized);
        const upsertPayload = {
          organization_id: customerId,
          tenant_id: customerId,
          asset_type: inferredType,
          value: finding.affected_asset,
          normalized_value: affectedNormalized,
          source: 'surfacescan360',
          scope_status: 'approved',
          first_seen_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
          metadata: { inferred_from_finding: true },
        };

        const { error: upsertErr } = await adminClient
          .from('darkrisk_assets' as any)
          .upsert(upsertPayload as any, { onConflict: 'organization_id,asset_type,normalized_value' });

        if (upsertErr) throw upsertErr;

        const { data: fetchedAsset } = await adminClient
          .from('darkrisk_assets' as any)
          .select('id')
          .eq('organization_id', customerId)
          .eq('asset_type', inferredType)
          .eq('normalized_value', affectedNormalized)
          .maybeSingle();

        if (fetchedAsset?.id) {
          affectedAssetId = fetchedAsset.id;
          assetByNormalized.set(affectedNormalized, { id: fetchedAsset.id, asset_type: inferredType });
        }
      }

      const sourceRecordKey = `${scanJob.id}:${finding.origin}:${finding.source_id}`;
      const { data: sourceRecord, error: sourceRecordErr } = await adminClient
        .from('darkrisk_source_records' as any)
        .insert({
          organization_id: customerId,
          tenant_id: customerId,
          scan_run_id: scanRunId,
          source: 'surfacescan360',
          asset_id: affectedAssetId,
          source_record_key: sourceRecordKey,
          source_type: finding.origin,
          title: finding.title,
          description: maskPotentialSecrets(finding.description),
          raw_metadata: finding.payload,
          safe_preview: maskPotentialSecrets(`${finding.title}\n${finding.description}`),
          preview_hash: sourceRecordKey,
        })
        .select('id')
        .single();

      if (sourceRecordErr || !sourceRecord?.id) throw sourceRecordErr || new Error('source record insert failed');
      recordsCreated += 1;

      const { data: evidence, error: evidenceErr } = await adminClient
        .from('darkrisk_evidence' as any)
        .insert({
          organization_id: customerId,
          tenant_id: customerId,
          scan_run_id: scanRunId,
          source_record_id: sourceRecord.id,
          source: 'surfacescan360',
          evidence_class: finding.module || 'surface_scan',
          asset_id: affectedAssetId,
          title: finding.title,
          summary: maskPotentialSecrets(finding.description),
          masked_value: finding.affected_asset ? maskPotentialSecrets(finding.affected_asset) : null,
          severity_hint: finding.severity,
          confidence: 'medium',
          observed_at: finding.created_at || new Date().toISOString(),
          first_seen_at: finding.created_at || new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
          visibility: 'customer',
          contains_sensitive_data: false,
          metadata: {
            origin: finding.origin,
            source_id: finding.source_id,
            module: finding.module,
            status: finding.status,
          },
        })
        .select('id')
        .single();

      if (evidenceErr || !evidence?.id) throw evidenceErr || new Error('evidence insert failed');
      evidenceCreated += 1;

      const confidence = inferConfidence(finding);
      const freshnessDays = daysSince(finding.created_at);
      const recurrenceCount = canonicalFindings.filter((candidate) =>
        candidate.finding_type === finding.finding_type &&
        normalizeAssetValue(candidate.affected_asset) === normalizeAssetValue(finding.affected_asset),
      ).length;
      const compromiseType = inferCompromiseType({
        findingType: finding.finding_type,
        title: finding.title,
        module: finding.module,
      });
      const riskDimensions = inferRiskDimensions({
        findingType: finding.finding_type,
        title: finding.title,
        module: finding.module,
        confidence,
        freshnessDays,
      });
      const riskScore = calculateFindingRiskScore({
        severity: finding.severity,
        confidence,
        freshnessDays,
        recurrenceCount,
        affectedAssetCriticality: inferAssetCriticality(finding.affected_asset),
        isDirectCompromise: compromiseType === 'direct',
        isThirdPartyOnly: compromiseType === 'indirect',
      });

      const { data: darkFinding, error: findingErr } = await adminClient
        .from('darkrisk_findings' as any)
        .insert({
          organization_id: customerId,
          tenant_id: customerId,
          scan_run_id: scanRunId,
          finding_type: finding.finding_type,
          title: finding.title,
          description: maskPotentialSecrets(finding.description),
          affected_asset_id: affectedAssetId,
          severity: finding.severity,
          confidence,
          status: 'new',
          risk_score: riskScore,
          risk_dimensions: riskDimensions,
          evidence_ids: [evidence.id],
          first_seen_at: finding.created_at || new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
          metadata: {
            source_scan_job_id: scanJob.id,
            source_origin: finding.origin,
            source_finding_id: finding.source_id,
            compromise_type: compromiseType,
            third_party_involved: compromiseType === 'indirect',
            requires_validation: compromiseType !== 'misconfiguration',
            recurrence_count: recurrenceCount,
          },
        })
        .select('id')
        .single();

      if (findingErr || !darkFinding?.id) throw findingErr || new Error('darkrisk finding insert failed');
      findingsCreated += 1;

      if (finding.severity === 'high' || finding.severity === 'critical') {
        const { error: alertErr } = await adminClient
          .from('darkrisk_alerts' as any)
          .insert({
            organization_id: customerId,
            tenant_id: customerId,
            finding_id: darkFinding.id,
            alert_type: 'new_finding',
            title: finding.title,
            message: maskPotentialSecrets(finding.description),
            severity: finding.severity,
            status: 'open',
            occurred_at: finding.created_at || new Date().toISOString(),
            metadata: {
              source: 'surfacescan360',
              source_scan_job_id: scanJob.id,
              module: finding.module,
            },
          });

        if (!alertErr) alertsCreated += 1;
      }
    }

    let recommendationMode: 'not_requested' | 'generated' | 'failed' | 'disabled' = 'not_requested';
    let recommendationWarning: string | null = null;
    let reportMode: 'not_requested' | 'generated' | 'reused' | 'failed' | 'disabled' = 'not_requested';
    let reportWarning: string | null = null;

    const completedAt = new Date().toISOString();
    await adminClient
      .from('darkrisk_scan_runs' as any)
      .update({
        status: 'completed',
        completed_at: completedAt,
        warnings: [],
        stats: {
          source: 'surfacescan360',
          surface_scan_job_id: scanJob.id,
          source_records_created: recordsCreated,
          evidence_created: evidenceCreated,
          findings_created: findingsCreated,
          alerts_created: alertsCreated,
          assets_synced: assetRows.length,
        },
      })
      .eq('id', scanRunId);

    const aiEnabled = entitlement?.enable_ai_recommendations !== false;
    if (aiEnabled && SUPABASE_URL && SERVICE_ROLE) {
      try {
        const recoRes = await fetch(`${SUPABASE_URL}/functions/v1/darkrisk360-generate-recommendations`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${SERVICE_ROLE}`,
            apikey: SERVICE_ROLE,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            customer_id: customerId,
            scan_run_id: scanRunId,
            trigger_type: 'auto_after_sync',
          }),
        });

        if (!recoRes.ok) {
          const text = await recoRes.text();
          recommendationMode = 'failed';
          recommendationWarning = `AI recommendation generation failed: ${text.slice(0, 280)}`;
        } else {
          recommendationMode = 'generated';
        }
      } catch (recoErr: any) {
        recommendationMode = 'failed';
        recommendationWarning = normalizeText(recoErr?.message) || 'AI recommendation generation failed';
      }
    } else if (!aiEnabled) {
      recommendationMode = 'disabled';
    }

    if (SUPABASE_URL && SERVICE_ROLE) {
      try {
        const reportRes = await fetch(`${SUPABASE_URL}/functions/v1/darkrisk360-generate-report`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${SERVICE_ROLE}`,
            apikey: SERVICE_ROLE,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            customer_id: customerId,
            scan_run_id: scanRunId,
            classification: 'confidential',
          }),
        });
        if (!reportRes.ok) {
          const text = await reportRes.text();
          reportMode = 'failed';
          reportWarning = `DarkRisk report generation failed: ${text.slice(0, 280)}`;
        } else {
          const payload = await reportRes.json().catch(() => ({}));
          reportMode = payload?.reused ? 'reused' : 'generated';
        }
      } catch (reportErr: any) {
        reportMode = 'failed';
        reportWarning = normalizeText(reportErr?.message) || 'DarkRisk report generation failed';
      }
    } else {
      reportMode = 'disabled';
    }

    if (recommendationWarning || reportWarning) {
      await adminClient
        .from('darkrisk_scan_runs' as any)
        .update({
          status: 'completed_with_warnings',
          warnings: [recommendationWarning, reportWarning].filter(Boolean),
        })
        .eq('id', scanRunId);
    }

    return jsonResponse({
      ok: true,
      customer_id: customerId,
      scan_run_id: scanRunId,
      source: 'surfacescan360',
      tier: entitlement.tier,
      started_at: startedAt,
      completed_at: completedAt,
      stats: {
        assets_synced: assetRows.length,
        source_records_created: recordsCreated,
        evidence_created: evidenceCreated,
        findings_created: findingsCreated,
        alerts_created: alertsCreated,
        recommendation_mode: recommendationMode,
        report_mode: reportMode,
      },
      warning: [recommendationWarning, reportWarning].filter(Boolean).join(' | ') || null,
    });
  } catch (error: any) {
    if (scanRunId) {
      try {
        const { adminClient } = makeSupabaseClients(req);
        await adminClient
          .from('darkrisk_scan_runs' as any)
          .update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            error_message: normalizeText(error?.message) || 'Unknown error',
          })
          .eq('id', scanRunId);
      } catch {
        // no-op
      }
    }

    return jsonResponse({
      ok: false,
      error: normalizeText(error?.message) || 'Internal error',
      scan_run_id: scanRunId,
    }, 500);
  }
});
