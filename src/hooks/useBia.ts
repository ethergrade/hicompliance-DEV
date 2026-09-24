import { useQuery } from '@tanstack/react-query';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import { biaApi, biaQueryKeys, biaSourcesApi } from '@/lib/api/bia';
import type { BiaAssessment, BusinessService } from '@/types/bia';

export interface ServiceRow {
  service: BusinessService;
  current: BiaAssessment | null;   // bozza/revisione se esiste, altrimenti ultima approvata
  approved: BiaAssessment | null;
  versions: BiaAssessment[];
}

export function useBiaServices() {
  const { organizationId } = useClientOrganization();
  const orgId = organizationId ?? '';
  const q = useQuery({
    queryKey: biaQueryKeys.services(orgId),
    enabled: !!orgId,
    queryFn: async (): Promise<ServiceRow[]> => {
      const [services, assessments] = await Promise.all([biaApi.listServices(orgId), biaApi.listAssessments(orgId)]);
      return services.map((service) => {
        const versions = assessments.filter((a) => a.business_service_id === service.id).sort((a, b) => b.version - a.version);
        const open = versions.find((v) => v.status === 'draft' || v.status === 'in_review') ?? null;
        const approved = versions.find((v) => v.status === 'approved') ?? null;
        return { service, versions, approved, current: open ?? approved };
      });
    },
  });
  return { ...q, orgId };
}

export function useBiaDashboard() {
  const { organizationId } = useClientOrganization();
  const orgId = organizationId ?? '';
  return useQuery({ queryKey: biaQueryKeys.dashboard(orgId), enabled: !!orgId, queryFn: () => biaApi.dashboard(orgId) });
}

export function useBiaSources() {
  const { organizationId } = useClientOrganization();
  const orgId = organizationId ?? '';
  return useQuery({ queryKey: biaQueryKeys.sources(orgId), enabled: !!orgId, queryFn: () => biaSourcesApi.load(orgId), staleTime: 60_000 });
}

export function contactName(contacts: Record<string, any>[] | undefined, id: string | null | undefined) {
  if (!id) return null;
  const c = contacts?.find((x) => x.id === id);
  return c ? `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || c.email : null;
}
