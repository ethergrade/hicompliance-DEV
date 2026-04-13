import type { ApiErrorResponse } from "@/types/api";

const API_BASE_URL = "https://hiapi.websoupcloud.it/api";
const CSRF_URL = "https://hiapi.websoupcloud.it/sanctum/csrf-cookie";

const TOKEN_KEY = "hiconsole_auth_token";

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

// ─── CSRF ───────────────────────────────────────────────────────────────────

export async function fetchCsrfCookie(): Promise<void> {
  await fetch(CSRF_URL, {
    method: "GET",
    credentials: "include",
  });
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
    credentials: "include",
  });

  // 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  const json = await response.json();

  if (!response.ok) {
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
