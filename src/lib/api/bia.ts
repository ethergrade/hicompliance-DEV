import { supabase } from '@/integrations/supabase/client';
import type {
  BiaAssessment, BiaAssetLink, BiaAuditEvent, BiaDashboard, BiaDependency, BiaImpactValue, BiaRemediationLink,
  BiaResult, BiaRiskLink, BusinessService,
} from '@/types/bia';

// Le tabelle BIA sono nuove: il client tipizzato viene usato in forma generica.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export class BiaConflictError extends Error {
  constructor() { super('Il record è stato modificato da un altro utente. Ricarica per vedere la versione aggiornata.'); }
}

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export const biaQueryKeys = {
  all: ['bia'] as const,
  services: (orgId: string) => ['bia', 'services', orgId] as const,
  service: (orgId: string, id: string) => ['bia', 'service', orgId, id] as const,
  dashboard: (orgId: string) => ['bia', 'dashboard', orgId] as const,
  sources: (orgId: string) => ['bia', 'source-status', orgId] as const,
};

export const biaApi = {
  async listServices(orgId: string): Promise<BusinessService[]> {
    return check(await db.from('business_services').select('*').eq('organization_id', orgId).order('code'));
  },
  async listAssessments(orgId: string): Promise<BiaAssessment[]> {
    return check(await db.from('bia_assessments').select('*').eq('organization_id', orgId).order('version', { ascending: false }));
  },
  async createService(orgId: string, input: Partial<BusinessService>): Promise<BusinessService> {
    const svc = check<BusinessService>(await db.from('business_services').insert({ ...input, organization_id: orgId, code: '' }).select('*').single());
    await biaApi.audit(orgId, 'business_service', svc.id, 'create', null, svc);
    return svc;
  },
  async updateService(id: string, patch: Partial<BusinessService>): Promise<BusinessService> {
    return check(await db.from('business_services').update(patch).eq('id', id).select('*').single());
  },
  async archiveService(orgId: string, id: string) {
    await biaApi.updateService(id, { status: 'archived' });
    await biaApi.audit(orgId, 'business_service', id, 'archive', null, null);
  },
  async createDraft(orgId: string, serviceId: string): Promise<BiaAssessment> {
    const existing = check<BiaAssessment[]>(await db.from('bia_assessments').select('*').eq('business_service_id', serviceId).in('status', ['draft', 'in_review']));
    if (existing.length) return existing[0];
    const bia = check<BiaAssessment>(await db.from('bia_assessments').insert({ organization_id: orgId, business_service_id: serviceId, version: 1 }).select('*').single());
    // orizzonti predefiniti 4/8/24/72 ore, vuoti finché l'utente non li compila
    await biaApi.audit(orgId, 'bia_assessment', bia.id, 'create', null, null);
    return bia;
  },
  /** Salvataggio bozza con concorrenza ottimistica su updated_at. */
  async updateDraft(bia: BiaAssessment, patch: Partial<BiaAssessment>): Promise<BiaAssessment> {
    const res = await db.from('bia_assessments').update(patch).eq('id', bia.id).eq('updated_at', bia.updated_at).select('*');
    const rows = check<BiaAssessment[]>(res);
    if (!rows.length) throw new BiaConflictError();
    return rows[0];
  },
  async impacts(biaId: string): Promise<BiaImpactValue[]> {
    return check(await db.from('bia_impact_values').select('*').eq('bia_assessment_id', biaId).order('horizon_minutes'));
  },
  async upsertImpact(biaId: string, v: BiaImpactValue): Promise<BiaImpactValue> {
    const { id: _id, calculated_total: _c, effective_total: _e, ...rest } = v;
    return check(await db.from('bia_impact_values').upsert({ ...rest, bia_assessment_id: biaId }, { onConflict: 'bia_assessment_id,horizon_minutes' }).select('*').single());
  },
  async deleteImpact(id: string) { check(await db.from('bia_impact_values').delete().eq('id', id)); },
  async compute(biaId: string): Promise<BiaResult> {
    return check(await db.rpc('bia_compute', { _bia_id: biaId }));
  },
  async submit(biaId: string): Promise<{ ok: boolean; errors?: string[] }> {
    return check(await db.rpc('bia_submit', { _bia_id: biaId }));
  },
  async approve(biaId: string, months = 12) { return check(await db.rpc('bia_approve', { _bia_id: biaId, _review_months: months })); },
  async requestChanges(biaId: string, comment: string) { return check(await db.rpc('bia_request_changes', { _bia_id: biaId, _comment: comment })); },
  async cloneRevision(biaId: string, reason: string): Promise<string> { return check(await db.rpc('bia_clone_revision', { _bia_id: biaId, _reason: reason })); },
  async dashboard(orgId: string): Promise<BiaDashboard> { return check(await db.rpc('bia_dashboard', { _org: orgId })); },
  async dependencies(orgId: string): Promise<BiaDependency[]> {
    return check(await db.from('bia_service_dependencies').select('*').eq('organization_id', orgId));
  },
  async addDependency(orgId: string, d: Partial<BiaDependency>) {
    check(await db.from('bia_service_dependencies').insert({ ...d, organization_id: orgId }));
    await biaApi.audit(orgId, 'business_service', d.service_id!, 'link_source', null, d);
  },
  async removeDependency(orgId: string, d: BiaDependency) {
    check(await db.from('bia_service_dependencies').delete().eq('id', d.id));
    await biaApi.audit(orgId, 'business_service', d.service_id, 'unlink_source', d, null);
  },
  async assetLinks(serviceId: string): Promise<BiaAssetLink[]> {
    return check(await db.from('bia_technical_asset_links').select('*').eq('business_service_id', serviceId));
  },
  async addAssetLink(orgId: string, l: Partial<BiaAssetLink>) {
    check(await db.from('bia_technical_asset_links').insert({ ...l, organization_id: orgId }));
    await biaApi.audit(orgId, 'business_service', l.business_service_id!, 'link_source', null, l);
  },
  async removeAssetLink(orgId: string, l: BiaAssetLink) {
    check(await db.from('bia_technical_asset_links').delete().eq('id', l.id));
    await biaApi.audit(orgId, 'business_service', l.business_service_id, 'unlink_source', l, null);
  },
  async riskLinks(serviceId: string): Promise<BiaRiskLink[]> {
    return check(await db.from('bia_risk_links').select('*').eq('business_service_id', serviceId));
  },
  async addRiskLink(orgId: string, l: Partial<BiaRiskLink>) {
    check(await db.from('bia_risk_links').insert({ ...l, organization_id: orgId }));
    await biaApi.audit(orgId, 'business_service', l.business_service_id!, 'link_source', null, l);
  },
  async removeRiskLink(orgId: string, l: BiaRiskLink) {
    check(await db.from('bia_risk_links').delete().eq('id', l.id));
    await biaApi.audit(orgId, 'business_service', l.business_service_id, 'unlink_source', l, null);
  },
  async remediationLinks(serviceId: string): Promise<BiaRemediationLink[]> {
    return check(await db.from('bia_remediation_links').select('*').eq('business_service_id', serviceId));
  },
  async addRemediationLink(orgId: string, l: Partial<BiaRemediationLink>) {
    check(await db.from('bia_remediation_links').insert({ ...l, organization_id: orgId }));
    await biaApi.audit(orgId, 'business_service', l.business_service_id!, 'link_source', null, l);
  },
  async updateRemediationLink(id: string, patch: Partial<BiaRemediationLink>) {
    check(await db.from('bia_remediation_links').update(patch).eq('id', id));
  },
  async removeRemediationLink(orgId: string, l: BiaRemediationLink) {
    check(await db.from('bia_remediation_links').delete().eq('id', l.id));
    await biaApi.audit(orgId, 'business_service', l.business_service_id, 'unlink_source', l, null);
  },
  /** Crea un task in Remediation con provenienza BIA e lo collega. */
  async createRemediationFromBia(orgId: string, serviceId: string, biaId: string | null, task: string, budget: number | null) {
    const t = check<{ id: string }>(await db.from('remediation_tasks').insert({
      organization_id: orgId, task, category: 'Business Continuity', progress: 0, priority: 'Alta',
      budget, source: 'bia', source_ref: `bia_service:${serviceId}`,
      start_date: new Date().toISOString().slice(0, 10), end_date: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10),
    }).select('id').single());
    await biaApi.addRemediationLink(orgId, { business_service_id: serviceId, bia_assessment_id: biaId, remediation_task_id: t.id });
  },
  async auditEvents(orgId: string, entityIds: string[]): Promise<BiaAuditEvent[]> {
    if (!entityIds.length) return [];
    return check(await db.from('bia_audit_events').select('*').eq('organization_id', orgId).in('entity_id', entityIds).order('created_at', { ascending: false }).limit(100));
  },
  async audit(orgId: string, entityType: string, entityId: string, event: string, before: unknown, after: unknown, reason?: string) {
    const { data } = await supabase.auth.getUser();
    await db.from('bia_audit_events').insert({
      organization_id: orgId, entity_type: entityType, entity_id: entityId, event_type: event,
      before_json: before ?? null, after_json: after ?? null, reason: reason ?? null, model_version: 'BIA_SCORE_V1', actor_id: data.user?.id,
    });
  },
};

