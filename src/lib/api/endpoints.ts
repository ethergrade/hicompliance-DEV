import { complianceApiClient } from "@/lib/api-client";
import type { ApiResponse } from "@/types/api";

// ─── Types ─────────────────────────────────────────────────────────────────
// Forma di GET /companies/{id}/sophos/endpoints/dashboard (backend Laravel,
// EndpointDashboard). Le regole di protezione e conformità sono documentate lì.

export interface EndpointStats {
  totalEndpoints: number;
  protectedEndpoints: number;
  atRiskEndpoints: number;
  outdatedEndpoints?: number;
  unknownEndpoints?: number;
  onlineEndpoints: number;
  offlineEndpoints: number;
  servers?: number;
  computers?: number;
  pendingUpdates: number;
  openThreats?: number;
}

export type EndpointProtection = "Protected" | "At Risk" | "Unknown" | "Outdated";

export interface EndpointDevice {
  id: string;
  name: string;
  /** Sophos distingue solo computer e server: portatile e fisso non si inventano. */
  type: "Computer" | "Server" | "Workstation" | "Laptop" | "Mobile";
  os: string | null;
  status: "Online" | "Offline";
  lastSeen: string | null;
  protection: EndpointProtection;
  health?: string;
  tamperProtection?: boolean | null;
  isolated?: boolean;
  threats: number;
  compliance: number;
}

export interface EndpointThreat {
  id: string;
  endpoint: string | null;
  threatName: string;
  type: string;
  severity: "Low" | "Medium" | "High" | "Critical";
  detectedAt: string | null;
  status: "Quarantined" | "Removed" | "Blocked" | "Patched" | "Pending";
}

export interface PendingUpdate {
  endpoint: string | null;
  currentVersion: string | null;
  latestVersion: string | null;
  component: string;
  /** Null quando la sorgente non dice da quando il componente è indietro. */
  daysOutdated: number | null;
  priority: "Low" | "Medium" | "High" | "Critical";
  reason?: string;
}

export interface EndpointDashboardData {
  stats: EndpointStats;
  endpoints: EndpointDevice[];
  detectedThreats: EndpointThreat[];
  pendingUpdates: PendingUpdate[];
  fetchedAt?: string | null;
  stale?: boolean;
  lastError?: { code: string; message: string; at: string | null } | null;
}

// ─── API Client ─────────────────────────────────────────────────────────────

export const endpointsApi = {
  /** Ultimo dato letto per il cliente; nessuna chiamata diretta alla sorgente. */
  dashboard: async (organizationId: string, groupId?: string | null): Promise<EndpointDashboardData> => {
    const res = await complianceApiClient.get<ApiResponse<EndpointDashboardData>>(
      `/companies/${organizationId}/sophos/endpoints/dashboard`,
      undefined,
      groupId ? { headers: { "X-Group-Id": groupId } } : undefined,
    );
    return res.data;
  },
};
