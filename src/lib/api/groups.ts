import { apiClient } from "@/lib/api-client";
import type { ApiResponse, Group } from "@/types/api";

/**
 * Groups API (Tenants/Gruppi).
 *
 * Backend endpoints:
 *   GET    /groups        → List all groups
 *   POST   /groups        → Create a new group
 *   PATCH  /groups/{id}   → Update a group (PUT returns 405, use PATCH)
 *   DELETE /groups/{id}   → Delete a group
 */
export const groupsApi = {
  /** List all groups */
  async list(): Promise<Group[]> {
    const res = await apiClient.get<ApiResponse<Group[]>>("/groups");
    return res.data;
  },

  /** Create a new group */
  async create(name: string, description?: string): Promise<Group> {
    const res = await apiClient.post<ApiResponse<Group>>("/groups", {
      name,
      ...(description ? { description } : {}),
    });
    return res.data;
  },

  /** Update a group (PATCH — PUT is 405 on this endpoint) */
  async update(id: string, data: { name?: string; description?: string; is_active?: boolean }): Promise<Group> {
    const res = await apiClient.patch<ApiResponse<Group>>(`/groups/${id}`, data);
    return res.data;
  },

  /** Delete a group by ID */
  async delete(id: string): Promise<void> {
    await apiClient.delete(`/groups/${id}`);
  },
};
