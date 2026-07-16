import { createClient } from "npm:@supabase/supabase-js@2";

export type HiTrackCollectorRow = {
  id: string;
  organization_id: string;
  domotz_organization_id: number | null;
  domotz_agent_id: number;
  collector_name: string;
  collector_status: string;
  matching_rule: string | null;
};

type DomotzVariable = {
  id?: number;
  device_id?: number;
  path?: string;
  label?: string;
  unit?: string | null;
  value?: string | number | null;
  metric?: string | null;
  has_history?: boolean;
};

type DomotzDevice = {
  id: number;
  name?: string;
  ip?: string;
  type?: string;
  vendor?: string;
  model?: string;
  location?: string;
  os?: { name?: string; version?: string } | null;
  status_last_change?: string | null;
};

type DomotzRtd = {
  device_id: number;
  avg_max?: number | null;
  avg_median?: number | null;
  latest_lost_packet_count?: number | null;
  latest_sent_packet_count?: number | null;
};

const textEncoder = new TextEncoder();

export function requiredEnv(name: string) {
  const value = String(Deno.env.get(name) || "").trim();
  if (!value) {
    throw new Error(`missing_${name.toLowerCase()}`);
  }
  return value;
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-hitrack-internal-secret, content-type",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    },
  });
}

export function createAdminClient() {
  return createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

export function timingSafeEqual(a: string, b: string) {
  const left = textEncoder.encode(a);
  const right = textEncoder.encode(b);
  const maxLength = Math.max(left.length, right.length);
  let mismatch = left.length === right.length ? 0 : 1;
  for (let index = 0; index < maxLength; index += 1) {
    mismatch |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return mismatch === 0;
}

export function normalizeAlias(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export async function requireInternalRequest(req: Request) {
  const candidate = String(
    req.headers.get("x-hitrack-internal-secret") ||
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
      "",
  ).trim();
  const expected = requiredEnv("HITRACK_CRON_INTERNAL_SECRET");
  if (!candidate || !timingSafeEqual(candidate, expected)) {
    throw new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }
}

export async function requireUserContext(
  req: Request,
  organizationId: string,
  requireAdmin = false,
) {
  const token = String(req.headers.get("authorization") || "").replace(
    /^Bearer\s+/i,
    "",
  ).trim();
  if (!token) {
    throw new Response(JSON.stringify({ error: "missing_bearer" }), { status: 401 });
  }

  const admin = createAdminClient();
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user?.id) {
    throw new Response(JSON.stringify({ error: "invalid_jwt" }), { status: 401 });
  }

  const rpcName = requireAdmin ? "hitrack_is_org_admin" : "hitrack_can_access_organization";
  const { data: allowed, error: accessError } = await admin.rpc(rpcName, {
    _user_id: userData.user.id,
    _organization_id: organizationId,
  });
  if (accessError || allowed !== true) {
    throw new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  }

  return {
    admin,
    user: userData.user,
    token,
  };
}

export async function domotzGet<T>(
  path: string,
  params?: Record<string, string | number | boolean | null | undefined>,
) {
  const baseUrl = requiredEnv("DOMOTZ_API_BASE_URL").replace(/\/+$/, "");
  const apiKey = requiredEnv("DOMOTZ_API_KEY");
  const url = new URL(`${baseUrl}/${path.replace(/^\/+/, "")}`);
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "X-Api-Key": apiKey,
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`domotz_http_${response.status}`);
  }
  return await response.json() as T;
}

