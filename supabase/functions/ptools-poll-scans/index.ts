import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.3';
import { corsHeaders } from '../_shared/surface-scan-utils.ts';
import { PentestToolsClient } from '../_shared/pentestToolsClient.ts';
import {
  buildNetworkScannerParams,
  buildPortScannerParams,
  buildPortAndReconUrlCandidates,
  buildSslScannerParams,
  buildWebsiteReconParams,
} from '../_shared/pentestToolsParamMapper.ts';
import {
  exposureFindingFromPort,
  hostFromTargetValue,
  isTerminalErrorStatus,
  normalizeScanStatus,
  reconCandidatesFromOpenPorts,
  toolNameById,
} from '../_shared/exposureUtils.ts';
import { normalizeSubdomainFinderOutputForDomain } from '../_shared/parsers/subdomainFinderParser.ts';
import { normalizePortScannerOutput } from '../_shared/parsers/portScannerParser.ts';
import { normalizeWebsiteReconOutput } from '../_shared/parsers/websiteReconParser.ts';
import { normalizeSslOutput } from '../_shared/parsers/sslScannerParser.ts';
import {
  PENTEST_TOOL_IDS,
  type SurfacePortTechScanRequest,
} from '../_shared/pentestToolsTypes.ts';
import {
  getMaxParallelScans,
  getPollIntervalSeconds,
  nextRetryIsoFromMinutes,
  computeRetryDelayMinutes,
  recoverStaleScansForJob,
  startQueuedScansForJob,
} from '../_shared/exposureQueue.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const INTERNAL_SECRET = Deno.env.get('SURFACESCAN_CRON_INTERNAL_SECRET') || Deno.env.get('SURFACESCAN_INTERNAL_SECRET') || '';

const MAX_POLL_TASKS = 80;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

function toArray<T = any>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  return [];
}

function parseRemoteStatusPayload(remote: any): {
  statusName: string;
  progress: number;
} {
  const data = remote?.data ?? remote;
  const statusName = String(
    data?.status_name || data?.status || data?.scan_status || 'running',
  ).trim();
  const progress = Number(data?.progress ?? data?.scan_progress ?? 0);
  return {
    statusName,
    progress: Number.isFinite(progress) ? Math.max(0, Math.min(100, Math.round(progress))) : 0,
  };
}

function dedupeStringList(values: string[]): string[] {
  return [...new Set(values.map((v) => String(v || '').trim()).filter(Boolean))];
}

async function upsertSurfaceAsset(adminClient: any, args: {
  scanJobId: string;
  organizationId: string;
  tenantId: string;
  customerId: string;
  assetType: string;
  assetValue: string;
  hostname?: string | null;
  rootDomain?: string | null;
  ip?: string | null;
  source: string;
  confidence?: string;
  raw?: Record<string, unknown>;
}) {
  const payload: Record<string, unknown> = {
    organization_id: args.organizationId,
    tenant_id: args.tenantId,
    customer_id: args.customerId,
    scan_job_id: args.scanJobId,
    asset_type: args.assetType,
    asset_value: args.assetValue,
    hostname: args.hostname || null,
    root_domain: args.rootDomain || null,
    ip: args.ip || null,
    source: args.source,
    confidence: args.confidence || 'medium',
    raw: args.raw || {},
    last_seen: new Date().toISOString(),
  };

  // keep idempotency using lookup+update/insert because no unique constraint on surface_assets
  const { data: existing } = await adminClient
    .from('surface_assets' as any)
    .select('id')
    .eq('scan_job_id', args.scanJobId)
    .eq('asset_type', args.assetType)
    .eq('asset_value', args.assetValue)
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    await adminClient.from('surface_assets' as any).update(payload).eq('id', existing.id);
    return existing.id as string;
  }

  const { data: inserted, error: insertError } = await adminClient
    .from('surface_assets' as any)
    .insert({ ...payload, first_seen: new Date().toISOString() })
    .select('id')
    .single();

  if (insertError) {
    console.warn('[ptools-poll] upsertSurfaceAsset insert failed:', insertError.message);
    return null;
  }

  return inserted?.id ? String(inserted.id) : null;
}

async function enqueueScanTask(adminClient: any, payload: Record<string, unknown>) {
  const { error } = await adminClient.from('pentest_tools_scans' as any).insert(payload);
  if (error) {
    console.warn('[ptools-poll] enqueueScanTask failed:', error.message);
  }
}

