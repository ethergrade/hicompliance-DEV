import { apiClient } from "@/lib/api-client";
import type {
  ApiResponse,
  UserPreferenceValue,
} from "@/types/api";

const groupHeader = (groupId: string) => ({
  headers: { "X-Group-Id": groupId },
});

export const preferencesApi = {
  /** Get all user preferences for the active group */
  async list(groupId?: string | null): Promise<UserPreferenceValue[]> {
    const opts = groupId ? groupHeader(groupId) : undefined;
    const res = await apiClient.get<ApiResponse<UserPreferenceValue[]>>('/preferences', undefined, opts);
    return res.data;
  },

  /** Get a user preference by key */
  async get(key: string, groupId?: string | null): Promise<UserPreferenceValue> {
    const opts = groupId ? groupHeader(groupId) : undefined;
    const res = await apiClient.get<ApiResponse<UserPreferenceValue>>(`/preferences/${key}`, undefined, opts);
    return res.data;
  },

  /** Set a user preference by key */
  async set(key: string, value: unknown, groupId?: string | null): Promise<UserPreferenceValue> {
    const opts = groupId ? groupHeader(groupId) : undefined;
    const res = await apiClient.put<ApiResponse<UserPreferenceValue>>(`/preferences/${key}`, { value }, opts);
    return res.data;
  },

  /** Delete a single preference by key */
  async delete(key: string, groupId?: string | null): Promise<void> {
    const opts = groupId ? groupHeader(groupId) : undefined;
    await apiClient.delete(`/preferences/${key}`, opts);
  },

  /** Delete all preferences for the active group */
  async deleteAll(groupId?: string | null): Promise<void> {
    const opts = groupId ? groupHeader(groupId) : undefined;
    await apiClient.delete('/preferences', opts);
  },
};
