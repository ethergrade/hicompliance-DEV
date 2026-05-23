import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { corsHeaders, makeSupabaseClients, getCallerProfile, assertCustomerAccess } from '../_shared/surface-scan-utils.ts';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

type OpenPortSnapshot = {
  host: string;
  port: number;
  protocol: string;
  service_name?: string | null;
  exposure_level?: string | null;
};

type TechnologySnapshot = {
  host: string;
  url: string;
  technology_name: string;
  technology_version?: string | null;
};

function keyOpenPort(row: OpenPortSnapshot): string {
  return `${String(row.host || '').toLowerCase()}|${Number(row.port || 0)}|${String(row.protocol || 'tcp').toLowerCase()}`;
}

function keyTech(row: TechnologySnapshot): string {
  return `${String(row.host || '').toLowerCase()}|${String(row.url || '').toLowerCase()}|${String(row.technology_name || '').toLowerCase()}|${String(row.technology_version || '').toLowerCase()}`;
}

function compareExposureSnapshots(previousPorts: OpenPortSnapshot[], currentPorts: OpenPortSnapshot[], previousTech: TechnologySnapshot[], currentTech: TechnologySnapshot[]) {
  const previousPortMap = new Map(previousPorts.map((row) => [keyOpenPort(row), row]));
  const currentPortMap = new Map(currentPorts.map((row) => [keyOpenPort(row), row]));

  const new_open_ports = Array.from(currentPortMap.entries())
    .filter(([key]) => !previousPortMap.has(key))
    .map(([, value]) => value);

  const closed_ports = Array.from(previousPortMap.entries())
    .filter(([key]) => !currentPortMap.has(key))
    .map(([, value]) => value);

  const unchanged_ports = Array.from(currentPortMap.entries())
    .filter(([key]) => previousPortMap.has(key))
    .map(([, value]) => value);

  const previousTechMap = new Map(previousTech.map((row) => [keyTech(row), row]));
  const currentTechMap = new Map(currentTech.map((row) => [keyTech(row), row]));

  const new_technologies = Array.from(currentTechMap.entries())
    .filter(([key]) => !previousTechMap.has(key))
    .map(([, value]) => value);

  const removed_technologies = Array.from(previousTechMap.entries())
    .filter(([key]) => !currentTechMap.has(key))
    .map(([, value]) => value);

  return {
    new_open_ports,
    closed_ports,
    unchanged_ports,
    new_technologies,
    removed_technologies,
  };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (!['GET', 'POST'].includes(req.method)) return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const { userClient, adminClient } = makeSupabaseClients(req);
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const body = req.method === 'POST' ? await req.json() : {};
    const query = new URL(req.url).searchParams;

    const customerIdInput = String(
      body?.customer_id || query.get('customer_id') || '',
    ).trim();
    const jobIdInput = String(
      body?.job_id || query.get('job_id') || '',
    ).trim();

    const caller = await getCallerProfile(adminClient, authData.user.id);
    const customerId = customerIdInput || caller.organizationId || '';
    if (!customerId) return jsonResponse({ error: 'customer_id is required' }, 400);
    assertCustomerAccess(caller, customerId);

    let jobId = jobIdInput;
    if (!jobId) {
      const { data: latestJob } = await adminClient
        .from('surface_scan_jobs' as any)
        .select('id')
        .eq('customer_id', customerId)
        .eq('scan_type', 'exposure_port_technology')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!latestJob?.id) {
        return jsonResponse({
          job_id: null,
          targets_total: 0,
          hosts_with_open_ports: 0,
          open_ports_total: 0,
          critical_exposures: 0,
          web_services: 0,
          tls_services: 0,
          top_open_ports: [],
          technologies: [],
          findings_by_severity: {
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
            info: 0,
          },
          diff: {
            new_open_ports: [],
            closed_ports: [],
            unchanged_ports: [],
            new_technologies: [],
            removed_technologies: [],
          },
        });
      }

      jobId = String(latestJob.id);
    }

    const { data: job } = await adminClient
      .from('surface_scan_jobs' as any)
      .select('*')
      .eq('id', jobId)
      .single();

    if (!job) return jsonResponse({ error: 'Job not found' }, 404);
    const resolvedCustomerId = String(job.customer_id || job.organization_id || customerId).trim();
    assertCustomerAccess(caller, resolvedCustomerId);

    const [
      targetsRes,
      openPortsRes,
      findingsRes,
      technologiesRes,
      sslRes,
      previousJobRes,
    ] = await Promise.all([
      adminClient.from('surface_scan_targets' as any).select('id').eq('scan_job_id', jobId),
      adminClient
        .from('surface_open_ports' as any)
        .select('host, ip, port, protocol, service_name, service_product, service_version, exposure_level, is_web, is_tls')
        .eq('scan_job_id', jobId),
      adminClient
        .from('surface_exposure_findings' as any)
        .select('severity')
        .eq('scan_job_id', jobId),
      adminClient
        .from('surface_web_technologies' as any)
        .select('url, host, technology_name, technology_version, category')
        .eq('scan_job_id', jobId),
      adminClient
        .from('surface_ssl_results' as any)
        .select('id')
        .eq('scan_job_id', jobId),
      adminClient
        .from('surface_scan_jobs' as any)
        .select('id')
        .eq('customer_id', resolvedCustomerId)
        .eq('scan_type', 'exposure_port_technology')
        .lt('created_at', String(job.created_at || new Date().toISOString()))
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const targets = (targetsRes.data || []) as any[];
    const openPorts = (openPortsRes.data || []) as any[];
    const findings = (findingsRes.data || []) as any[];
    const technologies = (technologiesRes.data || []) as any[];
    const ssl = (sslRes.data || []) as any[];

    const hostsWithOpenPorts = new Set(openPorts.map((row) => String(row.host || '').trim().toLowerCase()).filter(Boolean));
    const topPortCounter = new Map<number, number>();
    for (const row of openPorts) {
      const port = Number(row.port || 0);
      if (!Number.isFinite(port) || port <= 0) continue;
      topPortCounter.set(port, (topPortCounter.get(port) || 0) + 1);
    }

    const technologyCounter = new Map<string, number>();
    for (const row of technologies) {
      const name = String(row.technology_name || '').trim();
      if (!name) continue;
      technologyCounter.set(name, (technologyCounter.get(name) || 0) + 1);
    }

    const findingsBySeverity = {
      critical: findings.filter((row) => String(row.severity || '').toLowerCase() === 'critical').length,
      high: findings.filter((row) => String(row.severity || '').toLowerCase() === 'high').length,
      medium: findings.filter((row) => String(row.severity || '').toLowerCase() === 'medium').length,
      low: findings.filter((row) => String(row.severity || '').toLowerCase() === 'low').length,
      info: findings.filter((row) => String(row.severity || '').toLowerCase() === 'info').length,
    };

    let diff = {
      new_open_ports: [] as OpenPortSnapshot[],
      closed_ports: [] as OpenPortSnapshot[],
      unchanged_ports: [] as OpenPortSnapshot[],
      new_technologies: [] as TechnologySnapshot[],
      removed_technologies: [] as TechnologySnapshot[],
    };

    if (previousJobRes.data?.id) {
      const previousJobId = String(previousJobRes.data.id);
      const [prevPortsRes, prevTechRes] = await Promise.all([
        adminClient
          .from('surface_open_ports' as any)
          .select('host, port, protocol, service_name, exposure_level')
          .eq('scan_job_id', previousJobId),
        adminClient
          .from('surface_web_technologies' as any)
          .select('host, url, technology_name, technology_version')
          .eq('scan_job_id', previousJobId),
      ]);

      diff = compareExposureSnapshots(
        (prevPortsRes.data || []) as OpenPortSnapshot[],
        (openPorts || []) as OpenPortSnapshot[],
        (prevTechRes.data || []) as TechnologySnapshot[],
        (technologies || []) as TechnologySnapshot[],
      );
    }

    return jsonResponse({
      job_id: jobId,
      status: String(job.status || 'unknown'),
      targets_total: targets.length,
      hosts_with_open_ports: hostsWithOpenPorts.size,
      open_ports_total: openPorts.length,
      critical_exposures: findingsBySeverity.critical + findingsBySeverity.high,
      web_services: openPorts.filter((row) => Boolean(row.is_web)).length,
      tls_services: openPorts.filter((row) => Boolean(row.is_tls)).length,
      ssl_snapshots: ssl.length,
      top_open_ports: Array.from(topPortCounter.entries())
        .map(([port, count]) => ({ port, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      technologies: Array.from(technologyCounter.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20),
      findings_by_severity: findingsBySeverity,
      diff,
    });
  } catch (error: any) {
    return jsonResponse({ error: error?.message || 'Internal error' }, 500);
  }
});

