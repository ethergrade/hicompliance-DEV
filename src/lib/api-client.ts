import type { ApiErrorResponse } from "@/types/api";

const configuredBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";
const API_BASE_URL = import.meta.env.DEV ? "/api" : configuredBaseUrl || "https://hiapi.websoupcloud.it";
const CSRF_URL = import.meta.env.DEV
  ? "/sanctum/csrf-cookie"
  : `${API_BASE_URL}/sanctum/csrf-cookie`;

const TOKEN_KEY = import.meta.env.VITE_AUTH_TOKEN_KEY as string;

// ─── Token management ───────────────────────────────────────────────────────

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

function handleUnauthorized(): void {
  clearToken();

  if (typeof window === "undefined") return;
  if (window.location.pathname === "/auth") return;

  // Dispatch custom event so AuthProvider can handle logout gracefully
  // via React state instead of a hard page redirect
  window.dispatchEvent(new CustomEvent('auth:unauthorized'));
}

// ─── CSRF ───────────────────────────────────────────────────────────────────

export async function fetchCsrfCookie(): Promise<void> {
  try {
    await fetch(CSRF_URL, {
      method: "GET",
    });
  } catch (e) {
    console.warn("Failed to fetch CSRF cookie, proceeding without it.", e);
  }
}

// ─── API Error ──────────────────────────────────────────────────────────────

export class ApiError extends Error {
  status: number;
  errors: Record<string, string[]> | null;

  constructor(status: number, body: ApiErrorResponse) {
    super(body.message);
    this.name = "ApiError";
    this.status = status;
    this.errors = body.errors ?? null;
  }
}

// ─── Core fetch wrapper ─────────────────────────────────────────────────────

type RequestOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean | undefined>;
};

async function request<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = "GET", body, headers = {}, params } = options;

  let url = `${API_BASE_URL}${path}`;

  if (params) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        searchParams.set(key, String(value));
      }
    }
    const qs = searchParams.toString();
    if (qs) url += `?${qs}`;
  }

  const token = getToken();
  const reqHeaders: Record<string, string> = {
    Accept: "application/json",
    ...headers,
  };
  if (token) {
    reqHeaders.Authorization = `Bearer ${token}`;
  }
  if (body !== undefined) {
    reqHeaders["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    method,
    headers: reqHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  const json = contentType.includes("application/json")
    ? await response.json()
    : { success: false, message: await response.text() };

  if (!response.ok) {
    if (response.status === 401) {
      handleUnauthorized();
    }
    throw new ApiError(response.status, json as ApiErrorResponse);
  }

  return json as T;
}

// ─── HTTP method helpers ────────────────────────────────────────────────────

export const apiClient = {
  get<T>(path: string, params?: RequestOptions["params"]): Promise<T> {
    return request<T>(path, { method: "GET", params });
  },

  post<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, { method: "POST", body });
  },

  put<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, { method: "PUT", body });
  },

  patch<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, { method: "PATCH", body });
  },

  delete<T>(path: string): Promise<T> {
    return request<T>(path, { method: "DELETE" });
  },
};
