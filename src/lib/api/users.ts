import { apiClient } from "@/lib/api-client";
import type {
  ApiResponse,
  UserResource,
  StoreUserRequest,
  UpdateUserRequest,
} from "@/types/api";

const groupHeader = (groupId: string) => ({
  headers: { "X-Group-Id": groupId },
});

/**
 * Users API — all endpoints require X-Group-Id header.
 * Users are scoped to a group, not a tenant.
 */
export const usersApi = {
  async list(groupId?: string | null): Promise<UserResource[]> {
    const opts = groupId ? groupHeader(groupId) : undefined;
    const res = await apiClient.get<ApiResponse<UserResource[]>>("/users", undefined, opts);
    return res.data;
  },

  async get(id: string | number, groupId?: string | null): Promise<UserResource> {
    const opts = groupId ? groupHeader(groupId) : undefined;
    const res = await apiClient.get<ApiResponse<UserResource>>(`/users/${id}`, undefined, opts);
    return res.data;
  },

  async create(payload: StoreUserRequest, groupId?: string | null): Promise<UserResource> {
    const opts = groupId ? groupHeader(groupId) : undefined;
    const res = await apiClient.post<ApiResponse<UserResource>>("/users", payload, opts);
    return res.data;
  },

  async update(id: string | number, payload: UpdateUserRequest, groupId?: string | null): Promise<UserResource> {
    const opts = groupId ? groupHeader(groupId) : undefined;
    const res = await apiClient.put<ApiResponse<UserResource>>(`/users/${id}`, payload, opts);
    return res.data;
  },

  async delete(id: string | number, groupId?: string | null): Promise<void> {
    const opts = groupId ? groupHeader(groupId) : undefined;
    await apiClient.delete(`/users/${id}`, opts);
  },
};
