import { apiClient, fetchCsrfCookie, setToken, clearToken } from "@/lib/api-client";
import type {
  ApiResponse,
  LoginRequest,
  LoginData,
  LoginUser,
  MfaVerifyRequest,
  MfaVerifyData,
  MfaSetupData,
  MfaEnableData,
  MfaRecoveryCodesData,
  ChangePasswordRequest,
  Group,
} from "@/types/api";

export const authApi = {
  async login(credentials: LoginRequest): Promise<LoginData> {
    await fetchCsrfCookie();
    const res = await apiClient.post<ApiResponse<LoginData>>("/auth/login", credentials);
    // Save token only when MFA is not pending verification
    if (res.data.token) {
      setToken(res.data.token);
    }
    return res.data;
  },

  async mfaVerify(payload: MfaVerifyRequest): Promise<MfaVerifyData> {
    const res = await apiClient.post<ApiResponse<MfaVerifyData>>("/auth/mfa/verify", payload);
    setToken(res.data.token);
    return res.data;
  },

  async mfaSetup(): Promise<MfaSetupData> {
    const res = await apiClient.get<ApiResponse<MfaSetupData>>("/auth/mfa/setup");
    return res.data;
  },

  async mfaEnable(code: string): Promise<MfaEnableData> {
    const res = await apiClient.post<ApiResponse<MfaEnableData>>("/auth/mfa/enable", { code });
    return res.data;
  },

  async mfaRecoveryCodes(): Promise<MfaRecoveryCodesData> {
    const res = await apiClient.get<ApiResponse<MfaRecoveryCodesData>>("/auth/mfa/recovery-codes");
    return res.data;
  },

  async mfaRegenerateRecoveryCodes(code: string): Promise<MfaRecoveryCodesData> {
    const res = await apiClient.post<ApiResponse<MfaRecoveryCodesData>>("/auth/mfa/recovery-codes/regenerate", { code });
    return res.data;
  },

  async mfaDisable(payload: { password?: string; code?: string }): Promise<void> {
    await apiClient.post<ApiResponse<null>>("/auth/mfa/disable", payload);
  },

  async logout(): Promise<void> {
    await apiClient.post<ApiResponse<null>>("/auth/logout");
    clearToken();
  },

  async me(groupId?: string): Promise<LoginUser> {
    const res = await apiClient.get<ApiResponse<LoginUser>>(
      "/auth/me",
      undefined,
      groupId ? { headers: { 'X-Group-Id': groupId } } : undefined,
    );
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
