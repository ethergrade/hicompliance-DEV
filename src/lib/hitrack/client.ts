import { complianceApiClient } from "@/lib/api-client";
import type { ApiResponse } from "@/types/api";
import {
  EMPTY_HITRACK_DASHBOARD,
  type HiTrackCollector,
  type HiTrackDashboardPayload,
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
