import { apiClient } from "@/lib/api-client";
import type {
  ApiResponse,
  UserPreferenceValue,
} from "@/types/api";

const groupHeader = (groupId: string) => ({
  headers: { "X-Group-Id": groupId },
});

export const preferencesApi = {
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
};