async function persistOpenPortRows(adminClient: any, args: {
  scanJobId: string;
  organizationId: string;
  tenantId: string;
  customerId: string;
  targetId: string | null;
  sourceScanId: string;
  targetHost: string;
  openPorts: ReturnType<typeof normalizePortScannerOutput>;
}) {
  const dedupe = new Map<string, any>();
  for (const port of args.openPorts) {
    const key = `${port.host}|${port.ip || ''}|${port.port}|${port.protocol}`;
    if (dedupe.has(key)) continue;

    const row = {
      scan_job_id: args.scanJobId,
      target_id: args.targetId,
      organization_id: args.organizationId,
      tenant_id: args.tenantId,
      customer_id: args.customerId,
      host: port.host,
      ip: port.ip || null,
      port: port.port,
      protocol: port.protocol,
      state: port.state,
      service_name: port.service_name || null,
      service_product: port.service_product || null,
      service_version: port.service_version || null,
      service_extra_info: port.service_extra_info || null,
      os_guess: port.os_guess || null,
      banner: port.banner || null,
      is_web: Boolean(port.is_web),
      is_tls: Boolean(port.is_tls),
      exposure_level: port.exposure_level,
      remediation_hint: port.remediation_hint || null,
      source_scan_id: args.sourceScanId,
      last_seen_at: new Date().toISOString(),
      raw: {
        ...(port.raw || {}),
        scope_target_host: args.targetHost || null,
        provider_hosts: Array.isArray((port as any).provider_hosts) ? (port as any).provider_hosts : [],
      },
    };
    dedupe.set(key, row);
  }

  const rows = Array.from(dedupe.values());
  if (rows.length === 0) return;

  const { error } = await adminClient.from('surface_open_ports' as any).upsert(rows, {
    onConflict: 'scan_job_id,host,port,protocol',
  });
  if (error) {
    console.warn('[ptools-poll] persistOpenPortRows upsert failed:', error.message);
  }
}

async function persistExposureFindingsFromPorts(adminClient: any, args: {
  scanJobId: string;
  organizationId: string;
  tenantId: string;
  customerId: string;
  targetId: string | null;
  sourceScanId: string;
  openPorts: ReturnType<typeof normalizePortScannerOutput>;
}) {
  for (const port of args.openPorts) {
    const finding = exposureFindingFromPort(port);
    if (!finding) continue;

    const evidenceText = [
      `Host: ${port.host}`,
      port.ip ? `IP: ${port.ip}` : null,
      `Porta: ${port.port}/${port.protocol}`,
      port.service_name ? `Servizio: ${port.service_name}` : null,
      port.service_version ? `Versione: ${port.service_version}` : null,
    ].filter(Boolean).join(' | ');

    const basePayload = {
      scan_job_id: args.scanJobId,
      target_id: args.targetId,
      organization_id: args.organizationId,
      tenant_id: args.tenantId,
      customer_id: args.customerId,
      finding_type: finding.finding_type,
      title: finding.title,
      severity: finding.severity,
      affected_host: port.host,
      affected_port: port.port,
      description: finding.description,
      evidence: evidenceText,
      recommendation: finding.recommendation,
      source: 'surface_exposure_engine',
      source_scan_id: args.sourceScanId,
      raw: {
        port,
      },
      status: 'open',
    };

    await adminClient.from('surface_exposure_findings' as any).insert(basePayload);

    await adminClient.from('surface_findings' as any).insert({
      organization_id: args.organizationId,
      tenant_id: args.tenantId,
      customer_id: args.customerId,
      scan_job_id: args.scanJobId,
      provider: 'pentest_tools',
      module: 'port_scanner',
      finding_type: finding.finding_type,
      title: finding.title,
      description: finding.description,
      severity: finding.severity,
      affected_asset: port.host,
      ip: port.ip || null,
      port: port.port,
      protocol: port.protocol,
      remediation: finding.recommendation,
      evidence: {
        host: port.host,
        ip: port.ip || null,
        port: port.port,
        protocol: port.protocol,
        service: port.service_name || null,
        version: port.service_version || null,
        _source: 'ptools-port-scanner',
      },
      attribution_confidence: 'high',
      status: 'open',
    });
  }
}

async function persistWebsiteTechnologies(adminClient: any, args: {
  scanJobId: string;
  organizationId: string;
  tenantId: string;
  customerId: string;
  targetId: string | null;
  sourceScanId: string;
  technologies: ReturnType<typeof normalizeWebsiteReconOutput>;
}) {
  for (const tech of args.technologies) {
    await adminClient.from('surface_web_technologies' as any).insert({
      scan_job_id: args.scanJobId,
      target_id: args.targetId,
      organization_id: args.organizationId,
      tenant_id: args.tenantId,
      customer_id: args.customerId,
      url: tech.url,
      host: tech.host,
      port: tech.port || null,
      technology_name: tech.name,
      technology_version: tech.version || null,
      category: tech.category || null,
      confidence: tech.confidence || null,
      source: 'pentest_tools_website_recon',
      source_scan_id: args.sourceScanId,
      raw: tech.raw || {},
    });

    await upsertSurfaceAsset(adminClient, {
      scanJobId: args.scanJobId,
      organizationId: args.organizationId,
      tenantId: args.tenantId,
      customerId: args.customerId,
      assetType: 'technology',
      assetValue: tech.name,
      hostname: tech.host,
      source: 'pentest_tools_website_recon',
      confidence: 'medium',
      raw: {
        url: tech.url,
        version: tech.version || null,
        category: tech.category || null,
        confidence: tech.confidence || null,
      },
    });
  }
}

