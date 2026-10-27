import { complianceApiClient } from "@/lib/api-client";
import type { ApiResponse } from "@/types/api";
import {
  EMPTY_HITRACK_DASHBOARD,
  type HiTrackCollector,
  type HiTrackDashboardPayload,
  type HiTrackDeviceDetail,
  type HiTrackDeviceGroup,
  type HiTrackDeviceStatus,
  type HiTrackHealthHistory,
  type HiTrackHistoryRange,
  type HiTrackInterfaceHistory,
  type HiTrackNetworkQualityHistory,
  type HiTrackOrganize,
} from "@/lib/hitrack/types";

/**
 * HiTrack passa dal backend Laravel.
 *
 * Prima le tre chiamate andavano su Supabase — due RPC e una edge function — ma
 * il browser autentica su Laravel e non ha mai avuto una sessione Supabase
 * valida: è il motivo per cui la dashboard non era utilizzabile. Ora il payload
 * arriva da `/companies/{id}/hitrack/*` nella stessa forma di prima, quindi
 * `HiTrackDashboard.tsx`, `types.ts` e `formatters.ts` non cambiano.
 */

const groupHeader = (groupId?: string | null) =>
  groupId ? { headers: { "X-Group-Id": groupId } } : undefined;

export async function fetchHiTrackDashboard(
  organizationId: string,
  groupId?: string | null,
): Promise<HiTrackDashboardPayload> {
  const res = await complianceApiClient.get<
    ApiResponse<HiTrackDashboardPayload>
  >(
    `/companies/${organizationId}/hitrack/dashboard`,
    undefined,
    groupHeader(groupId),
  );

  // Lo stato vuoto resta la base: se un giorno il payload perdesse una sezione,
  // i pannelli hanno comunque qualcosa da leggere invece di rompersi.
  return { ...EMPTY_HITRACK_DASHBOARD, ...(res.data ?? {}) };
}

export async function fetchHiTrackCollectors(
  organizationId: string,
  groupId?: string | null,
): Promise<HiTrackCollector[]> {
  const res = await complianceApiClient.get<ApiResponse<HiTrackCollector[]>>(
    `/companies/${organizationId}/hitrack/collectors`,
    undefined,
    groupHeader(groupId),
  );

  return res.data ?? [];
}

export async function queueHiTrackSyncNow(
  organizationId: string,
  collectorIds?: string[],
  groupId?: string | null,
) {
  const res = await complianceApiClient.post<
    ApiResponse<{ queued: number; collectorIds: string[] }>
  >(
    `/companies/${organizationId}/hitrack/sync`,
    { collector_ids: collectorIds ?? [] },
    groupHeader(groupId),
  );

  return res.data;
}

export async function fetchHiTrackDeviceDetail(
  organizationId: string,
  deviceId: string,
  groupId?: string | null,
): Promise<HiTrackDeviceDetail> {
  const res = await complianceApiClient.get<ApiResponse<HiTrackDeviceDetail>>(
    `/companies/${organizationId}/hitrack/devices/${deviceId}`,
    undefined,
    groupHeader(groupId),
  );

  return res.data;
}

export async function fetchHiTrackDeviceStatus(
  organizationId: string,
  groupId?: string | null,
): Promise<HiTrackDeviceStatus> {
  const res = await complianceApiClient.get<ApiResponse<HiTrackDeviceStatus>>(
    `/companies/${organizationId}/hitrack/status`,
    undefined,
    groupHeader(groupId),
  );

  return res.data;
}

export async function fetchHiTrackNetworkQualityHistory(
  organizationId: string,
  deviceId: string,
  range: HiTrackHistoryRange,
  groupId?: string | null,
): Promise<HiTrackNetworkQualityHistory> {
  const res = await complianceApiClient.get<ApiResponse<HiTrackNetworkQualityHistory>>(
    `/companies/${organizationId}/hitrack/devices/${deviceId}/network-quality/history`,
    { range },
    groupHeader(groupId),
  );

  return res.data;
}

export async function fetchHiTrackInterfaceHistory(
  organizationId: string,
  deviceId: string,
  interfaceId: string,
  range: HiTrackHistoryRange,
  groupId?: string | null,
): Promise<HiTrackInterfaceHistory> {
  const res = await complianceApiClient.get<ApiResponse<HiTrackInterfaceHistory>>(
    `/companies/${organizationId}/hitrack/devices/${deviceId}/interfaces/${interfaceId}/history`,
    { range },
    groupHeader(groupId),
  );

  return res.data;
}

export async function fetchHiTrackHealthHistory(
  organizationId: string,
  days: HiTrackHealthHistory["days"],
  groupId?: string | null,
): Promise<HiTrackHealthHistory> {
  const res = await complianceApiClient.get<ApiResponse<HiTrackHealthHistory>>(
    `/companies/${organizationId}/hitrack/health/history`,
    { days },
    groupHeader(groupId),
  );

  return res.data;
}

/** Gruppi personali e tag del cliente. */
export async function fetchHiTrackOrganize(
  organizationId: string,
  groupId?: string | null,
): Promise<HiTrackOrganize> {
  const res = await complianceApiClient.get<ApiResponse<HiTrackOrganize>>(
    `/companies/${organizationId}/hitrack/organize`,
    undefined,
    groupHeader(groupId),
  );

  return res.data ?? { groups: [], tags: [] };
}

export const hitrackOrganizeApi = {
  createGroup: (organizationId: string, name: string, groupId?: string | null) =>
    complianceApiClient.post<ApiResponse<HiTrackDeviceGroup>>(
      `/companies/${organizationId}/hitrack/groups`,
      { name },
      groupHeader(groupId),
    ),

  deleteGroup: (organizationId: string, deviceGroupId: string, groupId?: string | null) =>
    complianceApiClient.delete<void>(
      `/companies/${organizationId}/hitrack/groups/${deviceGroupId}`,
      groupHeader(groupId),
    ),

  updateGroupDevices: (
    organizationId: string,
    deviceGroupId: string,
    change: { add?: string[]; remove?: string[] },
    groupId?: string | null,
  ) =>
    complianceApiClient.put<ApiResponse<HiTrackDeviceGroup>>(
      `/companies/${organizationId}/hitrack/groups/${deviceGroupId}/devices`,
      change,
      groupHeader(groupId),
    ),

  addTag: (organizationId: string, deviceIds: string[], tag: string, groupId?: string | null) =>
    complianceApiClient.post<ApiResponse<unknown>>(
      `/companies/${organizationId}/hitrack/tags`,
      { deviceIds, tag },
      groupHeader(groupId),
    ),

  // Il delete del client non inoltra i parametri: vanno nell'indirizzo.
  removeTag: (organizationId: string, deviceId: string, tag: string, groupId?: string | null) =>
    complianceApiClient.delete<void>(
      `/companies/${organizationId}/hitrack/tags?${new URLSearchParams({ deviceId, tag })}`,
      groupHeader(groupId),
    ),
};
