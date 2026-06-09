import { ApiResponse, type FeedsResponse } from "@/types/api";
import { apiClient } from "@/lib/api-client";

function feedsHeaders(groupId: string | null) {
  const headers: Record<string, string> = {};
  if (groupId) headers["X-Group-Id"] = groupId;
  return headers;
}

export const feedsApi = {
  /** Fetch cyber security news/feeds from the backend */
  list(groupId?: string | null): Promise<FeedsResponse> {
    return apiClient.get<ApiResponse<FeedsResponse>>(
      "/feeds",
      undefined,
      { headers: feedsHeaders(groupId ?? null) }
    ).then(res => res.data as FeedsResponse);
  },
};