async function persistSslResult(adminClient: any, args: {
  scanJobId: string;
  organizationId: string;
  tenantId: string;
  customerId: string;
  targetId: string | null;
  sourceScanId: string;
  targetUrl: string;
  sslResult: ReturnType<typeof normalizeSslOutput>;
}) {
  await adminClient.from('surface_ssl_results' as any).insert({
    scan_job_id: args.scanJobId,
    target_id: args.targetId,
    organization_id: args.organizationId,
    tenant_id: args.tenantId,
    customer_id: args.customerId,
    url: args.targetUrl,
    host: args.sslResult.host,
    port: args.sslResult.port,
    certificate_subject: args.sslResult.certificate_subject || null,
    certificate_issuer: args.sslResult.certificate_issuer || null,
    certificate_not_before: args.sslResult.not_before || null,
    certificate_not_after: args.sslResult.not_after || null,
    grade: args.sslResult.grade || null,
    weak_protocols: args.sslResult.weak_protocols || [],
    weak_ciphers: args.sslResult.weak_ciphers || [],
    source_scan_id: args.sourceScanId,
    raw: args.sslResult.raw || {},
  });

  if ((args.sslResult.weak_protocols || []).length > 0 || (args.sslResult.weak_ciphers || []).length > 0) {
    await adminClient.from('surface_exposure_findings' as any).insert({
      scan_job_id: args.scanJobId,
      target_id: args.targetId,
      organization_id: args.organizationId,
      tenant_id: args.tenantId,
      customer_id: args.customerId,
      finding_type: 'weak_ssl_tls_configuration',
      title: 'Configurazione SSL/TLS debole rilevata',
      severity: 'medium',
      affected_host: args.sslResult.host,
      affected_port: args.sslResult.port,
      affected_url: args.targetUrl,
      description: 'Sono stati rilevati protocolli o cifrature TLS deboli durante la verifica SSL.',
      evidence: JSON.stringify({
        weak_protocols: args.sslResult.weak_protocols || [],
        weak_ciphers: args.sslResult.weak_ciphers || [],
      }),
      recommendation: 'Disabilitare protocolli obsoleti e ciphers deboli, mantenendo baseline TLS moderna.',
      source: 'surface_exposure_engine',
      source_scan_id: args.sourceScanId,
      raw: args.sslResult.raw || {},
      status: 'open',
    });
  }
}

async function persistNetworkFindings(adminClient: any, args: {
  scanJobId: string;
  organizationId: string;
  tenantId: string;
  customerId: string;
  targetId: string | null;
  sourceScanId: string;
  targetName: string;
  findings: any[];
}) {
  for (const finding of args.findings || []) {
    const cves = Array.isArray(finding?.cve)
      ? finding.cve.map((entry: unknown) => String(entry || '').trim().toUpperCase()).filter(Boolean)
      : [];
    const severityRaw = String(finding?.severity || '').toLowerCase();
    const riskLevel = Number(finding?.risk_level || 0);
    const severity =
      severityRaw ||
      (riskLevel >= 9 ? 'critical' : riskLevel >= 7 ? 'high' : riskLevel >= 4 ? 'medium' : riskLevel > 0 ? 'low' : 'info');

    await adminClient.from('surface_exposure_findings' as any).insert({
      scan_job_id: args.scanJobId,
      target_id: args.targetId,
      organization_id: args.organizationId,
      tenant_id: args.tenantId,
      customer_id: args.customerId,
      finding_type: String(finding?.finding_type || finding?.name || 'network_scanner_finding'),
      title: String(finding?.name || finding?.title || 'Network scanner finding'),
      severity,
      cvss: Number.isFinite(Number(finding?.cvss)) ? Number(finding.cvss) : null,
      cve_ids: cves,
      affected_host: String(finding?.host || args.targetName || '').trim() || null,
      affected_port: Number.isFinite(Number(finding?.port)) ? Number(finding.port) : null,
      affected_url: String(finding?.affected_url || '').trim() || null,
      description: String(finding?.description || '').trim() || null,
      evidence: String(finding?.evidence || '').trim() || null,
      recommendation: String(finding?.recommendation || '').trim() || null,
      source: 'pentest_tools_network_scanner',
      source_scan_id: args.sourceScanId,
      raw: finding,
      status: 'open',
    });

    await adminClient.from('surface_findings' as any).insert({
      organization_id: args.organizationId,
      tenant_id: args.tenantId,
      customer_id: args.customerId,
      scan_job_id: args.scanJobId,
      provider: 'pentest_tools',
      module: 'network_scanner',
      finding_type: String(finding?.finding_type || finding?.name || 'network_scanner_finding'),
      title: String(finding?.name || finding?.title || 'Network scanner finding'),
      description: String(finding?.description || '').trim() || null,
      severity,
      affected_asset: String(finding?.host || args.targetName || '').trim() || null,
      affected_url: String(finding?.affected_url || '').trim() || null,
      ip: String(finding?.ip || '').trim() || null,
      port: Number.isFinite(Number(finding?.port)) ? Number(finding.port) : null,
      protocol: String(finding?.protocol || '').trim() || null,
      cve: cves,
      cvss: Number.isFinite(Number(finding?.cvss)) ? Number(finding.cvss) : null,
      remediation: String(finding?.recommendation || '').trim() || null,
      evidence: finding,
      attribution_confidence: 'high',
      status: 'open',
    });
  }
}

