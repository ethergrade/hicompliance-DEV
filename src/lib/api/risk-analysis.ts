import { supabase } from "@/integrations/supabase/client";
const sb = supabase as any;
const T = "risk_analysis";
import type { RiskAnalysisItem, StoreRiskAnalysisRequest, UpdateRiskAnalysisRequest } from "@/types/api";
export const riskAnalysisApi = {
  async list(companyId: string, _g?: string | null): Promise<RiskAnalysisItem[]> {
    const { data, error } = await sb.from(T).select("*").eq("organization_id", companyId).order("created_at");
    if (error) throw error; return data ?? [];
  },
  async get(companyId: string, id: string, _g?: string | null): Promise<RiskAnalysisItem> {
    const { data, error } = await sb.from(T).select("*").eq("id", id).eq("organization_id", companyId).single();
    if (error) throw error; return data;
  },
  async create(companyId: string, payload: StoreRiskAnalysisRequest, _g?: string | null): Promise<RiskAnalysisItem> {
    const created_by = (await supabase.auth.getUser()).data.user?.id;
    const { data, error } = await sb.from(T).insert({ threat_source: "umana_esterna", ...payload, organization_id: companyId, created_by }).select("*").single();
    if (error) throw error; return data;
  },
  async update(companyId: string, id: string, payload: UpdateRiskAnalysisRequest, _g?: string | null): Promise<RiskAnalysisItem> {
    const { data, error } = await sb.from(T).update(payload).eq("id", id).eq("organization_id", companyId).select("*").single();
    if (error) throw error; return data;
  },
  async delete(companyId: string, id: string, _g?: string | null): Promise<void> {
    const { error } = await sb.from(T).delete().eq("id", id).eq("organization_id", companyId);
    if (error) throw error;
  },
};
