import { ApiResponse } from "@/types/api";
import { apiClient } from "@/lib/api-client";

/** Shape of a single feed item returned by /feeds */
export interface FeedItem {
	title: string;
	description: string;
	url: string;
	date: string;
	type: "nis2" | "threat" | "cve";
	severity?: "critica" | "alta" | "media" | "bassa";
	cveId?: string;
	epssScore?: number;
	epssPercentile?: number;
}

/** Response payload returned by GET /feeds (matches ACN feed structure) */
export interface FeedsResponse {
	nis2: FeedItem[];
	threat: FeedItem[];
	cve: FeedItem[];
	epss: FeedItem[];
}

function feedsHeaders(groupId: string | null) {
	const headers: Record<string, string> = {};
	if (groupId) headers["X-Group-Id"] = groupId;
	return headers;
}

export const feedsApi = {
	/**
	 * Fetch cyber security news/feeds from the backend.
	 */
	list(groupId?: string | null): Promise<FeedsResponse> {
		return apiClient
			.get<ApiResponse<FeedsResponse>>("/feeds", undefined, {
				headers: feedsHeaders(groupId ?? null),
			})
			.then((res) => {
				const wrapped = res.data as ApiResponse<FeedsResponse> | FeedsResponse;
				if (
					wrapped &&
					typeof wrapped === "object" &&
					"data" in wrapped &&
					wrapped.data
				) {
					return wrapped.data;
				}
				return wrapped as FeedsResponse;
			});
	},
};
