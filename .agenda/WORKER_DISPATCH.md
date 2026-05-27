# Worker Dispatch: API Wiring Task

**Target model:** deepseek-v4-flash (suggested by user)
**Skills needed:** frontend-ui-engineering, api-and-interface-design, incremental-implementation, secure-senior-engineering

Follow the instructions in /tmp/api-wiring-task.md exactly.

## Critical Patterns (read these files first)

### src/lib/api/tenants.ts (canonical pattern):
```typescript
import { apiClient } from "@/lib/api-client";
import type { ApiResponse, SomeType } from "@/types/api";

export const someApi = {
  async list(): Promise<SomeType[]> {
    const res = await apiClient.get<ApiResponse<SomeType[]>>("/endpoint");
    return res.data;
  },
  async get(id: string): Promise<SomeType> {
    const res = await apiClient.get<ApiResponse<SomeType>>(`/endpoint/${id}`);
    return res.data;
  },
  // etc
};
```

### Company UUID (needed for company-scoped endpoints):
- Comes from `useClientContext().selectedOrganization.id`
- Or from the `fetchOrganizations` response
- The user has it stored in localStorage under 'hicompliance_selected_org'
- For pages that currently use supabase, they get the company UUID from `user.tenant_id` or from the organization context

## File to modify:
1. Create: src/lib/api/assessment-v2.ts (NEW)
2. Create: src/lib/api/asset-inventory.ts (NEW - PRODOTTO version, not the current one)
3. Create: src/lib/api/remediation-tasks.ts (NEW)
4. Create: src/lib/api/risk-analysis.ts (NEW)
5. Create: src/lib/api/playbook-completions.ts (NEW)
6. Create: src/lib/api/dark-risk-alerts.ts (NEW)
7. Modify: src/types/api.ts (add new types + api_methods to TenantServiceResource)
8. Modify: src/lib/api/index.ts (add exports)
9. Modify: src/pages/AssetInventory.tsx (replace supabase)
10. Modify: src/pages/IncidentResponse.tsx (replace supabase)
11. Modify: src/pages/Assessment.tsx (swap mock data for API)
12. Modify: src/pages/Remediation.tsx (verify/update)
If found with supabase imports and matching API:
13. Modify: src/components/irp/RiskAnalysisManager.tsx
14. Modify: src/pages/ThreatManagement.tsx

## DO NOT TOUCH
- src/lib/api/tenants.ts
- src/contexts/ClientContext.tsx
- src/hooks/useClientOrganization.ts
- src/hooks/useDarkRiskAlerts.ts
- src/components/auth/AuthProvider.tsx
- Any file not importing supabase or not needing API updates

## Commit
After ALL changes, commit with: feat: wire PRODOTTO pages to v2 API layer [TASK_UUID]
Create task, context, reasoning first.

Output final result to /tmp/api-wiring-result.md
