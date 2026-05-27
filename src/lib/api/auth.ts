import { apiClient, fetchCsrfCookie, setToken, clearToken } from "@/lib/api-client";
import type {
  ApiResponse,
  LoginRequest,
  LoginData,
  LoginUser,
  ChangePasswordRequest,
  Group,
} from "@/types/api";

export const authApi = {
  async login(credentials: LoginRequest): Promise<LoginData> {
    await fetchCsrfCookie();
    const res = await apiClient.post<ApiResponse<LoginData>>("/auth/login", credentials);
    setToken(res.data.token);
    return res.data;
  },

  async logout(): Promise<void> {
    await apiClient.post<ApiResponse<null>>("/auth/logout");
    clearToken();
  },

  async me(): Promise<LoginUser> {
    const res = await apiClient.get<ApiResponse<LoginUser>>("/auth/me");
    return res.data;
  },

  async changePassword(payload: ChangePasswordRequest): Promise<void> {
    await apiClient.patch<ApiResponse<null>>("/auth/password", payload);
  },

  /** Get auth groups for the current user */
  async groups(): Promise<Group[]> {
    const res = await apiClient.get<ApiResponse<Group[]>>("/auth/groups");
    return res.data;
  },
};