async function enqueueDerivedTasksFromPortScan(adminClient: any, args: {
  scanTask: any;
  job: any;
  inputConfig: SurfacePortTechScanRequest;
  openPorts: ReturnType<typeof normalizePortScannerOutput>;
}) {
  const host = hostFromTargetValue(String(args.scanTask.target_name || ''));
  if (!host) return;

  const targetId = args.scanTask.target_id ? String(args.scanTask.target_id) : null;

  if (args.inputConfig.include_web_technology_detection) {
    const reconCandidates = reconCandidatesFromOpenPorts(host, args.openPorts);
    const reconParams = buildWebsiteReconParams();
    for (const candidate of reconCandidates) {
      await enqueueScanTask(adminClient, {
        scan_job_id: args.scanTask.scan_job_id,
        target_id: targetId,
        organization_id: args.scanTask.organization_id,
        tenant_id: args.scanTask.tenant_id,
        customer_id: args.scanTask.customer_id,
        tool_id: PENTEST_TOOL_IDS.WEBSITE_RECON,
        tool_name: toolNameById(PENTEST_TOOL_IDS.WEBSITE_RECON),
        phase: 'website_recon',
        target_name: candidate.url,
        tool_params: reconParams,
        status: 'queued',
      });
    }
  }

  if (args.inputConfig.include_ssl_scan) {
    const tlsCandidates = args.openPorts.filter((row) => row.is_tls || [443, 8443, 9443].includes(row.port));
    const tlsUrls = dedupeStringList(
      tlsCandidates.flatMap((candidate) => buildPortAndReconUrlCandidates(host, candidate.port, candidate.service_name))
        .filter((url) => url.startsWith('https://')),
    );
    const sslParams = buildSslScannerParams(args.inputConfig);
    for (const url of tlsUrls) {
      await enqueueScanTask(adminClient, {
        scan_job_id: args.scanTask.scan_job_id,
        target_id: targetId,
        organization_id: args.scanTask.organization_id,
        tenant_id: args.scanTask.tenant_id,
        customer_id: args.scanTask.customer_id,
        tool_id: PENTEST_TOOL_IDS.SSL_SCANNER,
        tool_name: toolNameById(PENTEST_TOOL_IDS.SSL_SCANNER),
        phase: 'ssl_scan',
        target_name: url,
        tool_params: sslParams,
        status: 'queued',
      });
    }
  }

  if (args.inputConfig.include_network_vuln_scan && args.openPorts.length > 0) {
    const networkParams = buildNetworkScannerParams(args.inputConfig);
    const existingNetworkScan = await adminClient
      .from('pentest_tools_scans' as any)
      .select('id')
      .eq('scan_job_id', args.scanTask.scan_job_id)
      .eq('phase', 'network_scan')
      .eq('target_name', host)
      .limit(1)
      .maybeSingle();

    if (!existingNetworkScan.data?.id) {
      await enqueueScanTask(adminClient, {
        scan_job_id: args.scanTask.scan_job_id,
        target_id: targetId,
        organization_id: args.scanTask.organization_id,
        tenant_id: args.scanTask.tenant_id,
        customer_id: args.scanTask.customer_id,
        tool_id: PENTEST_TOOL_IDS.NETWORK_SCANNER,
        tool_name: toolNameById(PENTEST_TOOL_IDS.NETWORK_SCANNER),
        phase: 'network_scan',
        target_name: host,
        tool_params: networkParams,
        status: 'queued',
      });
    }
  }
}

async function persistSubdomainsAndQueuePorts(adminClient: any, args: {
  scanTask: any;
  job: any;
  inputConfig: SurfacePortTechScanRequest;
  output: unknown;
}) {
  const remoteScanId = Number(args.scanTask.remote_scan_id || 0);
  const discovered = normalizeSubdomainFinderOutputForDomain(
    args.output,
    remoteScanId,
    String(args.job.root_domain || "").trim().toLowerCase(),
  );
  if (discovered.length === 0) return;

  const subdomainTargetRows: any[] = [];
  const nowIso = new Date().toISOString();
  for (const sub of discovered) {
    const normalizedHost = String(sub.hostname || '').trim().toLowerCase();
    if (!normalizedHost) continue;

    await upsertSurfaceAsset(adminClient, {
      scanJobId: args.scanTask.scan_job_id,
      organizationId: args.scanTask.organization_id,
      tenantId: args.scanTask.tenant_id || args.scanTask.customer_id,
      customerId: args.scanTask.customer_id,
      assetType: 'subdomain',
      assetValue: normalizedHost,
      hostname: normalizedHost,
      rootDomain: args.job.root_domain || null,
      ip: (sub.ips || [])[0] || null,
      source: 'pentest_tools_subdomain_finder',
      confidence: 'medium',
      raw: {
        ips: sub.ips || [],
        cname: sub.cname || null,
        country: sub.country || null,
        netname: sub.netname || null,
      },
    });

    subdomainTargetRows.push({
      scan_job_id: args.scanTask.scan_job_id,
      organization_id: args.scanTask.organization_id,
      tenant_id: args.scanTask.tenant_id || args.scanTask.customer_id,
      customer_id: args.scanTask.customer_id,
      target_value: normalizedHost,
      target_type: 'subdomain',
      root_domain: args.job.root_domain || null,
      source: 'subdomain_finder',
      resolved_ips: sub.ips || [],
      is_authorized: true,
      created_at: nowIso,
    });
  }

  let insertedTargets: Array<{ id: string; target_value: string; target_type: string }> = [];
  if (subdomainTargetRows.length > 0) {
    const { data } = await adminClient
      .from('surface_scan_targets' as any)
      .upsert(subdomainTargetRows, { onConflict: 'scan_job_id,target_value,target_type' })
      .select('id, target_value, target_type');
    insertedTargets = (data || []) as Array<{ id: string; target_value: string; target_type: string }>;
  }

  if (args.inputConfig.include_port_scan) {
    const portParams = buildPortScannerParams(args.inputConfig);
    const targetIdByValue = new Map<string, string>();
    for (const row of insertedTargets) {
      targetIdByValue.set(String(row.target_value || '').toLowerCase(), String(row.id));
    }

    for (const sub of discovered) {
      const targetName = String(sub.hostname || '').trim().toLowerCase();
      if (!targetName) continue;
      await enqueueScanTask(adminClient, {
        scan_job_id: args.scanTask.scan_job_id,
        target_id: targetIdByValue.get(targetName) || null,
        organization_id: args.scanTask.organization_id,
        tenant_id: args.scanTask.tenant_id || args.scanTask.customer_id,
        customer_id: args.scanTask.customer_id,
        tool_id: PENTEST_TOOL_IDS.PORT_SCANNER,
        tool_name: toolNameById(PENTEST_TOOL_IDS.PORT_SCANNER),
        phase: 'port_scan',
        target_name: targetName,
        tool_params: portParams,
        status: 'queued',
      });
    }
  }
}

