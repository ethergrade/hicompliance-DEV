import { supabase } from "@/integrations/supabase/client";

const configuredBaseUrl = String(
	import.meta.env.VITE_COMPLIANCE_API_BASE_URL || import.meta.env.VITE_API_BASE_URL || "",
).replace(/\/$/, "");
const API_BASE_URL = import.meta.env.DEV ? "/api" : configuredBaseUrl || "https://hiconsole.hisolution.it/api";

export class DarkRiskApiError extends Error {
	constructor(public readonly status: number, message: string) {
		super(message);
		this.name = "DarkRiskApiError";
	}
}

export const darkRiskHttp = async <T>(
	path: string,
	options: { method?: "GET" | "POST" | "PUT"; body?: unknown; params?: Record<string, string | number> } = {},
): Promise<T> => {
	const { data } = await supabase.auth.getSession();
	const token = data.session?.access_token;
	const url = new URL(`${API_BASE_URL}${path}`, window.location.origin);
	for (const [key, value] of Object.entries(options.params ?? {})) url.searchParams.set(key, String(value));
	const response = await fetch(url.toString(), {
		method: options.method ?? "GET",
		headers: {
			Accept: "application/json",
			...(token ? { Authorization: `Bearer ${token}` } : {}),
			...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
		},
		body: options.body === undefined ? undefined : JSON.stringify(options.body),
		cache: "no-store",
	});
	const payload = response.status === 204 ? null : await response.json().catch(() => null);
	if (!response.ok) {
		const message = payload && typeof payload === "object" && "message" in payload
			? String((payload as { message?: unknown }).message)
			: `Richiesta DarkRisk360 non riuscita (${response.status})`;
		throw new DarkRiskApiError(response.status, message);
	}
	if (payload && typeof payload === "object" && "data" in payload) {
		return (payload as { data: T }).data;
	}
	return payload as T;
};
