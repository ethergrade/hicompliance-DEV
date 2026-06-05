import { apiClient } from '@/lib/api-client';
import type { ApiResponse, RoleModulePermission } from '@/types/api';

const groupHeader = (groupId: string) => ({
  headers: { 'X-Group-Id': groupId },
});

export const roleModulePermissionsApi = {
  async list(role?: string, groupId?: string | null): Promise<RoleModulePermission[]> {
    const res = await apiClient.get<ApiResponse<RoleModulePermission[]>>(
      '/role-module-permissions',
      role ? { role } : undefined,
      groupId ? groupHeader(groupId) : undefined,
    );
    return res.data;
  },

  async update(id: string, is_enabled: boolean, groupId?: string | null): Promise<RoleModulePermission> {
    const res = await apiClient.put<ApiResponse<RoleModulePermission>>(
      `/role-module-permissions/${id}`,
      { is_enabled },
      groupId ? groupHeader(groupId) : undefined,
    );
    return res.data;
  },
};
