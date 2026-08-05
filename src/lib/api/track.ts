import { fetchHiTrackDashboard } from "@/lib/hitrack/client";

export const trackApi = {
  dashboard: (tenantId?: string, groupId?: string | null) => {
    if (!tenantId) {
      throw new Error("tenant_id is required for HiTrack dashboard");
    }
    return fetchHiTrackDashboard(tenantId, groupId);
  },
};