export function parseNumeric(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function packetLossPercent(rtd: DomotzRtd) {
  const lost = Number(rtd.latest_lost_packet_count || 0);
  const sent = Number(rtd.latest_sent_packet_count || 0);
  if (!Number.isFinite(sent) || sent <= 0) return null;
  return Number(((lost / sent) * 100).toFixed(2));
}

export function trendFromSamples(
  samples: Array<{ numeric_value: number | null }>,
) {
  return samples
    .map((entry) => entry.numeric_value)
    .filter((value): value is number => value !== null && Number.isFinite(value));
}

export async function loadMetricTrends(
  admin: ReturnType<typeof createAdminClient>,
  query: {
    collector_id: string;
    device_id?: string;
    metric_key: string;
    source_key: string;
    dimension_key?: string;
  },
) {
  const windows = [
    { name: "trend_24h", hours: 24 },
    { name: "trend_7d", hours: 24 * 7 },
    { name: "trend_30d", hours: 24 * 30 },
  ] as const;

  const result: Record<string, number[]> = {};
  for (const window of windows) {
    let request = admin
      .from("hitrack_metric_samples")
      .select("numeric_value")
      .eq("collector_id", query.collector_id)
      .eq("metric_key", query.metric_key)
      .eq("source_key", query.source_key)
      .gte(
        "sampled_at",
        new Date(Date.now() - window.hours * 60 * 60 * 1000).toISOString(),
      )
      .order("sampled_at", { ascending: true })
      .limit(48);

    request = query.device_id
      ? request.eq("device_id", query.device_id)
      : request.is("device_id", null);
    request = request.eq("dimension_key", query.dimension_key || "");

    const { data } = await request;
    result[window.name] = trendFromSamples(
      (data || []) as Array<{ numeric_value: number | null }>,
    );
  }

  return result as {
    trend_24h: number[];
    trend_7d: number[];
    trend_30d: number[];
  };
}

export async function fetchCollectorSnapshot(agentId: number) {
  const now = new Date();
  const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const to = now.toISOString();

  const [
    organization,
    collector,
    devices,
    unmanaged,
    rtdRows,
    collectorVariables,
    deviceVariables,
    alertPayload,
  ] = await Promise.all([
    domotzGet<{ id: number; name?: string }>("organization"),
    domotzGet<Record<string, unknown>>(`agent/${agentId}`),
    domotzGet<DomotzDevice[]>(
      `agent/${agentId}/device`,
      { show_hidden: false, show_excluded: false },
    ),
    domotzGet<unknown[]>(`agent/${agentId}/device/monitoring-state/unmanaged`),
    domotzGet<DomotzRtd[]>(`agent/${agentId}/device/rtd`),
    domotzGet<DomotzVariable[]>(`agent/${agentId}/variable`),
    domotzGet<DomotzVariable[]>(`agent/${agentId}/device/variable`),
    domotzGet<{ total_count?: number; alerts?: Array<Record<string, unknown>> }>(
      "alert",
      { from, to },
    ),
  ]);

  return {
    organization,
    collector,
    devices,
    unmanaged,
    rtdRows,
    collectorVariables,
    deviceVariables,
    openAlerts: (alertPayload.alerts || []).filter((entry) =>
      Number(entry.collector_id || 0) === agentId &&
      String(entry.status || "").toLowerCase() !== "closed"
    ).length,
  };
}

function collectorMetricKey(variable: DomotzVariable) {
  switch (variable.path) {
    case "agent_performance/unloaded-packet-loss":
      return "collector_unloaded_packet_loss_percent";
    case "agent_performance/speed-test/upload":
      return "collector_speed_test_upload_bps";
    case "agent_performance/speed-test/download":
      return "collector_speed_test_download_bps";
    case "agent_performance/loaded-jitter-upload":
      return "collector_loaded_jitter_upload_ms";
    case "agent_performance/loaded-jitter-download":
      return "collector_loaded_jitter_download_ms";
    default:
      return null;
  }
}

function deviceMetricKey(variable: DomotzVariable) {
  const path = String(variable.path || "");
  const label = String(variable.label || "");
  if (/custom-driver\/7851\/table\/host-[^/]+\/column\/7$/i.test(path)) {
    return { metricKey: "ram_total_gib", dimensionKey: label.replace(/\s*-\s*Memory$/i, "") };
  }
  if (/custom-driver\/7851\/table\/host-[^/]+\/column\/8$/i.test(path)) {
    return { metricKey: "ram_usage_percent", dimensionKey: label.replace(/\s*-\s*Memory Usage$/i, "") };
  }
  if (/custom-driver\/7846\/table\/datastore-[^/]+\/column\/3$/i.test(path)) {
    return { metricKey: "disk_capacity_gib", dimensionKey: label.replace(/\s*-\s*Capacity$/i, "") };
  }
  if (/custom-driver\/7846\/table\/datastore-[^/]+\/column\/4$/i.test(path)) {
    return { metricKey: "disk_free_gib", dimensionKey: label.replace(/\s*-\s*Free Space$/i, "") };
  }
  if (/custom-driver\/7846\/table\/datastore-[^/]+\/column\/5$/i.test(path)) {
    return { metricKey: "disk_usage_percent", dimensionKey: label.replace(/\s*-\s*Usage$/i, "") };
  }
  if (path === "snmp/preset/idrac-general/globalStorageStatus") {
    return { metricKey: "device_storage_status", dimensionKey: "" };
  }
  if (/systemStateMemoryDeviceStatusCombined$/i.test(path)) {
    return { metricKey: "device_memory_status", dimensionKey: "" };
  }
  return null;
}

export async function discoverCollectorCandidates(
  organizationName: string,
) {
  const agents = await domotzGet<Array<Record<string, unknown>>>("agent", {
    page_size: 200,
    page_number: 0,
  });
  const target = normalizeAlias(organizationName);
  return agents
    .map((agent) => ({
      agentId: Number(agent.id || 0),
      name: String(agent.name || agent.display_name || ""),
      status: String(agent.status || "UNKNOWN"),
      organizationId: Number(agent.organization_id || 0),
      matched: normalizeAlias(String(agent.name || agent.display_name || "")).includes(target),
    }))
    .filter((entry) => entry.agentId > 0)
    .sort((left, right) => Number(right.matched) - Number(left.matched));
}

export async function syncCollector(
  admin: ReturnType<typeof createAdminClient>,
  collectorRow: HiTrackCollectorRow,
) {
  const snapshot = await fetchCollectorSnapshot(collectorRow.domotz_agent_id);
  const syncedAt = new Date().toISOString();

  await admin.from("hitrack_collectors").update({
    domotz_organization_id: snapshot.organization.id,
    collector_name: String(snapshot.collector.name || collectorRow.collector_name),
    collector_status: String(snapshot.collector.status || "UNKNOWN"),
    last_discovered_at: syncedAt,
    last_synced_at: syncedAt,
    last_successful_sync_at: syncedAt,
    last_error_code: null,
    last_error_message: null,
  }).eq("id", collectorRow.id);

  const deviceMap = new Map<number, string>();
  for (const device of snapshot.devices) {
    const upsertPayload = {
      organization_id: collectorRow.organization_id,
      collector_id: collectorRow.id,
      domotz_device_id: device.id,
      device_name: String(device.name || `device-${device.id}`),
      ip_address: device.ip || null,
      device_type: device.type || null,
      vendor: device.vendor || null,
      model: device.model || null,
      monitoring_state: "managed",
      managed: true,
      location: device.location || null,
      os_name: device.os?.name || null,
      os_version: device.os?.version || null,
      last_status_change_at: device.status_last_change || null,
      last_seen_at: syncedAt,
      raw_summary: device,
    };
    const { data, error } = await admin
      .from("hitrack_devices")
      .upsert(upsertPayload, {
        onConflict: "collector_id,domotz_device_id",
      })
      .select("id,domotz_device_id")
      .single();
    if (error) throw error;
    deviceMap.set(Number(data.domotz_device_id), String(data.id));
  }

  const rtdByDevice = new Map<number, DomotzRtd>();
  for (const row of snapshot.rtdRows) {
    rtdByDevice.set(Number(row.device_id), row);
  }

  for (const variable of snapshot.collectorVariables) {
    const metricKey = collectorMetricKey(variable);
    if (!metricKey) continue;
    const sourceKey = String(variable.id || metricKey);
    const numericValue = parseNumeric(variable.value);
    await admin.from("hitrack_metric_samples").insert({
      organization_id: collectorRow.organization_id,
      collector_id: collectorRow.id,
      metric_key: metricKey,
      source_variable_id: variable.id || null,
      source_key: sourceKey,
      dimension_key: "",
      numeric_value: numericValue,
      text_value: numericValue === null ? String(variable.value || "") : null,
      sampled_at: syncedAt,
    });
    const trends = await loadMetricTrends(admin, {
      collector_id: collectorRow.id,
      metric_key: metricKey,
      source_key: sourceKey,
      dimension_key: "",
    });
    await admin.from("hitrack_collector_metrics_latest").upsert({
      organization_id: collectorRow.organization_id,
      collector_id: collectorRow.id,
      metric_key: metricKey,
      source_variable_id: variable.id || null,
      source_key: sourceKey,
      metric_label: variable.label || null,
      metric_path: variable.path || null,
      metric_unit: variable.unit || null,
      numeric_value: numericValue,
      text_value: numericValue === null ? String(variable.value || "") : null,
      has_history: variable.has_history === true,
      trend_24h: trends.trend_24h,
      trend_7d: trends.trend_7d,
      trend_30d: trends.trend_30d,
      sampled_at: syncedAt,
    }, {
      onConflict: "collector_id,metric_key,source_key",
    });
  }

  for (const device of snapshot.devices) {
    const deviceId = deviceMap.get(device.id);
    if (!deviceId) continue;
    const rtd = rtdByDevice.get(device.id);
    const derivedMetrics = [
      {
        metric_key: "rtd_worst_ms",
        source_key: `rtd:${device.id}:worst`,
        numeric_value: parseNumeric(rtd?.avg_max),
      },
      {
        metric_key: "rtd_median_ms",
        source_key: `rtd:${device.id}:median`,
        numeric_value: parseNumeric(rtd?.avg_median),
      },
      {
        metric_key: "packet_loss_percent",
        source_key: `rtd:${device.id}:loss`,
        numeric_value: packetLossPercent(rtd || { device_id: device.id }),
      },
    ];

    for (const metric of derivedMetrics) {
      await admin.from("hitrack_metric_samples").insert({
        organization_id: collectorRow.organization_id,
        collector_id: collectorRow.id,
        device_id: deviceId,
        metric_key: metric.metric_key,
        source_key: metric.source_key,
        dimension_key: "",
        numeric_value: metric.numeric_value,
        sampled_at: syncedAt,
      });
      const trends = await loadMetricTrends(admin, {
        collector_id: collectorRow.id,
        device_id: deviceId,
        metric_key: metric.metric_key,
        source_key: metric.source_key,
        dimension_key: "",
      });
      await admin.from("hitrack_device_metrics_latest").upsert({
        organization_id: collectorRow.organization_id,
        collector_id: collectorRow.id,
        device_id: deviceId,
        metric_key: metric.metric_key,
        source_key: metric.source_key,
        dimension_key: "",
        numeric_value: metric.numeric_value,
        sampled_at: syncedAt,
        trend_24h: trends.trend_24h,
        trend_7d: trends.trend_7d,
        trend_30d: trends.trend_30d,
      }, {
        onConflict: "device_id,metric_key,dimension_key,source_key",
      });
    }
  }

  for (const variable of snapshot.deviceVariables) {
    const parsed = deviceMetricKey(variable);
    const deviceId = deviceMap.get(Number(variable.device_id || 0));
    if (!parsed || !deviceId) continue;
    const sourceKey = String(variable.id || `${parsed.metricKey}:${parsed.dimensionKey}`);
    const numericValue = parseNumeric(variable.value);
    await admin.from("hitrack_metric_samples").insert({
      organization_id: collectorRow.organization_id,
      collector_id: collectorRow.id,
      device_id: deviceId,
      metric_key: parsed.metricKey,
      source_variable_id: variable.id || null,
      source_key: sourceKey,
      dimension_key: parsed.dimensionKey,
      numeric_value: numericValue,
      text_value: numericValue === null ? String(variable.value || "") : null,
      sampled_at: syncedAt,
    });
    const trends = await loadMetricTrends(admin, {
      collector_id: collectorRow.id,
      device_id: deviceId,
      metric_key: parsed.metricKey,
      source_key: sourceKey,
      dimension_key: parsed.dimensionKey,
    });
    await admin.from("hitrack_device_metrics_latest").upsert({
      organization_id: collectorRow.organization_id,
      collector_id: collectorRow.id,
      device_id: deviceId,
      metric_key: parsed.metricKey,
      source_variable_id: variable.id || null,
      source_key: sourceKey,
      metric_label: variable.label || null,
      metric_path: variable.path || null,
      metric_unit: variable.unit || null,
      dimension_key: parsed.dimensionKey,
      numeric_value: numericValue,
      text_value: numericValue === null ? String(variable.value || "") : null,
      has_history: variable.has_history === true,
      trend_24h: trends.trend_24h,
      trend_7d: trends.trend_7d,
      trend_30d: trends.trend_30d,
      sampled_at: syncedAt,
    }, {
      onConflict: "device_id,metric_key,dimension_key,source_key",
    });
  }

  const managedDevices = snapshot.devices.length;
  const unmanagedDevices = snapshot.unmanaged.length;
  const onlineDevices = snapshot.devices.length;
  const offlineDevices = 0;
  const devicesWithRamMetrics = new Set(
    snapshot.deviceVariables
      .filter((entry) => deviceMetricKey(entry)?.metricKey === "ram_usage_percent")
      .map((entry) => Number(entry.device_id || 0)),
  ).size;
  const devicesWithDiskMetrics = new Set(
    snapshot.deviceVariables
      .filter((entry) => deviceMetricKey(entry)?.metricKey === "disk_usage_percent")
      .map((entry) => Number(entry.device_id || 0)),
  ).size;
  const coverage = managedDevices > 0
    ? Number(
      (
        ((devicesWithRamMetrics + devicesWithDiskMetrics) / (managedDevices * 2)) *
        100
      ).toFixed(2),
    )
    : 0;
  const averagePacketLoss = snapshot.rtdRows.length > 0
    ? Number(
      (
        snapshot.rtdRows
          .map((row) => packetLossPercent(row) || 0)
          .reduce((sum, value) => sum + value, 0) / snapshot.rtdRows.length
      ).toFixed(2),
    )
    : 0;
  const freshnessSeconds = 0;
  const healthScore = Number(
    (
      await admin.rpc("hitrack_health_score", {
        _online_devices: onlineDevices,
        _managed_devices: managedDevices,
        _open_alerts: snapshot.openAlerts,
        _avg_packet_loss_percent: averagePacketLoss,
        _data_coverage_percent: coverage,
        _freshness_seconds: freshnessSeconds,
      })
    ).data || 0,
  );

  await admin.from("hitrack_health_snapshots").insert({
    organization_id: collectorRow.organization_id,
    collector_id: collectorRow.id,
    monitored_devices: managedDevices,
    managed_devices: managedDevices,
    unmanaged_devices: unmanagedDevices,
    online_devices: onlineDevices,
    offline_devices: offlineDevices,
    open_alerts: snapshot.openAlerts,
    avg_uptime_percent: managedDevices > 0 ? 100 : 0,
    avg_packet_loss_percent: averagePacketLoss,
    health_score: healthScore,
    data_coverage_percent: coverage,
    freshness_seconds: freshnessSeconds,
    sampled_at: syncedAt,
  });

  return {
    collectorId: collectorRow.id,
    managedDevices,
    unmanagedDevices,
    openAlerts: snapshot.openAlerts,
    dataCoveragePercent: coverage,
    healthScore,
  };
}
