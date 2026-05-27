import { apiClient } from "@/lib/api-client";
import type {
  ApiResponse,
  UserPreferenceValue,
} from "@/types/api";

export const preferencesApi = {
  /** Get a user preference by key */
  async get(key: string): Promise<UserPreferenceValue> {
    const res = await apiClient.get<ApiResponse<UserPreferenceValue>>(`/preferences/${key}`);
    return res.data;
  },

  /** Set a user preference by key */
  async set(key: string, value: unknown): Promise<UserPreferenceValue> {
    const res = await apiClient.put<ApiResponse<UserPreferenceValue>>(`/preferences/${key}`, { value });
    return res.data;
  },
};