async function processFinishedTask(adminClient: any, pentestClient: PentestToolsClient, scanTask: any): Promise<void> {
  const scanJobId = String(scanTask.scan_job_id);
  const { data: job } = await adminClient
    .from('surface_scan_jobs' as any)
    .select('*')
    .eq('id', scanJobId)
    .maybeSingle();
  if (!job) return;

  const inputConfig = ((job.config || {}) as SurfacePortTechScanRequest);

  let output: any = scanTask.raw_output || null;
  if (!output && Number.isFinite(Number(scanTask.remote_scan_id))) {
    try {
      output = await pentestClient.getScanOutput(Number(scanTask.remote_scan_id));
      await adminClient.from('pentest_tools_scans' as any).update({
        raw_output: output,
      }).eq('id', scanTask.id);
    } catch (error: any) {
      console.warn('[ptools-poll] getScanOutput failed:', error?.message || error);
    }
  }

  if (scanTask.phase === 'subdomain_discovery' && output) {
    await persistSubdomainsAndQueuePorts(adminClient, {
      scanTask,
      job,
      inputConfig,
      output,
    });
    return;
  }

  if (scanTask.phase === 'port_scan' && output) {
    const targetHost = hostFromTargetValue(String(scanTask.target_name || '')) || String(scanTask.target_name || '').trim().toLowerCase();
    const openPorts = normalizePortScannerOutput(output, { targetHost });

    await persistOpenPortRows(adminClient, {
      scanJobId,
      organizationId: scanTask.organization_id,
      tenantId: scanTask.tenant_id || scanTask.customer_id,
      customerId: scanTask.customer_id,
      targetId: scanTask.target_id ? String(scanTask.target_id) : null,
      sourceScanId: scanTask.id,
      targetHost,
      openPorts,
    });

    await persistExposureFindingsFromPorts(adminClient, {
      scanJobId,
      organizationId: scanTask.organization_id,
      tenantId: scanTask.tenant_id || scanTask.customer_id,
      customerId: scanTask.customer_id,
      targetId: scanTask.target_id ? String(scanTask.target_id) : null,
      sourceScanId: scanTask.id,
      openPorts,
    });

    await enqueueDerivedTasksFromPortScan(adminClient, {
      scanTask,
      job,
      inputConfig,
      openPorts,
    });

    await adminClient.from('surface_observations' as any).insert({
      organization_id: scanTask.organization_id,
      tenant_id: scanTask.tenant_id || scanTask.customer_id,
      customer_id: scanTask.customer_id,
      scan_job_id: scanJobId,
      module: 'port_scanner',
      observation_type: 'open_ports',
      title: `Open ports - ${scanTask.target_name}`,
      value: {
        host: hostFromTargetValue(String(scanTask.target_name || '')),
        open_ports: openPorts.map((entry) => entry.port),
        data: openPorts,
      },
      severity: openPorts.some((entry) => entry.exposure_level === 'critical' || entry.exposure_level === 'high') ? 'high' : 'info',
      confidence: 'high',
    });

    return;
  }

  if (scanTask.phase === 'website_recon' && output) {
    const technologies = normalizeWebsiteReconOutput(output, String(scanTask.target_name || ''));
    await persistWebsiteTechnologies(adminClient, {
      scanJobId,
      organizationId: scanTask.organization_id,
      tenantId: scanTask.tenant_id || scanTask.customer_id,
      customerId: scanTask.customer_id,
      targetId: scanTask.target_id ? String(scanTask.target_id) : null,
      sourceScanId: scanTask.id,
      technologies,
    });

    await adminClient.from('surface_observations' as any).insert({
      organization_id: scanTask.organization_id,
      tenant_id: scanTask.tenant_id || scanTask.customer_id,
      customer_id: scanTask.customer_id,
      scan_job_id: scanJobId,
      module: 'website_recon',
      observation_type: 'technologies',
      title: `Technology fingerprint - ${scanTask.target_name}`,
      value: {
        url: scanTask.target_name,
        technologies,
      },
      severity: 'info',
      confidence: 'medium',
    });

    return;
  }

  if (scanTask.phase === 'ssl_scan' && output) {
    const sslResult = normalizeSslOutput(output, String(scanTask.target_name || ''));
    await persistSslResult(adminClient, {
      scanJobId,
      organizationId: scanTask.organization_id,
      tenantId: scanTask.tenant_id || scanTask.customer_id,
      customerId: scanTask.customer_id,
      targetId: scanTask.target_id ? String(scanTask.target_id) : null,
      sourceScanId: scanTask.id,
      targetUrl: String(scanTask.target_name || ''),
      sslResult,
    });

    await adminClient.from('surface_observations' as any).insert({
      organization_id: scanTask.organization_id,
      tenant_id: scanTask.tenant_id || scanTask.customer_id,
      customer_id: scanTask.customer_id,
      scan_job_id: scanJobId,
      module: 'ssl_scan',
      observation_type: 'tls_snapshot',
      title: `SSL/TLS snapshot - ${scanTask.target_name}`,
      value: sslResult,
      severity: (sslResult.weak_protocols || []).length > 0 || (sslResult.weak_ciphers || []).length > 0 ? 'medium' : 'info',
      confidence: 'medium',
    });

    return;
  }

  if (scanTask.phase === 'network_scan' && Number.isFinite(Number(scanTask.remote_scan_id))) {
    try {
      const findings = toArray(await pentestClient.getFindingsByScanId(Number(scanTask.remote_scan_id)));
      await persistNetworkFindings(adminClient, {
        scanJobId,
        organizationId: scanTask.organization_id,
        tenantId: scanTask.tenant_id || scanTask.customer_id,
        customerId: scanTask.customer_id,
        targetId: scanTask.target_id ? String(scanTask.target_id) : null,
        sourceScanId: scanTask.id,
        targetName: String(scanTask.target_name || ''),
        findings,
      });
    } catch (error: any) {
      console.warn('[ptools-poll] network findings retrieval failed:', error?.message || error);
    }
  }
}

