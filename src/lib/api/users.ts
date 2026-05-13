import { apiClient } from "@/lib/api-client";
import type {
  ApiResponse,
  UserResource,
  StoreUserRequest,
  UpdateUserRequest,
} from "@/types/api";

export const usersApi = {
  async list(): Promise<UserResource[]> {
    const res = await apiClient.get<ApiResponse<UserResource[]>>("/users");
    return res.data;
  },

  async get(id: string | number): Promise<UserResource> {
    const res = await apiClient.get<ApiResponse<UserResource>>(`/users/${id}`);
    return res.data;
  },

  async create(payload: StoreUserRequest): Promise<UserResource> {
    const res = await apiClient.post<ApiResponse<UserResource>>("/users", payload);
    return res.data;
  },

  async update(id: string | number, payload: UpdateUserRequest): Promise<UserResource> {
    const res = await apiClient.put<ApiResponse<UserResource>>(`/users/${id}`, payload);
    return res.data;
  },

  async delete(id: string | number): Promise<void> {
    await apiClient.delete(`/users/${id}`);
  },
};
