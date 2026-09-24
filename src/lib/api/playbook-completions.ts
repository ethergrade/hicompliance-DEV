import { supabase } from "@/integrations/supabase/client";
const sb = supabase as any;
const T = "playbook_completions";
import type { PlaybookCompletion, StorePlaybookCompletionRequest, UpdatePlaybookCompletionRequest } from "@/types/api";
export const playbookCompletionsApi = {
  async list(companyId: string, _g?: string | null): Promise<PlaybookCompletion[]> {
    const { data, error } = await sb.from(T).select("*").eq("organization_id", companyId).order("updated_at", { ascending: false });
    if (error) throw error; return data ?? [];
  },
  async get(companyId: string, id: string, _g?: string | null): Promise<PlaybookCompletion> {
    const { data, error } = await sb.from(T).select("*").eq("id", id).eq("organization_id", companyId).single();
    if (error) throw error; return data;
  },
  async create(companyId: string, payload: StorePlaybookCompletionRequest, _g?: string | null): Promise<PlaybookCompletion> {
    const user_id = (await supabase.auth.getUser()).data.user?.id;
    const { data, error } = await sb.from(T).insert({ playbook_title: "", playbook_category: "", playbook_severity: "", ...payload, organization_id: companyId, user_id }).select("*").single();
    if (error) throw error; return data;
  },
  async update(companyId: string, id: string, payload: UpdatePlaybookCompletionRequest, _g?: string | null): Promise<PlaybookCompletion> {
    const { data, error } = await sb.from(T).update(payload).eq("id", id).eq("organization_id", companyId).select("*").single();
    if (error) throw error; return data;
  },
  async delete(companyId: string, id: string, _g?: string | null): Promise<void> {
    const { error } = await sb.from(T).delete().eq("id", id).eq("organization_id", companyId);
    if (error) throw error;
  },
};