async function refreshJobSummary(adminClient: any, scanJobId: string) {
  const [
    openPortsCountRes,
    highCriticalPortsRes,
    technologiesCountRes,
    findingsCountRes,
    findingsCriticalRes,
    findingsHighRes,
    findingsMediumRes,
  ] = await Promise.all([
    adminClient.from('surface_open_ports' as any).select('id', { count: 'exact', head: true }).eq('scan_job_id', scanJobId),
    adminClient
      .from('surface_open_ports' as any)
      .select('id', { count: 'exact', head: true })
      .eq('scan_job_id', scanJobId)
      .in('exposure_level', ['high', 'critical']),
    adminClient.from('surface_web_technologies' as any).select('id', { count: 'exact', head: true }).eq('scan_job_id', scanJobId),
    adminClient.from('surface_exposure_findings' as any).select('id', { count: 'exact', head: true }).eq('scan_job_id', scanJobId),
    adminClient
      .from('surface_exposure_findings' as any)
      .select('id', { count: 'exact', head: true })
      .eq('scan_job_id', scanJobId)
      .eq('severity', 'critical'),
    adminClient
      .from('surface_exposure_findings' as any)
      .select('id', { count: 'exact', head: true })
      .eq('scan_job_id', scanJobId)
      .eq('severity', 'high'),
    adminClient
      .from('surface_exposure_findings' as any)
      .select('id', { count: 'exact', head: true })
      .eq('scan_job_id', scanJobId)
      .eq('severity', 'medium'),
  ]);

  const summary = {
    open_ports_total: Number(openPortsCountRes.count || 0),
    high_critical_ports: Number(highCriticalPortsRes.count || 0),
    technologies_total: Number(technologiesCountRes.count || 0),
    findings_total: Number(findingsCountRes.count || 0),
    findings_critical: Number(findingsCriticalRes.count || 0),
    findings_high: Number(findingsHighRes.count || 0),
    findings_medium: Number(findingsMediumRes.count || 0),
    updated_at: new Date().toISOString(),
  };

  await adminClient
    .from('surface_scan_jobs' as any)
    .update({ summary })
    .eq('id', scanJobId);
}

