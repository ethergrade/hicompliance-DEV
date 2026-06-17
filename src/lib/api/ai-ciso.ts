import { apiClient } from "@/lib/api-client";

export interface AiCisoConversation {
  id: string;
  user_id: string;
  title: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  created_at: string;
  updated_at: string;
}

export interface StoreAiCisoConversationRequest {
  title?: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface UpdateAiCisoConversationRequest {
  title?: string;
  messages?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export const aiCisoApi = {
  /** List all AI CISO conversations for the current user */
  async list(): Promise<AiCisoConversation[]> {
    const res = await apiClient.get<AiCisoConversation[]>('/ai-ciso-conversations');
    return res.data;
  },

  /** Get a single conversation by ID */
  async get(conversationId: string): Promise<AiCisoConversation> {
    const res = await apiClient.get<AiCisoConversation>(`/ai-ciso-conversations/${conversationId}`);
    return res.data;
  },

  /** Create a new conversation */
  async create(payload: StoreAiCisoConversationRequest): Promise<AiCisoConversation> {
    const res = await apiClient.post<AiCisoConversation>('/ai-ciso-conversations', payload);
    return res.data;
  },

  /** Update an existing conversation */
  async update(conversationId: string, payload: UpdateAiCisoConversationRequest): Promise<AiCisoConversation> {
    const res = await apiClient.put<AiCisoConversation>(`/ai-ciso-conversations/${conversationId}`, payload);
    return res.data;
  },

  /** Delete a conversation */
  async delete(conversationId: string): Promise<void> {
    await apiClient.delete(`/ai-ciso-conversations/${conversationId}`);
  },
};
