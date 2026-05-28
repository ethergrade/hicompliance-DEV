import type { ApiErrorResponse } from "@/types/api";

const configuredBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";
const API_BASE_URL = import.meta.env.DEV ? "/api" : configuredBaseUrl || "https://hiapi.websoupcloud.it";
const CSRF_URL = import.meta.env.DEV
  ? "/sanctum/csrf-cookie"
  : `${API_BASE_URL}/sanctum/csrf-cookie`;

const TOKEN_KEY = import.meta.env.VITE_AUTH_TOKEN_KEY as string;
const TOKEN_EXPIRY_KEY = `${TOKEN_KEY}_expiry`;

/** Session window: 24 ore */
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

// ─── Token management ───────────────────────────────────────────────────────

function getTokenExpiry(): number | null {
  const raw = localStorage.getItem(TOKEN_EXPIRY_KEY);
  if (!raw) return null;
  const ts = Number(raw);
  return Number.isFinite(ts) ? ts : null;
}

function setTokenExpiry(): void {
  localStorage.setItem(TOKEN_EXPIRY_KEY, String(Date.now() + TOKEN_TTL_MS));
}

function isTokenExpired(): boolean {
  const expiry = getTokenExpiry();
  return expiry !== null && Date.now() >= expiry;
}

export function getToken(): string | null {
  if (isTokenExpired()) {
    handleTokenExpired();
    return null;
  }
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  setTokenExpiry();
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXPIRY_KEY);
}

/** Extend session on successful API calls (keeps token alive for active users) */
function refreshTokenExpiry(): void {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) setTokenExpiry();
}

/** Handle expired token — clear and redirect before any API request is made */
function handleTokenExpired(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXPIRY_KEY);

  if (typeof window === "undefined") return;
  if (window.location.pathname === "/auth") return;

  window.dispatchEvent(new CustomEvent('auth:unauthorized'));
  window.location.href = '/auth';
}

function handleUnauthorized(): void {
  clearToken();

  if (typeof window === "undefined") return;
  if (window.location.pathname === "/auth") return;

  // Dispatch custom event so AuthProvider can handle logout gracefully
  // via React state instead of a hard page redirect
  window.dispatchEvent(new CustomEvent('auth:unauthorized'));
}

/** Check token expiry before making a request. Returns true if expired (redirected). */
function guardTokenExpiry(): boolean {
  if (isTokenExpired()) {
    handleTokenExpired();
    return true;
  }
  return false;
}

/** Force logout from external code (e.g. AuthProvider on me() failure) */
export { handleUnauthorized };

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

  // Pre-flight: if token expired, redirect now (avoid 401) — skip for /auth paths
  if (!path.startsWith("/auth/login")) {
    guardTokenExpiry();
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
    // Note: 401 on API data endpoints does NOT auto-logout.
    // Only authApi.me() and authApi.login() call handleUnauthorized() explicitly.
    // This prevents a single expired API call from destroying the entire session.
    throw new ApiError(response.status, json as ApiErrorResponse);
  }

  // Extend session on successful API calls (active user keeps token alive)
  refreshTokenExpiry();

  return json as T;
}

// ─── HTTP method helpers ────────────────────────────────────────────────────

type ApiClientOptions = {
  headers?: Record<string, string>;
  params?: RequestOptions["params"];
};

export const apiClient = {
  get<T>(path: string, params?: RequestOptions["params"], opts?: ApiClientOptions): Promise<T> {
    return request<T>(path, { method: "GET", params, headers: opts?.headers });
  },

  post<T>(path: string, body?: unknown, opts?: ApiClientOptions): Promise<T> {
    return request<T>(path, { method: "POST", body, headers: opts?.headers });
  },

  put<T>(path: string, body?: unknown, opts?: ApiClientOptions): Promise<T> {
    return request<T>(path, { method: "PUT", body, headers: opts?.headers });
  },

  patch<T>(path: string, body?: unknown, opts?: ApiClientOptions): Promise<T> {
    return request<T>(path, { method: "PATCH", body, headers: opts?.headers });
  },

  delete<T>(path: string, opts?: ApiClientOptions): Promise<T> {
    return request<T>(path, { method: "DELETE", headers: opts?.headers });
  },
};