async function finalizeJobStatuses(adminClient: any, scanJobIds: string[]) {
  const unique = [...new Set(scanJobIds.filter(Boolean))];

  for (const scanJobId of unique) {
    const { data: tasks } = await adminClient
      .from('pentest_tools_scans' as any)
      .select('status')
      .eq('scan_job_id', scanJobId);

    const rows = (tasks || []) as Array<{ status: string }>;
    const total = rows.length;
    const running = rows.filter((row) => ['queued', 'running', 'waiting', 'retry'].includes(String(row.status || '').toLowerCase())).length;
    const finished = rows.filter((row) => String(row.status || '').toLowerCase() === 'finished').length;
    const failed = rows.filter((row) => String(row.status || '').toLowerCase() === 'failed').length;

    if (total === 0) {
      await adminClient
        .from('surface_scan_jobs' as any)
        .update({
          status: 'failed',
          error_message: 'No Pentest-Tools tasks for this exposure job',
          completed_at: new Date().toISOString(),
        })
        .eq('id', scanJobId);
      continue;
    }

    if (running > 0) {
      await adminClient
        .from('surface_scan_jobs' as any)
        .update({
          status: 'running',
          completed_at: null,
        })
        .eq('id', scanJobId);
      continue;
    }

    const finalStatus = finished > 0 ? 'completed' : 'failed';
    await adminClient
      .from('surface_scan_jobs' as any)
      .update({
        status: finalStatus,
        completed_at: new Date().toISOString(),
        error_message: finalStatus === 'failed' ? 'All Pentest-Tools tasks failed' : null,
      })
      .eq('id', scanJobId);

    await refreshJobSummary(adminClient, scanJobId);

    await adminClient.from('surface_scan_audit_log' as any).insert({
      scan_job_id: scanJobId,
      action: 'ptools_poll_finalize_job',
      details: {
        tasks_total: total,
        tasks_finished: finished,
        tasks_failed: failed,
        final_status: finalStatus,
      },
    });
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (!['POST', 'GET'].includes(req.method)) return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    let requestPayload: Record<string, unknown> = {};
    if (req.method === 'POST') {
      try {
        requestPayload = (await req.json()) as Record<string, unknown>;
      } catch {
        requestPayload = {};
      }
    }

    const authHeader = req.headers.get('Authorization') || '';
    const bearer = authHeader.replace(/^Bearer\s+/i, '').trim();
    const providedInternalSecret = req.headers.get('x-surface-internal-secret') || req.headers.get('x-cron-secret') || '';
    const cronMarkerHeader = String(req.headers.get('x-surface-cron') || '').trim();
    const cronTrigger = String(requestPayload?.trigger || '').trim().toLowerCase();

    const serviceRoleAuth = Boolean(SERVICE_ROLE && bearer && bearer === SERVICE_ROLE);
    const internalAuth = Boolean(INTERNAL_SECRET && providedInternalSecret && providedInternalSecret === INTERNAL_SECRET);
    const cronMarkerAuth = cronMarkerHeader === '1' && cronTrigger === 'cron';

    if (!serviceRoleAuth && !internalAuth && !cronMarkerAuth) {
      if (!SUPABASE_URL || !SERVICE_ROLE) return jsonResponse({ error: 'Server is not configured' }, 500);
      const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') || '', {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      });
      const { data: authData, error } = await userClient.auth.getUser();
      if (error || !authData.user) return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return jsonResponse({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }, 500);
    }

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
    const pentestClient = new PentestToolsClient();

    const { data: queuedJobs } = await adminClient
      .from('surface_scan_jobs' as any)
      .select('id')
      .eq('scan_type', 'exposure_port_technology')
      .in('status', ['queued', 'running'])
      .order('created_at', { ascending: true })
      .limit(40);

    const touchedJobIds = new Set<string>();
    const recoveryStats = {
      recovered_to_retry: 0,
      failed_stale: 0,
    };

    const { data: activeTaskJobs } = await adminClient
      .from('pentest_tools_scans' as any)
      .select('scan_job_id')
      .in('status', ['queued', 'retry', 'running', 'waiting'])
      .limit(400);

    const recoveryJobIds = new Set<string>();
    for (const job of queuedJobs || []) {
      const jobId = String((job as any).id || '').trim();
      if (jobId) recoveryJobIds.add(jobId);
    }
    for (const row of activeTaskJobs || []) {
      const jobId = String((row as any).scan_job_id || '').trim();
      if (jobId) recoveryJobIds.add(jobId);
    }

    for (const jobId of recoveryJobIds) {
      if (!jobId) continue;
      touchedJobIds.add(jobId);
      const recovery = await recoverStaleScansForJob(adminClient, jobId);
      recoveryStats.recovered_to_retry += recovery.recoveredToRetry;
      recoveryStats.failed_stale += recovery.failedStale;
      if (recovery.recoveredToRetry > 0 || recovery.failedStale > 0) {
        await adminClient.from('surface_scan_audit_log' as any).insert({
          scan_job_id: jobId,
          action: 'ptools_poll_stale_recovery',
          details: {
            recovered_to_retry: recovery.recoveredToRetry,
            failed_stale: recovery.failedStale,
          },
        });
      }
      await startQueuedScansForJob(adminClient, jobId);
    }

    const { data: runningTasks } = await adminClient
      .from('pentest_tools_scans' as any)
      .select('*')
      .in('status', ['running', 'waiting'])
      .order('updated_at', { ascending: true })
      .limit(MAX_POLL_TASKS);

    const processed: Array<Record<string, unknown>> = [];
    const processingStats = {
      retry_scheduled: 0,
      failed_after_retry: 0,
    };

    for (const task of (runningTasks || []) as any[]) {
      const scanTaskId = String(task.id || '');
      const scanJobId = String(task.scan_job_id || '');
      if (!scanTaskId || !scanJobId) continue;
      touchedJobIds.add(scanJobId);

      const remoteScanId = Number(task.remote_scan_id || 0);
      if (!Number.isFinite(remoteScanId) || remoteScanId <= 0) {
        const retryCount = Number(task.retry_count || 0);
        if (retryCount < 1) {
          const retryAt = nextRetryIsoFromMinutes(computeRetryDelayMinutes(retryCount));
          await adminClient.from('pentest_tools_scans' as any).update({
            status: 'retry',
            retry_count: retryCount + 1,
            next_retry_at: retryAt,
            error_message: 'Missing remote scan id, retry scheduled',
          }).eq('id', scanTaskId);
          processingStats.retry_scheduled += 1;
          processed.push({ task_id: scanTaskId, status: 'retry_missing_remote_id' });
        } else {
          await adminClient.from('pentest_tools_scans' as any).update({
            status: 'failed',
            finished_at: new Date().toISOString(),
            error_message: 'Missing remote scan id after recovery retry',
            updated_at: new Date().toISOString(),
          }).eq('id', scanTaskId);
          processingStats.failed_after_retry += 1;
          processed.push({ task_id: scanTaskId, status: 'failed_missing_remote_id' });
        }
        continue;
      }

      try {
        const remoteStatusPayload = await pentestClient.getScan(remoteScanId);
        const parsed = parseRemoteStatusPayload(remoteStatusPayload);
        const normalizedStatus = normalizeScanStatus(parsed.statusName);

        if (normalizedStatus === 'running' || normalizedStatus === 'waiting') {
          await adminClient.from('pentest_tools_scans' as any).update({
            status: normalizedStatus,
            progress: parsed.progress,
            error_message: null,
            updated_at: new Date().toISOString(),
          }).eq('id', scanTaskId);
          processed.push({ task_id: scanTaskId, status: normalizedStatus, progress: parsed.progress });
          continue;
        }

        if (isTerminalErrorStatus(parsed.statusName) || normalizedStatus === 'failed') {
          await adminClient.from('pentest_tools_scans' as any).update({
            status: 'failed',
            progress: parsed.progress,
            finished_at: new Date().toISOString(),
            error_message: `Remote status: ${parsed.statusName}`,
            updated_at: new Date().toISOString(),
          }).eq('id', scanTaskId);
          processed.push({ task_id: scanTaskId, status: 'failed', remote_status: parsed.statusName });
          continue;
        }

        await adminClient.from('pentest_tools_scans' as any).update({
          status: 'finished',
          progress: 100,
          finished_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', scanTaskId);

        const { data: refreshedTask } = await adminClient
          .from('pentest_tools_scans' as any)
          .select('*')
          .eq('id', scanTaskId)
          .maybeSingle();

        if (refreshedTask) {
          await processFinishedTask(adminClient, pentestClient, refreshedTask);
        }

        processed.push({ task_id: scanTaskId, status: 'finished', remote_status: parsed.statusName });
      } catch (error: any) {
        const retryCount = Number(task.retry_count || 0);
        if (retryCount < 5) {
          await adminClient.from('pentest_tools_scans' as any).update({
            status: 'retry',
            retry_count: retryCount + 1,
            next_retry_at: nextRetryIsoFromMinutes(computeRetryDelayMinutes(retryCount)),
            error_message: error?.message ? String(error.message).slice(0, 4000) : 'Polling error, retry scheduled',
            updated_at: new Date().toISOString(),
          }).eq('id', scanTaskId);
          processingStats.retry_scheduled += 1;
          processed.push({ task_id: scanTaskId, status: 'retry', error: error?.message || 'poll error' });
        } else {
          await adminClient.from('pentest_tools_scans' as any).update({
            status: 'failed',
            error_message: error?.message ? String(error.message).slice(0, 4000) : 'Polling error',
            finished_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq('id', scanTaskId);
          processingStats.failed_after_retry += 1;
          processed.push({ task_id: scanTaskId, status: 'failed_after_retries', error: error?.message || 'poll error' });
        }
      }
    }

    for (const jobId of touchedJobIds) {
      await startQueuedScansForJob(adminClient, jobId);
    }

    await finalizeJobStatuses(adminClient, Array.from(touchedJobIds));

    return jsonResponse({
      ok: true,
      poll_interval_seconds: getPollIntervalSeconds(),
      parallel_limit: getMaxParallelScans(),
      touched_jobs: Array.from(touchedJobIds),
      recovery: recoveryStats,
      processing: processingStats,
      invocation: cronMarkerAuth ? 'cron_marker' : serviceRoleAuth ? 'service_role' : internalAuth ? 'internal_secret' : 'user',
      processed_count: processed.length,
      processed,
    });
  } catch (error: any) {
    console.error('[ptools-poll-scans] fatal error:', error);
    return jsonResponse({ error: error?.message || 'Internal error' }, 500);
  }
});