/** Fonti esistenti riusate dalla BIA (sola lettura, stesso tenant via RLS). */
export const biaSourcesApi = {
  async load(orgId: string) {
    const settle = async <T,>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>) => {
      try { const r = await p; return r.error ? { ok: false as const, error: r.error.message, data: [] as unknown as T } : { ok: true as const, data: (r.data ?? []) as T }; }
      catch (e) { return { ok: false as const, error: (e as Error).message, data: [] as unknown as T }; }
    };
    const [infra, risks, irp, tasks, contacts, profile, responses] = await Promise.all([
      settle<Record<string, any>[]>(db.from('critical_infrastructure').select('*').eq('organization_id', orgId)),
      settle<Record<string, any>[]>(db.from('risk_analysis').select('id,asset_name,risk_score,updated_at').eq('organization_id', orgId)),
      settle<Record<string, any>[]>(db.from('asset_irp').select('id,area,categoria,tecnologia,rischio_residuo,updated_at').eq('organization_id', orgId)),
      settle<Record<string, any>[]>(db.from('remediation_tasks').select('id,task,priority,budget,progress,assignee,source,source_ref,end_date,is_deleted').eq('organization_id', orgId)),
      settle<Record<string, any>[]>(db.from('contact_directory').select('id,first_name,last_name,job_title,email').eq('organization_id', orgId).order('last_name')),
      settle<Record<string, any>[]>(db.from('organization_profiles').select('legal_name,business_sector,nis2_classification').eq('organization_id', orgId).limit(1)),
      settle<Record<string, any>[]>(db.from('assessment_responses').select('status,updated_at,assessment_questions(order_index,question_text)').eq('organization_id', orgId)),
    ]);
    return { infra, risks, irp, tasks, contacts, profile, responses };
  },
};
