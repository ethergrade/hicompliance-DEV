import { apiClient } from "./index";
import type { ApiResponse } from "@/types/api";
import { tenantServicesApi } from "./tenant-services";

// ─── Types (from backend CSV structure) ───────────────────────────────────

export interface HipatchAsset {
  name: string;
  type: string;
  os: string;
  version: string;
  ip: string;
  [key: string]: string;
}

export interface HipatchPending {
  system_name: string;
  patch: string;
  description: string;
  kb_number: string;
  severity: 'Low' | 'Medium' | 'Important' | 'Critical';
  [key: string]: string;
}

export interface HipatchPerformed {
  system_name: string;
  patch: string;
  description: string;
  kb_number: string;
  severity: string;
  status: 'Installed' | 'Failed' | 'Pending';
  [key: string]: string;
}

export interface HipatchRemediation {
  id: string;
  system_name: string;
  issue: string;
  severity: string;
  status: string;
  [key: string]: string;
}

export interface HipatchDashboardData {
  assets: HipatchAsset[];
  pending: HipatchPending[];
  performed: HipatchPerformed[];
  remediations: HipatchRemediation[];
}

// ─── API Client ─────────────────────────────────────────────────────────────

/**
 * Get HiPatch tenant service ID for an organization
 */
async function getHipatchServiceId(
  organizationId: string,
  groupId?: string | null
): Promise<string | null> {
  try {
    const services = await tenantServicesApi.listByOrganization(organizationId, groupId);
    const hipatch = services.find(
      (s) => s.service_type?.toLowerCase() === "hipatch" || s.service_type?.toLowerCase().includes("patch")
    );
    return hipatch?.id || null;
  } catch {
    return null;
  }
}

export const hipatchApi = {
  /** Get HiPatch dashboard data (assets, patches, remediations) */
  async dashboard(
    organizationId: string,
    groupId?: string | null
  ): Promise<HipatchDashboardData> {
    const tenantServiceId = await getHipatchServiceId(organizationId, groupId);
    
    if (!tenantServiceId) {
      return {
        assets: [],
        pending: [],
        performed: [],
        remediations: [],
      };
    }

    const opts = groupId ? { headers: { "X-Group-Id": groupId } } : undefined;
    const tenantService = tenantServiceId;

    const [assetsRes, pendingRes, performedRes, remediationsRes] = await Promise.all([
      apiClient.get<ApiResponse<HipatchAsset[]>>(
        `/tenant-services/${tenantService}/hipatch/assets`,
        undefined,
        opts
      ).catch(() => ({ data: [] as HipatchAsset[] })),
      apiClient.get<ApiResponse<HipatchPending[]>>(
        `/tenant-services/${tenantService}/hipatch/patches/pending`,
        undefined,
        opts
      ).catch(() => ({ data: [] as HipatchPending[] })),
      apiClient.get<ApiResponse<HipatchPerformed[]>>(
        `/tenant-services/${tenantService}/hipatch/patches/performed`,
        undefined,
        opts
      ).catch(() => ({ data: [] as HipatchPerformed[] })),
      apiClient.get<ApiResponse<HipatchRemediation[]>>(
        `/tenant-services/${tenantService}/hipatch/remediations`,
        undefined,
        opts
      ).catch(() => ({ data: [] as HipatchRemediation[] })),
    ]);

    return {
      assets: assetsRes.data || [],
      pending: pendingRes.data || [],
      performed: performedRes.data || [],
      remediations: remediationsRes.data || [],
    };
  },

  /** Get pending patches only */
  async pendingPatches(
    organizationId: string,
    groupId?: string | null
  ): Promise<HipatchPending[]> {
    const tenantServiceId = await getHipatchServiceId(organizationId, groupId);
    if (!tenantServiceId) return [];

    const opts = groupId ? { headers: { "X-Group-Id": groupId } } : undefined;
    const res = await apiClient.get<ApiResponse<HipatchPending[]>>(
      `/tenant-services/${tenantServiceId}/hipatch/patches/pending`,
      undefined,
      opts
    );
    return res.data || [];
  },

  /** Get performed patches only */
  async performedPatches(
    organizationId: string,
    groupId?: string | null
  ): Promise<HipatchPerformed[]> {
    const tenantServiceId = await getHipatchServiceId(organizationId, groupId);
    if (!tenantServiceId) return [];

    const opts = groupId ? { headers: { "X-Group-Id": groupId } } : undefined;
    const res = await apiClient.get<ApiResponse<HipatchPerformed[]>>(
      `/tenant-services/${tenantServiceId}/hipatch/patches/performed`,
      undefined,
      opts
    );
    return res.data || [];
  },
};

export { getHipatchServiceId };
